// Store des Lernbereichs (/lernen): Karteikarten, Reviews und die Uebersicht
// je Fach. Reine DB-Zugriffe -- Leitner-Logik (schedule, progress, planForExam)
// liegt in lib/lernen.ts und wird hier nur angewendet.

import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  studyCards,
  studyReviews,
  type NewStudyCard,
  type StudyCard,
  type StudyCardSource,
} from "@/lib/db/schema";
import { isExamPageType, localISO } from "@/lib/assignments-view";
import { listAssignments } from "@/lib/assignment-store";
import { getSubject, listSubjects } from "@/lib/subject-store";
import { listFiles } from "@/lib/subject-file-store";
import { daysBetween, planForExam, progress, schedule } from "@/lib/lernen";

export type StudyCardDTO = {
  id: string;
  subjectId: string;
  question: string;
  answer: string;
  source: StudyCardSource;
  sourceRef: string | null;
  box: number;
  due: string;
  reviews: number;
  lapses: number;
  lastReviewedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toDTO(row: StudyCard): StudyCardDTO {
  return {
    id: row.id,
    subjectId: row.subjectId,
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
  cards: { question: string; answer: string }[],
  source: StudyCardSource,
  sourceRef: string | null = null,
): Promise<StudyCardDTO[]> {
  if (cards.length === 0) return [];
  const today = localISO();
  const values: NewStudyCard[] = cards.map((c) => ({
    subjectId,
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
  patch: { question?: string; answer?: string; archivedAt?: string | null },
): Promise<StudyCardDTO | null> {
  const set: Partial<NewStudyCard> = {};
  if (patch.question !== undefined) set.question = patch.question;
  if (patch.answer !== undefined) set.answer = patch.answer;
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

  return updated ? toDTO(updated) : null;
}

// --- Uebersicht ----------------------------------------------------------

export type SubjectOverview = {
  subjectId: string;
  name: string;
  color: string | null;
  total: number;
  faellig: number;
  neu: number;
  lernend: number;
  sicher: number;
  heuteGelernt: number;
  naechstePruefung: { id: string; title: string; type: string; dueDate: string; tageBis: number } | null;
  plan: { tageBis: number; proTag: number; offen: number } | null;
};

function startOfTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function overview(): Promise<{ today: string; heuteGelernt: number; faecher: SubjectOverview[] }> {
  const today = localISO();
  const todayStart = startOfTodayLocal();

  const [subjects, allCards, allReviews, allAssignments] = await Promise.all([
    listSubjects("active"),
    db.select().from(studyCards).where(isNull(studyCards.archivedAt)),
    db.select().from(studyReviews).where(gte(studyReviews.reviewedAt, todayStart)),
    listAssignments({ includeCompleted: false }),
  ]);

  const cardsBySubject = new Map<string, StudyCard[]>();
  for (const c of allCards) {
    const list = cardsBySubject.get(c.subjectId);
    if (list) list.push(c);
    else cardsBySubject.set(c.subjectId, [c]);
  }

  const reviewCountBySubject = new Map<string, number>();
  for (const r of allReviews) {
    reviewCountBySubject.set(r.subjectId, (reviewCountBySubject.get(r.subjectId) ?? 0) + 1);
  }

  // Fruehste anstehende Pruefung je Fach.
  const examBySubject = new Map<string, (typeof allAssignments)[number]>();
  for (const a of allAssignments) {
    if (!a.subjectId || !isExamPageType(a.type) || !a.dueDate || a.dueDate < today) continue;
    const current = examBySubject.get(a.subjectId);
    if (!current || a.dueDate < current.dueDate!) examBySubject.set(a.subjectId, a);
  }

  const faecher: SubjectOverview[] = subjects.map((s) => {
    const cards = cardsBySubject.get(s.id) ?? [];
    const cardsDTO = cards.map(toDTO);
    const p = progress(cardsDTO);
    const faellig = cardsDTO.filter((c) => c.due <= today).length;
    const exam = examBySubject.get(s.id);
    const naechstePruefung = exam
      ? {
          id: exam.id,
          title: exam.title,
          type: exam.type,
          dueDate: exam.dueDate!,
          tageBis: daysBetween(today, exam.dueDate!),
        }
      : null;
    const plan = exam ? planForExam(cardsDTO, exam.dueDate!, today) : null;

    return {
      subjectId: s.id,
      name: s.name,
      color: s.color,
      total: p.total,
      faellig,
      neu: p.neu,
      lernend: p.lernend,
      sicher: p.sicher,
      heuteGelernt: reviewCountBySubject.get(s.id) ?? 0,
      naechstePruefung,
      plan,
    };
  });

  const heuteGelernt = allReviews.length;

  return { today, heuteGelernt, faecher };
}

export type SubjectDetail = {
  subject: { id: string; name: string; color: string | null; curriculum: string | null };
  cards: StudyCardDTO[];
  progress: { total: number; neu: number; lernend: number; sicher: number };
  faellig: number;
  naechstePruefung: { id: string; title: string; type: string; dueDate: string; tageBis: number } | null;
  plan: { tageBis: number; proTag: number; offen: number } | null;
  dateien: { id: string; name: string; contentType: string }[];
};

export async function subjectDetail(subjectId: string): Promise<SubjectDetail | null> {
  const subject = await getSubject(subjectId);
  if (!subject) return null;

  const today = localISO();
  const [cards, dateien, assignments] = await Promise.all([
    listCards(subjectId),
    listFiles(subjectId),
    listAssignments({ subjectId, includeCompleted: false }),
  ]);

  const exams = assignments
    .filter((a) => isExamPageType(a.type) && a.dueDate && a.dueDate >= today)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const exam = exams[0];

  const naechstePruefung = exam
    ? {
        id: exam.id,
        title: exam.title,
        type: exam.type,
        dueDate: exam.dueDate!,
        tageBis: daysBetween(today, exam.dueDate!),
      }
    : null;
  const plan = exam ? planForExam(cards, exam.dueDate!, today) : null;

  return {
    subject: { id: subject.id, name: subject.name, color: subject.color, curriculum: subject.curriculum },
    cards,
    progress: progress(cards),
    faellig: cards.filter((c) => c.due <= today).length,
    naechstePruefung,
    plan,
    dateien: dateien.map((f) => ({ id: f.id, name: f.name, contentType: f.contentType })),
  };
}
