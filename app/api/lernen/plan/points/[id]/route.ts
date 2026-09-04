import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { LernplanStoreFehler, punktPatch } from "@/lib/lernplan-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const CARDS_STATES = ["offen", "fertig", "fehler"] as const;

// PATCH /api/lernen/plan/points/[id] -- { cardsState? , topicId? }. Siehe
// SPEC.md "Karten-Queue" (topicId fuer den Edge Case "Thema geloescht").
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "punkt_fehlt" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const { cardsState, topicId } = raw;

  if (cardsState !== undefined && (typeof cardsState !== "string" || !(CARDS_STATES as readonly string[]).includes(cardsState))) {
    return NextResponse.json({ error: "cardsState" }, { status: 400 });
  }
  if (topicId !== undefined && (typeof topicId !== "string" || !isUuid(topicId))) {
    return NextResponse.json({ error: "topicId" }, { status: 400 });
  }
  if (cardsState === undefined && topicId === undefined) {
    return NextResponse.json({ error: "cardsState" }, { status: 400 });
  }

  try {
    const punkt = await punktPatch(id, {
      ...(cardsState !== undefined ? { cardsState: cardsState as (typeof CARDS_STATES)[number] } : {}),
      ...(topicId !== undefined ? { topicId } : {}),
    });
    return NextResponse.json({ punkt });
  } catch (err) {
    if (err instanceof LernplanStoreFehler) {
      return NextResponse.json({ error: err.code, ...(err.hinweis ? { hinweis: err.hinweis } : {}) }, { status: err.status });
    }
    console.error("[lernplan] points patch: unbekannter Fehler:", err);
    return NextResponse.json({ error: "unbekannt" }, { status: 500 });
  }
}
