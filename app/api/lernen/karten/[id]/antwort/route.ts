import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { reviewCard } from "@/lib/study-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/lernen/karten/[id]/antwort -- { correct: boolean } wendet die
// Leitner-Umsetzung an (Box hoch/runter, naechste Faelligkeit) und protokolliert
// die Antwort.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const correct = typeof body === "object" && body !== null ? (body as Record<string, unknown>).correct : undefined;
  if (typeof correct !== "boolean") {
    return NextResponse.json({ error: "correct muss ein Boolean sein." }, { status: 400 });
  }

  const card = await reviewCard(id, correct);
  if (!card) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });
  return NextResponse.json({ card });
}
