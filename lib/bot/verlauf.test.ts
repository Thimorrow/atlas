import { describe, expect, it } from "vitest";
import {
  conversationHasWrites,
  displayTitle,
  formatConversationWhen,
  groupMessagesIntoTurns,
  isWriteToolMessage,
  toolPastLabel,
} from "./verlauf";
import type { MessageDTO } from "./store";

function msg(partial: Partial<MessageDTO>): MessageDTO {
  return {
    id: "id",
    role: "user",
    content: "",
    toolName: null,
    toolArgs: null,
    toolResult: null,
    createdAt: "2026-09-02T10:00:00.000Z",
    ...partial,
  };
}

describe("isWriteToolMessage", () => {
  it("erkennt ein erfolgreiches Anlegen", () => {
    expect(
      isWriteToolMessage(
        msg({ role: "tool", toolName: "aufgabe_anlegen", toolResult: { aufgabe: { id: "a1" } } }),
      ),
    ).toBe(true);
  });

  it("zählt ein Fehlerergebnis nicht als Schreiben", () => {
    expect(
      isWriteToolMessage(msg({ role: "tool", toolName: "aufgabe_anlegen", toolResult: { error: "titel fehlt" } })),
    ).toBe(false);
  });

  it("zählt ein lesendes Werkzeug nicht als Schreiben", () => {
    expect(
      isWriteToolMessage(msg({ role: "tool", toolName: "aufgaben_lesen", toolResult: { aufgaben: [] } })),
    ).toBe(false);
  });

  it("ignoriert Nachrichten, die keine Werkzeugnachricht sind", () => {
    expect(isWriteToolMessage(msg({ role: "assistant", content: "Klar." }))).toBe(false);
  });
});

describe("conversationHasWrites", () => {
  it("ist wahr, sobald irgendwo im Gespräch geschrieben wurde", () => {
    const messages = [
      msg({ role: "user", content: "Leg eine Aufgabe an." }),
      msg({ role: "tool", toolName: "aufgabe_anlegen", toolResult: { aufgabe: { id: "a1" } } }),
      msg({ role: "assistant", content: "Erledigt." }),
    ];
    expect(conversationHasWrites(messages)).toBe(true);
  });

  it("ist falsch für ein reines Frage-Antwort-Gespräch", () => {
    const messages = [
      msg({ role: "user", content: "Was steht an?" }),
      msg({ role: "tool", toolName: "aufgaben_lesen", toolResult: { aufgaben: [] } }),
      msg({ role: "assistant", content: "Nichts." }),
    ];
    expect(conversationHasWrites(messages)).toBe(false);
  });
});

describe("displayTitle", () => {
  it("gibt den getrimmten Titel zurück", () => {
    expect(displayTitle("  Was steht an?  ")).toBe("Was steht an?");
  });

  it("fällt bei fehlendem Titel auf einen Platzhalter zurück", () => {
    expect(displayTitle(null)).toBe("Ohne Titel");
    expect(displayTitle("   ")).toBe("Ohne Titel");
  });
});

describe("toolPastLabel", () => {
  it("nennt das Fach, wenn eins mitgegeben wurde", () => {
    expect(toolPastLabel("notizen_lesen", { fach: "Mathe" })).toBe("hat Notizen in Mathe gelesen");
  });

  it("fällt ohne Fach auf die allgemeine Formulierung zurück", () => {
    expect(toolPastLabel("notizen_lesen", {})).toBe("hat die Notizen gelesen");
  });

  it("kennt jedes Werkzeug mit einem eigenen Klartext", () => {
    expect(toolPastLabel("stundenplan_lesen", {})).toBe("hat den Stundenplan gelesen");
    expect(toolPastLabel("unbekanntes_werkzeug", {})).toBe("hat unbekanntes_werkzeug ausgeführt");
  });

  it("kennzeichnet einen gescheiterten Schreibversuch als gescheitert", () => {
    expect(toolPastLabel("aufgabe_anlegen", {}, true)).toBe("hat eine Aufgabe angelegt (fehlgeschlagen)");
  });
});

