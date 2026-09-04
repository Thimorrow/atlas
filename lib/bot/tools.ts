// Werkzeuge des Atlas-Bots: OpenAI-Funktionsschema (deutsche Beschreibungen)
// plus Ausfuehrung. Lesen greift ausschliesslich auf bestehende Store-
// Funktionen zu, schreibende Werkzeuge nutzen dieselben Create/Update-Pfade
// wie die normalen API-Routen -- keine eigenen Queries.
//
// Es gibt bewusst KEIN Loesch-Werkzeug, auch nicht ueber Umwege: der Bot legt
// an und aendert, loeschen bleibt der Oberflaeche vorbehalten.

import { expandRange } from "@/lib/calendar-expand";
import {
  createAssignment,
  getAssignment,
  listAssignments,
  completeAssignment,
  uncompleteAssignment,
  updateAssignment,
} from "@/lib/assignment-store";
import { listFiles } from "@/lib/subject-file-store";
import { readSubjectFile, type FileContent } from "@/lib/bot/files";
import { parseFuzzyDate } from "@/lib/bot/dates";
import {
  createNote,
  isUuid,
  listNotes,
  listSubjects,
  updateNote,
  type SubjectDTO,
} from "@/lib/subject-store";
import { listSubjectLessonNotes } from "@/lib/lesson-notes";
import { gradeOverview, listGrades, summarize } from "@/lib/grade-store";
import { pointsToGradeLabel } from "@/lib/grades";
import { ladeStundeKontext } from "@/lib/stunde-kontext";
import { overview, subjectDetail, createCards, createTopic, listTopics } from "@/lib/study-store";
import { lernplanUebersicht } from "@/lib/lernplan-store";
import { generateCards, type GenerateInput } from "@/lib/lernen-generieren";
import type { ChatTool } from "@/lib/bot/model";
import type { NewAssignment, NewSubjectNote } from "@/lib/db/schema";

import { heuteISO as localISO } from "@/lib/zeit";
import { addDays } from "@/lib/assignments-view";
import { mitUmlauten } from "@/lib/umlaute";


// Normalisiert einen Fachnamen fuers Matching: trim, klein, deutsche
// Umlaute ausgeschrieben, alles ausser [a-z0-9] weg. "Mathe" und "Mathe."
// landen so auf demselben Wert, "Franzoesisch" trifft "Französisch".
function normalizeSubjectName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

// Fach anhand eines vom Modell genannten Namens finden. Reine Funktion, daher
// gut isoliert testbar. Reihenfolge: 1) exakter Treffer auf name, 2) exakter
// Treffer auf untisSubject, 3) genau ein Fach, dessen normalisierter name
// oder untisSubject mit der Eingabe beginnt (z. B. "mathe" -> "Mathematik"),
// 4) genau ein Fach, dessen normalisierter name die Eingabe enthaelt. Mehr
// als ein Treffer in Stufe 3/4 ist Mehrdeutigkeit, kein Treffer -- undefined.
// Kurze Eingaben (< 3 Zeichen normalisiert) sind zu unspezifisch fuer
// Praefix-/Enthaelt-Matching und werden nur exakt geprueft.
export function matchSubject(name: string, subjects: SubjectDTO[]): SubjectDTO | undefined {
  const needle = normalizeSubjectName(name);
  if (!needle) return undefined;

  const byName = subjects.find((s) => normalizeSubjectName(s.name) === needle);
  if (byName) return byName;

  const byUntisSubject = subjects.find(
    (s) => s.untisSubject && normalizeSubjectName(s.untisSubject) === needle,
  );
  if (byUntisSubject) return byUntisSubject;

  if (needle.length < 3) return undefined;

  const praefixTreffer = subjects.filter((s) => {
    const n = normalizeSubjectName(s.name);
    const u = s.untisSubject ? normalizeSubjectName(s.untisSubject) : "";
    return n.startsWith(needle) || (u && u.startsWith(needle));
  });
  if (praefixTreffer.length === 1) return praefixTreffer[0];
  if (praefixTreffer.length > 1) return undefined;

  const enthaeltTreffer = subjects.filter((s) => normalizeSubjectName(s.name).includes(needle));
  if (enthaeltTreffer.length === 1) return enthaeltTreffer[0];
  return undefined;
}

// Fach anhand des Namens finden, den das Modell nennt. Kein Treffer heisst
// "gibt es (noch) nicht", nicht "Fehler".
async function findSubjectByName(name: string): Promise<SubjectDTO | undefined> {
  const all = await listSubjects("all");
  return matchSubject(name, all);
}

// --- Datumshilfe fuers Werkzeugergebnis --------------------------------------

// Nimmt eine vom Modell gelieferte Datumsangabe entgegen und gibt ISO + einen
// Hinweis zurueck, falls sie nicht verstanden wurde -- nie einen Fehler.
function resolveDate(input: string | undefined | null): { iso: string | null; hint?: string } {
  if (!input) return { iso: null };
  return parseFuzzyDate(input);
}

// --- Schemas -------------------------------------------------------------

const DATE_DESC =
  "Datum, bevorzugt ISO (JJJJ-MM-TT). Deutsche Angaben wie \"morgen\" oder \"nächsten Montag\" werden ebenfalls verstanden.";

