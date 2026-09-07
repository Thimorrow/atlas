import { describe, expect, it } from "vitest";
import { fasseDoppelstundenZusammen, type DoppelKandidat } from "@/lib/doppelstunde";

// --- Reiner Logiktest, kein DB-Zugriff ---------------------------------------

type Stunde = DoppelKandidat;

function stunde(
  refId: string,
  startTime: string,
  endTime: string | null,
  title = "Mathe",
  extra: Partial<Stunde> = {},
): Stunde {
  return {
    refId,
    startTime,
    endTime,
    title,
    status: "regular",
    room: "R204",
    teacher: "Mueller",
    hasNote: false,
    hasAssignment: false,
    ...extra,
  };
}

describe("fasseDoppelstundenZusammen", () => {
  it("leerer Tag bleibt leer", () => {
    expect(fasseDoppelstundenZusammen([])).toEqual([]);
  });

  it("eine Einzelstunde bleibt eine Einheit mit genau ihrer ID", () => {
    const out = fasseDoppelstundenZusammen([stunde("a", "08:00", "08:45")]);
    expect(out).toHaveLength(1);
    expect(out[0].refId).toBe("a");
    expect(out[0].refIds).toEqual(["a"]);
  });

  it("zwei lueckenlose Bloecke desselben Fachs werden eins", () => {
    const out = fasseDoppelstundenZusammen([
      stunde("a", "08:00", "08:45"),
      stunde("b", "08:45", "09:30"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].refId).toBe("a");
    expect(out[0].refIds).toEqual(["a", "b"]);
    expect(out[0].startTime).toBe("08:00");
    expect(out[0].endTime).toBe("09:30");
  });

  it("drei aufeinanderfolgende Bloecke werden eins", () => {
    const out = fasseDoppelstundenZusammen([
      stunde("a", "08:00", "08:45"),
      stunde("b", "08:45", "09:30"),
      stunde("c", "09:30", "10:15"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].refIds).toEqual(["a", "b", "c"]);
    expect(out[0].endTime).toBe("10:15");
  });

  it("eine Pause dazwischen trennt", () => {
    const out = fasseDoppelstundenZusammen([
      stunde("a", "08:00", "08:45"),
      stunde("b", "09:45", "10:30"),
    ]);
    expect(out).toHaveLength(2);
  });

  it("ein anderes Fach dazwischen trennt", () => {
    const out = fasseDoppelstundenZusammen([
      stunde("a", "08:00", "08:45", "Mathe"),
      stunde("b", "08:45", "09:30", "Deutsch"),
    ]);
    expect(out).toHaveLength(2);
  });

  it("eine entfallene Haelfte verschmilzt nicht mit der stattfindenden", () => {
    const out = fasseDoppelstundenZusammen([
      stunde("a", "08:00", "08:45", "Mathe", { status: "cancelled" }),
      stunde("b", "08:45", "09:30"),
    ]);
    expect(out).toHaveLength(2);
  });

  it("Raum- oder Lehrerwechsel zur Naht trennt", () => {
    const raumwechsel = fasseDoppelstundenZusammen([
      stunde("a", "08:00", "08:45"),
      stunde("b", "08:45", "09:30", "Mathe", { room: "R205" }),
    ]);
    expect(raumwechsel).toHaveLength(2);

    const lehrerwechsel = fasseDoppelstundenZusammen([
      stunde("a", "08:00", "08:45"),
      stunde("b", "08:45", "09:30", "Mathe", { teacher: "Schulze" }),
    ]);
    expect(lehrerwechsel).toHaveLength(2);
  });

  it("Notiz- und Aufgabenmarker gelten fuer die ganze Einheit", () => {
    const out = fasseDoppelstundenZusammen([
      stunde("a", "08:00", "08:45", "Mathe", { hasNote: true }),
      stunde("b", "08:45", "09:30", "Mathe", { hasAssignment: true }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].hasNote).toBe(true);
    expect(out[0].hasAssignment).toBe(true);
  });

  it("unsortierte Eingabe wird nach Startzeit geordnet", () => {
    const out = fasseDoppelstundenZusammen([
      stunde("b", "08:45", "09:30"),
      stunde("a", "08:00", "08:45"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].refId).toBe("a");
  });

  it("ein Block ohne Endzeit schluckt den Nachfolger nicht", () => {
    const out = fasseDoppelstundenZusammen([
      stunde("a", "08:00", null),
      stunde("b", "08:45", "09:30"),
    ]);
    expect(out).toHaveLength(2);
  });

  it("unterschiedlicher Vertretungstext zur Naht trennt", () => {
    const out = fasseDoppelstundenZusammen([
      stunde("a", "08:00", "08:45", "Mathe", { status: "substituted", substitutionText: "Raum 204" }),
      stunde("b", "08:45", "09:30", "Mathe", { status: "substituted", substitutionText: "Raum 205" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("gleicher Vertretungstext zur Naht verschmilzt", () => {
    const out = fasseDoppelstundenZusammen([
      stunde("a", "08:00", "08:45", "Mathe", { status: "substituted", substitutionText: "Raum 204" }),
      stunde("b", "08:45", "09:30", "Mathe", { status: "substituted", substitutionText: "Raum 204" }),
    ]);
    expect(out).toHaveLength(1);
  });
});
