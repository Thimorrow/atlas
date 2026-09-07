"use client";

// Karten-Queue der Planseite: stoesst beim Oeffnen automatisch die
// Karten-Erzeugung fuer alle offenen Punkte an (siehe lib/lernplan-karten-queue.ts
// und SPEC.md "Planseite"). Reiner Hook ohne eigene Anzeige -- der Fortschritt
// (cards_state) liegt im Server und kommt ueber onAktualisiert() zurueck in
// den Plan der Elternkomponente. Ein Seitenwechsel pausiert nur den laufenden
// Lauf, das naechste Oeffnen setzt ihn fort.

import { useEffect, useRef, useState } from "react";
import { runKartenQueue } from "@/lib/lernplan-karten-queue";
import type { PunktDTO } from "@/lib/lernplan-types";

export function useKartenQueue({
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
  const [laufend, setLaufend] = useState<Set<string>>(new Set());
  // Punkte, deren Lauf in dieser Sitzung gescheitert ist -- unabhaengig davon,
  // ob patchCardsState(..., "fehler") den Server-Zustand mitschreiben konnte
  // (S5: bei einem Funkloch scheitern typischerweise beide, und cardsState
  // bleibt dann auf "offen" haengen, ohne dass sich offenZaehler aendert).
  // Ein erfolgreicher erneuter Lauf desselben Punkts nimmt ihn hier wieder
  // heraus. Rein lokal, nicht in Deps eines Effekts -- veraendert also nie,
  // ob der Haupt- oder Erneut-Lauf startet.
  const [lokaleFehler, setLokaleFehler] = useState<Set<string>>(new Set());
  const onAktualisiertRef = useRef(onAktualisiert);
  onAktualisiertRef.current = onAktualisiert;

  // BLOCKIEREND-Fix: die Sperre gilt jetzt pro Punkt statt global. Frueher
  // stand hier ein einzelnes erneutLaeuftRef fuer ALLE Punkte zusammen -- ein
  // laufender Reparaturversuch fuer Punkt A sperrte damit auch den Klick auf
  // Punkt B, der dann still im Fruehausstieg landete (kein Spinner, kein
  // Toast, keine Zustandsaenderung). erneutAktivRef haelt die pointIds, fuer
  // die gerade ein erneut()-Lauf unterwegs ist -- greift sofort beim Aufruf
  // (Ref, nicht erst State), damit zwei Klicks auf DENSELBEN Punkt im selben
  // Tick trotzdem nur einen Lauf anstossen; ein Klick auf einen ANDEREN Punkt
  // ist davon unberuehrt und startet parallel. Der Aufrufer sieht "laeuft
  // gerade" ueber das bestehende laufend-Set (siehe onStatus unten), das
  // schon vorher pro Punkt war -- ein separates erneutLaeuft-Flag fuer die
  // Anzeige braucht es darum nicht mehr.
  const erneutAktivRef = useRef<Set<string>>(new Set());
  // Haelt die Controller aller gerade laufenden Erneut-Versuche (koennen jetzt
  // mehrere gleichzeitig sein, einer pro Punkt), damit ein Unmount mitten im
  // Lauf sie alle abbrechen kann -- der Haupt-Effekt hat seinen eigenen
  // Controller schon per Cleanup abgesichert, dieses Set hier ist nur fuer
  // erneut() ausserhalb des Effekts.
  const erneutControllersRef = useRef<Set<AbortController>>(new Set());
  useEffect(() => {
    return () => erneutControllersRef.current.forEach((c) => c.abort());
  }, []);

  const offenZaehler = punkte.filter((p) => p.cardsState === "offen" && p.kartenAnzahl === 0).length;

  // Haelt den Controller des Haupt-Laufs, damit ein echter Unmount der Seite
  // ihn abbrechen kann. Bewusst nicht im Cleanup des Start-Effekts (siehe
  // unten): das wuerde einen laufenden Lauf mitten im Ablauf abwuergen.
  const hauptControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => hauptControllerRef.current?.abort();
  }, []);

  // laeuftRef ist die einzige Absicherung gegen Doppel-/Endlos-Laeufe: solange
  // ein Lauf offen ist, bleibt sie true und ein zweiter Start wird ignoriert.
  // offenZaehler steht bewusst in den Deps, damit der Effekt anspringt, sobald
  // beim Mount (oder nach einem Refresh) offene Punkte auftauchen -- genau das
  // hat vorher gefehlt (Plan war beim ersten Lauf noch null, offenZaehler war
  // 0, und danach aenderte sich keine Dependency mehr). onAktualisiert() laedt
  // nach jedem fertigen Punkt den Plan neu und liefert damit ein neues
  // offenZaehler -- der Effekt feuert dann zwar erneut, aber laeuftRef ist
  // noch true, also passiert nichts: kein zweiter Lauf, kein Abbruch des
  // laufenden.
  const laeuftRef = useRef(false);

  useEffect(() => {
    if (!botEnabled) return;
    if (offenZaehler === 0) return;
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    const controller = new AbortController();
    hauptControllerRef.current = controller;

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
        if (status === "fertig" || status === "fehler") {
          setLokaleFehler((prev) => {
            const next = new Set(prev);
            if (status === "fehler") next.add(pointId);
            else next.delete(pointId);
            return next;
          });
          onAktualisiertRef.current();
        }
      },
    }).finally(() => {
      laeuftRef.current = false;
      if (hauptControllerRef.current === controller) hauptControllerRef.current = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, assignmentId, botEnabled, offenZaehler]);

  function erneut(punktIds: string[]) {
    // Nur Punkte mitnehmen, fuer die gerade kein Erneut-Lauf unterwegs ist --
    // ein Punkt, der schon laeuft, bleibt unberuehrt (kein zweiter Lauf fuer
    // denselben Punkt), alle anderen starten trotzdem.
    const neue = punktIds.filter((id) => !erneutAktivRef.current.has(id));
    if (neue.length === 0) return;
    neue.forEach((id) => erneutAktivRef.current.add(id));

    const controller = new AbortController();
    erneutControllersRef.current.add(controller);
    void runKartenQueue(punkte, {
      fetch,
      subjectId,
      assignmentId,
      erneut: neue,
      signal: controller.signal,
      onStatus: (pointId, status) => {
        setLaufend((prev) => {
          const next = new Set(prev);
          if (status === "laeuft") next.add(pointId);
          else next.delete(pointId);
          return next;
        });
        if (status === "fertig" || status === "fehler") {
          setLokaleFehler((prev) => {
            const next = new Set(prev);
            if (status === "fehler") next.add(pointId);
            else next.delete(pointId);
            return next;
          });
          onAktualisiertRef.current();
        }
      },
    }).finally(() => {
      erneutControllersRef.current.delete(controller);
      neue.forEach((id) => erneutAktivRef.current.delete(id));
    });
  }

  // laufend geht jetzt nach lernplan-seite.tsx (EinheitZeile) -- unterscheidet
  // dort "wird gerade erzeugt" von "wartet noch in der Queue", statt beides
  // unter demselben Satz zu verstecken (S3). laufend ist bereits PRO PUNKT und
  // wird von Hauptlauf UND jedem erneut()-Aufruf gemeinsam befuellt (onStatus
  // oben) -- laufend.has(pointId) beantwortet also fuer jeden einzelnen Punkt
  // zuverlaessig "laeuft gerade ein Versuch", egal ob dieser Versuch vom
  // Hauptlauf oder von erneut() gestartet wurde. Ein eigenes globales
  // erneutLaeuft-Flag entfaellt darum (BLOCKIEREND-Fix): es gab faelschlich
  // "laeuft" fuer ALLE Punkte zurueck, sobald irgendein Punkt gerade per
  // erneut() bearbeitet wurde -- die Anzeige in lernplan-seite.tsx sollte
  // fuer "kartenLaeuft" pro Zeile nur noch laufend.has(item.pointId) lesen,
  // nicht mehr zusaetzlich ein erneutLaeuft ORen.
  // lokaleFehler faengt S5 ab: haengt cardsState wegen eines Funklochs auf
  // "offen" fest (Erzeugung UND das best-effort-PATCH auf "fehler" sind beide
  // gescheitert), zeigt dieses Feld trotzdem an, dass der Punkt in dieser
  // Sitzung schon einen gescheiterten Lauf hatte, statt dauerhaft in "wird
  // vorbereitet" zu haengen.
  return { laufend, erneut, lokaleFehler };
}
