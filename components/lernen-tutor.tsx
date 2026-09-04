"use client";

// Tutor-Seite (/lernen/[subjectId]/tutor): Chat mit Widgets, Checkliste und
// Fazit-Karte. Datenfluss und Events nach TUTOR-SPEC.md "Kern"/"API". Der
// Stream wird wie in components/bot-chat.tsx gelesen (Reader, NDJSON-Zeilen,
// JSON.parse je Zeile, AbortController).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { renderMarkdown, repairMissingParagraphBreaks } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import type {
  AufgabeStatus,
  Checkliste,
  TutorConversationDTO,
  TutorErgebnis,
  TutorMessageDTO,
  TutorModusDTO,
} from "@/lib/tutor/types";
import type { SubjectDetail } from "@/lib/lernen-types";

const NOTE_LABEL: Record<AufgabeStatus, string> = {
  offen: "○",
  richtig: "✅",
  falsch: "❌",
  uebersprungen: "↷",
};

// --- Chat-Item-Modell (nur fuer die Oberflaeche, keine DB-Form) -------------

type UserItem = { kind: "user"; id: string; text: string };
type SystemItem = { kind: "system"; id: string; text: string };
type AssistantItem = { kind: "assistant"; id: string; text: string };
type ErrorItem = { kind: "error"; id: string; text: string };
type WidgetItem = {
  kind: "widget";
  id: string; // messageId
  frage: string;
  optionen: string[];
  mehrfach: boolean;
  answered: boolean;
  auswahl: string[] | null;
  freitext?: string;
  draft: string[]; // bei mehrfach: aktuell angehakte Optionen, waehrend offen
};
type ChatItem = UserItem | SystemItem | AssistantItem | ErrorItem | WidgetItem;

function isWidgetOpen(item: WidgetItem): boolean {
  return !item.answered;
}

// Baut die Chat-Items aus dem gespeicherten Verlauf (TutorMessageDTO[]).
// frage_auswahl-Zeilen werden zu Widgets, andere Tool-Zeilen (checkliste_erstellen,
// aufgabe_ergebnis, fazit) bleiben unsichtbar -- deren Wirkung zeigt sich in
// der Checkliste bzw. der Fazit-Karte, nicht als eigene Chat-Blase.
function buildItemsFromHistory(history: TutorMessageDTO[]): ChatItem[] {
  const items: ChatItem[] = [];
  let i = 0;
  while (i < history.length) {
    const m = history[i];

    if (m.role === "user") {
      if (m.content) items.push({ kind: "user", id: m.id, text: m.content });
      i++;
      continue;
    }

    if (m.role === "assistant" && m.toolName === "frage_auswahl") {
      const args = (m.toolArgs ?? {}) as { frage?: string; optionen?: string[]; mehrfach?: boolean };
      const next = history[i + 1];
      const answered = next?.role === "tool";
      const result = answered ? ((next!.toolResult ?? {}) as { auswahl?: string[]; text?: string }) : null;
      items.push({
        kind: "widget",
        id: m.id,
        frage: args.frage ?? "",
        optionen: args.optionen ?? [],
        mehrfach: Boolean(args.mehrfach),
        answered,
        auswahl: result?.auswahl ?? null,
        freitext: result?.text,
        draft: [],
      });
      i += answered ? 2 : 1;
      continue;
    }

    if (m.role === "assistant" && m.toolName) {
      // checkliste_erstellen / aufgabe_ergebnis / fazit: kein Chat-Bubble.
      i++;
      if (history[i]?.role === "tool") i++;
      continue;
    }

    if (m.role === "assistant" && m.content) {
      items.push({ kind: "assistant", id: m.id, text: m.content });
      i++;
      continue;
    }

    i++; // verwaiste Zeile
  }
  return items;
}

