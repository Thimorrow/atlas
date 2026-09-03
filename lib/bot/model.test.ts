import { describe, expect, it } from "vitest";
import {
  applyToolCallDelta,
  finishedToolCalls,
  toAnthropicRequest,
  type ToolCallAccumulator,
  type ChatMessage,
  type ChatTool,
} from "./model";

// Die Argumente eines Werkzeugaufrufs kommen beim Streamen stueckweise als
// input_json_delta an und muessen ueber den content-block-Index
// zusammengesetzt werden -- das simulieren diese Tests ohne Netzwerk.

describe("applyToolCallDelta / finishedToolCalls", () => {
  it("setzt Argumente aus mehreren Chunks fuer denselben Index zusammen", () => {
    const acc: ToolCallAccumulator = new Map();
    applyToolCallDelta(acc, 0, { id: "call_1", name: "aufgabe_anlegen" });
    applyToolCallDelta(acc, 0, { arguments: '{"titel":' });
    applyToolCallDelta(acc, 0, { arguments: '"Arbeitsblatt 3"}' });

    const calls = finishedToolCalls(acc);
    expect(calls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: { name: "aufgabe_anlegen", arguments: '{"titel":"Arbeitsblatt 3"}' },
      },
    ]);
  });

  it("haelt mehrere gleichzeitige Werkzeugaufrufe ueber ihren Index auseinander", () => {
    const acc: ToolCallAccumulator = new Map();
    applyToolCallDelta(acc, 0, { id: "call_a", name: "faecher_lesen" });
    applyToolCallDelta(acc, 0, { arguments: "{}" });
    applyToolCallDelta(acc, 1, { id: "call_b", name: "aufgaben_lesen" });
    applyToolCallDelta(acc, 1, { arguments: "{}" });

    const calls = finishedToolCalls(acc);
    expect(calls.map((c) => c.function.name)).toEqual(["faecher_lesen", "aufgaben_lesen"]);
    expect(calls[1].function.arguments).toBe("{}");
  });

  it("liefert eine leere Liste, wenn nichts akkumuliert wurde", () => {
    expect(finishedToolCalls(new Map())).toEqual([]);
  });
});

describe("toAnthropicRequest", () => {
  it("zieht die system-Nachricht aus dem Array und setzt sie als system-Feld", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "Du bist Atlas." },
      { role: "user", content: "Hallo" },
    ];
    const { system, messages: out } = toAnthropicRequest(messages, []);
    expect(system).toBe("Du bist Atlas.");
    expect(out).toEqual([{ role: "user", content: [{ type: "text", text: "Hallo" }] }]);
  });

  it("fasst zwei aufeinanderfolgende tool-Nachrichten zu einer user-Nachricht mit zwei tool_result-Bloecken zusammen", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      {
        role: "tool",
        content: '{"a":1}',
        tool_call_id: "call_1",
        name: "faecher_lesen",
      },
      {
        role: "tool",
        content: '{"b":2}',
        tool_call_id: "call_2",
        name: "aufgaben_lesen",
      },
    ];
    const { messages: out } = toAnthropicRequest(messages, []);
    expect(out).toEqual([
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call_1", content: '{"a":1}' },
          { type: "tool_result", tool_use_id: "call_2", content: '{"b":2}' },
        ],
      },
    ]);
  });

  it("uebersetzt assistant mit tool_calls in text- und tool_use-Bloecke", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      {
        role: "assistant",
        content: "Einen Moment.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "aufgabe_anlegen", arguments: '{"titel":"Test"}' },
          },
        ],
      },
    ];
    const { messages: out } = toAnthropicRequest(messages, []);
    expect(out).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Einen Moment." },
          { type: "tool_use", id: "call_1", name: "aufgabe_anlegen", input: { titel: "Test" } },
        ],
      },
    ]);
  });

  it("laesst den text-Block weg, wenn assistant-content leer ist", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "faecher_lesen", arguments: "{}" } },
        ],
      },
    ];
    const { messages: out } = toAnthropicRequest(messages, []);
    expect(out[0].content).toEqual([
      { type: "tool_use", id: "call_1", name: "faecher_lesen", input: {} },
    ]);
  });

  it("uebersetzt image_url-Parts zu image/source.url", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: "https://example.com/bild.png" } }],
      },
    ];
    const { messages: out } = toAnthropicRequest(messages, []);
    expect(out).toEqual([
      {
        role: "user",
        content: [{ type: "image", source: { type: "url", url: "https://example.com/bild.png" } }],
      },
    ]);
  });

  it("uebersetzt Werkzeuge vom OpenAI- ins Anthropic-Format", () => {
    const tools: ChatTool[] = [
      {
        type: "function",
        function: {
          name: "faecher_lesen",
          description: "Liste der Faecher.",
          parameters: { type: "object", properties: {} },
        },
      },
    ];
    const { tools: out } = toAnthropicRequest([{ role: "system", content: "sys" }], tools);
    expect(out).toEqual([
      {
        name: "faecher_lesen",
        description: "Liste der Faecher.",
        input_schema: { type: "object", properties: {} },
      },
    ]);
  });
});
