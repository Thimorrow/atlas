import { describe, expect, it } from "vitest";
import { sicherheitAusFazit, sicherheitAusKarten } from "@/lib/lernplan-sicherheit";
import { readiness } from "@/lib/lernen";

describe("sicherheitAusKarten", () => {
  it("nutzt dieselbe Sicherheit wie die Themenübersicht", () => {
    expect(sicherheitAusKarten([0])).toBe(0);
    expect(sicherheitAusKarten([1])).toBe(33);
    expect(sicherheitAusKarten([2])).toBe(67);
    expect(sicherheitAusKarten([3])).toBe(100);
    expect(sicherheitAusKarten([4])).toBe(100);
    expect(sicherheitAusKarten([5])).toBe(100);
  });

  it("mittelt mehrere Karten", () => {
    expect(sicherheitAusKarten([0, 5])).toBe(50);
    expect(sicherheitAusKarten([2, 3, 4])).toBe(89);
  });

  it.each([[0, 1, 3], [0, 0, 5], [1, 2, 4, 5]])("stimmt für gemischte Boxen überein", (...boxen) => {
    expect(sicherheitAusKarten(boxen)).toBe(readiness(boxen.map((box) => ({ box, due: "2026-09-07", reviews: box }))));
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
