import { NextResponse } from "next/server";
import { deleteFile, isUuid, readFile } from "@/lib/subject-file-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const NOT_FOUND = () => NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });

// GET /api/files/[id] -- der Download-Weg fuer den privaten Blob-Store.
//
// Die Datei liegt privat, ihre Blob-URL ist im Browser nicht abrufbar. Deshalb
// holt der Server sie und reicht sie durch. Diese Route liegt unter /api/ und
// damit hinter der Sperre aus proxy.ts: ohne Anmeldung gibt es eine 401,
// bevor hier ueberhaupt Code laeuft.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NOT_FOUND();

  const found = await readFile(id);
  if (!found) return NOT_FOUND();

  const { row, stream } = found;
  return new Response(stream, {
    headers: {
      "content-type": row.contentType,
      "content-length": String(row.size),
      // attachment plus filename*: so behaelt die Datei ihren Namen, auch mit
      // Umlauten. Der ASCII-Rueckfall daneben ist fuer aeltere Browser.
      "content-disposition": `attachment; filename="${asciiName(row.name)}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      // Privat heisst auch: kein Zwischenspeicher unterwegs.
      "cache-control": "private, no-store",
    },
  });
}

// Anfuehrungszeichen und alles ausserhalb von ASCII wuerden den Header
// zerlegen. Der echte Name steht ohnehin im filename*-Teil.
function asciiName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "datei";
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NOT_FOUND();
  if (!(await deleteFile(id))) return NOT_FOUND();
  return NextResponse.json({ ok: true });
}
