// Rechenlogik fuer Meldungen pro Schulstunde -- rein, ohne DB, testbar.
// Zwillingsschwester von lib/grades.ts: der DB-Store (lib/participation-store.ts)
// reicht Rohdaten hier durch, gerechnet wird nur an einer Stelle.

// Ueber diese Grenze hinaus ist eine Meldungszahl kein plausibler Zaehlstand
// mehr -- die Grenze schuetzt vor kaputten Requests, nicht vor legitimen
// Werten (mehr als 99 Meldungen in einer Stunde gibt es nicht).
export const MAX_COUNT = 99;

export type ParticipationSummary = {
  lessons: number; // erfasste Stunden (Zeilen), nicht Kalender-Stunden
  total: number; // Summe der Meldungen ueber alle erfassten Stunden
  average: number | null; // total/lessons, null nur bei lessons === 0
  best: number | null; // hoechster Wert einer einzelnen Stunde, null bei lessons === 0
};

// counts sind die erfassten Werte, EINE erfasste 0 zaehlt als Stunde (siehe
// Kommentar an lessonParticipations in lib/db/schema.ts) -- eine leere Liste
// ("noch keine Stunde erfasst") ist der einzige Fall mit average === null.
export function summarizeParticipation(counts: number[]): ParticipationSummary {
  const lessons = counts.length;
  if (lessons === 0) {
    return { lessons: 0, total: 0, average: null, best: null };
  }
  const total = counts.reduce((sum, c) => sum + c, 0);
  return { lessons, total, average: total / lessons, best: Math.max(...counts) };
}

// "3,4" mit deutschem Komma, eine Nachkommastelle -- "-" bei null (kein
// Bindestrich-Minus, ein echter Gedankenstrich waere hier Ueberschmueckung,
// "-" liest sich im Kontext einer Kennzahl klar als "kein Wert").
export function formatAverage(v: number | null): string {
  if (v === null) return "-";
  return v.toFixed(1).replace(".", ",");
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

// Akzeptiert Zahl oder Zahl-String (Formulare/JSON liefern beides), verlangt
// eine ganze Zahl 0..MAX_COUNT.
export function parseCount(v: unknown): Parsed<number> {
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else if (typeof v === "string" && v.trim() !== "") {
    n = Number(v);
  } else {
    return { ok: false, error: "count muss eine Zahl sein." };
  }
  if (!Number.isFinite(n)) return { ok: false, error: "count muss eine Zahl sein." };
  if (!Number.isInteger(n)) return { ok: false, error: "count muss eine ganze Zahl sein." };
  if (n < 0) return { ok: false, error: "count darf nicht negativ sein." };
  if (n > MAX_COUNT) return { ok: false, error: `count darf hoechstens ${MAX_COUNT} sein.` };
  return { ok: true, value: n };
}
