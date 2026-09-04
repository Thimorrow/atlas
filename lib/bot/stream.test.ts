import { describe, expect, it } from "vitest";
import { parseBotEvent, splitNDJSON } from "@/lib/bot/stream";

describe("parseBotEvent", () => {
  it("liest ein status-Ereignis", () => {
    expect(parseBotEvent('{"type":"status","text":"liest Mathe-Notizen"}')).toEqual({
      type: "status",
      text: "liest Mathe-Notizen",
    });
  });

  it("liest ein text-Ereignis", () => {
    expect(parseBotEvent('{"type":"text","delta":"Hallo"}')).toEqual({
      type: "text",
      delta: "Hallo",
    });
  });

  it("liest ein thinking-Ereignis", () => {
    expect(parseBotEvent('{"type":"thinking","delta":"Ich überlege"}')).toEqual({
      type: "thinking",
      delta: "Ich überlege",
    });
  });

  it("liest ein round-Ereignis", () => {
    expect(parseBotEvent('{"type":"round"}')).toEqual({ type: "round" });
  });

  it("liest ein action-Ereignis mit beliebigem result", () => {
    expect(parseBotEvent('{"type":"action","tool":"aufgabe_anlegen","result":{"aufgabe":{"id":"1"}}}')).toEqual({
      type: "action",
      tool: "aufgabe_anlegen",
      result: { aufgabe: { id: "1" } },
    });
  });

  it("liest ein proposal-Ereignis", () => {
    expect(parseBotEvent('{"type":"proposal","kind":"grade","data":{"punkte":10}}')).toEqual({
      type: "proposal",
      kind: "grade",
      data: { punkte: 10 },
    });
  });

  it("liest ein error-Ereignis", () => {
    expect(parseBotEvent('{"type":"error","text":"kaputt"}')).toEqual({
      type: "error",
      text: "kaputt",
    });
  });

  it("liest ein done-Ereignis", () => {
    expect(parseBotEvent('{"type":"done","conversationId":"abc"}')).toEqual({
      type: "done",
      conversationId: "abc",
    });
  });

  it("gibt bei Leerzeile null zurück", () => {
    expect(parseBotEvent("")).toBeNull();
    expect(parseBotEvent("   ")).toBeNull();
  });

  it("gibt bei kaputtem JSON null zurück, statt zu werfen", () => {
    expect(parseBotEvent('{"type":"text",')).toBeNull();
  });

  it("gibt bei unbekanntem Typ oder fehlenden Feldern null zurück", () => {
    expect(parseBotEvent('{"type":"unbekannt"}')).toBeNull();
    expect(parseBotEvent('{"type":"status"}')).toBeNull();
  });
});

describe("splitNDJSON", () => {
  it("trennt vollständige Zeilen vom unvollständigen Rest", () => {
    const { lines, rest } = splitNDJSON('{"a":1}\n{"b":2}\n{"c":');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('{"c":');
  });

  it("liefert alles als Rest, wenn kein Zeilenumbruch da ist", () => {
    const { lines, rest } = splitNDJSON('{"a":1}');
    expect(lines).toEqual([]);
    expect(rest).toBe('{"a":1}');
  });

  it("kommt mit leerem Puffer klar", () => {
    const { lines, rest } = splitNDJSON("");
    expect(lines).toEqual([]);
    expect(rest).toBe("");
  });

  it("verarbeitet mehrere Chunks nacheinander wie beim echten Stream", () => {
    let buffer = "";
    const chunks = ['{"type":"text","del', 'ta":"a"}\n{"type":"text","delta":"b"}\n{"type":"do', 'ne","conversationId":"x"}\n'];
    const events: unknown[] = [];
    for (const chunk of chunks) {
      buffer += chunk;
      const { lines, rest } = splitNDJSON(buffer);
      buffer = rest;
      for (const line of lines) {
        const evt = parseBotEvent(line);
        if (evt) events.push(evt);
      }
    }
    expect(events).toEqual([
      { type: "text", delta: "a" },
      { type: "text", delta: "b" },
      { type: "done", conversationId: "x" },
    ]);
  });
});
