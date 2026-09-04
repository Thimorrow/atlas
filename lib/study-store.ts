// Store des Lernbereichs (/lernen): Themen, Karteikarten, Reviews und die
// Uebersicht je Fach. Reine DB-Zugriffe -- Leitner-Logik (schedule, progress,
// planForExam, readiness, queueFor, heutePlan) liegt in lib/lernen.ts und wird
// hier nur angewendet. Die DTO-Formen kommen aus lib/lernen-types.ts, damit
// Store, Client und reine Logik dieselben Typen teilen.

import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tagesbeginn } from "@/lib/zeit";
import {
  studyCards,
  studyReviews,
  studyTopics,
  type NewStudyCard,
  type NewStudyTopic,
  type StudyCard,
  type StudyCardKind,
  type StudyCardSource,
  type StudyTopic,
} from "@/lib/db/schema";
import { isExamPageType, localISO, type AssignmentDTO } from "@/lib/assignments-view";
import { listAssignments } from "@/lib/assignment-store";
import { getSubject, listNotes, listSubjects } from "@/lib/subject-store";
import { listFiles } from "@/lib/subject-file-store";
import {
  daysBetween,
  heutePlan,
  lernartFor,
  planForExam,
  progressOf,
  readiness,
  schedule,
  type HeuteThema,
} from "@/lib/lernen";
import type {
  HeuteItem,
  OverviewResponse,
  PlanDTO,
  PruefungOverview,
  PruefungRef,
  ProgressDTO,
  StudyCardDTO,
  SubjectDetail,
  SubjectOverview,
  TopicDTO,
  TopicWithProgress,
} from "@/lib/lernen-types";

// Re-exportiert, damit `import type { SubjectDetail, StudyCardDTO } from
// "@/lib/study-store"` weiter funktioniert -- die eigentliche Definition
// steht in lib/lernen-types.ts.
export type {
  HeuteItem,
  OverviewResponse,
  PlanDTO,
  PruefungOverview,
  PruefungRef,
  ProgressDTO,
  StudyCardDTO,
  SubjectDetail,
  SubjectOverview,
  TopicDTO,
  TopicWithProgress,
} from "@/lib/lernen-types";

