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
