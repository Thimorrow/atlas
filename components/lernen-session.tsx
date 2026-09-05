"use client";

// Lernsitzung (/lernen/[subjectId]/session): Karteikarten abfragen, je nach
// Kartenart unterschiedlich (wissen/vokabel/aufgabe). Laedt das Fach einmal,
// baut die Warteschlange lokal (queueFor) und arbeitet dann rein clientseitig
// weiter -- kein Neuladen zwischen Karten.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { PROSE } from "@/components/subject-notes";
import { renderMarkdown } from "@/lib/markdown";
import { localISO } from "@/lib/assignments-view";
import { queueFor, vokabelStimmt } from "@/lib/lernen";
import type { SessionModus, StudyCardDTO, SubjectDetail } from "@/lib/lernen-types";

// Urteil einer freien Antwort (bewerteAntwort). Gleiche Werte wie
// lib/lernen.ts (parseUrteil), hier nur fuers UI gebraucht.
type Urteil = "richtig" | "teilweise" | "falsch";
type PruefenErgebnis = { urteil: Urteil; feedback: string };

// Zeitlimit im Client fuer POST /api/lernen/karten/[id]/bewerten -- etwas
// laenger als das Server-Timeout in bewerteAntwort (30 s), damit der Server
// im Normalfall zuerst antwortet.
const PRUEFEN_TIMEOUT_MS = 35_000;

// = --ease-atlas in app/globals.css:10. framer-motion braucht hier wirklich
// ein Array (kann keine CSS-Variable referenzieren), darum die Zahlen separat
// gepflegt statt einer echten zweiten Quelle.
const EASE = [0.22, 1, 0.36, 1] as const;

const MODUS_LABEL: Record<Exclude<SessionModus, "lernen">, string> = {
  schwach: "Schwache",
  probe: "Probe",
};

// BLOCKIEREND 2: .focus() allein bringt ein Ziel unterhalb/oberhalb des
// Sichtbereichs nicht zuverlaessig ins Bild -- explizit hereinscrollen statt
// sich auf das Standardverhalten des Browsers zu verlassen. "auto" statt
// "smooth" bei prefers-reduced-motion, block: "nearest" bewegt die Seite nur,
// wenn das Ziel tatsaechlich ausserhalb liegt. Gleiches Muster wie
// components/lernplan-erstellen.tsx (fokussiereSichtbar).
function fokussiereSichtbar(el: HTMLElement | null | undefined) {
  if (!el) return;
  el.focus();
  const reduziert = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduziert ? "auto" : "smooth", block: "nearest" });
}

// S5: Abfragerichtung einer Vokabelkarte haengt an der Karte selbst (Hash der
// Karten-ID), nicht an ihrer Position in der Warteschlange -- sonst dreht
// "Falsche nochmal" (setzt index auf 0, verschiebt die Paritaeten) die
// Richtung jeder wiederholten Karte. Ueber viele IDs streut ein einfacher
// Zeichen-Hash weiterhin ~50/50, kippt aber nicht alle Karten in dieselbe
// Richtung wie ein reiner id.length % 2 es taete.
function vokabelRichtung(id: string): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h & 1) === 0;
}

