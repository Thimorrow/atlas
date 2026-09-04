// Faecher, Fach-Notizen und die daran haengenden Lesequeries.
//
// subjects ist die einzige Stelle, an der ein Untis-Fach zu einem "echten"
// Fach der App wird: ensureSubjectForUntis legt es still an, sobald eine
// Aufgabe darauf zeigt. Abgewaehlte Faecher werden archiviert, nie geloescht,
// sonst legt der naechste Sync sie wieder an.

import { and, asc, eq, gte, inArray, isNull, isNotNull, sql, getTableColumns } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  schoolBlocks,
  subjectNotes,
  subjects,
  type NewSubject,
  type NewSubjectNote,
  type Subject,
  type SubjectNote,
  type TeacherTitle,
} from "@/lib/db/schema";
import { lehrplanFuer, type LehrplanFach } from "@/lib/lehrplan/nrw-g9-klasse-10";
import { lehrplanAlsMarkdown } from "@/lib/lehrplan/rendern";
import { SUBJECT_COLORS, defaultColorFor } from "@/lib/subject-colors";
import { TEACHER_TITLES, teacherLabel } from "@/lib/teacher";
import { ORAL_WEIGHT_PRESETS } from "@/lib/grades";

// --- DTOs --------------------------------------------------------------------

export type SubjectDTO = {
  id: string;
  name: string;
  untisSubject: string | null;
  teacher: string | null; // Nachname, so wie Untis ihn liefert
  teacherTitle: TeacherTitle;
  teacherLabel: string | null; // "Herr Schulze", fertig fuer die Anzeige
  room: string | null;
  color: string | null; // Token aus SUBJECT_COLORS
  onenoteSectionId: string | null;
  onenoteSectionName: string | null; // "Notizbuch / Abschnitt", nur zur Anzeige
  oralWeight: number; // Anteil muendlich am Fachschnitt, in Prozent
  curriculum: string | null; // Lehrplan als Markdown
  curriculumSource: string | null; // woher der Text stammt, z. B. "Von Hand"
  curriculumUpdatedAt: string | null; // ISO
  archivedAt: string | null; // ISO
  openAssignments: number;
  noteCount: number;
};

