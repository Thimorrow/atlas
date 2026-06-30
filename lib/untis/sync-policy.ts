// Uhrzeit-basierte Sync-Politik fuer den Untis-Stundenplan.
//
// Der Trigger ist "dumm" (Tab-Load + 60s-Tick im Kalender); WANN tatsaechlich zu
// Untis gegangen wird, entscheidet diese reine Logik anhand der Tageszeit und des
// Alters des letzten Syncs (per localStorage gemerkt, geraetelokal).
//
//   - 06:30–07:15  heiss: alle 2 min (aktives Polling), faengt Vertretungen/Ausfaelle
//   - 07:15–17:00  tagsueber egal: nur alle 6h, kein Polling
//   - 17:00–23:00  abends: frisch beim Reload (Sync >30 min), kein Polling
//   - sonst (Nacht) grosszuegig: 12h, kein Polling

export type SyncWindow = {
  from: string; // "HH:MM" inklusive
  to: string; // "HH:MM" exklusive
  maxAgeMin: number; // Load/Tick geht nur zu Untis, wenn letzter Sync aelter ist
  pollMin?: number; // gesetzt = aktiv pollen (sonst nur beim Laden/Reload)
};

export const DEFAULT_WINDOWS: SyncWindow[] = [
  { from: "06:30", to: "07:15", maxAgeMin: 2, pollMin: 2 }, // Morgens heiss
  { from: "07:15", to: "17:00", maxAgeMin: 360 }, // Tagsueber: 6h
  { from: "17:00", to: "23:00", maxAgeMin: 30 }, // Abends: frisch beim Reload
];

// Nachts / ausserhalb aller Fenster: sehr selten, nie pollen.
const NIGHT_MAX_AGE_MIN = 720; // 12h

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Findet das aktive Fenster fuer den Zeitpunkt (erstes passendes gewinnt), sonst null.
export function windowFor(
  now: Date,
  windows: SyncWindow[] = DEFAULT_WINDOWS,
): SyncWindow | null {
  const cur = now.getHours() * 60 + now.getMinutes();
  for (const w of windows) {
    if (cur >= toMin(w.from) && cur < toMin(w.to)) return w;
  }
  return null;
}

export type SyncDecision = {
  shouldSync: boolean; // letzter Sync alt genug -> jetzt neu ziehen?
  pollMin: number | null; // aktiver Tick-Takt (min) oder null = kein Polling
};

// Kernentscheidung: anhand Tageszeit + Alter des letzten Syncs.
// lastSyncMs = epoch-ms des letzten erfolgreichen Syncs, oder null (noch nie).
export function decideSync(
  now: Date,
  lastSyncMs: number | null,
  windows: SyncWindow[] = DEFAULT_WINDOWS,
): SyncDecision {
  const w = windowFor(now, windows);
  const maxAgeMin = w ? w.maxAgeMin : NIGHT_MAX_AGE_MIN;
  const pollMin = w?.pollMin ?? null;
  const ageMin =
    lastSyncMs == null ? Infinity : (now.getTime() - lastSyncMs) / 60_000;
  return { shouldSync: ageMin >= maxAgeMin, pollMin };
}
