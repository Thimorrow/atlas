// Duenne Huelle um den Anthropic-kompatiblen Z.ai-Endpoint (GLM-Modelle).
//
// Bewusst kein AI-SDK-Paket: ein fetch + eigener SSE-Parser reicht und spart
// eine Abhaengigkeit samt Versionsrisiko. Nach aussen (route.ts, tools.ts)
// bleibt alles im gewohnten OpenAI-Format -- die Uebersetzung ins
// Anthropic-Format (system-Feld, content-Blocks, tool_use/tool_result)
// passiert vollstaendig hier drin in toAnthropicRequest().

// Echte Modellnamen statt der Aliasse "glm-5.2" / "glm-5-turbo": die Aliasse
// werden serverseitig still auf glm-5.3 / glm-5.3-flash gemappt, mit den
// expliziten Namen aendert ein spaeterer Alias-Wechsel bei Z.ai das
// Verhalten hier nicht unbemerkt.
export const BOT_MODEL = "glm-5.3";

// Ausweichmodell, falls das Hauptmodell ausgelastet ist (HTTP 429) oder
// sonst ausfaellt.
export const BOT_MODEL_FALLBACK = "glm-5.3-flash";

const ZAI_URL = "https://api.z.ai/api/anthropic/v1/messages";

// Im Anthropic-Format ist max_tokens Pflicht, es gibt keinen Server-Default.
// Grosszuegig gewaehlt, weil GLM zusaetzlich thinking-Tokens verbraucht, die
// mitzaehlen: reisst die Antwort mitten in einem tool_use ab, ist dessen
// Argument-JSON unvollstaendig und das Werkzeug bekommt leere Argumente.
const MAX_TOKENS = 8192;

// Eigene Fehlerklasse fuer HTTP 429 vom Endpoint -- damit route.ts (und die
// Oberflaeche) ein Rate-Limit von einem echten Fehler unterscheiden koennen,
// ohne den Nachrichtentext zu parsen.
export class RateLimitError extends Error {
  constructor(message = "Das kostenlose Modell ist gerade ausgelastet, versuch es in einer Minute noch einmal.") {
    super(message);
    this.name = "RateLimitError";
  }
}

// Ohne jedes Ereignis 30 Sekunden lang -> abbrechen statt ewig laden.
const IDLE_TIMEOUT_MS = 30_000;

export function botEnabled(): boolean {
  return Boolean(process.env.ZAI_API_KEY);
}

// --- OpenAI-kompatible Nachrichten- und Werkzeugtypen -------------------------
//
// Diese Form bleibt unveraendert, damit route.ts und tools.ts nichts von der
// Umstellung merken. toAnthropicRequest() unten uebersetzt sie erst beim
// Absenden.

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[] | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ChatToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

// Ergebnis eines vollstaendig zusammengesetzten Streams: entweder Text oder
// ein oder mehrere Werkzeugaufrufe (nie beides gleichzeitig bei diesem Modell).
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_calls"; toolCalls: ChatToolCall[] }
  | { type: "done" };

// --- Anthropic-Zieltypen (nur intern) ----------------------------------------

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "url"; url: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
};

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type AnthropicRequest = {
  system: string;
  messages: AnthropicMessage[];
  tools: AnthropicTool[];
};

function textOf(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }
  return "";
}

function userContentBlocks(content: ChatMessage["content"]): AnthropicContentBlock[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  return content.map((p): AnthropicContentBlock =>
    p.type === "image_url"
      ? { type: "image", source: { type: "url", url: p.image_url.url } }
      : { type: "text", text: p.text },
  );
}