export type NoteDTO = {
  id: string;
  subjectId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type LessonDTO = {
  id: string;
  date: string;
  startTime: string; // HH:MM
  endTime: string | null; // HH:MM
  room: string | null;
  teacher: string | null;
  status: "regular" | "cancelled" | "substituted";
  substitutionText: string | null;
};

export type SubjectScope = "active" | "archived" | "all";

// --- Lesen -------------------------------------------------------------------

// Zaehler als korrelierte Subqueries statt einer Runde pro Fach (kein N+1).
// Bewusst ausgeschriebene Spaltennamen: eingesetzte Drizzle-Spalten rendern in
// dieser Position ohne Tabellen-Praefix, "id" wuerde dann im Subselect auf die
// falsche Tabelle zeigen.
const openAssignmentsSql = sql<number>`(
  select count(*) from assignments
  where assignments.subject_id = subjects.id and assignments.completed_at is null
)`.mapWith(Number);

const noteCountSql = sql<number>`(
  select count(*) from subject_notes where subject_notes.subject_id = subjects.id
)`.mapWith(Number);

type SubjectRow = Subject & { openAssignments: number; noteCount: number };

function toSubjectDTO(row: SubjectRow): SubjectDTO {
  return {
    id: row.id,
    name: row.name,
    untisSubject: row.untisSubject,
    teacher: row.teacher,
    teacherTitle: row.teacherTitle,
    teacherLabel: teacherLabel(row.teacherTitle, row.teacher),
    room: row.room,
    color: row.color,
    onenoteSectionId: row.onenoteSectionId,
    onenoteSectionName: row.onenoteSectionName,
    oralWeight: row.oralWeight,
    curriculum: row.curriculum,
    curriculumSource: row.curriculumSource,
    curriculumUpdatedAt: row.curriculumUpdatedAt ? row.curriculumUpdatedAt.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    openAssignments: row.openAssignments,
    noteCount: row.noteCount,
  };
}

export async function listSubjects(scope: SubjectScope = "active"): Promise<SubjectDTO[]> {
  const base = db
    .select({
      ...getTableColumns(subjects),
      openAssignments: openAssignmentsSql,
      noteCount: noteCountSql,
    })
    .from(subjects);

  const rows =
    scope === "all"
      ? await base.orderBy(asc(subjects.name))
      : await base
          .where(
            scope === "archived" ? isNotNull(subjects.archivedAt) : isNull(subjects.archivedAt),
          )
          .orderBy(asc(subjects.name));

  return rows.map(toSubjectDTO);
}

export async function getSubject(id: string): Promise<SubjectDTO | undefined> {
  const [row] = await db
    .select({
      ...getTableColumns(subjects),
      openAssignments: openAssignmentsSql,
      noteCount: noteCountSql,
    })
    .from(subjects)
    .where(eq(subjects.id, id));
  return row ? toSubjectDTO(row) : undefined;
}

const hm = (t: string | null): string | null => (t ? t.slice(0, 5) : null);

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Die naechsten Termine des Fachs aus dem Stundenplan. Ohne untisSubject wird
// der Fachname als Untis-Wert probiert -- manuelle Faecher heissen meist gleich.
export async function upcomingLessons(
  subject: Pick<Subject, "name" | "untisSubject">,
  limit = 5,
): Promise<LessonDTO[]> {
  const key = subject.untisSubject ?? subject.name;
  const rows = await db
    .select()
    .from(schoolBlocks)
    .where(and(eq(schoolBlocks.subject, key), gte(schoolBlocks.date, todayISO())))
    .orderBy(asc(schoolBlocks.date), asc(schoolBlocks.startTime))
    .limit(limit);

  return rows.map((b) => ({
    id: b.id,
    date: b.date,
    startTime: hm(b.startTime)!,
    endTime: hm(b.endTime),
    room: b.room,
    teacher: b.teacher,
    status: b.status,
    substitutionText: b.substitutionText,
  }));
}

// Alle Untis-Faecher, die im Stundenplan vorkommen -- Vorlage fuer das Setup.
// subject ist NOT NULL, die Liste ist also genau dann leer, wenn es ueberhaupt
// keine Stunden gibt.
export async function candidateSubjects(): Promise<{
  candidates: string[];
  hasBlocks: boolean;
}> {
  const rows = await db
    .selectDistinct({ subject: schoolBlocks.subject })
    .from(schoolBlocks)
    .orderBy(asc(schoolBlocks.subject));
  const candidates = rows.map((r) => r.subject);
  return { candidates, hasBlocks: candidates.length > 0 };
}

// --- Schreiben ---------------------------------------------------------------

export async function createSubject(data: NewSubject): Promise<Subject> {
  const [row] = await db.insert(subjects).values(data).returning();
  return row;
}

export async function updateSubject(
  id: string,
  patch: Partial<NewSubject>,
): Promise<Subject | undefined> {
  const [row] = await db
    .update(subjects)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(subjects.id, id))
    .returning();
  return row;
}

export async function deleteSubject(id: string): Promise<boolean> {
  const rows = await db
    .delete(subjects)
    .where(eq(subjects.id, id))
    .returning({ id: subjects.id });
  return rows.length > 0;
}

// Fach zu einem Untis-Wert holen und, falls es keins gibt, still anlegen.
// Ein archiviertes Fach wird zurueckgegeben, aber NICHT reaktiviert: wer es
// abgewaehlt hat, will es nicht durch eine Aufgabe zurueckbekommen.
export async function ensureSubjectForUntis(untisSubject: string): Promise<Subject> {
  const key = untisSubject.trim();
  const [existing] = await db.select().from(subjects).where(eq(subjects.untisSubject, key));
  if (existing) return existing;

  const [created] = await db
    .insert(subjects)
    .values({ name: key, untisSubject: key, color: defaultColorFor(key) })
    .onConflictDoNothing({ target: subjects.untisSubject })
    .returning();
  if (created) return created;

  // Parallel angelegt -- die Zeile des anderen Laufs gewinnt.
  const [raced] = await db.select().from(subjects).where(eq(subjects.untisSubject, key));
  return raced;
}

// Reine Mengenlogik fuer setupSubjects, ohne DB -- daher gut isoliert testbar.
// Faecher mit untisSubject === null sind manuell angelegt (z. B. eine AG) und
// werden nie angefasst, egal was in selected steht.
export type ExistingSubjectForSetup = {
  id: string;
  untisSubject: string | null;
  archivedAt: Date | null;
};

export type SubjectSetupPlan = {
  toCreate: { name: string; archivedAt: Date | null }[];
  toReactivate: string[]; // ids
  toArchive: string[]; // ids
};

