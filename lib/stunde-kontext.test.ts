import { describe, expect, it, vi, beforeEach } from "vitest";

// ladeStundeKontext ist die Berechnung hinter GET /api/stunde -- hier wird
// nur das neue Feld "lernen" geprueft (A19: leer als [], wenn kein Plan
// existiert), im Stil der anderen Store-Mock-Tests (siehe lib/bot/tools.test.ts).
// jetzt-stunde ist rein und bleibt unmockiert, DB-Zugriffe werden gemockt.

const expandDay = vi.fn();
const listAssignments = vi.fn();
const listSubjects = vi.fn();
const listSubjectLessonNotes = vi.fn();
const findNextLessonDate = vi.fn();
const lernenFuerTag = vi.fn();

vi.mock("@/lib/calendar-expand", () => ({ expandDay }));
vi.mock("@/lib/assignment-store", () => ({ listAssignments }));
vi.mock("@/lib/subject-store", () => ({ listSubjects }));
vi.mock("@/lib/lesson-notes", () => ({ listSubjectLessonNotes }));
vi.mock("@/lib/next-lesson", () => ({ findNextLessonDate }));
vi.mock("@/lib/lernplan-store", () => ({ lernenFuerTag }));

const { ladeStundeKontext } = await import("./stunde-kontext");

beforeEach(() => {
  expandDay.mockReset();
  listAssignments.mockReset();
  listSubjects.mockReset();
  listSubjectLessonNotes.mockReset();
  findNextLessonDate.mockReset();
  lernenFuerTag.mockReset();

  // Ein Tag ganz ohne Stunden ("frei") -- die Sondertreatung fuer selected
  // (Notizen, faellige Aufgaben) laeuft dann gar nicht erst an.
  expandDay.mockResolvedValue({ days: [{ date: "irrelevant", weekday: 0, events: [] }] });
  listAssignments.mockResolvedValue([]);
  listSubjects.mockResolvedValue([]);
});

describe("ladeStundeKontext trägt lernen", () => {
  it("liefert lernen als [], wenn kein Lernplan für heute existiert", async () => {
    lernenFuerTag.mockResolvedValue([]);
    const result = await ladeStundeKontext();
    expect(result.lernen).toEqual([]);
    expect(lernenFuerTag).toHaveBeenCalledWith(result.today);
  });

  it("reicht die Einträge von lernenFuerTag unverändert durch", async () => {
    const eintrag = {
      planId: "p1",
      subjectId: "s1",
      assignmentId: "a1",
      examTitle: "Mathe-Arbeit",
      sicherheit: 60,
      items: [],
    };
    lernenFuerTag.mockResolvedValue([eintrag]);
    const result = await ladeStundeKontext();
    expect(result.lernen).toEqual([eintrag]);
  });
});
