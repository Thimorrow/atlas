// Noten: Lesequeries, Schreibpfade und die Validierung der API-Bodies.
//
// Gerechnet wird hier nichts -- Umrechnung und Schnitt stehen in lib/grades.ts
// und bleiben dort ohne Datenbank testbar. Diese Datei holt nur die Zeilen und
// reicht sie durch.

import { asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { grades, subjects, type Grade, type NewGrade } from "@/lib/db/schema";
import {
  GRADE_KINDS,
  isValidPoints,
  overallAverage,
  pointsToGradeLabel,
  subjectAverage,
  type GradeAverage,
  type GradeKind,
} from "@/lib/grades";
import { isObj, nonEmptyStr, type Parsed } from "@/lib/subject-store";

// --- DTOs --------------------------------------------------------------------

export type GradeDTO = {
  id: string;
  subjectId: string;
  kind: GradeKind;
  points: number; // 0-15
  grade: string; // zugehoerige Note, etwa "2+"
  label: string; // Bezeichnung, etwa "Klausur 1"
  date: string; // YYYY-MM-DD
  weight: number;
  createdAt: string;
  updatedAt: string;
};

export type GradeSummaryDTO = {
  average: GradeAverage | null;
  oral: GradeAverage | null;
  written: GradeAverage | null;
  count: number;
  oralWeight: number; // Anteil muendlich in Prozent
};

export type GradeOverviewEntryDTO = {
  id: string;
  name: string;
  color: string | null;
  summary: GradeSummaryDTO;
};

// Eine Note in der "Zuletzt"-Liste der Uebersicht: dieselben Felder wie
// GradeDTO, plus Fach, weil die Liste faecheruebergreifend ist.
export type RecentGradeDTO = GradeDTO & {
  subjectName: string;
  subjectColor: string | null;
};

export type GradeOverviewDTO = {
  overall: GradeAverage | null;
  subjects: GradeOverviewEntryDTO[];
  recentGrades: RecentGradeDTO[];
};

function toGradeDTO(row: Grade): GradeDTO {
  return {
    id: row.id,
    subjectId: row.subjectId,
    kind: row.kind,
    points: row.points,
    grade: pointsToGradeLabel(row.points),
    label: row.label,
    date: row.date,
    weight: row.weight,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function summarize(rows: GradeDTO[], oralWeight: number): GradeSummaryDTO {
  const avg = subjectAverage(rows, oralWeight);
  return { ...avg, oralWeight };
}

// --- Lesen -------------------------------------------------------------------

// Neueste zuerst: die zuletzt geschriebene Arbeit ist die, nach der gesucht wird.
export async function listGrades(subjectId: string): Promise<GradeDTO[]> {
  const rows = await db
    .select()
    .from(grades)
    .where(eq(grades.subjectId, subjectId))
    .orderBy(desc(grades.date), desc(grades.createdAt));
  return rows.map(toGradeDTO);
}

export async function getGrade(id: string): Promise<GradeDTO | undefined> {
  const [row] = await db.select().from(grades).where(eq(grades.id, id));
  return row ? toGradeDTO(row) : undefined;
}

// Uebersicht ueber alle aktiven Faecher. Bewusst zwei flache Queries statt
// eines Joins mit Gruppierung: die Gewichtung muendlich/schriftlich in SQL
// nachzubauen waere eine zweite, stillschweigend abweichende Implementierung
// derselben Rechnung. Bei einem Schueler ist die Datenmenge ohnehin winzig.
export async function gradeOverview(): Promise<GradeOverviewDTO> {
  const [subjectRows, gradeRows] = await Promise.all([
    db
      .select({
        id: subjects.id,
        name: subjects.name,
        color: subjects.color,
        oralWeight: subjects.oralWeight,
      })
      .from(subjects)
      .where(isNull(subjects.archivedAt))
      .orderBy(asc(subjects.name)),
    db.select().from(grades),
  ]);

  const bySubject = new Map<string, GradeDTO[]>();
  for (const row of gradeRows) {
    const list = bySubject.get(row.subjectId);
    if (list) list.push(toGradeDTO(row));
    else bySubject.set(row.subjectId, [toGradeDTO(row)]);
  }

  const entries: GradeOverviewEntryDTO[] = subjectRows.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    summary: summarize(bySubject.get(s.id) ?? [], s.oralWeight),
  }));

  // Die letzten Noten faecheruebergreifend, neueste zuerst -- nur aus aktiven
  // Faechern, sonst taucht eine archivierte Klausur unangekuendigt wieder auf.
  const subjectById = new Map(subjectRows.map((s) => [s.id, s]));
  const recentGrades: RecentGradeDTO[] = gradeRows
    .filter((g) => subjectById.has(g.subjectId))
    .map((g) => {
      const s = subjectById.get(g.subjectId)!;
      return { ...toGradeDTO(g), subjectName: s.name, subjectColor: s.color };
    })
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
    .slice(0, 8);

  return {
    overall: overallAverage(entries.map((e) => e.summary.average)),
    subjects: entries,
    recentGrades,
  };
}

