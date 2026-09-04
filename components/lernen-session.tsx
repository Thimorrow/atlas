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

const EASE = [0.22, 1, 0.36, 1] as const;

const MODUS_LABEL: Record<Exclude<SessionModus, "lernen">, string> = {
  schwach: "Schwache",
  probe: "Probe",
};

export function LernenSession({
  subjectId,
  modus,
  thema,
  pruefung,
}: {
  subjectId: string;
  modus: SessionModus;
  thema: string | null;
  pruefung: string | null;
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

  const backHref = thema ? `/lernen/${subjectId}/themen/${thema}` : `/lernen/${subjectId}`;

  if (failed && data === null) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border bg-card px-4 py-6 text-center shadow-card">
          <p className="text-[14px] text-muted-foreground">Das hat nicht geklappt.</p>
          <button
            type="button"
            className="mt-3 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent"
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
      <div className="mx-auto max-w-2xl space-y-6" aria-label="Wird geladen" aria-busy="true">
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
          <Link
            href={backHref}
            className="rounded-md px-2 py-1.5 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Zurueck
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
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 rounded-md py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          {kopfLabel}
        </Link>
        <span className="tabular-nums text-[13px] text-muted-foreground">
          {index + 1} von {queue.length}
        </span>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-200"
          style={{ transform: `scaleX(${index / queue.length})` }}
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
            index={index}
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
  index,
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
  index: number;
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
  const [erklaerung, setErklaerung] = useState("");
  const [erklaerLoading, setErklaerLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [varianteLoading, setVarianteLoading] = useState(false);
  // Pruefen-Feld freier Antworten (nur wissen/aufgabe, solange die Antwort
  // verborgen ist und der Bot an ist). Zurueckgesetzt bei Kartenwechsel, weil
  // SessionKarte je Karte ueber den motion.div-key neu gemountet wird.
  const [pruefenAntwort, setPruefenAntwort] = useState("");
  const [pruefenLoading, setPruefenLoading] = useState(false);
  const [pruefenErgebnis, setPruefenErgebnis] = useState<PruefenErgebnis | null>(null);
  const vokabelRef = useRef<HTMLInputElement | null>(null);

  const geklaert = card.kind === "vokabel" ? vokabelPhase !== "eingabe" : showAnswer;
  // Vorbelegung "Gewusst"/"Nicht gewusst" aus dem Urteil; ohne Urteil (noch
  // nicht geprueft oder Pruefen fehlgeschlagen) keine Vorbelegung.
  const vorbelegung = pruefenErgebnis ? pruefenErgebnis.urteil === "richtig" : null;
  const tutorHref = `/lernen/${subjectId}/tutor?thema=${card.topicId ?? ""}&karte=${card.id}`;
  const tutorEnabled = botEnabled && card.topicId !== null;
  const tutorTitle = !botEnabled
    ? "Der Bot ist nicht eingerichtet."
    : card.topicId === null
      ? "Ohne Thema kein Tutor."
      : undefined;

  useEffect(() => {
    if (card.kind === "vokabel") vokabelRef.current?.focus();
  }, [card.kind]);

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
      toast("Die Erklaerung konnte nicht geladen werden.");
    } finally {
      setErklaerLoading(false);
    }
  }

  // Prueft die eingetippte Antwort ueber den Tutor-Endpunkt. Leer abschicken
  // zeigt nur die Loesung, wie der bestehende Knopf -- keine Bewertung. Bei
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
        toast(body?.error ?? "Die Antwort konnte nicht geprueft werden.");
        setShowAnswer(true);
        return;
      }
      setPruefenErgebnis({ urteil: body.urteil, feedback: body.feedback ?? "" });
      setShowAnswer(true);
    } catch (err) {
      toast(
        err instanceof DOMException && err.name === "AbortError"
          ? "Die Pruefung hat zu lange gedauert."
          : "Die Antwort konnte nicht geprueft werden.",
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
        toast(body?.error ?? "Es konnte keine aehnliche Aufgabe erzeugt werden.");
        return;
      }
      onVariante(body.card);
      toast("Aehnliche Aufgabe eingefuegt", "success");
    } catch {
      toast("Es konnte keine aehnliche Aufgabe erzeugt werden.");
    } finally {
      setVarianteLoading(false);
    }
  }

  function pruefeVokabel() {
    const eingabe = vokabelValue.trim();
    if (!eingabe) {
      setVokabelPhase("manuell");
      return;
    }
    const loesung = index % 2 === 0 ? card.answer : card.question;
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
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
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
      <div className="min-h-[240px] rounded-2xl border bg-card p-6 shadow-card">
        <div className="space-y-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            aria-label="Frage"
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            aria-label="Antwort"
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={savingEdit}>
              Abbrechen
            </Button>
            <Button type="button" onClick={() => void speichereEdit()} disabled={savingEdit || !question.trim()}>
              {savingEdit ? "Speichert …" : "Speichern"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[240px] rounded-2xl border bg-card p-6 shadow-card">
      {card.kind === "vokabel" ? (
        <VokabelKarte
          card={card}
          index={index}
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
          <div className="flex flex-wrap gap-3 text-[12.5px]">
            <button
              type="button"
              onClick={() => void erklaeren()}
              disabled={erklaerLoading}
              className="rounded-md px-1 py-1 font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {erklaerLoading ? "Erklaert …" : "Erklaeren"}
            </button>
            {tutorEnabled ? (
              <Link
                href={tutorHref}
                className="rounded-md px-1 py-1 font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Tutor fragen
              </Link>
            ) : (
              <button
                type="button"
                disabled
                title={tutorTitle}
                className="cursor-not-allowed rounded-md px-1 py-1 font-medium text-muted-foreground/50"
              >
                Tutor fragen
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md px-1 py-1 font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Bearbeiten
            </button>
            <button
              type="button"
              onClick={() => void archivieren()}
              disabled={archiving}
              className="rounded-md px-1 py-1 font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
              variant={vorbelegung === false ? "outline" : "default"}
              className="h-11"
              onClick={() => onAntworten(true)}
            >
              Gewusst
            </Button>
          </div>
        )}
      </div>
      <p className="mt-3 hidden text-center text-[12px] text-muted-foreground sm:block">
        Leertaste zeigt die Antwort · 1 nicht gewusst · 2 gewusst · e erklaert · t Tutor fragen
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
            dangerouslySetInnerHTML={{ __html: renderMarkdown(card.answer || "Kein Loesungsweg hinterlegt.") }}
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
            zeigenLabel="Loesung zeigen"
          />
        ) : !gezeigt ? (
          <Button type="button" className="h-11 w-full" onClick={onZeigen}>
            Loesung zeigen
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
                Nicht geloest
              </Button>
              <Button
                type="button"
                variant={vorbelegung === false ? "outline" : "default"}
                className="h-11"
                onClick={() => onAntworten(true)}
              >
                Geloest
              </Button>
            </div>
            <Button type="button" variant="ghost" className="h-11 w-full" onClick={onAehnliche} disabled={varianteLoading}>
              {varianteLoading ? "Erzeugt …" : "Aehnliche Aufgabe"}
            </Button>
          </>
        )}
      </div>
      <p className="mt-3 hidden text-center text-[12px] text-muted-foreground sm:block">
        Leertaste zeigt die Loesung · 1 nicht geloest · 2 geloest · e erklaert · t Tutor fragen
      </p>
    </>
  );
}

