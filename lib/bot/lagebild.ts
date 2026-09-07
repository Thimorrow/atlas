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

export type Stunde = {
  startTime: string;
  endTime: string | null;
  fach: string;
  raum: string | null;
  status?: CalendarEvent["status"];
  lehrer?: string | null;
  vertretung?: string | null;
};
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
  nichtVerfuegbar?: Array<"faecher" | "stundenplan" | "aufgaben" | "notizen" | "lernplaene">;
  weitereAufgaben?: number;
  weiterePruefungen?: number;
};

function toStunde(e: CalendarEvent): Stunde {
  return {
    startTime: e.startTime,
    endTime: e.endTime,
    fach: e.title,
    raum: e.room,
    status: e.status,
    lehrer: e.teacher,
    vertretung: e.substitutionText,
  };
}

// Laedt das Lagebild aus allen Quellen. Jeder Teil einzeln in try/catch,
// Ein fehlgeschlagener Teil bleibt ausdrücklich unbekannt, nicht leer.
export async function ladeLagebild(): Promise<Lagebild> {
  const heute = localISO();
  const bis14 = addDays(heute, 14);
  const bis30 = addDays(heute, 30);
  const nichtVerfuegbar: NonNullable<Lagebild["nichtVerfuegbar"]> = [];

  const faecher = await listSubjects("active")
    .then((subjects) => subjects.map((s) => ({ name: s.name, lehrer: s.teacherLabel, raum: s.room })))
    .catch(() => { nichtVerfuegbar.push("faecher"); return []; });

  let stundenHeute: Stunde[] = [];
  let naechsterSchultag: Lagebild["naechsterSchultag"] = null;
  try {
    const range = await expandRange(heute, addDays(heute, 7));
    const heuteTag = range.days.find((d) => d.date === heute);
    stundenHeute = heuteTag ? heuteTag.events.map(toStunde) : [];
    const naechsterTag = range.days.find((d) => d.date !== heute && d.events.some((e) => e.status !== "cancelled"));
    naechsterSchultag = naechsterTag
      ? { date: naechsterTag.date, stunden: naechsterTag.events.map(toStunde) }
      : null;
  } catch {
    nichtVerfuegbar.push("stundenplan");
  }

  let aufgaben: AufgabeKurz[] = [];
  let pruefungen: AufgabeKurz[] = [];
  let weitereAufgaben = 0;
  let weiterePruefungen = 0;
  try {
    const offene = await listAssignments({ includeCompleted: false });

    const aufgabenImFenster = offene
      .filter((a) => !isExamPageType(a.type) && (a.dueDate === null || (a.dueDate <= bis14)))
      .sort((a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿"));
    weitereAufgaben = Math.max(0, aufgabenImFenster.length - 25);
    aufgaben = aufgabenImFenster
      .slice(0, 25)
      .map((a) => ({ id: a.id, titel: a.title, fach: a.subjectName, typ: a.type, faellig: a.dueDate }));

    const pruefungenImFenster = offene
      .filter((a) => isExamPageType(a.type) && a.dueDate !== null && a.dueDate >= heute && a.dueDate <= bis30)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
    weiterePruefungen = Math.max(0, pruefungenImFenster.length - 10);
    pruefungen = pruefungenImFenster
      .slice(0, 10)
      .map((a) => ({ id: a.id, titel: a.title, fach: a.subjectName, typ: a.type, faellig: a.dueDate }));
  } catch {
    nichtVerfuegbar.push("aufgaben");
  }

  let notizen: NotizKurz[] = [];
  try {
    const recent = await listRecentNotes(8);
    notizen = recent.map((n) => ({ id: n.id, titel: n.title, fach: n.subjectName, geaendert: n.updatedAt.slice(0, 10) }));
  } catch {
    nichtVerfuegbar.push("notizen");
  }

  const lernplaene = await lernplaeneAnzahl().catch(() => { nichtVerfuegbar.push("lernplaene"); return undefined; });

  return { heute, faecher, stundenHeute, naechsterSchultag, aufgaben, pruefungen, notizen, lernplaene, nichtVerfuegbar, weitereAufgaben, weiterePruefungen };
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
  return tage === 1 ? "(seit 1 Tag überfällig)" : `(seit ${tage} Tagen überfällig)`;
}

function tageDazwischen(vonISO: string, bisISO: string): number {
  const a = new Date(`${vonISO}T00:00:00`).getTime();
  const b = new Date(`${bisISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function stundenZeile(stunden: Stunde[]): string {
  return stunden
    .map((s) => {
      const basis = `${s.startTime}-${s.endTime ?? "?"} ${s.fach}${s.raum ? ` ${s.raum}` : ""}`;
      if (s.status === "cancelled") return `${basis} (entfällt)`;
      if (s.status === "substituted") {
        const detail = s.vertretung ? `: ${s.vertretung}` : s.lehrer ? ` bei ${s.lehrer}` : "";
        return `${basis} (Vertretung${detail})`;
      }
      return basis;
    })
    .join("; ");
}

// Reine Funktion: baut aus dem Lagebild den kompakten Text fuer den
// System-Prompt.
export function lagebildAlsText(l: Lagebild): string {
  const fehlt = new Set(l.nichtVerfuegbar);
  const zeilen: string[] = [
    "Lagebild (Auszug aus gespeicherten Daten, kein Live-Abruf bei Untis; für Details, Texte, Noten und ältere Einträge die Werkzeuge nutzen):",
  ];

  if (fehlt.has("faecher")) {
    zeilen.push("Fächer: derzeit nicht verfügbar.");
  } else if (l.faecher.length > 0) {
    const faecherText = l.faecher
      .map((f) => {
        const klammer = [f.lehrer, f.raum].filter(Boolean).join(", ");
        return klammer ? `${f.name} (${klammer})` : f.name;
      })
      .join(", ");
    zeilen.push(`Seine Fächer: ${faecherText}`);
  }

  const heuteWochentag = weekdayName(l.heute);
  if (fehlt.has("stundenplan")) {
    zeilen.push("Stundenplan: derzeit nicht verfügbar. Ob Unterricht stattfindet, ist unbekannt.");
  } else if (l.stundenHeute.length > 0) {
    zeilen.push(`Heute, ${heuteWochentag}: ${stundenZeile(l.stundenHeute)}`);
  } else {
    zeilen.push(`Heute, ${heuteWochentag}: keine Schulstunden im gespeicherten Plan`);
  }

  if (!fehlt.has("stundenplan") && l.naechsterSchultag) {
    const wochentag = weekdayName(l.naechsterSchultag.date);
    zeilen.push(
      `Nächster Schultag ${wochentag} ${l.naechsterSchultag.date}: ${stundenZeile(l.naechsterSchultag.stunden)}`,
    );
  } else if (!fehlt.has("stundenplan")) {
    zeilen.push("Nächster Schultag: in den nächsten 7 Tagen kein Eintrag im gespeicherten Plan");
  }

  if (fehlt.has("aufgaben")) {
    zeilen.push("Aufgaben und Prüfungen: derzeit nicht verfügbar. Fälligkeiten sind unbekannt.");
  } else {
    zeilen.push("Offene Aufgaben (bis in 14 Tagen, ohne Prüfungen):");
    if (l.aufgaben.length === 0) {
      zeilen.push("- keine");
    } else {
      for (const a of l.aufgaben) {
        const typLabel = TYPE_LABEL[a.typ];
        const fachTeil = a.fach ? ` ${a.fach}` : "";
        const faelligTeil = a.faellig ? `fällig ${a.faellig} ${relativTag(a.faellig, l.heute)}` : "ohne Datum";
        zeilen.push(`- [${a.id}] ${typLabel}${fachTeil} "${a.titel}", ${faelligTeil}`);
      }
    }
    if (l.weitereAufgaben) zeilen.push(`${l.weitereAufgaben} weitere Aufgaben nicht angezeigt; dafür aufgaben_lesen nutzen.`);

    zeilen.push("Prüfungen (nächste 30 Tage):");
    if (l.pruefungen.length === 0) {
      zeilen.push("- keine");
    } else {
      for (const p of l.pruefungen) {
        const typLabel = TYPE_LABEL[p.typ];
        const fachTeil = p.fach ? ` ${p.fach}` : "";
        zeilen.push(`- [${p.id}] ${typLabel}${fachTeil} "${p.titel}" am ${p.faellig} ${relativTag(p.faellig!, l.heute)}`);
      }
    }
    if (l.weiterePruefungen) zeilen.push(`${l.weiterePruefungen} weitere Prüfungen nicht angezeigt; dafür aufgaben_lesen nutzen.`);
  }

  if (fehlt.has("lernplaene")) {
    zeilen.push("Lernpläne: derzeit nicht verfügbar.");
  } else if (l.lernplaene) {
    zeilen.push(`Lernpläne: ${l.lernplaene} aktiv`);
  }

  if (fehlt.has("notizen")) {
    zeilen.push("Notizen: derzeit nicht verfügbar.");
  } else {
    zeilen.push("Zuletzt geänderte Notizen:");
    if (l.notizen.length === 0) {
      zeilen.push("- keine");
    } else {
      for (const n of l.notizen) {
        zeilen.push(`- [${n.id}] ${n.fach} "${n.titel}" (${n.geaendert})`);
      }
    }
  }

  return zeilen.join("\n");
}
