import { describe, expect, it } from "vitest";
import { mitUmlauten } from "@/lib/umlaute";

describe("mitUmlauten", () => {
  it("setzt Umlaute in Modelltext wieder ein", () => {
    expect(mitUmlauten("Die Pruefung ist naechste Woche faellig.")).toBe(
      "Die Prüfung ist nächste Woche fällig.",
    );
    expect(mitUmlauten("Faecher, Bloecke, gross")).toBe("Fächer, Blöcke, groß");
  });

  it("laesst Woerter in Ruhe, die kein Umlaut brauchen", () => {
    const unveraendert = "Zuerst manuell die Klasse pruefen, dass der Kongress ohne Stress laeuft";
    expect(mitUmlauten(unveraendert)).toContain("Zuerst manuell die Klasse");
    expect(mitUmlauten(unveraendert)).toContain("Kongress ohne Stress");
    expect(mitUmlauten("Baseball und Aerodynamik")).toBe("Baseball und Aerodynamik");
  });

  it("fasst Pfade und Werkzeugnamen nicht an", () => {
    expect(mitUmlauten("Schau unter /faecher nach")).toBe("Schau unter /faecher nach");
    expect(mitUmlauten("Ich nutze aufgabe_aendern dafuer")).toBe(
      "Ich nutze aufgabe_aendern dafür",
    );
    expect(mitUmlauten("/lernen/uebersicht bleibt")).toBe("/lernen/uebersicht bleibt");
  });

  it("ist idempotent", () => {
    expect(mitUmlauten(mitUmlauten("Pruefung"))).toBe("Prüfung");
  });
});
