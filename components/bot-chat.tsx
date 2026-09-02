"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  GraduationCap,
  ListChecks,
  NotebookPen,
  Send,
  Square,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { renderMarkdown, markdownPreview, repairMissingParagraphBreaks } from "@/lib/markdown";
import { parseBotEvent, splitNDJSON } from "@/lib/bot/stream";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import { TYPE_LABEL, type AssignmentDTO } from "@/lib/assignments-view";
import { cn } from "@/lib/utils";

// Typ-only-Import wie in subject-notes.tsx: der Typ selbst wird beim Build
// wegkompiliert, `lib/subject-store` zieht die DB aber nicht in den
// Client-Bundle, solange nur der Typ verwendet wird.
import type { NoteDTO } from "@/lib/subject-store";

// --- Zustandsformen -----------------------------------------------------

type AssignmentActionResult = { aufgabe: AssignmentDTO; hinweisFaellig?: string };
type NoteActionResult = { notiz: NoteDTO };

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

function isAssignmentResult(
  tool: string,
  _result: AssignmentActionResult | NoteActionResult,
): _result is AssignmentActionResult {
  return tool === "aufgabe_anlegen" || tool === "aufgabe_aendern";
}

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

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

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
    if (autoFocus && info?.enabled) inputRef.current?.focus();
  }, [autoFocus, info?.enabled]);

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
      if (!trimmed || streaming || !info?.enabled) return;
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  // --- Ladezustand / kein Key hinterlegt ---------------------------------

  if (!info && !loadError) {
    return (
      <div className={cn("flex h-full items-center justify-center", className)}>
        <p className="text-[13px] text-muted-foreground">Wird geladen …</p>
      </div>
    );
  }

  if (loadError || info?.enabled === false) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-3 px-6 text-center", className)}>
        <AlertTriangle className="size-6 text-muted-foreground" />
        <p className="max-w-sm text-[13px] text-muted-foreground">
          {info?.greeting ?? "Der Atlas-Bot ist gerade nicht erreichbar. Versuch es später noch einmal."}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
        {turns.length === 0 ? (
          // Solange kein Gespraech laeuft, steht der Startblock als Einheit
          // in der Mitte der Flaeche statt oben-links zu kleben -- das ist
          // der erste Eindruck des Features und braucht Gewicht. Sobald die
          // erste Nachricht da ist (turns.length > 0), uebernimmt der normale,
          // oben beginnende Verlauf unten.
          <div className="flex h-full flex-col items-center justify-center gap-6 px-2 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-5" />
            </span>
            <p className="max-w-md text-balance text-[19px] font-semibold leading-snug tracking-tight text-foreground">
              {info!.greeting}
            </p>
            {info!.suggestions.length > 0 && (
              <div className="flex w-full max-w-md flex-col gap-2">
                <p className="px-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Frag zum Beispiel
                </p>
                {info!.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left text-[14px] font-medium leading-snug text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {s}
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
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

      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t bg-card/40 px-4 py-3 sm:px-5">
        <textarea
          ref={inputRef}
          data-autofocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Frag den Atlas-Bot …"
          className="min-h-[44px] flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-[16px] leading-snug outline-none transition-[border-color,box-shadow] duration-150 ease-[var(--ease-atlas)] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        {streaming ? (
          // "Square" pur als Umriss verschwindet neben dem eigenen
          // quadratischen Button-Rahmen -- gefuellt liest es sich sofort als
          // das klassische Stop-Symbol.
          <Button type="button" variant="outline" size="icon" aria-label="Antwort abbrechen" title="Antwort abbrechen" onClick={abort}>
            <Square className="size-3.5" fill="currentColor" />
          </Button>
        ) : (
          <Button type="submit" size="icon" aria-label="Absenden" disabled={!input.trim()}>
            <Send className="size-4" />
          </Button>
        )}
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
          <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-pulse" aria-hidden />
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
          <p className="text-[13px] text-muted-foreground">Denkt nach …</p>
        ) : null}

        {turn.items.map((item) =>
          item.kind === "action" ? (
            <ActionCard key={item.id} item={item} onUndo={() => onUndo(item)} />
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

function ActionCard({ item, onUndo }: { item: ActionItem; onUndo: () => void }) {
  const isAssignment = isAssignmentResult(item.tool, item.result);
  const canUndo = CREATE_TOOLS.has(item.tool);
  const undone = item.state === "undone";
  const reduce = useReducedMotion();
  const enter = {
    initial: reduce ? false : ({ opacity: 0, y: 6 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  if (isAssignment) {
    const a = (item.result as AssignmentActionResult).aufgabe;
    const tint = a.subjectId ? colorValue(a.subjectColor) : NEUTRAL_COLOR;
    return (
      <motion.div {...enter} className={cn("max-w-[92%] rounded-xl border bg-card px-4 py-3", undone && "opacity-55")}>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ListChecks className="size-3.5" />
          {item.tool === "aufgabe_anlegen" ? "Aufgabe angelegt" : "Aufgabe geändert"}
        </div>
        <p className={cn("mt-1.5 text-[15px] font-medium leading-snug", undone && "line-through decoration-foreground/30")}>
          {a.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: tint }} />
            {a.subjectName ?? "Allgemein"}
          </span>
          {a.type !== "homework" && (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
              {(a.type === "exam" || a.type === "test") && <GraduationCap className="size-3" strokeWidth={2.25} />}
              {TYPE_LABEL[a.type]}
            </span>
          )}
          {a.dueDate && <span className="tabular-nums">Fällig am {fmtDate(a.dueDate)}</span>}
        </div>
        <CardFooter canUndo={canUndo} undone={undone} busy={item.busy} onUndo={onUndo} />
      </motion.div>
    );
  }

  const n = (item.result as NoteActionResult).notiz;
  return (
    <motion.div {...enter} className={cn("max-w-[92%] rounded-xl border bg-card px-4 py-3", undone && "opacity-55")}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <NotebookPen className="size-3.5" />
        {item.tool === "notiz_anlegen" ? "Notiz angelegt" : "Notiz geändert"}
      </div>
      <p className={cn("mt-1.5 text-[15px] font-medium leading-snug", undone && "line-through decoration-foreground/30")}>
        {n.title}
      </p>
      {n.body.trim() && (
        <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{markdownPreview(n.body)}</p>
      )}
      <CardFooter canUndo={canUndo} undone={undone} busy={item.busy} onUndo={onUndo} />
    </motion.div>
  );
}

function CardFooter({
  canUndo,
  undone,
  busy,
  onUndo,
}: {
  canUndo: boolean;
  undone: boolean;
  busy: boolean;
  onUndo: () => void;
}) {
  if (!canUndo) return null;
  return (
    <div className="mt-2">
      {undone ? (
        <p className="text-[12px] text-muted-foreground">Zurückgenommen.</p>
      ) : (
        <Button variant="ghost" size="sm" disabled={busy} onClick={onUndo} className="h-7 px-2 text-[12.5px]">
          <Undo2 className="size-3.5" />
          {busy ? "Wird zurückgenommen …" : "Rückgängig"}
        </Button>
      )}
    </div>
  );
}

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
