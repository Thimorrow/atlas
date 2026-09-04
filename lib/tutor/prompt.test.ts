import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildTutorContext, PROBE_PROMPT_BLOCK, type TutorContextInput } from "@/lib/tutor/prompt";

const baseInput: TutorContextInput = {
  subjectName: "Mathe",
  lernart: "aufgaben",
  topicTitle: "Quadratische Gleichungen",
  summary: "Ein Lernzettel Text.",
  cards: [
    { question: "Was ist die p-q-Formel?", answer: "x = -p/2 ± ...", box: 0, kind: "wissen" },
    { question: "Was ist eine Nullstelle?", answer: "Schnittpunkt mit der x-Achse", box: 4, kind: "wissen" },
  ],
  pruefung: null,
  card: null,
};

describe("buildTutorContext", () => {
  it("enthaelt Thema-Titel und Lernzettel", () => {
    const context = buildTutorContext(baseInput);
    expect(context).toContain("Quadratische Gleichungen");
    expect(context).toContain("Ein Lernzettel Text.");
  });

  it("markiert schwache Karten (Box <= 1) und sortiert sie zuerst", () => {
    const context = buildTutorContext(baseInput);
    const schwachIndex = context.indexOf("p-q-Formel");
    const starkIndex = context.indexOf("Nullstelle");
    expect(context).toContain("p-q-Formel? / x = -p/2 ± ... (schwach)");
    expect(schwachIndex).toBeLessThan(starkIndex);
  });

  it("kappt den Lernzettel bei 6000 Zeichen", () => {
    const context = buildTutorContext({ ...baseInput, summary: "x".repeat(7000) });
    // Nur der gekuerzte Lernzettel-Teil zaehlt, nicht der ganze Kontextblock.
    const match = context.match(/x+/);
    expect(match?.[0].length).toBeLessThanOrEqual(6000);
  });

  it("zeigt den Hinweis, wenn weder Lernzettel noch Karten vorhanden sind", () => {
    const context = buildTutorContext({ ...baseInput, summary: null, cards: [] });
    expect(context).toContain("Es gibt noch kein Material, frag Timo, worum es geht.");
  });
});

describe("buildSystemPrompt", () => {
  it("enthaelt den Probe-Block nur im Modus probe", () => {
    const lernen = buildSystemPrompt("lernen", baseInput);
    const probe = buildSystemPrompt("probe", baseInput);
    expect(lernen).not.toContain(PROBE_PROMPT_BLOCK.trim());
    expect(probe).toContain("Diese Session ist eine Probe");
  });
});
