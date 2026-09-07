// Store des Lernplans (/lernen/.../plan): legt Plaene an, laedt/loescht sie,
// hakt Einheiten ab, verteilt neu und schreibt Sicherheit aus Karten und
// Tutor-Fazit zurueck. Reine DB-Zugriffe -- die eigentliche Rechnerei
// (einheitenFuer, verteilen, neuVerteilen) liegt in lib/lernplan.ts, die
// Sicherheits-Umrechnung in lib/lernplan-sicherheit.ts. Siehe SPEC.md
// "Datenmodell" und "Verhalten" Schritt 4 ff.
//
// KEINE ECHTE TRANSAKTION: neon-http (drizzle-orm/neon-http) kennt kein
// db.transaction(). "In einer Transaktion" aus der SPEC wird deshalb so
// angenaehert: der ALTE Plan wird ZUERST geloescht (wegen
// UNIQUE(assignment_id) -- ein zweiter Plan derselben Pruefung liesse sich
// sonst gar nicht erst einfuegen), danach der neue Plan angelegt, danach
// Punkte/Checks/Items geschrieben. Scheitert einer der Schreibschritte nach
// dem Anlegen des neuen Plans, wird nur dieser halb angelegte neue Plan
// wieder geloescht (cascade raeumt seine Punkte/Checks/Items mit auf) und ein
// 500 "speichern" geworfen -- der alte Plan ist zu diesem Zeitpunkt bereits
// weg, das ist der einzige Fall, in dem die Reihenfolge alt-loeschen-dann-
// neu-anlegen zwingend ist (sonst waere "neu anlegen, dann alt loeschen" die
// sicherere Reihenfolge).

import { and, asc, eq, gte, inArray, isNull, lte, ne, notInArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assignments,
  schoolBlocks,
  studyCards,
  studyPlanChecks,
  studyPlanItems,
  studyPlanPoints,
  studyPlans,
  studyTopics,
  subjectFiles,
  subjects,
  type NewStudyPlanCheck,
  type NewStudyPlanItem,
  type NewStudyPlanPoint,
  type StudyPlan,
  type StudyPlanItem,
  type StudyPlanPoint,
} from "@/lib/db/schema";
import { getAssignment } from "@/lib/assignment-store";
import { createTopic, deleteTopic, updateTopic } from "@/lib/study-store";
import { listFiles } from "@/lib/subject-file-store";
import { daysBetween } from "@/lib/lernen";
import { heuteISO, jetztHM } from "@/lib/zeit";
import { LernplanFehler, einheitenFuer, neuVerteilen, verteilen, type NeuVerteilenInput } from "@/lib/lernplan";
import { sicherheitAusFazit, sicherheitAusKarten } from "@/lib/lernplan-sicherheit";
import type {
  CheckDraft,
  Einheit,
  ItemDTO,
  PlanDTO,
  PunktDTO,
  PunktDraft,
  SicherheitQuelle,
} from "@/lib/lernplan-types";
// Werte, kein Typ -- muessen darum aus dem import type oben heraus.
import { ZEITBUDGET_MAX, ZEITBUDGET_MIN } from "@/lib/lernplan-types";

// --- Fehler --------------------------------------------------------------

export class LernplanStoreFehler extends Error {
  status: number;
  code: string;
  hinweis?: string;

  constructor(status: number, code: string, hinweis?: string) {
    super(hinweis ?? code);
    this.name = "LernplanStoreFehler";
    this.status = status;
    this.code = code;
    this.hinweis = hinweis;
  }
}

// Urteil -> Sicherheit bei der Erst-Diagnose. Im Wortlaut der SPEC steht dies
// als "sicherheitAusChecks" in lib/lernplan.ts, dort existiert die Funktion
// aber nicht (Datei ist reine Einheiten-/Verteil-Logik ohne Diagnose-Bezug)
// -- deshalb hier als kleine lokale Umrechnung, analog zu sicherheitAusFazit.
function sicherheitAusUrteil(urteil: "richtig" | "teilweise" | "falsch"): number {
  return urteil === "richtig" ? 100 : urteil === "teilweise" ? 50 : 0;
}

// --- Hilfsfunktionen -------------------------------------------------------

// Alle Tage im Bereich [vonISO, bisISO], an denen mindestens ein nicht
// abgesagter school_blocks-Eintrag liegt -- Grundlage fuer verteilen()s
// schultag(iso). Eine Query statt expandRange(), das zusaetzlich Notizen,
// Meldungen und faellige Aufgaben mitlaedt, die hier niemand braucht.
async function ladeSchultagSet(vonISO: string, bisISO: string): Promise<Set<string>> {
  if (vonISO > bisISO) return new Set();
  const rows = await db
    .select({ date: schoolBlocks.date })
    .from(schoolBlocks)
    .where(and(gte(schoolBlocks.date, vonISO), lte(schoolBlocks.date, bisISO), ne(schoolBlocks.status, "cancelled")));
  return new Set(rows.map((r) => r.date));
}

function summaryFuer(p: PunktDraft, urteil: string | null, blattNamen: string[], quelle: SicherheitQuelle): string {
  const teile: string[] = [];
  if (p.detail) teile.push(p.detail);
  if (p.seiten) teile.push(`Seiten: ${p.seiten}`);
  if (blattNamen.length > 0) teile.push(`Blätter: ${blattNamen.join(", ")}`);
  // Uebersprungene Frage: quelle ist "ohne_test" (keine Messung), urteil
  // trotzdem "falsch" (technische Kodierung fuer "keine Antwort"). Die
  // Zusammenfassung soll keine Diagnose behaupten, die nie stattfand.
  if (urteil && quelle === "diagnose") teile.push(`Diagnose: ${urteil}`);
  return teile.join(" · ");
}

function toCheckDTO(row: {
  id: string;
  pointId: string;
  question: string;
  expected: string;
  answer: string | null;
  verdict: "richtig" | "teilweise" | "falsch" | null;
  feedback: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    pointId: row.pointId,
    frage: row.question,
    musterantwort: row.expected,
    antwort: row.answer,
    urteil: row.verdict,
    feedback: row.feedback,
    createdAt: row.createdAt.toISOString(),
  };
}