export function planSubjectSetup(
  existing: ExistingSubjectForSetup[],
  selected: string[],
  all: string[],
): SubjectSetupPlan {
  const selectedSet = new Set(selected);
  const names = new Set([...all, ...selected]);
  const existingByUntisSubject = new Map(
    existing.filter((s) => s.untisSubject !== null).map((s) => [s.untisSubject as string, s]),
  );

  const toCreate: { name: string; archivedAt: Date | null }[] = [];
  for (const name of names) {
    if (!existingByUntisSubject.has(name)) {
      toCreate.push({ name, archivedAt: selectedSet.has(name) ? null : new Date() });
    }
  }

  const toReactivate: string[] = [];
  const toArchive: string[] = [];
  for (const row of existingByUntisSubject.values()) {
    if (selectedSet.has(row.untisSubject as string)) {
      if (row.archivedAt !== null) toReactivate.push(row.id);
    } else {
      if (row.archivedAt === null) toArchive.push(row.id);
    }
  }

  return { toCreate, toReactivate, toArchive };
}

// Setup: ausgewaehlte Faecher aktiv, der Rest archiviert. Idempotent ueber
// untis_subject: derselbe Aufruf zweimal aendert beim zweiten Mal nichts mehr.
// Ein Aufruf mit anderer Auswahl aendert sehr wohl etwas -- genau dafuer ist er
// da, die Route ist keine reine Erstbefuellung.
// Faecher mit untisSubject === null (manuell angelegt) bleiben unangetastet.
export async function setupSubjects(selected: string[], all: string[]): Promise<SubjectDTO[]> {
  const existing = await db
    .select({
      id: subjects.id,
      untisSubject: subjects.untisSubject,
      archivedAt: subjects.archivedAt,
    })
    .from(subjects);

  const plan = planSubjectSetup(existing, selected, all);

  if (plan.toCreate.length > 0) {
    await db
      .insert(subjects)
      .values(
        plan.toCreate.map(({ name, archivedAt }) => ({
          name,
          untisSubject: name,
          color: defaultColorFor(name),
          archivedAt,
        })),
      )
      .onConflictDoNothing({ target: subjects.untisSubject });
  }

  // inArray statt einer Schleife: db laeuft ueber neon-http, jedes await ist
  // eine eigene HTTP-Runde. Bei zwoelf Faechern waren das bis zu zwoelf.
  if (plan.toReactivate.length > 0) {
    await db
      .update(subjects)
      .set({ archivedAt: null, updatedAt: sql`now()` })
      .where(inArray(subjects.id, plan.toReactivate));
  }

  if (plan.toArchive.length > 0) {
    await db
      .update(subjects)
      .set({ archivedAt: sql`now()`, updatedAt: sql`now()` })
      .where(inArray(subjects.id, plan.toArchive));
  }

  return listSubjects("all");
}

// --- Notizen -----------------------------------------------------------------

