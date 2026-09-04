// Deutsche Schulzeit, unabhaengig von der Zeitzone des Rechners.
//
// Der Server laeuft auf Vercel in UTC, der Schueler sitzt in Nordrhein-
// Westfalen. Jede Stelle, die "heute" oder "jetzt" entscheidet (welche Stunde
// laeuft, was faellig ist, welcher Tag im Fokus steht), muss deshalb die
// Zeitzone ausdruecklich nennen -- sonst beginnt der Schultag fuer den Server
// zwei Stunden spaeter als fuer den Schueler, und zwischen Mitternacht und
// 2 Uhr steht sogar das falsche Datum da.
//
// Rein, ohne DB, damit die Faelle mit festen Zeitpunkten testbar sind.

export const ZEITZONE = "Europe/Berlin";

// Datum als JJJJ-MM-TT in deutscher Zeit. Die schwedische Locale ist der
// kuerzeste Weg zu diesem Format.
export function heuteISO(d: Date = new Date()): string {
  return d.toLocaleDateString("sv-SE", { timeZone: ZEITZONE });
}

// Uhrzeit als HH:MM in deutscher Zeit -- dasselbe Format, in dem die
// Schulstunden ihre Zeiten tragen, damit sich beides direkt vergleichen laesst.
export function jetztHM(d: Date = new Date()): string {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: ZEITZONE });
}

// Versatz der deutschen Zeit gegenueber UTC in Minuten zu einem Zeitpunkt
// (60 im Winter, 120 im Sommer).
function versatzMinuten(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZEITZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const alsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((alsUtc - at.getTime()) / 60_000);
}

// Der Zeitpunkt, an dem der deutsche Kalendertag von `d` beginnt (00:00 in
// deutscher Zeit) -- fuer Datenbankabfragen mit Zeitstempeln wie
// "alles, was heute passiert ist".
export function tagesbeginn(d: Date = new Date()): Date {
  const iso = heuteISO(d);
  const mitternachtUtc = new Date(`${iso}T00:00:00Z`);
  return new Date(mitternachtUtc.getTime() - versatzMinuten(mitternachtUtc) * 60_000);
}