// Baut PunktDTOs aus rohen Zeilen -- gebuendelt, damit Blaetter-Namen und
// Karten-Anzahl je Thema ueber Batch-Queries kommen statt je Punkt eine
// eigene (kein N+1). Wird sowohl fuer einen ganzen Plan als auch fuer einen
// einzelnen Punkt (punktPatch, punktMitBlaettern) genutzt.
async function ladePunkteDTO(points: StudyPlanPoint[]): Promise<PunktDTO[]> {
  if (points.length === 0) return [];

  const pointIds = points.map((p) => p.id);
  const checks = await db.select().from(studyPlanChecks).where(inArray(studyPlanChecks.pointId, pointIds));
  const checksByPoint = new Map<string, typeof checks>();
  for (const c of checks) {
    const list = checksByPoint.get(c.pointId) ?? [];
    list.push(c);
    checksByPoint.set(c.pointId, list);
  }

  const allFileIds = [...new Set(points.flatMap((p) => p.fileIds as string[]))];
  const files =
    allFileIds.length > 0
      ? await db
          .select({ id: subjectFiles.id, name: subjectFiles.name })
          .from(subjectFiles)
          .where(inArray(subjectFiles.id, allFileIds))
      : [];
  const fileNameById = new Map(files.map((f) => [f.id, f.name]));

  const topicIds = [...new Set(points.map((p) => p.topicId).filter((t): t is string => t !== null))];
  const kartenRows =
    topicIds.length > 0
      ? await db
          .select({ topicId: studyCards.topicId, n: sql<number>`count(*)`.mapWith(Number) })
          .from(studyCards)
          .where(and(inArray(studyCards.topicId, topicIds), isNull(studyCards.archivedAt)))
          .groupBy(studyCards.topicId)
      : [];
  const kartenByTopic = new Map(kartenRows.map((r) => [r.topicId as string, r.n]));

  return points.map((p) => {
    const fileIds = p.fileIds as string[];
    return {
      id: p.id,
      planId: p.planId,
      topicId: p.topicId,
      position: p.position,
      titel: p.title,
      detail: p.detail,
      seiten: p.pages,
      fileIds,
      blaetter: fileIds.flatMap((id) => {
        const name = fileNameById.get(id);
        return name ? [{ id, name }] : [];
      }),
      minutenSchaetzung: p.minutesEstimate,
      sicherheit: p.confidence,
      sicherheitQuelle: p.confidenceSource,
      sicherheitAm: p.confidenceAt.toISOString(),
      cardsState: p.cardsState,
      kartenAnzahl: p.topicId ? (kartenByTopic.get(p.topicId) ?? 0) : 0,
      checks: (checksByPoint.get(p.id) ?? []).map(toCheckDTO),
    };
  });
}

async function ladePunktDTO(pointId: string): Promise<PunktDTO | null> {
  const [row] = await db.select().from(studyPlanPoints).where(eq(studyPlanPoints.id, pointId));
  if (!row) return null;
  const [dto] = await ladePunkteDTO([row]);
  return dto ?? null;
}

function toItemDTOSync(
  row: StudyPlanItem,
  punktInfoById: Map<string, { titel: string; topicId: string | null }>,
): ItemDTO {
  const info = row.pointId ? punktInfoById.get(row.pointId) : undefined;
  return {
    id: row.id,
    planId: row.planId,
    pointId: row.pointId,
    punktTitel: info?.titel ?? null,
    topicId: info?.topicId ?? null,
    date: row.date,
    position: row.position,
    phase: row.phase,
    minuten: row.minutes,
    doneAt: row.doneAt ? row.doneAt.toISOString() : null,
    result: row.result,
  };
}

async function toItemDTO(row: StudyPlanItem): Promise<ItemDTO> {
  let info: { titel: string; topicId: string | null } | undefined;
  if (row.pointId) {
    const [p] = await db
      .select({ title: studyPlanPoints.title, topicId: studyPlanPoints.topicId })
      .from(studyPlanPoints)
      .where(eq(studyPlanPoints.id, row.pointId));
    if (p) info = { titel: p.title, topicId: p.topicId };
  }
  return toItemDTOSync(row, row.pointId && info ? new Map([[row.pointId, info]]) : new Map());
}

async function ladePlanDTO(plan: StudyPlan): Promise<PlanDTO> {
  const points = await db
    .select()
    .from(studyPlanPoints)
    .where(eq(studyPlanPoints.planId, plan.id))
    .orderBy(asc(studyPlanPoints.position));
  const punkte = await ladePunkteDTO(points);
  const punktInfoById = new Map(points.map((p) => [p.id, { titel: p.title, topicId: p.topicId }]));

  const itemRows = await db.select().from(studyPlanItems).where(eq(studyPlanItems.planId, plan.id));
  const items = itemRows
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position)
    .map((i) => toItemDTOSync(i, punktInfoById));

  return {
    id: plan.id,
    assignmentId: plan.assignmentId,
    subjectId: plan.subjectId,
    checklistFileId: plan.checklistFileId,
    checklistText: plan.checklistText,
    minutesWeekday: plan.minutesWeekday,
    minutesWeekend: plan.minutesWeekend,
    examDate: plan.examDate,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    punkte,
    items,
  };
}

// --- planAnlegen -----------------------------------------------------------

export type PlanAnlegenInput = {
  assignmentId: string;
  checklist: { fileId: string } | { text: string };
  fileIds: string[];
  minutesWeekday: number;
  minutesWeekend: number;
  punkte: PunktDraft[];
  checks: CheckDraft[] | null;
  ersetzen: boolean;
};

