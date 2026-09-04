import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildTutorContext, PROBE_PROMPT_BLOCK, SIMULATION_PROMPT_BLOCK, type TutorContextInput } from "@/lib/tutor/prompt";

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
  blaetter: null,
  simulation: null,
};

describe("buildTutorContext", () => {
  it("enthält Thema-Titel und Lernzettel", () => {
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

describe("buildTutorContext: Arbeitsblätter", () => {
  it("hängt den Blätter-Abschnitt mit Seiten und Text an", () => {
    const context = buildTutorContext({
      ...baseInput,
      blaetter: { text: "Inhalt des Arbeitsblatts.", seiten: "12-14", gekuerzt: false, fehlend: [] },
    });
    expect(context).toContain("Arbeitsblätter zu diesem Punkt (Seiten: 12-14)");
    expect(context).toContain("Inhalt des Arbeitsblatts.");
  });

  it("nennt fehlende Blätter", () => {
    const context = buildTutorContext({
      ...baseInput,
      blaetter: { text: "", seiten: null, gekuerzt: false, fehlend: ["Zettel.pdf"] },
    });
    expect(context).toContain("Blatt Zettel.pdf konnte nicht gelesen werden.");
  });
});

describe("buildTutorContext: Simulation", () => {
  it("listet die Punkte mit Titel, Sicherheit und pointId statt eines Themas", () => {
    const context = buildTutorContext({
      ...baseInput,
      topicTitle: null,
      summary: null,
      cards: [],
      simulation: {
        punkte: [
          { pointId: "p1", titel: "Bruchrechnen", sicherheit: 40 },
          { pointId: "p2", titel: "Gleichungen", sicherheit: 70 },
        ],
      },
    });
    expect(context).not.toContain("Thema:");
    expect(context).toContain("Bruchrechnen");
    expect(context).toContain("Sicherheit 40 %");
    expect(context).toContain("pointId: p2");
    expect(context).not.toContain("Es gibt noch kein Material");
  });
});

describe("buildSystemPrompt", () => {
  it("enthält den Probe-Block nur im Modus probe", () => {
    const lernen = buildSystemPrompt("lernen", baseInput);
    const probe = buildSystemPrompt("probe", baseInput);
    expect(lernen).not.toContain(PROBE_PROMPT_BLOCK.trim());
    expect(probe).toContain("Diese Session ist eine Probe");
  });

  it("ersetzt den Probe-Block durch den Simulation-Block bei Simulation", () => {
    const simulation = buildSystemPrompt("probe", {
      ...baseInput,
      topicTitle: null,
      simulation: { punkte: [{ pointId: "p1", titel: "Bruchrechnen", sicherheit: 40 }] },
    });
    expect(simulation).not.toContain("Diese Session ist eine Probe.");
    expect(simulation).toContain("Diese Session ist eine Simulation");
    expect(simulation).toContain(SIMULATION_PROMPT_BLOCK.trim());
  });
});
