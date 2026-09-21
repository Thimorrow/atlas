// Die Doku lief dem Code schon zweimal hinterher: STATE.md behauptete "drei
// Module, 65 Tests" bei fuenf Modulen und 142 Tests, und .ytstack/API.md kannte
// die fertig gebauten Module Hefte und Vokabeln nicht, obwohl sie als Vertrag
// fuer den Android-Client ausgewiesen ist. Beides wurde von Hand gepflegt und
// ist deshalb von Hand veraltet.
//
// Dieser Test nimmt das Zaehlen aus der Hand: der markierte Zahlenblock in
// README.md, .ytstack/STATE.md und .ytstack/API.md muss zum Code passen, und
// die Routentabelle in API.md muss jede Route aus app/api/**/route.ts nennen.
//
// Neu setzen laesst sich der Block mit `npm run docs:zahlen`.

import { describe, expect, it } from "vitest";
import { pruefen, zahlenLesen } from "@/scripts/doku-zahlen.mjs";

describe("Doku-Zahlen", () => {
  it("kommt aus dem Code, nicht aus dem Bauch", async () => {
    const z = await zahlenLesen();
    // Untergrenzen statt genauer Werte: der Test soll nicht bei jeder neuen
    // Route angefasst werden muessen. Er faengt den Fall ab, dass das Zaehlen
    // selbst kaputtgeht und alle Zahlen auf 0 fallen -- dann wuerde der
    // Vergleich unten naemlich stillschweigend "passen".
    expect(z.routen).toBeGreaterThan(50);
    expect(z.seiten).toBeGreaterThan(15);
    expect(z.migrationen).toBeGreaterThan(20);
    expect(z.tabellen).toBeGreaterThan(15);
    expect(z.testdateien).toBeGreaterThan(50);
  });

  it("hat keine veralteten Zahlen und keine ungenannte Route", async () => {
    const befunde = await pruefen();
    expect(
      befunde,
      `Veraltete Doku gefunden:\n${befunde.join("\n")}\n\nZahlen neu setzen: npm run docs:zahlen`,
    ).toEqual([]);
  });
});
