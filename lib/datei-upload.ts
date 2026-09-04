// Client-seitiger Datei-Upload in ein Fach: erst direkt in den Blob-Store
// (umgeht Vercels ~4,5 MB Grenze fuer den Anfrage-Rumpf), danach die Datei
// per JSON an POST /api/subjects/[id]/files anmelden. Eine Quelle fuer
// components/subject-files.tsx und components/lernplan-erstellen.tsx, die
// beide denselben Weg brauchen.

"use client";

import { upload } from "@vercel/blob/client";
import type { FileDTO } from "@/lib/subject-file-store";

export async function ladeDateiInFachHoch(subjectId: string, file: File): Promise<FileDTO> {
  const blob = await upload(file.name, file, {
    access: "private",
    handleUploadUrl: `/api/subjects/${subjectId}/files/upload`,
    contentType: file.type,
  });

  const res = await fetch(`/api/subjects/${subjectId}/files`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pathname: blob.pathname, name: file.name }),
  });
  const data = (await res.json().catch(() => null)) as { file?: FileDTO; error?: string } | null;
  if (!res.ok || !data?.file) {
    throw new Error(data?.error ?? "Die Datei konnte nicht hochgeladen werden.");
  }
  return data.file;
}
