// Test fuer den BLOCKIEREND-Fund im S2-Audit der Erstell-Seite: testIndex
// darf nach einem verworfenen/neu erzeugten Fragensatz nie auf eine Position
// zeigen, die im tatsaechlichen Fragensatz nicht mehr existiert -- sonst
// ueberspringt der Diagnosetest Fragen, die der Schueler nie gesehen hat, und
// auswerten() (:2200ff) wertet sie als "falsch"/"Uebersprungen". Siehe
// klemmeTestIndex in components/lernplan-erstellen.tsx.

import { describe, expect, it } from "vitest";
import { klemmeTestIndex } from "@/components/lernplan-erstellen";

describe("klemmeTestIndex", () => {
  it("laesst einen gueltigen Index unveraendert", () => {
    expect(klemmeTestIndex(1, 3)).toBe(1);
  });

  it("klemmt einen zu grossen Index auf die Laenge des Fragensatzes", () => {
    // Schadensfall aus dem Fund: alter testIndex=3 (drei Fragen aus einem
    // laengeren, verworfenen Fragensatz beantwortet), neuer Fragensatz hat
    // nur 2 Fragen. Ohne Klemmung wuerde 3 stehen bleiben.
    expect(klemmeTestIndex(3, 2)).toBe(2);
  });

  it("klemmt exakt auf die Laenge, wenn Index gleich Laenge waere", () => {
    expect(klemmeTestIndex(3, 3)).toBe(3);
  });

  it("faengt einen negativen Index ab", () => {
    expect(klemmeTestIndex(-1, 5)).toBe(0);
  });

  it("faengt einen nicht-endlichen Index ab (kaputter sessionStorage-Eintrag)", () => {
    expect(klemmeTestIndex(Number.NaN, 5)).toBe(0);
  });

  it("laesst 0 bei einem leeren Fragensatz unveraendert", () => {
    expect(klemmeTestIndex(0, 0)).toBe(0);
  });
});
