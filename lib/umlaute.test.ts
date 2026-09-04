import { describe, expect, it } from "vitest";
import { ohneUmlaute, vergleichbar } from "@/lib/umlaute";

describe("ohneUmlaute", () => {
  it("ersetzt alle Umlaute und das Eszett", () => {
    expect(ohneUmlaute("Französisch, Übermorgen, Öl, groß, Ähre")).toBe(
      "Franzoesisch, Uebermorgen, Oel, gross, Aehre",
    );
  });

  it("laesst Text ohne Umlaute unveraendert und ist idempotent", () => {
    const schon = "Naechste Woche, Pruefung, gross";
    expect(ohneUmlaute(schon)).toBe(schon);
    expect(ohneUmlaute(ohneUmlaute("Prüfung"))).toBe("Pruefung");
  });

  it("trifft auch zerlegt kodierte Umlaute", () => {
    expect(ohneUmlaute("Prüfung")).toBe("Pruefung");
  });
});

describe("vergleichbar", () => {
  it("macht beide Schreibweisen gleich", () => {
    expect(vergleichbar(" Französisch ")).toBe(vergleichbar("Franzoesisch"));
  });
});
