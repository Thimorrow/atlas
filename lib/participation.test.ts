import { describe, expect, it } from "vitest";
import { MAX_COUNT, formatAverage, parseCount, summarizeParticipation } from "./participation";

describe("summarizeParticipation", () => {
  it("leere Liste -> lessons 0, average null", () => {
    expect(summarizeParticipation([])).toEqual({ lessons: 0, total: 0, average: null, best: null });
  });

  it("nur Nullen -> average 0, nicht null (0 ist ein echter Datenpunkt)", () => {
    expect(summarizeParticipation([0, 0, 0])).toEqual({ lessons: 3, total: 0, average: 0, best: 0 });
  });

  it("rechnet Summe, Schnitt und Bestwert", () => {
    expect(summarizeParticipation([1, 2, 3])).toEqual({ lessons: 3, total: 6, average: 2, best: 3 });
  });

  it("rundet nicht, average bleibt eine präzise Fließkommazahl", () => {
    const s = summarizeParticipation([1, 2]);
    expect(s.average).toBeCloseTo(1.5);
    expect(s.lessons).toBe(2);
    expect(s.total).toBe(3);
  });

  it("eine einzelne Stunde", () => {
    expect(summarizeParticipation([5])).toEqual({ lessons: 1, total: 5, average: 5, best: 5 });
  });
});

describe("formatAverage", () => {
  it("null -> Bindestrich", () => {
    expect(formatAverage(null)).toBe("-");
  });

  it("formatiert mit deutschem Komma und einer Nachkommastelle", () => {
    expect(formatAverage(3.4)).toBe("3,4");
  });

  it("rundet auf eine Nachkommastelle", () => {
    expect(formatAverage(10 / 3)).toBe("3,3");
  });

  it("0 bleibt 0,0, kein Bindestrich", () => {
    expect(formatAverage(0)).toBe("0,0");
  });

  it("ganze Zahlen bekommen eine Nachkommastelle", () => {
    expect(formatAverage(2)).toBe("2,0");
  });
});

describe("parseCount", () => {
  it("akzeptiert eine Zahl", () => {
    expect(parseCount(7)).toEqual({ ok: true, value: 7 });
  });

  it("akzeptiert einen Zahl-String", () => {
    expect(parseCount("7")).toEqual({ ok: true, value: 7 });
  });

  it("akzeptiert die untere Grenze 0", () => {
    expect(parseCount(0)).toEqual({ ok: true, value: 0 });
  });

  it("akzeptiert die obere Grenze 99 (MAX_COUNT)", () => {
    expect(parseCount(99)).toEqual({ ok: true, value: MAX_COUNT });
  });

  it("lehnt -1 ab", () => {
    expect(parseCount(-1)).toEqual({ ok: false, error: "count darf nicht negativ sein." });
  });

  it("lehnt 100 ab", () => {
    const r = parseCount(100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("höchstens");
  });

  it("lehnt 1.5 ab (keine ganze Zahl)", () => {
    const r = parseCount(1.5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ganze Zahl");
  });

  it("lehnt 'abc' ab", () => {
    const r = parseCount("abc");
    expect(r.ok).toBe(false);
  });

  it("lehnt null/undefined/Objekte ab", () => {
    expect(parseCount(null).ok).toBe(false);
    expect(parseCount(undefined).ok).toBe(false);
    expect(parseCount({}).ok).toBe(false);
  });

  it("lehnt einen leeren String ab", () => {
    expect(parseCount("").ok).toBe(false);
  });
});