function toNoteDTO(row: SubjectNote): NoteDTO {
  return {
    id: row.id,
    subjectId: row.subjectId,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listNotes(subjectId: string): Promise<NoteDTO[]> {
  const rows = await db
    .select()
    .from(subjectNotes)
    .where(eq(subjectNotes.subjectId, subjectId))
    .orderBy(sql`${subjectNotes.updatedAt} desc`);
  return rows.map(toNoteDTO);
}

export async function getNote(id: string): Promise<NoteDTO | undefined> {
  const [row] = await db.select().from(subjectNotes).where(eq(subjectNotes.id, id));
  return row ? toNoteDTO(row) : undefined;
}

export async function createNote(data: NewSubjectNote): Promise<NoteDTO> {
  const [row] = await db.insert(subjectNotes).values(data).returning();
  return toNoteDTO(row);
}

export async function updateNote(
  id: string,
  patch: Partial<NewSubjectNote>,
): Promise<NoteDTO | undefined> {
  const [row] = await db
    .update(subjectNotes)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(subjectNotes.id, id))
    .returning();
  return row ? toNoteDTO(row) : undefined;
}

export async function deleteNote(id: string): Promise<boolean> {
  const rows = await db
    .delete(subjectNotes)
    .where(eq(subjectNotes.id, id))
    .returning({ id: subjectNotes.id });
  return rows.length > 0;
}

// --- Lehrplan ----------------------------------------------------------------
//
// Der Lehrplan ist eine Textspalte am Fach: vorbelegt aus der statischen
// Vorlage (lib/lehrplan), danach von Hand aenderbar. Der Seed ueberschreibt
// deshalb NIE einen vorhandenen Text -- dass eine Korrektur des Nutzers stehen
// bleibt, ist der ganze Grund fuer die Spalte.

// Quelle, die der Seed eintraegt. Steht sie an einem Fach, weiss die
// Oberflaeche, dass der Text noch aus der Vorlage stammt.
export const KERNLEHRPLAN_QUELLE = "Kernlehrplan NRW G9, Klasse 10";

// Was der Nutzer selbst geschrieben hat.
export const HAND_QUELLE = "Von Hand";

// Grosszuegig: ein Lehrplan ist deutlich laenger als eine Notiz, die Grenze
// schuetzt nur vor kaputten Requests.
export const MAX_CURRICULUM_LEN = 100000;

export type CurriculumDTO = {
  curriculum: string | null;
  curriculumSource: string | null;
  curriculumUpdatedAt: string | null;
};

function toCurriculumDTO(row: Subject): CurriculumDTO {
  return {
    curriculum: row.curriculum,
    curriculumSource: row.curriculumSource,
    curriculumUpdatedAt: row.curriculumUpdatedAt ? row.curriculumUpdatedAt.toISOString() : null,
  };
}

// Vorlage zu einem Fach: erst der Anzeigename, dann der Untis-Wert. Faecher aus
// dem Sync heissen oft nur "M" oder "BI" -- das Kuerzel kennt lehrplanFuer als
// Alias, den Anzeigenamen hat der Nutzer vielleicht laengst umbenannt.
export function vorlageFuerFach(subject: {
  name: string;
  untisSubject: string | null;
}): LehrplanFach | null {
  return lehrplanFuer(subject.name) ?? (subject.untisSubject ? lehrplanFuer(subject.untisSubject) : null);
}

// Ein nach trim() leerer Text loescht den Lehrplan komplett, statt eine leere
// Zeile stehen zu lassen -- gleiche Semantik wie bei den Stundennotizen.
export async function saveCurriculum(
  subjectId: string,
  body: string,
  source: string,
): Promise<CurriculumDTO | undefined> {
  const trimmed = body.trim();
  const [row] = await db
    .update(subjects)
    .set(
      trimmed
        ? {
            curriculum: trimmed,
            curriculumSource: source,
            curriculumUpdatedAt: new Date(),
            updatedAt: sql`now()`,
          }
        : {
            curriculum: null,
            curriculumSource: null,
            curriculumUpdatedAt: null,
            updatedAt: sql`now()`,
          },
    )
    .where(eq(subjects.id, subjectId))
    .returning();
  return row ? toCurriculumDTO(row) : undefined;
}

export async function deleteCurriculum(subjectId: string): Promise<void> {
  await saveCurriculum(subjectId, "", HAND_QUELLE);
}

export type SubjectForCurriculumSeed = { id: string; name: string; untisSubject: string | null };

export type CurriculumSeedPlan = {
  toWrite: { id: string; fach: string; vorlage: string; curriculum: string }[];
  ohneVorlage: string[]; // Fachnamen, zu denen die Vorlage nichts kennt
};

// Reine Zuordnungslogik, ohne DB -- daher isoliert testbar. Der Aufrufer
// uebergibt nur Faecher OHNE eigenen Lehrplan, hier wird nichts mehr gefiltert.
export function planCurriculumSeed(vorhandene: SubjectForCurriculumSeed[]): CurriculumSeedPlan {
  const toWrite: CurriculumSeedPlan["toWrite"] = [];
  const ohneVorlage: string[] = [];

  for (const subject of vorhandene) {
    const vorlage = vorlageFuerFach(subject);
    if (!vorlage) {
      ohneVorlage.push(subject.name);
      continue;
    }
    toWrite.push({
      id: subject.id,
      fach: subject.name,
      vorlage: vorlage.fach,
      curriculum: lehrplanAlsMarkdown(vorlage),
    });
  }

  return { toWrite, ohneVorlage };
}

export type CurriculumSeedResult = {
  belegt: { fach: string; vorlage: string }[];
  ohneVorlage: string[];
};

// Belegt alle Faecher vor, an denen noch gar kein Lehrplan steht. Zweimal
// hintereinander aufgerufen macht der zweite Lauf nichts mehr: das
// isNull-Filter sieht die eben geschriebenen Texte.
export async function seedCurricula(): Promise<CurriculumSeedResult> {
  const rows = await db
    .select({ id: subjects.id, name: subjects.name, untisSubject: subjects.untisSubject })
    .from(subjects)
    .where(isNull(subjects.curriculum));

  const plan = planCurriculumSeed(rows);

  // Jedes Fach bekommt einen anderen Text, das laesst sich nicht zu einem
  // inArray-Aufruf zusammenfassen. Nach dem ersten Lauf ist die Liste leer.
  for (const w of plan.toWrite) {
    await db
      .update(subjects)
      .set({
        curriculum: w.curriculum,
        curriculumSource: KERNLEHRPLAN_QUELLE,
        curriculumUpdatedAt: new Date(),
        updatedAt: sql`now()`,
      })
      .where(and(eq(subjects.id, w.id), isNull(subjects.curriculum)));
  }

  return {
    belegt: plan.toWrite.map((w) => ({ fach: w.fach, vorlage: w.vorlage })),
    ohneVorlage: plan.ohneVorlage,
  };
}

// --- Validierung -------------------------------------------------------------
// Nimmt unbekannten JSON-Body, gibt typisierte Daten oder eine deutsche
// Fehlermeldung fuer die 400-Antwort.

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const COLOR_TOKENS = SUBJECT_COLORS.map((c) => c.token as string);

export function isObj(b: unknown): b is Record<string, unknown> {
  return typeof b === "object" && b !== null && !Array.isArray(b);
}

export function nonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// Route-Params vorab pruefen: Postgres wirft bei kaputter UUID einen Fehler,
// eine unbekannte id soll aber 404 geben, nie 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

// Die Gewichtung muendlich/schriftlich nimmt nur die Presets an: alles andere
// waere eine Einstellung, die der Nutzer nie wieder findet.
export function parseOralWeight(v: unknown): Parsed<number> {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  if (typeof n !== "number" || !(ORAL_WEIGHT_PRESETS as readonly number[]).includes(n))
    return { ok: false, error: `Gewichtung muss ${ORAL_WEIGHT_PRESETS.join(" oder ")} sein.` };
  return { ok: true, value: n };
}

// null loescht die Farbe, alles andere muss ein Token aus SUBJECT_COLORS sein.
function parseColor(v: unknown): Parsed<string | null> {
  if (v === null) return { ok: true, value: null };
  if (typeof v !== "string" || !COLOR_TOKENS.includes(v))
    return { ok: false, error: "Farbe ist kein gültiger Farbwert." };
  return { ok: true, value: v };
}

// Optionales Textfeld: null oder leerer String raeumen es weg.
function optionalText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export function parseNewSubject(body: unknown): Parsed<NewSubject> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  if (!nonEmptyStr(body.name)) return { ok: false, error: "Name darf nicht leer sein." };

  const value: NewSubject = { name: body.name.trim() };

  if (body.teacher !== undefined) value.teacher = optionalText(body.teacher);
  if (body.room !== undefined) value.room = optionalText(body.room);
  if (body.untisSubject !== undefined) value.untisSubject = optionalText(body.untisSubject);

  if (body.color !== undefined) {
    const c = parseColor(body.color);
    if (!c.ok) return c;
    value.color = c.value;
  } else {
    value.color = defaultColorFor(value.name);
  }

  return { ok: true, value };
}

