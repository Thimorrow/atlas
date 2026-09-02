import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORAL_WEIGHT,
  formatPoints,
  overallAverage,
  pointsToGradeLabel,
  pointsToGradeNumber,
  subjectAverage,
  type GradeInput,
} from "./grades";

// Die Tabelle steht hier von Hand ausgeschrieben, nicht aus der Formel
// abgeleitet: waere sie aus derselben Rechnung erzeugt wie die
// Implementierung, wuerde sie jeden Rechenfehler brav mitmachen.
const KMK: Array<[number, string]> = [
  [15, "1+"],
  [14, "1"],
  [13, "1-"],
  [12, "2+"],
  [11, "2"],
  [10, "2-"],
  [9, "3+"],
  [8, "3"],
  [7, "3-"],
  [6, "4+"],
  [5, "4"],
  [4, "4-"],
  [3, "5+"],
  [2, "5"],
  [1, "5-"],
  [0, "6"],
];

describe("pointsToGradeLabel", () => {
  for (const [points, label] of KMK) {
    it(`${points} Punkte sind Note ${label}`, () => {
      expect(pointsToGradeLabel(points)).toBe(label);
    });
  }

  it("rundet Zwischenwerte auf die naechste Punktzahl", () => {
    expect(pointsToGradeLabel(11.4)).toBe("2"); // -> 11
    expect(pointsToGradeLabel(11.5)).toBe("2+"); // -> 12
  });

  it("kappt Werte ausserhalb von 0 bis 15", () => {
    expect(pointsToGradeLabel(99)).toBe("1+");
    expect(pointsToGradeLabel(-4)).toBe("6");
  });
});

describe("pointsToGradeNumber", () => {
  it("liefert die glatte Ziffer ohne Tendenz", () => {
    expect(pointsToGradeNumber(15)).toBe(1);
    expect(pointsToGradeNumber(13)).toBe(1);
    expect(pointsToGradeNumber(12)).toBe(2);
    expect(pointsToGradeNumber(5)).toBe(4);
    expect(pointsToGradeNumber(0)).toBe(6);
  });
});

const g = (kind: "oral" | "written", points: number, weight = 1): GradeInput => ({
  kind,
  points,
  weight,
});

describe("subjectAverage", () => {
  it("ohne Noten gibt es keinen Schnitt", () => {
    const r = subjectAverage([]);
    expect(r.average).toBeNull();
    expect(r.oral).toBeNull();
    expect(r.written).toBeNull();
    expect(r.count).toBe(0);
  });

  it("nur muendliche Noten: der muendliche Schnitt ist der Fachschnitt", () => {
    // Die schriftlichen 60 Prozent duerfen nicht als Null mitgerechnet werden.
    const r = subjectAverage([g("oral", 12), g("oral", 10)], 40);
    expect(r.average?.points).toBe(11);
    expect(r.average?.label).toBe("2");
    expect(r.written).toBeNull();
  });

  it("nur schriftliche Noten: der schriftliche Schnitt ist der Fachschnitt", () => {
    const r = subjectAverage([g("written", 9), g("written", 7)], 40);
    expect(r.average?.points).toBe(8);
    expect(r.written?.points).toBe(8);
    expect(r.oral).toBeNull();
  });

  it("gewichtet muendlich zu schriftlich mit 50 zu 50", () => {
    const r = subjectAverage([g("oral", 14), g("written", 8)], 50);
    expect(r.average?.points).toBe(11);
    expect(r.average?.label).toBe("2");
  });

  it("gewichtet muendlich zu schriftlich mit 40 zu 60", () => {
    const r = subjectAverage([g("oral", 15), g("written", 5)], 40);
    // 15 * 0.4 + 5 * 0.6 = 6 + 3 = 9
    expect(r.average?.points).toBe(9);
    expect(r.average?.label).toBe("3+");
  });

  it("beachtet die Gewichtung einzelner Noten", () => {
    // (12*2 + 6*1) / 3 = 10
    const r = subjectAverage([g("written", 12, 2), g("written", 6, 1)]);
    expect(r.written?.points).toBe(10);
  });

  it("Gewichtung null zaehlt die Note nicht mit", () => {
    // Die 0-Punkte-Note ist mit Gewicht 0 eingetragen und darf den Schnitt
    // nicht nach unten ziehen.
    const r = subjectAverage([g("written", 12, 1), g("written", 0, 0)]);
    expect(r.written?.points).toBe(12);
  });

  it("sind ALLE Gewichte null, gibt es fuer die Gruppe keinen Schnitt", () => {
    const r = subjectAverage([g("written", 12, 0), g("oral", 9, 0)]);
    expect(r.average).toBeNull();
    expect(r.written).toBeNull();
    expect(r.oral).toBeNull();
    // Die Noten existieren trotzdem, sie sind nur nicht verwertbar.
    expect(r.count).toBe(2);
  });

  it("Gewicht null auf einer Seite laesst die andere Seite allein stehen", () => {
    const r = subjectAverage([g("oral", 15, 0), g("written", 6, 1)]);
    expect(r.average?.points).toBe(6);
  });

  it("oralWeight 0 blendet den muendlichen Teil aus, wenn beide Seiten da sind", () => {
    const r = subjectAverage([g("oral", 15), g("written", 6)], 0);
    expect(r.average?.points).toBe(6);
  });

  it("nutzt ohne Angabe 50 zu 50", () => {
    const a = subjectAverage([g("oral", 14), g("written", 8)]);
    const b = subjectAverage([g("oral", 14), g("written", 8)], DEFAULT_ORAL_WEIGHT);
    expect(a.average?.points).toBe(b.average?.points);
  });
});

describe("overallAverage", () => {
  it("ohne Faecher mit Noten gibt es keinen Gesamtschnitt", () => {
    expect(overallAverage([])).toBeNull();
    expect(overallAverage([null, null])).toBeNull();
  });

  it("mittelt die Fachschnitte, jedes Fach zaehlt einmal", () => {
    const r = overallAverage([
      { points: 12, label: "2+" },
      { points: 8, label: "3" },
      null, // Fach ohne Noten bleibt aussen vor
    ]);
    expect(r?.points).toBe(10);
    expect(r?.label).toBe("2-");
  });
});

describe("formatPoints", () => {
  it("schreibt eine Nachkommastelle mit Komma", () => {
    expect(formatPoints(11)).toBe("11,0");
    expect(formatPoints(9.25)).toBe("9,3");
    expect(formatPoints(0)).toBe("0,0");
  });
});
