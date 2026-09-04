import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SubjectDTO } from "@/lib/subject-store";

// Die Schreibwerkzeuge des Bots sind der einzige Weg, auf dem er echte Daten
// veraendert. Hier wird geprueft, dass sie nichts zerstoeren koennen -- die
// Stores dahinter sind gemockt, im Stil von lib/bot/context.test.ts.

const updateNote = vi.fn();
const createNote = vi.fn();
const createAssignment = vi.fn();
const getAssignment = vi.fn();
const updateAssignment = vi.fn();
const listAssignments = vi.fn();
const listSubjects = vi.fn().mockResolvedValue([]);
const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

vi.mock("@/lib/subject-store", () => ({
  createNote,
  isUuid,
  listNotes: vi.fn(),
  listSubjects,
  updateNote,
}));
vi.mock("@/lib/calendar-expand", () => ({ expandRange: vi.fn() }));
vi.mock("@/lib/assignment-store", () => ({
  createAssignment,
  getAssignment,
  listAssignments,
  updateAssignment,
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
const lernplanUebersicht = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/lernplan-store", () => ({ lernplanUebersicht }));

const { runTool, botTools, matchSubject } = await import("./tools");

const ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  updateNote.mockReset();
  createNote.mockReset();
  createAssignment.mockReset();
  getAssignment.mockReset();
  updateAssignment.mockReset();
  listAssignments.mockReset();
  // Standardfall "es gibt keine Faecher" -- die Lehrplan-Tests setzen ihn um.
  listSubjects.mockReset();
  listSubjects.mockResolvedValue([]);
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

describe("aufgabe_aendern schuetzt die vorhandene Faelligkeit", () => {
  it("laesst eine unverstandene Datumsangabe wirkungslos, statt sie zu entfernen", async () => {
    getAssignment.mockResolvedValue({ id: ID, title: "Alt", dueDate: "2026-09-10" });
    updateAssignment.mockResolvedValue({ id: ID, title: "Alt", dueDate: "2026-09-10" });
    await runTool("aufgabe_aendern", { aufgabeId: ID, faellig: "nach den Ferien" });
    // Entscheidend: dueDate taucht im Patch gar nicht auf.
    const patch = updateAssignment.mock.calls.at(-1)?.[1] ?? {};
    expect(patch).not.toHaveProperty("dueDate");
  });

  it("uebernimmt ein erkanntes Datum ganz normal", async () => {
    getAssignment.mockResolvedValue({ id: ID, title: "Alt", dueDate: "2026-09-10" });
    updateAssignment.mockResolvedValue({ id: ID, title: "Alt", dueDate: "2026-09-15" });
    await runTool("aufgabe_aendern", { aufgabeId: ID, faellig: "2026-09-15" });
    expect(updateAssignment.mock.calls.at(-1)?.[1]).toMatchObject({ dueDate: "2026-09-15" });
  });

  it("laesst den Titel nicht leeren", async () => {
    getAssignment.mockResolvedValue({ id: ID, title: "Alt" });
    updateAssignment.mockResolvedValue({ id: ID, title: "Alt" });
    await runTool("aufgabe_aendern", { aufgabeId: ID, titel: "   " });
    const patch = updateAssignment.mock.calls.at(-1)?.[1] ?? {};
    expect(patch).not.toHaveProperty("title");
  });
});

describe("aufgaben_lesen filtert nach Art", () => {
  const aufgaben = [
    { id: "a", type: "homework", title: "Seite 84" },
    { id: "b", type: "exam", title: "Klassenarbeit" },
    { id: "c", type: "presentation", title: "Referat" },
  ];

  it("gibt ohne typ alles zurueck", async () => {
    listAssignments.mockResolvedValue(aufgaben);
    const e = (await runTool("aufgaben_lesen", {})) as { aufgaben: unknown[] };
    expect(e.aufgaben).toHaveLength(3);
  });

  it("laesst nur die genannten Arten durch", async () => {
    listAssignments.mockResolvedValue(aufgaben);
    const e = (await runTool("aufgaben_lesen", { typ: ["exam", "presentation"] })) as {
      aufgaben: { id: string }[];
    };
    expect(e.aufgaben.map((a) => a.id)).toEqual(["b", "c"]);
  });

  it("ignoriert eine erfundene Art, statt zu scheitern", async () => {
    listAssignments.mockResolvedValue(aufgaben);
    const e = (await runTool("aufgaben_lesen", { typ: ["klausur"] })) as { aufgaben: unknown[] };
    // Nur Unsinn im Filter heisst: gar nicht filtern, nicht leer zurueckgeben.
    expect(e.aufgaben).toHaveLength(3);
  });

  it("sagt Bescheid, wenn es zu der Art nichts gibt", async () => {
    listAssignments.mockResolvedValue([aufgaben[0]]);
    const e = (await runTool("aufgaben_lesen", { typ: ["exam"] })) as {
      aufgaben: unknown[];
      hinweis?: string;
    };
    expect(e.aufgaben).toHaveLength(0);
    expect(e.hinweis).toBeTruthy();
  });
});

describe("lehrplan_lesen bleibt ehrlich", () => {
  const mathe = {
    id: ID,
    name: "Mathe",
    untisSubject: "M",
    curriculum: "## Funktionen\n\n- Quadratische Funktionen",
    curriculumSource: "Kernlehrplan NRW G9, Klasse 10",
    curriculumUpdatedAt: "2026-09-04T10:00:00.000Z",
  };

  it("gibt Lehrplantext und Quelle zurueck", async () => {
    listSubjects.mockResolvedValue([mathe]);
    const e = (await runTool("lehrplan_lesen", { fach: "Mathe" })) as {
      lehrplan: string | null;
      quelle: string | null;
    };
    expect(e.lehrplan).toContain("Quadratische Funktionen");
    expect(e.quelle).toBe("Kernlehrplan NRW G9, Klasse 10");
  });

  it("findet das Fach auch ueber den Untis-Wert", async () => {
    listSubjects.mockResolvedValue([mathe]);
    const e = (await runTool("lehrplan_lesen", { fach: "M" })) as { fach: string };
    expect(e.fach).toBe("Mathe");
  });

  it("sagt Bescheid, statt zu scheitern, wenn kein Lehrplan hinterlegt ist", async () => {
    listSubjects.mockResolvedValue([{ ...mathe, curriculum: null, curriculumSource: null }]);
    const e = (await runTool("lehrplan_lesen", { fach: "Mathe" })) as {
      lehrplan: string | null;
      hinweis?: string;
      error?: string;
    };
    expect(e.lehrplan).toBeNull();
    expect(e.hinweis).toBeTruthy();
    expect(e.error).toBeUndefined();
  });

  it("meldet ein unbekanntes Fach als Hinweis, nicht als Fehler", async () => {
    const e = (await runTool("lehrplan_lesen", { fach: "Astronomie" })) as {
      hinweis?: string;
      error?: string;
    };
    expect(e.hinweis).toContain("Astronomie");
    expect(e.error).toBeUndefined();
  });
});

describe("lernplan_lesen liest den gemockten Store und formatiert", () => {
  beforeEach(() => {
    lernplanUebersicht.mockReset();
  });

  it("ruft lernplanUebersicht mit dem Fach und formatiert die Antwort", async () => {
    lernplanUebersicht.mockResolvedValue([
      {
        planId: "plan1",
        assignmentId: "a1",
        subjectId: "s1",
        subjectName: "Mathe",
        examTitle: "Klassenarbeit Funktionen",
        examDate: "2026-09-20",
        tageBis: 16,
        total: 10,
        done: 3,
        punkte: [{ titel: "Quadratische Funktionen", sicherheit: 40, quelle: "diagnose" }],
        heute: [{ id: "i1", planId: "plan1", pointId: "p1", punktTitel: "Quadratische Funktionen", date: "2026-09-04", position: 0, phase: "lernen", minuten: 20, doneAt: null, result: null }],
        ueberfaellig: [],
      },
    ]);

    const e = (await runTool("lernplan_lesen", { fach: "Mathe" })) as {
      plaene: { fach: string; pruefung: string; fortschritt: string; seite: string; heute: unknown[] }[];
    };

    expect(lernplanUebersicht).toHaveBeenCalledWith("Mathe");
    expect(e.plaene).toHaveLength(1);
    expect(e.plaene[0].fach).toBe("Mathe");
    expect(e.plaene[0].pruefung).toBe("Klassenarbeit Funktionen");
    expect(e.plaene[0].fortschritt).toBe("3 von 10");
    expect(e.plaene[0].seite).toBe("/lernen/s1/plan/a1");
    expect(e.plaene[0].heute).toHaveLength(1);
  });

  it("meldet einen Hinweis statt eines Fehlers, wenn es keinen Plan gibt", async () => {
    lernplanUebersicht.mockResolvedValue([]);
    const e = (await runTool("lernplan_lesen", {})) as { plaene: unknown[]; hinweis?: string; error?: string };
    expect(e.plaene).toHaveLength(0);
    expect(e.hinweis).toBeTruthy();
    expect(e.error).toBeUndefined();
  });
});

describe("der Bot bietet lernplan_lesen an", () => {
  it("botTools enthaelt lernplan_lesen mit einer Beschreibung, die 'Lernplan' nennt", () => {
    const tool = botTools.find((t) => t.function.name === "lernplan_lesen");
    expect(tool).toBeDefined();
    expect(tool?.function.description).toContain("Lernplan");
  });
});

describe("matchSubject findet vorhandene Faecher, ohne welche zu erfinden", () => {
  const faecher = [
    { id: "1", name: "Mathematik", untisSubject: "M" },
    { id: "2", name: "Biologie", untisSubject: "BI" },
    { id: "3", name: "Religion", untisSubject: "REL" },
    { id: "4", name: "Geschichte", untisSubject: "GES" },
    { id: "5", name: "Kunst", untisSubject: "KU" },
    { id: "6", name: "Kunstgeschichte", untisSubject: "KG" },
  ] as SubjectDTO[];

  it("findet 'Mathe' als Praefix von Mathematik", () => {
    expect(matchSubject("Mathe", faecher)?.name).toBe("Mathematik");
  });

  it("findet 'bio' als Praefix von Biologie", () => {
    expect(matchSubject("bio", faecher)?.name).toBe("Biologie");
  });

  it("findet 'reli' als Praefix von Religion", () => {
    expect(matchSubject("reli", faecher)?.name).toBe("Religion");
  });

  it("findet 'Franzoesisch' ueber die geschriebene Form gegen 'Französisch'", () => {
    const mitUmlaut = [...faecher, { id: "7", name: "Französisch", untisSubject: "F" } as SubjectDTO];
    expect(matchSubject("Franzoesisch", mitUmlaut)?.name).toBe("Französisch");
  });

  it("laesst 'Ge' (2 Zeichen normalisiert) nicht auf Geschichte matchen", () => {
    expect(matchSubject("Ge", faecher)).toBeUndefined();
  });

  it("gibt bei echter Mehrdeutigkeit undefined zurueck", () => {
    // "Kuns" ist Praefix von sowohl Kunst als auch Kunstgeschichte.
    expect(matchSubject("Kuns", faecher)).toBeUndefined();
  });
});

describe("resolveSubjectId legt nie ein neues Fach an", () => {
  it("aufgabe_anlegen mit unbekanntem Fach liefert einen Fehler mit den vorhandenen Faechern, ohne anzulegen", async () => {
    listSubjects.mockResolvedValue([{ id: "1", name: "Mathematik", untisSubject: "M" }]);
    const ergebnis = (await runTool("aufgabe_anlegen", { titel: "x", fach: "Kunstgeschichte" })) as {
      error?: string;
    };
    expect(ergebnis.error).toContain("Mathematik");
    expect(createAssignment).not.toHaveBeenCalled();
  });

  it("notiz_anlegen mit 'mathe' trifft Mathematik und legt die Notiz dort an", async () => {
    listSubjects.mockResolvedValue([{ id: "1", name: "Mathematik", untisSubject: "M" }]);
    createNote.mockResolvedValue({ id: "n1", subjectId: "1", title: "x", body: "" });
    await runTool("notiz_anlegen", { fach: "mathe", titel: "x", text: "y" });
    expect(createNote).toHaveBeenCalledWith(expect.objectContaining({ subjectId: "1" }));
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
