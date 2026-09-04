import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { botEnabled } from "@/lib/bot/model";
import { generateVariant } from "@/lib/lernen-generieren";
import { createCards, getCard } from "@/lib/study-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

// POST /api/lernen/karten/[id]/variante -- erzeugt eine Variante einer
// Aufgabenkarte (andere Zahlen, gleiche Schwierigkeit) als neue Karte im
// selben Thema.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });

  const card = await getCard(id);
  if (!card) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });
  if (card.kind !== "aufgabe") {
    return NextResponse.json({ error: "Nur Aufgaben-Karten haben eine Variante." }, { status: 400 });
  }
  if (!botEnabled()) {
    return NextResponse.json({ error: "Der Bot ist nicht eingerichtet (ZAI_API_KEY fehlt)." }, { status: 503 });
  }

  try {
    const variant = await generateVariant(id);
    if (!variant) {
      return NextResponse.json({ error: "Der Bot konnte keine Variante erzeugen." }, { status: 502 });
    }

    const [newCard] = await createCards(
      card.subjectId,
      [{ question: variant.question, answer: variant.answer, kind: "aufgabe" }],
      "manuell",
      id,
      card.topicId,
    );
    return NextResponse.json({ card: newCard }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "BOT_DISABLED") {
      return NextResponse.json({ error: "Der Bot ist nicht eingerichtet (ZAI_API_KEY fehlt)." }, { status: 503 });
    }
    throw err;
  }
}
