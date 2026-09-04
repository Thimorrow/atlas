"use client";

// Lernsitzung (/lernen/[subjectId]/session): Karteikarten abfragen. Laedt das
// Fach einmal, baut die Warteschlange lokal (sessionQueue) und arbeitet dann
// rein clientseitig weiter -- kein Neuladen zwischen Karten.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { localISO } from "@/lib/assignments-view";
import { sessionQueue } from "@/lib/lernen";
import type { SubjectDetail, StudyCardDTO } from "@/lib/study-store";

const EASE = [0.22, 1, 0.36, 1] as const;

export function LernenSession({ subjectId }: { subjectId: string }) {
  const toast = useToast();
  const reduce = useReducedMotion();

  const [data, setData] = useState<SubjectDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [queue, setQueue] = useState<StudyCardDTO[] | null>(null);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [richtig, setRichtig] = useState<StudyCardDTO[]>([]);
  const [falsch, setFalsch] = useState<StudyCardDTO[]>([]);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/lernen/${subjectId}`);
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      const detail = (await res.json()) as SubjectDetail;
      setData(detail);

      const today = localISO();
      let q = sessionQueue(detail.cards, today, 20);
      if (q.length === 0 && detail.cards.length > 0) {
        q = [...detail.cards].sort((a, b) => a.box - b.box).slice(0, 20);
      }
      setQueue(q);
    } catch {
      setFailed(true);
      toast("Die Sitzung konnte nicht geladen werden.");
    }
  }, [subjectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = queue && index < queue.length ? queue[index] : null;

  const antworten = useCallback(
    (correct: boolean) => {
      if (!current) return;
      const card = current;
      setRichtig((prev) => (correct ? [...prev, card] : prev));
      setFalsch((prev) => (correct ? prev : [...prev, card]));
      setShowAnswer(false);
      setIndex((i) => i + 1);

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
    [current, toast],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current) return;
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (!showAnswer && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShowAnswer(true);
        return;
      }
      if (showAnswer && e.key === "1") antworten(false);
      if (showAnswer && e.key === "2") antworten(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, showAnswer, antworten]);

  function nochmalFalsche() {
    setQueue(falsch);
    setFalsch([]);
    setRichtig([]);
    setIndex(0);
    setShowAnswer(false);
  }

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
          <p className="text-[15px] font-medium">Noch keine Karten in diesem Fach.</p>
          <Link
            href={`/lernen/${subjectId}`}
            className="rounded-md px-2 py-1.5 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Zum Fach
          </Link>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <SessionEnde
        subjectId={subjectId}
        richtig={richtig.length}
        gesamt={richtig.length + falsch.length}
        falsche={falsch.length}
        onNochmal={nochmalFalsche}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/lernen/${subjectId}`}
          className="inline-flex items-center gap-1 rounded-md py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          {data.subject.name}
        </Link>
        <span className="tabular-nums text-[13px] text-muted-foreground">
          {index + 1} von {queue.length}
        </span>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-200"
          style={{ transform: `scaleX(${(index + (showAnswer ? 0.5 : 0)) / queue.length})` }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="min-h-[240px] rounded-2xl border bg-card p-6 shadow-card"
        >
          <p className="text-balance text-lg font-medium sm:text-xl">{current.question}</p>

          {showAnswer && (
            <div className="mt-4 whitespace-pre-wrap border-t pt-4 text-[15px] text-muted-foreground">
              {current.answer || "Keine Antwort hinterlegt."}
            </div>
          )}

          <div className="mt-6">
            {!showAnswer ? (
              <Button type="button" className="w-full" onClick={() => setShowAnswer(true)}>
                Antwort zeigen
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => antworten(false)}>
                  Nicht gewusst
                </Button>
                <Button type="button" onClick={() => antworten(true)}>
                  Gewusst
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <p className="hidden text-center text-[12px] text-muted-foreground sm:block">
        Leertaste zeigt die Antwort · 1 nicht gewusst · 2 gewusst
      </p>
    </div>
  );
}

function SessionEnde({
  subjectId,
  richtig,
  gesamt,
  falsche,
  onNochmal,
}: {
  subjectId: string;
  richtig: number;
  gesamt: number;
  falsche: number;
  onNochmal: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-12 text-center shadow-card">
        <p className="text-lg font-medium">
          {richtig} von {gesamt} gewusst
        </p>
        {/* Ein Hauptknopf: solange Falsche uebrig sind, ist "nochmal" der
            naechste Schritt, sonst "Fertig". Die Uebersicht erreicht man
            ueber die Navigation, dafuer braucht es hier keinen dritten Weg. */}
        <div className="flex flex-col items-center gap-2">
          {falsche > 0 ? (
            <>
              <Button type="button" onClick={onNochmal}>
                Falsche nochmal
              </Button>
              <Link
                href={`/lernen/${subjectId}`}
                className="rounded-md px-1 py-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Fertig für heute
              </Link>
            </>
          ) : (
            <Link href={`/lernen/${subjectId}`} className={cn(buttonVariants({ size: "default" }))}>
              Fertig
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
