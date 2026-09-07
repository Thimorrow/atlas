"use client";

// Stale-while-revalidate als Hook: zeigt beim Mount sofort den gueltigen
// Speicher-Stand (kein Spinner beim Wiederbetreten) und laedt immer leise im
// Hintergrund nach. refreshKey erzwingt eine frische Runde -- z.B. nach einem
// Untis-Sync: der alte Stand bleibt stehen, bis die neue Antwort da ist.
// keepPreviousData laesst den alten Stand auch bei URL-Wechsel stehen (z.B.
// Wochenblaettern im Kalender). Mutationen vergessen ihren Bereich ueber
// invalidate* in lib/fetch-cache.ts, der Hook zieht danach von selbst nach.

import { useCallback, useEffect, useRef, useState } from "react";
import { readGetCache, writeGetCache } from "@/lib/fetch-cache";

export type CachedState<T> = {
  data: T | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
  // Lokales Nachfuehren ohne Netz -- z.B. Marker im Kalender setzen. Landet
  // auch im Speicher, damit ein Remount denselben Stand zeigt.
  patch: (fn: (prev: T | null) => T | null) => void;
};

export function useCachedJSON<T>(
  url: string | null,
  ttlMs: number,
  opts?: { refreshKey?: number | string; keepPreviousData?: boolean },
): CachedState<T> {
  const refreshKey = opts?.refreshKey ?? 0;
  const keepPrevious = opts?.keepPreviousData ?? false;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(url !== null);
  const [error, setError] = useState(false);
  const [manual, setManual] = useState(0);
  const prevUrl = useRef<string | null>(null);
  const dataRef = useRef<T | null>(null);

  const setBoth = useCallback((next: T | null) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const patch = useCallback(
    (fn: (prev: T | null) => T | null) => {
      const next = fn(dataRef.current);
      dataRef.current = next;
      if (url && next !== null) writeGetCache(url, next);
      setData(next);
    },
    [url],
  );

  useEffect(() => {
    if (!url) {
      setBoth(null);
      setLoading(false);
      setError(false);
      prevUrl.current = null;
      return;
    }
    // Neue URL: ohne keepPrevious den alten Stand nicht zeigen (Tabwechsel),
    // mit keepPrevious stehen lassen (Wochenblaettern).
    if (prevUrl.current !== url) {
      prevUrl.current = url;
      if (!keepPrevious) {
        dataRef.current = null;
        setData(null);
        setError(false);
      }
    }
    let alive = true;
    const cached = readGetCache<T>(url, ttlMs) ?? readGetCache<T>(url, Number.POSITIVE_INFINITY);
    if (cached !== null) {
      setBoth(cached);
      setLoading(false);
      setError(false);
    } else if (dataRef.current === null) {
      setLoading(true);
      setError(false);
    }
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<T>;
      })
      .then((fresh) => {
        if (!alive) return;
        writeGetCache(url, fresh);
        setBoth(fresh);
        setLoading(false);
        setError(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        // Vorhandene Daten bleiben sichtbar, der Fehler muss trotzdem
        // erkennbar sein. Auch ein abgelaufener Cache ist ein alter Stand.
        setError(true);
      });
    return () => {
      alive = false;
    };
    // ttlMs ist pro Aufrufstelle konstant (CACHE_TTLS), keepPrevious auch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, refreshKey, manual]);

  return {
    data,
    // Laedt nur, solange noch gar nichts zeigbar ist -- Nachladen bei
    // vorhandenem Stand bleibt unsichtbar.
    loading: loading && data === null,
    error,
    reload: () => setManual((n) => n + 1),
    patch,
  };
}