export async function planAnlegen(
  input: PlanAnlegenInput,
  zeit: { heuteISO: string; jetztHM: string },
): Promise<{ plan: PlanDTO; createdTopicIds: string[]; hinweis?: string[] }> {
  const assignment = await getAssignment(input.assignmentId);
  if (!assignment) throw new LernplanStoreFehler(404, "pruefung", "Prüfung gibt es nicht mehr.");
  if (!assignment.subjectId) throw new LernplanStoreFehler(400, "kein_fach", "Prüfung hat kein Fach.");
  if (!assignment.dueDate || assignment.dueDate <= zeit.heuteISO) {
    throw new LernplanStoreFehler(422, "keine_tage", "Bis zur Prüfung sind keine Tage mehr.");
  }
  const subjectId = assignment.subjectId;
  const pruefungISO = assignment.dueDate;

  // Alle referenzierten Dateien (Checkliste, Blaetter, Punkt-Dateien)
  // muessen zum Fach der Pruefung gehoeren.
  const dateien = await listFiles(subjectId);
  const gueltig = new Set(dateien.map((d) => d.id));
  const nameById = new Map(dateien.map((d) => [d.id, d.name]));
  const alleFileIds = new Set<string>(input.fileIds);
  if ("fileId" in input.checklist) alleFileIds.add(input.checklist.fileId);
  for (const p of input.punkte) for (const id of p.fileIds) alleFileIds.add(id);
  for (const id of alleFileIds) {
    if (!gueltig.has(id)) throw new LernplanStoreFehler(400, "dateien_fremd", "Eine Datei gehört nicht zu diesem Fach.");
  }

  // Doppel-Submit: ein Plan derselben Pruefung, juenger als 30s, ohne
  // ersetzen -> 409.
  const [bestehend] = await db.select().from(studyPlans).where(eq(studyPlans.assignmentId, input.assignmentId));
  if (bestehend && !input.ersetzen) {
    const alterMs = Date.now() - bestehend.createdAt.getTime();
    if (alterMs < 30_000) {
      throw new LernplanStoreFehler(409, "plan_gerade_erstellt", "Plan wurde gerade erstellt.");
    }
  }

  // Sicherheit je Punkt aus checks (pointIndex, sonst Position im Array).
  const rechnung: { sicherheit: number; quelle: SicherheitQuelle; urteil: string | null }[] = input.punkte.map(() => ({
    sicherheit: 50,
    quelle: "ohne_test" as const,
    urteil: null,
  }));
  if (input.checks) {
    input.checks.forEach((check, i) => {
      const idx = check.pointIndex ?? i;
      if (idx < 0 || idx >= input.punkte.length) return;
      // Uebersprungene Frage (antwort === null, siehe lernplan-erstellen.tsx)
      // ist keine Messung -- urteil "falsch" kommt nur zustande, weil eine
      // fehlende Antwort technisch als "falsch" kodiert wird, nicht weil der
      // Schueler nachweislich etwas falsch beantwortet hat. quelle bleibt
      // deshalb "ohne_test" (= keine belastbare Messung), nicht "diagnose"
      // (= tatsaechlich getestet). sicherheit bleibt bei sicherheitAusUrteil
      // ("falsch") = 0, die Verteilung soll den Punkt weiterhin als unsicher
      // einplanen -- nur die Herkunft der Zahl aendert sich.
      const quelle: SicherheitQuelle = check.antwort === null ? "ohne_test" : "diagnose";
      rechnung[idx] = { sicherheit: sicherheitAusUrteil(check.urteil), quelle, urteil: check.urteil };
    });
  }

  const einheiten: Einheit[] = input.punkte.flatMap((p, i) =>
    einheitenFuer({ minuten: p.minuten, sicherheit: rechnung[i].sicherheit }, i),
  );

  const schultagSet = await ladeSchultagSet(zeit.heuteISO, pruefungISO);

  let verteiltErgebnis;
  try {
    verteiltErgebnis = verteilen(einheiten, {
      heuteISO: zeit.heuteISO,
      jetztHM: zeit.jetztHM,
      pruefungISO,
      schultag: (iso) => schultagSet.has(iso),
      minutesWeekday: input.minutesWeekday,
      minutesWeekend: input.minutesWeekend,
      sicherheiten: rechnung.map((r) => r.sicherheit),
    });
  } catch (err) {
    if (err instanceof LernplanFehler && err.code === "keine_tage") {
      throw new LernplanStoreFehler(422, "keine_tage", "Bis zur Prüfung sind keine Tage mehr.");
    }
    throw err;
  }

  // Alten Plan zuerst loeschen -- UNIQUE(assignment_id) erzwingt diese
  // Reihenfolge, siehe Kommentar am Dateikopf. Themen bleiben unberuehrt
  // (topic_id an den alten Punkten ist eine eigene FK, kein Teil von
  // study_plans) -- genau das macht die Wiederverwendung gleich moeglich.
  if (bestehend) {
    await db.delete(studyPlans).where(eq(studyPlans.id, bestehend.id));
  }

  // Themen je Punkt: nicht archiviertes Thema gleichen Titels an dieser
  // Pruefung wiederverwenden, sonst neu anlegen.
  const createdTopicIds: string[] = [];
  const topicIds: string[] = [];
  const verfuegbareThemen = await db
    .select()
    .from(studyTopics)
    .where(and(eq(studyTopics.assignmentId, input.assignmentId), isNull(studyTopics.archivedAt)));

  for (let i = 0; i < input.punkte.length; i++) {
    const p = input.punkte[i];
    const idx = verfuegbareThemen.findIndex((t) => t.title === p.titel);
    const blattNamen = p.fileIds.flatMap((id) => {
      const name = nameById.get(id);
      return name ? [name] : [];
    });
    const summary = summaryFuer(p, rechnung[i].urteil, blattNamen, rechnung[i].quelle);

    if (idx !== -1) {
      const treffer = verfuegbareThemen.splice(idx, 1)[0];
      await updateTopic(treffer.id, { summary });
      topicIds.push(treffer.id);
    } else {
      const topic = await createTopic({ subjectId, title: p.titel, assignmentId: input.assignmentId });
      await updateTopic(topic.id, { summary });
      topicIds.push(topic.id);
      createdTopicIds.push(topic.id);
    }
  }

  // Der obige Check (bestehend + 30s) ist keine echte Sperre -- zwei
  // gleichzeitige Anfragen fuer dieselbe Pruefung koennen beide daran
  // vorbeikommen, dann verletzt der zweite insert() hier
  // study_plans_assignment_id_unique. Das faengt genau denselben Fall ab
  // (409 plan_gerade_erstellt statt eines generischen 500), nur eben aus der
  // Datenbank statt aus der Anwendung heraus erkannt.
  let planRow: StudyPlan;
  try {
    [planRow] = await db
      .insert(studyPlans)
      .values({
        assignmentId: input.assignmentId,
        subjectId,
        checklistFileId: "fileId" in input.checklist ? input.checklist.fileId : null,
        checklistText: "text" in input.checklist ? input.checklist.text : "",
        minutesWeekday: input.minutesWeekday,
        minutesWeekend: input.minutesWeekend,
        examDate: pruefungISO,
      })
      .returning();
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === "23505") {
      throw new LernplanStoreFehler(409, "plan_gerade_erstellt", "Plan wurde gerade erstellt.");
    }
    throw err;
  }

  try {
    const pointValues: NewStudyPlanPoint[] = input.punkte.map((p, i) => ({
      planId: planRow.id,
      topicId: topicIds[i],
      position: i,
      title: p.titel,
      detail: p.detail,
      pages: p.seiten,
      fileIds: p.fileIds,
      minutesEstimate: p.minuten,
      confidence: rechnung[i].sicherheit,
      confidenceSource: rechnung[i].quelle,
      cardsState: "offen",
    }));
    const pointRows = await db.insert(studyPlanPoints).values(pointValues).returning();

    if (input.checks) {
      const checkValues: NewStudyPlanCheck[] = [];
      input.checks.forEach((check, i) => {
        const idx = check.pointIndex ?? i;
        const point = pointRows[idx];
        if (!point) return;
        checkValues.push({
          pointId: point.id,
          question: check.frage,
          expected: check.musterantwort,
          answer: check.antwort,
          verdict: check.urteil,
          feedback: check.feedback,
        });
      });
      if (checkValues.length > 0) await db.insert(studyPlanChecks).values(checkValues);
    }

    const itemValues: NewStudyPlanItem[] = verteiltErgebnis.items.map((it) => ({
      planId: planRow.id,
      pointId: it.pointIndex === null ? null : pointRows[it.pointIndex].id,
      date: it.date,
      position: it.position,
      phase: it.phase,
      minutes: it.minuten,
    }));
    if (itemValues.length > 0) await db.insert(studyPlanItems).values(itemValues);
  } catch (err) {
    await db
      .delete(studyPlans)
      .where(eq(studyPlans.id, planRow.id))
      .catch(() => {});
    console.error("[lernplan] planAnlegen: Speichern fehlgeschlagen, Plan zurückgerollt:", err);
    throw new LernplanStoreFehler(500, "speichern", "Plan konnte nicht gespeichert werden.");
  }

  const plan = await ladePlanDTO(planRow);
  const hinweis: string[] = [];
  if (verteiltErgebnis.hinweis === "knapp") {
    if (verteiltErgebnis.gestrichen > 0) {
      hinweis.push(
        `Knapp: ${verteiltErgebnis.gestrichen} Übungseinheiten mussten gestrichen werden, damit der Plan bis zur Prüfung passt. Du lernst den Stoff trotzdem, wiederholst ihn aber seltener. Plane dafür selbst zusätzliche Zeit ein.`,
      );
    }
    // S7: reicht das Streichen allein nicht, werden die Tagesbudgets
    // stillschweigend hochskaliert (siehe verteilen() Schritt 2) -- ohne
    // diesen Satz erfaehrt niemand, dass einzelne Tage laenger geworden sind
    // als die selbst angegebene Zeit pro Schultag/Wochenendtag.
    if (verteiltErgebnis.budgetErhoeht) {
      hinweis.push(
        "Knapp: einzelne Tage sind länger geworden, als du angegeben hast, damit der Plan bis zur Prüfung passt.",
      );
    }
  }

  return { plan, createdTopicIds, ...(hinweis.length > 0 ? { hinweis } : {}) };
}

