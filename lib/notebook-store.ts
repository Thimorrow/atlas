import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notebookChapters, notebookPages, subjectFiles } from "@/lib/db/schema";
import { isObj, isUuid } from "@/lib/subject-store";
import { NOTEBOOK_HEIGHT, NOTEBOOK_WIDTH, type NotebookContent, type NotebookPageDTO, type NotebookPaper } from "@/lib/notebook-types";

export const MAX_NOTEBOOK_BYTES = 2_000_000;
type Patch = { chapterId?: string | null; title?: string; paper?: NotebookPaper; content?: NotebookContent };
type Parsed = { ok: true; value: Patch } | { ok: false; error: string };
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function parseNotebookPatch(input: unknown): Parsed {
  if (!isObj(input)) return { ok: false, error: "Ungültige Heftseite." };
  const value: Patch = {};
  if (input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 200) return { ok: false, error: "Der Seitentitel muss 1 bis 200 Zeichen enthalten." };
    value.title = input.title.trim();
  }
  if (input.chapterId !== undefined) {
    if (input.chapterId !== null && (typeof input.chapterId !== "string" || !isUuid(input.chapterId))) return { ok: false, error: "Ungültiges Kapitel." };
    value.chapterId = input.chapterId;
  }
  if (input.paper !== undefined) {
    if (!["blank", "lined", "grid"].includes(String(input.paper))) return { ok: false, error: "Ungültiges Papier." };
    value.paper = input.paper as NotebookPaper;
  }
  if (input.content !== undefined) {
    const c = input.content;
    if (!isObj(c) || !Array.isArray(c.strokes) || !Array.isArray(c.blocks) || c.strokes.length > 5000 || c.blocks.length > 100) return { ok: false, error: "Diese Heftseite ist zu groß oder ungültig." };
    const ids = new Set<string>();
    const validId = (id: unknown) => {
      if (typeof id !== "string" || !id.length || id.length > 100 || ids.has(id)) return false;
      ids.add(id);
      return true;
    };
    let totalPoints = 0;
    for (const s of c.strokes) {
      if (!isObj(s) || !validId(s.id) || typeof s.color !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(s.color) || !finite(s.width, 0.1, 100) || !Array.isArray(s.points) || !s.points.length) return { ok: false, error: "Ungültiger Stiftstrich." };
      totalPoints += s.points.length;
      if (totalPoints > 50000 || s.points.some((p: unknown) => !isObj(p) || !finite(p.x, 0, NOTEBOOK_WIDTH) || !finite(p.y, 0, NOTEBOOK_HEIGHT) || !finite(p.pressure, 0, 1))) return { ok: false, error: "Zu viele oder ungültige Stiftpunkte." };
    }
    for (const b of c.blocks) {
      if (!isObj(b) || !validId(b.id) || !["text", "image", "pdf"].includes(String(b.type)) || !finite(b.x, 0, NOTEBOOK_WIDTH) || !finite(b.y, 0, NOTEBOOK_HEIGHT) || !finite(b.width, 1, NOTEBOOK_WIDTH) || !finite(b.height, 1, NOTEBOOK_HEIGHT)) return { ok: false, error: "Ungültiger Seiteninhalt." };
      if (b.pageNumber !== undefined && (!Number.isInteger(b.pageNumber) || !finite(b.pageNumber, 1, 10000))) return { ok: false, error: "Ungültige PDF-Seitennummer." };
      if (b.type === "text" ? typeof b.text !== "string" || b.text.length > 50000 : typeof b.fileId !== "string" || !isUuid(b.fileId)) return { ok: false, error: "Text oder Datei fehlt im Seiteninhalt." };
    }
    if (new TextEncoder().encode(JSON.stringify(c)).length > MAX_NOTEBOOK_BYTES) return { ok: false, error: "Die Seite ist zu groß. Bitte lege eine weitere Seite an." };
    value.content = c as NotebookContent;
  }
  if (!Object.keys(value).length) return { ok: false, error: "Keine Seitenänderung angegeben." };
  return { ok: true, value };
}

