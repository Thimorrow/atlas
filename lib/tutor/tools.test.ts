import { describe, expect, it } from "vitest";
import { parseAufgabeErgebnis, parseCheckliste, parseFazit, parseFrageAuswahl } from "@/lib/tutor/tools";

describe("parseFrageAuswahl", () => {
  it("lehnt eine Option ab", () => {
    const r = parseFrageAuswahl({ frage: "Was weißt du?", optionen: ["A"], mehrfach: false });
    expect(r.ok).toBe(false);
  });

  it("kappt mehr als 6 Optionen auf 6", () => {
    const r = parseFrageAuswahl({
      frage: "Was weißt du?",
      optionen: ["A", "B", "C", "D", "E", "F", "G", "H"],
      mehrfach: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.optionen).toHaveLength(6);
  });

  it("akzeptiert eine gueltige Eingabe", () => {
    const r = parseFrageAuswahl({ frage: "Was weißt du?", optionen: ["A", "B"], mehrfach: true });
    expect(r).toEqual({ ok: true, value: { frage: "Was weißt du?", optionen: ["A", "B"], mehrfach: true } });
  });
});

describe("parseCheckliste", () => {
  const aufgabe = (nr: number) => ({ nr, text: `Aufgabe ${nr}`, schwierigkeit: 1 });

  it("lehnt 4 Aufgaben ab", () => {
    const r = parseCheckliste({ titel: "T", aufgaben: [1, 2, 3, 4].map(aufgabe) });
    expect(r.ok).toBe(false);
  });

  it("lehnt 9 Aufgaben ab", () => {
    const r = parseCheckliste({ titel: "T", aufgaben: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(aufgabe) });
    expect(r.ok).toBe(false);
  });

  it("akzeptiert 5 Aufgaben und klemmt die Schwierigkeit auf 1..3", () => {
    const aufgaben = [1, 2, 3, 4, 5].map((nr) => ({ nr, text: `Aufgabe ${nr}`, schwierigkeit: 9 }));
    const r = parseCheckliste({ titel: "T", aufgaben });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.aufgaben.every((a) => a.schwierigkeit === 3)).toBe(true);
  });
});

describe("parseAufgabeErgebnis", () => {
  it("lehnt einen falschen Status ab", () => {
    const r = parseAufgabeErgebnis({ nr: 1, status: "keine-ahnung" });
    expect(r.ok).toBe(false);
  });

  it("akzeptiert richtig/falsch/uebersprungen", () => {
    for (const status of ["richtig", "falsch", "uebersprungen"]) {
      const r = parseAufgabeErgebnis({ nr: 1, status });
      expect(r.ok).toBe(true);
    }
  });
});

describe("parseFazit", () => {
  it("akzeptiert eine gueltige Eingabe und faellt bei unbekanntem kind auf wissen zurueck", () => {
    const r = parseFazit({
      gutWar: ["Sachverhalt A"],
      schwach: ["Sachverhalt B"],
      neueKarten: [{ question: "Frage", answer: "Antwort", kind: "quatsch" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.neueKarten[0].kind).toBe("wissen");
  });

  it("kappt neueKarten auf 8", () => {
    const neueKarten = Array.from({ length: 10 }, (_, i) => ({ question: `F${i}`, answer: `A${i}` }));
    const r = parseFazit({ gutWar: [], schwach: [], neueKarten });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.neueKarten).toHaveLength(8);
  });
});
