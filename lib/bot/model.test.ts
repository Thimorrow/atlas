import { describe, expect, it } from "vitest";
import { applyToolCallDelta, finishedToolCalls, type ToolCallAccumulator } from "./model";

// Die Argumente eines Werkzeugaufrufs kommen beim Streamen stueckweise an
// (delta.tool_calls[i].function.arguments) und muessen ueber den Index
// zusammengesetzt werden -- das simulieren diese Tests ohne Netzwerk.

describe("applyToolCallDelta / finishedToolCalls", () => {
  it("setzt Argumente aus mehreren Chunks fuer denselben Index zusammen", () => {
    const acc: ToolCallAccumulator = new Map();
    applyToolCallDelta(acc, [{ index: 0, id: "call_1", function: { name: "aufgabe_anlegen" } }]);
    applyToolCallDelta(acc, [{ index: 0, function: { arguments: '{"titel":' } }]);
    applyToolCallDelta(acc, [{ index: 0, function: { arguments: '"Arbeitsblatt 3"}' } }]);

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
    applyToolCallDelta(acc, [
      { index: 0, id: "call_a", function: { name: "faecher_lesen", arguments: "{}" } },
      { index: 1, id: "call_b", function: { name: "aufgaben_lesen" } },
    ]);
    applyToolCallDelta(acc, [{ index: 1, function: { arguments: "{}" } }]);

    const calls = finishedToolCalls(acc);
    expect(calls.map((c) => c.function.name)).toEqual(["faecher_lesen", "aufgaben_lesen"]);
    expect(calls[1].function.arguments).toBe("{}");
  });

  it("liefert eine leere Liste, wenn nichts akkumuliert wurde", () => {
    expect(finishedToolCalls(new Map())).toEqual([]);
  });
});
