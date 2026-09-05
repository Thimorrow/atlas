// Karten-Queue der Planseite: erzeugt Karten fuer Punkte ohne Karten, ueber
// POST /api/lernen/generieren, mit Parallelitaet <= 2. Reine Logik ohne
// React/DOM, damit sie sowohl in components/lernplan-karten-queue.tsx als
// auch im Test direkt laeuft. Siehe SPEC.md "Planseite" (Karten-Queue).

import type { PunktDTO } from "@/lib/lernplan-types";

export type KartenQueueStatus = "laeuft" | "fertig" | "fehler";

export type KartenQueueDeps = {
  fetch: typeof fetch;
  subjectId: string;
  // Fuer den Edge Case "Thema geloescht": ein Punkt ohne topicId bekommt hier
  // ein neues Thema angelegt (POST /api/lernen/themen), das braucht die
  // Pruefung, zu der das neue Thema gehoert.
  assignmentId: string;
  // Parallelitaet der laufenden Anfragen, Default 2 (siehe Muster in
  // components/subject-files.tsx, dort MAX_CONCURRENT).
  parallel?: number;
  anzahl?: number;
  // Punkte mit cardsState 'fehler', fuer die die Queue trotzdem laufen soll
  // (Button "Erneut" in der Komponente). Ohne diese Liste bleiben
  // 'fehler'-Punkte unangetastet.
  erneut?: string[];
  onStatus?: (pointId: string, status: KartenQueueStatus) => void;
  signal?: AbortSignal;
};

export type KartenQueueErgebnis = { fertig: string[]; fehler: string[] };

// PATCH cardsState best-effort: schlaegt der PATCH selbst fehl, bleibt der
// erzeugte oder fehlgeschlagene Zustand trotzdem im Rueckgabewert und im
// onStatus-Callback sichtbar -- nur der Server-Zustand haenge dann nach, bis
// zum naechsten Lauf.
async function patchCardsState(
  deps: KartenQueueDeps,
  pointId: string,
  cardsState: "fertig" | "fehler",
): Promise<void> {
  try {
    await deps.fetch(`/api/lernen/plan/points/${pointId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardsState }),
    });
  } catch {
    // Best effort, siehe Kommentar oben.
  }
}

// PATCH topicId best-effort, wie patchCardsState: schlaegt der PATCH selbst
// fehl, laeuft trotzdem mit der frisch angelegten topicId weiter -- nur der
// Server-Zustand haenge dann nach, bis zum naechsten Lauf.
async function patchTopicId(deps: KartenQueueDeps, pointId: string, topicId: string): Promise<void> {
  try {
    await deps.fetch(`/api/lernen/plan/points/${pointId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topicId }),
    });
  } catch {
    // Best effort, siehe Kommentar oben.
  }
}

