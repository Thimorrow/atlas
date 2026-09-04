import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { botEnabled } from "@/lib/bot/model";
import { explainCard } from "@/lib/lernen-generieren";
import { getCard } from "@/lib/study-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

// POST /api/lernen/karten/[id]/erklaeren -- streamt eine Erklaerung zur
// Karte als text/plain.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });

  if (!botEnabled()) {
    return NextResponse.json({ error: "Der Bot ist nicht eingerichtet (ZAI_API_KEY fehlt)." }, { status: 503 });
  }
  if (!(await getCard(id))) {
    return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of explainCard(id)) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Die Erklärung konnte nicht erzeugt werden.";
        controller.enqueue(encoder.encode(message));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
