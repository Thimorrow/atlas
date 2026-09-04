// Das "Lagebild": ein kompakter Auszug der Datenbank, der direkt in den
// System-Prompt des Bots geht -- damit er die haeufigsten Fragen (Stundenplan
// heute/morgen, offene Aufgaben, anstehende Pruefungen, zuletzt geaenderte
// Notizen) ohne Werkzeugrunde beantworten und Aufgaben/Notizen direkt per id
// aendern kann. Details, Texte, Noten und aeltere Eintraege bleiben den
// Werkzeugen vorbehalten.

import { listSubjects, listRecentNotes } from "@/lib/subject-store";
import { expandRange, type CalendarEvent } from "@/lib/calendar-expand";
import { listAssignments } from "@/lib/assignment-store";
import { isExamPageType, TYPE_LABEL, type AssignmentType } from "@/lib/assignments-view";
import { lernplaeneAnzahl } from "@/lib/lernplan-store";

import { heuteISO as localISO } from "@/lib/zeit";
import { addDays } from "@/lib/assignments-view";

const WOCHENTAG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export function weekdayName(iso: string): string {
  const idx = (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
  return WOCHENTAG[idx];
}

export type Stunde = { startTime: string; endTime: string | null; fach: string; raum: string | null };
export type AufgabeKurz = { id: string; titel: string; fach: string | null; typ: AssignmentType; faellig: string | null };
export type NotizKurz = { id: string; titel: string; fach: string; geaendert: string };

export type Lagebild = {
  heute: string;
  faecher: { name: string; lehrer: string | null; raum: string | null }[];
  stundenHeute: Stunde[];
  naechsterSchultag: { date: string; stunden: Stunde[] } | null;
  aufgaben: AufgabeKurz[];
  pruefungen: AufgabeKurz[];
  notizen: NotizKurz[];
  // Optional, damit bestehende Lagebild-Literale (z. B. in Tests) ohne das
  // Feld weiter gueltig bleiben. Fehlt es, wird kein Satz dazu ausgegeben.
  lernplaene?: number;
};

function toStunde(e: CalendarEvent): Stunde {
  return { startTime: e.startTime, endTime: e.endTime, fach: e.title, raum: e.room };
}

// Laedt das Lagebild aus allen Quellen. Jeder Teil einzeln in try/catch,
// damit der Bot nie an einem einzelnen kaputten Teil scheitert -- lieber ein
// leeres Feld als gar kein Lagebild.
export async function ladeLagebild(): Promise<Lagebild> {
  const heute = localISO();
  const bis14 = addDays(heute, 14);
  const bis30 = addDays(heute, 30);

  const faecher = await listSubjects("active")
    .then((subjects) => subjects.map((s) => ({ name: s.name, lehrer: s.teacherLabel, raum: s.room })))
    .catch(() => []);

  let stundenHeute: Stunde[] = [];
  let naechsterSchultag: Lagebild["naechsterSchultag"] = null;
  try {
    const range = await expandRange(heute, addDays(heute, 7));
    const heuteTag = range.days.find((d) => d.date === heute);
    stundenHeute = heuteTag ? heuteTag.events.map(toStunde) : [];
    const naechsterTag = range.days.find((d) => d.date !== heute && d.events.length > 0);
    naechsterSchultag = naechsterTag
      ? { date: naechsterTag.date, stunden: naechsterTag.events.map(toStunde) }
      : null;
  } catch {
    stundenHeute = [];
    naechsterSchultag = null;
  }

  let aufgaben: AufgabeKurz[] = [];
  let pruefungen: AufgabeKurz[] = [];
  try {
    const offene = await listAssignments({ includeCompleted: false });

    aufgaben = offene
      .filter((a) => !isExamPageType(a.type) && (a.dueDate === null || (a.dueDate <= bis14)))
      .sort((a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿"))
      .slice(0, 25)
      .map((a) => ({ id: a.id, titel: a.title, fach: a.subjectName, typ: a.type, faellig: a.dueDate }));

    pruefungen = offene
      .filter((a) => isExamPageType(a.type) && a.dueDate !== null && a.dueDate >= heute && a.dueDate <= bis30)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
      .slice(0, 10)
      .map((a) => ({ id: a.id, titel: a.title, fach: a.subjectName, typ: a.type, faellig: a.dueDate }));
  } catch {
    aufgaben = [];
    pruefungen = [];
  }

  let notizen: NotizKurz[] = [];
  try {
    const recent = await listRecentNotes(8);
    notizen = recent.map((n) => ({ id: n.id, titel: n.title, fach: n.subjectName, geaendert: n.updatedAt.slice(0, 10) }));
  } catch {
    notizen = [];
  }

  const lernplaene = await lernplaeneAnzahl().catch(() => undefined);

  return { heute, faecher, stundenHeute, naechsterSchultag, aufgaben, pruefungen, notizen, lernplaene };
}

// Relative Tagesangabe: "(heute)", "(morgen)", "(in 3 Tagen)",
// "(seit 2 Tagen ueberfaellig)".
function relativTag(datum: string, heute: string): string {
  if (datum === heute) return "(heute)";
  if (datum === addDays(heute, 1)) return "(morgen)";
  if (datum > heute) {
    const tage = tageDazwischen(heute, datum);
    return `(in ${tage} Tagen)`;
  }
  const tage = tageDazwischen(datum, heute);
  return tage === 1 ? "(seit 1 Tag ueberfaellig)" : `(seit ${tage} Tagen ueberfaellig)`;
}

function tageDazwischen(vonISO: string, bisISO: string): number {
  const a = new Date(`${vonISO}T00:00:00`).getTime();
  const b = new Date(`${bisISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function stundenZeile(stunden: Stunde[]): string {
  return stunden.map((s) => `${s.startTime}-${s.endTime ?? "?"} ${s.fach}${s.raum ? ` ${s.raum}` : ""}`).join("; ");
}

// Reine Funktion: baut aus dem Lagebild den kompakten Text fuer den
// System-Prompt.
export function lagebildAlsText(l: Lagebild): string {
  const zeilen: string[] = [
    "Lagebild (Stand heute aus der Datenbank; fuer Details, Texte, Noten und aeltere Eintraege die Werkzeuge nutzen):",
  ];

  if (l.faecher.length > 0) {
    const faecherText = l.faecher
      .map((f) => {
        const klammer = [f.lehrer, f.raum].filter(Boolean).join(", ");
        return klammer ? `${f.name} (${klammer})` : f.name;
      })
      .join(", ");
    zeilen.push(`Seine Faecher: ${faecherText}`);
  }

  const heuteWochentag = weekdayName(l.heute);
  if (l.stundenHeute.length > 0) {
    zeilen.push(`Heute, ${heuteWochentag}: ${stundenZeile(l.stundenHeute)}`);
  } else {
    zeilen.push(`Heute, ${heuteWochentag}: keine Schule`);
  }

  if (l.naechsterSchultag) {
    const wochentag = weekdayName(l.naechsterSchultag.date);
    zeilen.push(
      `Naechster Schultag ${wochentag} ${l.naechsterSchultag.date}: ${stundenZeile(l.naechsterSchultag.stunden)}`,
    );
  } else {
    zeilen.push("Naechster Schultag: in den naechsten 7 Tagen keiner");
  }

  zeilen.push("Offene Aufgaben (bis in 14 Tagen, ohne Pruefungen):");
  if (l.aufgaben.length === 0) {
    zeilen.push("- keine");
  } else {
    for (const a of l.aufgaben) {
      const typLabel = TYPE_LABEL[a.typ];
      const fachTeil = a.fach ? ` ${a.fach}` : "";
      const faelligTeil = a.faellig ? `faellig ${a.faellig} ${relativTag(a.faellig, l.heute)}` : "ohne Datum";
      zeilen.push(`- [${a.id}] ${typLabel}${fachTeil} "${a.titel}", ${faelligTeil}`);
    }
  }

  zeilen.push("Pruefungen (naechste 30 Tage):");
  if (l.pruefungen.length === 0) {
    zeilen.push("- keine");
  } else {
    for (const p of l.pruefungen) {
      const typLabel = TYPE_LABEL[p.typ];
      const fachTeil = p.fach ? ` ${p.fach}` : "";
      zeilen.push(`- [${p.id}] ${typLabel}${fachTeil} "${p.titel}" am ${p.faellig} ${relativTag(p.faellig!, l.heute)}`);
    }
  }

  if (l.lernplaene) {
    zeilen.push(`Lernplaene: ${l.lernplaene} aktiv`);
  }

  zeilen.push("Zuletzt geaenderte Notizen:");
  if (l.notizen.length === 0) {
    zeilen.push("- keine");
  } else {
    for (const n of l.notizen) {
      zeilen.push(`- [${n.id}] ${n.fach} "${n.titel}" (${n.geaendert})`);
    }
  }

  return zeilen.join("\n");
}
