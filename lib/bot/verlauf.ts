// Reine Ableitungen fuer den Bot-Verlauf (app/bot/verlauf): ob ein Gespraech
// geschrieben hat, ein anzeigbarer Titel, ruhige Klartexte fuer lesende
// Werkzeuge, ein "wann war das" -- und die Gruppierung der flachen
// Nachrichtenliste in Zuege (Frage -> Werkzeuge -> Antwort). Keine Datenbank
// hier: die existiert-noch-Pruefung und das Laden selbst passieren in der
// API-Route, die diese Bausteine benutzt.

import type { MessageDTO } from "@/lib/bot/store";

// Dieselben vier Werkzeuge wie WRITE_TOOLS in app/api/bot/route.ts -- nur bei
// denen entsteht eine Aktions-Karte statt einer ruhigen Zeile.
export const WRITE_TOOLS = new Set(["aufgabe_anlegen", "aufgabe_aendern", "notiz_anlegen", "notiz_aendern"]);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Ein Werkzeugaufruf zaehlt als erfolgreiches Schreiben, wenn er eines der
// vier Schreib-Werkzeuge ist UND kein Fehlerergebnis zurueckgab -- ein
// gescheiterter Versuch (z. B. "titel darf nicht leer sein") ist kein
// nachweisbares Anlegen und bekommt keine Karte.
export function isWriteToolMessage(m: Pick<MessageDTO, "role" | "toolName" | "toolResult">): boolean {
  if (m.role !== "tool" || !m.toolName) return false;
  if (!WRITE_TOOLS.has(m.toolName)) return false;
  return isObj(m.toolResult) && !("error" in m.toolResult);
}

// Fuer die Gespraechsliste: unterscheidet auf einen Blick ein Gespraech, in
// dem etwas angelegt/geaendert wurde, von einem reinen Frage-Antwort-Gespraech.
export function conversationHasWrites(
  messages: Array<Pick<MessageDTO, "role" | "toolName" | "toolResult">>,
): boolean {
  return messages.some(isWriteToolMessage);
}

// Titel kommt aus der ersten Nutzerfrage (lib/bot/store.ts, setTitleIfEmpty)
// und ist nie leer, sobald mindestens eine Nachricht da ist -- der Fallback
// greift nur, falls doch einmal ein Gespraech ohne Titel auftaucht.
export function displayTitle(title: string | null): string {
  const trimmed = title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Ohne Titel";
}

// Ruhiger Klartext in der Vergangenheitsform fuer ein lesendes Werkzeug --
// das Gegenstueck zu statusTextFor in lib/bot/tools.ts, nur rueckblickend
// statt waehrend des Laufens. `failed` faengt den Fall ab, dass eines der
// vier Schreib-Werkzeuge mit einem Fehler zurueckkam: "hat eine Aufgabe
// angelegt" waere dann schlicht falsch -- ehrlich bleiben heisst hier, den
// gescheiterten Versuch auch als gescheitert zu benennen.
export function toolPastLabel(tool: string, args: unknown, failed = false): string {
  if (failed && WRITE_TOOLS.has(tool)) return `${toolPastLabel(tool, args)} (fehlgeschlagen)`;
  const fach = isObj(args) && typeof args.fach === "string" ? args.fach : undefined;
  switch (tool) {
    case "stundenplan_lesen":
      return "hat den Stundenplan gelesen";
    case "aufgaben_lesen":
      return fach ? `hat Aufgaben in ${fach} gelesen` : "hat die Aufgaben gelesen";
    case "faecher_lesen":
      return "hat die Fächerliste gelesen";
    case "notizen_lesen":
      return fach ? `hat Notizen in ${fach} gelesen` : "hat die Notizen gelesen";
    case "noten_lesen":
      return fach ? `hat Noten in ${fach} gelesen` : "hat die Noten gelesen";
    case "dateien_auflisten":
      return fach ? `hat Dateien in ${fach} aufgelistet` : "hat die Dateien aufgelistet";
    case "datei_lesen":
      return "hat eine Datei gelesen";
    case "note_vorschlagen":
      return "hat einen Notenvorschlag gemacht";
    case "aufgabe_anlegen":
      return "hat eine Aufgabe angelegt";
    case "aufgabe_aendern":
      return "hat eine Aufgabe geändert";
    case "notiz_anlegen":
      return "hat eine Notiz angelegt";
    case "notiz_aendern":
      return "hat eine Notiz geändert";
    default:
      return `hat ${tool} ausgeführt`;
  }
}

// "Heute, 14:32 Uhr" / "Gestern, ..." / volles Datum -- `now` ist ein
// Parameter, damit sich das ohne echten Systemtakt testen laesst.
export function formatConversationWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (Number.isNaN(d.getTime())) return iso;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (d.toDateString() === now.toDateString()) return `Heute, ${time} Uhr`;
  if (d.toDateString() === yesterday.toDateString()) return `Gestern, ${time} Uhr`;

  const date = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${date}, ${time} Uhr`;
}

// --- Zuege ------------------------------------------------------------------

export type HistoryItem =
  | { kind: "write"; id: string; tool: string; result: Record<string, unknown> }
  | { kind: "read"; id: string; tool: string; label: string; args: unknown; result: unknown };

export type HistoryTurn = {
  id: string;
  userText: string | null;
  assistantText: string;
  items: HistoryItem[];
};

// Zerlegt die flache, zeitlich sortierte Nachrichtenliste eines Gespraechs in
// Zuege: eine Nutzerfrage, die Werkzeuge, die der Bot dabei ausgefuehrt hat,
// und die Antwort. app/api/bot/route.ts speichert pro Runde hoechstens eine
// Antwort-Nachricht (die letzte, ohne weitere Werkzeugaufrufe), Zwischentexte
// aus Runden mit Werkzeugaufrufen landen nicht einzeln in der Datenbank --
// darum reicht ein einzelnes assistantText-Feld je Zug.
export function groupMessagesIntoTurns(messages: MessageDTO[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  let current: HistoryTurn | null = null;

  const ensureCurrent = (): HistoryTurn => {
    if (!current) {
      current = { id: `zug-${turns.length}`, userText: null, assistantText: "", items: [] };
      turns.push(current);
    }
    return current;
  };

  for (const m of messages) {
    if (m.role === "user") {
      current = { id: m.id, userText: m.content, assistantText: "", items: [] };
      turns.push(current);
    } else if (m.role === "assistant") {
      const t = ensureCurrent();
      t.assistantText = t.assistantText ? `${t.assistantText}\n\n${m.content}` : m.content;
    } else if (m.role === "tool" && m.toolName) {
      const t = ensureCurrent();
      if (isWriteToolMessage(m)) {
        t.items.push({ kind: "write", id: m.id, tool: m.toolName, result: m.toolResult as Record<string, unknown> });
      } else {
        const failed = WRITE_TOOLS.has(m.toolName) && isObj(m.toolResult) && "error" in m.toolResult;
        t.items.push({
          kind: "read",
          id: m.id,
          tool: m.toolName,
          label: toolPastLabel(m.toolName, m.toolArgs, failed),
          args: m.toolArgs,
          result: m.toolResult,
        });
      }
    }
  }

  return turns;
}
