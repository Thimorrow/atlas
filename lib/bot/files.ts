// Liest den Inhalt einer Fach-Datei fuer den Bot, so wie sie in subject_files
// steht (siehe lib/subject-file-store.ts). Der Store ist privat (access:
// "private"), die Blob-URL allein reicht also nicht -- gelesen wird wie beim
// Download der Oberflaeche ueber get() mit dem BLOB_READ_WRITE_TOKEN.

import { get } from "@vercel/blob";
import { extractText, getDocumentProxy } from "unpdf";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subjectFiles, type SubjectFile } from "@/lib/db/schema";
import { blobEnabled } from "@/lib/subject-file-store";

// Ab dieser Zeichenzahl wird gekuerzt -- lang genug fuer die meisten
// Zusammenfassungen, kurz genug, um den Kontext des Modells nicht zu sprengen.
export const MAX_CHARS = 20_000;
const TRUNCATED_HINT = "\n\n[... gekuerzt, die Datei ist laenger ...]";

// Reine Funktion, damit sie ohne Netzwerk testbar ist.
export function truncate(text: string, maxChars = MAX_CHARS): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + TRUNCATED_HINT;
}

const TEXT_EXTENSIONS = [".md", ".txt", ".csv"];

function isTextLike(file: Pick<SubjectFile, "contentType" | "name">): boolean {
  if (file.contentType.startsWith("text/")) return true;
  const lower = file.name.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isPdf(file: Pick<SubjectFile, "contentType" | "name">): boolean {
  return file.contentType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isImage(file: Pick<SubjectFile, "contentType">): boolean {
  return file.contentType.startsWith("image/");
}

export type FileContent =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string }
  | { kind: "unsupported"; hint: string };

// Holt und liest eine Datei anhand ihrer id. null = Datei existiert nicht.
export async function readSubjectFile(
  id: string,
): Promise<{ file: { id: string; name: string; contentType: string }; content: FileContent } | null> {
  const [row] = await db.select().from(subjectFiles).where(eq(subjectFiles.id, id)).limit(1);
  if (!row) return null;

  const file = { id: row.id, name: row.name, contentType: row.contentType };

  if (!blobEnabled()) {
    return { file, content: { kind: "unsupported", hint: "Der Dateispeicher ist nicht eingerichtet." } };
  }

  if (isImage(row)) {
    // Das Modell braucht eine erreichbare URL. Der Store ist privat, also
    // wird das Bild als data-URL eingebettet statt als Blob-Link, den der
    // Gateway ohnehin nicht auth-en koennte.
    const bytes = await fetchBlobBytes(row.pathname);
    if (!bytes) return { file, content: { kind: "unsupported", hint: "Das Bild konnte nicht geladen werden." } };
    const base64 = Buffer.from(bytes).toString("base64");
    return { file, content: { kind: "image", url: `data:${row.contentType};base64,${base64}` } };
  }

  if (isTextLike(row)) {
    const bytes = await fetchBlobBytes(row.pathname);
    if (!bytes)
      return { file, content: { kind: "unsupported", hint: "Die Datei konnte nicht geladen werden." } };
    return { file, content: { kind: "text", text: truncate(Buffer.from(bytes).toString("utf-8")) } };
  }

  if (isPdf(row)) {
    const bytes = await fetchBlobBytes(row.pathname);
    if (!bytes)
      return { file, content: { kind: "unsupported", hint: "Das PDF konnte nicht geladen werden." } };
    const text = await extractPdfText(bytes);
    if (text === null)
      return { file, content: { kind: "unsupported", hint: "Das PDF konnte nicht gelesen werden." } };
    return { file, content: { kind: "text", text: truncate(text) } };
  }

  return {
    file,
    content: {
      kind: "unsupported",
      hint: `Dateien vom Typ "${row.contentType}" koennen aktuell nicht gelesen werden.`,
    },
  };
}

async function fetchBlobBytes(pathname: string): Promise<Uint8Array | null> {
  try {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  } catch (err) {
    console.error("[bot/files] Blob nicht lesbar:", pathname, err);
    return null;
  }
}

async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch (err) {
    console.error("[bot/files] PDF konnte nicht extrahiert werden:", err);
    return null;
  }
}
