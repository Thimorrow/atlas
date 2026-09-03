"use client";

// Eigenstaendiger Anlege-Flow fuer Pruefungen (Klassenarbeit, Test, Referat).
// Bewusst eine eigene Komponente statt AssignmentComposer wiederzuverwenden:
// eine Klassenarbeit ist keine umbenannte Hausaufgabe. Der Termin ist das
// wichtigste Feld (nicht "faellig", die Arbeit wird an dem Tag geschrieben),
// das Fach ist praktisch nie leer, und ein Typ-Auswahlfeld mitten im
// Formular waere fuer drei fast gleichwertige Werte zu viel Gewicht -- die
// Art sitzt kompakt im Kopf, nicht als eigener Formular-Block.
//
// AssignmentComposer bedient weiterhin die Hausaufgaben-Seite, an der
// parallel gearbeitet wird -- eine geteilte Datei anzufassen waere hier
// unnoetiges Merge-Risiko. Nur das Anlegen ist hier vorgesehen (auf
// /pruefungen wird keine Pruefung bearbeitet), die PATCH-Variante entfaellt.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GraduationCap, Presentation, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { colorValue } from "@/lib/subject-colors";
import {
  addDays,
  daysUntilLabel,
  localISO,
  sameDayCount,
  weekdayDateLabel,
  type AssignmentDTO,
  type AssignmentType,
} from "@/lib/assignments-view";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

// Nur diese drei Typen zaehlen als Pruefung -- siehe isExamPageType in
// lib/assignments-view.ts. Reihenfolge = Schwere, nicht Alphabet.
const EXAM_TYPES: AssignmentType[] = ["exam", "test", "presentation"];
const TYPE_ICON: Record<AssignmentType, typeof GraduationCap> = {
  homework: GraduationCap,
  exam: GraduationCap,
  test: GraduationCap,
  presentation: Presentation,
  other: GraduationCap,
};
// Grammatisches Geschlecht pro Typ fuer die Ueberschrift: "Neue
// Klassenarbeit" / "Neuer Test" / "Neues Referat" -- TYPE_LABEL allein
// (nur der Substantiv-Stamm) reicht dafuer nicht.
const NEW_HEADING: Record<AssignmentType, string> = {
  homework: "Neue Hausaufgabe",
  exam: "Neue Klassenarbeit",
  test: "Neuer Test",
  presentation: "Neues Referat",
  other: "Neuer Eintrag",
};
const TYPE_SHORT_LABEL: Record<AssignmentType, string> = {
  homework: "Hausaufgabe",
  exam: "Klassenarbeit",
  test: "Test",
  presentation: "Referat",
  other: "Sonstiges",
};

type SubjectOption = { id: string; name: string; color: string | null };

// text-[16px] ist Pflicht: iOS-Safari zoomt sonst beim Fokus in jedes Feld
// unter 16px und verlaesst den Dialog optisch (siehe assignment-composer.tsx).
const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-[16px] leading-snug outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const LABEL = "mb-1.5 block text-[13px] font-medium text-muted-foreground";

// Schnellauswahl fuer den Termin -- bei einer Pruefung liegt das Datum fast
// immer in der naeheren Zukunft, ein Tippen spart den Umweg ueber den
// nativen Datepicker.
function dateShortcuts(today: string): { label: string; date: string }[] {
  return [
    { label: "In 1 Woche", date: addDays(today, 7) },
    { label: "In 2 Wochen", date: addDays(today, 14) },
    { label: "In 4 Wochen", date: addDays(today, 28) },
  ];
}