// --- Laden / Loeschen --------------------------------------------------------

export async function planLaden(assignmentId: string): Promise<PlanDTO | null> {
  const [plan] = await db.select().from(studyPlans).where(eq(studyPlans.assignmentId, assignmentId));
  if (!plan) return null;
  return ladePlanDTO(plan);
}

export async function planLadenPerId(planId: string): Promise<PlanDTO | null> {
  const [plan] = await db.select().from(studyPlans).where(eq(studyPlans.id, planId));
  if (!plan) return null;
  return ladePlanDTO(plan);
}

export async function planLoeschen(planId: string, topicIds: string[] = []): Promise<void> {
  const [plan] = await db.select().from(studyPlans).where(eq(studyPlans.id, planId));
  if (!plan) throw new LernplanStoreFehler(404, "kein_plan", "Plan gibt es nicht mehr.");

  if (topicIds.length > 0) {
    const points = await db
      .select({ topicId: studyPlanPoints.topicId })
      .from(studyPlanPoints)
      .where(eq(studyPlanPoints.planId, planId));
    const erlaubt = new Set(points.map((p) => p.topicId).filter((t): t is string => t !== null));
    for (const id of topicIds) {
      if (!erlaubt.has(id)) throw new LernplanStoreFehler(400, "themen_fremd", "Ein Thema gehört nicht zu diesem Plan.");
    }
    for (const id of topicIds) {
      await deleteTopic(id);
    }
  }

  await db.delete(studyPlans).where(eq(studyPlans.id, planId));
}

// --- Einheit abhaken ---------------------------------------------------------

export type ItemAbhakenInput = { done: boolean; result?: number };

export async function itemAbhaken(itemId: string, input: ItemAbhakenInput): Promise<ItemDTO> {
  const [item] = await db.select().from(studyPlanItems).where(eq(studyPlanItems.id, itemId));
  if (!item) throw new LernplanStoreFehler(404, "item_fehlt", "Einheit nicht gefunden.");

  if (!input.done) {
    const now = new Date();
    // Ein zurueckgenommenes Haekchen hat frueher (siehe unten) moeglicherweise
    // die Sicherheit auf "selbst" gesetzt -- das muss rueckgaengig gemacht
    // werden, sonst bleibt eine Sicherheit stehen, die nicht mehr gilt (siehe
    // Bug-Bericht). Zurueckgezogen wird nur, was noch auf "selbst" steht: ist
    // die Sicherheit inzwischen durch Karten oder Diagnose ueberschrieben
    // worden, ist die neuere, praezisere Quelle massgeblich und bleibt stehen
    // (dasselbe Vorrang-Muster wie beim Setzen weiter unten). Die vorherige
    // "selbst"-Sicherheit ist nicht rekonstruierbar (kein Verlauf gespeichert)
    // -- ehrlicher als eine geratene Zahl ist der Rueckfall auf die
    // Schema-Defaults (50 / "ohne_test"), die auch ein frisch angelegter
    // Punkt ohne Test hat.
    if (item.phase === "probe" && item.pointId) {
      await db
        .update(studyPlanPoints)
        .set({ confidence: 50, confidenceSource: "ohne_test", confidenceAt: now })
        .where(and(eq(studyPlanPoints.id, item.pointId), eq(studyPlanPoints.confidenceSource, "selbst")));
    } else if (item.phase === "simulation") {
      await db
        .update(studyPlanPoints)
        .set({ confidence: 50, confidenceSource: "ohne_test", confidenceAt: now })
        .where(and(eq(studyPlanPoints.planId, item.planId), eq(studyPlanPoints.confidenceSource, "selbst")));
    }

    const [updated] = await db
      .update(studyPlanItems)
      .set({ doneAt: null, result: null })
      .where(eq(studyPlanItems.id, itemId))
      .returning();
    return toItemDTO(updated);
  }

  const now = new Date();
  const setztErgebnis = (item.phase === "probe" || item.phase === "simulation") && input.result !== undefined;

  const [updated] = await db
    .update(studyPlanItems)
    .set({ doneAt: now, result: setztErgebnis ? input.result! : item.result })
    .where(eq(studyPlanItems.id, itemId))
    .returning();

  if (setztErgebnis) {
    const sicherheit = sicherheitAusFazit(input.result!);
    if (item.phase === "probe" && item.pointId) {
      await db
        .update(studyPlanPoints)
        .set({ confidence: sicherheit, confidenceSource: "selbst", confidenceAt: now })
        .where(eq(studyPlanPoints.id, item.pointId));
    } else if (item.phase === "simulation") {
      // Die Simulation ist eine grobe Selbsteinschaetzung ueber den ganzen
      // Plan (drei Knoepfe: Sitzt/Wackelt/Fehlt). Sie darf keine praezisere,
      // mechanisch berechnete Sicherheit ueberschreiben -- Karten (aus echten
      // Box-Werten, lib/lernplan-sicherheit.ts sicherheitAusKarten) und
      // Diagnose (aus dem Checklisten-Test) wiegen schwerer als ein einziger
      // Wert fuer den ganzen Plan. Siehe SPEC.md "Sicherheit schreibt sich
      // zurueck".
      await db
        .update(studyPlanPoints)
        .set({ confidence: sicherheit, confidenceSource: "selbst", confidenceAt: now })
        .where(
          and(
            eq(studyPlanPoints.planId, item.planId),
            notInArray(studyPlanPoints.confidenceSource, ["karten", "diagnose"]),
          ),
        );
    }
  }

  return toItemDTO(updated);
}

