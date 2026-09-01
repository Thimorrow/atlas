import { NextResponse } from "next/server";
import { NOT_CONFIGURED, accessTokenFor, listSections, microsoftConfig } from "@/lib/microsoft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/microsoft/sections -- alle OneNote-Abschnitte des Nutzers.
// Vorlage fuer die Fach-Auswahl; gespeichert wird die Wahl am Fach selbst
// (PATCH /api/subjects/[id]).
export async function GET() {
  const config = microsoftConfig();
  if (!config) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });

  const token = await accessTokenFor(config);
  if ("error" in token) return NextResponse.json({ error: token.error }, { status: 401 });

  const sections = await listSections(token.token);
  if ("error" in sections) return NextResponse.json(sections, { status: 502 });

  return NextResponse.json({ sections });
}