export function LernenSession({
  subjectId,
  modus,
  thema,
  pruefung,
  einheit,
}: {
  subjectId: string;
  modus: SessionModus;
  thema: string | null;
  pruefung: string | null;
  einheit: string | null;
}) {
  const toast = useToast();
  const reduce = useReducedMotion();

  const [data, setData] = useState<SubjectDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [queue, setQueue] = useState<StudyCardDTO[] | null>(null);
  const [index, setIndex] = useState(0);
  const [richtig, setRichtig] = useState<StudyCardDTO[]>([]);
  const [falsch, setFalsch] = useState<StudyCardDTO[]>([]);
  const botEnabled = data?.botEnabled ?? false;

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/lernen/${subjectId}`);
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      const detail = (await res.json()) as SubjectDetail;
      setData(detail);

      let auswahl: StudyCardDTO[];
      if (thema) {
        auswahl = detail.cards.filter((c) => (thema === "allgemein" ? c.topicId === null : c.topicId === thema));
      } else if (pruefung) {
        const themenIds = new Set(detail.themen.filter((t) => t.assignmentId === pruefung).map((t) => t.id));
        auswahl = detail.cards.filter((c) => c.topicId !== null && themenIds.has(c.topicId));
      } else {
        auswahl = detail.cards;
      }

      const today = localISO();
      // Probe: Seed aus dem Datum, damit die Reihenfolge pro Tag wechselt,
      // ein Reload am selben Tag aber dieselbe Probe zeigt.
      const seed = Number(today.replace(/-/g, ""));
      setQueue(queueFor(modus, auswahl, today, undefined, seed));
    } catch {
      setFailed(true);
      toast("Die Sitzung konnte nicht geladen werden.");
    }
  }, [subjectId, modus, thema, pruefung, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = queue && index < queue.length ? queue[index] : null;

  // S1: kommt die Sitzung aus dem Plan (Query-Parameter einheit, siehe
  // stunden-cockpit.tsx toggle/lernplan-seite.tsx), hakt sie die Einheit ab,
  // sobald die Warteschlange wirklich durch ist (SessionEnde-Zustand: Queue
  // nicht leer, aber kein current mehr -- jede Karte wurde beantwortet).
  // "Nichts zu lernen" (Queue leer) zaehlt bewusst NICHT, weil dort niemand
  // etwas geuebt hat. Ein Ref haelt fest, ob schon abgehakt wurde, damit
  // "Falsche nochmal" (das erneut in den SessionEnde-Zustand laeuft) keinen
  // zweiten PATCH ausloest -- der Endpunkt waere zwar idempotent (setzt nur
  // erneut doneAt), aber unnoetig.
  //
  // BLOCKIEREND 2: ein fehlgeschlagenes Abhaken darf nicht mehr lautlos
  // verschwinden -- die Karten sind zwar gemacht, aber der Plan zeigt die
  // Einheit dann faelschlich weiter offen, ohne dass der Schueler das je
  // erfaehrt. `abhakenFehler` macht das auf dem Ende-Screen sichtbar, ohne
  // zu blockieren: die Sitzung ist beendet, egal was der Server sagt. Ein
  // Netzwerkfehler (fetch wirft) bekommt genau einen automatischen zweiten
  // Versuch -- oft nur ein kurzer Aussetzer (Tab kam aus dem Hintergrund,
  // Verbindung kurz weg), der beim zweiten Mal durchgeht. Eine Antwort mit
  // 400/404 wuerde beim gleichen Body deterministisch wieder scheitern,
  // dafuer lohnt sich kein Retry.
  const abgehaktRef = useRef(false);
  const [abhakenFehler, setAbhakenFehler] = useState(false);
  useEffect(() => {
    if (!pruefung || !einheit) return;
    if (!queue || queue.length === 0 || current) return;
    if (abgehaktRef.current) return;
    abgehaktRef.current = true;

    async function abhaken(zweiterVersuch: boolean): Promise<void> {
      try {
        const res = await fetch(`/api/lernen/plan/items/${einheit}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ done: true }),
        });
        if (!res.ok) setAbhakenFehler(true);
      } catch {
        if (!zweiterVersuch) {
          await abhaken(true);
          return;
        }
        setAbhakenFehler(true);
      }
    }
    void abhaken(false);
  }, [pruefung, einheit, queue, current]);

  const registerAnswer = useCallback(
    (card: StudyCardDTO, correct: boolean) => {
      setRichtig((prev) => (correct ? [...prev, card] : prev));
      setFalsch((prev) => (correct ? prev : [...prev, card]));
      // Optimistisch: sofort weiter, Fehler nur als Toast.
      fetch(`/api/lernen/karten/${card.id}/antwort`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ correct }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("save failed");
        })
        .catch(() => toast("Die Antwort konnte nicht gespeichert werden."));
    },
    [toast],
  );

  const goNext = useCallback(() => setIndex((i) => i + 1), []);

  const antworten = useCallback(
    (correct: boolean) => {
      if (!current) return;
      registerAnswer(current, correct);
      goNext();
    },
    [current, registerAnswer, goNext],
  );

  function updateCard(updated: StudyCardDTO) {
    setQueue((prev) => (prev ? prev.map((c) => (c.id === updated.id ? updated : c)) : prev));
  }

  function archiveCard(id: string) {
    setQueue((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
  }

  function insertVariante(nachIndex: number, karte: StudyCardDTO) {
    setQueue((prev) => {
      if (!prev) return prev;
      const copy = [...prev];
      copy.splice(nachIndex + 1, 0, karte);
      return copy;
    });
  }

  function nochmalFalsche() {
    setQueue(falsch);
    setFalsch([]);
    setRichtig([]);
    setIndex(0);
  }

  // S7: "Karten üben" fuehrt in eine leere Sitzung, wenn die Karten des
  // Punkts heute schon einmal durchgezogen wurden (queueFor liefert fuer
  // modus=lernen nur die heute faelligen Karten). Legitim ist das genau
  // dann, wenn es fuer heute wirklich nichts mehr zu ueben gibt -- die
  // Einheit bleibt sonst unerreichbar offen, denn von Hand geht das sonst
  // nur ueber die Planseite. Kein Auto-Abhaken (anders als beim echten
  // Sitzungsende oben): der Schueler entscheidet aktiv, weil "leer" auch
  // ein Laden-Fehler sein koennte.
  const [leerAbhaken, setLeerAbhaken] = useState<"idle" | "laeuft" | "fertig" | "fehler">("idle");
  async function leereEinheitAbhaken() {
    if (!einheit || leerAbhaken === "laeuft" || leerAbhaken === "fertig") return;
    setLeerAbhaken("laeuft");
    try {
      const res = await fetch(`/api/lernen/plan/items/${einheit}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      if (!res.ok) throw new Error("abhaken failed");
      setLeerAbhaken("fertig");
    } catch {
      setLeerAbhaken("fehler");
      toast("Die Einheit konnte nicht abgehakt werden.");
    }
  }

  // S4: wer aus dem Plan heraus uebt (Query-Parameter pruefung, siehe
  // lernplan-seite.tsx), soll dorthin zurueckkommen -- sonst landet man auf
  // der Themenseite und muss den Plan ueber zwei Ebenen wiederfinden.
  const backHref = pruefung
    ? `/lernen/${subjectId}/plan/${pruefung}`
    : thema
      ? `/lernen/${subjectId}/themen/${thema}`
      : `/lernen/${subjectId}`;

  if (failed && data === null) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border bg-card px-4 py-6 text-center shadow-card">
          <p className="text-[14px] text-muted-foreground">Das hat nicht geklappt.</p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent"
            onClick={() => void load()}
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  if (data === null || queue === null) {
    return (
      // NIT-Fix: aria-label auf einem <div> ohne Rolle wird von den meisten
      // Screenreadern ignoriert, aria-busy allein wird dort nicht vorgelesen --
      // role="status" macht daraus eine echte Live-Region.
      <div className="mx-auto max-w-2xl space-y-6" role="status" aria-label="Wird geladen" aria-busy="true">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-60 w-full rounded-2xl" />
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
          <p className="text-[15px] font-medium">Nichts zu lernen.</p>
          {einheit && (
            // NIT: "wurden heute schon geuebt" behauptet einen Grund, den der
            // Code nicht kennt -- die Queue ist auch leer, wenn Karten nach
            // Leitner erst spaeter faellig sind, oder wenn topicId null war
            // und die Tagesansicht auf thema=allgemein auswich, das keine
            // Karten dieses Punkts trifft. Nur behaupten, was feststeht:
            // aktuell ist nichts faellig.
            <p className="max-w-xs text-[13px] text-muted-foreground">
              Für diesen Punkt sind aktuell keine Karten fällig.
            </p>
          )}
          {einheit && (
            <button
              type="button"
              // S6: echtes disabled entfernt den Knopf aus dem Fokus, sobald
              // der eigene Klick ihn deaktiviert -- der Browser wirft den
              // Fokus dann auf body (gleiches Muster wie in
              // lernplan-seite.tsx, KopfMenu/Loeschen-Dialog). aria-disabled
              // plus Fruehausstieg im Handler haelt ihn fokussierbar, auch
              // nach "fertig", statt ihn ganz zu entfernen.
              onClick={() => void leereEinheitAbhaken()}
              aria-disabled={leerAbhaken === "laeuft" || leerAbhaken === "fertig"}
              aria-busy={leerAbhaken === "laeuft"}
              className={cn(
                "inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent",
                (leerAbhaken === "laeuft" || leerAbhaken === "fertig") && "opacity-60",
              )}
            >
              {leerAbhaken === "laeuft"
                ? "Markiert …"
                : leerAbhaken === "fertig"
                  ? "Als erledigt markiert"
                  : leerAbhaken === "fehler"
                    ? "Erneut versuchen"
                    : "Einheit als erledigt markieren"}
            </button>
          )}
          {/* Ansage von Erfolg und Fehler statt nur sichtbarer Text --
              gleiches Muster wie die Fortschritts-Live-Region weiter unten.
              Noetig, weil der Toast nach 4s verschwindet und "fehler" sonst
              nur dort lebt. */}
          <p aria-live="polite" className="sr-only">
            {leerAbhaken === "fertig"
              ? "Einheit als erledigt markiert."
              : leerAbhaken === "fehler"
                ? "Die Einheit konnte nicht abgehakt werden."
                : ""}
          </p>
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center justify-center rounded-md px-2 py-1.5 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Zurück
          </Link>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <SessionEnde
        backHref={backHref}
        richtig={richtig.length}
        gesamt={richtig.length + falsch.length}
        falsche={falsch}
        modus={modus}
        onNochmal={nochmalFalsche}
        abhakenFehler={abhakenFehler}
      />
    );
  }

  const themaTitel = thema === "allgemein" ? "Allgemein" : data.themen.find((t) => t.id === thema)?.title;
  const pruefungTitel = pruefung ? data.pruefungen.find((p) => p.id === pruefung)?.title : undefined;
  const kopfLabel =
    modus === "probe" || modus === "schwach" ? MODUS_LABEL[modus] : (themaTitel ?? pruefungTitel ?? data.subject.name);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        {/* S6: sichtbar bleibt der schlanke Link -- die Trefferflaeche zieht
            das before-Pseudo-Element nur vertikal auf, darunter steht (dank
            space-y-4 am Container) genug Platz bis zum Fortschrittsbalken,
            der selbst nicht antippbar ist. */}
        <Link
          href={backHref}
          className="relative inline-flex items-center gap-1 rounded-md py-1 text-[13px] text-muted-foreground transition-colors before:absolute before:-inset-y-2.5 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          {kopfLabel}
        </Link>
        <span aria-hidden className="tabular-nums text-[13px] text-muted-foreground">
          {index + 1} von {queue.length}
        </span>
      </div>

      {/* BLOCKIEREND 2: eigene Live-Region wie Fortschritt() in
          lernplan-erstellen.tsx -- Aenderungen an aria-valuenow/-text allein
          loesen keine Ansage aus, ein echter Textwechsel schon. */}
      <p aria-live="polite" className="sr-only">
        Karte {index + 1} von {queue.length}
      </p>
      <div
        className="h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Fortschritt der Sitzung"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={queue.length}
        aria-valuetext={`${index + 1} von ${queue.length}`}
      >
        <div
          className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-200"
          style={{ transform: `scaleX(${(index + 1) / queue.length})` }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: EASE }}
        >
          <SessionKarte
            card={current}
            subjectId={subjectId}
            botEnabled={botEnabled}
            toast={toast}
            onAntworten={antworten}
            onGraded={(correct) => registerAnswer(current, correct)}
            onWeiter={goNext}
            onUpdated={updateCard}
            onArchived={() => archiveCard(current.id)}
            onVariante={(karte) => insertVariante(index, karte)}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// --- Eine Karte, je nach Art -------------------------------------------------

function SessionKarte({
  card,
  subjectId,
  botEnabled,
  toast,
  onAntworten,
  onGraded,
  onWeiter,
  onUpdated,
  onArchived,
  onVariante,
}: {
  card: StudyCardDTO;
  subjectId: string;
  botEnabled: boolean;
  toast: (message: string, variant?: "error" | "success") => void;
  onAntworten: (correct: boolean) => void;
  onGraded: (correct: boolean) => void;
  onWeiter: () => void;
  onUpdated: (card: StudyCardDTO) => void;
  onArchived: () => void;
  onVariante: (card: StudyCardDTO) => void;
}) {
  const router = useRouter();
  const [showAnswer, setShowAnswer] = useState(false);
  const [vokabelPhase, setVokabelPhase] = useState<"eingabe" | "richtig" | "manuell">("eingabe");
  const [vokabelValue, setVokabelValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(card.question);
  const [answer, setAnswer] = useState(card.answer);
  const [savingEdit, setSavingEdit] = useState(false);
  const [speichernVersucht, setSpeichernVersucht] = useState(false);
  const [erklaerung, setErklaerung] = useState("");
  const [erklaerLoading, setErklaerLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [varianteLoading, setVarianteLoading] = useState(false);
  // Prüfen-Feld freier Antworten (nur wissen/aufgabe, solange die Antwort
  // verborgen ist und der Bot an ist). Zurückgesetzt bei Kartenwechsel, weil
  // SessionKarte je Karte über den motion.div-key neu gemountet wird.
  const [pruefenAntwort, setPruefenAntwort] = useState("");
  const [pruefenLoading, setPruefenLoading] = useState(false);
  const [pruefenErgebnis, setPruefenErgebnis] = useState<PruefenErgebnis | null>(null);
  const vokabelRef = useRef<HTMLInputElement | null>(null);
  const kartenRef = useRef<HTMLDivElement | null>(null);
  const editContainerRef = useRef<HTMLDivElement | null>(null);
  const bearbeitenRef = useRef<HTMLButtonElement | null>(null);
  const wasEditingRef = useRef(false);

  const geklaert = card.kind === "vokabel" ? vokabelPhase !== "eingabe" : showAnswer;
  // Vorbelegung "Gewusst"/"Nicht gewusst" aus dem Urteil; ohne Urteil (noch
  // nicht geprüft oder Prüfen fehlgeschlagen) keine Vorbelegung.
  const vorbelegung = pruefenErgebnis ? pruefenErgebnis.urteil === "richtig" : null;
  const tutorHref = `/lernen/${subjectId}/tutor?thema=${card.topicId ?? ""}&karte=${card.id}`;
  const tutorEnabled = botEnabled && card.topicId !== null;
  const tutorTitle = !botEnabled
    ? "Der Bot ist nicht eingerichtet."
    : card.topicId === null
      ? "Ohne Thema kein Tutor."
      : undefined;

  // BLOCKIEREND 2: SessionKarte wird je Karte ueber den motion.div-key
  // (key={current.id} in LernenSession) komplett neu gemountet -- dieser
  // Effekt laeuft also bei jedem Kartenwechsel, nicht nur beim Erstmount.
  // Vokabelkarten bekommen das Eingabefeld fokussiert (dort tippt man direkt
  // weiter), alle anderen Kartenarten den Kartenrahmen selbst -- sonst faellt
  // der Fokus auf body, sobald der zuletzt geklickte Knopf mit der alten
  // Karte verschwindet, und Tab muesste sich ab der Seitenleiste neu
  // durcharbeiten. fokussiereSichtbar scrollt das Ziel zusaetzlich ins Bild.
  useEffect(() => {
    if (card.kind === "vokabel") fokussiereSichtbar(vokabelRef.current);
    else fokussiereSichtbar(kartenRef.current);
  }, [card.kind]);

  // BLOCKIEREND 2: der Bearbeiten-Modus (editing) ersetzt die ganze Karte
  // durch einen eigenen Baum -- der ausloesende Knopf verschwindet dabei
  // spurlos, ohne dieses Ziel faellt der Fokus auf body. Beim Oeffnen wird
  // der neue Container fokussiert (gleiches Muster wie oben), beim
  // Schliessen (Speichern oder Escape) kommt der Fokus zurueck auf den
  // Bearbeiten-Knopf -- wasEditingRef haelt fest, dass es sich um ein
  // echtes Schliessen handelt, nicht um den Erstmount mit editing=false.
  useEffect(() => {
    if (editing) {
      fokussiereSichtbar(editContainerRef.current);
      wasEditingRef.current = true;
    } else if (wasEditingRef.current) {
      wasEditingRef.current = false;
      fokussiereSichtbar(bearbeitenRef.current ?? kartenRef.current);
    }
  }, [editing]);

  async function speichereEdit() {
    const q = question.trim();
    if (!q || savingEdit) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/lernen/karten/${card.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, answer }),
      });
      const body = (await res.json().catch(() => null)) as { card?: StudyCardDTO; error?: string } | null;
      if (!res.ok || !body?.card) {
        toast(body?.error ?? "Die Karte konnte nicht gespeichert werden.");
        return;
      }
      onUpdated(body.card);
      setEditing(false);
    } catch {
      toast("Die Karte konnte nicht gespeichert werden.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function archivieren() {
    if (archiving) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/lernen/karten/${card.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archivedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error("archive failed");
      onArchived();
    } catch {
      toast("Die Karte konnte nicht archiviert werden.");
      setArchiving(false);
    }
  }

  async function erklaeren() {
    if (erklaerLoading) return;
    setErklaerLoading(true);
    setErklaerung("");
    try {
      const res = await fetch(`/api/lernen/karten/${card.id}/erklaeren`, { method: "POST" });
      if (res.status === 503) {
        toast("Der Bot ist nicht eingerichtet.");
        return;
      }
      if (!res.ok || !res.body) throw new Error("explain failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setErklaerung((t) => t + decoder.decode(value, { stream: true }));
      }
    } catch {
      toast("Die Erklärung konnte nicht geladen werden.");
    } finally {
      setErklaerLoading(false);
    }
  }

  // Prüft die eingetippte Antwort über den Tutor-Endpunkt. Leer abschicken
  // zeigt nur die Lösung, wie der bestehende Knopf -- keine Bewertung. Bei
  // Fehler (Netz, 502, Timeout) wird die Antwort trotzdem aufgedeckt, aber
  // ohne Vorbelegung.
  async function pruefen() {
    if (pruefenLoading) return;
    const antwort = pruefenAntwort.trim();
    if (!antwort) {
      setShowAnswer(true);
      return;
    }
    setPruefenLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PRUEFEN_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/lernen/karten/${card.id}/bewerten`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ antwort }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as
        | { urteil?: Urteil; feedback?: string; error?: string }
        | null;
      if (!res.ok || !body?.urteil) {
        toast(body?.error ?? "Die Antwort konnte nicht geprüft werden.");
        setShowAnswer(true);
        return;
      }
      setPruefenErgebnis({ urteil: body.urteil, feedback: body.feedback ?? "" });
      setShowAnswer(true);
    } catch (err) {
      toast(
        err instanceof DOMException && err.name === "AbortError"
          ? "Die Prüfung hat zu lange gedauert."
          : "Die Antwort konnte nicht geprüft werden.",
      );
      setShowAnswer(true);
    } finally {
      clearTimeout(timer);
      setPruefenLoading(false);
    }
  }

  async function aehnlicheAufgabe() {
    if (varianteLoading) return;
    setVarianteLoading(true);
    try {
      const res = await fetch(`/api/lernen/karten/${card.id}/variante`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { card?: StudyCardDTO; error?: string } | null;
      if (!res.ok || !body?.card) {
        toast(body?.error ?? "Es konnte keine ähnliche Aufgabe erzeugt werden.");
        return;
      }
      onVariante(body.card);
      toast("Ähnliche Aufgabe eingefügt", "success");
    } catch {
      toast("Es konnte keine ähnliche Aufgabe erzeugt werden.");
    } finally {
      setVarianteLoading(false);
    }
  }

  const richtung = vokabelRichtung(card.id);

  function pruefeVokabel() {
    const eingabe = vokabelValue.trim();
    if (!eingabe) {
      setVokabelPhase("manuell");
      return;
    }
    const loesung = richtung ? card.answer : card.question;
    if (vokabelStimmt(eingabe, loesung)) {
      onGraded(true);
      setVokabelPhase("richtig");
    } else {
      setVokabelPhase("manuell");
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing) {
        if (e.key === "Escape") setEditing(false);
        return;
      }
      if (
        e.target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA"].includes(e.target.tagName) || e.target.isContentEditable)
      )
        return;
      // BLOCKIEREND 1: ein fokussierter Knopf (z.B. per Tab auf "Gewusst")
      // aktiviert sich bei Enter/Leertaste bereits selbst ueber sein eigenes
      // onClick -- ohne diese Sperre feuert HIER zusaetzlich derselbe
      // onAntworten()/setShowAnswer() ein zweites Mal, springt der Index um
      // zwei und eine Karte wird uebersprungen. Andere Tasten (1/2/e/t) lesen
      // Knoepfe nicht nativ, die duerfen weiterhin durch.
      if (
        e.target instanceof HTMLElement &&
        e.target.tagName === "BUTTON" &&
        (e.key === "Enter" || e.key === " ")
      )
        return;
      if (card.kind === "vokabel") {
        // Nach dem Pruefen ist das Eingabefeld weg: 1/2 bewerten wie bei den
        // anderen Karten, Enter uebernimmt der automatisch fokussierte Knopf.
        if (vokabelPhase === "manuell" && e.key === "1") onAntworten(false);
        if (vokabelPhase === "manuell" && e.key === "2") onAntworten(true);
        if (vokabelPhase === "richtig" && e.key === "2") onWeiter();
      } else if (card.kind === "wissen") {
        if (!showAnswer && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          setShowAnswer(true);
          return;
        }
        if (showAnswer && vorbelegung !== null && e.key === "Enter") {
          e.preventDefault();
          onAntworten(vorbelegung);
          return;
        }
        if (showAnswer && e.key === "1") onAntworten(false);
        if (showAnswer && e.key === "2") onAntworten(true);
      } else if (card.kind === "aufgabe") {
        if (!showAnswer && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          setShowAnswer(true);
          return;
        }
        if (showAnswer && vorbelegung !== null && e.key === "Enter") {
          e.preventDefault();
          onAntworten(vorbelegung);
          return;
        }
        if (showAnswer && e.key === "1") onAntworten(false);
        if (showAnswer && e.key === "2") onAntworten(true);
      }
      if (geklaert && e.key === "e") void erklaeren();
      if (tutorEnabled && (e.key === "t" || e.key === "T")) router.push(tutorHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAnswer, editing, geklaert, card.kind, vokabelPhase, vorbelegung, tutorEnabled, tutorHref]);

  if (editing) {
    return (
      // BLOCKIEREND 2: tabIndex={-1} macht den Container zum Fokus-Ziel beim
      // Oeffnen (siehe Effekt oben), ohne ihn in die normale Tab-Reihenfolge
      // aufzunehmen.
      <div
        ref={editContainerRef}
        tabIndex={-1}
        className="min-h-[240px] rounded-2xl border bg-card p-6 shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="space-y-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            aria-label="Frage"
            className="w-full resize-none rounded-md border border-border-control bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            aria-label="Antwort"
            className="w-full resize-none rounded-md border border-border-control bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {/* S5: ein leeres Frage-Feld darf den Speichern-Knopf nicht wortlos
              sperren -- aria-disabled plus Fruehausstieg im Handler statt
              disabled, dazu ein sichtbarer Grund nach dem ersten Versuch
              (gleiches Muster wie lernplan-erstellen.tsx lesenVersucht). */}
          {!question.trim() && speichernVersucht && (
            <p id="speichern-hinweis" className="text-[12.5px] text-destructive">
              Die Frage darf nicht leer sein.
            </p>
          )}
          <div className="flex justify-end gap-2">
            {/* B1: echtes disabled reisst den Fokus auf body, sobald der
                eigene Klick den Knopf deaktiviert -- aria-disabled plus
                Fruehausstieg im Handler haelt ihn fokussierbar. */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (savingEdit) return;
                setEditing(false);
              }}
              aria-disabled={savingEdit}
              className={cn(savingEdit && "opacity-60")}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (savingEdit) return;
                if (!question.trim()) {
                  setSpeichernVersucht(true);
                  return;
                }
                void speichereEdit();
              }}
              aria-disabled={savingEdit || !question.trim()}
              aria-busy={savingEdit}
              aria-describedby={!question.trim() && speichernVersucht ? "speichern-hinweis" : undefined}
              className={cn((savingEdit || !question.trim()) && "opacity-60")}
            >
              {savingEdit ? "Speichert …" : "Speichern"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={kartenRef}
      tabIndex={-1}
      className="min-h-[240px] rounded-2xl border bg-card p-6 shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {card.kind === "vokabel" ? (
        <VokabelKarte
          card={card}
          richtung={richtung}
          phase={vokabelPhase}
          value={vokabelValue}
          onValueChange={setVokabelValue}
          onPruefen={pruefeVokabel}
          inputRef={vokabelRef}
          onWeiter={onWeiter}
          onManuell={(correct) => onAntworten(correct)}
        />
      ) : card.kind === "aufgabe" ? (
        <AufgabeKarte
          card={card}
          gezeigt={showAnswer}
          onZeigen={() => setShowAnswer(true)}
          onAntworten={onAntworten}
          onAehnliche={() => void aehnlicheAufgabe()}
          varianteLoading={varianteLoading}
          botEnabled={botEnabled}
          pruefenAntwort={pruefenAntwort}
          onPruefenAntwortChange={setPruefenAntwort}
          onPruefen={() => void pruefen()}
          pruefenLoading={pruefenLoading}
          pruefenErgebnis={pruefenErgebnis}
          vorbelegung={vorbelegung}
        />
      ) : (
        <WissenKarte
          card={card}
          gezeigt={showAnswer}
          onZeigen={() => setShowAnswer(true)}
          onAntworten={onAntworten}
          botEnabled={botEnabled}
          pruefenAntwort={pruefenAntwort}
          onPruefenAntwortChange={setPruefenAntwort}
          onPruefen={() => void pruefen()}
          pruefenLoading={pruefenLoading}
          pruefenErgebnis={pruefenErgebnis}
          vorbelegung={vorbelegung}
        />
      )}

      {geklaert && (
        <div className="mt-4 border-t pt-3">
          {erklaerung && (
            <p className="mb-2 whitespace-pre-wrap text-[13.5px] text-muted-foreground">{erklaerung}</p>
          )}
          {/* S6: sichtbar bleiben die schlanken Knoepfe (px-1 py-2) -- die
              reale Trefferflaeche zieht das before-Pseudo-Element (wie
              subject-notes.tsx Ansicht-Umschalter) per -inset-y auf >=44px
              Hoehe hoch, ohne die Breite anzufassen (die reicht bei jedem
              Label hier schon von selbst). gap-y-5 (20px) haelt zwei
              wrappende Zeilen auseinander, damit sich die um je 8px nach oben
              und unten aufgeblaehten Flaechen (16px zusammen) nicht
              ueberlappen -- 20px Abstand lassen 4px Luft. Horizontal bleibt
              es bei gap-x-3, ohne zusaetzlichen Seiten-Inset gibt es dort
              nichts, das kollidieren koennte.
              "Archivieren" nimmt als einzige der vier Aktionen etwas weg
              (die Karte verschwindet aus der Warteschlange) -- ml-auto
              schiebt sie sichtbar von den drei neutralen Aktionen weg, statt
              gleichrangig direkt daneben zu stehen. */}
          <div className="flex flex-wrap gap-x-3 gap-y-5 text-[12.5px]">
            {/* B1: erklaeren() sperrt sich intern selbst bereits gegen
                Doppelklicks -- aria-disabled statt disabled haelt den Knopf
                trotz Ladezustand fokussierbar. */}
            <button
              type="button"
              onClick={() => void erklaeren()}
              aria-disabled={erklaerLoading}
              aria-busy={erklaerLoading}
              className={cn(
                "relative rounded-md px-1 py-2 font-medium leading-[1.2] text-muted-foreground underline-offset-2 before:absolute before:-inset-y-2 before:content-[''] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                erklaerLoading && "opacity-50",
              )}
            >
              {erklaerLoading ? "Erklärt …" : "Erklären"}
            </button>
            {tutorEnabled ? (
              <Link
                href={tutorHref}
                className="relative rounded-md px-1 py-2 font-medium leading-[1.2] text-muted-foreground underline-offset-2 before:absolute before:-inset-y-2 before:content-[''] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Tutor fragen
              </Link>
            ) : (
              <button
                type="button"
                disabled
                title={tutorTitle}
                className="relative cursor-not-allowed rounded-md px-1 py-2 font-medium leading-[1.2] text-muted-foreground/50 before:absolute before:-inset-y-2 before:content-['']"
              >
                Tutor fragen
              </button>
            )}
            <button
              ref={bearbeitenRef}
              type="button"
              onClick={() => setEditing(true)}
              className="relative rounded-md px-1 py-2 font-medium leading-[1.2] text-muted-foreground underline-offset-2 before:absolute before:-inset-y-2 before:content-[''] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Bearbeiten
            </button>
            {/* B1: archivieren() sperrt sich intern selbst bereits gegen
                Doppelklicks -- aria-disabled statt disabled haelt den Knopf
                trotz Ladezustand fokussierbar. */}
            <button
              type="button"
              onClick={() => void archivieren()}
              aria-disabled={archiving}
              aria-busy={archiving}
              className={cn(
                "relative ml-auto rounded-md px-1 py-2 font-medium leading-[1.2] text-muted-foreground underline-offset-2 before:absolute before:-inset-y-2 before:content-[''] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                archiving && "opacity-50",
              )}
            >
              {archiving ? "Archiviert …" : "Archivieren"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WissenKarte({
  card,
  gezeigt,
  onZeigen,
  onAntworten,
  botEnabled,
  pruefenAntwort,
  onPruefenAntwortChange,
  onPruefen,
  pruefenLoading,
  pruefenErgebnis,
  vorbelegung,
}: {
  card: StudyCardDTO;
  gezeigt: boolean;
  onZeigen: () => void;
  onAntworten: (correct: boolean) => void;
  botEnabled: boolean;
  pruefenAntwort: string;
  onPruefenAntwortChange: (v: string) => void;
  onPruefen: () => void;
  pruefenLoading: boolean;
  pruefenErgebnis: PruefenErgebnis | null;
  vorbelegung: boolean | null;
}) {
  return (
    <>
      <p className="text-balance text-lg font-medium sm:text-xl">{card.question}</p>
      {gezeigt && (
        <>
          {pruefenErgebnis && (
            <div className="mt-4 flex items-start gap-2 border-t pt-4">
              <UrteilBadge urteil={pruefenErgebnis.urteil} />
              {pruefenErgebnis.feedback && (
                <p className="text-[13.5px] text-muted-foreground">{pruefenErgebnis.feedback}</p>
              )}
            </div>
          )}
          <div
            className={cn(
              "whitespace-pre-wrap pt-4 text-[15px] text-muted-foreground",
              !pruefenErgebnis && "mt-4 border-t",
            )}
          >
            {card.answer || "Keine Antwort hinterlegt."}
          </div>
        </>
      )}
      <div className="mt-6">
        {!gezeigt && botEnabled ? (
          <PruefenFeld
            value={pruefenAntwort}
            onChange={onPruefenAntwortChange}
            onPruefen={onPruefen}
            onZeigen={onZeigen}
            loading={pruefenLoading}
            zeigenLabel="Antwort zeigen"
          />
        ) : !gezeigt ? (
          <Button type="button" className="h-11 w-full" onClick={onZeigen}>
            Antwort zeigen
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={vorbelegung === false ? "default" : "outline"}
              className="h-11"
              onClick={() => onAntworten(false)}
            >
              Nicht gewusst
            </Button>
            <Button
              type="button"
              variant={vorbelegung === true ? "default" : "outline"}
              className="h-11"
              onClick={() => onAntworten(true)}
            >
              Gewusst
            </Button>
          </div>
        )}
      </div>
      <p className="mt-3 hidden text-center text-[12px] text-muted-foreground sm:block">
        Leertaste zeigt die Antwort · danach 1 nicht gewusst · 2 gewusst · e erklärt · t Tutor fragen
      </p>
    </>
  );
}

function AufgabeKarte({
  card,
  gezeigt,
  onZeigen,
  onAntworten,
  onAehnliche,
  varianteLoading,
  botEnabled,
  pruefenAntwort,
  onPruefenAntwortChange,
  onPruefen,
  pruefenLoading,
  pruefenErgebnis,
  vorbelegung,
}: {
  card: StudyCardDTO;
  gezeigt: boolean;
  onZeigen: () => void;
  onAntworten: (correct: boolean) => void;
  onAehnliche: () => void;
  varianteLoading: boolean;
  botEnabled: boolean;
  pruefenAntwort: string;
  onPruefenAntwortChange: (v: string) => void;
  onPruefen: () => void;
  pruefenLoading: boolean;
  pruefenErgebnis: PruefenErgebnis | null;
  vorbelegung: boolean | null;
}) {
  return (
    <>
      <p className="text-balance text-lg font-medium sm:text-xl">{card.question}</p>
      {!gezeigt && <p className="mt-2 text-[13px] text-muted-foreground">Rechne auf Papier.</p>}
      {gezeigt && (
        <>
          {pruefenErgebnis && (
            <div className="mt-4 flex items-start gap-2 border-t pt-4">
              <UrteilBadge urteil={pruefenErgebnis.urteil} />
              {pruefenErgebnis.feedback && (
                <p className="text-[13.5px] text-muted-foreground">{pruefenErgebnis.feedback}</p>
              )}
            </div>
          )}
          <div
            className={cn(PROSE, "pt-4", !pruefenErgebnis && "mt-4 border-t")}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(card.answer || "Kein Lösungsweg hinterlegt.") }}
          />
        </>
      )}
      <div className="mt-6 space-y-2">
        {!gezeigt && botEnabled ? (
          <PruefenFeld
            value={pruefenAntwort}
            onChange={onPruefenAntwortChange}
            onPruefen={onPruefen}
            onZeigen={onZeigen}
            loading={pruefenLoading}
            zeigenLabel="Lösung zeigen"
          />
        ) : !gezeigt ? (
          <Button type="button" className="h-11 w-full" onClick={onZeigen}>
            Lösung zeigen
          </Button>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={vorbelegung === false ? "default" : "outline"}
                className="h-11"
                onClick={() => onAntworten(false)}
              >
                Nicht gelöst
              </Button>
              <Button
                type="button"
                variant={vorbelegung === true ? "default" : "outline"}
                className="h-11"
                onClick={() => onAntworten(true)}
              >
                Gelöst
              </Button>
            </div>
            {/* B1: aehnlicheAufgabe() sperrt sich intern selbst bereits gegen
                Doppelklicks -- aria-disabled statt disabled haelt den Knopf
                trotz Ladezustand fokussierbar. */}
            <Button
              type="button"
              variant="ghost"
              className={cn("h-11 w-full", varianteLoading && "opacity-60")}
              onClick={onAehnliche}
              aria-disabled={varianteLoading}
              aria-busy={varianteLoading}
            >
              {varianteLoading ? "Erzeugt …" : "Ähnliche Aufgabe"}
            </Button>
          </>
        )}
      </div>
      <p className="mt-3 hidden text-center text-[12px] text-muted-foreground sm:block">
        Leertaste zeigt die Lösung · danach 1 nicht gelöst · 2 gelöst · e erklärt · t Tutor fragen
      </p>
    </>
  );
}

// Textarea "Deine Antwort" plus "Prüfen" (Cmd/Ctrl+Enter sendet) fuer wissen/
// aufgabe, solange die Antwort verborgen ist und der Bot an ist. Leer
// abschicken zeigt nur die Loesung (siehe pruefen() in SessionKarte).
function PruefenFeld({
  value,
  onChange,
  onPruefen,
  onZeigen,
  loading,
  zeigenLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onPruefen: () => void;
  onZeigen: () => void;
  loading: boolean;
  zeigenLabel: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor="pruefen-antwort" className="sr-only">
        Deine Antwort
      </label>
      <textarea
        id="pruefen-antwort"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onPruefen();
          }
        }}
        rows={3}
        placeholder="Deine Antwort"
        // B1: das Feld bleibt waehrend des Pruefens tippbar -- ein echtes
        // disabled wuerde es aus dem Fokus reissen, sobald der eigene
        // Cmd/Ctrl+Enter-Absenden es sperrt.
        className="w-full resize-none rounded-md border border-border-control bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="grid grid-cols-2 gap-2">
        {/* B1: onZeigen kennt keinen eigenen Ladeschutz -- Fruehausstieg hier
            statt disabled, damit der Knopf waehrend des Pruefens fokussierbar
            bleibt. */}
        <Button
          type="button"
          variant="outline"
          className={cn("h-11", loading && "opacity-60")}
          onClick={() => {
            if (loading) return;
            onZeigen();
          }}
          aria-disabled={loading}
        >
          {zeigenLabel}
        </Button>
        {/* S9: im Ladezustand war der einzige Inhalt ein aria-hidden Spinner
            -- ein Screenreader liest dann nur "Schaltflaeche" ohne Namen.
            aria-label haelt den Namen waehrend des Ladens fest.
            B1: onPruefen (pruefen()) sperrt sich intern selbst bereits gegen
            Doppelklicks -- aria-disabled statt disabled haelt den Knopf
            fokussierbar. */}
        <Button
          type="button"
          className={cn("h-11", loading && "opacity-60")}
          onClick={onPruefen}
          aria-disabled={loading}
          aria-busy={loading}
          aria-label={loading ? "Prüft …" : undefined}
        >
          {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : "Prüfen"}
        </Button>
      </div>
    </div>
  );
}

