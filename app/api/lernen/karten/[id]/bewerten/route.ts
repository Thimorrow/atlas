import { NextResponse } from "next/server";
import { isObj, isUuid } from "@/lib/subject-store";
import { botEnabled } from "@/lib/bot/model";
import { bewerteAntwort } from "@/lib/lernen-generieren";
import { getCard } from "@/lib/study-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

// POST /api/lernen/karten/[id]/bewerten -- { antwort } -> { urteil, feedback }.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!isObj(body) || typeof body.antwort !== "string" || !body.antwort.trim()) {
    return NextResponse.json({ error: "antwort darf nicht leer sein." }, { status: 400 });
  }

  const card = await getCard(id);
  if (!card) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });

  if (card.kind === "vokabel") {
    return NextResponse.json({ error: "Vokabeln werden nicht bewertet." }, { status: 400 });
  }

  if (!botEnabled()) {
    return NextResponse.json({ error: "Der Bot ist nicht eingerichtet (ZAI_API_KEY fehlt)." }, { status: 503 });
  }

  try {
    const result = await bewerteAntwort(id, body.antwort);
    if (!result) {
      return NextResponse.json({ error: "Der Bot hat kein lesbares Urteil geliefert." }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "BOT_DISABLED") {
      return NextResponse.json({ error: "Der Bot ist nicht eingerichtet (ZAI_API_KEY fehlt)." }, { status: 503 });
    }
    throw err;
  }
}
