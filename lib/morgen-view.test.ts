import { describe, expect, it } from "vitest";
import {
  dueUntilTarget,
  examsOnTarget,
  pickFocusDay,
  pickTargetDay,
  targetDayLabel,
} from "@/lib/morgen-view";
import type { AssignmentDTO, AssignmentType } from "@/lib/assignments-view";

// --- Reiner Logiktest, kein DB-Zugriff ---------------------------------------

const DI = "2025-07-15"; // heute in den meisten Faellen
const MI = "2025-07-16"; // morgen
const DO = "2025-07-17";
const FR = "2025-07-18";
const SA = "2025-07-19"; // Samstag
const SO = "2025-07-20"; // Sonntag
const MO_NAECHSTE = "2025-07-21"; // naechster Montag

let seq = 0;
function make(p: Partial<AssignmentDTO> = {}): AssignmentDTO {
  seq += 1;
  return {
    id: `a${seq}`,
    subjectId: p.subjectName ? `s-${p.subjectName}` : null,
    subjectName: null,
    subjectColor: null,
    type: "homework" as AssignmentType,
    title: `Aufgabe ${seq}`,
    notes: null,
    dueDate: MI,
    completedAt: null,
    ...p,
  };
}

describe("pickTargetDay", () => {
  it("nimmt morgen, wenn dort Schule ist", () => {
    const result = pickTargetDay(DI, (d) => d === MI);
    expect(result).toEqual({ date: MI, isTomorrow: true });
  });

  it("springt zum nächsten Schultag, wenn morgen Wochenende ist", () => {
    // Freitag ist heute, Montag danach hat wieder Stunden.
    const hasLessons = (d: string) => d === MO_NAECHSTE;
    const result = pickTargetDay(FR, hasLessons);
    expect(result).toEqual({ date: MO_NAECHSTE, isTomorrow: false });
  });

  it("überspringt mehrere schulfreie Tage (z.B. bewegliche Ferientage)", () => {
    // Heute Mittwoch, Donnerstag und Freitag frei, erst Montag wieder Schule.
    const hasLessons = (d: string) => d === MO_NAECHSTE;
    const result = pickTargetDay(MI, hasLessons);
    expect(result.date).toBe(MO_NAECHSTE);
    expect(result.isTomorrow).toBe(false);
  });

  it("fällt auf morgen zurück, wenn im Suchfenster gar kein Schultag steht", () => {
    const result = pickTargetDay(DI, () => false, 5);
    expect(result).toEqual({ date: MI, isTomorrow: true });
  });

  it("Wochenende (Samstag hat nie Stunden) springt korrekt auf Montag", () => {
    const hasLessons = (d: string) => d !== SA && d !== SO;
    const result = pickTargetDay(FR, hasLessons);
    expect(result.date).toBe(MO_NAECHSTE);
    expect(result.isTomorrow).toBe(false);
  });
});

describe("pickFocusDay", () => {
  it("zeigt heute, solange heute noch Unterricht ansteht", () => {
    const result = pickFocusDay(DI, (d) => d === MI, true);
    expect(result).toEqual({ date: DI, isTomorrow: false });
    expect(targetDayLabel(result, DI)).toBe("Heute");
  });

  it("zeigt morgen, wenn heute nichts mehr läuft", () => {
    const result = pickFocusDay(DI, (d) => d === MI, false);
    expect(result).toEqual({ date: MI, isTomorrow: true });
  });

  it("springt am Freitagabend auf Montag, nicht auf Samstag", () => {
    const hasLessons = (d: string) => d === MO_NAECHSTE;
    const result = pickFocusDay(FR, hasLessons, false);
    expect(result).toEqual({ date: MO_NAECHSTE, isTomorrow: false });
  });
});

describe("targetDayLabel", () => {
  it("heißt 'Morgen', wenn der Zieltag der nächste Kalendertag ist", () => {
    expect(targetDayLabel({ date: MI, isTomorrow: true }, DI)).toBe("Morgen");
  });

  it("heißt 'Heute', wenn explizit heute angefragt ist", () => {
    expect(targetDayLabel({ date: DI, isTomorrow: true }, DI)).toBe("Heute");
  });

  it("nennt Wochentag und Datum, wenn morgen kein Schultag war", () => {
    expect(targetDayLabel({ date: MO_NAECHSTE, isTomorrow: false }, FR)).toBe("Montag, 21. Juli");
  });
});

describe("dueUntilTarget", () => {
  it("nimmt Fälliges bis inklusive Zieltag, Überfälliges eingeschlossen", () => {
    const items = [
      make({ dueDate: DI, title: "ueberfaellig" }), // heute = ueberfaellig relativ zu morgen
      make({ dueDate: MI, title: "am zieltag" }),
      make({ dueDate: DO, title: "danach" }),
    ];
    const result = dueUntilTarget(items, MI, DI);
    expect(result.map((i) => i.title)).toEqual(["ueberfaellig", "am zieltag"]);
  });

  it("lässt erledigte Aufgaben weg", () => {
    const items = [make({ dueDate: MI, completedAt: "2025-07-15T10:00:00Z" })];
    expect(dueUntilTarget(items, MI, DI)).toEqual([]);
  });

  it("lässt Aufgaben ohne Datum weg", () => {
    const items = [make({ dueDate: null })];
    expect(dueUntilTarget(items, MI, DI)).toEqual([]);
  });

  it("sortiert nach Datum, dann Prüfung vor Hausaufgabe", () => {
    const items = [
      make({ dueDate: DI, type: "homework", title: "hausaufgabe früh" }),
      make({ dueDate: DI, type: "exam", title: "arbeit früh" }),
      make({ dueDate: MI, title: "spaeter" }),
    ];
    const result = dueUntilTarget(items, MI, DI);
    expect(result.map((i) => i.title)).toEqual(["arbeit früh", "hausaufgabe früh", "spaeter"]);
  });

  it("lässt eine Prüfung genau am Zieltag weg -- die steht schon in der Prüfungskarte", () => {
    const items = [
      make({ dueDate: MI, type: "exam", title: "klassenarbeit heute fällig" }),
      make({ dueDate: MI, type: "homework", title: "hausaufgabe" }),
    ];
    expect(dueUntilTarget(items, MI, DI).map((i) => i.title)).toEqual(["hausaufgabe"]);
  });

  it("eine überfällige Prüfung (vor dem Zieltag) bleibt trotzdem in der Liste", () => {
    const items = [make({ dueDate: DI, type: "exam", title: "verpasste arbeit" })];
    expect(dueUntilTarget(items, MI, DI).map((i) => i.title)).toEqual(["verpasste arbeit"]);
  });
});

describe("examsOnTarget", () => {
  it("nur Prüfungen genau am Zieltag", () => {
    const items = [
      make({ dueDate: MI, type: "exam", title: "klassenarbeit" }),
      make({ dueDate: MI, type: "homework", title: "hausaufgabe" }),
      make({ dueDate: DO, type: "test", title: "andernTags" }),
      make({ dueDate: MI, type: "presentation", title: "referat" }),
    ];
    const result = examsOnTarget(items, MI);
    expect(result.map((i) => i.title)).toEqual(["klassenarbeit", "referat"]);
  });

  it("lässt erledigte Prüfungen weg", () => {
    const items = [make({ dueDate: MI, type: "exam", completedAt: "2025-07-15T10:00:00Z" })];
    expect(examsOnTarget(items, MI)).toEqual([]);
  });
});
