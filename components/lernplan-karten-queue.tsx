"use client";

// Karten-Queue-Leiste der Planseite: startet beim Oeffnen automatisch die
// Karten-Erzeugung fuer alle offenen Punkte (siehe lib/lernplan-karten-queue.ts
// und SPEC.md "Planseite"). Reine Anzeige plus Anstoss -- der eigentliche
// Fortschritt (cards_state) liegt im Server, daher pausiert ein Seitenwechsel
// nur den laufenden Lauf, das naechste Oeffnen setzt ihn fort.

import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { runKartenQueue } from "@/lib/lernplan-karten-queue";
import type { PunktDTO } from "@/lib/lernplan-types";
import { cn } from "@/lib/utils";

export function LernplanKartenQueue({
  subjectId,
  assignmentId,
  punkte,
  botEnabled,
  onAktualisiert,
}: {
  subjectId: string;
  assignmentId: string;
  punkte: PunktDTO[];
  botEnabled: boolean;
  onAktualisiert: () => void;
}) {
  // Lokaler Zustand nur fuer die Leiste selbst -- die Wahrheit (cardsState,
  // kartenAnzahl) liegt im Plan der Elternkomponente und kommt ueber
  // onAktualisiert() zurueck.
  const [laufend, setLaufend] = useState<Set<string>>(new Set());
  const onAktualisiertRef = useRef(onAktualisiert);
  onAktualisiertRef.current = onAktualisiert;

  const fertigZaehler = punkte.filter((p) => p.cardsState === "fertig" || p.kartenAnzahl > 0).length;
  const fehlerPunkte = punkte.filter((p) => p.cardsState === "fehler");
  const offenZaehler = punkte.filter((p) => p.cardsState === "offen" && p.kartenAnzahl === 0).length;

  useEffect(() => {
    if (!botEnabled) return;
    if (offenZaehler === 0) return;
    const controller = new AbortController();

    void runKartenQueue(punkte, {
      fetch,
      subjectId,
      assignmentId,
      signal: controller.signal,
      onStatus: (pointId, status) => {
        setLaufend((prev) => {
          const next = new Set(prev);
          if (status === "laeuft") next.add(pointId);
          else next.delete(pointId);
          return next;
        });
        if (status === "fertig" || status === "fehler") onAktualisiertRef.current();
      },
    });

    return () => controller.abort();
    // punkte absichtlich nicht in den Deps: die Queue soll erst neu starten,
    // wenn subjectId/botEnabled sich aendern oder die Seite neu gemountet
    // wird, nicht bei jedem onAktualisiert()-Refresh (sonst startet sie in
    // eine Endlosschleife neu, waehrend sie noch laeuft).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, assignmentId, botEnabled]);

  function erneut(punktIds: string[]) {
    const controller = new AbortController();
    void runKartenQueue(punkte, {
      fetch,
      subjectId,
      assignmentId,
      erneut: punktIds,
      signal: controller.signal,
      onStatus: (pointId, status) => {
        setLaufend((prev) => {
          const next = new Set(prev);
          if (status === "laeuft") next.add(pointId);
          else next.delete(pointId);
          return next;
        });
        if (status === "fertig" || status === "fehler") onAktualisiertRef.current();
      },
    });
  }

  if (!botEnabled) {
    if (offenZaehler === 0 && fehlerPunkte.length === 0) return null;
    return (
      <div className="rounded-xl border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">KI ist aus</div>
    );
  }

  const alleFertig = fertigZaehler === punkte.length && fehlerPunkte.length === 0;
  if (alleFertig) return null;

  const prozent = punkte.length > 0 ? Math.round((fertigZaehler / punkte.length) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card px-3 py-2.5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="tabular-nums text-[13px] font-medium">
          Karten: {fertigZaehler} von {punkte.length} fertig
        </p>
        {laufend.size > 0 && <span className="text-[12px] text-muted-foreground">erzeugt …</span>}
      </div>
      <div
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={prozent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Karten-Fortschritt"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${prozent}%` }} />
      </div>
      {fehlerPunkte.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
          <p className="text-[12.5px] text-destructive">
            {fehlerPunkte.length === 1 ? "1 Thema fehlgeschlagen" : `${fehlerPunkte.length} Themen fehlgeschlagen`}
          </p>
          <button
            type="button"
            onClick={() => erneut(fehlerPunkte.map((p) => p.id))}
            className={cn(
              "relative inline-flex items-center gap-1 rounded px-1 py-1 text-[12.5px] font-medium text-primary",
              "before:absolute before:-inset-2.5 before:content-[''] [touch-action:manipulation]",
              "hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <RotateCw className="size-3" aria-hidden />
            Erneut
          </button>
        </div>
      )}
    </div>
  );
}
