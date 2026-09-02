// Bildet deutsche, umgangssprachliche Datumsangaben ("morgen", "naechsten
// Montag") und ISO-Daten auf ein ISO-Datum (JJJJ-MM-TT) ab. Unverstaendliche
// Angaben ergeben null statt eines Fehlers -- die Werkzeuge melden das dann im
// Ergebnis, statt den ganzen Aufruf scheitern zu lassen.
//
// Reine Funktion (kein Date.now() direkt, "heute" wird uebergeben), damit sie
// ohne Systemzeit-Mocking testbar bleibt.

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAYS = [
  "montag",
  "dienstag",
  "mittwoch",
  "donnerstag",
  "freitag",
  "samstag",
  "sonntag",
]; // Index 0 = Montag, passend zu localISO-basiertem weekday()

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

// 0 = Montag ... 6 = Sonntag
function weekdayOf(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export type ParsedDate = { iso: string | null; hint?: string };

export function parseFuzzyDate(input: string, today: Date = new Date()): ParsedDate {
  const raw = input.trim();
  if (!raw) return { iso: null, hint: "Kein Datum angegeben." };

  if (ISO_RE.test(raw)) {
    const d = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(d.getTime()) || localISO(d) !== raw) {
      return { iso: null, hint: `"${raw}" ist kein gueltiges Datum.` };
    }
    return { iso: raw };
  }

  const lower = raw.toLowerCase();

  if (lower === "heute") return { iso: localISO(today) };
  if (lower === "morgen") return { iso: localISO(addDays(today, 1)) };
  if (lower === "übermorgen" || lower === "uebermorgen") return { iso: localISO(addDays(today, 2)) };

  // "naechsten Montag", "naechste Woche Montag", "kommenden Freitag" ...
  const naechsterMatch = lower.match(
    /(?:naechst|nächst|kommend)\w*\s*(?:woche\s+)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)/,
  );
  if (naechsterMatch) {
    return { iso: localISO(nextWeekday(today, naechsterMatch[1])) };
  }

  // Blosser Wochentagsname: der naechste Vorkommen ab morgen (nie "heute
  // bereits vorbei").
  if (WEEKDAYS.includes(lower)) {
    return { iso: localISO(nextWeekday(today, lower)) };
  }

  // "in X tagen"
  const inTagenMatch = lower.match(/^in\s+(\d+)\s*tag(?:en)?$/);
  if (inTagenMatch) {
    return { iso: localISO(addDays(today, Number(inTagenMatch[1]))) };
  }

  return { iso: null, hint: `"${raw}" konnte nicht als Datum erkannt werden.` };
}

function nextWeekday(today: Date, name: string): Date {
  const targetIdx = WEEKDAYS.indexOf(name);
  const todayIdx = weekdayOf(today);
  let delta = targetIdx - todayIdx;
  if (delta <= 0) delta += 7;
  return addDays(today, delta);
}
