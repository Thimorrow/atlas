"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Check, Loader2, NotebookPen, Pencil, Plus, Search, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TOAST_DURATION, useToast } from "@/components/toast";
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

// Monatsschluessel ("2026-09") fuer die Gruppierung -- getrennt vom Label,
// weil zwei verschiedene Monate nie denselben Schluessel teilen duerfen, ihr
// Label (z. B. bei einem Jahreswechsel) aber schon identisch aussehen kann.
function monthKey(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "unbekannt";
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function monthLabel(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "Unbekannt";
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

// Text, nach dem eine Notiz durchsucht wird: bei freien Notizen Titel plus
// Text, bei Stundennotizen nur der Text (kein eigener Titel vorhanden).
function searchText(entry: MergedEntry): string {
  return entry.kind === "note" ? `${entry.note.title} ${entry.note.body}` : entry.note.body;
}

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

// Eine Zeile der gemischten Liste (freie Notiz oder Stundennotiz). Aus dem
// Return von SubjectNotes herausgezogen -- war dort als verschachteltes
// Ternary in .map() kaum noch zu lesen, beide Varianten teilen ohnehin
// dieselbe Button-Huelle.
function MergedNoteRow({
  entry,
  onOpenNote,
  onOpenLessonNote,
}: {
  entry: MergedEntry;
  onOpenNote: (id: string) => void;
  onOpenLessonNote: (n: SubjectLessonNoteDTO) => void;
}) {
  const rowClass =
    "relative flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-xl border bg-card px-4 py-3 text-left transition-[background-color,border-color] duration-150 ease-[var(--ease-atlas)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [touch-action:manipulation]";

  if (entry.kind === "note") {
    return (
      <li>
        <button type="button" onClick={() => onOpenNote(entry.note.id)} className={rowClass}>
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
    );
  }

  return (
    <li>
      <button type="button" onClick={() => onOpenLessonNote(entry.note)} className={rowClass}>
        <span className="text-[12px] font-medium tabular-nums text-muted-foreground">
          {fmtLessonHeader(entry.note.date, entry.note.startTime)} · Stunde
        </span>
        <span className="line-clamp-2 w-full text-[13px] text-foreground">{entry.note.body}</span>
      </button>
    </li>
  );
}

// Monats-Ueberschrift ueber einer Gruppe von Notizen. Gleiches Muster wie
// GroupHeading in components/assignment-list.tsx (uppercase + geloeste
// tracking-wide, siehe design-foundations "Uppercase labels need loosened
// tracking") -- lokal nachgebaut statt importiert, weil GroupHeading dort
// nicht exportiert ist und eine zweite Notiz-spezifische Zeile (kein Zaehler,
// kein Fehlerfarbton) ohnehin einfacher als eigene, kleine Komponente bleibt.
function MonthHeading({ label }: { label: string }) {
  return (
    <h3 className="px-2.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </h3>
  );
}

// Inhalt des Lese-Overlays. Bekommt `note` garantiert nicht-null -- der
// Aufrufer rendert diese Komponente nur, wenn eine Notiz offen ist, damit
// das umschliessende <Overlay> weiter dessen eigenen Open/Close-Zustand
// steuert (AnimatePresence braucht die Kind-Identitaet stabil).
function ReadNoteBody({
  note,
  html,
  onClose,
  onDelete,
  onEdit,
  onenoteReady,
  send,
  onSendToOnenote,
}: {
  note: NoteDTO;
  html: string;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onenoteReady: boolean;
  send: SendState;
  onSendToOnenote: () => void;
}) {
  return (
    <>
      <header className="flex items-start gap-2 border-b bg-muted/30 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h3 id="note-read-title" className="text-[17px] font-semibold leading-tight tracking-tight">
            {note.title}
          </h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Zuletzt geändert am {fmtDate(note.updatedAt)}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Notiz schließen" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {note.body.trim() ? (
          <div className={PROSE} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="text-sm text-muted-foreground">Diese Notiz hat noch keinen Text.</p>
        )}
      </div>
      <footer className="flex items-center justify-between gap-2 border-t px-5 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
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
            <Button variant="outline" size="sm" disabled={send === "sending"} onClick={onSendToOnenote}>
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
          <Button size="sm" onClick={onEdit}>
            <Pencil className="size-4" />
            Bearbeiten
          </Button>
        </div>
      </footer>
    </>
  );
}

