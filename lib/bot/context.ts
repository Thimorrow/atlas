// Die Begruessung des Bots: rein aus der Datenbank, ohne Modellaufruf. Und der
// System-Prompt, der dem Modell sagt, wer es ist und was es darf.

import { expandRange } from "@/lib/calendar-expand";
import { listAssignments } from "@/lib/assignment-store";
import { isExamPageType } from "@/lib/assignments-view";
import type { AssignmentDTO } from "@/lib/assignments-view";
import type { CalendarEvent } from "@/lib/calendar-expand";
import type { StundeResponse } from "@/lib/stunde-kontext";

import { heuteISO as localISO, jetztHM as localHM } from "@/lib/zeit";
import { addDays } from "@/lib/assignments-view";
import { lagebildAlsText, weekdayName, type Lagebild } from "@/lib/bot/lagebild";



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

// Bisherige Begruessung: naechster Schultag mit Stunden, Faecher und eine
// eventuelle Arbeit. Gilt ohne jetzt-Kontext sowie in den Modi "nach"/"frei".
async function naechsterSchultagGreeting(): Promise<Greeting> {
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

// modus "live": laeuft gerade Unterricht.
function liveGreeting(jetzt: StundeResponse & { selected: NonNullable<StundeResponse["selected"]> }): Greeting {
  const fach = jetzt.selected.subjectName ?? jetzt.selected.title;
  let text = `Gerade läuft ${fach}, noch ${jetzt.selected.minutesLeft} Minuten.`;
  if (jetzt.faellig.length > 0) {
    text += ` Dafür ist heute ${jetzt.faellig.length} Aufgabe(n) fällig.`;
  }

  return {
    text,
    suggestions: [
      "Was ist heute noch fällig?",
      `Trag mir eine Hausaufgabe in ${fach} ein`,
      `Was kam letzte Stunde in ${fach} dran?`,
    ],
  };
}

// modus "pause"/"vor": jetzt.selected ist dann schon die naechste Stunde
// (defaultLesson faellt in diesen Modi auf pickNextLesson zurueck).
function pauseVorGreeting(jetzt: StundeResponse & { selected: NonNullable<StundeResponse["selected"]> }): Greeting {
  const fach = jetzt.selected.subjectName ?? jetzt.selected.title;
  let text = `Als Nächstes ${fach} um ${jetzt.selected.startTime}.`;
  if (jetzt.selected.room) text += ` Raum ${jetzt.selected.room}.`;

  return {
    text,
    suggestions: [
      "Was ist heute noch fällig?",
      `Trag mir eine Hausaufgabe in ${fach} ein`,
      `Was kam letzte Stunde in ${fach} dran?`,
    ],
  };
}

// Offene Pruefungsaufgabe (exam/test/presentation) in den naechsten 7 Tagen,
// die frueheste zuerst -- unabhaengig vom Cockpit-Modus, gilt fuer jede
// Begruessung.
async function findUpcomingExam(): Promise<AssignmentDTO | null> {
  const heute = localISO();
  const bis = addDays(heute, 7);
  const aufgaben = await listAssignments({ includeCompleted: false });
  const kandidaten = aufgaben
    .filter((a) => isExamPageType(a.type) && a.dueDate !== null && a.dueDate >= heute && a.dueDate <= bis)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  return kandidaten[0] ?? null;
}

// Haengt in JEDEM Fall einen Hinweis auf eine anstehende Pruefung an, falls
// es in den naechsten sieben Tagen eine gibt, und ersetzt den ersten
// Vorschlag durch einen Lern-Vorschlag dafuer.
async function withExamHint(base: Greeting): Promise<Greeting> {
  const exam = await findUpcomingExam();
  if (!exam || !exam.dueDate) return base;

  const text = `${base.text} Am ${weekdayName(exam.dueDate)} ist die ${exam.title}.`;
  const fach = exam.subjectName ?? exam.title;
  const suggestions = [`Hilf mir, für ${fach} zu lernen`, ...base.suggestions.slice(1)];

  return { text, suggestions };
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

export async function buildGreeting(jetzt?: StundeResponse | null): Promise<Greeting> {
  let base: Greeting;

  if (jetzt && jetzt.modus === "live" && jetzt.selected) {
    base = liveGreeting({ ...jetzt, selected: jetzt.selected });
  } else if (jetzt && (jetzt.modus === "pause" || jetzt.modus === "vor") && jetzt.selected) {
    base = pauseVorGreeting({ ...jetzt, selected: jetzt.selected });
  } else {
    base = await naechsterSchultagGreeting();
  }

  return withExamHint(base);
}

function geradeBlock(jetzt: StundeResponse): string {
  let zeile: string;
  if (jetzt.modus === "live" && jetzt.selected) {
    const fach = jetzt.selected.subjectName ?? jetzt.selected.title;
    const raum = jetzt.selected.room ? ` in Raum ${jetzt.selected.room}` : "";
    zeile = `laeuft ${fach} von ${jetzt.selected.startTime} bis ${jetzt.selected.endTime ?? "?"}${raum}, noch ${jetzt.selected.minutesLeft} min`;
  } else if (jetzt.modus === "pause") {
    zeile = jetzt.selected
      ? `Pause, als Naechstes ${jetzt.selected.subjectName ?? jetzt.selected.title} um ${jetzt.selected.startTime}`
      : "Pause";
  } else if (jetzt.modus === "vor" && jetzt.selected) {
    zeile = `als Naechstes ${jetzt.selected.subjectName ?? jetzt.selected.title} um ${jetzt.selected.startTime}`;
  } else if (jetzt.modus === "nach") {
    zeile = "Schule ist heute vorbei";
  } else {
    zeile = "heute keine Schule";
  }

  const zeilen = [`Gerade: ${zeile}.`];
  if (jetzt.selected?.subjectId) {
    zeilen.push(`Heute faellig in diesem Fach: ${jetzt.faellig.length}`);
  }
  if (jetzt.naechstePruefung) {
    zeilen.push(
      `Naechste Pruefung: ${jetzt.naechstePruefung.title} am ${jetzt.naechstePruefung.dueDate}, in ${jetzt.naechstePruefung.tageBis} Tagen`,
    );
  }
  return zeilen.join("\n");
}

export function buildSystemPrompt(jetzt?: StundeResponse | null, lagebild?: Lagebild | null): string {
  const heute = localISO();
  const uhrzeit = localHM();
  const geradeAbschnitt = jetzt ? `\n\n${geradeBlock(jetzt)}` : "";
  const lagebildAbschnitt = lagebild ? `\n\n${lagebildAlsText(lagebild)}` : "";

  return `Du bist der Atlas-Bot, der Assistent in der privaten Schul-App "Atlas" eines Zehntklaesslers. Du kennst seinen Stundenplan, seine Aufgaben, Notizen, Noten, Dateien und seinen Lernstand ueber die dir bereitgestellten Werkzeuge.

Heutiges Datum: ${heute} (JJJJ-MM-TT), ${weekdayName(heute)}. Uhrzeit: ${uhrzeit} Uhr.${geradeAbschnitt}${lagebildAbschnitt}

Regeln:
- Antworte kurz und konkret, auf Deutsch, ohne Gedankenstriche.
- Denke auf Deutsch. Auch deine internen Ueberlegungen formulierst du ausschliesslich auf Deutsch.
- Was im Lagebild steht, darfst du direkt verwenden. Fuer alles, was dort nicht steht (Notiztexte, Dateien, Noten, Lernstand, aeltere oder erledigte Aufgaben, andere Tage), nutze ein Werkzeug -- rate nichts.
- Die ids aus dem Lagebild kannst du direkt in aufgabe_aendern und notiz_aendern verwenden, ohne vorher zu lesen.
- Stammt eine Aussage aus einer Notiz oder Datei, nenne die Quelle (z. B. "steht in Mathe/Ableitungen.pdf").
- Du traegst NIE selbst eine Note ein. note_vorschlagen erstellt nur einen Vorschlag zur Bestaetigung durch den Schueler.
- Du loeschst NICHTS -- weder Aufgaben noch Notizen noch Dateien noch Lernkarten. Dafuer gibt es kein Werkzeug.
- Bei Datumsangaben wie "morgen" oder "naechsten Montag": die Werkzeuge verstehen sie direkt, du musst sie nicht selbst umrechnen.
- Ein leerer Text loescht eine Notiz, deshalb lehnen die Werkzeuge ihn ab. Willst du nur den Titel aendern, lass den Text weg. Beim Aendern eines Textes gibst du immer den vollstaendigen neuen Inhalt an.
- Verstehst du eine Datumsangabe nicht ("nach den Ferien"), frag nach. Ein nicht erkanntes Datum aendert beim Bearbeiten nichts.
- Fragt er, was als Naechstes drankommt oder worauf er sich vorbereiten muss, nutze lehrplan_lesen. Sag dabei dazu, dass der Lehrplan eine Orientierung ist und nicht die Planung seiner Lehrkraft.
- Fragt er nach Lernen oder der Vorbereitung auf eine Arbeit, nutze zuerst lernstand_lesen und schlage dann konkret etwas vor (Karten erzeugen, eine Lernsitzung starten mit Link), statt allgemeine Lerntipps zu geben.
- lernkarten_erzeugen nutzt du NUR auf ausdruecklichen Wunsch des Schuelers oder nachdem du nachgefragt hast und er zugestimmt hat -- nie ungefragt Karten erzeugen.
- Verwende in Werkzeugen ausschliesslich Fachnamen aus der Liste oben, exakt so geschrieben. Es gibt keine anderen Faecher, und du legst nie ein neues an.
- Ist unklar, welches Fach gemeint ist, frag nach, statt zu raten.

Wo der Schueler etwas selbst nachschlagen kann, wenn es dazu passt:
- "Plan" (/): der Stundenplan. Im Fokus steht der naechste Schultag mit Stunden, faelligen Aufgaben und dem, was zu den Faechern hinterlegt ist.
- "Stunde" (/stunde): das Cockpit fuer die laufende oder gewaehlte Stunde -- dort traegt er Hausaufgabe, Notiz, Meldung und Dateien direkt ein.
- "Aufgaben" (/aufgaben): Tab "Offen" fuer die Hausaufgaben, Tab "Pruefungen" fuer alle Arbeiten, Tests und Referate nach Naehe geordnet.
- "Faecher" (/faecher): jedes Fach mit Notizen, Dateien, seinen Aufgaben und den Noten; im Fach steht ausserdem ein Rechner fuer die noetige Punktzahl bis zur Wunschnote.
- "Lernen" (/lernen): Karteikarten je Fach mit Leitner-Boxen, eine Lernsitzung, Karten aus Notizen/Dateien/Lehrplan per Bot erzeugen, und ein Lernplan bis zur Pruefung; Fachseite /lernen/{subjectId}, Sitzung /lernen/{subjectId}/session.
Nenne eine Seite nur, wenn sie wirklich weiterhilft, und beantworte die Frage trotzdem selbst.`;
}
