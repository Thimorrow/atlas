import { NextResponse } from "next/server";
import { buildGreeting, buildSystemPrompt } from "@/lib/bot/context";
import { botEnabled, streamChatWithFallback, type ChatToolCall } from "@/lib/bot/model";
import { botTools, runTool, statusTextFor } from "@/lib/bot/tools";
import { storedToolResult, toModelMessages } from "@/lib/bot/history";
import { ladeLagebild } from "@/lib/bot/lagebild";
import { ladeStundeKontext, type StundeResponse } from "@/lib/stunde-kontext";
import {
  appendMessage,
  createConversation,
  getConversation,
  listMessages,
  setTitleIfEmpty,
  touchConversation,
} from "@/lib/bot/store";
import { isUuid, isObj } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const REQUEST_TIMEOUT_MS = 270_000;

// Schreibende Werkzeuge: nur bei diesen kommt ein "action"-Ereignis mit dem
// vollstaendigen Datensatz, damit die Oberflaeche eine Karte + Rueckgaengig
// (Lernkarten ohne Rueckgaengig) bauen kann.
const WRITE_TOOLS = new Set([
  "aufgabe_anlegen",
  "aufgabe_aendern",
  "notiz_anlegen",
  "notiz_aendern",
  "lernkarten_erzeugen",
  "lernkarte_anlegen",
]);
const MAX_ROUNDS = 6;

// Das Cockpit einmal laden, egal ob fuer die Begruessung (GET) oder den
// System-Prompt (POST) -- schlaegt es fehl (z. B. keine Verbindung), bleibt
// der Bot trotzdem nutzbar, nur eben ohne den "Gerade:"-Kontext.
async function ladeJetztSicher(): Promise<StundeResponse | null> {
  try {
    return await ladeStundeKontext();
  } catch {
    return null;
  }
}

// GET /api/bot -- Begruessung ohne leeres Gespraech anzulegen.
export async function GET() {
  if (!botEnabled()) {
    return NextResponse.json({
      enabled: false,
      greeting: "Der Atlas-Bot ist noch nicht eingerichtet. Dafür fehlt der Schlüssel ZAI_API_KEY in den Umgebungsvariablen. Alles andere in Atlas funktioniert unverändert.",
      suggestions: [],
      conversationId: null,
    });
  }

  const jetzt = await ladeJetztSicher();
  const { text, suggestions } = await buildGreeting(jetzt);

  return NextResponse.json({
    enabled: true,
    greeting: text,
    suggestions,
    conversationId: null,
  });
}

// Einzeiliger Fehler-Stream, wenn der Bot gar nicht erst starten kann (kein
// Key, kaputter Body).
function errorStream(text: string): Response {
  return new Response(JSON.stringify({ type: "error", text }) + "\n", {
    headers: { "Content-Type": "application/x-ndjson" },
  });
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
      return NextResponse.json({ error: "conversationId ist keine gültige id." }, { status: 400 });
    }
  }

  const userMessage = body.message.trim();

  let conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
  if (conversationId && !(await getConversation(conversationId))) conversationId = undefined;
  if (!conversationId) conversationId = (await createConversation()).id;

  await appendMessage(conversationId, { role: "user", content: userMessage });
  await setTitleIfEmpty(conversationId, userMessage);

  const abortController = new AbortController();
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = AbortSignal.any([req.signal, abortController.signal, deadline]);
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
        send({ type: "conversation", conversationId });
        signal.throwIfAborted();
        const history = await listMessages(conversationId!);
        const [jetzt, lagebild] = await Promise.all([ladeJetztSicher(), ladeLagebild().catch(() => null)]);
        const chatMessages = toModelMessages(history, buildSystemPrompt(jetzt, lagebild));

        let finalText = "";
        let round = 0;
        let completed = false;

        while (round < MAX_ROUNDS && !signal.aborted) {
          round++;
          let roundText = "";
          const toolCalls: ChatToolCall[] = [];

          // Markiert den Beginn einer neuen Runde, damit die Oberflaeche den
          // Gedankengang der vorigen Runde ersetzt statt endlos anzuhaengen.
          send({ type: "round" });

          for await (const event of streamChatWithFallback(chatMessages, botTools, signal)) {
            if (signal.aborted) break;
            if (event.type === "thinking") {
              send({ type: "thinking", delta: event.delta });
            } else if (event.type === "text") {
              roundText += event.delta;
              send({ type: "text", delta: event.delta });
            } else if (event.type === "tool_calls") {
              toolCalls.push(...event.toolCalls);
            }
          }

          if (signal.aborted) break;

          if (toolCalls.length === 0) {
            finalText = roundText;
            completed = true;
            break;
          }

          chatMessages.push({
            role: "assistant",
            content: roundText.length > 0 ? roundText : null,
            tool_calls: toolCalls,
          });

          const images: string[] = [];
          for (const call of toolCalls) {
            signal.throwIfAborted();
            let args: unknown;
            try { args = JSON.parse(call.function.arguments || "{}"); } catch {
              throw new Error("Der Bot hat ungültige Werkzeugargumente geliefert.");
            }
            if (!isObj(args) || Array.isArray(args)) throw new Error("Ungültige Werkzeugargumente.");

            send({ type: "status", text: statusTextFor(call.function.name, args) });

            const result = await runTool(call.function.name, args, signal);
            const persistedResult = storedToolResult(result);

            const saved = await appendMessage(conversationId!, {
              role: "tool",
              content: "",
              toolName: call.function.name,
              toolArgs: args,
              toolResult: persistedResult,
            });

            if (WRITE_TOOLS.has(call.function.name) && isObj(result) && !("error" in result)) {
              send({ type: "action", tool: call.function.name, result });
            }
            if (call.function.name === "note_vorschlagen" && isObj(result) && "vorschlag" in result) {
              send({ type: "proposal", kind: "grade", messageId: saved.id, data: result.vorschlag });
            }

            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify(persistedResult),
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
              images.push(result.inhalt.url);
            }
          }
          if (images.length > 0) {
            chatMessages.push({ role: "user", content: images.map((url) => ({ type: "image_url", image_url: { url } })) });
          }
        }

        signal.throwIfAborted();
        if (!completed) throw new Error("Atlas hat die maximale Anzahl an Arbeitsschritten erreicht. Bereits angezeigte Änderungen sind gespeichert; die Anfrage ist noch nicht vollständig erledigt.");

        if (finalText) {
          await appendMessage(conversationId!, { role: "assistant", content: finalText });
        }
        await touchConversation(conversationId!);

        send({ type: "done", conversationId });
      } catch (err) {
        if (!req.signal.aborted && !abortController.signal.aborted) {
          send({
            type: "error",
            text: deadline.aborted ? "Die Anfrage hat zu lange gedauert. Bereits angezeigte Änderungen sind gespeichert." : err instanceof Error ? err.message : "Beim Bot ist ein unbekannter Fehler aufgetreten.",
          });
        }
      } finally {
        closed = true;
        try { controller.close(); } catch { /* Reader bereits geschlossen. */ }
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
