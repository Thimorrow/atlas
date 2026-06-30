// Recurrence-Presets fuer das To-Do-Composer-UI. Wir speichern RRULE (RFC 5545),
// bieten in der UI aber nur die paar Muster an, die real gebraucht werden --
// rrule.js kann beim Expandieren ohnehin den vollen Standard.

export const WEEKDAYS = [
  { key: "MO", short: "Mo" },
  { key: "TU", short: "Di" },
  { key: "WE", short: "Mi" },
  { key: "TH", short: "Do" },
  { key: "FR", short: "Fr" },
  { key: "SA", short: "Sa" },
  { key: "SU", short: "So" },
] as const;

const WEEKDAY_SHORT: Record<string, string> = Object.fromEntries(
  WEEKDAYS.map((w) => [w.key, w.short]),
);
const ALL_WEEKDAYS = WEEKDAYS.map((w) => w.key);
const WORKDAYS = ["MO", "TU", "WE", "TH", "FR"];

export type RecurrenceMode = "daily" | "every2" | "workdays" | "custom";

// Baut den RRULE-Body aus einem Preset. `custom` ohne Tage -> null (ungueltig).
export function buildRrule(mode: RecurrenceMode, days: string[] = []): string | null {
  switch (mode) {
    case "daily":
      return "FREQ=DAILY";
    case "every2":
      return "FREQ=DAILY;INTERVAL=2";
    case "workdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "custom": {
      const ordered = ALL_WEEKDAYS.filter((d) => days.includes(d));
      return ordered.length ? `FREQ=WEEKLY;BYDAY=${ordered.join(",")}` : null;
    }
  }
}

type ParsedRrule = { freq: string; interval: number; byday: string[] };

function parse(rrule: string): ParsedRrule {
  const body = rrule.trim().replace(/^RRULE:/i, "");
  const get = (k: string) => body.match(new RegExp(`${k}=([^;]+)`, "i"))?.[1];
  return {
    freq: (get("FREQ") || "").toUpperCase(),
    interval: Number(get("INTERVAL") || "1"),
    byday: (get("BYDAY") || "")
      .split(",")
      .map((d) => d.trim().toUpperCase())
      .filter(Boolean),
  };
}

// RRULE -> (Preset-Modus, gewaehlte Tage) fuers Vorbelegen beim Bearbeiten.
export function rruleToMode(rrule: string): { mode: RecurrenceMode; days: string[] } {
  const { freq, interval, byday } = parse(rrule);
  if (freq === "DAILY") return { mode: interval >= 2 ? "every2" : "daily", days: [] };
  if (freq === "WEEKLY") {
    const set = [...byday].sort();
    if (set.length === 5 && WORKDAYS.every((d) => set.includes(d)))
      return { mode: "workdays", days: WORKDAYS };
    return { mode: "custom", days: ALL_WEEKDAYS.filter((d) => byday.includes(d)) };
  }
  return { mode: "daily", days: [] };
}

// RRULE -> kurzes deutsches Label ("Alle 2 Tage", "Mo, Mi, Fr", ...).
export function rruleToLabel(rrule: string): string {
  const { freq, interval, byday } = parse(rrule);
  if (freq === "DAILY") {
    if (interval <= 1) return "Jeden Tag";
    if (interval === 2) return "Alle 2 Tage";
    return `Alle ${interval} Tage`;
  }
  if (freq === "WEEKLY") {
    const set = [...byday].sort();
    if (!byday.length) return "Wöchentlich";
    if (set.length === 7) return "Jeden Tag";
    if (set.length === 5 && WORKDAYS.every((d) => set.includes(d))) return "Wochentags";
    return ALL_WEEKDAYS.filter((d) => byday.includes(d))
      .map((d) => WEEKDAY_SHORT[d])
      .join(", ");
  }
  return "Wiederkehrend";
}
