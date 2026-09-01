import { describe, expect, it } from "vitest";
import {
  addDays,
  dueLabel,
  endOfWeek,
  groupAssignments,
  groupOf,
  localISO,
  overdueLabel,
  recentlyCompleted,
  type AssignmentDTO,
  type AssignmentType,
} from "@/lib/assignments-view";

// --- Reiner Logiktest, kein DB-Zugriff ---------------------------------------
// Der Datumsbezug laeuft immer ueber einen fixen todayISO, damit die Tests nicht
// vom echten Wochentag abhaengen.

const MO = "2025-07-14";
const DI = "2025-07-15";
const MI = "2025-07-16"; // "heute" in den meisten Faellen
const DO = "2025-07-17";
const FR = "2025-07-18";
const SO = "2025-07-20"; // Ende der laufenden Woche
const NAECHSTE_WOCHE = "2025-07-21";

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

const titles = (items: AssignmentDTO[]) => items.map((i) => i.title);

describe("groupOf", () => {
  it("sortiert relativ zum uebergebenen Tag in die sechs Gruppen", () => {
    expect(groupOf(DI, MI)).toBe("overdue");
    expect(groupOf(MI, MI)).toBe("today");
    expect(groupOf(DO, MI)).toBe("tomorrow");
    expect(groupOf(FR, MI)).toBe("week"); // uebermorgen, noch in dieser Woche
    expect(groupOf(SO, MI)).toBe("week"); // Sonntag zaehlt noch dazu
    expect(groupOf(NAECHSTE_WOCHE, MI)).toBe("later"); // nach Sonntag
    expect(groupOf(null, MI)).toBe("undated");
  });

  it("kennt am Samstag keine 'Diese Woche' mehr", () => {
    const SA = "2025-07-19";
    expect(groupOf(SO, SA)).toBe("tomorrow");
    expect(groupOf(NAECHSTE_WOCHE, SA)).toBe("later");
  });
});

describe("endOfWeek", () => {
  it("liefert fuer jeden Wochentag den Sonntag derselben Woche", () => {
    for (const day of [MO, DI, MI, DO, FR, "2025-07-19"]) {
      expect(endOfWeek(day)).toBe(SO);
    }
  });

  it("liefert fuer einen Sonntag den Tag selbst", () => {
    expect(endOfWeek(SO)).toBe(SO);
  });
});

describe("groupAssignments", () => {
  it("haelt die Gruppen-Reihenfolge ein und laesst leere Gruppen weg", () => {
    const groups = groupAssignments(
      [
        make({ dueDate: null, title: "Ohne" }),
        make({ dueDate: NAECHSTE_WOCHE, title: "Spaeter" }),
        make({ dueDate: DI, title: "Ueberfaellig" }),
        make({ dueDate: DO, title: "Morgen" }),
        make({ dueDate: MI, title: "Heute" }),
      ],
      MI,
    );

    // "week" fehlt in den Daten und taucht deshalb gar nicht auf.
    expect(groups.map((g) => g.key)).toEqual([
      "overdue",
      "today",
      "tomorrow",
      "later",
      "undated",
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Überfällig",
      "Heute",
      "Morgen",
      "Später",
      "Ohne Datum",
    ]);
  });

  it("zeigt alle sechs Gruppen, wenn jede belegt ist", () => {
    const groups = groupAssignments(
      [
        make({ dueDate: FR }),
        make({ dueDate: null }),
        make({ dueDate: MI }),
        make({ dueDate: NAECHSTE_WOCHE }),
        make({ dueDate: DI }),
        make({ dueDate: DO }),
      ],
      MI,
    );
    expect(groups.map((g) => g.key)).toEqual([
      "overdue",
      "today",
      "tomorrow",
      "week",
      "later",
      "undated",
    ]);
  });

  it("laesst erledigte Aufgaben komplett weg", () => {
    const groups = groupAssignments(
      [
        make({ dueDate: MI, title: "Offen" }),
        make({ dueDate: MI, title: "Erledigt", completedAt: "2025-07-16T09:00:00.000Z" }),
        make({ dueDate: DI, title: "Alt erledigt", completedAt: "2025-07-15T09:00:00.000Z" }),
      ],
      MI,
    );
    expect(groups).toHaveLength(1);
    expect(titles(groups[0].items)).toEqual(["Offen"]);
  });

  it("gibt fuer eine leere Liste ein leeres Array zurueck", () => {
    expect(groupAssignments([], MI)).toEqual([]);
  });

  it("stellt Pruefungen innerhalb der Gruppe vor Hausaufgaben", () => {
    const groups = groupAssignments(
      [
        make({ dueDate: MI, type: "homework", subjectName: "Biologie", title: "HA Bio" }),
        make({ dueDate: MI, type: "test", subjectName: "Physik", title: "Test Physik" }),
        make({ dueDate: MI, type: "exam", subjectName: "Mathe", title: "Arbeit Mathe" }),
      ],
      MI,
    );
    expect(titles(groups[0].items)).toEqual(["Arbeit Mathe", "Test Physik", "HA Bio"]);
  });

  it("sortiert bei gleichem Typ nach Fach, dann nach Titel", () => {
    const groups = groupAssignments(
      [
        make({ dueDate: MI, subjectName: "Mathe", title: "Zinsrechnung" }),
        make({ dueDate: MI, subjectName: "Deutsch", title: "Balladen" }),
        make({ dueDate: MI, subjectName: "Mathe", title: "Aufgaben S. 12" }),
      ],
      MI,
    );
    expect(titles(groups[0].items)).toEqual(["Balladen", "Aufgaben S. 12", "Zinsrechnung"]);
  });

  it("haengt Aufgaben ohne Fach ans Ende der Fach-Reihenfolge", () => {
    const groups = groupAssignments(
      [
        make({ dueDate: MI, subjectName: null, title: "Allgemein-Kram" }),
        make({ dueDate: MI, subjectName: "Zeichnen", title: "Skizze" }),
        make({ dueDate: MI, subjectName: "Deutsch", title: "Lesen" }),
      ],
      MI,
    );
    expect(titles(groups[0].items)).toEqual(["Lesen", "Skizze", "Allgemein-Kram"]);
  });

  it("sortiert 'Später' zuerst chronologisch, dann inhaltlich", () => {
    const groups = groupAssignments(
      [
        make({ dueDate: "2025-08-10", type: "exam", subjectName: "Mathe", title: "Spaete Arbeit" }),
        make({ dueDate: NAECHSTE_WOCHE, subjectName: "Physik", title: "B-Zettel" }),
        make({ dueDate: NAECHSTE_WOCHE, subjectName: "Physik", title: "A-Zettel" }),
      ],
      MI,
    );
    const later = groups.find((g) => g.key === "later")!;
    // Trotz Pruefung steht die spaetere Arbeit hinten: Datum schlaegt Typ.
    expect(titles(later.items)).toEqual(["A-Zettel", "B-Zettel", "Spaete Arbeit"]);
  });

  it("sortiert 'Überfällig' zuerst chronologisch, dann inhaltlich", () => {
    const groups = groupAssignments(
      [
        make({ dueDate: DI, type: "homework", subjectName: "Deutsch", title: "Von gestern" }),
        make({ dueDate: MO, type: "homework", subjectName: "Physik", title: "Von vorgestern B" }),
        make({ dueDate: MO, type: "exam", subjectName: "Physik", title: "Alte Arbeit" }),
      ],
      MI,
    );
    const overdue = groups.find((g) => g.key === "overdue")!;
    expect(titles(overdue.items)).toEqual(["Alte Arbeit", "Von vorgestern B", "Von gestern"]);
  });
});

