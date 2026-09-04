import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { generateCards, type GenerateInput } from "@/lib/lernen-generieren";
import { createCards } from "@/lib/study-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const QUELLEN = ["notizen", "dateien", "lehrplan", "alles"] as const;

// POST /api/lernen/generieren -- generiert Karten per Bot und speichert sie
// direkt (die Oberflaeche zeigt danach eine Liste, keine separate Vorschau).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const { subjectId, quelle, fileIds, anzahl, thema } = body as Record<string, unknown>;
  if (typeof subjectId !== "string" || !isUuid(subjectId)) {
    return NextResponse.json({ error: "subjectId ist keine gültige Fach-ID." }, { status: 400 });
  }
  if (typeof quelle !== "string" || !(QUELLEN as readonly string[]).includes(quelle)) {
    return NextResponse.json({ error: `quelle muss eine von ${QUELLEN.join(", ")} sein.` }, { status: 400 });
  }

  const input: GenerateInput = {
    subjectId,
    quelle: quelle as GenerateInput["quelle"],
    fileIds: Array.isArray(fileIds) ? fileIds.filter((f): f is string => typeof f === "string") : undefined,
    anzahl: typeof anzahl === "number" ? anzahl : undefined,
    thema: typeof thema === "string" ? thema : undefined,
  };

  try {
    const result = await generateCards(input);
    if (result.cards.length === 0) {
      return NextResponse.json({ cards: [], hinweis: result.hinweis });
    }

    const quelleForStore = quelle === "dateien" ? "datei" : quelle === "alles" ? "notizen" : quelle;
    const cards = await createCards(
      subjectId,
      result.cards,
      quelleForStore as Parameters<typeof createCards>[2],
      input.fileIds?.[0] ?? null,
    );
    return NextResponse.json({ cards, hinweis: result.hinweis });
  } catch (err) {
    if (err instanceof Error && err.message === "BOT_DISABLED") {
      return NextResponse.json({ error: "Der Bot ist nicht eingerichtet (ZAI_API_KEY fehlt)." }, { status: 503 });
    }
    throw err;
  }
}