// Edge Case "Thema geloescht" (SPEC.md "Planseite"): das Thema hinter einem
// Punkt kann geloescht worden sein (topicId wird dann auf null gesetzt).
// Statt den Punkt dauerhaft zu ueberspringen, legt die Queue hier ein neues
// Thema an und haengt es zurueck an den Punkt.
async function legeThemaAn(deps: KartenQueueDeps, punkt: PunktDTO): Promise<string | null> {
  try {
    const res = await deps.fetch("/api/lernen/themen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectId: deps.subjectId, title: punkt.titel, assignmentId: deps.assignmentId }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as { thema: { id: string } };
    return data.thema.id;
  } catch (err) {
    console.warn(`[lernplan] Thema für Punkt ${punkt.id}:`, err);
    return null;
  }
}

async function verarbeitePunkt(deps: KartenQueueDeps, punkt: PunktDTO, anzahl: number): Promise<"fertig" | "fehler"> {
  deps.onStatus?.(punkt.id, "laeuft");

  let topicId = punkt.topicId;
  if (!topicId) {
    topicId = await legeThemaAn(deps, punkt);
    if (!topicId) {
      await patchCardsState(deps, punkt.id, "fehler");
      deps.onStatus?.(punkt.id, "fehler");
      return "fehler";
    }
    await patchTopicId(deps, punkt.id, topicId);
  }

  const quelle = punkt.fileIds.length > 0 ? "dateien" : "notizen";
  try {
    const res = await deps.fetch("/api/lernen/generieren", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: deps.subjectId,
        quelle,
        fileIds: punkt.fileIds,
        topicId,
        anzahl,
      }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    await patchCardsState(deps, punkt.id, "fertig");
    deps.onStatus?.(punkt.id, "fertig");
    return "fertig";
  } catch (err) {
    console.warn(`[lernplan] Karten für Punkt ${punkt.id}:`, err);
    await patchCardsState(deps, punkt.id, "fehler");
    deps.onStatus?.(punkt.id, "fehler");
    return "fehler";
  }
}

export async function runKartenQueue(punkte: PunktDTO[], deps: KartenQueueDeps): Promise<KartenQueueErgebnis> {
  const parallel = deps.parallel ?? 2;
  const anzahl = deps.anzahl ?? 8;
  const erneutSet = new Set(deps.erneut ?? []);

  // S3: "fertig" mit kartenAnzahl 0 heisst, die Erzeugung ist durchgelaufen,
  // hat aber nichts geliefert -- wie "fehler" nimmt die Queue diesen Punkt nur
  // ueber den expliziten erneut()-Aufruf wieder auf (erneutSet), nie
  // automatisch beim naechsten Laden. Sonst wuerde ein Punkt, der wiederholt
  // nichts liefert, bei jedem Neuladen automatisch erneut angestossen.
  //
  // S1: der unbedingte "offen"-Zweig gilt nur, wenn diese Punkte NICHT
  // explizit in erneutSet stehen -- also nur fuer den automatischen
  // Hauptlauf (deps.erneut ist dort nie gesetzt). Ein expliziter
  // erneut()-Aufruf (deps.erneut gesetzt, z.B. ueber den Knopf "Karten
  // fehlen, erneut erzeugen") darf nur die genannten Punkte anfassen --
  // sonst nimmt er nebenbei offene Punkte mit, die der parallel laufende
  // Hauptlauf gerade schon bearbeitet, und schickt fuer dasselbe Thema ein
  // zweites POST /api/lernen/generieren (doppelte Karten im Stapel). Steht
  // ein offener Punkt explizit in erneutSet, darf er trotzdem mit -- das
  // deckt den Fall ab, dass der Hauptlauf gar nicht angelaufen ist (z.B.
  // botEnabled=false) und ein expliziter erneut()-Aufruf der einzige Weg
  // waere, ihn doch noch anzustossen.
  const kandidaten = punkte.filter((p) => {
    if (erneutSet.has(p.id)) {
      return (
        (p.cardsState === "offen" && p.kartenAnzahl === 0) ||
        p.cardsState === "fehler" ||
        (p.cardsState === "fertig" && p.kartenAnzahl === 0)
      );
    }
    return deps.erneut === undefined && p.cardsState === "offen" && p.kartenAnzahl === 0;
  });

  const fertig: string[] = [];
  const fehler: string[] = [];
  let index = 0;

  // Worker-Muster wie in subject-files.tsx: feste Anzahl Worker zieht sich
  // Kandidaten nach, statt Promise.all ueber alle auf einmal zu feuern.
  async function worker() {
    while (index < kandidaten.length) {
      // Abbruch beendet nach dem laufenden Request: hier, vor dem naechsten
      // Kandidaten, nicht mitten in einer laufenden Anfrage.
      if (deps.signal?.aborted) return;
      const punkt = kandidaten[index];
      index += 1;
      const ergebnis = await verarbeitePunkt(deps, punkt, anzahl);
      if (ergebnis === "fertig") fertig.push(punkt.id);
      else fehler.push(punkt.id);
    }
  }

  const workerCount = Math.min(parallel, kandidaten.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { fertig, fehler };
}