const URTEIL_STYLE: Record<Urteil, string> = {
  richtig: "border-green-600/30 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:text-green-400",
  teilweise: "border-yellow-600/30 bg-yellow-600/10 text-yellow-700 dark:border-yellow-500/30 dark:text-yellow-400",
  falsch: "border-red-600/30 bg-red-600/10 text-red-700 dark:border-red-500/30 dark:text-red-400",
};

const URTEIL_LABEL: Record<Urteil, string> = {
  richtig: "Richtig",
  teilweise: "Teilweise",
  falsch: "Falsch",
};

function UrteilBadge({ urteil }: { urteil: Urteil }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium",
        URTEIL_STYLE[urteil],
      )}
    >
      {URTEIL_LABEL[urteil]}
    </span>
  );
}

function VokabelKarte({
  card,
  richtung,
  phase,
  value,
  onValueChange,
  onPruefen,
  inputRef,
  onWeiter,
  onManuell,
}: {
  card: StudyCardDTO;
  richtung: boolean;
  phase: "eingabe" | "richtig" | "manuell";
  value: string;
  onValueChange: (v: string) => void;
  onPruefen: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onWeiter: () => void;
  onManuell: (correct: boolean) => void;
}) {
  const frage = richtung ? card.question : card.answer;
  const loesung = richtung ? card.answer : card.question;

  return (
    <>
      <p className="text-balance text-lg font-medium sm:text-xl">{frage}</p>

      {phase === "eingabe" && (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            onPruefen();
          }}
        >
          <label htmlFor="vokabel-antwort" className="sr-only">
            Antwort eintippen
          </label>
          <input
            ref={inputRef}
            id="vokabel-antwort"
            type="text"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-md border border-border-control bg-background px-3 py-2.5 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Antwort eintippen"
          />
          <Button type="submit" className="mt-3 h-11 w-full">
            Prüfen
          </Button>
        </form>
      )}

      {phase === "richtig" && (
        <div className="mt-6">
          <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2.5 text-[15px] font-medium text-primary">
            Richtig
          </p>
          <Button type="button" autoFocus className="mt-3 h-11 w-full" onClick={onWeiter}>
            Weiter
          </Button>
        </div>
      )}

      {phase === "manuell" && (
        <div className="mt-6">
          <p className="rounded-md border bg-muted/50 px-3 py-2.5 text-[15px]">
            Lösung: <span className="font-medium">{loesung}</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={() => onManuell(false)}>
              Falsch
            </Button>
            <Button type="button" autoFocus className="h-11" onClick={() => onManuell(true)}>
              War richtig
            </Button>
          </div>
        </div>
      )}
      <p className="mt-3 hidden text-center text-[12px] text-muted-foreground sm:block">
        Enter prüft · danach 1 falsch · 2 richtig · e erklärt
      </p>
    </>
  );
}