// --- Punkt patchen (Karten-Queue-Status, Thema nachtragen) ------------------

export type PunktPatchInput = { cardsState?: "offen" | "fertig" | "fehler"; topicId?: string };

// topicId kommt vom Edge Case "Thema geloescht": die Karten-Queue legt beim
// naechsten Lauf ein neues Thema an (POST /api/lernen/themen) und haengt es
// hier an den Punkt zurueck. Das neue Thema muss zum Fach des Plans gehoeren
// (thema_fremd), sonst liesse sich ein Thema aus einem anderen Fach
// unterschieben.
export async function punktPatch(pointId: string, input: PunktPatchInput): Promise<PunktDTO> {
  const [existing] = await db.select().from(studyPlanPoints).where(eq(studyPlanPoints.id, pointId));
  if (!existing) throw new LernplanStoreFehler(404, "punkt_fehlt", "Punkt nicht gefunden.");

  const patch: { cardsState?: "offen" | "fertig" | "fehler"; topicId?: string } = {};
  if (input.cardsState !== undefined) patch.cardsState = input.cardsState;
  if (input.topicId !== undefined) {
    const [plan] = await db.select().from(studyPlans).where(eq(studyPlans.id, existing.planId));
    if (!plan) throw new LernplanStoreFehler(404, "kein_plan", "Plan nicht gefunden.");
    const [topic] = await db.select().from(studyTopics).where(eq(studyTopics.id, input.topicId));
    if (!topic || topic.subjectId !== plan.subjectId) {
      throw new LernplanStoreFehler(400, "thema_fremd", "Thema gehört nicht zu diesem Fach.");
    }
    patch.topicId = input.topicId;
  }

  if (Object.keys(patch).length > 0) {
    await db.update(studyPlanPoints).set(patch).where(eq(studyPlanPoints.id, pointId));
  }
  const punkt = await ladePunktDTO(pointId);
  if (!punkt) throw new LernplanStoreFehler(404, "punkt_fehlt", "Punkt nicht gefunden.");
  return punkt;
}

// --- Neu verteilen -----------------------------------------------------------

export type NeuVerteilenStoreErgebnis = {
  plan: PlanDTO;
  hinweis?: "knapp";
  neu: number;
  zusaetzlich: number;
  // S1: wie bei planAnlegen (siehe VerteilenErgebnis.budgetErhoeht) --
  // unterscheidet "es wurde gestrichen" von "die Tagesbudgets sind
  // hochskaliert worden", statt beides unter "knapp" zu verstecken.
  budgetErhoeht: boolean;
  // S4: gestrichen > 0 und budgetErhoeht sind unabhaengig voneinander wahr
  // (verteilen() Schritt 1/2 in lib/lernplan.ts) -- ohne die Zahl hier weiss
  // der Aufrufer nur, dass IRGENDETWAS knapp war, nicht dass zusaetzlich
  // Einheiten ersatzlos wegfielen. Kommt aus VerteilenErgebnis.gestrichen
  // (verteilen()) durch NeuVerteilenErgebnis.gestrichen (lib/lernplan.ts,
  // die Funktion neuVerteilen()) durchgereicht, siehe neuVerteilenImStore
  // unten.
  gestrichen: number;
};

export async function neuVerteilenImStore(
  planId: string,
  umfang: "ueberfaellig" | "alle_offen",
): Promise<NeuVerteilenStoreErgebnis> {
  const [planRow] = await db.select().from(studyPlans).where(eq(studyPlans.id, planId));
  if (!planRow) throw new LernplanStoreFehler(404, "kein_plan", "Plan gibt es nicht mehr.");

  const assignment = await getAssignment(planRow.assignmentId);
  if (!assignment || !assignment.dueDate) {
    throw new LernplanStoreFehler(404, "pruefung", "Prüfung gibt es nicht mehr.");
  }
  const pruefungISO = assignment.dueDate;

  const points = await db
    .select()
    .from(studyPlanPoints)
    .where(eq(studyPlanPoints.planId, planId))
    .orderBy(asc(studyPlanPoints.position));
  const pointIndexById = new Map(points.map((p, i) => [p.id, i]));
  const items = await db.select().from(studyPlanItems).where(eq(studyPlanItems.planId, planId));

  const heute = heuteISO();
  const schultagSet = await ladeSchultagSet(heute, pruefungISO);

  const input: NeuVerteilenInput = {
    items: items.map((i) => ({
      id: i.id,
      pointIndex: i.pointId ? (pointIndexById.get(i.pointId) ?? null) : null,
      phase: i.phase,
      minuten: i.minutes,
      date: i.date,
      doneAt: i.doneAt ? i.doneAt.toISOString() : null,
    })),
    punkte: points.map((p) => ({ sicherheit: p.confidence })),
  };

  let ergebnis;
  try {
    ergebnis = neuVerteilen(input, {
      umfang,
      heuteISO: heute,
      jetztHM: jetztHM(),
      pruefungISO,
      schultag: (iso) => schultagSet.has(iso),
      minutesWeekday: planRow.minutesWeekday,
      minutesWeekend: planRow.minutesWeekend,
      sicherheiten: points.map((p) => p.confidence),
    });
  } catch (err) {
    if (err instanceof LernplanFehler && err.code === "keine_tage") {
      throw new LernplanStoreFehler(422, "keine_tage", "Bis zur Prüfung sind keine Tage mehr.");
    }
    throw err;
  }

  const behaltenSet = new Set(ergebnis.behalten);
  const zuLoeschen = items.filter((i) => !behaltenSet.has(i.id)).map((i) => i.id);
  if (zuLoeschen.length > 0) {
    await db.delete(studyPlanItems).where(inArray(studyPlanItems.id, zuLoeschen));
  }

  const neueRows: NewStudyPlanItem[] = ergebnis.neu.map((it) => ({
    planId,
    pointId: it.pointIndex === null ? null : points[it.pointIndex].id,
    date: it.date,
    position: it.position,
    phase: it.phase,
    minutes: it.minuten,
  }));
  if (neueRows.length > 0) await db.insert(studyPlanItems).values(neueRows);

  // S1: "ueberfaellig" fasst per Definition nur Items mit date < heute an
  // (siehe neuVerteilen in lib/lernplan.ts) -- kuenftige Einheiten bleiben
  // auf dem alten Kalender liegen. Wuerde examDate hier trotzdem auf das
  // neue Pruefungsdatum gesetzt, verschwaende der Verschoben-Banner auf der
  // Planseite (haengt an assignment.dueDate !== plan.examDate), obwohl noch
  // gar nicht neu verteilt wurde. Nur "alle_offen" verteilt wirklich den
  // ganzen Plan auf den neuen Termin und darf examDate deshalb mitschreiben.
  await db
    .update(studyPlans)
    .set({ ...(umfang === "alle_offen" ? { examDate: pruefungISO } : {}), updatedAt: new Date() })
    .where(eq(studyPlans.id, planId));

  const plan = await planLadenPerId(planId);
  return {
    plan: plan!,
    hinweis: ergebnis.hinweis,
    neu: ergebnis.neu.length,
    zusaetzlich: ergebnis.zusaetzlich,
    budgetErhoeht: ergebnis.budgetErhoeht,
    gestrichen: ergebnis.gestrichen,
  };
}

