import { describe, expect, it, vi, beforeEach } from "vitest";

// Die Schreibwerkzeuge des Bots sind der einzige Weg, auf dem er echte Daten
// veraendert. Hier wird geprueft, dass sie nichts zerstoeren koennen -- die
// Stores dahinter sind gemockt, im Stil von lib/bot/context.test.ts.

const updateNote = vi.fn();
const createNote = vi.fn();
const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

vi.mock("@/lib/subject-store", () => ({
  createNote,
  ensureSubjectForUntis: vi.fn(),
  isUuid,
  listNotes: vi.fn(),
  listSubjects: vi.fn().mockResolvedValue([]),
  updateNote,
}));
vi.mock("@/lib/calendar-expand", () => ({ expandRange: vi.fn() }));
vi.mock("@/lib/assignment-store", () => ({
  createAssignment: vi.fn(),
  listAssignments: vi.fn(),
  updateAssignment: vi.fn(),
  setAssignmentCompleted: vi.fn(),
  assignmentDueBlockIds: vi.fn(),
}));
vi.mock("@/lib/subject-file-store", () => ({ listFiles: vi.fn() }));
vi.mock("@/lib/bot/files", () => ({ readSubjectFile: vi.fn() }));
vi.mock("@/lib/lesson-notes", () => ({ listSubjectLessonNotes: vi.fn() }));
vi.mock("@/lib/grade-store", () => ({
  gradeOverview: vi.fn(),
  listGrades: vi.fn(),
  summarize: vi.fn(),
}));

const { runTool, botTools } = await import("./tools");

const ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  updateNote.mockReset();
  createNote.mockReset();
});

describe("notiz_aendern schuetzt den vorhandenen Text", () => {
  it("lehnt einen leeren Text ab, statt die Notiz zu leeren", async () => {
    const ergebnis = await runTool("notiz_aendern", { notizId: ID, text: "" });
    expect(ergebnis).toHaveProperty("error");
    // Entscheidend: der Store wird gar nicht erst aufgerufen.
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("lehnt auch einen Text aus lauter Leerzeichen ab", async () => {
    const ergebnis = await runTool("notiz_aendern", { notizId: ID, text: "   \n  " });
    expect(ergebnis).toHaveProperty("error");
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("laesst eine echte Textaenderung durch", async () => {
    updateNote.mockResolvedValue({ id: ID, title: "T", body: "neuer Text" });
    const ergebnis = await runTool("notiz_aendern", { notizId: ID, text: "neuer Text" });
    expect(ergebnis).not.toHaveProperty("error");
    expect(updateNote).toHaveBeenCalledWith(ID, { body: "neuer Text" });
  });

  it("aendert nur den Titel, wenn kein Text mitkommt", async () => {
    updateNote.mockResolvedValue({ id: ID, title: "Neuer Titel", body: "alt" });
    await runTool("notiz_aendern", { notizId: ID, titel: "Neuer Titel" });
    expect(updateNote).toHaveBeenCalledWith(ID, { title: "Neuer Titel" });
  });

  it("meldet einen Fehler, wenn gar nichts zu aendern angegeben wurde", async () => {
    const ergebnis = await runTool("notiz_aendern", { notizId: ID });
    expect(ergebnis).toHaveProperty("error");
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("weist eine erfundene id ab, ohne den Store zu fragen", async () => {
    const ergebnis = await runTool("notiz_aendern", { notizId: "keine-id", text: "x" });
    expect(ergebnis).toHaveProperty("error");
    expect(updateNote).not.toHaveBeenCalled();
  });
});

describe("der Bot hat kein Loeschwerkzeug", () => {
  it("bietet nirgends ein Werkzeug zum Loeschen an", () => {
    const namen = botTools.map((t) => t.function.name);
    expect(namen.some((n) => /loesch|delete|entfern|remove/i.test(n))).toBe(false);
  });

  it("meldet ein unbekanntes Werkzeug als Fehler, statt zu werfen", async () => {
    const ergebnis = await runTool("notiz_loeschen", { notizId: ID });
    expect(ergebnis).toHaveProperty("error");
  });
});
