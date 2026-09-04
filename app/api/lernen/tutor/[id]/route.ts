import { isObj, isUuid } from "@/lib/subject-store";
import { botEnabled } from "@/lib/bot/model";
import {
  appendTutorMessage,
  deleteTutorConversation,
  getTutorConversation,
  listTutorMessages,
} from "@/lib/tutor/store";
import { runTutorTurn, submitWidgetAntwort } from "@/lib/tutor/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// GET /api/lernen/tutor/[id] -- Verlauf einer Session, inkl. Tool-Zeilen.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Session nicht gefunden." }, { status: 404 });

  const conversation = await getTutorConversation(id);
  if (!conversation) return NextResponse.json({ error: "Session nicht gefunden." }, { status: 404 });

  const messages = await listTutorMessages(id);
  return NextResponse.json({
    conversation,
    messages,
    checkliste: conversation.checkliste,
    ergebnis: conversation.ergebnis,
  });
}

// POST /api/lernen/tutor/[id] -- { message? , widgetAntwort? } -> NDJSON-Stream
// (siehe TUTOR-SPEC.md "Kern" fuer die Events).
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Session nicht gefunden." }, { status: 404 });

  const conversation = await getTutorConversation(id);
  if (!conversation) return NextResponse.json({ error: "Session nicht gefunden." }, { status: 404 });

  if (!botEnabled()) {
    return NextResponse.json({ error: "Der Bot ist nicht eingerichtet (ZAI_API_KEY fehlt)." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!isObj(body)) return NextResponse.json({ error: "Ungueltiger Body." }, { status: 400 });

  const hasMessage = body.message !== undefined;
  const hasWidgetAntwort = body.widgetAntwort !== undefined;

  if (hasMessage && hasWidgetAntwort) {
    return NextResponse.json({ error: "Genau eins von message oder widgetAntwort." }, { status: 400 });
  }

  if (!hasMessage && !hasWidgetAntwort) {
    const history = await listTutorMessages(id);
    const isFirstTurn = history.length === 0 || (history.length === 1 && history[0].role === "user");
    if (!isFirstTurn) {
      return NextResponse.json({ error: "Genau eins von message oder widgetAntwort." }, { status: 400 });
    }
  }

  if (conversation.endedAt) {
    return NextResponse.json({ error: "Session ist beendet." }, { status: 400 });
  }

  if (hasMessage) {
    if (typeof body.message !== "string") {
      return NextResponse.json({ error: "message muss ein String sein." }, { status: 400 });
    }
    const trimmed = body.message.trim();
    if (!trimmed || trimmed.length > 4000) {
      return NextResponse.json({ error: "message ist leer oder zu lang." }, { status: 400 });
    }
    await appendTutorMessage(id, { role: "user", content: trimmed });
  }

  if (hasWidgetAntwort) {
    const wa = body.widgetAntwort;
    if (
      !isObj(wa) ||
      typeof wa.messageId !== "string" ||
      !isUuid(wa.messageId) ||
      !Array.isArray(wa.auswahl) ||
      !wa.auswahl.every((a) => typeof a === "string") ||
      (wa.text !== undefined && typeof wa.text !== "string")
    ) {
      return NextResponse.json({ error: "widgetAntwort ist ungueltig." }, { status: 400 });
    }
    try {
      await submitWidgetAntwort(id, wa.messageId, wa.auswahl as string[], wa.text as string | undefined);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "widgetAntwort ist ungueltig." }, { status: 400 });
    }
  }

  const signal = req.signal;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };

      try {
        for await (const ev of runTutorTurn(id, signal)) send(ev);
      } catch (err) {
        send({ type: "error", text: err instanceof Error ? err.message : "Beim Tutor ist ein unbekannter Fehler aufgetreten." });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}

// DELETE /api/lernen/tutor/[id]
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Session nicht gefunden." }, { status: 404 });

  const conversation = await getTutorConversation(id);
  if (!conversation) return NextResponse.json({ error: "Session nicht gefunden." }, { status: 404 });

  await deleteTutorConversation(id);
  return NextResponse.json({ ok: true });
}
