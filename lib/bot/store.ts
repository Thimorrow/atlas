// Gedaechtnis des Bots: Gespraeche und ihre Nachrichten (bot_conversations,
// bot_messages). Reine Persistenz -- die Chat-Logik selbst steht in
// app/api/bot/route.ts.

import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { botConversations, botMessages, type BotMessageRole } from "@/lib/db/schema";

export type MessageDTO = {
  id: string;
  role: BotMessageRole;
  content: string;
  toolName: string | null;
  toolArgs: unknown;
  toolResult: unknown;
  createdAt: string;
};

export type ConversationDTO = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

function toMessageDTO(row: typeof botMessages.$inferSelect): MessageDTO {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    toolName: row.toolName,
    toolArgs: row.toolArgs,
    toolResult: row.toolResult,
    createdAt: row.createdAt.toISOString(),
  };
}

function toConversationDTO(row: typeof botConversations.$inferSelect): ConversationDTO {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createConversation(title?: string | null): Promise<ConversationDTO> {
  const [row] = await db.insert(botConversations).values({ title: title ?? null }).returning();
  return toConversationDTO(row);
}

export async function getConversation(id: string): Promise<ConversationDTO | undefined> {
  const [row] = await db.select().from(botConversations).where(eq(botConversations.id, id));
  return row ? toConversationDTO(row) : undefined;
}

// Titel nur setzen, wenn noch keiner da ist -- die erste Nutzerfrage, gekuerzt.
export async function setTitleIfEmpty(id: string, title: string): Promise<void> {
  const conversation = await getConversation(id);
  if (!conversation || conversation.title) return;
  await db
    .update(botConversations)
    .set({ title: title.slice(0, 80), updatedAt: new Date() })
    .where(eq(botConversations.id, id));
}

export async function touchConversation(id: string): Promise<void> {
  await db.update(botConversations).set({ updatedAt: new Date() }).where(eq(botConversations.id, id));
}

export async function listMessages(conversationId: string): Promise<MessageDTO[]> {
  const rows = await db
    .select()
    .from(botMessages)
    .where(eq(botMessages.conversationId, conversationId))
    .orderBy(asc(botMessages.createdAt));
  return rows.map(toMessageDTO);
}

export async function appendMessage(
  conversationId: string,
  data: {
    role: BotMessageRole;
    content: string;
    toolName?: string | null;
    toolArgs?: unknown;
    toolResult?: unknown;
  },
): Promise<MessageDTO> {
  const [row] = await db
    .insert(botMessages)
    .values({
      conversationId,
      role: data.role,
      content: data.content,
      toolName: data.toolName ?? null,
      toolArgs: data.toolArgs ?? null,
      toolResult: data.toolResult ?? null,
    })
    .returning();
  return toMessageDTO(row);
}

// Fuer /api/bot/verlauf: die letzten Gespraeche mit ihren Nachrichten.
export async function listConversationsWithMessages(
  limit = 20,
): Promise<Array<ConversationDTO & { messages: MessageDTO[] }>> {
  const conversations = await db
    .select()
    .from(botConversations)
    .orderBy(desc(botConversations.updatedAt))
    .limit(limit);

  const withMessages = await Promise.all(
    conversations.map(async (c) => ({
      ...toConversationDTO(c),
      messages: await listMessages(c.id),
    })),
  );
  return withMessages;
}
