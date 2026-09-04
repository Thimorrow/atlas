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
import { ChevronDown, GraduationCap, Presentation, X } from "lucide-react";
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
const LABEL = "block text-[13px] font-medium text-muted-foreground";

// Schnellauswahl fuer den Termin -- bei einer Pruefung liegt das Datum fast
// immer in der naeheren Zukunft, ein Tippen spart den Umweg ueber den
// nativen Datepicker.
function dateShortcuts(today: string): { label: string; title: string; date: string }[] {
  return [
    { label: "1 Wo.", title: "In 1 Woche", date: addDays(today, 7) },
    { label: "2 Wo.", title: "In 2 Wochen", date: addDays(today, 14) },
    { label: "4 Wo.", title: "In 4 Wochen", date: addDays(today, 28) },
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
  // Additiv fuer Aufrufer mit bereits bekanntem Fach (z.B. die Fach-Seite)
  // oder bekanntem Tag (z.B. der Kalender, aus einer konkreten Stunde
  // heraus): vorbelegt, aber weiterhin aenderbar. Ohne Angabe verhaelt sich
  // der Composer wie bisher -- leer, bis eine Auswahl getroffen wird.
  initialSubjectId,
  initialDueDate,
  // Traegt das Untis-Kuerzel mit, wenn initialSubjectId (noch) keins ist --
  // der Server legt das Fach beim Speichern still darueber an, genau wie im
  // Hausaufgaben-Composer (siehe assignment-composer.tsx).
  initialUntisSubject,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: SubjectOption[];
  existingExams: AssignmentDTO[];
  initialSubjectId?: string;
  initialDueDate?: string;
  initialUntisSubject?: string | null;
  onSaved: (a: AssignmentDTO) => void;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const toast = useToast();
  const uid = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const subjectRef = useRef<HTMLSelectElement | null>(null);
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
  const [today, setToday] = useState(() => localISO());

  // Ohne ein einziges angelegtes Fach waere ein Pflichtfeld eine Sackgasse --
  // dann bleibt die Auswahl optional, bis es etwas zum Waehlen gibt.
  const subjectRequired = subjects.length > 0;
  const subjectError =
    subjectRequired && subjectTouched && !subjectId ? "Bitte ein Fach waehlen." : null;
  const collisions = dueDate ? sameDayCount(existingExams, dueDate) : 0;
  const selectedSubject = subjects.find((s) => s.id === subjectId) ?? null;
  // Beim Eintragen steht der Termin meist fest, das Thema noch nicht ("Mathe,
  // am 15."). Ein Pflicht-Titel zwingt dann zu einer erfundenen Angabe --
  // deshalb ist der Titel optional und faellt auf die Art zurueck. Der Server
  // verlangt weiterhin einen nicht-leeren Titel (parseNewAssignment), die
  // Ersatzangabe entsteht also hier, nicht in der API.
  const fallbackTitle = TYPE_SHORT_LABEL[type];

  useEffect(() => {
    if (!open) return;
    setType("exam");
    setSubjectId(initialSubjectId ?? "");
    setTitle("");
    setDueDate(initialDueDate ?? "");
    setNotes("");
    setSaving(false);
    setSubjectTouched(false);
    setToday(localISO());
    restoreRef.current = document.activeElement as HTMLElement | null;
    // Auf Touch-Geraeten poppt Autofokus die Tastatur ungefragt hoch --
    // dort bleibt das Feld unfokussiert, bis der Finger es beruehrt. Der
    // Fokus landet auf dem ersten noch offenen Feld: Termin, sonst Fach,
    // sonst Thema. Beim Kalender-Einstieg ist der Termin bereits gesetzt,
    // dann waere er die falsche Station.
    // ontouchstart liegt auf Hybridgeraeten und manchen Touch-Notebooks
    // falsch -- die eigentliche Frage ist, ob der Zeiger grob ist (Finger),
    // nicht ob das Geraet ueberhaupt Touch kann. Gleiche Erkennung wie in
    // assignment-composer.tsx.
    const isTouch =
      typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    const target = !initialDueDate
      ? dateRef
      : subjects.length > 0 && !initialSubjectId
        ? subjectRef
        : titleRef;
    const t = isTouch ? null : window.setTimeout(() => target.current?.focus(), 20);
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
    const trimmed = title.trim() || fallbackTitle;
    const subjectMissing = subjectRequired && !subjectId;
    if (subjectMissing) {
      setSubjectTouched(true);
      subjectRef.current?.focus();
    }
    if (subjectMissing || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          type,
          subjectId: subjectId || null,
          untisSubject: initialUntisSubject ?? null,
          dueDate: dueDate || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { assignment: AssignmentDTO };
      onSaved(data.assignment);
      close();
    } catch {
      toast("Die Pruefung konnte nicht angelegt werden.");
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
            <header className="shrink-0 border-b bg-muted/30 px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <h2 id={`${uid}-title`} className="text-[15px] font-semibold leading-tight tracking-tight">
                  {NEW_HEADING[type]}
                </h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Schliessen"
                  className="relative -mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.96]"
                >
                  <X className="size-4" />
                </button>
              </div>
              {/* Die Art sitzt kompakt im Kopf statt als eigener
                  Formular-Block: drei fast gleichwertige Werte brauchen kein
                  volles Feld mit Label, ein Icon-Toggle traegt die gleiche
                  Information in einer Zeile. */}
              <div role="group" aria-label="Art der Pruefung" className="mt-2 flex gap-1.5">
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
                        "relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-medium transition-colors [touch-action:manipulation] before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.96]",
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
              className="space-y-3.5 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              {/* Termin zuerst und am groessten: das ist die eigentliche
                  Frage bei einer Pruefung, nicht ein Faelligkeitsdatum wie
                  bei einer Hausaufgabe -- die Arbeit findet an dem Tag statt.
                  Die Schnellauswahl sitzt neben dem Label statt in einer
                  eigenen Zeile darunter: sie kostet so keine Bauhoehe. */}
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className={LABEL} htmlFor={`${uid}-due`}>
                    Termin
                  </label>
                  <div className="flex gap-1">
                    {dateShortcuts(today).map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        title={s.title}
                        onClick={() => setDueDate((cur) => (cur === s.date ? "" : s.date))}
                        aria-pressed={dueDate === s.date}
                        className={cn(
                          // Trefferflaeche knapp ueber 44px: 30px Chip plus 2x8px
                          // Polster. Mehr Polster ginge nicht -- die Flaeche wuerde
                          // sonst die Typ-Chips im Kopf ueberlappen und deren untere
                          // Kante unklickbar machen.
                          "relative rounded-full border px-2 py-1.5 text-[12px] font-medium transition-colors [touch-action:manipulation] before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.96]",
                          dueDate === s.date
                            ? "border-foreground/25 bg-accent text-foreground"
                            : "border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  id={`${uid}-due`}
                  ref={dateRef}
                  type="date"
                  // relative z-10: die Trefferflaechen-Pseudoelemente der
                  // Schnellauswahl darueber reichen bis in dieses Feld hinein
                  // und wuerden sonst Klicks auf seine obere Kante schlucken.
                  className={cn(FIELD, "relative z-10 font-medium")}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                {/* Vorlauf und Kollision: beides Information, die eine reine
                    Datumseingabe verschluckt -- wie lange noch, und ob an dem
                    Tag schon etwas anderes ansteht. */}
                {dueDate && (
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    {weekdayDateLabel(dueDate)} · {daysUntilLabel(dueDate, today)}
                    {collisions > 0 && (
                      <span className="font-medium text-foreground/70">
                        {" "}
                        · {collisions} weitere {collisions === 1 ? "Pruefung" : "Pruefungen"} an diesem Tag
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Fach als Auswahlfeld statt Chip-Raster, und Pflichtfeld:
                  eine Klassenarbeit ohne Fach ist der Ausnahmefall, nicht die
                  Regel -- anders als bei einer Hausaufgabe. Bei zwoelf oder
                  mehr Faechern fuellt ein Chip-Raster den halben Dialog, ein
                  Select bleibt bei einer Zeile; der Farbpunkt links zeigt das
                  gewaehlte Fach weiterhin auf einen Blick. Ohne ein einziges
                  angelegtes Fach waere ein Pflichtfeld eine Sackgasse,
                  deshalb bleibt die Auswahl dann optional (subjectRequired). */}
              <div>
                <label className={cn(LABEL, "mb-1")} htmlFor={`${uid}-subject`}>
                  Fach{subjectRequired && <span aria-hidden> *</span>}
                </label>
                {subjects.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Noch kein Fach angelegt. Die Pruefung wird ohne Fach gespeichert.
                  </p>
                ) : (
                  <div className="relative">
                    {selectedSubject && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full"
                        style={{ backgroundColor: colorValue(selectedSubject.color) }}
                      />
                    )}
                    <select
                      id={`${uid}-subject`}
                      ref={subjectRef}
                      className={cn(
                        FIELD,
                        "appearance-none pr-9",
                        selectedSubject && "pl-7",
                        !subjectId && "text-muted-foreground",
                        subjectError &&
                          "border-destructive focus-visible:border-destructive focus-visible:ring-destructive",
                      )}
                      value={subjectId}
                      onChange={(e) => {
                        setSubjectId(e.target.value);
                        setSubjectTouched(false);
                      }}
                      aria-invalid={Boolean(subjectError)}
                      aria-describedby={subjectError ? `${uid}-subject-error` : undefined}
                    >
                      <option value="">Fach waehlen …</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      aria-hidden
                      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                )}
                {subjectError && (
                  <p id={`${uid}-subject-error`} className="mt-1 text-[12px] text-destructive">
                    {subjectError}
                  </p>
                )}
              </div>

              <div>
                <label className={cn(LABEL, "mb-1")} htmlFor={`${uid}-title-input`}>
                  Thema <span className="font-normal text-muted-foreground/70">optional</span>
                </label>
                <input
                  id={`${uid}-title-input`}
                  ref={titleRef}
                  className={FIELD}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`Steht noch nicht fest? Dann "${fallbackTitle}"`}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              <div>
                <label className={cn(LABEL, "mb-1")} htmlFor={`${uid}-notes`}>
                  Notiz
                </label>
                <textarea
                  id={`${uid}-notes`}
                  rows={2}
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