// --- Ende der Sitzung ---------------------------------------------------------

function SessionEnde({
  backHref,
  richtig,
  gesamt,
  falsche,
  modus,
  onNochmal,
  abhakenFehler,
}: {
  backHref: string;
  richtig: number;
  gesamt: number;
  falsche: StudyCardDTO[];
  modus: SessionModus;
  onNochmal: () => void;
  abhakenFehler: boolean;
}) {
  const bereit = gesamt > 0 ? Math.round((richtig / gesamt) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-12 text-center shadow-card">
        {/* BLOCKIEREND 2: die Karten sind in jedem Fall gemacht (die
            Sitzung blockiert dafuer nicht), aber ohne diesen Hinweis
            erfaehrt niemand, dass der Plan die Einheit weiter offen zeigt. */}
        {abhakenFehler && (
          <p className="max-w-sm text-[13px] text-muted-foreground">
            Die Einheit konnte nicht abgehakt werden. Bitte im Plan von Hand abhaken.
          </p>
        )}
        {modus === "probe" ? (
          <div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{bereit} % bereit</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {richtig} von {gesamt} gewusst
            </p>
          </div>
        ) : (
          <p className="text-lg font-medium tabular-nums">
            {richtig} von {gesamt} gewusst
          </p>
        )}

        {falsche.length > 0 && (
          <details className="w-full max-w-sm text-left">
            <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground">
              Nochmal anschauen
            </summary>
            <ul className="mt-2 space-y-1 text-[13px] text-muted-foreground">
              {falsche.slice(0, 8).map((c) => (
                <li key={c.id} className="truncate">
                  {c.question}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Ein Hauptknopf: solange Falsche uebrig sind, ist "nochmal" der
            naechste Schritt, sonst "Fertig". Die Uebersicht erreicht man
            ueber die Navigation, dafuer braucht es hier keinen dritten Weg. */}
        <div className="flex flex-col items-center gap-2">
          {falsche.length > 0 ? (
            <>
              <Button type="button" className="h-11" onClick={onNochmal}>
                Falsche nochmal
              </Button>
              <Link
                href={backHref}
                className="rounded-md px-1 py-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Fertig für heute
              </Link>
            </>
          ) : (
            <Link href={backHref} className={cn(buttonVariants({ size: "default" }), "h-11")}>
              Fertig
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
