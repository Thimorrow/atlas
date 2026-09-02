"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, NotebookPen, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { markdownPreview, renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

// Atlas-Signaturkurve, wie in components/stagger.tsx.
const EASE = [0.22, 1, 0.36, 1] as const;

// Typ-only-Import: `lib/subject-store` zieht die DB nach, der Typ selbst wird
// beim Build wegkompiliert und landet nicht im Client-Bundle.
import type { NoteDTO } from "@/lib/subject-store";
export type { NoteDTO };
import { weekdayOf } from "@/lib/assignments-view";

// Bewusst gespiegelt statt aus lib/lesson-notes.ts importiert: das Modul
// zieht `db` herein, und diese Datei ist eine Client-Komponente. `import
// type` wuerde zwar wegkompiliert, aber ein spaeteres Streichen des `type`
// holte die Datenbank still in den Browser-Bundle. Die Form muss zu
// SubjectLessonNoteDTO dort passen; sie ist der einzige Ort, der sie liefert.
export type SubjectLessonNoteDTO = {
  id: string;
  schoolBlockId: string;
  date: string;
  startTime: string;
  body: string;
  updatedAt: string;
};

// Typografie fuer den gerenderten Markdown-Body. Der Wrapper stylt die
// Kind-Elemente ueber Attribut-Selektoren, weil das HTML aus
// dangerouslySetInnerHTML kommt und keine Klassen tragen kann.
const PROSE = cn(
  "text-[15px] leading-relaxed text-foreground",
  "[&>*+*]:mt-3",
  "[&_h2]:mt-5 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:tracking-tight",
  "[&_h3]:mt-4 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:leading-tight",
  "[&_h1]:mt-5 [&_h1]:text-[19px] [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:tracking-tight",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 [&_li]:marker:text-muted-foreground",
  "[&_strong]:font-semibold [&_em]:italic",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:break-words",
  "[&_hr]:my-4 [&_hr]:border-t",
  "[&_img]:rounded-lg",
);

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const byUpdatedDesc = (a: NoteDTO, b: NoteDTO) => b.updatedAt.localeCompare(a.updatedAt);

const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// "Mi 02.09., 09:40" fuer den Kopf einer Stundennotiz -- dateISO kommt als
// YYYY-MM-DD, deshalb String-Zerlegung statt Date-Objekt (wie fmtLessonDate
// in subject-detail.tsx). weekdayOf rechnet lokal, kein UTC-Drift.
function fmtLessonHeader(dateISO: string, startTime: string) {
  const [, m, d] = dateISO.split("-");
  const wd = WEEKDAYS_SHORT[weekdayOf(dateISO)];
  return `${wd} ${d}.${m}., ${startTime.slice(0, 5)}`;
}

type MergedEntry =
  | { kind: "note"; ts: string; note: NoteDTO }
  | { kind: "lesson"; ts: string; note: SubjectLessonNoteDTO };

// Ein einziges Overlay-Gehaeuse fuer Lesen, Bearbeiten und Loeschbestaetigung.
// window.confirm ist bewusst nicht im Spiel: es laesst sich nicht gestalten,
// blockiert den Thread und sieht auf dem Handy fremd aus.
// Exportiert, weil components/lesson-note.tsx dasselbe Gehaeuse braucht --
// eine zweite, fast identische Overlay-Implementierung waere reine
// Kopie ohne eigenen Grund.
export function Overlay({
  open,
  onClose,
  labelledBy,
  children,
  className,
  backdropClassName,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
  // Ueberschreibt den Standard-Hintergrund (kraeftig getoent + verwischt).
  // Der Bot-Overlay ueber dem Stundenplan braucht einen leichteren Schleier,
  // damit die Seite dahinter erkennbar bleibt -- Lese-/Bearbeiten-Dialoge
  // hier bleiben unveraendert.
  backdropClassName?: string;
}) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // onClose kommt als Inline-Arrow rein und aendert bei jedem Render seine
  // Identitaet. Ueber eine Ref bleibt der Effekt an `open` haengen -- sonst
  // laeuft sein Cleanup bei jedem Render und reisst den Fokus aus dem Dialog.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    // Fokus in den Dialog holen: erst ein bewusst markiertes Feld, sonst das
    // Panel selbst (tabIndex -1), damit Tab dort weitergeht und nicht im
    // Hintergrund landet.
    const first = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    (first ?? panelRef.current)?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
            className={cn("absolute inset-0 bg-background/70 backdrop-blur-sm", backdropClassName)}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            // Escape haengt am Panel, nicht am document: der Fokus liegt immer
            // im obersten Dialog, also bekommt genau dieser das Ereignis. Ein
            // document-Listener wuerde beim Bestaetigen-Dialog gleichzeitig den
            // darunterliegenden Lese-Dialog schliessen.
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                closeRef.current();
                return;
              }
              // Fokus-Falle: aria-modal="true" verspricht, dass Tab den
              // Dialog nicht verlaesst. Die fokussierbaren Elemente frisch aus
              // dem DOM holen statt einmalig zu cachen, weil sich der Inhalt
              // des Panels aendert (Lesen/Bearbeiten/Loeschen sind je ein
              // eigener Overlay-Aufruf mit eigenem Kindbaum).
              if (e.key === "Tab") {
                const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
                  'a[href], button, textarea, input, select, [tabindex]',
                );
                const items = Array.from(focusable ?? []).filter(
                  (el) => !el.hasAttribute("disabled") && !el.hasAttribute("hidden") && el.tabIndex !== -1,
                );
                if (items.length === 0) {
                  // Nichts Fokussierbares im Panel -- der Fokus bleibt auf dem
                  // Panel selbst (tabIndex -1), statt in den Hintergrund zu
                  // entkommen.
                  e.preventDefault();
                  panelRef.current?.focus();
                  return;
                }
                const first = items[0];
                const last = items[items.length - 1];
                const active = document.activeElement;
                if (e.shiftKey ? active === first || !items.includes(active as HTMLElement) : active === last) {
                  e.preventDefault();
                  (e.shiftKey ? last : first).focus();
                }
              }
            }}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: EASE }}
            className={cn(
              "relative flex max-h-[88svh] w-full flex-col overflow-hidden rounded-t-2xl border bg-card text-card-foreground shadow-popover outline-none sm:max-w-lg sm:rounded-2xl",
              className,
            )}
          >
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

