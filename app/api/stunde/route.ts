import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { ladeStundeKontext, type StundeLessonDTO, type StundeResponse } from "@/lib/stunde-kontext";

export type { StundeLessonDTO, StundeResponse };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/stunde?block=<schoolBlockId optional>
//
// Duenne Route: Parameterpruefung hier, die eigentliche Berechnung steht in
// lib/stunde-kontext.ts (ladeStundeKontext), damit auch der Bot sie nutzen
// kann.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const blockParam = url.searchParams.get("block");
  if (blockParam !== null && !isUuid(blockParam)) {
    return NextResponse.json({ error: "block ist keine gültige id." }, { status: 400 });
  }

  const result = await ladeStundeKontext(blockParam);
  return NextResponse.json(result);
}
