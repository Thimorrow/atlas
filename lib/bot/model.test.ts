import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyToolCallDelta,
  finishedToolCalls,
  streamChat,
  toAnthropicRequest,
  type ToolCallAccumulator,
  type ChatMessage,
  type ChatTool,
  type StreamEvent,
} from "./model";

// Die Argumente eines Werkzeugaufrufs kommen beim Streamen stueckweise als
// input_json_delta an und muessen ueber den content-block-Index
// zusammengesetzt werden -- das simulieren diese Tests ohne Netzwerk.

describe("applyToolCallDelta / finishedToolCalls", () => {
  it("setzt Argumente aus mehreren Chunks für denselben Index zusammen", () => {
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

  it("hält mehrere gleichzeitige Werkzeugaufrufe über ihren Index auseinander", () => {
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

  it("lässt eine reine user-Nachricht ohne system-Nachricht stehen (kein leerer Request)", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "Bewerte das." }];
    const { system, messages: out } = toAnthropicRequest(messages, []);
    expect(system).toBe("");
    expect(out).toEqual([{ role: "user", content: [{ type: "text", text: "Bewerte das." }] }]);
  });

  it("fasst zwei aufeinanderfolgende tool-Nachrichten zu einer user-Nachricht mit zwei tool_result-Blöcken zusammen", () => {
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

  it("übersetzt assistant mit tool_calls in text- und tool_use-Blöcke", () => {
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

  it("lässt den text-Block weg, wenn assistant-content leer ist", () => {
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

  it("übersetzt image_url-Parts zu image/source.url", () => {
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

  it("übersetzt Werkzeuge vom OpenAI- ins Anthropic-Format", () => {
    const tools: ChatTool[] = [
      {
        type: "function",
        function: {
          name: "faecher_lesen",
          description: "Liste der Fächer.",
          parameters: { type: "object", properties: {} },
        },
      },
    ];
    const { tools: out } = toAnthropicRequest([{ role: "system", content: "sys" }], tools);
    expect(out).toEqual([
      {
        name: "faecher_lesen",
        description: "Liste der Fächer.",
        input_schema: { type: "object", properties: {} },
      },
    ]);
  });
});

// streamChat parst das SSE-Protokoll vom Z.ai-Endpoint selbst -- ein echter
// Netzwerkaufruf laesst sich in Tests nicht sinnvoll fuehren, deshalb wird
// hier nur fetch gemockt und ein rohes SSE-Chunk zurueckgegeben.
describe("streamChat / SSE-Parser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sseResponse(lines: string[]): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(lines.map((l) => `data: ${l}\n\n`).join("")));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }

  async function collect(messages: ChatMessage[]): Promise<StreamEvent[]> {
    const out: StreamEvent[] = [];
    for await (const evt of streamChat(messages, [])) out.push(evt);
    return out;
  }

  it("liefert thinking_delta als eigenes thinking-Ereignis, verwirft es nicht", async () => {
    vi.stubEnv("ZAI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          JSON.stringify({
            type: "content_block_delta",
            index: 0,
            delta: { type: "thinking_delta", thinking: "Ich überlege kurz." },
          }),
          JSON.stringify({ type: "message_stop" }),
        ]),
      ),
    );

    const events = await collect([{ role: "system", content: "sys" }, { role: "user", content: "Hallo" }]);
    expect(events).toEqual([
      { type: "thinking", delta: "Ich überlege kurz." },
      { type: "done" },
    ]);
  });

  it("liefert text_delta weiterhin unverändert als text-Ereignis", async () => {
    vi.stubEnv("ZAI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          JSON.stringify({
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "Antwort." },
          }),
          JSON.stringify({ type: "message_stop" }),
        ]),
      ),
    );

    const events = await collect([{ role: "system", content: "sys" }, { role: "user", content: "Hallo" }]);
    expect(events).toEqual([
      { type: "text", delta: "Antwort." },
      { type: "done" },
    ]);
  });
});
