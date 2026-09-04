// Bildet deutsche, umgangssprachliche Datumsangaben ("morgen", "naechsten
// Montag") und ISO-Daten auf ein ISO-Datum (JJJJ-MM-TT) ab. Unverstaendliche
// Angaben ergeben null statt eines Fehlers -- die Werkzeuge melden das dann im
// Ergebnis, statt den ganzen Aufruf scheitern zu lassen.
//
// Reine Funktion (kein Date.now() direkt, "heute" wird uebergeben), damit sie
// ohne Systemzeit-Mocking testbar bleibt. "heute" wird ueber heuteISO()
// (lib/zeit.ts) in deutscher Zeit bestimmt, nicht in der Zeitzone des
// Rechners -- der Server laeuft auf Vercel in UTC, "morgen" muss aber nach
// deutscher Mitternacht gelten, nicht erst nach UTC-Mitternacht.

import { heuteISO } from "@/lib/zeit";
import { addDays } from "@/lib/assignments-view";
import { vergleichbar } from "@/lib/umlaute";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAYS = [
  "montag",
  "dienstag",
  "mittwoch",
  "donnerstag",
  "freitag",
  "samstag",
  "sonntag",
]; // Index 0 = Montag, passend zu weekdayOfISO()

// 0 = Montag ... 6 = Sonntag, fuer ein ISO-Datum. Mittag UTC statt Mitternacht,
// damit die Zeitzone des Rechners den Wochentag nie ueber die Kalendergrenze
// hinweg verschiebt.
function weekdayOfISO(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

function isValidISO(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const roundtrip = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return roundtrip === iso;
}

export type ParsedDate = { iso: string | null; hint?: string };

export function parseFuzzyDate(input: string, today: Date = new Date()): ParsedDate {
  const raw = input.trim();
  if (!raw) return { iso: null, hint: "Kein Datum angegeben." };

  if (ISO_RE.test(raw)) {
    if (!isValidISO(raw)) {
      return { iso: null, hint: `"${raw}" ist kein gueltiges Datum.` };
    }
    return { iso: raw };
  }

  // Ueber vergleichbar(), damit die Umlaut-Schreibweise und die
  // transliterierte gleich ankommen -- getippt wird mal so, mal so.
  const lower = vergleichbar(raw);
  const heute = heuteISO(today);

  if (lower === "heute") return { iso: heute };
  if (lower === "morgen") return { iso: addDays(heute, 1) };
  if (lower === "uebermorgen") return { iso: addDays(heute, 2) };

  // "naechsten Montag", "naechste Woche Montag", "kommenden Freitag" ...
  const naechsterMatch = lower.match(
    /(?:naechst|kommend)\w*\s*(?:woche\s+)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)/,
  );
  if (naechsterMatch) {
    return { iso: nextWeekday(heute, naechsterMatch[1]) };
  }

  // Blosser Wochentagsname: der naechste Vorkommen ab morgen (nie "heute
  // bereits vorbei").
  if (WEEKDAYS.includes(lower)) {
    return { iso: nextWeekday(heute, lower) };
  }

  // "in X tagen"
  const inTagenMatch = lower.match(/^in\s+(\d+)\s*tag(?:en)?$/);
  if (inTagenMatch) {
    return { iso: addDays(heute, Number(inTagenMatch[1])) };
  }

  return { iso: null, hint: `"${raw}" konnte nicht als Datum erkannt werden.` };
}

function nextWeekday(heuteISO: string, name: string): string {
  const targetIdx = WEEKDAYS.indexOf(name);
  const todayIdx = weekdayOfISO(heuteISO);
  let delta = targetIdx - todayIdx;
  if (delta <= 0) delta += 7;
  return addDays(heuteISO, delta);
}