export function ExamComposer({
  open,
  onOpenChange,
  subjects,
  // Andere anstehende Pruefungen, ausschliesslich fuer den
  // Kollisions-Hinweis ("2 weitere an diesem Tag") -- die neue Arbeit selbst
  // ist darin nicht enthalten.
  existingExams,
  // Additiv fuer Aufrufer mit bereits bekanntem Fach (z.B. die Fach-Seite):
  // vorbelegt, aber weiterhin aenderbar. Ohne Angabe verhaelt sich der
  // Composer wie bisher -- leer, bis eine Auswahl getroffen wird.
  initialSubjectId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: SubjectOption[];
  existingExams: AssignmentDTO[];
  initialSubjectId?: string;
  onSaved: (a: AssignmentDTO) => void;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const toast = useToast();
  const uid = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const subjectGroupRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const [type, setType] = useState<AssignmentType>("exam");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // Nur "beruehrt" zeigt einen Fehler -- vor dem ersten Verlassen des Felds
  // waere ein leeres Pflichtfeld noch keine falsche Eingabe, nur eine offene.
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [today, setToday] = useState(() => localISO());

  // Ohne ein einziges angelegtes Fach waere ein Pflichtfeld eine Sackgasse --
  // dann bleibt die Auswahl optional, bis es etwas zum Waehlen gibt.
  const subjectRequired = subjects.length > 0;
  const subjectError =
    subjectRequired && subjectTouched && !subjectId ? "Bitte ein Fach wählen." : null;
  const titleError = titleTouched && !title.trim() ? "Titel darf nicht leer sein." : null;
  const collisions = dueDate ? sameDayCount(existingExams, dueDate) : 0;

  useEffect(() => {
    if (!open) return;
    setType("exam");
    setSubjectId(initialSubjectId ?? "");
    setTitle("");
    setDueDate("");
    setNotes("");
    setSaving(false);
    setSubjectTouched(false);
    setTitleTouched(false);
    setToday(localISO());
    restoreRef.current = document.activeElement as HTMLElement | null;
    // Auf Touch-Geraeten poppt Autofokus die Tastatur ungefragt hoch --
    // dort bleibt der Termin unfokussiert, bis der Finger ihn beruehrt.
    const isTouch = typeof window !== "undefined" && "ontouchstart" in window;
    const t = isTouch ? null : window.setTimeout(() => dateRef.current?.focus(), 20);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (t) window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!nodes || nodes.length === 0) return;
    const list = Array.from(nodes).filter((n) => !n.hasAttribute("disabled"));
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    const subjectMissing = subjectRequired && !subjectId;
    if (subjectMissing) {
      setSubjectTouched(true);
      subjectGroupRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      if (trimmed) return;
    }
    if (!trimmed) {
      setTitleTouched(true);
      titleRef.current?.focus();
    }
    if (subjectMissing || !trimmed || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          type,
          subjectId: subjectId || null,
          untisSubject: null,
          dueDate: dueDate || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { assignment: AssignmentDTO };
      onSaved(data.assignment);
      close();
    } catch {
      toast("Die Prüfung konnte nicht angelegt werden.");
      setSaving(false);
    }
  }

  // Cmd/Ctrl+Enter aus der Notiz heraus abschicken, wie bei jedem Mehrzeiler
  // -- Enter allein muss dort einen Zeilenumbruch machen duerfen.
  const onNotesKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            onClick={close}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${uid}-title`}
            onKeyDown={onKeyDown}
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border bg-card shadow-popover sm:max-h-[85dvh] sm:rounded-2xl"
          >
            <header className="shrink-0 border-b bg-muted/30 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <h2 id={`${uid}-title`} className="text-[15px] font-semibold leading-tight tracking-tight">
                  {NEW_HEADING[type]}
                </h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Schließen"
                  className="relative -mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.96]"
                >
                  <X className="size-4" />
                </button>
              </div>
              {/* Die Art sitzt kompakt im Kopf statt als eigener
                  Formular-Block: drei fast gleichwertige Werte brauchen kein
                  volles Feld mit Label, ein Icon-Toggle traegt die gleiche
                  Information in einer Zeile. */}
              <div role="group" aria-label="Art der Prüfung" className="mt-2.5 flex gap-1.5">
                {EXAM_TYPES.map((t) => {
                  const Icon = TYPE_ICON[t];
                  const active = type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      aria-pressed={active}
                      className={cn(
                        // Sichtbar bleibt der Chip klein, das Pseudo-Element hebt die
                        // Trefferflaeche ueber die 44px-Mindestgroesse (22px Chip +
                        // 2x12px Polster).
                        "relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-medium transition-colors [touch-action:manipulation] before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.96]",
                        active
                          ? "border-foreground/25 bg-background text-foreground"
                          : "border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground",
                      )}
                    >
                      <Icon className="size-3.5" strokeWidth={2.25} />
                      {TYPE_SHORT_LABEL[t]}
                    </button>
                  );
                })}
              </div>
            </header>

            {/* overflow-y-auto: bei vielen Faechern wachsen die Chips ueber
                eine Bildschirmhoehe hinaus, dann muss der Inhalt statt der
                Anlegen-Schaltflaeche verschwinden. Safe-Area-Padding unten,
                weil das Blatt auf dem Handy bis an die Kante reicht. */}
            <form
              onSubmit={save}
              className="space-y-4 overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            >
              {/* Termin zuerst und am groessten: das ist die eigentliche
                  Frage bei einer Pruefung, nicht ein Faelligkeitsdatum wie
                  bei einer Hausaufgabe -- die Arbeit findet an dem Tag statt. */}
              <div>
                <label className={LABEL} htmlFor={`${uid}-due`}>
                  Termin
                </label>
                <input
                  id={`${uid}-due`}
                  ref={dateRef}
                  type="date"
                  className={cn(FIELD, "text-[17px] font-medium")}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {dateShortcuts(today).map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setDueDate((cur) => (cur === s.date ? "" : s.date))}
                      aria-pressed={dueDate === s.date}
                      className={cn(
                        // Sichtbar bleibt der Chip klein, die Trefferflaeche wird per
                        // Pseudo-Element auf die 44px-Mindestgroesse angehoben.
                        "relative rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors [touch-action:manipulation] before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.96]",
                        dueDate === s.date
                          ? "border-foreground/25 bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {/* Vorlauf und Kollision: beides Information, die eine reine
                    Datumseingabe verschluckt -- wie lange noch, und ob an dem
                    Tag schon etwas anderes ansteht. */}
                {dueDate && (
                  <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                    {weekdayDateLabel(dueDate)} · {daysUntilLabel(dueDate, today)}
                    {collisions > 0 && (
                      <span className="font-medium text-foreground/70">
                        {" "}
                        · {collisions} weitere {collisions === 1 ? "Prüfung" : "Prüfungen"} an diesem Tag
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Fach als Chip-Raster statt Select, und Pflichtfeld: eine
                  Klassenarbeit ohne Fach ist der Ausnahmefall, nicht die
                  Regel -- anders als bei einer Hausaufgabe. Ohne ein einziges
                  angelegtes Fach waere ein Pflichtfeld aber eine Sackgasse,
                  deshalb bleibt die Auswahl dann optional (subjectRequired). */}
              <div>
                <span className={LABEL} id={`${uid}-subject-label`}>
                  Fach{subjectRequired && <span aria-hidden> *</span>}
                </span>
                {subjects.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Noch kein Fach angelegt. Die Prüfung wird ohne Fach gespeichert.
                  </p>
                ) : (
                  <div
                    ref={subjectGroupRef}
                    role="group"
                    aria-labelledby={`${uid}-subject-label`}
                    aria-describedby={subjectError ? `${uid}-subject-error` : undefined}
                    className="flex flex-wrap gap-1.5"
                  >
                    {subjects.map((s) => (
                      <SubjectChip
                        key={s.id}
                        label={s.name}
                        color={colorValue(s.color)}
                        active={subjectId === s.id}
                        onClick={() => {
                          setSubjectId(s.id);
                          setSubjectTouched(false);
                        }}
                      />
                    ))}
                  </div>
                )}
                {subjectError && (
                  <p id={`${uid}-subject-error`} className="mt-1.5 text-[12px] text-destructive">
                    {subjectError}
                  </p>
                )}
              </div>

              <div>
                <label className={LABEL} htmlFor={`${uid}-title-input`}>
                  Titel
                </label>
                <input
                  id={`${uid}-title-input`}
                  ref={titleRef}
                  className={cn(FIELD, titleError && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setTitleTouched(true)}
                  placeholder="Worüber geht die Arbeit?"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(titleError)}
                  aria-describedby={titleError ? `${uid}-title-error` : undefined}
                />
                {titleError && (
                  <p id={`${uid}-title-error`} className="mt-1.5 text-[12px] text-destructive">
                    {titleError}
                  </p>
                )}
              </div>

              <div>
                <label className={LABEL} htmlFor={`${uid}-notes`}>
                  Notiz
                </label>
                <textarea
                  id={`${uid}-notes`}
                  rows={3}
                  className={cn(FIELD, "resize-none")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onKeyDown={onNotesKeyDown}
                  placeholder="Stoff, Raum, Hilfsmittel … optional"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={close}>
                  Abbrechen
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Speichert …" : "Anlegen"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function SubjectChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // Wie bei den Datums-Chips: klein bleiben, aber ueber ein
        // Pseudo-Element auf 44px Mindest-Trefferflaeche kommen.
        "relative flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[13px] font-medium transition-colors [touch-action:manipulation] before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.96]",
        active
          ? "border-foreground/25 bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="max-w-32 truncate">{label}</span>
    </button>
  );
}
