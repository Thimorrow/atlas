import { NextResponse } from "next/server";

// Cache-Control fuer GET-Routen: Single-User-App, deshalb immer privat --
// kein geteilter CDN-Cache fremder Daten. maxAge bestimmt, wie lange der
// Browser (und Vercel Edge) die Antwort ohne Nachfrage wiederverwendet,
// staleWhileRevalidate wie lange eine abgelaufene Antwort noch sofort gezeigt
// und leise im Hintergrund erneuert werden darf. Fehlerantworten bekommen
// bewusst keine Header (siehe Aufrufstellen: nur der Erfolgs-Pfad nutzt
// cachedJson).
export function cacheControlHeader(maxAgeSec: number, staleWhileRevalidateSec = maxAgeSec): string {
  return `private, max-age=${maxAgeSec}, stale-while-revalidate=${staleWhileRevalidateSec}`;
}

export function cachedJson(
  data: unknown,
  maxAgeSec: number,
  staleWhileRevalidateSec?: number,
  init?: { status?: number },
): NextResponse {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: { "Cache-Control": cacheControlHeader(maxAgeSec, staleWhileRevalidateSec) },
  });
}
