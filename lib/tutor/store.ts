// Gedaechtnis des Tutors: Sessions und ihre Nachrichten (tutor_conversations,
// tutor_messages). Reine Persistenz, nach dem Muster von lib/bot/store.ts --
// die Chat-Logik selbst steht in lib/tutor/session.ts (Slice 2).

import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tutorConversations,
  tutorMessages,
  type TutorMessageRole,
  type TutorModus,
} from "@/lib/db/schema";
import type {
  AufgabeStatus,
  Checkliste,
  TutorConversationDTO,
  TutorErgebnis,
  TutorMessageDTO,
} from "@/lib/tutor/types";

function toConversationDTO(row: typeof tutorConversations.$inferSelect): TutorConversationDTO {
  return {
    id: row.id,
    topicId: row.topicId,
    subjectId: row.subjectId,
    modus: row.modus,
    cardId: row.cardId,
    itemId: row.itemId,
    assignmentId: row.assignmentId,
    checkliste: (row.checkliste as Checkliste | null) ?? null,
    ergebnis: (row.ergebnis as TutorErgebnis | null) ?? null,
    kartenAngelegt: row.kartenAngelegt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
  };
}

function toMessageDTO(row: typeof tutorMessages.$inferSelect): TutorMessageDTO {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    toolName: row.toolName,
    toolArgs: row.toolArgs,
    toolResult: row.toolResult,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createTutorConversation(data: {
  topicId: string | null;
  subjectId: string;
  modus: TutorModus;
  cardId?: string | null;
  itemId?: string | null;
  assignmentId?: string | null;
}): Promise<TutorConversationDTO> {
  const [row] = await db
    .insert(tutorConversations)
    .values({
      topicId: data.topicId,
      subjectId: data.subjectId,
      modus: data.modus,
      cardId: data.cardId ?? null,
      itemId: data.itemId ?? null,
      assignmentId: data.assignmentId ?? null,
    })
    .returning();
  return toConversationDTO(row);
}

export async function getTutorConversation(id: string): Promise<TutorConversationDTO | undefined> {
  const [row] = await db.select().from(tutorConversations).where(eq(tutorConversations.id, id));
  return row ? toConversationDTO(row) : undefined;
}

// Neueste zuerst -- fuer den Sessions-Block auf der Themenseite.
export async function listTutorConversations(topicId: string): Promise<TutorConversationDTO[]> {
  const rows = await db
    .select()
    .from(tutorConversations)
    .where(eq(tutorConversations.topicId, topicId))
    .orderBy(desc(tutorConversations.createdAt));
  return rows.map(toConversationDTO);
}

export async function listTutorMessages(conversationId: string): Promise<TutorMessageDTO[]> {
  const rows = await db
    .select()
    .from(tutorMessages)
    .where(eq(tutorMessages.conversationId, conversationId))
    .orderBy(asc(tutorMessages.createdAt));
  return rows.map(toMessageDTO);
}

export async function appendTutorMessage(
  conversationId: string,
  data: {
    role: TutorMessageRole;
    content: string;
    toolName?: string | null;
    toolArgs?: unknown;
    toolResult?: unknown;
  },
): Promise<TutorMessageDTO> {
  const [row] = await db
    .insert(tutorMessages)
    .values({
      conversationId,
      role: data.role,
      content: data.content,
      toolName: data.toolName ?? null,
      toolArgs: data.toolArgs ?? null,
      toolResult: data.toolResult ?? null,
    })
    .returning();
  await db
    .update(tutorConversations)
    .set({ updatedAt: new Date() })
    .where(eq(tutorConversations.id, conversationId));
  return toMessageDTO(row);
}

export async function setCheckliste(id: string, checkliste: Checkliste): Promise<TutorConversationDTO | undefined> {
  const [row] = await db
    .update(tutorConversations)
    .set({ checkliste, updatedAt: new Date() })
    .where(eq(tutorConversations.id, id))
    .returning();
  return row ? toConversationDTO(row) : undefined;
}

// Setzt den Status einer Aufgabe in der gespeicherten Checkliste. Liefert die
// aktualisierte Checkliste, oder null, wenn die Konversation keine Checkliste
// hat oder die Nummer unbekannt ist.
export async function setAufgabeStatus(
  id: string,
  nr: number,
  status: AufgabeStatus,
  punkte?: number,
): Promise<Checkliste | null> {
  const conversation = await getTutorConversation(id);
  if (!conversation?.checkliste) return null;

  const aufgaben = conversation.checkliste.aufgaben;
  const index = aufgaben.findIndex((a) => a.nr === nr);
  if (index === -1) return null;

  const updatedAufgaben = aufgaben.map((a, i) =>
    i === index ? { ...a, status, ...(punkte !== undefined ? { punkte } : {}) } : a,
  );
  const checkliste: Checkliste = { ...conversation.checkliste, aufgaben: updatedAufgaben };

  await db
    .update(tutorConversations)
    .set({ checkliste, updatedAt: new Date() })
    .where(eq(tutorConversations.id, id));

  return checkliste;
}

export async function setErgebnis(id: string, ergebnis: TutorErgebnis): Promise<TutorConversationDTO | undefined> {
  const [row] = await db
    .update(tutorConversations)
    .set({ ergebnis, endedAt: new Date(), updatedAt: new Date() })
    .where(eq(tutorConversations.id, id))
    .returning();
  return row ? toConversationDTO(row) : undefined;
}

export async function markKartenAngelegt(id: string): Promise<TutorConversationDTO | undefined> {
  const [row] = await db
    .update(tutorConversations)
    .set({ kartenAngelegt: true, updatedAt: new Date() })
    .where(eq(tutorConversations.id, id))
    .returning();
  return row ? toConversationDTO(row) : undefined;
}

export async function deleteTutorConversation(id: string): Promise<void> {
  await db.delete(tutorConversations).where(eq(tutorConversations.id, id));
}
