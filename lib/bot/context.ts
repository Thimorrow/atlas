// Die Begruessung des Bots: rein aus der Datenbank, ohne Modellaufruf. Und der
// System-Prompt, der dem Modell sagt, wer es ist und was es darf.

import { expandRange } from "@/lib/calendar-expand";
import { listAssignments } from "@/lib/assignment-store";
import type { CalendarEvent } from "@/lib/calendar-expand";

function localISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localISO(d);
}

const WOCHENTAG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function weekdayName(iso: string): string {
  const idx = (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
  return WOCHENTAG[idx];
}

// Deutsche Aufzaehlung: "A", "A und B", "A, B und C".
function aufzaehlung(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} und ${items[items.length - 1]}`;
}

export type Greeting = { text: string; suggestions: string[] };

// Sucht den naechsten Schultag mit Stunden, bis zu sieben Tage voraus. Ohne
// jede Stunde in diesem Fenster gibt es ehrlich nichts zu berichten.
async function nextSchoolDay(): Promise<{ date: string; events: CalendarEvent[] } | null> {
  const heute = localISO();
  const range = await expandRange(heute, addDays(heute, 7));
  const morgen = range.days.find((d) => d.date === addDays(heute, 1) && d.events.length > 0);
  const tag = morgen ?? range.days.find((d) => d.events.length > 0);
  return tag ? { date: tag.date, events: tag.events } : null;
}

export async function buildGreeting(): Promise<Greeting> {
  const heute = localISO();
  const naechster = await nextSchoolDay();
  const offeneAufgaben = await listAssignments({ includeCompleted: false });

  if (!naechster) {
    return {
      text: "Für die nächsten Tage stehen keine Schulstunden im Plan.",
      suggestions: ["Was steht bei mir offen?", "Fass mir meine letzten Notizen zusammen", "Trag mir eine Aufgabe ein"],
    };
  }

  const istMorgen = naechster.date === addDays(heute, 1);
  const tagWort = istMorgen ? "Morgen" : `Am ${weekdayName(naechster.date)}`;

  const faecher = [...new Set(naechster.events.map((e) => e.title))];
  const pruefungen = naechster.events.filter((e) => hasArbeit(e.title, offeneAufgaben, naechster.date));

  let satz = `${tagWort} hast du ${aufzaehlung(faecher)}.`;
  if (pruefungen.length > 0) {
    const pruefungFaecher = [...new Set(pruefungen.map((e) => e.title))];
    satz += ` In ${aufzaehlung(pruefungFaecher)} steht eine Arbeit an.`;
  }

  const suggestions = [
    istMorgen ? "Was muss ich für morgen machen?" : `Was muss ich für ${weekdayName(naechster.date)} machen?`,
    faecher[0] ? `Fass mir meine ${faecher[0]}-Notizen zusammen` : "Fass mir meine letzten Notizen zusammen",
    "Trag mir eine Hausaufgabe ein",
  ];

  return { text: satz, suggestions };
}

// Grobe Heraustik: eine offene Pruefungsaufgabe (exam/test) im selben Fach,
// faellig an dem Tag. Die Begruessung soll nur auf eine WIRKLICH bevorstehende
// Arbeit hinweisen, nicht auf jede beliebige Hausaufgabe.
function hasArbeit(
  fach: string,
  aufgaben: Awaited<ReturnType<typeof listAssignments>>,
  datum: string,
): boolean {
  return aufgaben.some(
    (a) =>
      (a.type === "exam" || a.type === "test") &&
      a.dueDate === datum &&
      (a.subjectName ?? "").toLowerCase() === fach.toLowerCase(),
  );
}

export function buildSystemPrompt(): string {
  const heute = localISO();
  return `Du bist der Atlas-Bot, der Assistent in der privaten Schul-App "Atlas" eines Zehntklaesslers. Du kennst seinen Stundenplan, seine Aufgaben, Notizen, Noten und Dateien ueber die dir bereitgestellten Werkzeuge.

Heutiges Datum: ${heute} (JJJJ-MM-TT).

Regeln:
- Antworte kurz und konkret, auf Deutsch, ohne Gedankenstriche.
- Denke auf Deutsch. Auch deine internen Ueberlegungen formulierst du ausschliesslich auf Deutsch.
- Nutze IMMER ein Werkzeug, bevor du etwas ueber Stundenplan, Aufgaben, Notizen, Noten oder Dateien behauptest -- rate nichts.
- Stammt eine Aussage aus einer Notiz oder Datei, nenne die Quelle (z. B. "steht in Mathe/Ableitungen.pdf").
- Du traegst NIE selbst eine Note ein. note_vorschlagen erstellt nur einen Vorschlag zur Bestaetigung durch den Schueler.
- Du loeschst NICHTS -- weder Aufgaben noch Notizen noch Dateien. Dafuer gibt es kein Werkzeug.
- Bei Datumsangaben wie "morgen" oder "naechsten Montag": die Werkzeuge verstehen sie direkt, du musst sie nicht selbst umrechnen.
- Ein leerer Text loescht eine Notiz, deshalb lehnen die Werkzeuge ihn ab. Willst du nur den Titel aendern, lass den Text weg. Beim Aendern eines Textes gibst du immer den vollstaendigen neuen Inhalt an.
- Verstehst du eine Datumsangabe nicht ("nach den Ferien"), frag nach. Ein nicht erkanntes Datum aendert beim Bearbeiten nichts.
- Fragt er, was als Naechstes drankommt oder worauf er sich vorbereiten muss, nutze lehrplan_lesen. Sag dabei dazu, dass der Lehrplan eine Orientierung ist und nicht die Planung seiner Lehrkraft.

Wo der Schueler etwas selbst nachschlagen kann, wenn es dazu passt:
- "Plan" (/): der Stundenplan. Im Fokus steht der naechste Schultag mit Stunden, faelligen Aufgaben und dem, was zu den Faechern hinterlegt ist; laeuft gerade eine Stunde, fuellt sie den Fokus und Hausaufgabe, Meldung, Notiz und Datei lassen sich direkt dort eintragen.
- "Aufgaben" (/aufgaben): Tab "Offen" fuer die Hausaufgaben, Tab "Pruefungen" fuer alle Arbeiten, Tests und Referate nach Naehe geordnet.
- "Faecher" (/faecher): jedes Fach mit Notizen, Dateien, seinen Aufgaben und den Noten; im Fach steht ausserdem ein Rechner fuer die noetige Punktzahl bis zur Wunschnote.
Nenne eine Seite nur, wenn sie wirklich weiterhilft, und beantworte die Frage trotzdem selbst.`;
}
