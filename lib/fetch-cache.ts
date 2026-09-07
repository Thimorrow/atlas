// Winziger GET-Cache fuer JSON-APIs: Speicher + TTL. Wer ihn nutzt, zeigt
// beim Wiederbetreten einer Ansicht sofort den letzten Stand und laedt im
// Hintergrund nach -- statt bei jedem Mount einen Spinner zu zeigen. Fragt
// bewusst nicht "cache oder frisch", sondern nimmt beides: Treffer im
// gueltigen Fenster kommen synchron aus dem Speicher, danach wird normal
// geladen und der Eintrag ersetzt.
type Entry = { data: unknown; savedAt: number };

const mem = new Map<string, Entry>();
// Laufende Netz-Anfragen je URL: zwei Komponenten, die gleichzeitig dieselbe
// URL laden (z.B. /api/subjects auf fast jeder Seite), teilen sich eine
// Anfrage statt zwei zu stellen.
const pending = new Map<string, Promise<unknown>>();

// TTL-Vorgaben je Bereich in ms. Kalender und Aufgaben aendern sich oefters
// (Sync, Abhaken), Faecher fast nie -- ein Wert je Bereich statt raten an
// jeder Aufrufstelle.
export const CACHE_TTLS = {
  bot: 5 * 60_000,
  morgen: 60_000,
  calendar: 2 * 60_000,
  assignments: 2 * 60_000,
  subjects: 10 * 60_000,
  grades: 5 * 60_000,
  lernen: 2 * 60_000,
} as const;

export function readGetCache<T>(url: string, ttlMs: number): T | null {
  const hit = mem.get(url);
  if (!hit || Date.now() - hit.savedAt > ttlMs) return null;
  return hit.data as T;
}

export function writeGetCache<T>(url: string, data: T) {
  mem.set(url, { data, savedAt: Date.now() });
}

export function invalidateGetCache(url?: string) {
  if (url) mem.delete(url);
  else mem.clear();
}

// Vergisst alles unter einem Praefix -- z.B. alle Kalenderwochen
// ("/api/calendar") oder alle Aufgaben-Queries ("?completed=1" eingeschlossen).
// Die exakte Variante oben bleibt fuer den Einzel-Fall (Tests, Bot).
export function invalidateGetCacheByPrefix(prefix: string) {
  for (const key of mem.keys()) {
    if (key.startsWith(prefix)) mem.delete(key);
  }
}

// Bereichs-Invalidierung nach Mutationen: eine geaenderte Aufgabe steht auch
// im Fokus (due), im Kalender (Punkte-Spur) und im Lernbereich (Pruefungen),
// ein geaendertes Fach fast ueberall. Lieber einmal zu breit vergessen als
// eine Ansicht mit altem Stand stehen lassen -- Mutationen sind selten,
// Mounts haeufig.
export function invalidateAssignmentsCaches() {
  invalidateGetCacheByPrefix("/api/assignments");
  invalidateGetCacheByPrefix("/api/morgen");
  invalidateGetCacheByPrefix("/api/calendar");
  invalidateGetCacheByPrefix("/api/lernen");
}

export function invalidateSubjectsCaches() {
  invalidateGetCacheByPrefix("/api/subjects");
  invalidateGetCacheByPrefix("/api/morgen");
  invalidateGetCacheByPrefix("/api/calendar");
  invalidateGetCacheByPrefix("/api/grades");
  invalidateGetCacheByPrefix("/api/lernen");
}

export function invalidateGradesCaches() {
  invalidateGetCacheByPrefix("/api/grades");
}

export function invalidateMorgenCaches() {
  invalidateGetCacheByPrefix("/api/morgen");
}

export function invalidateCalendarCaches() {
  invalidateGetCacheByPrefix("/api/calendar");
}

export function invalidateLernenCaches() {
  invalidateGetCacheByPrefix("/api/lernen");
}

// Holt JSON von url. Liegt ein gueltiger Eintrag vor, kommt er sofort ohne
// Netz; sonst wird geladen, gespeichert und zurueckgegeben. Schlaegt das
// Netz fehl und es gibt einen (abgelaufenen) Eintrag, wird der als
// Rueckfall verkauft, statt die Ansicht leer stehen zu lassen.
export async function cachedGetJSON<T>(url: string, ttlMs = 5 * 60_000): Promise<T> {
  const hit = readGetCache<T>(url, ttlMs);
  if (hit !== null) return hit;
  const ongoing = pending.get(url);
  if (ongoing) return ongoing as Promise<T>;
  const job = (async (): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      const stale = mem.get(url)?.data as T | undefined;
      if (stale !== undefined) return stale;
      throw err;
    }
    if (!res.ok) {
      const stale = mem.get(url)?.data as T | undefined;
      if (stale !== undefined) return stale;
      throw new Error(`GET ${url} scheiterte mit ${res.status}.`);
    }
    const data = (await res.json()) as T;
    writeGetCache(url, data);
    return data;
  })();
  pending.set(url, job);
  try {
    return await job;
  } finally {
    if (pending.get(url) === job) pending.delete(url);
  }
}
