// Winziger GET-Cache fuer JSON-APIs: Speicher + TTL. Wer ihn nutzt, zeigt
// beim Wiederbetreten einer Ansicht sofort den letzten Stand und laedt im
// Hintergrund nach -- statt bei jedem Mount einen Spinner zu zeigen. Fragt
// bewusst nicht "cache oder frisch", sondern nimmt beides: Treffer im
// gueltigen Fenster kommen synchron aus dem Speicher, danach wird normal
// geladen und der Eintrag ersetzt.
type Entry = { data: unknown; savedAt: number };

const mem = new Map<string, Entry>();

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

// Holt JSON von url. Liegt ein gueltiger Eintrag vor, kommt er sofort ohne
// Netz; sonst wird geladen, gespeichert und zurueckgegeben. Schlaegt das
// Netz fehl und es gibt einen (abgelaufenen) Eintrag, wird der als
// Rueckfall verkauft, statt die Ansicht leer stehen zu lassen.
export async function cachedGetJSON<T>(url: string, ttlMs = 5 * 60_000): Promise<T> {
  const hit = readGetCache<T>(url, ttlMs);
  if (hit !== null) return hit;
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
}
