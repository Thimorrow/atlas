// Baut aus der gespeicherten Nachrichtenliste eines Gespraechs die
// Modell-Nachrichten (lib/bot/model.ts ChatMessage[]). Reine, testbare
// Funktion -- app/api/bot/route.ts ruft sie nur noch auf.
//
// Fuer die letzten drei Nutzerfragen (ab der drittletzten role: "user")
// werden auch die dabei gelaufenen Werkzeuge wieder mitgegeben, als
// synthetische assistant-Nachricht mit tool_calls plus die passenden
// tool-Antworten -- sonst "vergisst" das Modell im naechsten Zug, was ein
// Werkzeug gerade herausgefunden hat. Aeltere Zuege bleiben wie bisher nur
// Text, sonst waechst der Kontext unbegrenzt.

import type { ChatMessage, ChatToolCall } from "@/lib/bot/model";
import type { MessageDTO } from "@/lib/bot/store";

const MAX_TOOL_RESULT_CHARS = 4000;
const RECENT_USER_TURNS = 3;

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

  let i = 0;
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
      // Vor dem Fenster der letzten drei Nutzerfragen: Werkzeugergebnis
      // faellt weg, nur der Text der Runde bleibt (bisheriges Verhalten).
      if (i < cutoff) {
        i++;
        continue;
      }

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
          content: truncate(JSON.stringify(t.toolResult)),
        });
      }
      continue;
    }

    i++;
  }

  return messages;
}
