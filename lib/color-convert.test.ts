import { describe, expect, it } from "vitest";
import { oklchToHex, oklchToRgb, parseOklch } from "./color-convert";

// Die Graustufen sind von Hand nachgerechnet, nicht aus der Implementierung
// abgeschrieben. Bei Chroma 0 faellt die ganze Matrixrechnung weg: a = b = 0,
// also L = M = S = l^3, und alle drei Kanaele bekommen denselben linearen
// Wert. Uebrig bleibt nur die sRGB-Gammafunktion
//   1.055 * x^(1/2.4) - 0.055,  danach * 255 und runden.
// Genau das macht diese Datei nachvollziehbar. Geht ein Vorzeichen in den
// Matrizen verloren, faellt es hier nicht auf -- dafuer stehen weiter unten
// die bunten Token.
describe("oklchToHex, von Hand nachgerechnete Graustufen", () => {
  it("oklch(0.84 0 0) ist #cacaca -- das Token 'white' im Hellmodus", () => {
    // x = 0.84^3 = 0.592704
    // 1.055 * 0.592704^(1/2.4) - 0.055 = 1.055 * 0.804173 - 0.055 = 0.793403
    // 0.793403 * 255 = 202.32 -> 202 -> 0xca
    expect(oklchToHex("oklch(0.84 0 0)")).toBe("#cacaca");
  });

  it("oklch(0.205 0 0) ist #171717 -- der Vordergrund im Hellmodus", () => {
    // x = 0.205^3 = 0.008615125
    // 1.055 * 0.008615125^(1/2.4) - 0.055 = 1.055 * 0.137941 - 0.055 = 0.090528
    // 0.090528 * 255 = 23.08 -> 23 -> 0x17
    expect(oklchToHex("oklch(0.205 0 0)")).toBe("#171717");
  });

  it("oklch(0.97 0 0) ist #f5f5f5 -- der Vordergrund im Dunkelmodus", () => {
    // x = 0.97^3 = 0.912673
    // 1.055 * 0.912673^(1/2.4) - 0.055 = 1.055 * 0.962642 - 0.055 = 0.960587
    // 0.960587 * 255 = 244.95 -> 245 -> 0xf5
    expect(oklchToHex("oklch(0.97 0 0)")).toBe("#f5f5f5");
  });

  it("trifft die Enden exakt", () => {
    // l = 1 -> x = 1 -> 1.055 - 0.055 = 1 -> 255.
    expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
    // l = 0 -> x = 0, unterhalb von 0.0031308 gilt der lineare Fuss -> 0.
    expect(oklchToHex("oklch(0 0 0)")).toBe("#000000");
  });
});

// Die Graustufen oben pruefen nur die Gammakurve. Diese Faelle pruefen, dass
// die Farbmatrizen ueberhaupt in die richtige Richtung zeigen: bei Blau muss
// der Blaukanal fuehren, bei Rot der Rotkanal.
describe("oklchToRgb, bunte Token", () => {
  it("färbt 'blue' blau, mit Blau als stärkstem Kanal", () => {
    const { r, g, b } = oklchToRgb(0.58, 0.16, 255);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    // Gegengerechnet mit Ottossons VORWAERTS-Matrizen (sRGB -> OKLab, andere
    // Konstanten als die Rueckrichtung): #2b7ad6 ergibt L 0.5799, C 0.1601,
    // h 254.90 -- also wieder dieses Token, bis auf Rundung auf 8 Bit.
    expect(oklchToHex("oklch(0.58 0.16 255)")).toBe("#2b7ad6");
  });

  it("färbt 'rose' rot", () => {
    const { r, g, b } = oklchToRgb(0.6, 0.19, 20);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it("bleibt in allen Kanälen im Bereich 0 bis 255", () => {
    for (const h of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const rgb = oklchToRgb(0.65, 0.3, h);
      for (const v of [rgb.r, rgb.g, rgb.b]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe("parseOklch", () => {
  it("liest die Schreibweise der Palette", () => {
    expect(parseOklch("oklch(0.58 0.16 255)")).toEqual({ l: 0.58, c: 0.16, h: 255 });
  });

  it("nimmt L auch in Prozent", () => {
    expect(parseOklch("oklch(58% 0.16 255)")).toEqual({ l: 0.58, c: 0.16, h: 255 });
  });

  it("gibt bei allem anderen null zurück, statt zu werfen", () => {
    // Genau diese Faelle stehen in der Palette und in globals.css und duerfen
    // /api/colors nicht mit einer 500 beenden.
    expect(parseOklch("var(--subject-white)")).toBeNull();
    expect(parseOklch("color-mix(in oklab, var(--foreground) 34%, transparent)")).toBeNull();
    expect(oklchToHex("#ff0000")).toBeNull();
  });
});
