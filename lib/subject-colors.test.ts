import { describe, expect, it } from "vitest";
import { defaultColorFor } from "@/lib/subject-colors";

describe("defaultColorFor", () => {
  it("nimmt bei zwei passenden Wunschfarben die laengere Nadel", () => {
    // "Informatik/ang. Mathematik" enthaelt "mathe" und "informatik". Solange
    // die Listenreihenfolge entschied, bekam das Fach Mathes Blau: in der
    // Faecherliste sassen dann zwei blaue Punkte untereinander, waehrend das
    // eigentliche Informatik grau blieb. Die laengere Nadel ist die genauere
    // Aussage ueber das Fach.
    expect(defaultColorFor("Informatik/ang. Mathematik")).toBe("slate");
    expect(defaultColorFor("Informatik")).toBe("slate");
    expect(defaultColorFor("Mathe")).toBe("blue");
    expect(defaultColorFor("Mathematik")).toBe("blue");
  });

  it("trifft Wunschfarben unabhaengig von Gross- und Kleinschreibung", () => {
    expect(defaultColorFor("BIOLOGIE")).toBe("green");
    expect(defaultColorFor("Geschichte bilingual")).toBe("violet");
  });

  it("teilt per Hash niemals Weiss zu", () => {
    // Weiss ist im Hellmodus ein sehr helles Grau. Selbst gewaehlt ist das
    // eine Entscheidung, per Los sieht es aus wie ein Loch.
    const namen = Array.from({ length: 500 }, (_, i) => `Fach ${i}`);
    for (const name of namen) expect(defaultColorFor(name)).not.toBe("white");
  });

  it("laesst Weiss als Wunschfarbe weiterhin zu", () => {
    expect(defaultColorFor("Evangelische Religionslehre")).toBe("white");
  });

  it("gibt fuer denselben Namen immer dieselbe Farbe", () => {
    expect(defaultColorFor("Wirtschaft/Politik")).toBe(defaultColorFor("Wirtschaft/Politik"));
  });
});
