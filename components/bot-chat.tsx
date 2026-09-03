"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowRight, ArrowUp, GraduationCap, Square, Undo2 } from "lucide-react";
import { AtlasBotMark } from "@/components/atlas-bot-mark";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { renderMarkdown, repairMissingParagraphBreaks } from "@/lib/markdown";
import { parseBotEvent, splitNDJSON } from "@/lib/bot/stream";
import {
  ActionCard,
  fmtDate,
  isAssignmentResult,
  type AssignmentActionResult,
  type NoteActionResult,
} from "@/components/bot-action-card";
import { cn } from "@/lib/utils";

// --- Zustandsformen -----------------------------------------------------

type ActionItem = {
  kind: "action";
  id: string;
  tool: string;
  result: AssignmentActionResult | NoteActionResult;
  state: "active" | "undone";
  busy: boolean;
};

type GradeProposalData = {
  fach: string;
  subjectId: string | null;
  punkte: number;
  note: string;
  art: "oral" | "written";
  bezeichnung: string;
  datum: string;
  gewicht: number;
};

type ProposalItem = {
  kind: "proposal";
  id: string;
  data: GradeProposalData;
  state: "pending" | "entered" | "discarded";
  busy: boolean;
};

type TurnItem = ActionItem | ProposalItem;

type Turn = {
  id: string;
  userText: string;
  assistantText: string;
  statusText: string | null;
  items: TurnItem[];
  errorText: string | null;
  streaming: boolean;
  // true, wenn seit dem letzten Text ein Werkzeug lief -- der naechste
  // Textblock startet dann als neuer Absatz statt nahtlos anzuschliessen.
  needsBreak: boolean;
};

type BotInfo = {
  enabled: boolean;
  greeting: string;
  suggestions: string[];
  conversationId: string | null;
};

const CREATE_TOOLS = new Set(["aufgabe_anlegen", "notiz_anlegen"]);

function actionToastText(tool: string): string {
  switch (tool) {
    case "aufgabe_anlegen":
      return "Aufgabe angelegt.";
    case "aufgabe_aendern":
      return "Aufgabe geändert.";
    case "notiz_anlegen":
      return "Notiz angelegt.";
    case "notiz_aendern":
      return "Notiz geändert.";
    default:
      return "Erledigt.";
  }
}

// Atlas-Signaturkurve, wie in components/stagger.tsx und assignment-list.tsx.
const EASE = [0.22, 1, 0.36, 1] as const;

// --- Hauptkomponente ------------------------------------------------------

