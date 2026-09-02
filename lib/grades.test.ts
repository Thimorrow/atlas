import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORAL_WEIGHT,
  formatPoints,
  overallAverage,
  pointsToGradeLabel,
  pointsToGradeNumber,
  requiredPointsForGoal,
  sortSubjectsByAverage,
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

describe("sortSubjectsByAverage", () => {
  const s = (name: string, points: number | null) => ({
    name,
    average: points === null ? null : { points, label: pointsToGradeLabel(points) },
  });

  it("sortiert nach Schnitt aufsteigend, das schwaechste Fach zuerst", () => {
    const { withGrades } = sortSubjectsByAverage([s("Mathe", 12), s("Deutsch", 6), s("Bio", 9)]);
    expect(withGrades.map((x) => x.name)).toEqual(["Deutsch", "Bio", "Mathe"]);
  });

  it("trennt Faecher ohne Note in eine eigene Gruppe", () => {
    const { withGrades, withoutGrades } = sortSubjectsByAverage([
      s("Mathe", 12),
      s("Kunst", null),
      s("Deutsch", 6),
    ]);
    expect(withGrades.map((x) => x.name)).toEqual(["Deutsch", "Mathe"]);
    expect(withoutGrades.map((x) => x.name)).toEqual(["Kunst"]);
  });

  it("ohne jede Note bleiben beide Gruppen leer bzw. voll", () => {
    const { withGrades, withoutGrades } = sortSubjectsByAverage([s("Kunst", null), s("Sport", null)]);
    expect(withGrades).toEqual([]);
    expect(withoutGrades.length).toBe(2);
  });
});

describe("requiredPointsForGoal", () => {
  it("Normalfall: rechnet die noetige Punktzahl fuer die naechste schriftliche Note aus", () => {
    // oral 12, written 9, 50:50 -> Schnitt 10,5. Ziel 11 Punkte.
    // written muss auf 10 im Schnitt: (9+p)/2 = 10 -> p = 11.
    const r = requiredPointsForGoal(
      [g("oral", 12), g("written", 9)],
      11,
      { kind: "written", weight: 1 },
      50,
    );
    expect(r).toEqual({ status: "achievable", points: 11 });
  });

  it("Ziel schon erreicht: keine Punktzahl, sondern der bestehende Schnitt", () => {
    const r = requiredPointsForGoal(
      [g("oral", 13), g("written", 13)],
      11,
      { kind: "written", weight: 1 },
      50,
    );
    expect(r).toEqual({ status: "reached", current: 13 });
  });

  it("Ziel selbst mit 15 Punkten nicht erreichbar: sagt, was mit 15 herauskaeme", () => {
    // oral 5 (fix), 50:50, noch keine schriftliche Note. Ziel 15.
    // Bestes moegliches: (5+15)/2 = 10.
    const r = requiredPointsForGoal(
      [g("oral", 5)],
      15,
      { kind: "written", weight: 1 },
      50,
    );
    expect(r).toEqual({ status: "unreachable", atMax: 10 });
  });

  it("erste Note ueberhaupt in dieser Gruppe: die neue Note zaehlt allein", () => {
    // Noch keine schriftliche Note, oral fehlt komplett -- die neue
    // schriftliche Note ist der ganze Schnitt.
    const r = requiredPointsForGoal([], 9, { kind: "written", weight: 1 }, 50);
    expect(r).toEqual({ status: "achievable", points: 9 });
  });

  it("die andere Gruppe hat keine Note: sie traegt nichts bei", () => {
    // Nur schriftliche Noten vorhanden, Ziel per neuer muendlicher Note.
    // written-Schnitt fehlt hier komplett -> oral zaehlt allein.
    const r = requiredPointsForGoal(
      [g("written", 8)],
      12,
      { kind: "oral", weight: 1 },
      50,
    );
    // written existiert (8), oral fehlt -- Ziel per neuer oral-Note.
    // otherAvg (written) = 8, ownShare (oral) = 0.5, otherShare = 0.5.
    // (target - 0.5*8)/0.5 = (12-4)/0.5 = 16 -> noetig waeren 16 Punkte, nicht
    // erreichbar. Mit 15: 0.5*15 + 0.5*8 = 7.5 + 4 = 11.5.
    expect(r).toEqual({ status: "unreachable", atMax: 11.5 });
  });

  it("oralWeight 0: eine neue muendliche Note aendert am Schnitt nichts", () => {
    const r = requiredPointsForGoal(
      [g("oral", 5), g("written", 8)],
      12,
      { kind: "oral", weight: 1 },
      0,
    );
    // Schnitt ist fix bei 8 (nur schriftlich zaehlt), egal welche muendliche
    // Note dazukommt.
    expect(r).toEqual({ status: "unreachable", atMax: 8 });
  });

  it("oralWeight 100: eine neue schriftliche Note aendert am Schnitt nichts", () => {
    const r = requiredPointsForGoal(
      [g("oral", 5), g("written", 8)],
      12,
      { kind: "written", weight: 1 },
      100,
    );
    expect(r).toEqual({ status: "unreachable", atMax: 5 });
  });

  it("Gewichtung der neuen Note doppelt zaehlt staerker", () => {
    // written existiert schon mit 9 (Gewicht 1), oral fix bei 12, 50:50.
    // Ziel 11 -> written muss auf 10: (9 + p*2)/(1+2) = 10 -> p = 10.5 -> 11
    const r = requiredPointsForGoal(
      [g("oral", 12), g("written", 9)],
      11,
      { kind: "written", weight: 2 },
      50,
    );
    expect(r).toEqual({ status: "achievable", points: 11 });
  });

  it("das Ergebnis liegt nie ueber 15 und ist immer eine ganze Zahl", () => {
    const r = requiredPointsForGoal([g("written", 1)], 15, { kind: "written", weight: 1 }, 50);
    if (r.status === "achievable") {
      expect(Number.isInteger(r.points)).toBe(true);
      expect(r.points).toBeLessThanOrEqual(15);
      expect(r.points).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("formatPoints", () => {
  it("schreibt eine Nachkommastelle mit Komma", () => {
    expect(formatPoints(11)).toBe("11,0");
    expect(formatPoints(9.25)).toBe("9,3");
    expect(formatPoints(0)).toBe("0,0");
  });
});