export const botTools: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "stundenplan_lesen",
      description:
        "Liest die Schulstunden in einem Zeitraum. Ohne Angabe: heute bis in sieben Tagen.",
      parameters: {
        type: "object",
        properties: {
          von: { type: "string", description: DATE_DESC },
          bis: { type: "string", description: DATE_DESC },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aufgaben_lesen",
      description:
        "Liest Aufgaben (Hausaufgaben, Klassenarbeiten, ...), optional gefiltert. Für eine Frage nach anstehenden Prüfungen setze typ auf [\"exam\", \"test\", \"presentation\"], statt alles zu lesen und selbst zu sortieren.",
      parameters: {
        type: "object",
        properties: {
          nurOffen: { type: "boolean", description: "Nur nicht erledigte Aufgaben. Standard: true." },
          fach: { type: "string", description: "Name des Fachs, z. B. \"Mathe\"." },
          typ: {
            type: "array",
            items: {
              type: "string",
              enum: ["homework", "exam", "test", "presentation", "other"],
            },
            description:
              "Auf diese Arten einschränken. homework = Hausaufgabe, exam = Klassenarbeit, test = Test, presentation = Referat.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "faecher_lesen",
      description: "Liste der aktiven Fächer mit Lehrer, Raum und Farbe.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "notizen_lesen",
      description:
        "Liest Fach-Notizen und Stundennotizen mit ihrem Text, optional gefiltert nach Fach und Suchbegriff.",
      parameters: {
        type: "object",
        properties: {
          fach: { type: "string", description: "Name des Fachs." },
          suche: { type: "string", description: "Suchbegriff, der im Text vorkommen muss." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "noten_lesen",
      description: "Liest Noten samt Fachschnitt, optional auf ein Fach eingeschränkt.",
      parameters: {
        type: "object",
        properties: { fach: { type: "string", description: "Name des Fachs." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lehrplan_lesen",
      description:
        "Liest den Lehrplan eines Fachs -- was in diesem Schuljahr an Themen ansteht. Nutze ihn für Fragen wie \"was kommt als Nächstes dran\" oder \"worauf muss ich mich vorbereiten\". Der Lehrplan ist eine Orientierung, keine Planung der Lehrkraft.",
      parameters: {
        type: "object",
        properties: { fach: { type: "string", description: "Name des Fachs." } },
        required: ["fach"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dateien_auflisten",
      description: "Listet Name, Typ und Größe der Dateien eines Fachs (oder aller Fächer).",
      parameters: {
        type: "object",
        properties: { fach: { type: "string", description: "Name des Fachs." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "datei_lesen",
      description:
        "Liest den Inhalt einer Datei (Text/Markdown direkt, PDF per Extraktion, Bilder als Bild-Inhalt).",
      parameters: {
        type: "object",
        properties: { dateiId: { type: "string", description: "id der Datei aus dateien_auflisten." } },
        required: ["dateiId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aufgabe_anlegen",
      description: "Legt eine neue Aufgabe an (Hausaufgabe, Klassenarbeit, ...).",
      parameters: {
        type: "object",
        properties: {
          titel: { type: "string", description: "Titel der Aufgabe." },
          fach: {
            type: "string",
            description:
              "Name eines vorhandenen Fachs, exakt wie in der Fächerliste. Unbekannte Fächer werden abgelehnt, nicht angelegt.",
          },
          typ: {
            type: "string",
            enum: ["homework", "exam", "test", "presentation", "other"],
            description: "Aufgabentyp. Standard: homework.",
          },
          faellig: { type: "string", description: DATE_DESC },
          notiz: { type: "string", description: "Zusätzliche Notiz zur Aufgabe." },
        },
        required: ["titel"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aufgabe_aendern",
      description: "Ändert eine bestehende Aufgabe, z. B. Fälligkeit oder erledigt-Status.",
      parameters: {
        type: "object",
        properties: {
          aufgabeId: { type: "string", description: "id der Aufgabe." },
          titel: { type: "string" },
          faellig: { type: "string", description: DATE_DESC },
          notiz: { type: "string" },
          erledigt: { type: "boolean", description: "true = abhaken, false = wieder offen." },
        },
        required: ["aufgabeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notiz_anlegen",
      description: "Legt eine neue Fach-Notiz an.",
      parameters: {
        type: "object",
        properties: {
          fach: {
            type: "string",
            description:
              "Name eines vorhandenen Fachs, exakt wie in der Fächerliste. Unbekannte Fächer werden abgelehnt, nicht angelegt.",
          },
          titel: { type: "string" },
          text: { type: "string" },
        },
        required: ["fach", "titel", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notiz_aendern",
      description:
        "Ändert Titel und/oder Text einer bestehenden Fach-Notiz. Der neue Text ersetzt den alten vollständig, gib also immer den kompletten gewünschten Inhalt an. Ein leerer Text wird abgelehnt, weil er die Notiz löschen würde. Soll nur der Titel geändert werden, lass text weg.",
      parameters: {
        type: "object",
        properties: {
          notizId: { type: "string", description: "id der Notiz." },
          titel: { type: "string" },
          text: {
            type: "string",
            description: "Der vollständige neue Inhalt. Darf nicht leer sein.",
          },
        },
        required: ["notizId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "note_vorschlagen",
      description:
        "Schlägt eine Note zum Eintragen vor. Legt NICHTS an -- die Oberfläche zeigt eine Vorschau, die der Schüler erst bestätigen muss.",
      parameters: {
        type: "object",
        properties: {
          fach: { type: "string", description: "Name des Fachs." },
          punkte: { type: "number", description: "Punkte von 0 bis 15." },
          art: { type: "string", enum: ["oral", "written"], description: "mündlich oder schriftlich." },
          bezeichnung: { type: "string", description: "z. B. \"Klausur 1\"." },
          datum: { type: "string", description: DATE_DESC },
          gewicht: { type: "number", description: "Gewichtung, 1 = einfach, 2 = doppelt. Standard: 1." },
        },
        required: ["fach", "punkte", "art", "bezeichnung", "datum"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "jetzt_lesen",
      description:
        "Liest die aktuelle Cockpit-Situation: läuft gerade Unterricht, ist Pause, oder ist die Schule schon vorbei, dazu die nächste/laufende Stunde, heute fällige Aufgaben, die nächste Prüfung und der Tagesplan. Nutze es für Fragen wie 'was ist gerade/jetzt' oder 'was kommt als Nächstes heute'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "lernstand_lesen",
      description:
        "Liest den Lernstand (Karteikarten-Fortschritt je Fach: fällig/neu/lernend/sicher, nächste Prüfung, Lernplan). Nutze es IMMER zuerst, bevor du zu Lernen oder einer Prüfungsvorbereitung etwas vorschlägst -- erst nachsehen, dann konkret vorschlagen (z. B. Karten erzeugen, Sitzung starten), statt allgemeine Lerntipps zu geben.",
      parameters: {
        type: "object",
        properties: {
          fach: { type: "string", description: "Name des Fachs. Ohne Angabe: Übersicht über alle Fächer." },
          mitKarten: {
            type: "boolean",
            description: "Nur mit fach: gibt zusätzlich die ersten 30 Karten mit Frage/Antwort zurück.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lernplan_lesen",
      description:
        "Liest den Lernplan zu einer Prüfung: Datum, Tage bis dahin, Fortschritt, Sicherheit je Punkt mit Quelle, Einheiten von heute und überfällige. Nutze es für Fragen wie 'Wie steht mein Lernplan?' oder 'Was muss ich heute für die Arbeit lernen?'. Lesend, kein Schreibzugriff.",
      parameters: {
        type: "object",
        properties: {
          fach: { type: "string", description: "Name des Fachs. Ohne Angabe: alle Lernpläne." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lernkarten_erzeugen",
      description:
        "Erzeugt per KI neue Karteikarten aus Notizen, Dateien oder Lehrplan eines Fachs und legt sie direkt an. NUR auf ausdrücklichen Wunsch des Schülers nutzen oder nachdem du nachgefragt und er zugestimmt hat -- nie ungefragt Karten erzeugen.",
      parameters: {
        type: "object",
        properties: {
          fach: { type: "string", description: "Name des Fachs." },
          quelle: {
            type: "string",
            enum: ["notizen", "dateien", "lehrplan", "alles"],
            description: "Woraus die Karten entstehen sollen. Standard: alles.",
          },
          thema: { type: "string", description: "Optionaler Schwerpunkt, z. B. ein bestimmtes Kapitel." },
          anzahl: { type: "number", description: "Anzahl der Karten, 1 bis 30. Standard: 12." },
        },
        required: ["fach"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lernkarte_anlegen",
      description: "Legt eine einzelne Karteikarte mit Frage und Antwort in einem Fach an.",
      parameters: {
        type: "object",
        properties: {
          fach: {
            type: "string",
            description:
              "Name eines vorhandenen Fachs, exakt wie in der Fächerliste. Unbekannte Fächer werden abgelehnt, nicht angelegt.",
          },
          frage: { type: "string" },
          antwort: { type: "string" },
        },
        required: ["fach", "frage", "antwort"],
      },
    },
  },
];

// Kurzer deutscher Klartext dafuer, was der Bot gerade tut -- fuer das
// "status"-Ereignis im Stream.
export function statusTextFor(name: string, args: Record<string, unknown>): string {
  const fach = typeof args.fach === "string" ? args.fach : undefined;
  switch (name) {
    case "stundenplan_lesen":
      return "liest den Stundenplan";
    case "aufgaben_lesen":
      return fach ? `liest Aufgaben in ${fach}` : "liest die Aufgaben";
    case "faecher_lesen":
      return "liest die Fächerliste";
    case "notizen_lesen":
      return fach ? `liest Notizen in ${fach}` : "liest die Notizen";
    case "noten_lesen":
      return fach ? `liest Noten in ${fach}` : "liest die Noten";
    case "lehrplan_lesen":
      return fach ? `liest den Lehrplan in ${fach}` : "liest den Lehrplan";
    case "dateien_auflisten":
      return fach ? `listet Dateien in ${fach}` : "listet die Dateien";
    case "datei_lesen":
      return "liest eine Datei";
    case "aufgabe_anlegen":
      return "legt eine Aufgabe an";
    case "aufgabe_aendern":
      return "ändert eine Aufgabe";
    case "notiz_anlegen":
      return "legt eine Notiz an";
    case "notiz_aendern":
      return "ändert eine Notiz";
    case "note_vorschlagen":
      return "schlägt eine Note vor";
    case "jetzt_lesen":
      return "liest die aktuelle Stunde";
    case "lernstand_lesen":
      return fach ? `liest den Lernstand in ${fach}` : "liest den Lernstand";
    case "lernplan_lesen":
      return fach ? `liest den Lernplan in ${fach}` : "liest die Lernpläne";
    case "lernkarten_erzeugen":
      return fach ? `erzeugt Lernkarten in ${fach}` : "erzeugt Lernkarten";
    case "lernkarte_anlegen":
      return "legt eine Lernkarte an";
    default:
      return `führt ${name} aus`;
  }
}

// --- Ausfuehrung ---------------------------------------------------------

export async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "stundenplan_lesen":
      return stundenplanLesen(args);
    case "aufgaben_lesen":
      return aufgabenLesen(args);
    case "faecher_lesen":
      return faecherLesen();
    case "notizen_lesen":
      return notizenLesen(args);
    case "noten_lesen":
      return notenLesen(args);
    case "lehrplan_lesen":
      return lehrplanLesen(args);
    case "dateien_auflisten":
      return dateienAuflisten(args);
    case "datei_lesen":
      return dateiLesen(args);
    case "aufgabe_anlegen":
      return aufgabeAnlegen(args);
    case "aufgabe_aendern":
      return aufgabeAendern(args);
    case "notiz_anlegen":
      return notizAnlegen(args);
    case "notiz_aendern":
      return notizAendern(args);
    case "note_vorschlagen":
      return noteVorschlagen(args);
    case "jetzt_lesen":
      return jetztLesen();
    case "lernstand_lesen":
      return lernstandLesen(args);
    case "lernplan_lesen":
      return lernplanLesen(args);
    case "lernkarten_erzeugen":
      return lernkartenErzeugen(args);
    case "lernkarte_anlegen":
      return lernkarteAnlegen(args);
    default:
      return { error: `Unbekanntes Werkzeug: ${name}` };
  }
}

async function stundenplanLesen(args: Record<string, unknown>) {
  const heute = localISO();
  const von = typeof args.von === "string" ? resolveDate(args.von) : { iso: heute };
  const bis = typeof args.bis === "string" ? resolveDate(args.bis) : { iso: addDays(heute, 7) };

  const start = von.iso ?? heute;
  const ende = bis.iso ?? addDays(start, 7);

  const range = await expandRange(start, ende);
  return {
    von: start,
    bis: ende,
    hinweisVon: von.hint,
    hinweisBis: bis.hint,
    tage: range.days.map((d) => ({
      datum: d.date,
      stunden: d.events.map((e) => ({
        beginn: e.startTime,
        ende: e.endTime,
        fach: e.title,
        raum: e.room,
        lehrer: e.teacher,
        status: e.status,
      })),
    })),
  };
}

async function aufgabenLesen(args: Record<string, unknown>) {
  const nurOffen = args.nurOffen === undefined ? true : Boolean(args.nurOffen);
  let subjectId: string | undefined;
  if (typeof args.fach === "string" && args.fach.trim()) {
    const subject = await findSubjectByName(args.fach);
    if (!subject) return { hinweis: `Fach "${args.fach}" wurde nicht gefunden.`, aufgaben: [] };
    subjectId = subject.id;
  }
  const list = await listAssignments({ includeCompleted: !nurOffen, subjectId });

  // Nach Art filtern erst hier, nicht im Store: der Store liefert die Aufgaben
  // schon fertig sortiert und angereichert, und die Menge ist klein genug,
  // dass sich dafuer keine zweite Abfrage lohnt. Unbekannte Werte werden
  // stillschweigend ignoriert statt zu einem Fehler zu fuehren -- ein Modell,
  // das sich eine Art ausdenkt, soll trotzdem eine brauchbare Antwort bekommen.
  const erlaubt = new Set(["homework", "exam", "test", "presentation", "other"]);
  const typen = Array.isArray(args.typ)
    ? args.typ.filter((t): t is string => typeof t === "string" && erlaubt.has(t))
    : [];
  if (typen.length === 0) return { aufgaben: list };

  const gefiltert = list.filter((a) => typen.includes(a.type));
  return {
    aufgaben: gefiltert,
    ...(gefiltert.length === 0
      ? { hinweis: `Keine Aufgaben dieser Art (${typen.join(", ")}) gefunden.` }
      : {}),
  };
}

async function faecherLesen() {
  const subjects = await listSubjects("active");
  return {
    faecher: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      lehrer: s.teacherLabel,
      raum: s.room,
      farbe: s.color,
    })),
  };
}

async function notizenLesen(args: Record<string, unknown>) {
  const suche = typeof args.suche === "string" ? args.suche.trim().toLowerCase() : undefined;
  let subjects: SubjectDTO[];
  if (typeof args.fach === "string" && args.fach.trim()) {
    const subject = await findSubjectByName(args.fach);
    if (!subject) return { hinweis: `Fach "${args.fach}" wurde nicht gefunden.`, notizen: [] };
    subjects = [subject];
  } else {
    subjects = await listSubjects("active");
  }

  const notizen: Array<{
    id: string;
    art: "fach" | "stunde";
    fach: string;
    titel: string | null;
    text: string;
    aktualisiertAm: string;
  }> = [];

  for (const subject of subjects) {
    const fachNotizen = await listNotes(subject.id);
    for (const n of fachNotizen) {
      notizen.push({ id: n.id, art: "fach", fach: subject.name, titel: n.title, text: n.body, aktualisiertAm: n.updatedAt });
    }
    const stundenNotizen = await listSubjectLessonNotes(subject);
    for (const n of stundenNotizen) {
      notizen.push({
        id: n.id,
        art: "stunde",
        fach: subject.name,
        titel: null,
        text: n.body,
        aktualisiertAm: n.updatedAt,
      });
    }
  }

  const gefiltert = suche
    ? notizen.filter((n) => n.text.toLowerCase().includes(suche) || n.titel?.toLowerCase().includes(suche))
    : notizen;

  return { notizen: gefiltert };
}

async function notenLesen(args: Record<string, unknown>) {
  if (typeof args.fach === "string" && args.fach.trim()) {
    const subject = await findSubjectByName(args.fach);
    if (!subject) return { hinweis: `Fach "${args.fach}" wurde nicht gefunden.`, faecher: [] };
    const noten = await listGrades(subject.id);
    return {
      faecher: [
        {
          fach: subject.name,
          schnitt: summarize(noten, subject.oralWeight),
          noten,
        },
      ],
    };
  }

  const overview = await gradeOverview();
  return { gesamtschnitt: overview.overall, faecher: overview.subjects };
}

// Kein hinterlegter Lehrplan ist kein Fehler, sondern eine Auskunft: der Bot
// soll das ehrlich sagen statt sich Themen auszudenken.
async function lehrplanLesen(args: Record<string, unknown>) {
  const fach = typeof args.fach === "string" ? args.fach.trim() : "";
  if (!fach) return { hinweis: "Ohne Fachnamen lässt sich kein Lehrplan nachschlagen.", lehrplan: null };

  const subject = await findSubjectByName(fach);
  if (!subject) return { hinweis: `Fach "${fach}" wurde nicht gefunden.`, lehrplan: null };

  if (!subject.curriculum) {
    return {
      fach: subject.name,
      lehrplan: null,
      hinweis: `Für ${subject.name} ist kein Lehrplan hinterlegt.`,
    };
  }

  return {
    fach: subject.name,
    lehrplan: subject.curriculum,
    quelle: subject.curriculumSource,
    aktualisiertAm: subject.curriculumUpdatedAt,
  };
}

async function dateienAuflisten(args: Record<string, unknown>) {
  let subjects: SubjectDTO[];
  if (typeof args.fach === "string" && args.fach.trim()) {
    const subject = await findSubjectByName(args.fach);
    if (!subject) return { hinweis: `Fach "${args.fach}" wurde nicht gefunden.`, dateien: [] };
    subjects = [subject];
  } else {
    subjects = await listSubjects("active");
  }

  const dateien: Array<{ id: string; name: string; typ: string; groesse: number; fach: string }> = [];
  for (const subject of subjects) {
    const files = await listFiles(subject.id);
    for (const f of files) {
      dateien.push({ id: f.id, name: f.name, typ: f.contentType, groesse: f.size, fach: subject.name });
    }
  }
  return { dateien };
}

async function dateiLesen(args: Record<string, unknown>) {
  const dateiId = typeof args.dateiId === "string" ? args.dateiId : "";
  if (!isUuid(dateiId)) return { error: "dateiId ist keine gültige id." };

  const result = await readSubjectFile(dateiId);
  if (!result) return { error: "Datei nicht gefunden." };

  return { datei: result.file, inhalt: contentForModel(result.content) };
}

// Wird auch von route.ts genutzt, um Bild-Inhalte als eigenen Content-Part in
// die naechste Modell-Nachricht zu haengen.
export function contentForModel(content: FileContent): { typ: string; text?: string; url?: string } {
  if (content.kind === "text") return { typ: "text", text: content.text };
  if (content.kind === "image") return { typ: "bild", url: content.url };
  return { typ: "nicht_lesbar", text: content.hint };
}

// Findet ein vorhandenes Fach zum genannten Namen. Kein Treffer legt NICHTS
// an -- der Bot darf nie ein neues Fach anlegen, der Aufrufer bekommt
// stattdessen eine Fehlermeldung mit der Liste der vorhandenen Faecher.
async function resolveSubjectId(fach: string): Promise<{ subjectId: string } | { error: string }> {
  const alle = await listSubjects("active");
  const subject = matchSubject(fach, alle);
  if (subject) return { subjectId: subject.id };

  const namen = alle.map((s) => s.name);
  return {
    error: `Fach "${fach}" gibt es nicht. Vorhandene Fächer: ${namen.join(", ")}. Frag den Schüler, welches Fach gemeint ist, und lege kein neues an.`,
  };
}

// Freitext, den das Modell geliefert hat und der so in der Datenbank landet.
// Der Systemprompt verlangt Umlaute, aber das Modell faellt zurueck -- und
// anders als Chat-Text laeuft ein Aufgabentitel nie durch das Rendern, wo das
// Netz sonst greift. Also hier schon beim Schreiben geradeziehen.
function modelltext(wert: unknown): string {
  return typeof wert === "string" ? mitUmlauten(wert.trim()) : "";
}

async function aufgabeAnlegen(args: Record<string, unknown>) {
  const titel = modelltext(args.titel);
  if (!titel) return { error: "titel darf nicht leer sein." };

  let subjectId: string | undefined;
  if (typeof args.fach === "string" && args.fach.trim()) {
    const resolved = await resolveSubjectId(args.fach);
    if ("error" in resolved) return resolved;
    subjectId = resolved.subjectId;
  }

  const faellig = typeof args.faellig === "string" ? resolveDate(args.faellig) : { iso: null };

  const typ = typeof args.typ === "string" ? args.typ : "homework";
  const erlaubteTypen = ["homework", "exam", "test", "presentation", "other"] as const;
  if (!(erlaubteTypen as readonly string[]).includes(typ))
    return { error: "typ ist kein gültiger Aufgabentyp." };

  const assignment = await createAssignment({
    title: titel,
    subjectId,
    type: typ as (typeof erlaubteTypen)[number],
    dueDate: faellig.iso,
    notes: typeof args.notiz === "string" ? args.notiz : null,
  });

  return { aufgabe: assignment, hinweisFaellig: faellig.hint };
}

async function aufgabeAendern(args: Record<string, unknown>) {
  const aufgabeId = typeof args.aufgabeId === "string" ? args.aufgabeId : "";
  if (!isUuid(aufgabeId)) return { error: "aufgabeId ist keine gültige id." };
  if (!(await getAssignment(aufgabeId))) return { error: "Aufgabe nicht gefunden." };

  const patch: Partial<NewAssignment> = {};
  let hinweisFaellig: string | undefined;

  if (modelltext(args.titel)) patch.title = modelltext(args.titel);
  if (typeof args.notiz === "string") patch.notes = args.notiz;
  if (typeof args.faellig === "string") {
    const d = resolveDate(args.faellig);
    // Ein nicht erkanntes Datum ("nach den Ferien") wuerde als null die
    // vorhandene Faelligkeit entfernen. Die Aufgabe verschwaende damit
    // stillschweigend aus dem Pruefungsplan und der Morgen-Ansicht. Beim
    // Aendern bleibt eine unverstandene Angabe deshalb wirkungslos, der
    // Hinweis dazu geht an das Modell zurueck.
    if (d.iso) {
      patch.dueDate = d.iso;
    }
    hinweisFaellig = d.hint;
  }

  if (Object.keys(patch).length > 0) {
    await updateAssignment(aufgabeId, patch);
  }

  let aufgabe = await getAssignment(aufgabeId);
  if (args.erledigt === true) aufgabe = await completeAssignment(aufgabeId);
  else if (args.erledigt === false) aufgabe = await uncompleteAssignment(aufgabeId);

  return { aufgabe, hinweisFaellig };
}

async function notizAnlegen(args: Record<string, unknown>) {
  const fach = typeof args.fach === "string" ? args.fach.trim() : "";
  const titel = modelltext(args.titel);
  if (!fach) return { error: "fach darf nicht leer sein." };
  if (!titel) return { error: "titel darf nicht leer sein." };

  const resolved = await resolveSubjectId(fach);
  if ("error" in resolved) return resolved;
  const notiz = await createNote({
    subjectId: resolved.subjectId,
    title: titel,
    body: modelltext(args.text),
  });
  return { notiz };
}

async function notizAendern(args: Record<string, unknown>) {
  const notizId = typeof args.notizId === "string" ? args.notizId : "";
  if (!isUuid(notizId)) return { error: "notizId ist keine gültige id." };

  // Ein leerer Text ist faktisch ein Loeschen: der bisherige Inhalt waere weg,
  // ohne Rueckgaengig und ohne dass jemand es bemerkt. Der Bot darf nicht
  // loeschen, also wird ein leerer Text abgelehnt statt durchgeschrieben. Ein
  // Modell, das versehentlich ein leeres text-Feld mitschickt, richtet damit
  // keinen Schaden mehr an.
  if (typeof args.text === "string" && !args.text.trim()) {
    return {
      error:
        "Ein leerer Text würde die Notiz löschen. Das ist nicht erlaubt. Lass text weg, wenn nur der Titel geändert werden soll.",
    };
  }

  const patch: Partial<NewSubjectNote> = {};
  if (modelltext(args.titel)) patch.title = modelltext(args.titel);
  if (typeof args.text === "string") patch.body = mitUmlauten(args.text);

  if (Object.keys(patch).length === 0) {
    return { error: "Es wurde nichts zum Ändern angegeben." };
  }

  const notiz = await updateNote(notizId, patch);
  if (!notiz) return { error: "Notiz nicht gefunden." };
  return { notiz };
}

// Legt NICHTS an -- reiner Vorschlag, den die Oberflaeche als Vorschau zeigt
// und erst nach Bestaetigung ueber die bestehende Noten-API eintraegt.
async function noteVorschlagen(args: Record<string, unknown>) {
  const fach = typeof args.fach === "string" ? args.fach.trim() : "";
  if (!fach) return { error: "fach darf nicht leer sein." };

  const punkte = typeof args.punkte === "number" ? args.punkte : Number(args.punkte);
  if (!Number.isInteger(punkte) || punkte < 0 || punkte > 15) {
    return { error: "punkte muss eine ganze Zahl von 0 bis 15 sein." };
  }

  const art = args.art === "oral" || args.art === "written" ? args.art : undefined;
  if (!art) return { error: "art muss \"oral\" oder \"written\" sein." };

  const bezeichnung = typeof args.bezeichnung === "string" ? args.bezeichnung.trim() : "";
  if (!bezeichnung) return { error: "bezeichnung darf nicht leer sein." };

  const datum = typeof args.datum === "string" ? resolveDate(args.datum) : { iso: null };
  if (!datum.iso) return { error: datum.hint ?? "datum konnte nicht erkannt werden." };

  const subject = await findSubjectByName(fach);
  const gewicht = typeof args.gewicht === "number" ? args.gewicht : 1;

  return {
    vorschlag: {
      fach,
      subjectId: subject?.id ?? null,
      punkte,
      note: pointsToGradeLabel(punkte),
      art,
      bezeichnung,
      datum: datum.iso,
      gewicht,
    },
  };
}

// Kompakte Fassung von ladeStundeKontext() fuers Modell -- die volle
// StundeResponse traegt mehr mit, als ein Werkzeugergebnis braucht (z. B. den
// kompletten Tagesplan-Rohdatensatz je Stunde).
async function jetztLesen() {
  const k = await ladeStundeKontext();

  return {
    modus: k.modus,
    uhrzeit: k.nowHM,
    stunde: k.selected
      ? {
          titel: k.selected.title,
          von: k.selected.startTime,
          bis: k.selected.endTime,
          raum: k.selected.room,
          lehrer: k.selected.teacher,
          fach: k.selected.subjectName,
          restMinuten: k.selected.minutesLeft,
          minutenBis: k.selected.minutesUntil,
        }
      : null,
    faellig: k.faellig.map((a) => ({ id: a.id, titel: a.title, faelligAm: a.dueDate })),
    demnaechst: k.demnaechst.map((a) => ({ id: a.id, titel: a.title, faelligAm: a.dueDate })),
    naechstePruefung: k.naechstePruefung,
    naechsterTermin: k.naechsterTermin,
    tagesplan: k.tag.map((ev) => ({ von: ev.startTime, titel: ev.title, status: ev.status })),
  };
}

async function lernstandLesen(args: Record<string, unknown>) {
  const fach = typeof args.fach === "string" ? args.fach.trim() : "";

  if (!fach) {
    const ov = await overview();
    return {
      heuteGelernt: ov.heuteGelernt,
      faecher: ov.faecher.map((f) => ({
        fach: f.name,
        total: f.progress.total,
        faellig: f.progress.faellig,
        neu: f.progress.neu,
        lernend: f.progress.lernend,
        sicher: f.progress.sicher,
        naechstePruefung: f.naechstePruefung,
        plan: f.plan,
        seite: `/lernen/${f.subjectId}`,
      })),
    };
  }

  const subject = await findSubjectByName(fach);
  if (!subject) return { hinweis: `Fach "${fach}" wurde nicht gefunden.` };

  const detail = await subjectDetail(subject.id);
  if (!detail) return { hinweis: `Fach "${fach}" wurde nicht gefunden.` };

  const ov = await overview();
  const pruefungen = ov.pruefungen
    .filter((p) => p.subjectId === subject.id)
    .map((p) => ({ titel: p.title, tageBis: p.tageBis, bereit: p.bereit }));

  const result: Record<string, unknown> = {
    fach: detail.subject.name,
    total: detail.progress.total,
    faellig: detail.progress.faellig,
    neu: detail.progress.neu,
    lernend: detail.progress.lernend,
    sicher: detail.progress.sicher,
    naechstePruefung: detail.naechstePruefung,
    plan: detail.plan,
    themen: detail.themen.map((t) => ({ titel: t.title, bereit: t.progress.bereit, faellig: t.progress.faellig })),
    pruefungen,
    seite: `/lernen/${subject.id}`,
  };

  if (args.mitKarten === true) {
    const heute = localISO();
    result.karten = detail.cards.slice(0, 30).map((c) => ({
      id: c.id,
      frage: c.question,
      antwort: c.answer,
      box: c.box,
      faellig: c.due <= heute,
    }));
  }

  return result;
}

// Lesend: liefert je Lernplan Pruefung, Datum, Fortschritt, Punkte mit
// Sicherheit/Quelle, Einheiten heute und ueberfaellige, plus Link zur
// Planseite. Kein Fach-Treffer bei gesetztem `fach` heisst leere Liste mit
// Hinweis, kein Fehler -- siehe lehrplanLesen/lernstandLesen als Vorbild.
async function lernplanLesen(args: Record<string, unknown>) {
  const fach = typeof args.fach === "string" ? args.fach.trim() : "";
  const plaene = await lernplanUebersicht(fach || undefined);

  if (plaene.length === 0) {
    return {
      plaene: [],
      hinweis: fach ? `Kein Lernplan zu "${fach}" gefunden.` : "Keine Lernpläne vorhanden.",
    };
  }

  return {
    plaene: plaene.map((p) => ({
      fach: p.subjectName,
      pruefung: p.examTitle,
      datum: p.examDate,
      tageBis: p.tageBis,
      fortschritt: `${p.done} von ${p.total}`,
      punkte: p.punkte.map((pkt) => ({ titel: pkt.titel, sicherheit: pkt.sicherheit, quelle: pkt.quelle })),
      heute: p.heute.map((i) => ({ titel: i.punktTitel ?? "Simulation", phase: i.phase, minuten: i.minuten })),
      ueberfaellig: p.ueberfaellig.map((i) => ({
        titel: i.punktTitel ?? "Simulation",
        phase: i.phase,
        datum: i.date,
      })),
      seite: `/lernen/${p.subjectId}/plan/${p.assignmentId}`,
    })),
  };
}

// Nur auf ausdruecklichen Wunsch bzw. nach Rueckfrage gerufen (siehe
// Systemprompt) -- hier keine eigene Bestaetigungslogik, die Regel steht im
// Prompt, nicht im Werkzeug.
async function lernkartenErzeugen(args: Record<string, unknown>) {
  const fach = typeof args.fach === "string" ? args.fach.trim() : "";
  if (!fach) return { error: "fach darf nicht leer sein." };

  const subject = await findSubjectByName(fach);
  if (!subject) return { error: `Fach "${fach}" wurde nicht gefunden.` };

  const erlaubteQuellen = ["notizen", "dateien", "lehrplan", "alles"] as const;
  const quelle = typeof args.quelle === "string" ? args.quelle : "alles";
  if (!(erlaubteQuellen as readonly string[]).includes(quelle)) {
    return { error: "quelle muss notizen, dateien, lehrplan oder alles sein." };
  }

  const anzahlRoh = typeof args.anzahl === "number" ? args.anzahl : Number(args.anzahl);
  const anzahl = Number.isFinite(anzahlRoh) ? Math.min(Math.max(Math.round(anzahlRoh), 1), 30) : 12;

  // thema: existiert im Fach schon ein Thema mit diesem Titel (case-
  // insensitiv), wird es genutzt, sonst still angelegt.
  const themaTitel = typeof args.thema === "string" ? args.thema.trim() : "";
  let topicId: string | null = null;
  if (themaTitel) {
    const themen = await listTopics(subject.id);
    const needle = themaTitel.toLowerCase();
    const bestehend = themen.find((t) => t.title.toLowerCase() === needle);
    topicId = bestehend ? bestehend.id : (await createTopic({ subjectId: subject.id, title: themaTitel })).id;
  }

  const input: GenerateInput = {
    subjectId: subject.id,
    quelle: quelle as GenerateInput["quelle"],
    anzahl,
    topicId,
  };

  try {
    const generated = await generateCards(input);
    if (generated.cards.length === 0) {
      return {
        fach: subject.name,
        subjectId: subject.id,
        anzahl: 0,
        karten: [],
        hinweis: generated.hinweis ?? "Es konnten keine Karten erzeugt werden.",
        seite: `/lernen/${subject.id}`,
      };
    }

    // Selbe Zuordnung wie app/api/lernen/generieren/route.ts: "dateien" wird
    // zu "datei" (Enum-Wert), "alles" faellt auf "notizen" als Herkunft.
    const quelleForStore = quelle === "dateien" ? "datei" : quelle === "alles" ? "notizen" : quelle;
    const karten = await createCards(
      subject.id,
      generated.cards,
      quelleForStore as Parameters<typeof createCards>[2],
      null,
      topicId,
    );

    return {
      fach: subject.name,
      subjectId: subject.id,
      anzahl: karten.length,
      karten: karten.map((k) => ({ id: k.id, frage: k.question, antwort: k.answer })),
      hinweis: generated.hinweis,
      seite: `/lernen/${subject.id}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lernkarten konnten nicht erzeugt werden." };
  }
}

async function lernkarteAnlegen(args: Record<string, unknown>) {
  const fach = typeof args.fach === "string" ? args.fach.trim() : "";
  const frage = typeof args.frage === "string" ? args.frage.trim() : "";
  const antwort = typeof args.antwort === "string" ? args.antwort.trim() : "";
  if (!fach) return { error: "fach darf nicht leer sein." };
  if (!frage) return { error: "frage darf nicht leer sein." };
  if (!antwort) return { error: "antwort darf nicht leer sein." };

  const resolved = await resolveSubjectId(fach);
  if ("error" in resolved) return resolved;
  const subjectId = resolved.subjectId;
  const [karte] = await createCards(subjectId, [{ question: frage, answer: antwort }], "manuell");
  if (!karte) return { error: "Karte konnte nicht angelegt werden." };

  return {
    karte: { id: karte.id, frage: karte.question, antwort: karte.answer },
    subjectId,
    seite: `/lernen/${subjectId}`,
  };
}