// Zeitbudget aendern. Das Budget allein zu speichern waere sinnlos: die
// bestehenden Tage blieben auf der alten Verteilung liegen und der Schueler
// saehe dieselbe "Knapp"-Meldung weiter. Darum setzt diese Funktion die
// Zahlen und verteilt anschliessend die offenen Einheiten neu -- das ist
// derselbe Vorgang wie "Ganzen Plan neu verteilen", nur mit dem neuen Budget
// als Grundlage. Erledigte Einheiten fasst neuVerteilen per "alle_offen"
// nicht an, der Fortschritt bleibt also stehen.
// Rueckgabe ist bewusst NeuVerteilenStoreErgebnis, damit die Planseite
// denselben Erfolgstext nutzen kann und "es wurde gestrichen" bzw. "Tage sind
// laenger geworden" auch hier zur Sprache kommt.
// Eine Quelle der Wahrheit fuer beide Enden der Kette: der Erstell-Flow, die
// Planseite, die POST-Route und diese Funktion klemmen sonst verschieden.
export const BUDGET_MIN = ZEITBUDGET_MIN;
export const BUDGET_MAX = ZEITBUDGET_MAX;

export async function budgetAendernImStore(
  planId: string,
  minutesWeekday: number,
  minutesWeekend: number,
): Promise<NeuVerteilenStoreErgebnis> {
  const gueltig = (n: number) => Number.isInteger(n) && n >= BUDGET_MIN && n <= BUDGET_MAX;
  if (!gueltig(minutesWeekday) || !gueltig(minutesWeekend)) {
    throw new LernplanStoreFehler(
      400,
      "budget",
      `Die Minuten müssen zwischen ${BUDGET_MIN} und ${BUDGET_MAX} liegen.`,
    );
  }

  const [planRow] = await db.select().from(studyPlans).where(eq(studyPlans.id, planId));
  if (!planRow) throw new LernplanStoreFehler(404, "kein_plan", "Plan gibt es nicht mehr.");

  await db
    .update(studyPlans)
    .set({ minutesWeekday, minutesWeekend, updatedAt: new Date() })
    .where(eq(studyPlans.id, planId));

  return neuVerteilenImStore(planId, "alle_offen");
}

// --- Sicherheit schreibt sich zurueck ----------------------------------------

// Wird von lib/study-store.ts (reviewCard) try/catch-isoliert aufgerufen --
// Kein Punkt oder keine Karte mit Review: nichts passiert.
export async function aktualisiereAusKarten(topicId: string): Promise<void> {
  const rows = await db
    .select({ box: studyCards.box })
    .from(studyCards)
    .where(and(eq(studyCards.topicId, topicId), isNull(studyCards.archivedAt), gte(studyCards.reviews, 1)));
  if (rows.length === 0) return;

  const sicherheit = sicherheitAusKarten(rows.map((r) => r.box));
  await db
    .update(studyPlanPoints)
    .set({ confidence: sicherheit, confidenceSource: "karten", confidenceAt: new Date() })
    .where(eq(studyPlanPoints.topicId, topicId));
}

// Wird von lib/tutor/session.ts try/catch-isoliert beim Fazit-Widget
// aufgerufen. Bei Simulation ohne `punkte` bekommen alle Punkte des Plans
// denselben Fazit-Wert.
export async function aktualisiereAusFazit(
  itemId: string,
  prozent: number | null,
  punkte?: { pointId: string; prozent: number }[],
): Promise<void> {
  const [item] = await db.select().from(studyPlanItems).where(eq(studyPlanItems.id, itemId));
  if (!item) throw new LernplanStoreFehler(404, "item_fehlt", "Einheit nicht gefunden.");

  const now = new Date();

  if (prozent === null) {
    await db.update(studyPlanItems).set({ doneAt: now }).where(eq(studyPlanItems.id, itemId));
    return;
  }

  const ergebnis = sicherheitAusFazit(prozent);
  await db.update(studyPlanItems).set({ doneAt: now, result: ergebnis }).where(eq(studyPlanItems.id, itemId));

  if (item.phase === "simulation") {
    if (punkte && punkte.length > 0) {
      for (const p of punkte) {
        await db
          .update(studyPlanPoints)
          .set({ confidence: sicherheitAusFazit(p.prozent), confidenceSource: "fazit", confidenceAt: now })
          .where(and(eq(studyPlanPoints.id, p.pointId), eq(studyPlanPoints.planId, item.planId)));
      }
    } else {
      await db
        .update(studyPlanPoints)
        .set({ confidence: ergebnis, confidenceSource: "fazit", confidenceAt: now })
        .where(eq(studyPlanPoints.planId, item.planId));
    }
  } else if (item.pointId) {
    await db
      .update(studyPlanPoints)
      .set({ confidence: ergebnis, confidenceSource: "fazit", confidenceAt: now })
      .where(eq(studyPlanPoints.id, item.pointId));
  }
}

// --- Tutor: Punkt mit Blaettern ----------------------------------------------

export async function punktMitBlaettern(
  itemId: string,
): Promise<{ punkt: PunktDTO; blaetter: { id: string; name: string }[]; plan: PlanDTO } | null> {
  const [item] = await db.select().from(studyPlanItems).where(eq(studyPlanItems.id, itemId));
  if (!item || !item.pointId) return null;

  const punkt = await ladePunktDTO(item.pointId);
  if (!punkt) return null;
  const plan = await planLadenPerId(punkt.planId);
  if (!plan) return null;

  return { punkt, blaetter: punkt.blaetter, plan };
}

// --- Bloecke in Pruefungen, Fokus, Cockpit -----------------------------------

export type LernplanBlock = {
  planId: string;
  total: number;
  done: number;
  sicherheit: number;
  // "ohne_test", wenn ALLE Punkte des Plans confidenceSource "ohne_test"
  // haben -- die Anzeige zeigt dann "Noch nicht eingeschaetzt" statt einer
  // Prozentzahl. Traegt mindestens ein Punkt eine echte Messung (diagnose/
  // karten/fazit/selbst), ist das Feld undefined: der Mittelwert stuetzt sich
  // auf mindestens eine echte Messung und beansprucht keine einzelne
  // Herkunft -- ihn zu verstecken waere die entgegengesetzte Luege. Siehe
  // sicherheitQuelle auf PunktDTO fuer die Herkunft je Punkt.
  sicherheitQuelle?: "ohne_test";
  heute: ItemDTO[];
  // true, wenn "heute" leer war und "heute" stattdessen die naechsten
  // offenen Einheiten traegt (Tag mit der kleinsten Faelligkeit unter den
  // noch nicht abgehakten) -- siehe SPEC.md "heute leer: naechste offene".
  heuteLeer: boolean;
};