function splitLines(buffer: string): { lines: string[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  return { lines, rest };
}

export function LernenTutor({
  subjectId,
  topicId,
  modus,
  cardId,
  sessionId,
  einheitId,
  pruefung,
}: {
  subjectId: string;
  // null = Simulation ueber einen ganzen Lernplan (pruefung gesetzt, kein Thema).
  topicId: string | null;
  modus: TutorModusDTO;
  cardId: string | null;
  sessionId: string | null;
  einheitId?: string | null;
  pruefung?: string | null;
}) {
  const toast = useToast();

  const [topicTitle, setTopicTitle] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [checkliste, setCheckliste] = useState<Checkliste | null>(null);
  const [ergebnis, setErgebnis] = useState<TutorErgebnis | null>(null);
  const [ended, setEnded] = useState(false);
  const [kartenAngelegt, setKartenAngelegt] = useState(false);
  const [kartenAnlegend, setKartenAnlegend] = useState(false);

  const [phase, setPhase] = useState<"loading" | "no-bot" | "not-found" | "ready">("loading");
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [checklisteOpen, setChecklisteOpen] = useState(false);
  // "Anders..." fokussiert nur noch das Eingabefeld -- sendMessage erkennt das
  // offene Widget selbst und schickt jeden abgeschickten Text als widgetAntwort.
  const [pendingFreeText, setPendingFreeText] = useState(false);

  const conversationIdRef = useRef<string | null>(sessionId);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const startedRef = useRef(false);

  // Thema-Titel: eigener kleiner Ladevorgang, unabhaengig von der Session.
  // Simulation (kein Thema): kein Ladevorgang, der Header zeigt "Simulation".
  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    fetch(`/api/lernen/${subjectId}`)
      .then((r) => (r.ok ? (r.json() as Promise<SubjectDetail>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        const t = data.themen.find((x) => x.id === topicId);
        setTopicTitle(t?.title ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [subjectId, topicId]);

  const appendItem = useCallback((item: ChatItem) => {
    setItems((prev) => [...prev, item]);
  }, []);

  const handleEvent = useCallback(
    (line: string, currentAssistantId: { current: string | null }, restoreOnError?: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let evt: unknown;
      try {
        evt = JSON.parse(trimmed);
      } catch {
        return;
      }
      if (typeof evt !== "object" || evt === null || typeof (evt as { type?: unknown }).type !== "string") return;
      const e = evt as Record<string, unknown>;

      switch (e.type) {
        case "text": {
          const delta = typeof e.delta === "string" ? e.delta : "";
          if (currentAssistantId.current === null) {
            const id = crypto.randomUUID();
            currentAssistantId.current = id;
            appendItem({ kind: "assistant", id, text: delta });
          } else {
            const id = currentAssistantId.current;
            setItems((prev) => prev.map((it) => (it.kind === "assistant" && it.id === id ? { ...it, text: it.text + delta } : it)));
          }
          break;
        }
        case "widget": {
          appendItem({
            kind: "widget",
            id: String(e.messageId),
            frage: typeof e.frage === "string" ? e.frage : "",
            optionen: Array.isArray(e.optionen) ? (e.optionen as string[]) : [],
            mehrfach: Boolean(e.mehrfach),
            answered: false,
            auswahl: null,
            draft: [],
          });
          currentAssistantId.current = null;
          break;
        }
        case "checkliste": {
          setCheckliste(e.checkliste as Checkliste);
          break;
        }
        case "fazit": {
          setErgebnis(e.ergebnis as TutorErgebnis);
          setEnded(true);
          break;
        }
        case "error": {
          appendItem({ kind: "error", id: crypto.randomUUID(), text: typeof e.text === "string" ? e.text : "Verbindung weg, nochmal senden." });
          if (restoreOnError !== undefined) setInput(restoreOnError);
          currentAssistantId.current = null;
          break;
        }
        case "done":
        default:
          break;
      }
    },
    [appendItem],
  );

  const runTurn = useCallback(
    async (body: Record<string, unknown>, restoreOnError?: string) => {
      const cid = conversationIdRef.current;
      if (!cid) return;
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const currentAssistantId = { current: null as string | null };

      try {
        const res = await fetch(`/api/lernen/tutor/${cid}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          toast(data?.error ?? "Der Tutor konnte nicht antworten.");
          if (restoreOnError !== undefined) setInput(restoreOnError);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { lines, rest } = splitLines(buffer);
          buffer = rest;
          for (const line of lines) handleEvent(line, currentAssistantId, restoreOnError);
        }
        handleEvent(buffer, currentAssistantId, restoreOnError);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          appendItem({ kind: "error", id: crypto.randomUUID(), text: "Verbindung weg, nochmal senden." });
          if (restoreOnError !== undefined) setInput(restoreOnError);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [appendItem, handleEvent, toast],
  );

  // --- Laden / Anlegen der Session -----------------------------------------

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      if (sessionId) {
        conversationIdRef.current = sessionId;
        try {
          const res = await fetch(`/api/lernen/tutor/${sessionId}`);
          if (!res.ok) {
            setPhase("not-found");
            return;
          }
          const data = (await res.json()) as {
            conversation: TutorConversationDTO;
            messages: TutorMessageDTO[];
            checkliste: Checkliste | null;
            ergebnis: TutorErgebnis | null;
          };
          setItems(buildItemsFromHistory(data.messages));
          setCheckliste(data.checkliste);
          setErgebnis(data.ergebnis);
          setEnded(Boolean(data.conversation.endedAt));
          setKartenAngelegt(data.conversation.kartenAngelegt);
          setPhase("ready");
          // Bestehende Session: nie automatisch einen Turn starten, egal wie
          // der Verlauf endet -- nur eine neu angelegte Session startet sofort.
        } catch {
          setPhase("not-found");
        }
        return;
      }

      try {
        const res = await fetch("/api/lernen/tutor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(topicId ? { topicId } : {}),
            modus,
            ...(cardId ? { cardId } : {}),
            ...(einheitId ? { einheitId } : {}),
            ...(pruefung ? { pruefung } : {}),
          }),
        });
        if (res.status === 503) {
          setPhase("no-bot");
          return;
        }
        if (res.status === 404) {
          setPhase("not-found");
          return;
        }
        if (!res.ok) {
          setPhase("not-found");
          return;
        }
        const data = (await res.json()) as { conversation: TutorConversationDTO };
        conversationIdRef.current = data.conversation.id;
        setPhase("ready");
        // history.replaceState statt router.replace: der App-Router remountet
        // sonst ueber den key={session}-Wechsel auf der Seite und bricht den
        // gerade gestarteten ersten Turn ab.
        const query = [
          topicId ? `thema=${topicId}` : null,
          `modus=${modus}`,
          cardId ? `karte=${cardId}` : null,
          einheitId ? `einheit=${einheitId}` : null,
          pruefung ? `pruefung=${pruefung}` : null,
          `session=${data.conversation.id}`,
        ]
          .filter(Boolean)
          .join("&");
        window.history.replaceState(null, "", `/lernen/${subjectId}/tutor?${query}`);
        await runTurn({});
      } catch {
        setPhase("not-found");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items]);

  const sendMessage = useCallback(
    async (raw: string, opts?: { hidden?: boolean }) => {
      const trimmed = raw.trim();
      if (!trimmed || streaming || ended) return;

      // Ist das letzte Widget noch offen, darf keine message geschickt werden
      // -- das Modell wartet auf ein tool_result. Egal ob getippt, "Anders...",
      // ein Quick-Button oder "Beenden": der Text geht als widgetAntwort raus,
      // das Widget gilt als per Freitext beantwortet.
      const openWidget = items.find((it): it is WidgetItem => it.kind === "widget" && isWidgetOpen(it));
      if (openWidget) {
        setPendingFreeText(false);
        setInput("");
        setItems((prev) =>
          prev.map((it) => (it.kind === "widget" && it.id === openWidget.id ? { ...it, answered: true, auswahl: [], freitext: trimmed } : it)),
        );
        if (opts?.hidden) appendItem({ kind: "system", id: crypto.randomUUID(), text: trimmed });
        await runTurn({ widgetAntwort: { messageId: openWidget.id, auswahl: [], text: trimmed } }, opts?.hidden ? undefined : trimmed);
        return;
      }

      if (opts?.hidden) {
        appendItem({ kind: "system", id: crypto.randomUUID(), text: trimmed });
      } else {
        appendItem({ kind: "user", id: crypto.randomUUID(), text: trimmed });
        setInput("");
      }
      await runTurn({ message: trimmed }, opts?.hidden ? undefined : trimmed);
    },
    [appendItem, ended, items, runTurn, streaming],
  );

  const sendWidgetAnswer = useCallback(
    async (messageId: string, auswahl: string[]) => {
      setItems((prev) => prev.map((it) => (it.kind === "widget" && it.id === messageId ? { ...it, answered: true, auswahl } : it)));
      await runTurn({ widgetAntwort: { messageId, auswahl } });
    },
    [runTurn],
  );

  const beenden = useCallback(async () => {
    if (streaming || ended) return;
    await sendMessage("Bitte das Fazit", { hidden: true });
  }, [ended, sendMessage, streaming]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const legeKartenAn = useCallback(async () => {
    const cid = conversationIdRef.current;
    if (!cid || kartenAnlegend) return;
    setKartenAnlegend(true);
    try {
      const res = await fetch(`/api/lernen/tutor/${cid}/karten`, { method: "POST" });
      if (res.status === 409) {
        setKartenAngelegt(true);
        return;
      }
      if (!res.ok) {
        toast("Die Karten konnten nicht angelegt werden.");
        return;
      }
      const data = (await res.json().catch(() => null)) as { cards?: unknown[] } | null;
      setKartenAngelegt(true);
      toast(`${data?.cards?.length ?? 0} Karten angelegt`, "success");
    } catch {
      toast("Die Karten konnten nicht angelegt werden.");
    } finally {
      setKartenAnlegend(false);
    }
  }, [kartenAnlegend, toast]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // --- Zustaende ohne Chat --------------------------------------------------

  if (phase === "no-bot") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-6 py-16 text-center">
        <AlertTriangle className="size-6 text-muted-foreground" />
        <p className="max-w-sm text-[13px] text-muted-foreground">Der Tutor ist nicht eingerichtet: ZAI_API_KEY fehlt.</p>
        <Link
          href={topicId ? `/lernen/${subjectId}/themen/${topicId}` : `/lernen/${subjectId}`}
          className="text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {topicId ? "Zurück zum Thema" : "Zum Fach"}
        </Link>
      </div>
    );
  }

  if (phase === "not-found") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-[15px] font-medium">Thema nicht gefunden</p>
        <Link
          href={`/lernen/${subjectId}`}
          className="text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Zum Fach
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl min-w-0 flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4">
      <header className="flex min-w-0 items-center gap-2">
        <Link
          href={topicId ? `/lernen/${subjectId}/themen/${topicId}` : `/lernen/${subjectId}`}
          className="relative flex shrink-0 items-center gap-1 rounded-md py-1 text-[13px] text-muted-foreground transition-colors before:absolute before:-inset-1 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Zurück
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">
          {topicId ? (topicTitle ?? "Thema") : "Simulation"}
        </h1>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {modus === "probe" ? "Probe" : "Tutor"}
        </span>
        <Button type="button" size="sm" variant="outline" className="min-h-11 shrink-0" onClick={() => void beenden()} disabled={streaming || ended}>
          Beenden
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[1fr_280px]">
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          {checkliste && (
            <div className="md:hidden">
              <ChecklisteCard checkliste={checkliste} open={checklisteOpen} onToggle={() => setChecklisteOpen((o) => !o)} collapsible />
            </div>
          )}

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl border bg-card px-3 py-3 sm:px-4">
            {items.map((item) => (
              <ChatBubble key={item.id} item={item} onSendWidgetAnswer={sendWidgetAnswer} onWidgetDraftChange={setItems} onAnders={() => {
                setPendingFreeText(true);
                inputRef.current?.focus();
              }} disabled={streaming || ended} />
            ))}
            {ergebnis && <FazitCard subjectId={subjectId} topicId={topicId} modus={modus} ergebnis={ergebnis} kartenAngelegt={kartenAngelegt} onLegeKartenAn={legeKartenAn} anlegend={kartenAnlegend} />}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              <QuickButton label="skip" onClick={() => void sendMessage("skip")} disabled={streaming || ended} />
              <QuickButton label="erklär du alles" onClick={() => void sendMessage("erklär du alles")} disabled={streaming || ended} />
              <QuickButton label="gecheckt" onClick={() => void sendMessage("gecheckt")} disabled={streaming || ended} />
            </div>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={onInputChange}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={ended ? "Session beendet" : pendingFreeText ? "Deine Antwort …" : "Nachricht an den Tutor …"}
                disabled={streaming || ended}
                className="min-h-11 max-h-40 w-full min-w-0 resize-none rounded-md border bg-background px-3 py-2.5 text-base leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              {streaming ? (
                <Button type="button" size="icon" variant="outline" className="min-h-11 shrink-0" onClick={stop} aria-label="Stopp">
                  <Square className="size-4" />
                </Button>
              ) : (
                <Button type="button" size="default" className="min-h-11 shrink-0" onClick={() => void sendMessage(input)} disabled={!input.trim() || ended}>
                  Senden
                </Button>
              )}
            </div>
          </div>
        </div>

        {checkliste && (
          <div className="hidden md:block md:sticky md:top-4 md:self-start">
            <ChecklisteCard checkliste={checkliste} open onToggle={() => {}} collapsible={false} />
          </div>
        )}
      </div>
    </div>
  );
}

// --- Nachrichten-Bausteine ---------------------------------------------------

function QuickButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 rounded-full border px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function ChatBubble({
  item,
  onSendWidgetAnswer,
  onWidgetDraftChange,
  onAnders,
  disabled,
}: {
  item: ChatItem;
  onSendWidgetAnswer: (messageId: string, auswahl: string[]) => void;
  onWidgetDraftChange: React.Dispatch<React.SetStateAction<ChatItem[]>>;
  onAnders: (messageId: string) => void;
  disabled: boolean;
}) {
  if (item.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] min-w-0 break-words rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-[14px] leading-snug text-primary-foreground">
          {item.text}
        </div>
      </div>
    );
  }

  if (item.kind === "system") {
    return <p className="text-center text-[12px] text-muted-foreground">{item.text}</p>;
  }

  if (item.kind === "error") {
    return <p className="text-[12.5px] text-destructive">{item.text}</p>;
  }

  if (item.kind === "assistant") {
    const html = renderMarkdown(repairMissingParagraphBreaks(item.text));
    return (
      <div
        className={cn(
          "max-w-[92%] min-w-0 break-words text-[15px] leading-relaxed text-foreground",
          "[&>*+*]:mt-2.5",
          "[&_strong]:font-semibold [&_em]:italic",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-0.5",
          "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2.5 [&_pre]:font-mono [&_pre]:text-[13px]",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]",
          "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
          "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // widget
  const w = item;
  const open = isWidgetOpen(w);

  function toggleDraft(opt: string) {
    onWidgetDraftChange((prev) =>
      prev.map((it) => {
        if (it.kind !== "widget" || it.id !== w.id) return it;
        const has = it.draft.includes(opt);
        return { ...it, draft: has ? it.draft.filter((o) => o !== opt) : [...it.draft, opt] };
      }),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-[92%] min-w-0 break-words text-[15px] font-medium leading-snug text-foreground">{w.frage}</p>
      <div className="flex flex-wrap gap-1.5">
        {w.optionen.map((opt) => {
          const selected = w.mehrfach ? w.draft.includes(opt) : w.auswahl?.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              disabled={!open || disabled}
              onClick={() => (w.mehrfach ? toggleDraft(opt) : onSendWidgetAnswer(w.id, [opt]))}
              className={cn(
                "min-h-11 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-60",
                selected ? "border-primary bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
                open && !disabled && "cursor-pointer",
              )}
            >
              {opt}
            </button>
          );
        })}
        {open && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAnders(w.id)}
            className="min-h-11 rounded-full border border-dashed px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
          >
            Anders...
          </button>
        )}
      </div>
      {w.mehrfach && open && (
        <Button
          type="button"
          size="sm"
          className="min-h-11 w-fit"
          disabled={disabled || w.draft.length === 0}
          onClick={() => onSendWidgetAnswer(w.id, w.draft)}
        >
          Weiter
        </Button>
      )}
      {!open && w.freitext && <p className="text-[12.5px] text-muted-foreground">Anders: {w.freitext}</p>}
    </div>
  );
}

function ChecklisteCard({
  checkliste,
  open,
  onToggle,
  collapsible,
}: {
  checkliste: Checkliste;
  open: boolean;
  onToggle: () => void;
  collapsible: boolean;
}) {
  const erledigt = checkliste.aufgaben.filter((a) => a.status !== "offen").length;
  const gesamt = checkliste.aufgaben.length;
  const ersteOffeneNr = checkliste.aufgaben.find((a) => a.status === "offen")?.nr;

  const body = (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold">{checkliste.titel}</p>
        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
          {erledigt} von {gesamt}
        </span>
      </div>
      <ul className="space-y-1">
        {checkliste.aufgaben.map((a) => (
          <li
            key={a.nr}
            className={cn(
              "flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-[13px]",
              a.nr === ersteOffeneNr && "bg-accent",
            )}
          >
            <span aria-hidden className="shrink-0 tabular-nums text-muted-foreground">
              {NOTE_LABEL[a.status]}
            </span>
            <span className="min-w-0 flex-1 break-words">
              {a.nr}. {a.text}
            </span>
            <span aria-hidden className="shrink-0 text-muted-foreground" title={`Schwierigkeit ${a.schwierigkeit}`}>
              {"●".repeat(a.schwierigkeit)}
              {"○".repeat(Math.max(0, 3 - a.schwierigkeit))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  if (!collapsible) return body;

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-[13px] font-medium"
      >
        Checkliste {erledigt} von {gesamt}
        <span aria-hidden className="text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="px-3 pb-3">{body}</div>}
    </div>
  );
}

function FazitCard({
  subjectId,
  topicId,
  modus,
  ergebnis,
  kartenAngelegt,
  onLegeKartenAn,
  anlegend,
}: {
  subjectId: string;
  topicId: string | null;
  modus: TutorModusDTO;
  ergebnis: TutorErgebnis;
  kartenAngelegt: boolean;
  onLegeKartenAn: () => void;
  anlegend: boolean;
}) {
  const showKartenButton = ergebnis.neueKarten.length > 0 && !kartenAngelegt;

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <p className="text-[14px] font-semibold">Fazit</p>

      {modus === "probe" && typeof ergebnis.punkte === "number" && typeof ergebnis.gesamt === "number" && (
        <div className="rounded-lg bg-accent px-3 py-3 text-center">
          <p className="text-2xl font-semibold tabular-nums">
            {ergebnis.punkte} von {ergebnis.gesamt} Punkten
          </p>
          <p className="text-[13px] text-muted-foreground">
            {ergebnis.prozent ?? 0} % · Note {ergebnis.note ?? "-"}
          </p>
        </div>
      )}

      {modus === "probe" && (ergebnis.punkte === undefined || ergebnis.gesamt === undefined) && typeof ergebnis.prozent === "number" && (
        <div className="rounded-lg bg-accent px-3 py-3 text-center">
          <p className="text-2xl font-semibold tabular-nums">{ergebnis.prozent} %</p>
          <p className="text-[13px] text-muted-foreground">Note {ergebnis.note ?? "-"}</p>
        </div>
      )}

      {ergebnis.gutWar.length > 0 && (
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">Gut war</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
            {ergebnis.gutWar.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {ergebnis.schwach.length > 0 && (
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">Noch schwach</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
            {ergebnis.schwach.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {showKartenButton && (
          <Button type="button" size="sm" className="min-h-11" onClick={onLegeKartenAn} disabled={anlegend}>
            {anlegend ? "Legt an …" : `${ergebnis.neueKarten.length} Karten zu deinen Lücken anlegen`}
          </Button>
        )}
        {topicId && (
          <button
            type="button"
            // Voller Reload statt Link/router: garantiert eine neue Session --
            // ein Remount ueber key={session} wuerde die alte Session nur
            // "neu" starten, wenn die URL sich tatsaechlich aendert.
            onClick={() => window.location.assign(`/lernen/${subjectId}/tutor?thema=${topicId}&modus=lernen`)}
            className="inline-flex min-h-11 items-center rounded-md border px-3 text-[13px] font-medium transition-colors hover:bg-accent"
          >
            Nochmal üben
          </button>
        )}
        <Link
          href={topicId ? `/lernen/${subjectId}/themen/${topicId}` : `/lernen/${subjectId}`}
          className="inline-flex min-h-11 items-center rounded-md px-3 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {topicId ? "Zurück zum Thema" : "Zum Fach"}
        </Link>
      </div>
    </div>
  );
}