describe("formatConversationWhen", () => {
  // Feste Zeitpunkte mit Zonenangabe: das Ergebnis ist die deutsche Lesart,
  // egal in welcher Zeitzone der Testrechner (oder Vercel) laeuft.
  const now = new Date("2026-09-02T18:00:00+02:00");

  it("erkennt heute", () => {
    expect(formatConversationWhen("2026-09-02T09:05:00+02:00", now)).toBe("Heute, 09:05 Uhr");
  });

  it("erkennt gestern", () => {
    expect(formatConversationWhen("2026-09-01T22:15:00+02:00", now)).toBe("Gestern, 22:15 Uhr");
  });

  it("erkennt gestern auch, wenn es in UTC noch derselbe Tag ist", () => {
    expect(formatConversationWhen("2026-09-01T23:30:00+02:00", now)).toBe("Gestern, 23:30 Uhr");
  });

  it("zeigt bei älteren Gesprächen das volle Datum", () => {
    expect(formatConversationWhen("2026-08-20T07:00:00+02:00", now)).toBe("20.08.2026, 07:00 Uhr");
  });
});

describe("groupMessagesIntoTurns", () => {
  it("gruppiert Frage, Werkzeuge und Antwort in einen Zug", () => {
    const messages: MessageDTO[] = [
      msg({ id: "1", role: "user", content: "Leg eine Mathe-Aufgabe an." }),
      msg({ id: "2", role: "tool", toolName: "faecher_lesen", toolResult: { faecher: [] } }),
      msg({
        id: "3",
        role: "tool",
        toolName: "aufgabe_anlegen",
        toolArgs: { titel: "Buch S. 12" },
        toolResult: { aufgabe: { id: "a1", title: "Buch S. 12" } },
      }),
      msg({ id: "4", role: "assistant", content: "Erledigt." }),
    ];

    const turns = groupMessagesIntoTurns(messages);
    expect(turns).toHaveLength(1);
    expect(turns[0].userText).toBe("Leg eine Mathe-Aufgabe an.");
    expect(turns[0].assistantText).toBe("Erledigt.");
    expect(turns[0].items).toHaveLength(2);
    expect(turns[0].items[0]).toMatchObject({ kind: "read", tool: "faecher_lesen" });
    expect(turns[0].items[1]).toMatchObject({ kind: "write", tool: "aufgabe_anlegen" });
  });

  it("startet für jede Nutzerfrage einen neuen Zug", () => {
    const messages: MessageDTO[] = [
      msg({ id: "1", role: "user", content: "Frage eins" }),
      msg({ id: "2", role: "assistant", content: "Antwort eins" }),
      msg({ id: "3", role: "user", content: "Frage zwei" }),
      msg({ id: "4", role: "assistant", content: "Antwort zwei" }),
    ];

    const turns = groupMessagesIntoTurns(messages);
    expect(turns).toHaveLength(2);
    expect(turns[0].userText).toBe("Frage eins");
    expect(turns[1].userText).toBe("Frage zwei");
  });

  it("kommt ohne Absturz aus, wenn eine Werkzeugnachricht ganz ohne vorherige Nutzerfrage steht", () => {
    const messages: MessageDTO[] = [
      msg({ id: "1", role: "tool", toolName: "aufgaben_lesen", toolResult: { aufgaben: [] } }),
    ];
    const turns = groupMessagesIntoTurns(messages);
    expect(turns).toHaveLength(1);
    expect(turns[0].userText).toBeNull();
    expect(turns[0].items).toHaveLength(1);
  });

  it("zeigt einen gescheiterten Schreibversuch als ruhige Zeile mit Hinweis, nicht als Karte", () => {
    const messages: MessageDTO[] = [
      msg({ id: "1", role: "user", content: "Leg eine Aufgabe ohne Titel an." }),
      msg({ id: "2", role: "tool", toolName: "aufgabe_anlegen", toolResult: { error: "titel darf nicht leer sein." } }),
      msg({ id: "3", role: "assistant", content: "Das ging nicht." }),
    ];
    const turns = groupMessagesIntoTurns(messages);
    expect(turns[0].items).toEqual([
      {
        kind: "read",
        id: "2",
        tool: "aufgabe_anlegen",
        label: "hat eine Aufgabe angelegt (fehlgeschlagen)",
        args: null,
        result: { error: "titel darf nicht leer sein." },
      },
    ]);
  });
});