export function parseSubjectPatch(body: unknown): Parsed<Partial<NewSubject>> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  const patch: Partial<NewSubject> = {};

  if (body.name !== undefined) {
    if (!nonEmptyStr(body.name)) return { ok: false, error: "Name darf nicht leer sein." };
    patch.name = body.name.trim();
  }
  if (body.teacher !== undefined) patch.teacher = optionalText(body.teacher);
  if (body.room !== undefined) patch.room = optionalText(body.room);

  if (body.teacherTitle !== undefined) {
    const erlaubt = TEACHER_TITLES.map((t) => t.value as string);
    if (typeof body.teacherTitle !== "string" || !erlaubt.includes(body.teacherTitle))
      return { ok: false, error: "Anrede muss \"herr\" oder \"frau\" sein." };
    patch.teacherTitle = body.teacherTitle as TeacherTitle;
  }

  if (body.color !== undefined) {
    const c = parseColor(body.color);
    if (!c.ok) return c;
    patch.color = c.value;
  }

  // OneNote-Ziel: id und Anzeigename gehoeren zusammen, null loest die
  // Verknuepfung. Nur eines von beiden zu setzen ergaebe eine Zeile, die auf
  // einen Abschnitt zeigt, den die Oberflaeche nicht benennen kann.
  if (body.onenoteSectionId !== undefined) {
    if (body.onenoteSectionId === null) {
      patch.onenoteSectionId = null;
      patch.onenoteSectionName = null;
    } else if (nonEmptyStr(body.onenoteSectionId) && nonEmptyStr(body.onenoteSectionName)) {
      patch.onenoteSectionId = body.onenoteSectionId.trim();
      patch.onenoteSectionName = body.onenoteSectionName.trim();
    } else {
      return { ok: false, error: "Der OneNote-Abschnitt ist unvollständig." };
    }
  }

  // Gewichtung muendlich/schriftlich. Die erlaubten Werte stehen bei den Noten
  // (lib/grades.ts), damit Rechnung und Eingabe nicht auseinanderlaufen.
  if (body.oralWeight !== undefined) {
    const w = parseOralWeight(body.oralWeight);
    if (!w.ok) return w;
    patch.oralWeight = w.value;
  }

  // "now" archiviert, null reaktiviert -- der Client muss keine Uhrzeit kennen.
  if (body.archivedAt !== undefined) {
    if (body.archivedAt === null) {
      patch.archivedAt = null;
    } else if (body.archivedAt === "now") {
      patch.archivedAt = new Date();
    } else {
      return { ok: false, error: "archivedAt muss null oder \"now\" sein." };
    }
  }

  return { ok: true, value: patch };
}