// Inhalt des Anlegen-/Bearbeiten-Overlays. `error` ist ein persistenter
// Hinweis (fehlender Titel, fehlgeschlagenes Speichern) -- bleibt anders als
// der Toast stehen, bis der naechste Speicherversuch oder eine Aenderung ihn
// ersetzt bzw. loescht (siehe SubjectNotes: onChange raeumt ihn live weg).
function EditNoteBody({
  editor,
  busy,
  error,
  onChange,
  onKeyDown,
  onCancel,
  onSave,
}: {
  editor: Editor;
  busy: boolean;
  error: string | null;
  onChange: (editor: Editor) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  // Bearbeiten/Vorschau ist rein lokaler UI-Zustand -- muss den Dialog nicht
  // ueberleben, deshalb kein Prop von aussen.
  const [mode, setMode] = useState<"write" | "preview">("write");
  const previewHtml = useMemo(() => renderMarkdown(editor.body), [editor.body]);

  return (
    <>
      <header className="flex items-start gap-2 border-b bg-muted/30 px-5 py-4">
        <h3 id="note-edit-title" className="flex-1 text-[17px] font-semibold leading-tight tracking-tight">
          {editor.id ? "Notiz bearbeiten" : "Neue Notiz"}
        </h3>
        <Button variant="ghost" size="icon" aria-label="Abbrechen" onClick={onCancel}>
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
            onChange={(e) => onChange({ ...editor, title: e.target.value })}
            onKeyDown={onKeyDown}
            placeholder="Worum geht es?"
            autoComplete="off"
            className="h-11 w-full rounded-lg border bg-background px-3 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 ease-[var(--ease-atlas)] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [touch-action:manipulation]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="note-body" className="text-[13px] font-medium">
              Text
            </label>
            {/* Segmented Control statt echtem ARIA-Tab: es fehlt die
                Pfeiltasten-Navigation, die role="tablist" verspricht --
                zwei Umschalt-Knoepfe mit aria-pressed geben ehrlich wieder,
                was tatsaechlich unterstuetzt wird. Sachlich derselbe Fall wie
                die Tabs-Ausnahme in design-foundations: zwei Ansichten
                desselben Inhalts (roh vs. gerendert). */}
            <div role="group" aria-label="Ansicht" className="flex items-center gap-0.5 rounded-md border p-0.5">
              {/* Sichtbar bleibt der schlanke Knopf (px-2 py-1) -- die reale
                  Trefferflaeche zieht das before-Pseudo-Element per -inset auf
                  >=40px hoch, derselbe Trick wie beim Button-Primitive
                  (components/ui/button.tsx). Ohne das waeren die 20px hohen
                  Knoepfe auf dem Handy kaum zu treffen. */}
              <button
                type="button"
                aria-pressed={mode === "write"}
                onClick={() => setMode("write")}
                className={cn(
                  "relative rounded px-2 py-1 text-[12px] font-medium transition-colors duration-150 ease-[var(--ease-atlas)] [touch-action:manipulation] before:absolute before:-inset-y-2.5 before:content-['']",
                  mode === "write" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Bearbeiten
              </button>
              <button
                type="button"
                aria-pressed={mode === "preview"}
                onClick={() => setMode("preview")}
                className={cn(
                  "relative rounded px-2 py-1 text-[12px] font-medium transition-colors duration-150 ease-[var(--ease-atlas)] [touch-action:manipulation] before:absolute before:-inset-y-2.5 before:content-['']",
                  mode === "preview" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Vorschau
              </button>
            </div>
          </div>
          {/* Bewusst ein einfaches Textfeld statt Rich-Text: Markdown
              bleibt sichtbar und lesbar, auch auf dem Handy. 16px
              Schriftgroesse verhindert den Auto-Zoom in iOS Safari. Die
              Vorschau daneben zeigt, was aus der Syntax wird, statt sie
              blind zu tippen und das Ergebnis erst nach dem Speichern in
              der Lese-Ansicht zu sehen. */}
          {mode === "write" ? (
            <textarea
              id="note-body"
              value={editor.body}
              onChange={(e) => onChange({ ...editor, body: e.target.value })}
              onKeyDown={onKeyDown}
              rows={10}
              placeholder={"## Überschrift\n- Punkt\n**fett**, `code`, [Link](https://…)"}
              className="min-h-[180px] w-full resize-y rounded-lg border bg-background px-3 py-2.5 font-mono text-[16px] leading-relaxed outline-none transition-[border-color,box-shadow] duration-150 ease-[var(--ease-atlas)] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [touch-action:manipulation]"
            />
          ) : (
            <div className="min-h-[180px] w-full rounded-lg border bg-background px-3 py-2.5">
              {editor.body.trim() ? (
                <div className={PROSE} dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <p className="text-sm text-muted-foreground">Noch kein Text.</p>
              )}
            </div>
          )}
          <p className="text-[12px] text-muted-foreground">
            Markdown wird unterstützt: Überschriften, Listen, Fett, Kursiv, Code und Links.
          </p>
        </div>
        {error ? (
          <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            <AlertCircle className="mt-px size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Abbrechen
        </Button>
        <Button size="sm" onClick={onSave} disabled={busy || !editor.title.trim()}>
          {busy ? "Speichert…" : "Speichern"}
        </Button>
      </footer>
    </>
  );
}

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
  const [busy, setBusy] = useState(false);
  const [send, setSend] = useState<SendState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Schwebende Loeschungen (id -> Notiz + Timer), solange die Undo-Frist
  // laeuft. Ein blosser window.setTimeout allein ist nicht genug: verlaesst
  // der Nutzer die Seite (Reload, Tab schliessen, harte Navigation) bevor er
  // ablaeuft, feuert er nie, die Notiz ist optimistisch aus der Liste weg,
  // aber serverseitig nie geloescht -- stille Inkonsistenz beim naechsten
  // Laden. Der Effekt unten holt jede noch offene Loeschung beim Unmount und
  // bei "pagehide" sofort nach.
  const pendingDeletesRef = useRef<Map<string, { note: NoteDTO; timer: number }>>(
    new Map(),
  );

  useEffect(() => {
    // keepalive haelt den Request am Leben, auch wenn die Seite im selben
    // Moment abgebaut wird -- ohne das Flag wuerde fetch beim Reload/Schliessen
    // abgebrochen, genau der Fall, den dieser Effekt abfangen soll.
    function flushPendingDeletes() {
      for (const [id, entry] of pendingDeletesRef.current) {
        clearTimeout(entry.timer);
        void fetch(`/api/notes/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
      }
      pendingDeletesRef.current.clear();
    }
    window.addEventListener("pagehide", flushPendingDeletes);
    return () => {
      window.removeEventListener("pagehide", flushPendingDeletes);
      flushPendingDeletes();
    };
  }, []);

  const open = useMemo(() => notes.find((n) => n.id === openId) ?? null, [notes, openId]);

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

  // Lokale Substring-Suche ueber Titel + Text -- kein Debounce noetig: es
  // filtert ein bereits im Speicher liegendes Array (typischerweise wenige
  // Dutzend Eintraege), kein Request pro Tastendruck wie bei einer serverseitigen
  // Suche, fuer die die 300ms-Regel gedacht ist.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter((entry) => searchText(entry).toLowerCase().includes(q));
  }, [merged, search]);

  // Nach Monat gruppiert, in derselben (schon absteigend sortierten)
  // Reihenfolge -- gleiche Monate liegen dadurch garantiert hintereinander,
  // ein zweiter Sortierschritt ist nicht noetig. Bei nur einer Gruppe bleibt
  // die Ueberschrift weg (siehe Render): bei drei Notizen aus demselben Monat
  // waere ein einzelnes "September 2026" ueber der Liste nur Rauschen.
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: MergedEntry[] }[] = [];
    for (const entry of filtered) {
      const key = monthKey(entry.ts);
      const last = out[out.length - 1];
      if (last && last.key === key) {
        last.items.push(entry);
      } else {
        out.push({ key, label: monthLabel(entry.ts), items: [entry] });
      }
    }
    return out;
  }, [filtered]);

  const html = useMemo(() => (open ? renderMarkdown(open.body) : ""), [open]);

  const upsert = useCallback((note: NoteDTO) => {
    setNotes((prev) => [note, ...prev.filter((n) => n.id !== note.id)].sort(byUpdatedDesc));
  }, []);

  async function save() {
    if (!editor || busy) return;
    const title = editor.title.trim();
    if (!title) {
      // Persistenter Hinweis im Dialog statt nur ein Toast: der Toast ist
      // nach 4s weg, das Formular bleibt aber offen -- ohne feste Anzeige
      // koennte man den Grund fuer den blockierten Speichern-Knopf verpassen.
      setSaveError("Die Notiz braucht einen Titel.");
      return;
    }
    setBusy(true);
    setSaveError(null);
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
        // Getippter Text bleibt im Editor-State stehen (kein setEditor(null))
        // -- ein fehlgeschlagenes Speichern darf niemals loeschen, was der
        // Nutzer schon geschrieben hat.
        const message = data?.error ?? "Die Notiz konnte nicht gespeichert werden.";
        setSaveError(message);
        toast(message);
        return;
      }
      upsert(data.note);
      setEditor(null);
      setSaveError(null);
      setOpenId(data.note.id);
    } catch {
      const message = "Keine Verbindung zum Server. Die Notiz wurde nicht gespeichert.";
      setSaveError(message);
      toast(message);
    } finally {
      setBusy(false);
    }
  }

  // Optimistisches Loeschen mit Undo-Toast statt Bestaetigungsdialog: die
  // Notiz verschwindet sofort aus der Liste, der tatsaechliche DELETE-Request
  // laeuft erst nach TOAST_DURATION (echt importiert aus components/toast.tsx,
  // nicht nur zufaellig dieselbe Zahl -- die Undo-Aktion verschwindet mit dem
  // Toast, die Frist muss exakt dazu passen). Klickt der Nutzer "Rueckgaengig",
  // wird der zugehoerige Timer geloescht, der Request also nie ausgeloest --
  // kein Server-Rundweg fuer die Undo-Faelle, die in der Praxis die meisten
  // sein duerften. Verlaesst der Nutzer die Seite vor Ablauf der Frist, holt
  // der Effekt oben (pendingDeletesRef) die Loeschung sofort nach, statt sie
  // stillschweigend zu verlieren.
  function remove(id: string) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;

    setNotes((prev) => prev.filter((n) => n.id !== id));
    setOpenId((cur) => (cur === id ? null : cur));

    const timer = window.setTimeout(() => {
      pendingDeletesRef.current.delete(id);
      void (async () => {
        try {
          const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
          if (!res.ok) {
            const data = (await res.json().catch(() => null)) as { error?: string } | null;
            // Server hat abgelehnt (z. B. schon geloescht) -- die Notiz war
            // lokal schon weg, jetzt zurueckholen statt sie stillschweigend
            // verloren zu geben.
            setNotes((prev) => [note, ...prev].sort(byUpdatedDesc));
            toast(data?.error ?? "Die Notiz konnte nicht gelöscht werden.");
          }
        } catch {
          setNotes((prev) => [note, ...prev].sort(byUpdatedDesc));
          toast("Keine Verbindung zum Server. Die Notiz wurde nicht gelöscht.");
        }
      })();
    }, TOAST_DURATION);

    pendingDeletesRef.current.set(id, { note, timer });

    toast("Notiz gelöscht", "success", {
      label: "Rückgängig",
      onClick: () => {
        const pending = pendingDeletesRef.current.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          pendingDeletesRef.current.delete(id);
        }
        setNotes((prev) => [note, ...prev].sort(byUpdatedDesc));
      },
    });
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

  // Editor mit leerem Formular oder mit einer bestehenden Notiz oeffnen --
  // an beiden Stellen dieselbe Aufraeumarbeit (alter Fehler weg), deshalb ein
  // gemeinsamer Helfer statt zwei fast identischer Inline-Arrows.
  function openEditor(next: Editor) {
    setSaveError(null);
    setEditor(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {merged.length === 0
            ? "Noch keine Notizen"
            : `${merged.length} ${merged.length === 1 ? "Notiz" : "Notizen"}`}
        </p>
        <Button size="sm" variant="outline" onClick={() => openEditor({ id: null, title: "", body: "" })}>
          <Plus className="size-4" />
          Neue Notiz
        </Button>
      </div>

      {/* Suche: erst ab ein paar Notizen sichtbar -- bei zwei, drei Eintraegen
          waere ein Suchfeld reine Flaeche ohne Nutzen. Lokale Filterung ueber
          ein Array im Speicher, kein Request pro Tastendruck. */}
      {merged.length > 4 ? (
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Notizen durchsuchen…"
            aria-label="Notizen durchsuchen"
            spellCheck={false}
            autoComplete="off"
            className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 ease-[var(--ease-atlas)] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [touch-action:manipulation]"
          />
        </div>
      ) : null}

      {merged.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <NotebookPen className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Noch keine Notizen</p>
          <p className="max-w-[38ch] text-[13px] text-muted-foreground">
            Lege oben eine freie Notiz an oder schreib direkt an einer Stunde im Stundenplan.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <Search className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Keine Treffer</p>
          <p className="max-w-[38ch] text-[13px] text-muted-foreground">
            Keine Notiz enthält „{search.trim()}“. Prüf die Schreibweise oder such nach einem anderen Begriff.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-2">
              {/* Nur bei mehr als einer Monatsgruppe -- ein einzelnes
                  "September 2026" ueber der ganzen Liste waere blosse
                  Wiederholung, keine neue Information. */}
              {groups.length > 1 ? <MonthHeading label={g.label} /> : null}
              <ul className="flex flex-col gap-2">
                {g.items.map((entry) => (
                  <MergedNoteRow
                    key={entry.kind === "note" ? `note-${entry.note.id}` : `lesson-${entry.note.id}`}
                    entry={entry}
                    onOpenNote={setOpenId}
                    onOpenLessonNote={onOpenLessonNote}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Lesen */}
      <Overlay open={!!open} onClose={() => setOpenId(null)} labelledBy="note-read-title">
        {open ? (
          <ReadNoteBody
            note={open}
            html={html}
            onClose={() => setOpenId(null)}
            onDelete={() => remove(open.id)}
            onEdit={() => openEditor({ id: open.id, title: open.title, body: open.body })}
            onenoteReady={onenoteReady}
            send={send}
            onSendToOnenote={() => void sendToOnenote(open.id)}
          />
        ) : null}
      </Overlay>

      {/* Anlegen und Bearbeiten */}
      <Overlay open={!!editor} onClose={() => setEditor(null)} labelledBy="note-edit-title">
        {editor ? (
          <EditNoteBody
            editor={editor}
            busy={busy}
            error={saveError}
            onChange={(next) => {
              setSaveError(null);
              setEditor(next);
            }}
            onKeyDown={onEditorKeyDown}
            onCancel={() => setEditor(null)}
            onSave={() => void save()}
          />
        ) : null}
      </Overlay>
    </div>
  );
}
