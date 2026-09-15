import { describe, expect, it } from "vitest";
import {
  fortschritt,
  naechsteBox,
  pruefeEntwurf,
  leseVokabelJson,
} from "./vokabeln";

describe("Vokabelkasten", () => {
  it("wertet jede Box gleichmäßig von 0 bis 100 Prozent", () => {
    expect([1, 2, 3, 4, 5, 6].map((box) => fortschritt([{ box }]))).toEqual([
      0, 20, 40, 60, 80, 100,
    ]);
    expect(fortschritt([{ box: 3 }, { box: 5 }])).toBe(60);
    expect(fortschritt([])).toBe(0);
  });
  it("gewichtet nach Vokabeln und zeigt 100 erst wenn alle gelernt sind", () => {
    expect(fortschritt([{ box: 6 }, { box: 1 }, { box: 1 }, { box: 1 }])).toBe(
      25,
    );
    expect(
      fortschritt([
        ...Array.from({ length: 100 }, () => ({ box: 6 })),
        { box: 5 },
      ]),
    ).toBe(99);
  });
  it("steigt nach jeder richtigen Antwort genau eine Box auf", () => {
    expect([1, 2, 3, 4, 5, 6].map((box) => naechsteBox(box, true))).toEqual([
      2, 3, 4, 5, 6, 6,
    ]);
  });
  it("fällt bei jeder falschen Antwort sofort auf Box 1", () => {
    expect([1, 2, 3, 4, 5, 6].map((box) => naechsteBox(box, false))).toEqual([
      1, 1, 1, 1, 1, 1,
    ]);
  });
  it("bewahrt verschiedene Lektionen, Stammformen und Übersetzungen", () => {
    const rows = [
      {
        abschnitt: " 12 ",
        wort: "urbs, urbis f.",
        deutsch: "Stadt; Großstadt",
      },
      { abschnitt: "13", wort: "ire, eo, ii", deutsch: "gehen" },
    ];
    expect(
      leseVokabelJson("```json\n" + JSON.stringify(rows) + "\n```"),
    ).toEqual([{ ...rows[0], abschnitt: "12" }, rows[1]]);
  });
  it("erlaubt unbekannte Seiten nur im Entwurf, nicht beim Speichern", () => {
    const row = [{ abschnitt: "", wort: "word", deutsch: "Wort" }];
    expect(leseVokabelJson(JSON.stringify(row))).toEqual(row);
    expect(() => pruefeEntwurf(row)).toThrow();
  });
  it("lehnt leere, übergroße und unvollständige Importe ab", () => {
    for (const input of [
      null,
      [],
      [{}],
      [{ abschnitt: "1", wort: " ", deutsch: "Wort" }],
      Array(301).fill({ abschnitt: "1", wort: "a", deutsch: "b" }),
    ])
      expect(() => pruefeEntwurf(input)).toThrow();
    expect(() => leseVokabelJson("Keine Vokabeln sichtbar")).toThrow(
      /nicht sicher/,
    );
  });
});
