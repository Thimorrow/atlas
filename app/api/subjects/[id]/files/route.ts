import { NextResponse } from "next/server";
import {
  MAX_SIZE,
  MAX_SIZE_LABEL,
  blobEnabled,
  createFile,
  isAllowedContentType,
  isUuid,
  listFiles,
  subjectExists,
} from "@/lib/subject-file-store";

// Was der Nutzer statt der MIME-Typen lesen soll.
const TYPE_LABEL = "PDF, PNG, JPG, WEBP und HEIC";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const NOT_FOUND = () => NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });

// GET /api/subjects/[id]/files
// Faellt der Token weg, ist das kein Fehler: enabled=false, und die Liste
// bleibt leer. Die DB wird trotzdem gelesen, falls schon Metadaten da sind.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NOT_FOUND();
  if (!(await subjectExists(id))) return NOT_FOUND();

  const enabled = blobEnabled();
  const files = await listFiles(id);
  return NextResponse.json({ enabled, files: enabled ? files : [] });
}

// POST /api/subjects/[id]/files -- multipart, Feld "file".
// Reihenfolge der Pruefungen: Token, Datei, Typ, Groesse. Jeder Fall endet in
// einer deutschen Meldung mit 400 bzw. 503, nie in einem 500.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NOT_FOUND();

  if (!blobEnabled()) {
    return NextResponse.json(
      { error: "Der Dateispeicher ist noch nicht eingerichtet." },
      { status: 503 },
    );
  }

  if (!(await subjectExists(id))) return NOT_FOUND();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Keine Datei erhalten." }, { status: 400 });
  }

  if (!isAllowedContentType(file.type)) {
    return NextResponse.json(
      {
        error: `Dieser Dateityp wird nicht unterstützt. Erlaubt sind ${TYPE_LABEL}.`,
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `Die Datei ist zu groß. Erlaubt sind höchstens ${MAX_SIZE_LABEL} pro Datei.` },
      { status: 400 },
    );
  }

  const created = await createFile(id, file);
  return NextResponse.json({ file: created }, { status: 201 });
}