function toDTO(row: StudyCard): StudyCardDTO {
  return {
    id: row.id,
    subjectId: row.subjectId,
    topicId: row.topicId,
    kind: row.kind,
    question: row.question,
    answer: row.answer,
    source: row.source,
    sourceRef: row.sourceRef,
    box: row.box,
    due: row.due,
    reviews: row.reviews,
    lapses: row.lapses,
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTopicDTO(row: StudyTopic): TopicDTO {
  return {
    id: row.id,
    subjectId: row.subjectId,
    title: row.title,
    summary: row.summary,
    assignmentId: row.assignmentId,
    position: row.position,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// --- Themen --------------------------------------------------------------

export async function listTopics(
  subjectId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<TopicDTO[]> {
  const where = opts.includeArchived
    ? eq(studyTopics.subjectId, subjectId)
    : and(eq(studyTopics.subjectId, subjectId), isNull(studyTopics.archivedAt));
  const rows = await db.select().from(studyTopics).where(where);
  return rows.map(toTopicDTO).sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, "de"));
}

export async function getTopic(id: string): Promise<TopicDTO | undefined> {
  const [row] = await db.select().from(studyTopics).where(eq(studyTopics.id, id));
  return row ? toTopicDTO(row) : undefined;
}

export async function createTopic(data: {
  subjectId: string;
  title: string;
  assignmentId?: string | null;
}): Promise<TopicDTO> {
  const values: NewStudyTopic = {
    subjectId: data.subjectId,
    title: data.title,
    assignmentId: data.assignmentId ?? null,
  };
  const [row] = await db.insert(studyTopics).values(values).returning();
  return toTopicDTO(row);
}

export async function updateTopic(
  id: string,
  patch: { title?: string; summary?: string; assignmentId?: string | null; archivedAt?: string | null },
): Promise<TopicDTO | null> {
  const set: Partial<NewStudyTopic> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.summary !== undefined) set.summary = patch.summary;
  if (patch.assignmentId !== undefined) set.assignmentId = patch.assignmentId;
  if (patch.archivedAt !== undefined)
    set.archivedAt = patch.archivedAt === null ? null : new Date(patch.archivedAt);

  if (Object.keys(set).length === 0) {
    const existing = await getTopic(id);
    return existing ?? null;
  }

  const [row] = await db
    .update(studyTopics)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(studyTopics.id, id))
    .returning();
  return row ? toTopicDTO(row) : null;
}

// Karten des Themas behalten ihre topic_id nicht (FK "set null"), sie fallen
// zurueck in "Allgemein" -- geloescht wird hier nur das Thema selbst.
export async function deleteTopic(id: string): Promise<boolean> {
  const rows = await db.delete(studyTopics).where(eq(studyTopics.id, id)).returning({ id: studyTopics.id });
  return rows.length > 0;
}

// --- Karten ------------------------------------------------------------------

export async function listCards(
  subjectId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<StudyCardDTO[]> {
  const where = opts.includeArchived
    ? eq(studyCards.subjectId, subjectId)
    : and(eq(studyCards.subjectId, subjectId), isNull(studyCards.archivedAt));
  const rows = await db.select().from(studyCards).where(where);
  return rows.map(toDTO);
}

export async function getCard(id: string): Promise<StudyCardDTO | undefined> {
  const [row] = await db.select().from(studyCards).where(eq(studyCards.id, id));
  return row ? toDTO(row) : undefined;
}

export async function createCards(
  subjectId: string,
  cards: { question: string; answer: string; kind?: StudyCardKind }[],
  source: StudyCardSource,
  sourceRef: string | null = null,
  topicId: string | null = null,
): Promise<StudyCardDTO[]> {
  if (cards.length === 0) return [];
  const today = localISO();
  const values: NewStudyCard[] = cards.map((c) => ({
    subjectId,
    topicId,
    kind: c.kind ?? "wissen",
    question: c.question,
    answer: c.answer,
    source,
    sourceRef,
    due: today,
  }));
  const rows = await db.insert(studyCards).values(values).returning();
  return rows.map(toDTO);
}

export async function updateCard(
  id: string,
  patch: {
    question?: string;
    answer?: string;
    topicId?: string | null;
    kind?: StudyCardKind;
    archivedAt?: string | null;
  },
): Promise<StudyCardDTO | null> {
  const set: Partial<NewStudyCard> = {};
  if (patch.question !== undefined) set.question = patch.question;
  if (patch.answer !== undefined) set.answer = patch.answer;
  if (patch.topicId !== undefined) set.topicId = patch.topicId;
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.archivedAt !== undefined)
    set.archivedAt = patch.archivedAt === null ? null : new Date(patch.archivedAt);

  if (Object.keys(set).length === 0) {
    const existing = await getCard(id);
    return existing ?? null;
  }

  const [row] = await db
    .update(studyCards)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(studyCards.id, id))
    .returning();
  return row ? toDTO(row) : null;
}

export async function deleteCard(id: string): Promise<boolean> {
  const rows = await db.delete(studyCards).where(eq(studyCards.id, id)).returning({ id: studyCards.id });
  return rows.length > 0;
}

