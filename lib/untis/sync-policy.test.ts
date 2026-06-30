import { describe, expect, it } from "vitest";
import { decideSync, windowFor, DEFAULT_WINDOWS } from "./sync-policy";

// Baut ein Datum mit fixer Ortszeit (Stunde/Minute). Datum egal, nur Uhrzeit zaehlt.
function at(h: number, m = 0): Date {
  const d = new Date(2026, 5, 30, h, m, 0, 0);
  return d;
}
const MIN = 60_000;

describe("windowFor", () => {
  it("trifft das Morgen-Fenster", () => {
    expect(windowFor(at(6, 45))?.pollMin).toBe(2);
  });
  it("ist nachts ausserhalb aller Fenster", () => {
    expect(windowFor(at(2, 0))).toBeNull();
  });
  it("Grenze: from inklusiv, to exklusiv", () => {
    expect(windowFor(at(6, 30))?.maxAgeMin).toBe(2); // 06:30 = Start inklusive -> Morgen
    expect(windowFor(at(7, 15))?.maxAgeMin).toBe(360); // 07:15 = Ende exklusive -> schon Tag
  });
});

describe("decideSync — Morgens (06:30–07:15, alle 2 min)", () => {
  it("pollt: bei Tick mit pollMin und altem Sync wird gesynct", () => {
    const now = at(6, 45);
    const d = decideSync(now, now.getTime() - 3 * MIN);
    expect(d.pollMin).toBe(2);
    expect(d.shouldSync).toBe(true);
  });
  it("frischer Sync (<2 min) loest noch nichts aus", () => {
    const now = at(6, 45);
    expect(decideSync(now, now.getTime() - 1 * MIN).shouldSync).toBe(false);
  });
});

describe("decideSync — Tagsueber (07:15–17:00, 6h)", () => {
  it("kein Polling", () => {
    expect(decideSync(at(12, 0), at(12, 0).getTime() - 60 * MIN).pollMin).toBeNull();
  });
  it("Reload mittags synct NICHT, wenn Sync < 6h alt", () => {
    const now = at(12, 0);
    expect(decideSync(now, now.getTime() - 60 * MIN).shouldSync).toBe(false);
  });
  it("Reload mittags synct, wenn Sync > 6h alt", () => {
    const now = at(12, 0);
    expect(decideSync(now, now.getTime() - 400 * MIN).shouldSync).toBe(true);
  });
});

describe("decideSync — Abends (17:00–23:00, Reload >30 min)", () => {
  it("kein aktives Polling", () => {
    expect(decideSync(at(19, 0), at(19, 0).getTime() - 5 * MIN).pollMin).toBeNull();
  });
  it("Reload nach >30 min synct", () => {
    const now = at(19, 0);
    expect(decideSync(now, now.getTime() - 45 * MIN).shouldSync).toBe(true);
  });
  it("Reload nach <30 min synct nicht", () => {
    const now = at(19, 0);
    expect(decideSync(now, now.getTime() - 10 * MIN).shouldSync).toBe(false);
  });
});

describe("decideSync — Nacht & Erststart", () => {
  it("nachts grosszuegig (12h), kein Polling", () => {
    const now = at(2, 0);
    expect(decideSync(now, now.getTime() - 60 * MIN).shouldSync).toBe(false);
    expect(decideSync(now, now.getTime() - 800 * MIN).shouldSync).toBe(true);
    expect(decideSync(now, now.getTime() - 60 * MIN).pollMin).toBeNull();
  });
  it("ohne vorherigen Sync (null) wird immer gesynct", () => {
    expect(decideSync(at(12, 0), null).shouldSync).toBe(true);
    expect(decideSync(at(2, 0), null).shouldSync).toBe(true);
  });
});

describe("DEFAULT_WINDOWS", () => {
  it("deckt genau die drei vereinbarten Fenster ab", () => {
    expect(DEFAULT_WINDOWS).toHaveLength(3);
  });
});
