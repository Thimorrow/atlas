// Datei-Anhaenge pro Fach (Schritt 6 der Spec).
//
// Der Blob-Speicher ist optional: ohne BLOB_READ_WRITE_TOKEN bleibt die App
// vollstaendig benutzbar, der Dateibereich zeigt nur einen Hinweis. Deshalb
// wird der Token nie beim Import gelesen, sondern erst im Request -- und
// listFiles laeuft auch ohne ihn, falls schon Metadaten in der DB liegen.
//
// Hochgeladen wird vom Browser direkt in den Store, nicht durch unsere Route:
// Vercel laesst nur 4,5 MB pro Anfrage an eine Funktion durch, die Spec will
// aber 10 MB. Der Server gibt dafuer ein kurzlebiges, auf Typ und Groesse
// beschraenktes Token aus (siehe api/subjects/[id]/files/upload) und traegt
// die fertige Datei danach mit registerFile ein. Was der Browser dabei
// behauptet, wird nicht geglaubt: die Groesse und der Typ kommen aus head().
//
// Native Clients koennen dieses Protokoll nicht sprechen und schicken die
// Bytes selbst -- dafuer gibt es storeUploadedFile ganz unten, mit der
// entsprechend kleineren Groessengrenze.

import { del, get, head, put } from "@vercel/blob";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subjectFiles, subjects, type SubjectFile } from "@/lib/db/schema";

// --- DTO ---------------------------------------------------------------------

// Bewusst OHNE die Blob-URL: der Store ist privat, die URL waere fuer den
// Browser ohnehin nicht abrufbar. Heruntergeladen wird ueber /api/files/[id].
export type FileDTO = {
  id: string;
  name: string;
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

// Traegt eine bereits hochgeladene Datei ein. Der Pfad kommt vom Browser, die
// Fakten dazu aber vom Store: Groesse und Typ liest head(), damit eine
// falsche Angabe des Clients ins Leere laeuft.
export async function registerFile(
  subjectId: string,
  pathname: string,
  name: string,
): Promise<FileDTO | { error: string }> {
  const meta = await head(pathname).catch(() => null);
  if (!meta) return { error: "Die hochgeladene Datei wurde nicht gefunden." };

  if (!isAllowedContentType(meta.contentType) || meta.size > MAX_SIZE) {
    // Sollte das Token schon verhindert haben. Passiert es doch, bleibt keine
    // verwaiste Datei im Store zurueck.
    await del(pathname).catch(() => {});
    return { error: "Diese Datei wird nicht angenommen." };
  }

  const [row] = await db
    .insert(subjectFiles)
    .values({
      subjectId,
      name,
      url: meta.url,
      pathname: meta.pathname,
      size: meta.size,
      contentType: meta.contentType,
    })
    .returning();

  return toFileDTO(row);
}

// Holt den Inhalt aus dem privaten Store. Der Aufrufer streamt ihn weiter,
// gepuffert wird nichts: eine 10-MB-Datei muss nicht durch den Speicher der
// Funktion wandern.
export async function readFile(
  id: string,
): Promise<{ row: SubjectFile; stream: ReadableStream<Uint8Array> } | null> {
  const [row] = await db.select().from(subjectFiles).where(eq(subjectFiles.id, id)).limit(1);
  if (!row || !blobEnabled()) return null;

  const result = await get(row.pathname, { access: "private" }).catch((err) => {
    console.error("[subject-files] Blob nicht lesbar:", row.pathname, err);
    return null;
  });
  // statusCode 304 kann hier nicht auftreten, wir schicken kein ifNoneMatch --
  // die Pruefung haelt den Typ trotzdem ehrlich.
  if (!result || result.statusCode !== 200) return null;

  return { row, stream: result.stream };
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

// --- Multipart-Weg fuer native Clients ---------------------------------------

// Vercel laesst pro Anfrage an eine Funktion nur 4,5 MB durch. Der Browser
// umgeht das, indem er mit einem Token direkt in den Blob-Store laedt (siehe
// api/subjects/[id]/files/upload) -- ein Kotlin-Client kann dieses Protokoll
// nicht sprechen und schickt die Bytes stattdessen an uns. Damit traegt der
// Multipart-Weg nur kleinere Dateien: die Grenze liegt hier bei 4 MB, mit
// Abstand zu den 4,5 MB, weil Feldnamen, Grenzmarken und Header der
// multipart-Nachricht mitzaehlen.
//
// Groesser als das geht ueber den Browser-Weg. Diese Grenze ist NICHT
// MAX_SIZE: die 10 MB der Spec gelten weiterhin, nur eben nicht auf diesem Weg.
export const MULTIPART_MAX_SIZE = 4 * 1024 * 1024;

export const MULTIPART_MAX_SIZE_LABEL = "4 MB";

// Nimmt die Bytes selbst entgegen und legt sie in den Store. Danach laeuft
// alles wie beim Browser-Weg durch registerFile -- Groesse und Typ kommen also
// auch hier aus head() und nicht aus der Behauptung des Clients.
export async function storeUploadedFile(
  subjectId: string,
  file: File,
): Promise<FileDTO | { error: string; status: number }> {
  if (file.size === 0) {
    return { error: "Die Datei ist leer.", status: 400 };
  }
  if (file.size > MULTIPART_MAX_SIZE) {
    return {
      error: `Ueber diesen Weg gehen hoechstens ${MULTIPART_MAX_SIZE_LABEL}, weil Vercel groessere Anfragen an eine Funktion gar nicht erst durchlaesst. Groessere Dateien bis ${MAX_SIZE_LABEL} laufen ueber den Upload direkt in den Dateispeicher.`,
      status: 413,
    };
  }
  if (!isAllowedContentType(file.type)) {
    return { error: "Dieser Dateityp wird nicht angenommen.", status: 400 };
  }

  const name = (file.name || "Datei").trim().slice(0, 200);

  // addRandomSuffix, damit zwei gleichnamige Dateien einander nicht
  // ueberschreiben. access private wie beim Browser-Weg: heruntergeladen wird
  // ausschliesslich ueber /api/files/[id], hinter der Passwortsperre.
  const uploaded = await put(name, file, {
    access: "private",
    addRandomSuffix: true,
    contentType: file.type,
  }).catch((err) => {
    console.error("[subject-files] Multipart-Upload fehlgeschlagen:", err);
    return null;
  });
  if (!uploaded) {
    return { error: "Die Datei konnte nicht gespeichert werden.", status: 502 };
  }

  const created = await registerFile(subjectId, uploaded.pathname, name);
  if ("error" in created) return { ...created, status: 400 };
  return created;
}