// Textarea "Deine Antwort" plus "Pruefen" (Cmd/Ctrl+Enter sendet) fuer wissen/
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
        disabled={loading}
        className="w-full resize-none rounded-md border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-11" onClick={onZeigen} disabled={loading}>
          {zeigenLabel}
        </Button>
        <Button type="button" className="h-11" onClick={onPruefen} disabled={loading}>
          {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : "Pruefen"}
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
  index,
  phase,
  value,
  onValueChange,
  onPruefen,
  inputRef,
  onWeiter,
  onManuell,
}: {
  card: StudyCardDTO;
  index: number;
  phase: "eingabe" | "richtig" | "manuell";
  value: string;
  onValueChange: (v: string) => void;
  onPruefen: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onWeiter: () => void;
  onManuell: (correct: boolean) => void;
}) {
  const richtung = index % 2 === 0;
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
            className="w-full rounded-md border bg-background px-3 py-2.5 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Antwort eintippen"
          />
          <Button type="submit" className="mt-3 h-11 w-full">
            Pruefen
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
            Loesung: <span className="font-medium">{loesung}</span>
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
        Enter prueft · danach 1 falsch · 2 richtig · e erklaert
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
}: {
  backHref: string;
  richtig: number;
  gesamt: number;
  falsche: StudyCardDTO[];
  modus: SessionModus;
  onNochmal: () => void;
}) {
  const bereit = gesamt > 0 ? Math.round((richtig / gesamt) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-12 text-center shadow-card">
        {modus === "probe" ? (
          <div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{bereit} % bereit</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {richtig} von {gesamt} gewusst
            </p>
          </div>
        ) : (
          <p className="text-lg font-medium">
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
                Fertig fuer heute
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