export function parseNewNote(body: unknown, subjectId: string): Parsed<NewSubjectNote> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  if (!nonEmptyStr(body.title)) return { ok: false, error: "Titel darf nicht leer sein." };
  return {
    ok: true,
    value: {
      subjectId,
      title: body.title.trim(),
      body: body.body === undefined || body.body === null ? "" : String(body.body),
    },
  };
}

export function parseNotePatch(body: unknown): Parsed<Partial<NewSubjectNote>> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  const patch: Partial<NewSubjectNote> = {};
  if (body.title !== undefined) {
    if (!nonEmptyStr(body.title)) return { ok: false, error: "Titel darf nicht leer sein." };
    patch.title = body.title.trim();
  }
  if (body.body !== undefined) patch.body = body.body === null ? "" : String(body.body);
  return { ok: true, value: patch };
}

// Lehrplantext aus dem Request-Body. Wie parseLessonNoteBody: nur Typ und
// Laenge, ein leerer Text ist erlaubt und loescht (siehe saveCurriculum).
export function parseCurriculumBody(input: unknown): Parsed<string> {
  if (typeof input !== "string") return { ok: false, error: "body muss ein Text sein." };
  if (input.length > MAX_CURRICULUM_LEN)
    return { ok: false, error: `Der Lehrplan darf höchstens ${MAX_CURRICULUM_LEN} Zeichen lang sein.` };
  return { ok: true, value: input };
}

// { selected: string[], all: string[] } fuer das Setup.
export function parseSetupBody(body: unknown): Parsed<{ selected: string[]; all: string[] }> {
  if (!isObj(body)) return { ok: false, error: "Der Body muss ein Objekt sein." };
  const asNames = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null;
    if (!v.every((x) => nonEmptyStr(x))) return null;
    return (v as string[]).map((x) => x.trim());
  };
  const selected = asNames(body.selected ?? []);
  const all = asNames(body.all ?? []);
  if (!selected || !all)
    return { ok: false, error: "selected und all müssen Listen von Fachnamen sein." };
  return { ok: true, value: { selected, all } };
}

// --- Abgleich mit dem Stundenplan --------------------------------------------
//
// Der Stundenplan ist die Quelle der Wahrheit fuer die Faecherliste: er weiss,
// welche Faecher es gibt, wer sie unterrichtet und in welchem Raum. Bisher
// musste der Nutzer das einmalig im Setup bestaetigen und Lehrer/Raum danach
// von Hand nachtragen. Der Abgleich hier nimmt ihm beides ab und laeuft nach
// jedem Untis-Sync mit.

// Was der Stundenplan ueber ein Fach weiss.
export type UntisSubjectFact = {
  subject: string;
  teacher: string | null;
  room: string | null;
};