// Gemeinsame Chat-Logik fuer /bot und das Cmd+K-Overlay. Beide unterscheiden
// sich nur im Rahmen (Seite vs. Dialog), deshalb lebt hier die gesamte
// Zustandsverwaltung: Begruessung laden, streamen, Karten, Rueckgaengig,
// Notenvorschlag.
export function BotChat({ className, autoFocus = false }: { className?: string; autoFocus?: boolean }) {
  const toast = useToast();
  const [info, setInfo] = useState<BotInfo | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loadError, setLoadError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const streaming = turns.length > 0 && turns[turns.length - 1].streaming;

  useEffect(() => {
    let alive = true;
    fetch("/api/bot")
      .then((r) => r.json())
      .then((d: BotInfo) => {
        if (!alive) return;
        setInfo(d);
        setConversationId(d.conversationId);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Beim Eintreffen neuer Inhalte ans Ende scrollen -- ein wachsendes
  // Gespraech soll immer die aktuelle Antwort zeigen, nicht den Anfang.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  const updateTurn = useCallback((id: string, fn: (t: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  const handleLine = useCallback(
    (turnId: string, line: string) => {
      const evt = parseBotEvent(line);
      if (!evt) return;
      switch (evt.type) {
        case "status":
          updateTurn(turnId, (t) =>
            t.assistantText ? { ...t, needsBreak: true } : { ...t, statusText: evt.text },
          );
          break;
        case "text":
          updateTurn(turnId, (t) => ({
            ...t,
            assistantText: t.assistantText + (t.needsBreak && t.assistantText ? "\n\n" : "") + evt.delta,
            statusText: null,
            needsBreak: false,
          }));
          break;
        case "action": {
          const result = evt.result as AssignmentActionResult | NoteActionResult;
          const id = crypto.randomUUID();
          updateTurn(turnId, (t) => ({
            ...t,
            items: [...t.items, { kind: "action", id, tool: evt.tool, result, state: "active", busy: false }],
            needsBreak: t.assistantText ? true : t.needsBreak,
          }));
          toast(actionToastText(evt.tool), "success");
          break;
        }
        case "proposal": {
          const id = crypto.randomUUID();
          const data = evt.data as GradeProposalData;
          updateTurn(turnId, (t) => ({
            ...t,
            items: [...t.items, { kind: "proposal", id, data, state: "pending", busy: false }],
            needsBreak: t.assistantText ? true : t.needsBreak,
          }));
          break;
        }
        case "error":
          updateTurn(turnId, (t) => ({ ...t, errorText: evt.text, statusText: null }));
          break;
        case "done":
          setConversationId(evt.conversationId);
          break;
      }
    },
    [toast, updateTurn],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming || info?.enabled === false) return;
      const turnId = crypto.randomUUID();
      setTurns((prev) => [
        ...prev,
        {
          id: turnId,
          userText: trimmed,
          assistantText: "",
          statusText: null,
          items: [],
          errorText: null,
          streaming: true,
          needsBreak: false,
        },
      ]);
      setInput("");
      // Das mitgewachsene Feld faellt sonst auf voller Hoehe stehen.
      if (inputRef.current) inputRef.current.style.height = "auto";

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/bot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationId, message: trimmed }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          updateTurn(turnId, (t) => ({ ...t, errorText: data?.error ?? "Der Bot konnte nicht antworten." }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { lines, rest } = splitNDJSON(buffer);
          buffer = rest;
          for (const line of lines) handleLine(turnId, line);
        }
        handleLine(turnId, buffer);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          updateTurn(turnId, (t) => ({ ...t, errorText: "Die Verbindung zum Bot wurde unterbrochen." }));
        }
      } finally {
        updateTurn(turnId, (t) => ({ ...t, streaming: false, statusText: null }));
        abortRef.current = null;
      }
    },
    [conversationId, handleLine, info?.enabled, streaming, updateTurn],
  );

  const abort = useCallback(() => abortRef.current?.abort(), []);

  const undoAction = useCallback(
    async (turnId: string, item: ActionItem) => {
      const isAssignment = isAssignmentResult(item.tool, item.result);
      const id = isAssignment
        ? (item.result as AssignmentActionResult).aufgabe.id
        : (item.result as NoteActionResult).notiz.id;
      const url = isAssignment ? `/api/assignments/${id}` : `/api/notes/${id}`;
      updateTurn(turnId, (t) => ({
        ...t,
        items: t.items.map((i) => (i.kind === "action" && i.id === item.id ? { ...i, busy: true } : i)),
      }));
      try {
        const res = await fetch(url, { method: "DELETE" });
        if (!res.ok) throw new Error("undo failed");
        updateTurn(turnId, (t) => ({
          ...t,
          items: t.items.map((i) =>
            i.kind === "action" && i.id === item.id ? { ...i, state: "undone" as const, busy: false } : i,
          ),
        }));
        toast("Rückgängig gemacht.", "success");
      } catch {
        updateTurn(turnId, (t) => ({
          ...t,
          items: t.items.map((i) => (i.kind === "action" && i.id === item.id ? { ...i, busy: false } : i)),
        }));
        toast("Konnte nicht rückgängig gemacht werden.");
      }
    },
    [toast, updateTurn],
  );

  const enterGrade = useCallback(
    async (turnId: string, item: ProposalItem) => {
      if (!item.data.subjectId) return;
      updateTurn(turnId, (t) => ({
        ...t,
        items: t.items.map((i) => (i.kind === "proposal" && i.id === item.id ? { ...i, busy: true } : i)),
      }));
      try {
        const res = await fetch(`/api/subjects/${item.data.subjectId}/grades`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            points: item.data.punkte,
            label: item.data.bezeichnung,
            kind: item.data.art,
            date: item.data.datum,
            weight: item.data.gewicht,
          }),
        });
        if (!res.ok) throw new Error("grade failed");
        updateTurn(turnId, (t) => ({
          ...t,
          items: t.items.map((i) =>
            i.kind === "proposal" && i.id === item.id ? { ...i, state: "entered" as const, busy: false } : i,
          ),
        }));
        toast("Note eingetragen.", "success");
      } catch {
        updateTurn(turnId, (t) => ({
          ...t,
          items: t.items.map((i) => (i.kind === "proposal" && i.id === item.id ? { ...i, busy: false } : i)),
        }));
        toast("Die Note konnte nicht eingetragen werden.");
      }
    },
    [toast, updateTurn],
  );

  const discardGrade = useCallback(
    (turnId: string, itemId: string) => {
      updateTurn(turnId, (t) => ({
        ...t,
        items: t.items.map((i) =>
          i.kind === "proposal" && i.id === itemId ? { ...i, state: "discarded" as const } : i,
        ),
      }));
    },
    [updateTurn],
  );

  const onSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    void send(input);
  };

  // Das Feld waechst mit dem Text bis zur Hoehe aus max-h und scrollt erst
  // danach -- eine feste Zeile zwingt sonst zum Scrollen in einem 44px hohen
  // Fenster, sobald jemand mehr als einen Satz schreibt.
  const onInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  // --- Kein Key hinterlegt -----------------------------------------------

  // Bewusst kein Ladezustand fuer den noch laufenden GET: der Startblock
  // steht sofort mit einer allgemeinen Begruessung, die personalisierte
  // ersetzt sie, sobald sie da ist. Ein Panel, das sich mit "Wird geladen …"
  // oeffnet, wirkt langsamer als es ist. Faellt der GET ganz aus, bleibt der
  // Startblock stehen -- der erste Sendeversuch meldet den Fehler dann
  // konkret, statt hier pauschal die Tuer zuzumachen.
  if (info?.enabled === false) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-3 px-6 text-center", className)}>
        <AlertTriangle className="size-6 text-muted-foreground" />
        <p className="max-w-sm text-[13px] text-muted-foreground">{info.greeting}</p>
      </div>
    );
  }

  const greeting = info?.greeting ?? "Wie kann ich dir helfen?";
  const suggestions = info?.suggestions ?? [];

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
        {turns.length === 0 ? (
          // Solange kein Gespraech laeuft, steht der Startblock als Einheit
          // in der Mitte der Flaeche statt oben-links zu kleben -- das ist
          // der erste Eindruck des Features und braucht Gewicht. Sobald die
          // erste Nachricht da ist (turns.length > 0), uebernimmt der normale,
          // oben beginnende Verlauf unten.
          <div className="flex h-full flex-col items-center justify-center gap-5 px-2 text-center">
            {/* Das Zeichen bekommt einen weichen Hof statt einer harten
                Kachel -- im leeren Panel ist es das einzige Bildelement und
                darf ruhig atmen. */}
            <span className="relative grid size-14 place-items-center">
              <span
                aria-hidden
                className="absolute inset-0 rounded-full bg-primary/15 blur-md"
              />
              <span className="relative grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <AtlasBotMark className="size-6" />
              </span>
            </span>
            <p className="max-w-md text-balance text-[18px] font-semibold leading-snug tracking-tight text-foreground">
              {greeting}
            </p>
            {suggestions.length > 0 && (
              <div className="flex w-full max-w-md flex-col gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="group flex items-center justify-between gap-3 rounded-xl border bg-card px-3.5 py-2.5 text-left text-[13.5px] font-medium leading-snug text-foreground transition-colors hover:border-primary/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {s}
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          turns.map((t) => (
            <TurnView
              key={t.id}
              turn={t}
              onUndo={(item) => void undoAction(t.id, item)}
              onEnterGrade={(item) => void enterGrade(t.id, item)}
              onDiscardGrade={(itemId) => discardGrade(t.id, itemId)}
            />
          ))
        )}
      </div>

      {/* Eingabe als eine Flaeche statt Feld-plus-Knopf: der Rahmen umfasst
          beides und reagiert auf den Fokus des Feldes darin (focus-within),
          damit die Zeile als ein Bauteil liest. */}
      <form onSubmit={onSubmit} className="px-3 pb-3 pt-2">
        <div className="flex items-end gap-1.5 rounded-2xl border bg-background p-1.5 pl-3 shadow-sm transition-[border-color,box-shadow] duration-150 ease-[var(--ease-atlas)] focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/25">
          <textarea
            ref={inputRef}
            data-autofocus
            value={input}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Frag Atlas …"
            // 16px sind Pflicht: kleinere Felder loesen auf iOS den
            // Auto-Zoom aus, der das ganze Panel verschiebt.
            className="max-h-[8.5rem] min-h-[1.75rem] flex-1 resize-none self-center bg-transparent py-1.5 text-[16px] leading-snug outline-none placeholder:text-muted-foreground"
          />
          {streaming ? (
            // "Square" pur als Umriss verschwindet neben dem eigenen runden
            // Rahmen -- gefuellt liest es sich sofort als das klassische
            // Stop-Symbol.
            <button
              type="button"
              onClick={abort}
              aria-label="Antwort abbrechen"
              title="Antwort abbrechen"
              className="grid size-9 shrink-0 place-items-center rounded-xl border bg-card text-foreground transition-colors [touch-action:manipulation] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Square className="size-3" fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Absenden"
              disabled={!input.trim()}
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-[opacity,transform] duration-150 ease-[var(--ease-atlas)] [touch-action:manipulation] disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:active:scale-95"
            >
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// --- Verlauf --------------------------------------------------------------

function TurnView({
  turn,
  onUndo,
  onEnterGrade,
  onDiscardGrade,
}: {
  turn: Turn;
  onUndo: (item: ActionItem) => void;
  onEnterGrade: (item: ProposalItem) => void;
  onDiscardGrade: (itemId: string) => void;
}) {
  // Gestreamter Bot-Text kommt manchmal ohne Trennzeichen zwischen zwei
  // Saetzen an -- repairMissingParagraphBreaks setzt die fehlende Leerzeile
  // ein, bevor Markdown geparst wird.
  const html = useMemo(
    () => renderMarkdown(repairMissingParagraphBreaks(turn.assistantText)),
    [turn.assistantText],
  );
  const showStatus = turn.streaming && turn.statusText && !turn.assistantText;
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="flex flex-col gap-2.5"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE }}
    >
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-[14px] leading-snug text-primary-foreground">
          {turn.userText}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {showStatus && (
          <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <TypingDots />
            {turn.statusText}
          </p>
        )}

        {turn.assistantText ? (
          <div
            className={cn(
              "max-w-[92%] text-[15px] leading-relaxed text-foreground",
              "[&>*+*]:mt-2.5",
              "[&_strong]:font-semibold [&_em]:italic",
              "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-0.5",
              "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]",
              "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
            )}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : turn.streaming && !showStatus && !turn.errorText ? (
          <TypingDots />
        ) : null}

        {turn.items.map((item) =>
          item.kind === "action" ? (
            <ActionCard
              key={item.id}
              tool={item.tool}
              result={item.result}
              dimmed={item.state === "undone"}
              footer={
                CREATE_TOOLS.has(item.tool) ? (
                  item.state === "undone" ? (
                    <p className="mt-2 text-[12px] text-muted-foreground">Zurückgenommen.</p>
                  ) : (
                    <div className="mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={item.busy}
                        onClick={() => onUndo(item)}
                        className="h-7 px-2 text-[12.5px]"
                      >
                        <Undo2 className="size-3.5" />
                        {item.busy ? "Wird zurückgenommen …" : "Rückgängig"}
                      </Button>
                    </div>
                  )
                ) : null
              }
            />
          ) : (
            <ProposalCard
              key={item.id}
              item={item}
              onEnter={() => onEnterGrade(item)}
              onDiscard={() => onDiscardGrade(item.id)}
            />
          ),
        )}

        {turn.errorText && (
          <p className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            {turn.errorText}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// --- Karten -----------------------------------------------------------------

function ProposalCard({
  item,
  onEnter,
  onDiscard,
}: {
  item: ProposalItem;
  onEnter: () => void;
  onDiscard: () => void;
}) {
  const d = item.data;
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="max-w-[92%] rounded-xl border border-dashed bg-card px-4 py-3"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <GraduationCap className="size-3.5" />
        Notenvorschlag
      </div>
      <p className="mt-1.5 text-[15px] font-medium leading-snug">
        {d.bezeichnung} · {d.fach}
      </p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
        {d.punkte} Punkte ({d.note}) · {d.art === "oral" ? "mündlich" : "schriftlich"} · {fmtDate(d.datum)}
        {d.gewicht !== 1 ? ` · Gewicht ${d.gewicht}×` : ""}
      </p>

      {item.state === "pending" && (
        <>
          {!d.subjectId && (
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              Fach „{d.fach}" wurde nicht gefunden, die Note kann so nicht eingetragen werden.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={item.busy || !d.subjectId} onClick={onEnter} className="h-7 px-2.5 text-[12.5px]">
              {item.busy ? "Trägt ein …" : "Eintragen"}
            </Button>
            <Button variant="ghost" size="sm" disabled={item.busy} onClick={onDiscard} className="h-7 px-2.5 text-[12.5px]">
              Verwerfen
            </Button>
          </div>
        </>
      )}
      {item.state === "entered" && <p className="mt-2 text-[12px] text-muted-foreground">Eingetragen.</p>}
      {item.state === "discarded" && <p className="mt-2 text-[12px] text-muted-foreground">Verworfen.</p>}
    </motion.div>
  );
}

// Drei versetzt pulsierende Punkte -- das eingefuehrte Zeichen dafuer, dass
// gerade etwas entsteht. Bei reduzierter Bewegung bleibt ein ruhiger Punkt
// stehen, damit der Zustand trotzdem sichtbar ist.
function TypingDots() {
  return (
    <span className="flex items-center gap-1" role="status" aria-label="Atlas antwortet">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="size-1.5 rounded-full bg-muted-foreground/70 motion-safe:animate-bounce"
          style={{ animationDelay: `${i * 0.14}s`, animationDuration: "0.9s" }}
        />
      ))}
    </span>
  );
}