// Wendet die Leitner-Umsetzung an, schreibt die Karte fort und legt eine
// study_reviews-Zeile an.
export async function reviewCard(id: string, correct: boolean): Promise<StudyCardDTO | null> {
  const [card] = await db.select().from(studyCards).where(eq(studyCards.id, id));
  if (!card) return null;

  const today = localISO();
  const next = schedule(card, correct, today);

  const [updated] = await db
    .update(studyCards)
    .set({
      box: next.box,
      due: next.due,
      reviews: card.reviews + 1,
      lapses: correct ? card.lapses : card.lapses + 1,
      lastReviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(studyCards.id, id))
    .returning();

  await db.insert(studyReviews).values({ cardId: id, subjectId: card.subjectId, correct });

  // Sicherheit schreibt sich zurueck (SPEC.md): dynamischer Import statt
  // statischem, weil lib/lernplan-store.ts umgekehrt aus dieser Datei
  // importiert (createTopic/updateTopic/deleteTopic) -- ein statischer Import
  // hier waere ein Zirkel. Fehler duerfen das Review nicht kaputt machen.
  if (card.topicId) {
    try {
      const { aktualisiereAusKarten } = await import("@/lib/lernplan-store");
      await aktualisiereAusKarten(card.topicId);
    } catch (err) {
      console.warn("[lernplan] Sicherheit aus Karten:", err);
    }
  }

  return updated ? toDTO(updated) : null;
}

// --- Hilfsfunktionen ----------------------------------------------------------

function startOfTodayLocal(): Date {
  return tagesbeginn();
}

function pruefungRefFor(a: AssignmentDTO, today: string): PruefungRef {
  return {
    id: a.id,
    title: a.title,
    type: a.type,
    dueDate: a.dueDate!,
    tageBis: daysBetween(today, a.dueDate!),
  };
}

// --- Uebersicht ----------------------------------------------------------

export async function overview(): Promise<OverviewResponse> {
  const today = localISO();
  const todayStart = startOfTodayLocal();

  const [subjectsList, allCards, allTopics, allReviews, allAssignments] = await Promise.all([
    listSubjects("active"),
    db.select().from(studyCards).where(isNull(studyCards.archivedAt)),
    db.select().from(studyTopics).where(isNull(studyTopics.archivedAt)),
    db.select().from(studyReviews).where(gte(studyReviews.reviewedAt, todayStart)),
    listAssignments({ includeCompleted: false }),
  ]);

  const cardsBySubject = new Map<string, StudyCard[]>();
  for (const c of allCards) {
    const list = cardsBySubject.get(c.subjectId);
    if (list) list.push(c);
    else cardsBySubject.set(c.subjectId, [c]);
  }

  const topicsBySubject = new Map<string, StudyTopic[]>();
  for (const t of allTopics) {
    const list = topicsBySubject.get(t.subjectId);
    if (list) list.push(t);
    else topicsBySubject.set(t.subjectId, [t]);
  }

  const reviewCountBySubject = new Map<string, number>();
  for (const r of allReviews) {
    reviewCountBySubject.set(r.subjectId, (reviewCountBySubject.get(r.subjectId) ?? 0) + 1);
  }

  // Anstehende Pruefungen je id (fuer Themen-Zuordnung ueber assignmentId).
  const examById = new Map<string, AssignmentDTO>();
  for (const a of allAssignments) {
    if (!a.subjectId || !isExamPageType(a.type) || !a.dueDate || a.dueDate < today) continue;
    examById.set(a.id, a);
  }

  const heuteThemen: HeuteThema[] = [];
  const pruefungen: PruefungOverview[] = [];

  for (const s of subjectsList) {
    const cards = cardsBySubject.get(s.id) ?? [];
    const topics = topicsBySubject.get(s.id) ?? [];
    const cardsByTopic = new Map<string | null, StudyCard[]>();
    for (const c of cards) {
      const list = cardsByTopic.get(c.topicId);
      if (list) list.push(c);
      else cardsByTopic.set(c.topicId, [c]);
    }

    for (const t of topics) {
      const topicCards = cardsByTopic.get(t.id) ?? [];
      const exam = t.assignmentId ? examById.get(t.assignmentId) : undefined;
      const pruefung = exam ? pruefungRefFor(exam, today) : null;
      heuteThemen.push({
        subjectId: s.id,
        subjectName: s.name,
        color: s.color,
        topicId: t.id,
        titel: t.title,
        pruefung,
        cards: topicCards,
      });
    }

    const ohneThema = cardsByTopic.get(null) ?? [];
    if (ohneThema.length > 0) {
      heuteThemen.push({
        subjectId: s.id,
        subjectName: s.name,
        color: s.color,
        topicId: null,
        titel: "Allgemein",
        pruefung: null,
        cards: ohneThema,
      });
    }
  }

  // Pruefungsuebersicht: je anstehender Pruefung ihre zugeordneten Themen mit
  // Fortschritt.
  for (const exam of examById.values()) {
    const subject = subjectsList.find((s) => s.id === exam.subjectId);
    if (!subject) continue;
    const topics = (topicsBySubject.get(subject.id) ?? []).filter((t) => t.assignmentId === exam.id);
    if (topics.length === 0) continue;

    const cards = cardsBySubject.get(subject.id) ?? [];
    const cardsByTopic = new Map<string, StudyCard[]>();
    for (const c of cards) {
      if (!c.topicId) continue;
      const list = cardsByTopic.get(c.topicId);
      if (list) list.push(c);
      else cardsByTopic.set(c.topicId, [c]);
    }

    const themen = topics.map((t) => {
      const topicCards = (cardsByTopic.get(t.id) ?? []).map(toDTO);
      return { id: t.id, title: t.title, total: topicCards.length, bereit: readiness(topicCards) };
    });
    const alleKarten = topics.flatMap((t) => (cardsByTopic.get(t.id) ?? []).map(toDTO));

    pruefungen.push({
      ...pruefungRefFor(exam, today),
      subjectId: subject.id,
      subjectName: subject.name,
      color: subject.color,
      themen,
      total: alleKarten.length,
      bereit: readiness(alleKarten),
    });
  }
  pruefungen.sort((a, b) => a.tageBis - b.tageBis);

  const faecher: SubjectOverview[] = subjectsList.map((s) => {
    const cards = (cardsBySubject.get(s.id) ?? []).map(toDTO);
    const p = progressOf(cards, today);
    const upcoming = allAssignments
      .filter((a) => a.subjectId === s.id && isExamPageType(a.type) && a.dueDate && a.dueDate >= today)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    const exam = upcoming[0];
    const naechstePruefung = exam ? pruefungRefFor(exam, today) : null;
    const plan = exam ? planForExam(cards, exam.dueDate!, today) : null;

    return {
      subjectId: s.id,
      name: s.name,
      color: s.color,
      lernart: s.lernart ?? lernartFor(s.name),
      progress: p,
      heuteGelernt: reviewCountBySubject.get(s.id) ?? 0,
      naechstePruefung,
      plan,
    };
  });

  const heute = heutePlan(today, heuteThemen);

  return {
    today,
    heuteGelernt: allReviews.length,
    heute,
    pruefungen,
    faecher,
  };
}

export async function subjectDetail(subjectId: string): Promise<SubjectDetail | null> {
  const subject = await getSubject(subjectId);
  if (!subject) return null;

  const today = localISO();
  const [cards, topics, dateien, assignments, notizen] = await Promise.all([
    listCards(subjectId),
    listTopics(subjectId),
    listFiles(subjectId),
    listAssignments({ subjectId, includeCompleted: false }),
    listNotes(subjectId),
  ]);

  const exams = assignments
    .filter((a) => isExamPageType(a.type) && a.dueDate && a.dueDate >= today)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const exam = exams[0];

  const naechstePruefung = exam ? pruefungRefFor(exam, today) : null;
  const plan = exam ? planForExam(cards, exam.dueDate!, today) : null;
  const pruefungen = exams.map((a) => pruefungRefFor(a, today));

  const cardsByTopic = new Map<string | null, StudyCardDTO[]>();
  for (const c of cards) {
    const list = cardsByTopic.get(c.topicId);
    if (list) list.push(c);
    else cardsByTopic.set(c.topicId, [c]);
  }

  const themen: TopicWithProgress[] = topics.map((t) => ({
    ...t,
    progress: progressOf(cardsByTopic.get(t.id) ?? [], today),
  }));

  const lernart = subject.lernart ?? lernartFor(subject.name);

  return {
    subject: {
      id: subject.id,
      name: subject.name,
      color: subject.color,
      curriculum: subject.curriculum,
      lernart,
      lernartAuto: subject.lernart === null,
    },
    cards,
    themen,
    ohneThema: progressOf(cardsByTopic.get(null) ?? [], today),
    progress: progressOf(cards, today),
    naechstePruefung,
    pruefungen,
    plan,
    dateien: dateien.map((f) => ({ id: f.id, name: f.name, contentType: f.contentType })),
    notizen: notizen.map((n) => ({ id: n.id, title: n.title })),
  };
}
