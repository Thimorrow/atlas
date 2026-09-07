// Baut aus der gespeicherten Nachrichtenliste eines Gespraechs die
// Modell-Nachrichten (lib/bot/model.ts ChatMessage[]). Reine, testbare
// Funktion -- app/api/bot/route.ts ruft sie nur noch auf.
//
// Die letzten sechs Nutzerzüge mit Werkzeugpaaren erhalten; ältere ganze Züge
// entfallen zusätzlich bei Überschreitung des Gesamtbudgets.

import type { ChatMessage, ChatToolCall } from "@/lib/bot/model";
import type { MessageDTO } from "@/lib/bot/store";

const MAX_TOOL_RESULT_CHARS = 8000;
const RECENT_USER_TURNS = 6;
const MAX_HISTORY_CHARS = 60_000;

// Bilder werden nur im aktuellen Modellaufruf übertragen, nie als Base64-Protokoll.
export function storedToolResult(result: unknown): unknown {
  if (typeof result !== "object" || result === null) return result;
  const value = result as Record<string, unknown>;
  const content = value.inhalt;
  if (typeof content !== "object" || content === null || (content as Record<string, unknown>).typ !== "bild") return result;
  const { url: _url, ...metadata } = content as Record<string, unknown>;
  return { ...value, inhalt: { ...metadata, hinweis: "Bildinhalt nicht im Verlauf gespeichert. Für weitere Bildfragen datei_lesen mit der ursprünglichen Datei-ID erneut aufrufen." } };
}

function truncate(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… [gekürzt]`;
}

export function toModelMessages(history: MessageDTO[], systemPrompt: string): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  const userIndices: number[] = [];
  history.forEach((m, i) => {
    if (m.role === "user") userIndices.push(i);
  });
  const cutoff = userIndices.length >= RECENT_USER_TURNS ? userIndices[userIndices.length - RECENT_USER_TURNS] : 0;

  let i = cutoff;
  while (i < history.length) {
    const m = history[i];

    if (m.role === "user" && m.content) {
      messages.push({ role: "user", content: m.content });
      i++;
      continue;
    }

    if (m.role === "assistant" && m.content) {
      messages.push({ role: "assistant", content: m.content });
      i++;
      continue;
    }

    if (m.role === "tool" && m.toolName) {
      // Aufeinanderfolgende Werkzeugnachrichten derselben Runde in EINE
      // assistant-Nachricht mit mehreren tool_calls buendeln, gefolgt von
      // den passenden tool-Antworten in gleicher Reihenfolge.
      const bundle: MessageDTO[] = [];
      while (i < history.length && history[i].role === "tool" && history[i].toolName) {
        bundle.push(history[i]);
        i++;
      }

      const toolCalls: ChatToolCall[] = bundle.map((t) => ({
        id: `hist_${t.id}`,
        type: "function",
        function: { name: t.toolName as string, arguments: JSON.stringify(t.toolArgs ?? {}) },
      }));
      messages.push({ role: "assistant", content: null, tool_calls: toolCalls });

      for (const t of bundle) {
        messages.push({
          role: "tool",
          tool_call_id: `hist_${t.id}`,
          name: t.toolName as string,
          content: truncate(JSON.stringify(storedToolResult(t.toolResult))),
        });
      }
      continue;
    }

    i++;
  }

  // Ganze ältere Nutzerzüge entfernen, damit Werkzeugpaare zusammenbleiben.
  while (JSON.stringify(messages.slice(1)).length > MAX_HISTORY_CHARS) {
    const nextUser = messages.findIndex((m, index) => index > 1 && m.role === "user");
    if (nextUser < 0) {
      throw new Error("Diese Anfrage enthält zu viel Kontext. Bitte ein neues Gespräch mit einer kürzeren Anfrage starten.");
    }
    messages.splice(1, nextUser - 1);
  }
  return messages;
}
