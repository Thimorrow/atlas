import { NextResponse } from "next/server";
import { blobEnabled, isUuid, listFiles, registerFile, subjectExists } from "@/lib/subject-file-store";

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

// POST /api/subjects/[id]/files -- JSON { pathname, name }.
//
// Kein Datei-Upload mehr: die Datei liegt zu diesem Zeitpunkt schon im Store
// (siehe ./upload). Hier entsteht nur die Zeile dazu, und registerFile prueft
// Typ und Groesse noch einmal gegen den Store statt gegen die Angabe des
// Browsers.
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
