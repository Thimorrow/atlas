import { NextResponse } from "next/server";
import { buildGreeting, buildSystemPrompt } from "@/lib/bot/context";
import { botEnabled, streamChatWithFallback, type ChatMessage, type ChatToolCall } from "@/lib/bot/model";
import { botTools, runTool, statusTextFor } from "@/lib/bot/tools";
import {
  appendMessage,
  createConversation,
  getConversation,
  listMessages,
  setTitleIfEmpty,
  touchConversation,
  type MessageDTO,
} from "@/lib/bot/store";
import { isUuid, isObj } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Schreibende Werkzeuge: nur bei diesen kommt ein "action"-Ereignis mit dem
// vollstaendigen Datensatz, damit die Oberflaeche eine Karte + Rueckgaengig
// bauen kann.
const WRITE_TOOLS = new Set(["aufgabe_anlegen", "aufgabe_aendern", "notiz_anlegen", "notiz_aendern"]);
const MAX_ROUNDS = 6;

// GET /api/bot -- Begruessung + frische conversationId, ohne Modellaufruf.
export async function GET() {
  if (!botEnabled()) {
    return NextResponse.json({
      enabled: false,
      greeting: "Der Atlas-Bot ist noch nicht eingerichtet. Dafür fehlt der Schlüssel ZAI_API_KEY in den Umgebungsvariablen. Alles andere in Atlas funktioniert unverändert.",
      suggestions: [],
      conversationId: null,
    });
  }

  const [{ text, suggestions }, conversation] = await Promise.all([
    buildGreeting(),
    createConversation(),
  ]);

  return NextResponse.json({
    enabled: true,
    greeting: text,
    suggestions,
    conversationId: conversation.id,
  });
}

// Einzeiliger Fehler-Stream, wenn der Bot gar nicht erst starten kann (kein
// Key, kaputter Body).
function errorStream(text: string): Response {
  return new Response(JSON.stringify({ type: "error", text }) + "\n", {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function toModelMessages(history: MessageDTO[]): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: buildSystemPrompt() }];
  for (const m of history) {
    if (m.role === "user" && m.content) messages.push({ role: "user", content: m.content });
    else if (m.role === "assistant" && m.content) messages.push({ role: "assistant", content: m.content });
  }
  return messages;
}

// POST /api/bot -- { conversationId?, message } -> NDJSON-Stream.
export async function POST(req: Request) {
  if (!botEnabled()) {
    return errorStream("Der Atlas-Bot ist noch nicht eingerichtet. Dafür fehlt der Schlüssel ZAI_API_KEY in den Umgebungsvariablen. Alles andere in Atlas funktioniert unverändert.");
  }

  const body = await req.json().catch(() => null);
  if (!isObj(body) || typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ error: "message darf nicht leer sein." }, { status: 400 });
  }
  if (body.conversationId !== undefined && body.conversationId !== null) {
    if (typeof body.conversationId !== "string" || !isUuid(body.conversationId)) {
      return NextResponse.json({ error: "conversationId ist keine gueltige id." }, { status: 400 });
    }
  }

  const userMessage = body.message.trim();

  let conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
  if (conversationId && !(await getConversation(conversationId))) conversationId = undefined;
  if (!conversationId) conversationId = (await createConversation()).id;

  await appendMessage(conversationId, { role: "user", content: userMessage });
  await setTitleIfEmpty(conversationId, userMessage);

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
        const history = await listMessages(conversationId!);
        const chatMessages = toModelMessages(history);

        let finalText = "";
        let round = 0;

        while (round < MAX_ROUNDS && !signal.aborted) {
          round++;
          let roundText = "";
          const toolCalls: ChatToolCall[] = [];

          for await (const event of streamChatWithFallback(chatMessages, botTools, signal)) {
            if (signal.aborted) break;
            if (event.type === "text") {
              roundText += event.delta;
              send({ type: "text", delta: event.delta });
            } else if (event.type === "tool_calls") {
              toolCalls.push(...event.toolCalls);
            }
          }

          if (signal.aborted) break;

          if (toolCalls.length === 0) {
            finalText = roundText;
            break;
          }

          chatMessages.push({
            role: "assistant",
            content: roundText.length > 0 ? roundText : null,
            tool_calls: toolCalls,
          });

          for (const call of toolCalls) {
            let args: Record<string, unknown> = {};
            try {
              args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            } catch {
              // Kaputtes JSON vom Modell -> leere Argumente, das Werkzeug meldet
              // dann selbst, was ihm fehlt.
            }

            send({ type: "status", text: statusTextFor(call.function.name, args) });

            const result = await runTool(call.function.name, args);

            await appendMessage(conversationId!, {
              role: "tool",
              content: "",
              toolName: call.function.name,
              toolArgs: args,
              toolResult: result,
            });

            if (WRITE_TOOLS.has(call.function.name) && isObj(result) && !("error" in result)) {
              send({ type: "action", tool: call.function.name, result });
            }
            if (call.function.name === "note_vorschlagen" && isObj(result) && "vorschlag" in result) {
              send({ type: "proposal", kind: "grade", data: result.vorschlag });
            }

            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify(result),
            });

            // Bilder gehen nicht als Text im Werkzeugergebnis ans Modell,
            // sondern als eigener Bild-Inhalt in der naechsten Nachricht.
            if (
              call.function.name === "datei_lesen" &&
              isObj(result) &&
              isObj(result.inhalt) &&
              result.inhalt.typ === "bild" &&
              typeof result.inhalt.url === "string"
            ) {
              chatMessages.push({
                role: "user",
                content: [{ type: "image_url", image_url: { url: result.inhalt.url } }],
              });
            }
          }
        }

        if (signal.aborted) return;

        if (finalText) {
          await appendMessage(conversationId!, { role: "assistant", content: finalText });
        }
        await touchConversation(conversationId!);

        send({ type: "done", conversationId });
      } catch (err) {
        if (!signal.aborted) {
          send({
            type: "error",
            text: err instanceof Error ? err.message : "Beim Bot ist ein unbekannter Fehler aufgetreten.",
          });
        }
      } finally {
        closed = true;
        controller.close();
      }
    },
    cancel() {
      // Browser hat abgebrochen -- streamChat bekommt das ueber signal.aborted
      // mit, hier gibt es nichts weiter zu tun.
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