// Genau zwei Queries plus (nur fuer Plaene ohne Einheit heute) eine dritte:
// Plaene mit Punkte-Sicherheits-Schnitt und Item-Aggregat (korrelierte
// Subqueries statt Join, kein Fan-out), dann die Items von heute fuer alle
// betroffenen Plaene auf einmal, zuletzt die naechsten offenen Einheiten der
// Plaene, die heute nichts haben.
export async function lernplanFuerAssignments(
  assignmentIds: string[],
  heuteISOWert: string,
): Promise<Map<string, LernplanBlock>> {
  const out = new Map<string, LernplanBlock>();
  if (assignmentIds.length === 0) return out;

  const sicherheitSql = sql<number>`(
    select coalesce(round(avg(confidence))::int, 50)
    from study_plan_points
    where study_plan_points.plan_id = study_plans.id
  )`.mapWith(Number);
  // Vacuous true fuer einen Plan ohne Punkte (kommt praktisch nicht vor, ein
  // Plan hat immer 1-20 Punkte) -- bool_and() liefert dann NULL, coalesce
  // faellt auf "alle (die es nicht gibt) sind ohne_test" zurueck, konsistent
  // mit "es gibt keine Messung".
  const alleOhneTestSql = sql<boolean>`(
    select coalesce(bool_and(confidence_source = 'ohne_test'), true)
    from study_plan_points
    where study_plan_points.plan_id = study_plans.id
  )`.mapWith(Boolean);
  const totalSql = sql<number>`(
    select count(*) from study_plan_items where study_plan_items.plan_id = study_plans.id
  )`.mapWith(Number);
  const doneSql = sql<number>`(
    select count(*) from study_plan_items
    where study_plan_items.plan_id = study_plans.id and study_plan_items.done_at is not null
  )`.mapWith(Number);

  const plans = await db
    .select({
      id: studyPlans.id,
      assignmentId: studyPlans.assignmentId,
      sicherheit: sicherheitSql,
      alleOhneTest: alleOhneTestSql,
      total: totalSql,
      done: doneSql,
    })
    .from(studyPlans)
    .where(inArray(studyPlans.assignmentId, assignmentIds));

  if (plans.length === 0) return out;
  const planIds = plans.map((p) => p.id);

  const heuteItems = await db
    .select({ item: studyPlanItems, punktTitel: studyPlanPoints.title, topicId: studyPlanPoints.topicId })
    .from(studyPlanItems)
    .leftJoin(studyPlanPoints, eq(studyPlanItems.pointId, studyPlanPoints.id))
    .where(and(inArray(studyPlanItems.planId, planIds), eq(studyPlanItems.date, heuteISOWert)));

  const itemsByPlan = new Map<string, ItemDTO[]>();
  for (const row of heuteItems) {
    const dto: ItemDTO = {
      id: row.item.id,
      planId: row.item.planId,
      pointId: row.item.pointId,
      punktTitel: row.punktTitel ?? null,
      topicId: row.topicId ?? null,
      date: row.item.date,
      position: row.item.position,
      phase: row.item.phase,
      minuten: row.item.minutes,
      doneAt: row.item.doneAt ? row.item.doneAt.toISOString() : null,
      result: row.item.result,
    };
    const list = itemsByPlan.get(row.item.planId) ?? [];
    list.push(dto);
    itemsByPlan.set(row.item.planId, list);
  }
  for (const list of itemsByPlan.values()) list.sort((a, b) => a.position - b.position);

  // Heute leer: naechste offene Einheiten nachladen -- der Tag mit der
  // kleinsten Faelligkeit unter den noch nicht abgehakten Items, egal ob
  // ueberfaellig oder erst in der Zukunft.
  const leerePlanIds = plans.filter((p) => (itemsByPlan.get(p.id)?.length ?? 0) === 0).map((p) => p.id);
  const heuteLeerSet = new Set(leerePlanIds);
  if (leerePlanIds.length > 0) {
    const offeneRows = await db
      .select({ item: studyPlanItems, punktTitel: studyPlanPoints.title, topicId: studyPlanPoints.topicId })
      .from(studyPlanItems)
      .leftJoin(studyPlanPoints, eq(studyPlanItems.pointId, studyPlanPoints.id))
      .where(and(inArray(studyPlanItems.planId, leerePlanIds), isNull(studyPlanItems.doneAt)));

    const naechsterTagByPlan = new Map<string, string>();
    for (const row of offeneRows) {
      const bisher = naechsterTagByPlan.get(row.item.planId);
      if (!bisher || row.item.date < bisher) naechsterTagByPlan.set(row.item.planId, row.item.date);
    }
    for (const row of offeneRows) {
      if (row.item.date !== naechsterTagByPlan.get(row.item.planId)) continue;
      const dto: ItemDTO = {
        id: row.item.id,
        planId: row.item.planId,
        pointId: row.item.pointId,
        punktTitel: row.punktTitel ?? null,
        topicId: row.topicId ?? null,
        date: row.item.date,
        position: row.item.position,
        phase: row.item.phase,
        minuten: row.item.minutes,
        doneAt: row.item.doneAt ? row.item.doneAt.toISOString() : null,
        result: row.item.result,
      };
      const list = itemsByPlan.get(row.item.planId) ?? [];
      list.push(dto);
      itemsByPlan.set(row.item.planId, list);
    }
    for (const planId of leerePlanIds) {
      itemsByPlan.get(planId)?.sort((a, b) => a.position - b.position);
    }
  }

  for (const p of plans) {
    out.set(p.assignmentId, {
      planId: p.id,
      total: p.total,
      done: p.done,
      sicherheit: p.sicherheit,
      ...(p.alleOhneTest ? { sicherheitQuelle: "ohne_test" as const } : {}),
      heute: itemsByPlan.get(p.id) ?? [],
      heuteLeer: heuteLeerSet.has(p.id),
    });
  }
  return out;
}

// Fuer das Bot-Lagebild: reine Anzahl aktiver Lernplaene, ohne die restlichen
// Daten zu laden -- eine count(*)-Query statt lernplanUebersicht(), das
// Punkte und Items aller Plaene mitzieht.
export async function lernplaeneAnzahl(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(studyPlans);
  return row?.n ?? 0;
}

export type LernenFuerTagEintrag = {
  planId: string;
  subjectId: string;
  assignmentId: string;
  examTitle: string;
  sicherheit: number;
  // Wie LernplanBlock.sicherheitQuelle: "ohne_test" nur, wenn ALLE Punkte des
  // Plans ohne echte Messung sind, sonst undefined (Mittelwert stuetzt sich
  // auf mindestens eine Messung, beansprucht aber keine einzelne Herkunft).
  sicherheitQuelle?: "ohne_test";
  items: ItemDTO[];
};