// Reine, ohne Netzwerk testbare Uebersetzungsfunktion: OpenAI-Nachrichtenliste
// -> Anthropic-Request-Form ({ system, messages, tools }). Siehe Regeln im
// Auftrag / in den Tests in model.test.ts.
export function toAnthropicRequest(messages: ChatMessage[], tools: ChatTool[]): AnthropicRequest {
  // Nur eine echte system-Nachricht an erster Stelle abziehen. Frueher wurde
  // die erste Nachricht IMMER abgezogen -- eine Anfrage aus nur einer
  // user-Nachricht (explainCard, generateVariant, bewerteAntwort) ging dann
  // ohne Nachrichten an die API und kam als 400 zurueck.
  const hasSystem = messages[0]?.role === "system";
  const system = hasSystem ? textOf(messages[0].content) : "";
  const rest = hasSystem ? messages.slice(1) : messages;

  const out: AnthropicMessage[] = [];

  for (const m of rest) {
    if (m.role === "user") {
      out.push({ role: "user", content: userContentBlocks(m.content) });
      continue;
    }

    if (m.role === "assistant") {
      const blocks: AnthropicContentBlock[] = [];
      const text = textOf(m.content);
      if (text) blocks.push({ type: "text", text });
      for (const call of m.tool_calls ?? []) {
        let input: unknown = {};
        try {
          input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          input = {};
        }
        blocks.push({ type: "tool_use", id: call.id, name: call.function.name, input });
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    if (m.role === "tool") {
      const block: AnthropicContentBlock = {
        type: "tool_result",
        tool_use_id: m.tool_call_id ?? "",
        content: textOf(m.content),
      };
      // Mehrere aufeinanderfolgende tool-Nachrichten muessen in EINE
      // user-Nachricht mit mehreren tool_result-Bloecken zusammengefasst
      // werden, sonst lehnt die API ab.
      const last = out[out.length - 1];
      if (last && last.role === "user" && last.content.every((c) => c.type === "tool_result")) {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
      continue;
    }

    // role "system" taucht hier nicht mehr auf, wurde oben schon abgezogen.
  }

  const anthropicTools: AnthropicTool[] = tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  return { system, messages: out, tools: anthropicTools };
}

// Setzt stueckweise ankommende tool_use-Bloecke zusammen (Anthropic streamt
// deren input als input_json_delta-Text-Fragmente ueber den content-block-
// Index). Eigene Funktion, damit sie ohne Netzwerk testbar ist.
export type ToolCallAccumulator = Map<number, { id: string; name: string; arguments: string }>;

export function applyToolCallDelta(
  acc: ToolCallAccumulator,
  index: number,
  delta: { id?: string; name?: string; arguments?: string },
): void {
  const existing = acc.get(index) ?? { id: "", name: "", arguments: "" };
  if (delta.id) existing.id = delta.id;
  if (delta.name) existing.name += delta.name;
  if (delta.arguments) existing.arguments += delta.arguments;
  acc.set(index, existing);
}

export function finishedToolCalls(acc: ToolCallAccumulator): ChatToolCall[] {
  return [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, v]) => ({
      id: v.id,
      type: "function" as const,
      function: { name: v.name, arguments: v.arguments },
    }));
}

// Ruft das Modell streamend auf und liefert bereits geparste SSE-Ereignisse.
// Ein Aufruf entspricht einer Modell-Runde: entweder Text (moeglicherweise in
// mehreren delta-Stuecken) oder fertige Werkzeugaufruf(e) am Ende.
export async function* streamChat(
  messages: ChatMessage[],
  tools: ChatTool[],
  signal?: AbortSignal,
  model: string = BOT_MODEL,
): AsyncGenerator<StreamEvent> {
  const key = process.env.ZAI_API_KEY;
  if (!key) throw new Error("Der Atlas-Bot ist noch nicht eingerichtet. Dafür fehlt der Schlüssel ZAI_API_KEY.");

  const { system, messages: anthropicMessages, tools: anthropicTools } = toAnthropicRequest(messages, tools);

  const idleController = new AbortController();
  const onOuterAbort = () => idleController.abort();
  signal?.addEventListener("abort", onOuterAbort);

  let idleFired = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleFired = true;
      idleController.abort();
    }, IDLE_TIMEOUT_MS);
  };

  let res: Response;
  try {
    resetIdleTimer();
    res = await fetch(ZAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        stream: true,
        system,
        messages: anthropicMessages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      }),
      signal: idleController.signal,
    });
  } catch (err) {
    if (idleTimer) clearTimeout(idleTimer);
    signal?.removeEventListener("abort", onOuterAbort);
    if (idleFired)
      throw new Error("Der Bot hat zu lange nicht geantwortet. Bitte gleich nochmal versuchen.");
    if (signal?.aborted) throw err;
    throw new Error("Der Bot war nicht erreichbar. Bitte gleich nochmal versuchen.");
  }

  if (!res.ok || !res.body) {
    if (idleTimer) clearTimeout(idleTimer);
    signal?.removeEventListener("abort", onOuterAbort);
    if (res.status === 429) throw new RateLimitError();
    throw new Error(`Der Bot hat mit einem Fehler geantwortet (Status ${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const toolAcc: ToolCallAccumulator = new Map();
  let buffer = "";

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (idleFired)
          throw new Error("Der Bot hat zu lange nicht geantwortet. Bitte gleich nochmal versuchen.");
        if (signal?.aborted) throw err;
        throw new Error("Die Verbindung zum Bot ist beim Streamen abgebrochen.");
      }
      if (chunk.done) break;
      resetIdleTimer();

      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue; // Kaputte Zeile ueberspringen statt abzustuerzen.
        }
        if (!isObj(parsed)) continue;
        const eventType = parsed.type;

        if (eventType === "content_block_start") {
          const block = parsed.content_block;
          const index = parsed.index;
          if (isObj(block) && typeof index === "number" && block.type === "tool_use") {
            applyToolCallDelta(toolAcc, index, {
              id: typeof block.id === "string" ? block.id : undefined,
              name: typeof block.name === "string" ? block.name : undefined,
            });
          }
          continue;
        }

        if (eventType === "content_block_delta") {
          const delta = parsed.delta;
          const index = parsed.index;
          if (!isObj(delta) || typeof index !== "number") continue;

          // thinking-Bloecke (delta.type "thinking_delta") werden als eigenes
          // Ereignis durchgereicht -- die Oberflaeche zeigt den Gedankengang
          // gedaempft an, waehrend die eigentliche Antwort noch laedt.
          if (delta.type === "thinking_delta" && typeof delta.thinking === "string" && delta.thinking.length > 0) {
            yield { type: "thinking", delta: delta.thinking };
          } else if (delta.type === "text_delta" && typeof delta.text === "string" && delta.text.length > 0) {
            yield { type: "text", delta: delta.text };
          } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
            applyToolCallDelta(toolAcc, index, { arguments: delta.partial_json });
          }
          continue;
        }

        if (eventType === "message_stop") {
          if (toolAcc.size > 0) yield { type: "tool_calls", toolCalls: finishedToolCalls(toolAcc) };
          yield { type: "done" };
          return;
        }

        // message_start, ping, content_block_stop, message_delta: keine
        // eigene Behandlung noetig.
      }
    }
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    signal?.removeEventListener("abort", onOuterAbort);
    reader.releaseLock();
  }

  if (toolAcc.size > 0) yield { type: "tool_calls", toolCalls: finishedToolCalls(toolAcc) };
  yield { type: "done" };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Ruft das Hauptmodell auf. Scheitert schon der allererste Schritt -- also
// bevor irgendein Ereignis den Aufrufer erreicht hat, etwa weil das
// Hauptmodell gerade ausgelastet ist (429) oder gar nicht antwortet --, wird
// GENAU EINMAL automatisch das Ausweichmodell probiert. Ist bereits ein
// Ereignis unterwegs, wird nicht mehr gewechselt: der Nutzer haette sonst
// angefangenen Text doppelt oder abgerissen gesehen.
export async function* streamChatWithFallback(
  messages: ChatMessage[],
  tools: ChatTool[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const primary = streamChat(messages, tools, signal, BOT_MODEL);
  let first: IteratorResult<StreamEvent>;
  try {
    first = await primary.next();
  } catch (err) {
    if (signal?.aborted) throw err;
    yield* streamChat(messages, tools, signal, BOT_MODEL_FALLBACK);
    return;
  }
  if (!first.done) yield first.value;
  yield* primary;
}
