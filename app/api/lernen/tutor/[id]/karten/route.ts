import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { aktualisiereAusKarten } from "@/lib/lernplan-store";
import { saveProposedTutorCards } from "@/lib/tutor/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/lernen/tutor/[id]/karten -- legt die im Fazit vorgeschlagenen
// Karten im Thema an (source manuell, sourceRef "tutor:<id>").
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Session nicht gefunden." }, { status: 404 });

  const result = await saveProposedTutorCards(id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.topicId) {
    try { await aktualisiereAusKarten(result.topicId, true); }
    catch (error) { console.warn("[tutor] Kartenfortschritt konnte nicht aktualisiert werden:", error); }
  }
  return NextResponse.json({ cards: result.cards }, { status: result.status });
}