export async function lernenFuerTag(iso: string): Promise<LernenFuerTagEintrag[]> {
  const rows = await db
    .select({
      item: studyPlanItems,
      punktTitel: studyPlanPoints.title,
      topicId: studyPlanPoints.topicId,
      planId: studyPlans.id,
      subjectId: studyPlans.subjectId,
      assignmentId: studyPlans.assignmentId,
      examTitle: assignments.title,
    })
    .from(studyPlanItems)
    .innerJoin(studyPlans, eq(studyPlanItems.planId, studyPlans.id))
    .innerJoin(assignments, eq(studyPlans.assignmentId, assignments.id))
    .leftJoin(studyPlanPoints, eq(studyPlanItems.pointId, studyPlanPoints.id))
    .where(eq(studyPlanItems.date, iso));

  if (rows.length === 0) return [];

  const planIds = [...new Set(rows.map((r) => r.planId))];
  const sicherheitRows = await db
    .select({
      planId: studyPlanPoints.planId,
      sicherheit: sql<number>`coalesce(round(avg(confidence))::int, 50)`.mapWith(Number),
      // Vacuous true fuer eine leere Gruppe kommt hier nicht vor (groupBy
      // liefert nur Plaene mit mindestens einem Punkt) -- rein zur Konsistenz
      // mit lernplanFuerAssignments' alleOhneTestSql.
      alleOhneTest: sql<boolean>`coalesce(bool_and(confidence_source = 'ohne_test'), true)`.mapWith(Boolean),
    })
    .from(studyPlanPoints)
    .where(inArray(studyPlanPoints.planId, planIds))
    .groupBy(studyPlanPoints.planId);
  const sicherheitByPlan = new Map(sicherheitRows.map((r) => [r.planId, r.sicherheit]));
  const sicherheitQuelleByPlan = new Map<string, "ohne_test" | undefined>(
    sicherheitRows.map((r) => [r.planId, r.alleOhneTest ? ("ohne_test" as const) : undefined]),
  );

  const byPlan = new Map<string, { subjectId: string; assignmentId: string; examTitle: string; items: ItemDTO[] }>();
  for (const row of rows) {
    const dto: ItemDTO = {
      id: row.item.id,
      planId: row.item.planId,
      pointId: row.item.pointId,
      punktTitel: row.punktTitel ?? null,
      topicId: row.topicId ?? null,
      date: row.item.date,
      position: row.item.position,
      phase: row.item.phase,
      minuten: row.item.minutes,
      doneAt: row.item.doneAt ? row.item.doneAt.toISOString() : null,
      result: row.item.result,
    };
    const entry = byPlan.get(row.planId) ?? {
      subjectId: row.subjectId,
      assignmentId: row.assignmentId,
      examTitle: row.examTitle,
      items: [] as ItemDTO[],
    };
    entry.items.push(dto);
    byPlan.set(row.planId, entry);
  }

  return [...byPlan.entries()].map(([planId, v]) => ({
    planId,
    subjectId: v.subjectId,
    assignmentId: v.assignmentId,
    examTitle: v.examTitle,
    sicherheit: sicherheitByPlan.get(planId) ?? 50,
    ...(sicherheitQuelleByPlan.get(planId) === "ohne_test" ? { sicherheitQuelle: "ohne_test" as const } : {}),
    items: v.items.slice().sort((a, b) => a.position - b.position),
  }));
}

// --- Bot-Tool lernplan_lesen --------------------------------------------------

export type LernplanUebersichtEintrag = {
  planId: string;
  assignmentId: string;
  subjectId: string;
  subjectName: string;
  examTitle: string;
  examDate: string;
  tageBis: number;
  total: number;
  done: number;
  punkte: { titel: string; sicherheit: number; quelle: SicherheitQuelle }[];
  heute: ItemDTO[];
  ueberfaellig: ItemDTO[];
};

export async function lernplanUebersicht(fachName?: string): Promise<LernplanUebersichtEintrag[]> {
  const heute = heuteISO();

  let rows = await db
    .select({ plan: studyPlans, subjectName: subjects.name, examTitle: assignments.title })
    .from(studyPlans)
    .innerJoin(subjects, eq(studyPlans.subjectId, subjects.id))
    .innerJoin(assignments, eq(studyPlans.assignmentId, assignments.id));

  if (fachName) {
    const wanted = fachName.trim().toLowerCase();
    rows = rows.filter((r) => r.subjectName.toLowerCase().includes(wanted));
  }
  if (rows.length === 0) return [];

  const planIds = rows.map((r) => r.plan.id);
  const points = await db.select().from(studyPlanPoints).where(inArray(studyPlanPoints.planId, planIds));
  const items = await db.select().from(studyPlanItems).where(inArray(studyPlanItems.planId, planIds));

  const pointsByPlan = new Map<string, StudyPlanPoint[]>();
  for (const p of points) {
    const list = pointsByPlan.get(p.planId) ?? [];
    list.push(p);
    pointsByPlan.set(p.planId, list);
  }
  const itemsByPlan = new Map<string, StudyPlanItem[]>();
  for (const i of items) {
    const list = itemsByPlan.get(i.planId) ?? [];
    list.push(i);
    itemsByPlan.set(i.planId, list);
  }
  const pointTitleById = new Map(points.map((p) => [p.id, p.title]));
  const pointTopicById = new Map(points.map((p) => [p.id, p.topicId]));

  const toDto = (i: StudyPlanItem): ItemDTO => ({
    id: i.id,
    planId: i.planId,
    pointId: i.pointId,
    punktTitel: i.pointId ? (pointTitleById.get(i.pointId) ?? null) : null,
    topicId: i.pointId ? (pointTopicById.get(i.pointId) ?? null) : null,
    date: i.date,
    position: i.position,
    phase: i.phase,
    minuten: i.minutes,
    doneAt: i.doneAt ? i.doneAt.toISOString() : null,
    result: i.result,
  });

  return rows.map((r) => {
    const planItems = itemsByPlan.get(r.plan.id) ?? [];
    const planPoints = pointsByPlan.get(r.plan.id) ?? [];
    return {
      planId: r.plan.id,
      assignmentId: r.plan.assignmentId,
      subjectId: r.plan.subjectId,
      subjectName: r.subjectName,
      examTitle: r.examTitle,
      examDate: r.plan.examDate,
      tageBis: daysBetween(heute, r.plan.examDate),
      total: planItems.length,
      done: planItems.filter((i) => i.doneAt !== null).length,
      punkte: planPoints.map((p) => ({ titel: p.title, sicherheit: p.confidence, quelle: p.confidenceSource })),
      heute: planItems
        .filter((i) => i.date === heute)
        .map(toDto)
        .sort((a, b) => a.position - b.position),
      ueberfaellig: planItems
        .filter((i) => i.date < heute && i.doneAt === null)
        .map(toDto)
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  });
}
