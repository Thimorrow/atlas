// Reine Logik fuer den Vollbild-Stundenmodus des Fokus: laeuft gerade wirklich
// eine Schulstunde, und wie lange noch? Bewusst ohne DB-Import, damit sie ohne
// Datenbank testbar ist -- gleiches Muster wie lib/morgen-view.ts.

// Nur die Felder, die die Entscheidung braucht. Generisch gehalten, damit die
// Route ihre fertigen MorgenLessonDTO durchreichen kann, ohne sie vorher in
// ein eigenes Format zu giessen.
export type LiveCandidate = {
  startTime: string;
  endTime: string | null;
  status: string;
};

// Zeiten kommen als "HH:MM" aus lib/calendar-expand (dort schneidet hm() den
// Postgres-time-Wert "09:45:00" schon zurecht). Verlassen wollen wir uns nicht
// darauf: ein roher time-Wert oder eine einstellige Stunde ("9:45") soll hier
// nicht still zu einem falschen lexikografischen Vergleich fuehren.
// null = kein verwertbarer Zeitwert.
function normHM(t: string | null | undefined): string | null {
  if (typeof t !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function toMinutes(hm: string): number {
  return Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
}

// Die Stunde, die zum Zeitpunkt nowHM wirklich laeuft: startTime <= jetzt <
// endTime. Der Endzeitpunkt selbst zaehlt nicht mehr -- um Punkt 10:30 sitzt
// niemand mehr in der Stunde, die um 10:30 endet, sondern schon in der
// naechsten. Entfallene Stunden zaehlen nie, und ohne Endzeit laesst sich
// "laeuft noch" nicht behaupten (lieber die Tagesansicht als eine Stunde, die
// nie von selbst endet).
//
// Ueberlappen sich zwei Stunden (Doppelbelegung im Import), gewinnt die zuerst
// beginnende: sie ist die, in der der Schueler sitzt, seit die Ueberlappung
// besteht.
export function pickLiveLesson<T extends LiveCandidate>(events: T[], nowHM: string): T | null {
  const now = normHM(nowHM);
  if (!now) return null;

  let best: T | null = null;
  let bestStart = "";
  for (const ev of events) {
    if (ev.status === "cancelled") continue;
    const start = normHM(ev.startTime);
    const end = normHM(ev.endTime);
    if (!start || !end) continue;
    if (!(start <= now && now < end)) continue;
    if (best === null || start < bestStart) {
      best = ev;
      bestStart = start;
    }
  }
  return best;
}

// Verbleibende volle Minuten bis endTime. Nie negativ: eine abgelaufene Stunde
// meldet 0, damit die Anzeige nicht in den Minusbereich kippt, bevor der Fokus
// nachgeladen hat.
export function minutesLeft(endTime: string, nowHM: string): number {
  const end = normHM(endTime);
  const now = normHM(nowHM);
  if (!end || !now) return 0;
  return Math.max(0, toMinutes(end) - toMinutes(now));
}

// Minuten bis startTime -- das Gegenstueck zu minutesLeft fuer eine Stunde,
// die noch nicht laeuft (Pause, "vor der Schule"). Nie negativ: eine schon
// begonnene oder vorbeigegangene Stunde meldet 0.
export function minutesUntil(startTime: string, nowHM: string): number {
  const start = normHM(startTime);
  const now = normHM(nowHM);
  if (!start || !now) return 0;
  return Math.max(0, toMinutes(start) - toMinutes(now));
}

// Fortschritt der Stunde als Anteil 0..1, fuer den duennen Balken im Cockpit.
// Vor Beginn 0, nach Ende 1 -- geklemmt statt extrapoliert, eine unbrauchbare
// Zeitangabe ergibt 0.
export function lessonProgress(startTime: string, endTime: string, nowHM: string): number {
  const start = normHM(startTime);
  const end = normHM(endTime);
  const now = normHM(nowHM);
  if (!start || !end || !now) return 0;
  const total = toMinutes(end) - toMinutes(start);
  if (total <= 0) return 0;
  const elapsed = toMinutes(now) - toMinutes(start);
  return Math.min(1, Math.max(0, elapsed / total));
}

// Die naechste noch bevorstehende Stunde: frueheste nicht-entfallene Stunde
// mit startTime > nowHM. Grundlage fuer den Pause-/Vor-Modus des Cockpits
// (naechste Stunde vorbereiten) und fuer defaultLesson.
export function pickNextLesson<T extends LiveCandidate>(events: T[], nowHM: string): T | null {
  const now = normHM(nowHM);
  if (!now) return null;

  let best: T | null = null;
  let bestStart = "";
  for (const ev of events) {
    if (ev.status === "cancelled") continue;
    const start = normHM(ev.startTime);
    if (!start || !(start > now)) continue;
    if (best === null || start < bestStart) {
      best = ev;
      bestStart = start;
    }
  }
  return best;
}

// Die zuletzt vorbeigegangene Stunde: spaeteste nicht-entfallene Stunde mit
// endTime <= nowHM. Fuer den "nach"-Modus (Schule vorbei), damit das Cockpit
// nicht leer bleibt, sobald die letzte Stunde durch ist.
export function pickPreviousLesson<T extends LiveCandidate>(events: T[], nowHM: string): T | null {
  const now = normHM(nowHM);
  if (!now) return null;

  let best: T | null = null;
  let bestEnd = "";
  for (const ev of events) {
    if (ev.status === "cancelled") continue;
    const end = normHM(ev.endTime);
    if (!end || !(end <= now)) continue;
    if (best === null || end > bestEnd) {
      best = ev;
      bestEnd = end;
    }
  }
  return best;
}

export type CockpitMode = "live" | "pause" | "vor" | "nach" | "frei";

// Welcher der fuenf Grundzustaende des Stunden-Cockpits gerade gilt.
// frei: kein einziger nicht-entfallener Termin heute (Wochenende, Ferien).
// live: eine Stunde laeuft gerade wirklich (pickLiveLesson trifft).
// vor: jetzt liegt vor dem Beginn der ersten Stunde des Tages.
// nach: jetzt liegt nach dem Ende der letzten Stunde des Tages.
// pause: alles andere -- zwischen zwei Stunden, mitten am Schultag.
export function cockpitMode<T extends LiveCandidate>(events: T[], nowHM: string): CockpitMode {
  const now = normHM(nowHM);
  const usable = events.filter((ev) => ev.status !== "cancelled" && normHM(ev.startTime));
  if (!now || usable.length === 0) return "frei";

  if (pickLiveLesson(events, nowHM)) return "live";

  const starts = usable.map((ev) => normHM(ev.startTime)!);
  const firstStart = starts.reduce((a, b) => (b < a ? b : a));
  if (now < firstStart) return "vor";

  const ends = usable.map((ev) => normHM(ev.endTime)).filter((v): v is string => v !== null);
  if (ends.length > 0) {
    const lastEnd = ends.reduce((a, b) => (b > a ? b : a));
    if (now >= lastEnd) return "nach";
  }

  return "pause";
}

// Die Stunde, die das Cockpit ohne explizite Auswahl zeigt: live, sonst die
// naechste bevorstehende (Pause/vor der Schule), sonst die letzte vergangene
// (nach der Schule, damit dort noch etwas zu sehen ist), sonst null (frei).
export function defaultLesson<T extends LiveCandidate>(events: T[], nowHM: string): T | null {
  return pickLiveLesson(events, nowHM) ?? pickNextLesson(events, nowHM) ?? pickPreviousLesson(events, nowHM);
}

// Das LOKALE Datum des Servers, nicht toISOString() (das springt abends
// schon auf den naechsten Tag) -- identische Regel wie in app/api/morgen/route.ts
// und app/api/home/route.ts, hier ausgelagert, damit beide Routen sie teilen.
export function lokalesDatum(): string {
  return new Date().toLocaleDateString("sv-SE");
}

// Die LOKALE Uhrzeit des Servers als "HH:MM" -- dasselbe Format, in dem die
// Events ihre Zeiten tragen, damit sich beides direkt vergleichen laesst.
export function lokaleUhrzeit(): string {
  return new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