// Haeufigster Lehrer und Raum je Fach. mode() nimmt den haeufigsten Wert und
// ueberspringt dabei NULL. Der Filter auf "regular" haelt Vertretungen und
// einzelne Raumwechsel heraus -- eine Woche im Ausweichraum soll den Stammraum
// nicht ueberschreiben. Hat ein Fach ausschliesslich unregelmaessige Stunden,
// faellt coalesce auf alle Zeilen zurueck, damit dabei nicht schlicht nichts
// herauskommt.
export async function untisSubjectFacts(): Promise<UntisSubjectFact[]> {
  const haeufigster = (spalte: AnyPgColumn) => sql<string | null>`coalesce(
    mode() within group (order by ${spalte}) filter (where ${schoolBlocks.status} = 'regular'),
    mode() within group (order by ${spalte})
  )`;

  return db
    .select({
      subject: schoolBlocks.subject,
      teacher: haeufigster(schoolBlocks.teacher),
      room: haeufigster(schoolBlocks.room),
    })
    .from(schoolBlocks)
    .groupBy(schoolBlocks.subject)
    .orderBy(asc(schoolBlocks.subject));
}

// content = Noten + Notizen + Aufgaben + Dateien. Entscheidet, ob ein Fach ohne
// Stunden geloescht oder nur archiviert wird.
export type ExistingSubjectForReconcile = {
  id: string;
  untisSubject: string | null;
  teacher: string | null;
  room: string | null;
  // Was Untis beim letzten Abgleich lieferte. Weicht teacher davon ab, hat es
  // jemand von Hand geaendert.
  untisTeacher: string | null;
  untisRoom: string | null;
  archivedAt: Date | null;
  content: number;
};

export type SubjectFieldUpdate = {
  id: string;
  teacher: string | null;
  room: string | null;
  untisTeacher: string | null;
  untisRoom: string | null;
};

export type SubjectReconcilePlan = {
  toCreate: UntisSubjectFact[];
  toUpdate: SubjectFieldUpdate[];
  toArchive: string[];
  toDelete: string[];
};

// Ein Feld, das aus Untis kommt und von Hand ueberschrieben werden darf.
//
// Der Stundenplan gewinnt, solange niemand eingegriffen hat -- daran erkennbar,
// dass der Anzeigewert noch genau dem entspricht, was Untis zuletzt lieferte.
// Hat jemand etwas anderes eingetragen, bleibt das stehen. Ohne diese
// Unterscheidung waere jede Handeingabe beim naechsten Sync wieder weg, und
// genau darauf ist man angewiesen: zu manchen Lehrern kennt Untis nur ein
// Kuerzel, der lesbare Name kann dann nur von Hand kommen.
//
// Untis' Rohwert wird trotzdem immer mitgeschrieben. Wechselt spaeter der
// Lehrer, faellt das auf, statt hinter einer alten Handeingabe zu verschwinden.
function mergeUntisFeld(
  anzeige: string | null,
  zuletztVonUntis: string | null,
  jetztVonUntis: string | null,
): { anzeige: string | null; zuletztVonUntis: string | null } {
  if (jetztVonUntis === null) return { anzeige, zuletztVonUntis };
  const vonHand = anzeige !== null && anzeige !== zuletztVonUntis;
  return { anzeige: vonHand ? anzeige : jetztVonUntis, zuletztVonUntis: jetztVonUntis };
}

// Reine Mengenlogik, ohne DB -- daher isoliert testbar.
//
// Bewusst NICHT dabei: ein archiviertes Fach, das im Stundenplan steht, wird
// nicht reaktiviert. Wer ein Fach abgewaehlt hat (Kurs nicht belegt, Fach
// abgegeben), soll es nicht durch den naechsten Sync zurueckbekommen. Neu
// dazukommende Faecher haben dagegen ueberhaupt keine Zeile und werden aktiv
// angelegt.
export function planSubjectReconcile(
  existing: ExistingSubjectForReconcile[],
  facts: UntisSubjectFact[],
): SubjectReconcilePlan {
  const byUntisSubject = new Map(
    existing.filter((s) => s.untisSubject !== null).map((s) => [s.untisSubject as string, s]),
  );
  const imStundenplan = new Set(facts.map((f) => f.subject));

  const toCreate: UntisSubjectFact[] = [];
  const toUpdate: SubjectFieldUpdate[] = [];

  for (const fact of facts) {
    const row = byUntisSubject.get(fact.subject);
    if (!row) {
      toCreate.push(fact);
      continue;
    }

    const lehrer = mergeUntisFeld(row.teacher, row.untisTeacher, fact.teacher);
    const raum = mergeUntisFeld(row.room, row.untisRoom, fact.room);

    if (
      lehrer.anzeige !== row.teacher ||
      raum.anzeige !== row.room ||
      lehrer.zuletztVonUntis !== row.untisTeacher ||
      raum.zuletztVonUntis !== row.untisRoom
    ) {
      toUpdate.push({
        id: row.id,
        teacher: lehrer.anzeige,
        room: raum.anzeige,
        untisTeacher: lehrer.zuletztVonUntis,
        untisRoom: raum.zuletztVonUntis,
      });
    }
  }

  const toArchive: string[] = [];
  const toDelete: string[] = [];

  for (const row of byUntisSubject.values()) {
    if (imStundenplan.has(row.untisSubject as string)) continue;
    // Ein Fach ohne jeden Inhalt ist nur eine Zeile, die irgendein frueherer
    // Sync angelegt hat -- die darf verschwinden. Sobald Noten, Notizen,
    // Aufgaben oder Dateien daran haengen, wird archiviert statt geloescht:
    // Inhalte des Nutzers loescht ein Hintergrundlauf nicht.
    if (row.content === 0) toDelete.push(row.id);
    else if (row.archivedAt === null) toArchive.push(row.id);
  }

  // Faecher mit untisSubject === null sind von Hand angelegt (AG, Nachhilfe)
  // und stehen naturgemaess in keinem Stundenplan. Sie bleiben unangetastet.
  return { toCreate, toUpdate, toArchive, toDelete };
}

