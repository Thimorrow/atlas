import { describe, expect, it } from "vitest";
import { toModelMessages } from "./history";
import type { MessageDTO } from "./store";

function msg(partial: Partial<MessageDTO>): MessageDTO {
  return {
    id: "id",
    role: "user",
    content: "",
    toolName: null,
    toolArgs: null,
    toolResult: null,
    createdAt: "2026-09-04T10:00:00.000Z",
    ...partial,
  };
}

describe("toModelMessages", () => {
  it("stellt den Systemprompt immer voran", () => {
    const result = toModelMessages([], "Du bist Atlas.");
    expect(result).toEqual([{ role: "system", content: "Du bist Atlas." }]);
  });

  it("aeltere Zuege (vor den letzten sechs Nutzerfragen) behalten nur den Text, keine Werkzeugergebnisse", () => {
    const history: MessageDTO[] = [
      msg({ id: "1", role: "user", content: "Frage eins" }),
      msg({ id: "2", role: "tool", toolName: "faecher_lesen", toolArgs: {}, toolResult: { faecher: [] } }),
      msg({ id: "3", role: "assistant", content: "Antwort eins" }),
      msg({ id: "4", role: "user", content: "Frage zwei" }),
      msg({ id: "5", role: "assistant", content: "Antwort zwei" }),
      msg({ id: "6", role: "user", content: "Frage drei" }),
      msg({ id: "7", role: "assistant", content: "Antwort drei" }),
      msg({ id: "8", role: "user", content: "Frage vier" }),
      msg({ id: "9", role: "assistant", content: "Antwort vier" }),
      msg({ id: "10", role: "user", content: "Frage fuenf" }),
      msg({ id: "11", role: "assistant", content: "Antwort fuenf" }),
      msg({ id: "12", role: "user", content: "Frage sechs" }),
      msg({ id: "13", role: "assistant", content: "Antwort sechs" }),
      msg({ id: "14", role: "user", content: "Frage sieben" }),
      msg({ id: "15", role: "assistant", content: "Antwort sieben" }),
    ];

    const result = toModelMessages(history, "System");
    // Frage eins ist die siebtletzte Nutzerfrage -- ihr Werkzeugergebnis
    // (Nachricht 2) faellt weg, nur user/assistant-Text bleibt.
    expect(result).toEqual([
      { role: "system", content: "System" },
      { role: "user", content: "Frage eins" },
      { role: "assistant", content: "Antwort eins" },
      { role: "user", content: "Frage zwei" },
      { role: "assistant", content: "Antwort zwei" },
      { role: "user", content: "Frage drei" },
      { role: "assistant", content: "Antwort drei" },
      { role: "user", content: "Frage vier" },
      { role: "assistant", content: "Antwort vier" },
      { role: "user", content: "Frage fuenf" },
      { role: "assistant", content: "Antwort fuenf" },
      { role: "user", content: "Frage sechs" },
      { role: "assistant", content: "Antwort sechs" },
      { role: "user", content: "Frage sieben" },
      { role: "assistant", content: "Antwort sieben" },
    ]);
  });

  it("gibt fuer die letzten sechs Nutzerfragen die Werkzeugaufrufe als synthetische tool_calls mit", () => {
    const history: MessageDTO[] = [
      msg({ id: "1", role: "user", content: "Was steht an?" }),
      msg({
        id: "2",
        role: "tool",
        toolName: "aufgaben_lesen",
        toolArgs: { nurOffen: true },
        toolResult: { aufgaben: [{ id: "a1", title: "Buch S. 12" }] },
      }),
      msg({ id: "3", role: "assistant", content: "Du hast eine Aufgabe offen." }),
    ];

    const result = toModelMessages(history, "System");
    expect(result).toEqual([
      { role: "system", content: "System" },
      { role: "user", content: "Was steht an?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "hist_2",
            type: "function",
            function: { name: "aufgaben_lesen", arguments: JSON.stringify({ nurOffen: true }) },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "hist_2",
        name: "aufgaben_lesen",
        content: JSON.stringify({ aufgaben: [{ id: "a1", title: "Buch S. 12" }] }),
      },
      { role: "assistant", content: "Du hast eine Aufgabe offen." },
    ]);
  });

  it("buendelt mehrere aufeinanderfolgende Werkzeugaufrufe einer Runde in einer assistant-Nachricht", () => {
    const history: MessageDTO[] = [
      msg({ id: "1", role: "user", content: "Leg eine Mathe-Aufgabe an." }),
      msg({ id: "2", role: "tool", toolName: "faecher_lesen", toolArgs: {}, toolResult: { faecher: [] } }),
      msg({
        id: "3",
        role: "tool",
        toolName: "aufgabe_anlegen",
        toolArgs: { titel: "Buch S. 12" },
        toolResult: { aufgabe: { id: "a1" } },
      }),
      msg({ id: "4", role: "assistant", content: "Erledigt." }),
    ];

    const result = toModelMessages(history, "System");
    expect(result[2]).toMatchObject({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "hist_2", type: "function", function: { name: "faecher_lesen" } },
        { id: "hist_3", type: "function", function: { name: "aufgabe_anlegen" } },
      ],
    });
    expect(result[3]).toMatchObject({ role: "tool", tool_call_id: "hist_2", name: "faecher_lesen" });
    expect(result[4]).toMatchObject({ role: "tool", tool_call_id: "hist_3", name: "aufgabe_anlegen" });
    expect(result[5]).toEqual({ role: "assistant", content: "Erledigt." });
  });

  it("kuerzt ein sehr langes Werkzeugergebnis auf 8000 Zeichen mit Hinweis", () => {
    const langesErgebnis = { text: "x".repeat(9000) };
    const history: MessageDTO[] = [
      msg({ id: "1", role: "user", content: "Lies die Datei." }),
      msg({ id: "2", role: "tool", toolName: "datei_lesen", toolArgs: {}, toolResult: langesErgebnis }),
      msg({ id: "3", role: "assistant", content: "Fertig." }),
    ];

    const result = toModelMessages(history, "System");
    const toolMessage = result.find((m) => m.role === "tool");
    expect(typeof toolMessage?.content).toBe("string");
    const content = toolMessage!.content as string;
    expect(content.length).toBeLessThan(JSON.stringify(langesErgebnis).length);
    expect(content.endsWith("… [gekuerzt]")).toBe(true);
  });

  it("gibt alle Werkzeugergebnisse mit, wenn es insgesamt weniger als sechs Nutzerfragen gibt", () => {
    const history: MessageDTO[] = [
      msg({ id: "1", role: "user", content: "Frage eins" }),
      msg({ id: "2", role: "tool", toolName: "faecher_lesen", toolArgs: {}, toolResult: { faecher: [] } }),
      msg({ id: "3", role: "assistant", content: "Antwort eins" }),
    ];

    const result = toModelMessages(history, "System");
    expect(result.some((m) => m.role === "tool")).toBe(true);
  });
});
