// Zerlegt den NDJSON-Stream aus POST /api/bot in einzelne Ereignisse. Reine
// Logik ohne fetch/DOM -- die Oberflaeche liest die rohen Chunks selbst und
// reicht sie hierher, damit sich das Parsen ohne echten Stream testen laesst.

export type BotStreamEvent =
  | { type: "status"; text: string }
  | { type: "text"; delta: string }
  | { type: "action"; tool: string; result: unknown }
  | { type: "proposal"; kind: "grade"; data: unknown }
  | { type: "error"; text: string }
  | { type: "done"; conversationId: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Prueft nur die Form, nicht den Inhalt der Payloads (result/data sind
// bewusst `unknown` -- ihre Form haengt vom jeweiligen Werkzeug ab).
function isValidEvent(v: unknown): v is BotStreamEvent {
  if (!isObj(v) || typeof v.type !== "string") return false;
  switch (v.type) {
    case "status":
    case "error":
      return typeof v.text === "string";
    case "text":
      return typeof v.delta === "string";
    case "action":
      return typeof v.tool === "string" && "result" in v;
    case "proposal":
      return v.kind === "grade" && "data" in v;
    case "done":
      return typeof v.conversationId === "string";
    default:
      return false;
  }
}

// Eine einzelne NDJSON-Zeile -> Ereignis, oder null bei Leerzeile/kaputtem
// JSON. Kaputte Zeilen sollen den Stream nicht abreissen lassen.
export function parseBotEvent(line: string): BotStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isValidEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Zerlegt einen gewachsenen Puffer an Zeilenumbruechen. Die letzte, noch
// unvollstaendige Zeile bleibt als Rest stehen -- der Aufrufer haengt sie vor
// den naechsten Chunk.
export function splitNDJSON(buffer: string): { lines: string[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  return { lines, rest };
}
