import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_SIZE,
  blobEnabled,
  isUuid,
  subjectExists,
} from "@/lib/subject-file-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/subjects/[id]/files/upload
//
// Gibt dem Browser ein kurzlebiges Token, mit dem er die Datei direkt in den
// Store legt. Der Umweg ist noetig, weil Vercel an eine Funktion nur 4,5 MB
// pro Anfrage durchlaesst -- die Spec erlaubt aber 10 MB.
//
// Das Token ist eng geschnitten: es gilt nur fuer die erlaubten Typen und nur
// bis zur Hoechstgroesse. Diese Grenzen zieht der Blob-Dienst selbst, sie
// haengen also nicht am Wohlverhalten des Browsers.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id) || !(await subjectExists(id))) {
    return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });
  }
  if (!blobEnabled()) {
    return NextResponse.json(
      { error: "Der Dateispeicher ist noch nicht eingerichtet." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Ungueltige Anfrage." }, { status: 400 });

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...ALLOWED_CONTENT_TYPES],
        maximumSizeInBytes: MAX_SIZE,
        addRandomSuffix: true,
      }),
      // Kein onUploadCompleted: der Rueckruf kaeme von Vercels Servern und
      // liefe in die Passwortsperre aus proxy.ts. Eingetragen wird die Datei
      // stattdessen vom Browser selbst, gleich nach dem Upload.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[subject-files] Upload-Token fehlgeschlagen:", err);
    return NextResponse.json(
      { error: "Der Upload konnte nicht vorbereitet werden." },
      { status: 400 },
    );
  }
}