type Editor = { id: string | null; title: string; body: string };

// Zustand des OneNote-Knopfs. "sent" haelt die Bestaetigung kurz stehen --
// ohne sie klickt man ein zweites Mal, um zu pruefen, ob es geklappt hat.
type SendState = "idle" | "sending" | "sent";

export function SubjectNotes({
  subjectId,
  initialNotes,
  lessonNotes,
  onOpenLessonNote,
  onenoteReady = false,
}: {
  subjectId: string;
  initialNotes: NoteDTO[];
  // Lebt komplett in subject-detail.tsx (Laden, Editor, Autosave) -- hier
  // nur zum Anzeigen, deshalb direkt das Prop verwenden statt eine eigene
  // Kopie im State zu halten wie bei den freien Notizen.
  lessonNotes: SubjectLessonNoteDTO[];
  onOpenLessonNote: (n: SubjectLessonNoteDTO) => void;
  // true erst, wenn Microsoft verbunden UND fuer dieses Fach ein Abschnitt
  // gewaehlt ist. Sonst gibt es den Knopf gar nicht, statt ihn tot anzuzeigen.
  onenoteReady?: boolean;
}) {
  const toast = useToast();
  const [notes, setNotes] = useState<NoteDTO[]>(() => [...initialNotes].sort(byUpdatedDesc));
  const [openId, setOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [send, setSend] = useState<SendState>("idle");

  const open = useMemo(() => notes.find((n) => n.id === openId) ?? null, [notes, openId]);
  const confirmNote = useMemo(() => notes.find((n) => n.id === confirmId) ?? null, [notes, confirmId]);

  // Beide Notizarten chronologisch gemischt, neuste zuerst. Bei einer
  // Stundennotiz zaehlt der Termin der Stunde (Datum + Uhrzeit), nicht
  // updatedAt -- der Nutzer sucht "wann war die Stunde", nicht "wann habe
  // ich zuletzt getippt".
  const merged = useMemo<MergedEntry[]>(() => {
    const freeItems: MergedEntry[] = notes.map((n) => ({ kind: "note", ts: n.updatedAt, note: n }));
    const lessonItems: MergedEntry[] = lessonNotes.map((n) => ({
      kind: "lesson",
      ts: `${n.date}T${n.startTime}`,
      note: n,
    }));
    return [...freeItems, ...lessonItems].sort((a, b) => b.ts.localeCompare(a.ts));
  }, [notes, lessonNotes]);

  const html = useMemo(() => (open ? renderMarkdown(open.body) : ""), [open]);

  const upsert = useCallback((note: NoteDTO) => {
    setNotes((prev) => [note, ...prev.filter((n) => n.id !== note.id)].sort(byUpdatedDesc));
  }, []);

  async function save() {
    if (!editor || busy) return;
    const title = editor.title.trim();
    if (!title) {
      toast("Die Notiz braucht einen Titel.");
      return;
    }
    setBusy(true);
    try {
      const res = editor.id
        ? await fetch(`/api/notes/${editor.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title, body: editor.body }),
          })
        : await fetch(`/api/subjects/${subjectId}/notes`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title, body: editor.body }),
          });
      const data = (await res.json().catch(() => null)) as { note?: NoteDTO; error?: string } | null;
      if (!res.ok || !data?.note) {
        toast(data?.error ?? "Die Notiz konnte nicht gespeichert werden.");
        return;
      }
      upsert(data.note);
      setEditor(null);
      setOpenId(data.note.id);
    } catch {
      toast("Keine Verbindung zum Server. Die Notiz wurde nicht gespeichert.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast(data?.error ?? "Die Notiz konnte nicht gelöscht werden.");
        return;
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setConfirmId(null);
      setOpenId((cur) => (cur === id ? null : cur));
    } catch {
      toast("Keine Verbindung zum Server. Die Notiz wurde nicht gelöscht.");
    } finally {
      setBusy(false);
    }
  }

  // Beim Wechsel der geoeffneten Notiz zurueck auf Anfang: eine stehengebliebene
  // Bestaetigung wuerde sonst an der naechsten Notiz haengen, die noch nirgends
  // gelandet ist.
  useEffect(() => {
    setSend("idle");
  }, [openId]);

  async function sendToOnenote(id: string) {
    if (send !== "idle") return;
    setSend("sending");
    try {
      const res = await fetch(`/api/notes/${id}/onenote`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast(data?.error ?? "Die Notiz konnte nicht an OneNote gesendet werden.");
        setSend("idle");
        return;
      }
      setSend("sent");
      window.setTimeout(() => setSend("idle"), 2500);
    } catch {
      toast("Keine Verbindung zum Server. Die Notiz wurde nicht gesendet.");
      setSend("idle");
    }
  }

  // Cmd/Ctrl+Enter speichert aus dem Textfeld heraus, ohne zum Button zu greifen.
  function onEditorKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {merged.length === 0
            ? "Noch keine Notizen"
            : `${merged.length} ${merged.length === 1 ? "Notiz" : "Notizen"}`}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditor({ id: null, title: "", body: "" })}
        >
          <Plus className="size-4" />
          Neue Notiz
        </Button>
      </div>

      {merged.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <NotebookPen className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Hier landen deine Notizen zum Fach: eine freie Notiz legst du über „Neue Notiz" an, eine
            Stundennotiz schreibst du direkt an der Stunde im Stundenplan.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {merged.map((entry) =>
            entry.kind === "note" ? (
              <li key={`note-${entry.note.id}`}>
                <button
                  type="button"
                  onClick={() => setOpenId(entry.note.id)}
                  className="relative flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-xl border bg-card px-4 py-3 text-left transition-[background-color,border-color] duration-150 ease-[var(--ease-atlas)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="flex w-full items-baseline justify-between gap-3">
                    <span className="truncate text-[15px] font-medium leading-tight">{entry.note.title}</span>
                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                      {fmtDate(entry.note.updatedAt)}
                    </span>
                  </span>
                  <span className="line-clamp-1 w-full text-[13px] text-muted-foreground">
                    {markdownPreview(entry.note.body) || "Kein Text"}
                  </span>
                </button>
              </li>
            ) : (
              <li key={`lesson-${entry.note.id}`}>
                <button
                  type="button"
                  onClick={() => onOpenLessonNote(entry.note)}
                  className="relative flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-xl border bg-card px-4 py-3 text-left transition-[background-color,border-color] duration-150 ease-[var(--ease-atlas)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="text-[12px] font-medium tabular-nums text-muted-foreground">
                    {fmtLessonHeader(entry.note.date, entry.note.startTime)} · Stunde
                  </span>
                  <span className="line-clamp-2 w-full text-[13px] text-foreground">{entry.note.body}</span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {/* Lesen */}
      <Overlay open={!!open} onClose={() => setOpenId(null)} labelledBy="note-read-title">
        {open ? (
          <>
            <header className="flex items-start gap-2 border-b bg-muted/30 px-5 py-4">
              <div className="min-w-0 flex-1">
                <h3 id="note-read-title" className="text-[17px] font-semibold leading-tight tracking-tight">
                  {open.title}
                </h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Zuletzt geändert am {fmtDate(open.updatedAt)}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Notiz schließen" onClick={() => setOpenId(null)}>
                <X className="size-4" />
              </Button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {open.body.trim() ? (
                <div className={PROSE} dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <p className="text-sm text-muted-foreground">Diese Notiz hat noch keinen Text.</p>
              )}
            </div>
            <footer className="flex items-center justify-between gap-2 border-t px-5 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmId(open.id)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Löschen
              </Button>
              <div className="flex items-center gap-2">
                {/* Der Text im Knopf aendert sich, das meldet kein Screenreader
                    von selbst -- deshalb dieselbe Auskunft noch einmal als
                    unsichtbare Live-Region. */}
                <span role="status" aria-live="polite" className="sr-only">
                  {send === "sending"
                    ? "Notiz wird an OneNote gesendet."
                    : send === "sent"
                      ? "Notiz wurde in OneNote angelegt."
                      : ""}
                </span>
                {onenoteReady && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={send === "sending"}
                    onClick={() => void sendToOnenote(open.id)}
                  >
                    {send === "sending" ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : send === "sent" ? (
                      <Check aria-hidden="true" className="size-4" />
                    ) : (
                      <Send aria-hidden="true" className="size-4" />
                    )}
                    {/* Alle drei Beschriftungen liegen in derselben Grid-Zelle:
                        der Knopf reserviert die Breite des laengsten Texts und
                        springt beim Wechsel nicht. */}
                    <span className="relative inline-grid">
                      <span className={cn("col-start-1 row-start-1", send !== "idle" && "invisible")}>
                        An OneNote senden
                      </span>
                      <span className={cn("col-start-1 row-start-1", send !== "sending" && "invisible")}>
                        Wird gesendet …
                      </span>
                      <span className={cn("col-start-1 row-start-1", send !== "sent" && "invisible")}>
                        In OneNote angelegt
                      </span>
                    </span>
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => setEditor({ id: open.id, title: open.title, body: open.body })}
                >
                  <Pencil className="size-4" />
                  Bearbeiten
                </Button>
              </div>
            </footer>
          </>
        ) : null}
      </Overlay>

      {/* Anlegen und Bearbeiten */}
      <Overlay open={!!editor} onClose={() => setEditor(null)} labelledBy="note-edit-title">
        {editor ? (
          <>
            <header className="flex items-start gap-2 border-b bg-muted/30 px-5 py-4">
              <h3 id="note-edit-title" className="flex-1 text-[17px] font-semibold leading-tight tracking-tight">
                {editor.id ? "Notiz bearbeiten" : "Neue Notiz"}
              </h3>
              <Button variant="ghost" size="icon" aria-label="Abbrechen" onClick={() => setEditor(null)}>
                <X className="size-4" />
              </Button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="note-title" className="text-[13px] font-medium">
                  Titel
                </label>
                <input
                  id="note-title"
                  data-autofocus
                  value={editor.title}
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                  onKeyDown={onEditorKeyDown}
                  placeholder="Worum geht es?"
                  autoComplete="off"
                  className="h-11 w-full rounded-lg border bg-background px-3 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 ease-[var(--ease-atlas)] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="note-body" className="text-[13px] font-medium">
                  Text
                </label>
                {/* Bewusst ein einfaches Textfeld statt Rich-Text: Markdown
                    bleibt sichtbar und lesbar, auch auf dem Handy. 16px
                    Schriftgroesse verhindert den Auto-Zoom in iOS Safari. */}
                <textarea
                  id="note-body"
                  value={editor.body}
                  onChange={(e) => setEditor({ ...editor, body: e.target.value })}
                  onKeyDown={onEditorKeyDown}
                  rows={10}
                  placeholder={"## Überschrift\n- Punkt\n**fett**, `code`, [Link](https://…)"}
                  className="min-h-[180px] w-full resize-y rounded-lg border bg-background px-3 py-2.5 font-mono text-[16px] leading-relaxed outline-none transition-[border-color,box-shadow] duration-150 ease-[var(--ease-atlas)] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
                <p className="text-[12px] text-muted-foreground">
                  Markdown wird unterstützt: Überschriften, Listen, Fett, Kursiv, Code und Links.
                </p>
              </div>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <Button variant="ghost" size="sm" onClick={() => setEditor(null)} disabled={busy}>
                Abbrechen
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={busy || !editor.title.trim()}>
                {busy ? "Speichert…" : "Speichern"}
              </Button>
            </footer>
          </>
        ) : null}
      </Overlay>

      {/* Loeschen bestaetigen */}
      <Overlay
        open={!!confirmNote}
        onClose={() => setConfirmId(null)}
        labelledBy="note-delete-title"
        className="sm:max-w-sm"
      >
        {confirmNote ? (
          <div className="px-5 py-5">
            <h3 id="note-delete-title" className="text-[16px] font-semibold leading-tight tracking-tight">
              Notiz löschen?
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              „{confirmNote.title}“ wird endgültig entfernt. Das lässt sich nicht rückgängig machen.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)} disabled={busy}>
                Abbrechen
              </Button>
              <Button
                size="sm"
                data-autofocus
                onClick={() => void remove(confirmNote.id)}
                disabled={busy}
                // Es gibt kein --destructive-foreground-Token: text-background
                // traegt in beiden Themes. Weiss waere im Dunkelmodus zu blass,
                // dort ist --destructive ein helles Rot.
                className="bg-destructive text-background hover:bg-destructive/90"
              >
                {busy ? "Löscht…" : "Löschen"}
              </Button>
            </div>
          </div>
        ) : null}
      </Overlay>
    </div>
  );
}
