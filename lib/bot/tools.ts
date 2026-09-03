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
  ensureSubjectForUntis,
  isUuid,
  listNotes,
  listSubjects,
  updateNote,
  type SubjectDTO,
} from "@/lib/subject-store";
import { listSubjectLessonNotes } from "@/lib/lesson-notes";
import { gradeOverview, listGrades, summarize } from "@/lib/grade-store";
import { pointsToGradeLabel } from "@/lib/grades";
import type { ChatTool } from "@/lib/bot/model";
import type { NewAssignment, NewSubjectNote } from "@/lib/db/schema";

function localISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localISO(d);
}

// Fach anhand des Namens finden, den das Modell nennt -- case-insensitiv, erst
// ueber den Anzeigenamen, dann ueber den Untis-Wert. Kein Treffer heisst
// "gibt es (noch) nicht", nicht "Fehler".
async function findSubjectByName(name: string): Promise<SubjectDTO | undefined> {
  const all = await listSubjects("all");
  const needle = name.trim().toLowerCase();
  return (
    all.find((s) => s.name.toLowerCase() === needle) ??
    all.find((s) => s.untisSubject?.toLowerCase() === needle)
  );
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
  "Datum, bevorzugt ISO (JJJJ-MM-TT). Deutsche Angaben wie \"morgen\" oder \"naechsten Montag\" werden ebenfalls verstanden.";

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
        "Liest Aufgaben (Hausaufgaben, Klassenarbeiten, ...), optional gefiltert. Fuer eine Frage nach anstehenden Pruefungen setze typ auf [\"exam\", \"test\", \"presentation\"], statt alles zu lesen und selbst zu sortieren.",
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
              "Auf diese Arten einschraenken. homework = Hausaufgabe, exam = Klassenarbeit, test = Test, presentation = Referat.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "faecher_lesen",
      description: "Liste der aktiven Faecher mit Lehrer, Raum und Farbe.",
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
      description: "Liest Noten samt Fachschnitt, optional auf ein Fach eingeschraenkt.",
      parameters: {
        type: "object",
        properties: { fach: { type: "string", description: "Name des Fachs." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dateien_auflisten",
      description: "Listet Name, Typ und Groesse der Dateien eines Fachs (oder aller Faecher).",
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
          fach: { type: "string", description: "Name des Fachs. Wird bei Bedarf still angelegt." },
          typ: {
            type: "string",
            enum: ["homework", "exam", "test", "presentation", "other"],
            description: "Aufgabentyp. Standard: homework.",
          },
          faellig: { type: "string", description: DATE_DESC },
          notiz: { type: "string", description: "Zusaetzliche Notiz zur Aufgabe." },
        },
        required: ["titel"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aufgabe_aendern",
      description: "Aendert eine bestehende Aufgabe, z. B. Faelligkeit oder erledigt-Status.",
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
          fach: { type: "string", description: "Name des Fachs. Wird bei Bedarf still angelegt." },
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
        "Aendert Titel und/oder Text einer bestehenden Fach-Notiz. Der neue Text ersetzt den alten vollstaendig, gib also immer den kompletten gewuenschten Inhalt an. Ein leerer Text wird abgelehnt, weil er die Notiz loeschen wuerde. Soll nur der Titel geaendert werden, lass text weg.",
      parameters: {
        type: "object",
        properties: {
          notizId: { type: "string", description: "id der Notiz." },
          titel: { type: "string" },
          text: {
            type: "string",
            description: "Der vollstaendige neue Inhalt. Darf nicht leer sein.",
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
        "Schlaegt eine Note zum Eintragen vor. Legt NICHTS an -- die Oberflaeche zeigt eine Vorschau, die der Schueler erst bestaetigen muss.",
      parameters: {
        type: "object",
        properties: {
          fach: { type: "string", description: "Name des Fachs." },
          punkte: { type: "number", description: "Punkte von 0 bis 15." },
          art: { type: "string", enum: ["oral", "written"], description: "muendlich oder schriftlich." },
          bezeichnung: { type: "string", description: "z. B. \"Klausur 1\"." },
          datum: { type: "string", description: DATE_DESC },
          gewicht: { type: "number", description: "Gewichtung, 1 = einfach, 2 = doppelt. Standard: 1." },
        },
        required: ["fach", "punkte", "art", "bezeichnung", "datum"],
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
      return "liest die Faecherliste";
    case "notizen_lesen":
      return fach ? `liest Notizen in ${fach}` : "liest die Notizen";
    case "noten_lesen":
      return fach ? `liest Noten in ${fach}` : "liest die Noten";
    case "dateien_auflisten":
      return fach ? `listet Dateien in ${fach}` : "listet die Dateien";
    case "datei_lesen":
      return "liest eine Datei";
    case "aufgabe_anlegen":
      return "legt eine Aufgabe an";
    case "aufgabe_aendern":
      return "aendert eine Aufgabe";
    case "notiz_anlegen":
      return "legt eine Notiz an";
    case "notiz_aendern":
      return "aendert eine Notiz";
    case "note_vorschlagen":
      return "schlaegt eine Note vor";
    default:
      return `fuehrt ${name} aus`;
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
  if (!isUuid(dateiId)) return { error: "dateiId ist keine gueltige id." };

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

async function resolveSubjectId(fach: string): Promise<string> {
  const subject = await ensureSubjectForUntis(fach.trim());
  return subject.id;
}

async function aufgabeAnlegen(args: Record<string, unknown>) {
  const titel = typeof args.titel === "string" ? args.titel.trim() : "";
  if (!titel) return { error: "titel darf nicht leer sein." };

  const subjectId = typeof args.fach === "string" && args.fach.trim() ? await resolveSubjectId(args.fach) : undefined;

  const faellig = typeof args.faellig === "string" ? resolveDate(args.faellig) : { iso: null };

  const typ = typeof args.typ === "string" ? args.typ : "homework";
  const erlaubteTypen = ["homework", "exam", "test", "presentation", "other"] as const;
  if (!(erlaubteTypen as readonly string[]).includes(typ))
    return { error: "typ ist kein gueltiger Aufgabentyp." };

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
  if (!isUuid(aufgabeId)) return { error: "aufgabeId ist keine gueltige id." };
  if (!(await getAssignment(aufgabeId))) return { error: "Aufgabe nicht gefunden." };

  const patch: Partial<NewAssignment> = {};
  let hinweisFaellig: string | undefined;

  if (typeof args.titel === "string" && args.titel.trim()) patch.title = args.titel.trim();
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
  const titel = typeof args.titel === "string" ? args.titel.trim() : "";
  if (!fach) return { error: "fach darf nicht leer sein." };
  if (!titel) return { error: "titel darf nicht leer sein." };

  const subjectId = await resolveSubjectId(fach);
  const notiz = await createNote({
    subjectId,
    title: titel,
    body: typeof args.text === "string" ? args.text : "",
  });
  return { notiz };
}

async function notizAendern(args: Record<string, unknown>) {
  const notizId = typeof args.notizId === "string" ? args.notizId : "";
  if (!isUuid(notizId)) return { error: "notizId ist keine gueltige id." };

  // Ein leerer Text ist faktisch ein Loeschen: der bisherige Inhalt waere weg,
  // ohne Rueckgaengig und ohne dass jemand es bemerkt. Der Bot darf nicht
  // loeschen, also wird ein leerer Text abgelehnt statt durchgeschrieben. Ein
  // Modell, das versehentlich ein leeres text-Feld mitschickt, richtet damit
  // keinen Schaden mehr an.
  if (typeof args.text === "string" && !args.text.trim()) {
    return {
      error:
        "Ein leerer Text wuerde die Notiz loeschen. Das ist nicht erlaubt. Lass text weg, wenn nur der Titel geaendert werden soll.",
    };
  }

  const patch: Partial<NewSubjectNote> = {};
  if (typeof args.titel === "string" && args.titel.trim()) patch.title = args.titel.trim();
  if (typeof args.text === "string") patch.body = args.text;

  if (Object.keys(patch).length === 0) {
    return { error: "Es wurde nichts zum Aendern angegeben." };
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