// --- Schreiben ---------------------------------------------------------------

export async function createGrade(data: NewGrade): Promise<GradeDTO> {
  const [row] = await db.insert(grades).values(data).returning();
  return toGradeDTO(row);
}

export async function updateGrade(
  id: string,
  patch: Partial<NewGrade>,
): Promise<GradeDTO | undefined> {
  const [row] = await db
    .update(grades)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(grades.id, id))
    .returning();
  return row ? toGradeDTO(row) : undefined;
}

export async function deleteGrade(id: string): Promise<boolean> {
  const rows = await db.delete(grades).where(eq(grades.id, id)).returning({ id: grades.id });
  return rows.length > 0;
}

// Existiert das Fach ueberhaupt? Ohne die Pruefung liefe ein Insert in eine
// Fremdschluessel-Verletzung und damit in eine 500 statt in eine 404.
export async function subjectExists(id: string): Promise<boolean> {
  const [row] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, id));
  return Boolean(row);
}

// --- Validierung -------------------------------------------------------------

function parsePoints(v: unknown): Parsed<number> {
  // Zahlen kommen aus einem <input type="number"> auch als String an.
  const n = typeof v === "string" ? Number(v.trim()) : v;
  if (!isValidPoints(n))
    return { ok: false, error: "Punkte müssen eine ganze Zahl von 0 bis 15 sein." };
  return { ok: true, value: n };
}

function parseKind(v: unknown): Parsed<GradeKind> {
  if (typeof v !== "string" || !(GRADE_KINDS as readonly string[]).includes(v))
    return { ok: false, error: "Art muss „oral“ oder „written“ sein." };
  return { ok: true, value: v as GradeKind };
}

// Gewichtung 0 ist erlaubt und bedeutet "zaehlt nicht mit" -- nur negative
// Werte und Unsinn fliegen raus.
function parseWeight(v: unknown): Parsed<number> {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 10)
    return { ok: false, error: "Gewichtung muss eine Zahl von 0 bis 10 sein." };
  return { ok: true, value: n };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(v: unknown): Parsed<string> {
  if (typeof v !== "string" || !DATE_RE.test(v))
    return { ok: false, error: "Datum muss im Format JJJJ-MM-TT stehen." };
  return { ok: true, value: v };
}

export function parseNewGrade(body: unknown, subjectId: string): Parsed<NewGrade> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };

  const points = parsePoints(body.points);
  if (!points.ok) return points;

  if (!nonEmptyStr(body.label)) return { ok: false, error: "Bezeichnung darf nicht leer sein." };

  const kind = parseKind(body.kind ?? "written");
  if (!kind.ok) return kind;

  const date = parseDate(body.date);
  if (!date.ok) return date;

  const value: NewGrade = {
    subjectId,
    points: points.value,
    label: body.label.trim(),
    kind: kind.value,
    date: date.value,
  };

  if (body.weight !== undefined && body.weight !== null) {
    const w = parseWeight(body.weight);
    if (!w.ok) return w;
    value.weight = w.value;
  }

  return { ok: true, value };
}

export function parseGradePatch(body: unknown): Parsed<Partial<NewGrade>> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  const patch: Partial<NewGrade> = {};

  if (body.points !== undefined) {
    const p = parsePoints(body.points);
    if (!p.ok) return p;
    patch.points = p.value;
  }
  if (body.label !== undefined) {
    if (!nonEmptyStr(body.label)) return { ok: false, error: "Bezeichnung darf nicht leer sein." };
    patch.label = body.label.trim();
  }
  if (body.kind !== undefined) {
    const k = parseKind(body.kind);
    if (!k.ok) return k;
    patch.kind = k.value;
  }
  if (body.date !== undefined) {
    const d = parseDate(body.date);
    if (!d.ok) return d;
    patch.date = d.value;
  }
  if (body.weight !== undefined) {
    const w = parseWeight(body.weight);
    if (!w.ok) return w;
    patch.weight = w.value;
  }

  return { ok: true, value: patch };
}
