// Duenne Huelle um den Vercel AI Gateway (OpenAI-kompatibel).
//
// Bewusst kein AI-SDK-Paket: der Gateway spricht stinknormales OpenAI-Format,
// ein fetch + eigener SSE-Parser reicht und spart eine Abhaengigkeit samt
// Versionsrisiko. Getestet ist, dass Tool-Aufrufe beim Streamen stueckweise
// ankommen (delta.tool_calls[i].function.arguments) und ueber den Index
// zusammengesetzt werden muessen -- genau das macht streamChat hier.

export const BOT_MODEL = "minimax/minimax-m3-free";

// Ausweichmodell, falls das Hauptmodell ausgelastet ist (HTTP 429) oder
// sonst ausfaellt -- ebenfalls kostenlos, kann ebenfalls Werkzeuge aufrufen.
// Geprueft per echtem Aufruf (siehe Session-Notizen): antwortet mit
// "cost": 0 und ruft ein Testwerkzeug korrekt mit Argumenten auf. Von den
// drei kandidierten kostenlosen Modellen war es das einzige, das den
// Werkzeugaufruf tatsaechlich ausloest statt die Antwort zu erraten
// (poolside/laguna-s-2.1-free antwortete direkt ohne Werkzeug,
// inclusionai/ling-3.0-flash-fin-free war selbst sofort limitiert).
export const BOT_MODEL_FALLBACK = "minimax/minimax-m2.7-free";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

// Eigene Fehlerklasse fuer HTTP 429 vom Gateway -- damit route.ts (und die
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
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

// --- OpenAI-kompatible Nachrichten- und Werkzeugtypen -------------------------

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
  | { type: "tool_calls"; toolCalls: ChatToolCall[] }
  | { type: "done" };

// Setzt stueckweise ankommende tool_calls-Deltas zusammen. Eigene Funktion,
// damit sie ohne Netzwerk testbar ist (siehe model.test.ts).
export type ToolCallAccumulator = Map<number, { id: string; name: string; arguments: string }>;

export function applyToolCallDelta(
  acc: ToolCallAccumulator,
  deltas: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>,
): void {
  for (const d of deltas) {
    const existing = acc.get(d.index) ?? { id: "", name: "", arguments: "" };
    if (d.id) existing.id = d.id;
    if (d.function?.name) existing.name += d.function.name;
    if (d.function?.arguments) existing.arguments += d.function.arguments;
    acc.set(d.index, existing);
  }
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
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("Der Bot ist nicht eingerichtet (kein AI_GATEWAY_API_KEY).");

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
    res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages,
        tools: tools.length > 0 ? tools : undefined,
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
        if (data === "[DONE]") {
          if (toolAcc.size > 0) yield { type: "tool_calls", toolCalls: finishedToolCalls(toolAcc) };
          yield { type: "done" };
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue; // Kaputte Zeile ueberspringen statt abzustuerzen.
        }

        const delta = (parsed as { choices?: Array<{ delta?: Record<string, unknown> }> })
          .choices?.[0]?.delta;
        if (!delta) continue;

        if (typeof delta.content === "string" && delta.content.length > 0) {
          yield { type: "text", delta: delta.content };
        }

        const toolCallDeltas = delta.tool_calls as
          | Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
          | undefined;
        if (toolCallDeltas) applyToolCallDelta(toolAcc, toolCallDeltas);
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
