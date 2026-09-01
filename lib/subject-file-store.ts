// Datei-Anhaenge pro Fach (Schritt 6 der Spec).
//
// Der Blob-Speicher ist optional: ohne BLOB_READ_WRITE_TOKEN bleibt die App
// vollstaendig benutzbar, der Dateibereich zeigt nur einen Hinweis. Deshalb
// wird der Token nie beim Import gelesen, sondern erst im Request -- und
// listFiles laeuft auch ohne ihn, falls schon Metadaten in der DB liegen.

import { del, put } from "@vercel/blob";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subjectFiles, subjects, type SubjectFile } from "@/lib/db/schema";

// --- DTO ---------------------------------------------------------------------

export type FileDTO = {
  id: string;
  name: string;
  url: string;
  pathname: string;
  size: number;
  contentType: string;
  createdAt: string;
};

// --- Regeln ------------------------------------------------------------------

export const MAX_SIZE = 10 * 1024 * 1024;

export const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
] as const;

export const MAX_SIZE_LABEL = "10 MB";

export function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function isAllowedContentType(type: string): boolean {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(type);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// --- Queries -----------------------------------------------------------------

function toFileDTO(row: SubjectFile): FileDTO {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    pathname: row.pathname,
    size: row.size,
    contentType: row.contentType,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function subjectExists(subjectId: string): Promise<boolean> {
  const rows = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.id, subjectId))
    .limit(1);
  return rows.length > 0;
}

export async function listFiles(subjectId: string): Promise<FileDTO[]> {
  const rows = await db
    .select()
    .from(subjectFiles)
    .where(eq(subjectFiles.subjectId, subjectId))
    .orderBy(desc(subjectFiles.createdAt));
  return rows.map(toFileDTO);
}

// Laedt die Datei in den Blob-Store und schreibt die Metadaten. Der Aufrufer
// hat Token, Content-Type und Groesse vorher geprueft.
export async function createFile(
  subjectId: string,
  file: File,
): Promise<FileDTO> {
  const blob = await put(file.name, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });

  const [row] = await db
    .insert(subjectFiles)
    .values({
      subjectId,
      name: file.name,
      url: blob.url,
      pathname: blob.pathname,
      size: file.size,
      contentType: file.type,
    })
    .returning();

  return toFileDTO(row);
}

// Erst der Blob, dann die Zeile. Schlaegt das Blob-Loeschen fehl, verschwindet
// die Zeile trotzdem: eine Karteileiche in der Liste waere fuer den Nutzer
// schlimmer als eine verwaiste Datei im Store, die er nie zu sehen bekommt.
export async function deleteFile(id: string): Promise<boolean> {
  const [row] = await db.select().from(subjectFiles).where(eq(subjectFiles.id, id)).limit(1);
  if (!row) return false;

  if (blobEnabled()) {
    try {
      await del(row.pathname);
    } catch (err) {
      console.error("[subject-files] Blob konnte nicht geloescht werden:", row.pathname, err);
    }
  }

  await db.delete(subjectFiles).where(eq(subjectFiles.id, id));
  return true;
}