export type SubjectReconcileResult = {
  created: number;
  updated: number;
  archived: number;
  deleted: number;
  // true = es gibt keine einzige Stunde, es wurde nichts angefasst.
  skipped: boolean;
};

const contentCountSql = sql<number>`(
    (select count(*) from grades where grades.subject_id = subjects.id)
  + (select count(*) from subject_notes where subject_notes.subject_id = subjects.id)
  + (select count(*) from assignments where assignments.subject_id = subjects.id)
  + (select count(*) from subject_files where subject_files.subject_id = subjects.id)
)`.mapWith(Number);

export async function reconcileSubjects(): Promise<SubjectReconcileResult> {
  const facts = await untisSubjectFacts();
  // Ohne eine einzige Stunde gibt es nichts abzugleichen. Das ist keine
  // Bequemlichkeit, sondern die Sicherung: bei leerem school_blocks (erster
  // Start, zurueckgesetzte Datenbank, Untis liefert gerade nichts) waeren sonst
  // schlagartig ALLE Faecher "nicht mehr im Stundenplan".
  if (facts.length === 0) {
    return { created: 0, updated: 0, archived: 0, deleted: 0, skipped: true };
  }

  const existing = await db
    .select({
      id: subjects.id,
      untisSubject: subjects.untisSubject,
      teacher: subjects.teacher,
      room: subjects.room,
      untisTeacher: subjects.untisTeacher,
      untisRoom: subjects.untisRoom,
      archivedAt: subjects.archivedAt,
      content: contentCountSql,
    })
    .from(subjects);

  const plan = planSubjectReconcile(existing, facts);

  if (plan.toCreate.length > 0) {
    await db
      .insert(subjects)
      .values(
        plan.toCreate.map((f) => ({
          name: f.subject,
          untisSubject: f.subject,
          teacher: f.teacher,
          room: f.room,
          untisTeacher: f.teacher,
          untisRoom: f.room,
          color: defaultColorFor(f.subject),
        })),
      )
      .onConflictDoNothing({ target: subjects.untisSubject });
  }

  // Lehrer und Raum unterscheiden sich je Fach, das laesst sich nicht in einen
  // inArray-Aufruf zusammenfassen. In aller Regel ist die Liste nach dem ersten
  // Abgleich leer, danach kostet die Schleife also nichts.
  for (const u of plan.toUpdate) {
    await db
      .update(subjects)
      .set({
        teacher: u.teacher,
        room: u.room,
        untisTeacher: u.untisTeacher,
        untisRoom: u.untisRoom,
        updatedAt: sql`now()`,
      })
      .where(eq(subjects.id, u.id));
  }

  if (plan.toArchive.length > 0) {
    await db
      .update(subjects)
      .set({ archivedAt: sql`now()`, updatedAt: sql`now()` })
      .where(inArray(subjects.id, plan.toArchive));
  }

  if (plan.toDelete.length > 0) {
    await db.delete(subjects).where(inArray(subjects.id, plan.toDelete));
  }

  return {
    created: plan.toCreate.length,
    updated: plan.toUpdate.length,
    archived: plan.toArchive.length,
    deleted: plan.toDelete.length,
    skipped: false,
  };
}