function dto(row: typeof notebookPages.$inferSelect): NotebookPageDTO {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
export async function listNotebookPages(subjectId: string) {
  // Große Stiftinhalte werden erst beim Öffnen einer Seite übertragen.
  const rows = await db.select({ id: notebookPages.id, subjectId: notebookPages.subjectId, chapterId: notebookPages.chapterId, title: notebookPages.title, paper: notebookPages.paper, createdAt: notebookPages.createdAt, updatedAt: notebookPages.updatedAt }).from(notebookPages).where(eq(notebookPages.subjectId, subjectId)).orderBy(asc(notebookPages.createdAt), asc(notebookPages.id));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
}
export async function getNotebookPage(id: string) {
  const [row] = await db.select().from(notebookPages).where(eq(notebookPages.id, id)).limit(1);
  return row ? dto(row) : null;
}
export async function createNotebookPage(input: { id?: string; subjectId: string; chapterId?: string | null; title?: string; paper?: NotebookPaper }) {
  const [row] = await db.insert(notebookPages).values(input).onConflictDoNothing().returning();
  if (row) return dto(row);
  // Wiederholtes Senden derselben clientseitigen UUID legt keine zweite Seite an.
  const existing = input.id ? await getNotebookPage(input.id) : null;
  if (!existing || existing.subjectId !== input.subjectId) throw new Error("Diese Seiten-ID ist bereits vergeben.");
  return existing;
}
export async function updateNotebookPage(id: string, patch: Patch, expectedUpdatedAt?: string) {
  // One atomic comparison prevents a stale iPad or Mac from replacing a newer page.
  // Advance at least one millisecond so even rapid saves receive distinct tokens.
  const [row] = await db.update(notebookPages).set({ ...patch, updatedAt: sql`greatest(date_trunc('milliseconds', clock_timestamp()), ${notebookPages.updatedAt} + interval '1 millisecond')` }).where(and(
    eq(notebookPages.id, id),
    expectedUpdatedAt ? eq(notebookPages.updatedAt, new Date(expectedUpdatedAt)) : undefined,
  )).returning();
  return row ? dto(row) : null;
}
export async function deleteNotebookPage(id: string) {
  const [row] = await db.delete(notebookPages).where(eq(notebookPages.id, id)).returning({ id: notebookPages.id });
  return Boolean(row);
}
export async function notebookFilesBelongToSubject(subjectId: string, content: NotebookContent) {
  const blocks = content.blocks.filter((b) => b.type !== "text");
  const ids = [...new Set(blocks.map((b) => b.fileId!))];
  if (!ids.length) return true;
  const files = await db.select({ id: subjectFiles.id, contentType: subjectFiles.contentType }).from(subjectFiles).where(and(eq(subjectFiles.subjectId, subjectId), inArray(subjectFiles.id, ids)));
  return blocks.every((block) => files.some((f) => f.id === block.fileId && (block.type === "pdf" ? f.contentType === "application/pdf" : f.contentType.startsWith("image/"))));
}

export async function readNotebookBody(req: Request): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_NOTEBOOK_BYTES) { await reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export function parseNotebookChapter(input: unknown): { ok: true; title: string } | { ok: false; error: string } {
  if (!isObj(input) || typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 100) return { ok: false, error: "Der Kapitelname muss 1 bis 100 Zeichen enthalten." };
  return { ok: true, title: input.title.trim() };
}
export async function listNotebookChapters(subjectId: string) {
  const rows = await db.select().from(notebookChapters).where(eq(notebookChapters.subjectId, subjectId)).orderBy(asc(notebookChapters.createdAt), asc(notebookChapters.id));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
export async function notebookChapterBelongsToSubject(subjectId: string, chapterId: string) {
  const [row] = await db.select({ id: notebookChapters.id }).from(notebookChapters).where(and(eq(notebookChapters.id, chapterId), eq(notebookChapters.subjectId, subjectId))).limit(1);
  return Boolean(row);
}
export async function createNotebookChapter(subjectId: string, title: string) {
  const [row] = await db.insert(notebookChapters).values({ subjectId, title }).returning();
  return { ...row, createdAt: row.createdAt.toISOString() };
}
export async function renameNotebookChapter(id: string, title: string) {
  const [row] = await db.update(notebookChapters).set({ title }).where(eq(notebookChapters.id, id)).returning();
  return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
}
