import { NextResponse } from "next/server";
import {
  blobEnabled,
  isUuid,
  listFiles,
  registerFile,
  storeUploadedFile,
  subjectExists,
} from "@/lib/subject-file-store";

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

// POST /api/subjects/[id]/files -- zwei Wege, je nach content-type.
//
// application/json { pathname, name }: der Browser-Weg. Die Datei liegt zu
// diesem Zeitpunkt schon im Store (siehe ./upload), hier entsteht nur die
// Zeile dazu. registerFile prueft Typ und Groesse noch einmal gegen den Store
// statt gegen die Angabe des Browsers.
//
// multipart/form-data mit dem Feld "file": der Weg fuer native Clients. Die
// Bytes kommen durch diese Funktion, weil ein Kotlin-Client das Token-
// Protokoll des Blob-SDK nicht sprechen kann.
//
// WICHTIG: Vercel laesst nur 4,5 MB pro Anfrage an eine Funktion durch. Der
// Multipart-Weg traegt deshalb nur Dateien bis 4 MB, nicht die 10 MB der Spec.
// Wer daraufstoesst, bekommt hier eine 413 mit einem deutschen Satz, der den
// Ausweg nennt -- ohne diese Pruefung waere es Vercels nackte englische
// Fehlerseite, an der ein Client nichts ablesen kann.
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

  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Es fehlt das Feld 'file' im Formular." },
        { status: 400 },
      );
    }

    const result = await storeUploadedFile(id, file);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ file: result }, { status: 201 });
  }

  const body = (await req.json().catch(() => null)) as {
    pathname?: unknown;
    name?: unknown;
  } | null;
  const pathname = typeof body?.pathname === "string" ? body.pathname : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!pathname || !name) {
    return NextResponse.json({ error: "Keine Datei erhalten." }, { status: 400 });
  }

  const created = await registerFile(id, pathname, name.slice(0, 200));
  if ("error" in created) return NextResponse.json(created, { status: 400 });
  return NextResponse.json({ file: created }, { status: 201 });
}
