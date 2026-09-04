import { describe, expect, it } from "vitest";
import { sicherheitAusFazit, sicherheitAusKarten } from "@/lib/lernplan-sicherheit";

describe("sicherheitAusKarten", () => {
  it("rechnet Boxen 0..5 auf Prozent um", () => {
    expect(sicherheitAusKarten([0])).toBe(0);
    expect(sicherheitAusKarten([1])).toBe(20);
    expect(sicherheitAusKarten([2])).toBe(40);
    expect(sicherheitAusKarten([3])).toBe(60);
    expect(sicherheitAusKarten([4])).toBe(80);
    expect(sicherheitAusKarten([5])).toBe(100);
  });

  it("mittelt mehrere Karten", () => {
    expect(sicherheitAusKarten([0, 5])).toBe(50);
    expect(sicherheitAusKarten([2, 3, 4])).toBe(60);
  });

  it("leere Liste ergibt 0", () => {
    expect(sicherheitAusKarten([])).toBe(0);
  });
});

describe("sicherheitAusFazit", () => {
  it("rundet", () => {
    expect(sicherheitAusFazit(70.4)).toBe(70);
    expect(sicherheitAusFazit(70.6)).toBe(71);
  });

  it("clamped auf 0..100", () => {
    expect(sicherheitAusFazit(-10)).toBe(0);
    expect(sicherheitAusFazit(150)).toBe(100);
  });
});