describe("overdueLabel", () => {
  it("beschreibt den Abstand zum Faelligkeitstag", () => {
    expect(overdueLabel(DI, MI)).toBe("seit gestern");
    expect(overdueLabel(MO, DO)).toBe("3 Tage überfällig");
  });
});

describe("dueLabel", () => {
  it("nutzt Worte fuer heute und morgen", () => {
    expect(dueLabel(MI, MI)).toBe("heute");
    expect(dueLabel(DO, MI)).toBe("morgen");
  });

  it("faellt sonst auf das Wochentag-Datum-Format zurueck", () => {
    expect(dueLabel(NAECHSTE_WOCHE, MI)).toBe("Mo., 21. Juli");
    expect(dueLabel("2025-12-24", MI)).toBe("Mi., 24. Dezember");
  });

  it("gibt ohne Datum null zurueck", () => {
    expect(dueLabel(null, MI)).toBeNull();
  });
});

describe("recentlyCompleted", () => {
  it("zeigt nur Erledigte der letzten 30 Tage, neueste zuerst", () => {
    const items = [
      make({ title: "Vor 40 Tagen", completedAt: `${addDays(MI, -40)}T10:00:00.000Z` }),
      make({ title: "Gestern", completedAt: `${DI}T10:00:00.000Z` }),
      make({ title: "Offen", completedAt: null }),
      make({ title: "Vor 10 Tagen", completedAt: `${addDays(MI, -10)}T10:00:00.000Z` }),
    ];
    expect(titles(recentlyCompleted(items, MI))).toEqual(["Gestern", "Vor 10 Tagen"]);
  });

  it("behaelt den Tag genau an der 30-Tage-Grenze", () => {
    const items = [
      make({ title: "Grenze", completedAt: `${addDays(MI, -30)}T10:00:00.000Z` }),
      make({ title: "Zu alt", completedAt: `${addDays(MI, -31)}T10:00:00.000Z` }),
    ];
    expect(titles(recentlyCompleted(items, MI))).toEqual(["Grenze"]);
  });
});

describe("localISO / addDays", () => {
  it("driftet nicht nach UTC: 23:30 und 00:30 desselben Tages ergeben denselben Tag", () => {
    expect(localISO(new Date(2025, 6, 16, 23, 30))).toBe(MI);
    expect(localISO(new Date(2025, 6, 16, 0, 30))).toBe(MI);
  });

  it("rechnet ueber Monats- und Jahresgrenzen", () => {
    expect(addDays(MI, 1)).toBe(DO);
    expect(addDays(MI, -1)).toBe(DI);
    expect(addDays("2025-01-31", 1)).toBe("2025-02-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // Schaltjahr
  });

  it("ueberlebt die Sommerzeit-Umstellung", () => {
    expect(addDays("2025-03-29", 1)).toBe("2025-03-30");
    expect(addDays("2025-03-30", 1)).toBe("2025-03-31");
    expect(addDays("2025-10-26", 1)).toBe("2025-10-27");
  });
});
