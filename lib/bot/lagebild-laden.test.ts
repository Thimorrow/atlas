import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ subjects: vi.fn(), notes: vi.fn(), calendar: vi.fn(), assignments: vi.fn(), plans: vi.fn() }));
vi.mock("@/lib/subject-store", () => ({ listSubjects: mocks.subjects, listRecentNotes: mocks.notes }));
vi.mock("@/lib/calendar-expand", () => ({ expandRange: mocks.calendar }));
vi.mock("@/lib/assignment-store", () => ({ listAssignments: mocks.assignments }));
vi.mock("@/lib/lernplan-store", () => ({ lernplaeneAnzahl: mocks.plans }));
import { ladeLagebild, lagebildAlsText } from "./lagebild";
import { heuteISO } from "@/lib/zeit";
import { addDays } from "@/lib/assignments-view";

describe("Lagebild bei Datenfehlern", () => {
  beforeEach(() => {
    mocks.subjects.mockResolvedValue([]);
    mocks.notes.mockResolvedValue([]);
    mocks.calendar.mockResolvedValue({ days: [] });
    mocks.assignments.mockResolvedValue([]);
    mocks.plans.mockResolvedValue(0);
  });
  it("behauptet bei Kalenderausfall weder schulfrei noch fehlende nächste Stunden", async () => {
    mocks.calendar.mockRejectedValue(new Error("offline"));
    const text = lagebildAlsText(await ladeLagebild());
    expect(text).toContain("Stundenplan: derzeit nicht verfügbar");
    expect(text).not.toContain("keine Schule");
    expect(text).not.toContain("in den nächsten 7 Tagen keiner");
    expect(text).toContain("Offene Aufgaben (bis in 14 Tagen, ohne Prüfungen):\n- keine");
  });
  it("unterscheidet fehlgeschlagene Aufgaben-, Notiz- und Fachabfragen von leeren Ergebnissen", async () => {
    mocks.subjects.mockRejectedValue(new Error("offline"));
    mocks.notes.mockRejectedValue(new Error("offline"));
    mocks.assignments.mockRejectedValue(new Error("offline"));
    mocks.plans.mockRejectedValue(new Error("offline"));
    const text = lagebildAlsText(await ladeLagebild());
    expect(text).toContain("Fächer: derzeit nicht verfügbar");
    expect(text).toContain("Aufgaben und Prüfungen: derzeit nicht verfügbar");
    expect(text).toContain("Notizen: derzeit nicht verfügbar");
    expect(text).toContain("Lernpläne: derzeit nicht verfügbar");
    expect(text).not.toContain("- keine");
  });
  it("weist auf ausgelassene Aufgaben hin, statt Vollständigkeit vorzutäuschen", async () => {
    mocks.assignments.mockResolvedValue(Array.from({ length: 30 }, (_, i) => ({ id: String(i), title: "Aufgabe", type: "homework", dueDate: null })));
    const text = lagebildAlsText(await ladeLagebild());
    expect(text).toContain("5 weitere Aufgaben");
    expect(text).toContain("aufgaben_lesen");
  });
  it("zählt einen komplett ausgefallenen Tag nicht als nächsten Schultag", async () => {
    const tomorrow = addDays(heuteISO(), 1);
    const next = addDays(heuteISO(), 2);
    mocks.calendar.mockResolvedValue({ days: [
      { date: tomorrow, events: [{ title: "Mathe", status: "cancelled", startTime: "08:00" }] },
      { date: next, events: [{ title: "Deutsch", status: "regular", startTime: "08:00" }] },
    ] });
    expect((await ladeLagebild()).naechsterSchultag?.date).toBe(next);
  });
});
