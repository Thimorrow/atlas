"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { colorValue } from "@/lib/subject-colors";
import {
  ASSIGNMENT_TYPES,
  TYPE_LABEL,
  type AssignmentDTO,
  type AssignmentType,
} from "@/lib/assignments-view";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

// Eingabefelder: text-[16px] ist Pflicht, nicht Geschmack -- iOS-Safari zoomt
// beim Fokus in jedes Feld unter 16px hinein und verlaesst den Dialog optisch.
const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-[16px] leading-snug outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const LABEL = "mb-1.5 block text-[13px] font-medium text-muted-foreground";

export type AssignmentComposerInitial = Partial<{
  id: string;
  title: string;
  type: AssignmentType;
  subjectId: string | null;
  untisSubject: string | null;
  dueDate: string | null;
  notes: string | null;
}>;

// Schlichtes Overlay statt einer neuen Dialog-Bibliothek: die App bringt nur
// radix-dropdown-menu mit, und ein Formular-Dialog braucht hier nichts, was
// ein <div role="dialog"> mit eigenem Fokus-Fang nicht kann.
export function AssignmentComposer({
  open,
  onOpenChange,
  subjects,
  initial,
  // Kurzer Hinweistext unter dem Faelligkeits-Feld, z.B. wenn die Aufgabe aus
  // einer Schulstunde heraus angelegt wird und die Faelligkeit ein Vorschlag
  // ist (naechste Stunde desselben Fachs). Additiv: ohne diesen Prop verhaelt
  // sich der Composer wie bisher.
  dueHint,
  onSaved,
  // Additiv wie dueHint: andere Seiten (z. B. /pruefungen) koennen die
  // Ueberschrift im Neu-Anlegen-Zustand anpassen, ohne dass bestehende
  // Aufrufer etwas davon merken -- ohne Angabe bleibt der Text wie bisher.
  newHeading = "Neue Aufgabe",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: { id: string; name: string; color: string | null }[];
  initial?: AssignmentComposerInitial;
  dueHint?: string | null;
  onSaved: (a: AssignmentDTO) => void;
  newHeading?: string;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const toast = useToast();
  const uid = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  // Das Element, das den Dialog geoeffnet hat -- dorthin kehrt der Fokus zurueck.
  const restoreRef = useRef<HTMLElement | null>(null);

  const [type, setType] = useState<AssignmentType>("homework");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const editing = Boolean(initial?.id);

  // Beim Oeffnen aus `initial` befuellen. Bewusst nur an `open` haengend: waehrend
  // der Dialog offen ist, darf ein neu erzeugtes initial-Objekt die Eingaben des
  // Nutzers nicht ueberschreiben.
  useEffect(() => {
    if (!open) return;
    setType(initial?.type ?? "homework");
    setSubjectId(initial?.subjectId ?? "");
    setTitle(initial?.title ?? "");
    setDueDate(initial?.dueDate ?? "");
    setNotes(initial?.notes ?? "");
    setSaving(false);
    // Fokus landet im Titelfeld, dem einzigen Pflichtfeld.
    restoreRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => titleRef.current?.focus(), 20);
    // Die Seite hinter dem Overlay darf nicht mitscrollen: auf dem Handy liegt
    // der Dialog als Blatt unten auf, und eine wischende Hand trifft sonst den
    // Stundenplan dahinter statt das Formular.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      // Ohne das faellt der Fokus auf <body> und die Tastatur-Navigation faengt
      // wieder ganz oben an.
      restoreRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Escape schliesst, Tab bleibt im Dialog gefangen (kein Ausbrechen in den
  // Seiteninhalt hinter dem Overlay).
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
    if (!trimmed || saving) return;
    setSaving(true);
    const body = {
      title: trimmed,
      type,
      subjectId: subjectId || null,
      // Traegt das Untis-Kuerzel mit, damit der Server das Fach still anlegen
      // kann, wenn es fuer diese Stunde noch keines gibt.
      untisSubject: initial?.untisSubject ?? null,
      dueDate: dueDate || null,
      notes: notes.trim() || null,
    };
    try {
      const res = await fetch(
        editing ? `/api/assignments/${initial!.id}` : "/api/assignments",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { assignment: AssignmentDTO };
      onSaved(data.assignment);
      close();
    } catch {
      // Der Dialog bleibt offen, damit die Eingaben nicht verloren gehen.
      toast(editing ? "Die Aufgabe konnte nicht gespeichert werden." : "Die Aufgabe konnte nicht angelegt werden.");
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0 }}
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
            className="relative w-full max-w-md overflow-hidden rounded-t-2xl border bg-card shadow-popover sm:rounded-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b bg-muted/30 px-5 py-4">
              <div className="min-w-0">
                <h2 id={`${uid}-title`} className="text-[15px] font-semibold leading-tight tracking-tight">
                  {editing ? "Aufgabe bearbeiten" : newHeading}
                </h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Nur der Titel ist Pflicht.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Schließen"
                className="relative -mr-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                <X className="size-4" />
              </button>
            </header>

            <form onSubmit={save} className="space-y-4 px-5 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL} htmlFor={`${uid}-type`}>
                    Typ
                  </label>
                  <select
                    id={`${uid}-type`}
                    className={FIELD}
                    value={type}
                    onChange={(e) => setType(e.target.value as AssignmentType)}
                  >
                    {ASSIGNMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL} htmlFor={`${uid}-subject`}>
                    Fach
                  </label>
                  <select
                    id={`${uid}-subject`}
                    className={FIELD}
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                  >
                    {/* Leerer Wert = kein Fach. Die Liste zeigt solche Aufgaben
                        als "Allgemein" mit neutralem Punkt. */}
                    <option value="">Allgemein</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={LABEL} htmlFor={`${uid}-title-input`}>
                  Titel
                </label>
                <input
                  id={`${uid}-title-input`}
                  ref={titleRef}
                  className={FIELD}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Was ist zu tun?"
                  autoComplete="off"
                />
              </div>

              <div>
                <label className={LABEL} htmlFor={`${uid}-due`}>
                  Fällig am
                </label>
                <input
                  id={`${uid}-due`}
                  type="date"
                  className={FIELD}
                  value={dueDate ?? ""}
                  onChange={(e) => setDueDate(e.target.value)}
                  aria-describedby={dueHint ? `${uid}-due-hint` : undefined}
                />
                {/* Vorschlag bleibt aenderbar, es ist keine Vorschrift -- der
                    Hinweis erklaert nur, wo das Datum herkommt (oder warum es
                    fehlt). aria-describedby verbindet ihn mit dem Feld, sonst
                    bekommt ihn nur zu sehen, wer hinschaut. */}
                {dueHint && (
                  <p id={`${uid}-due-hint`} className="mt-1.5 text-[12px] text-muted-foreground">{dueHint}</p>
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
                  placeholder="Optional"
                />
              </div>

              {/* Farbpunkt des gewaehlten Fachs als stille Bestaetigung, dass
                  die Auswahl greift. */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{
                      backgroundColor: colorValue(
                        subjects.find((s) => s.id === subjectId)?.color ?? null,
                      ),
                    }}
                  />
                  {subjects.find((s) => s.id === subjectId)?.name ?? "Allgemein"}
                </span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={close}>
                    Abbrechen
                  </Button>
                  <Button type="submit" size="sm" disabled={!title.trim() || saving}>
                    {saving ? "Speichert …" : editing ? "Speichern" : "Anlegen"}
                  </Button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
