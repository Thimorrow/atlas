"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Trash2, X, CalendarClock, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/color-picker";
import { DateField } from "@/components/date-field";
import { DEFAULT_EVENT_COLOR } from "@/lib/event-colors";
import {
  WEEKDAYS,
  buildRrule,
  rruleToMode,
  type RecurrenceMode,
} from "@/lib/todo-recurrence";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const SHEET_W = 440;

// Klick-Ziel beim Bearbeiten -- aus dem rohen Todo vorbelegt (nicht aus der
// Instanz, damit "kein Datum" vs. "faellig" sauber bleibt).
export type TodoEditTarget = {
  id: string;
  title: string;
  notes: string | null;
  color: string | null;
  dueDate: string | null;
  rrule: string | null;
};

// Recurrence-Presets, die im Routine-Tab als Grid erscheinen.
const PRESETS: { mode: RecurrenceMode; label: string }[] = [
  { mode: "daily", label: "Jeden Tag" },
  { mode: "every2", label: "Alle 2 Tage" },
  { mode: "workdays", label: "Wochentags" },
  { mode: "custom", label: "Eigene Tage" },
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>
  );
}

// Kleiner Schalter im Atlas-Stil (gleiche Optik wie im Event-Sheet).
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        checked ? "bg-brand" : "bg-input",
      )}
    >
      <motion.span
        className="size-[18px] rounded-full bg-background shadow-sm"
        animate={{ x: checked ? 18 : 2 }}
        transition={{ type: "spring", duration: 0.25, bounce: 0 }}
      />
    </button>
  );
}

// Schlanker To-Do-Composer: Titel, optional Faelligkeit, optional Farbe, Notiz.
// Eine Seite (kein Wizard) -- To-Dos sind leichter als Termine. Wiederkehrend
// kommt in S03.
export function TodoSheet({
  open,
  editing,
  defaultDate,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: TodoEditTarget | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"once" | "routine">("once");
  const [recMode, setRecMode] = useState<RecurrenceMode>("daily");
  const [days, setDays] = useState<string[]>([]);
  const [hasDue, setHasDue] = useState(false);
  const [dueDate, setDueDate] = useState(defaultDate);
  const [hasColor, setHasColor] = useState(false);
  const [color, setColor] = useState(DEFAULT_EVENT_COLOR);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Beim Oeffnen Felder setzen.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    setConfirmDel(false);
    if (editing) {
      setTitle(editing.title);
      if (editing.rrule) {
        setKind("routine");
        const r = rruleToMode(editing.rrule);
        setRecMode(r.mode);
        setDays(r.days);
        setHasDue(false);
        setDueDate(defaultDate);
      } else {
        setKind("once");
        setRecMode("daily");
        setDays([]);
        setHasDue(editing.dueDate !== null);
        setDueDate(editing.dueDate ?? defaultDate);
      }
      setHasColor(editing.color !== null);
      setColor(editing.color ?? DEFAULT_EVENT_COLOR);
      setNotes(editing.notes ?? "");
    } else {
      setTitle("");
      setKind("once");
      setRecMode("daily");
      setDays([]);
      setHasDue(false);
      setDueDate(defaultDate);
      setHasColor(false);
      setColor(DEFAULT_EVENT_COLOR);
      setNotes("");
      setTimeout(() => titleRef.current?.focus(), 240);
    }
  }, [open, editing, defaultDate]);

  // Escape schliesst (nicht, wenn ein Popover es schon verarbeitet hat).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isEdit = !!editing;
  const titleOk = title.trim().length > 0;
  const toggleDay = (key: string) =>
    setDays((d) => (d.includes(key) ? d.filter((x) => x !== key) : [...d, key]));

  const onSheetKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.defaultPrevented) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || tag === "BUTTON") return;
    e.preventDefault();
    submit();
  };

  async function submit() {
    if (!titleOk) {
      setError("Titel ist erforderlich.");
      return;
    }
    // Routine -> RRULE bauen; einmalig -> rrule null + optionale Deadline.
    let rrule: string | null = null;
    let due: string | null = null;
    if (kind === "routine") {
      rrule = buildRrule(recMode, days);
      if (!rrule) {
        setError("Wähle mindestens einen Wochentag.");
        return;
      }
      // dueDate dient bei Routinen als Start-Anker (DTSTART). Beim Bearbeiten einer
      // bestehenden Routine den Anker behalten, sonst auf den aktuellen Tag setzen.
      due = editing?.rrule ? editing.dueDate ?? defaultDate : defaultDate;
    } else {
      due = hasDue ? dueDate : null;
    }

    setBusy(true);
    setError(null);
    const body = {
      title: title.trim(),
      rrule,
      dueDate: due,
      color: hasColor ? color : null,
      notes: notes.trim() || null,
    };
    const path = isEdit ? `/api/todos/${editing!.id}` : "/api/todos";
    const res = await fetch(path, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Speichern fehlgeschlagen.");
      setBusy(false);
      return;
    }
    onSaved();
    onClose();
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/todos/${editing.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Löschen fehlgeschlagen.");
      setBusy(false);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[3px]"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.32, ease: EASE }}
            style={{ width: SHEET_W }}
            className="fixed inset-y-0 right-0 z-50 flex max-w-[100vw] flex-col border-l bg-card shadow-[-8px_0_40px_-12px_rgba(0,0,0,0.25)]"
            role="dialog"
            aria-modal="true"
            onKeyDown={onSheetKey}
          >
            {/* Kopf */}
            <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-4 pt-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <motion.span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  animate={{ backgroundColor: hasColor ? color : "var(--muted-foreground)" }}
                  transition={{ duration: 0.3, ease: EASE }}
                />
                <h2 className="truncate text-[18px] font-semibold tracking-tight">{isEdit ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</h2>
              </div>
              <button
                type="button"
                aria-label="Schließen"
                onClick={onClose}
                className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-[color,background-color,border-color,transform] hover:border-foreground/20 hover:bg-accent hover:text-foreground active:scale-[0.96]"
              >
                <X className="size-[18px]" />
              </button>
            </div>

            {/* Inhalt -- gestaffelter Auftritt wie das Event-Sheet im Edit */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-7">
                {/* Titel */}
                <motion.div
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.32, delay: 0.04, ease: EASE }}
                  className="border-b border-border pb-2.5 transition-colors focus-within:border-foreground/40"
                >
                  <input
                    ref={titleRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Was ist zu tun?"
                    className="w-full bg-transparent text-[22px] font-semibold tracking-tight outline-none placeholder:font-medium placeholder:text-muted-foreground/35"
                  />
                </motion.div>

                {/* Art: einmalige Aufgabe vs. wiederkehrende Routine.
                    Der eine Schalter, der die ganze Aufgabe praegt. */}
                <motion.div
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.32, delay: 0.09, ease: EASE }}
                >
                  <Label>Art</Label>
                  <div className="relative grid grid-cols-2 gap-1 rounded-xl border bg-background p-1">
                    {([
                      { key: "once", label: "Einmalig", icon: CalendarClock },
                      { key: "routine", label: "Routine", icon: Repeat },
                    ] as const).map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setKind(key)}
                        className={cn(
                          "relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium transition-colors",
                          kind === key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {kind === key && (
                          <motion.span
                            layoutId="todo-kind-pill"
                            className="absolute inset-0 -z-10 rounded-lg bg-card shadow-sm ring-1 ring-border"
                            transition={{ type: "spring", duration: 0.3, bounce: 0.15 }}
                          />
                        )}
                        <Icon className="size-[15px]" strokeWidth={2.25} />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Einmalig: Deadline ("bis wann?"). Routine: Wiederholungs-Muster. */}
                  {kind === "once" ? (
                    <div className="pt-3">
                      <div
                        onClick={() => setHasDue((v) => !v)}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3 transition-colors hover:bg-accent/50"
                      >
                        <div>
                          <span className="block text-[14px] font-medium">Deadline</span>
                          <span className="block text-[12px] text-muted-foreground">{hasDue ? "Bis wann muss es erledigt sein? Danach überfällig." : "Ohne Datum — bleibt offen, bis erledigt"}</span>
                        </div>
                        <span onClick={(e) => e.stopPropagation()}>
                          <Switch checked={hasDue} onChange={setHasDue} />
                        </span>
                      </div>
                      <AnimatePresence initial={false}>
                        {hasDue && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease: EASE }}
                            className="overflow-visible"
                          >
                            <div className="pt-3">
                              <DateField value={dueDate} onChange={setDueDate} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div className="pt-3">
                      <div className="grid grid-cols-2 gap-2">
                        {PRESETS.map((p) => (
                          <button
                            key={p.mode}
                            type="button"
                            onClick={() => setRecMode(p.mode)}
                            className={cn(
                              "rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors",
                              recMode === p.mode ? "border-foreground/40 bg-accent" : "bg-background hover:bg-accent/50",
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <AnimatePresence initial={false}>
                        {recMode === "custom" && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease: EASE }}
                            className="overflow-hidden"
                          >
                            <div className="flex gap-1.5 pt-3">
                              {WEEKDAYS.map((w) => {
                                const on = days.includes(w.key);
                                return (
                                  <button
                                    key={w.key}
                                    type="button"
                                    onClick={() => toggleDay(w.key)}
                                    aria-pressed={on}
                                    className={cn(
                                      "h-9 flex-1 rounded-lg border text-[12px] font-medium transition-colors active:scale-[0.96]",
                                      on ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                                    )}
                                  >
                                    {w.short}
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>

                {/* Farbe -- opt-in, damit die Liste standardmaessig monochrom bleibt */}
                <motion.div
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.32, delay: 0.14, ease: EASE }}
                >
                  <div
                    onClick={() => setHasColor((v) => !v)}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3 transition-colors hover:bg-accent/50"
                  >
                    <div>
                      <span className="block text-[14px] font-medium">Farbe</span>
                      <span className="block text-[12px] text-muted-foreground">{hasColor ? "Farbiger Akzent am Rand" : "Ohne — neutral wie der Rest"}</span>
                    </div>
                    <span onClick={(e) => e.stopPropagation()}>
                      <Switch checked={hasColor} onChange={setHasColor} />
                    </span>
                  </div>
                  <AnimatePresence initial={false}>
                    {hasColor && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="pt-4">
                          <ColorPicker value={color} onPick={setColor} title={title} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Notiz */}
                <motion.div
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.32, delay: 0.19, ease: EASE }}
                >
                  <Label>Notiz</Label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Details, Kontext, Links …"
                    className="h-auto w-full resize-none rounded-xl border bg-background px-3.5 py-2.5 text-[14px] leading-relaxed outline-none transition-[box-shadow,border-color,background-color] focus-visible:border-foreground/35 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-foreground/[0.07] placeholder:text-muted-foreground/45"
                  />
                </motion.div>
              </div>
            </div>

            {error && <p className="shrink-0 px-6 pb-2 text-[13px] font-medium text-destructive">{error}</p>}

            {/* Footer */}
            <div className="flex shrink-0 items-center gap-2 border-t px-6 py-4">
              {isEdit ? (
                <>
                  {confirmDel ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={remove}
                      disabled={busy}
                    >
                      Wirklich löschen?
                    </Button>
                  ) : (
                    <button
                      type="button"
                      aria-label="Löschen"
                      onClick={() => setConfirmDel(true)}
                      className="grid size-10 place-items-center rounded-lg text-muted-foreground transition-[color,background-color,transform] hover:bg-destructive/10 hover:text-destructive active:scale-[0.96]"
                    >
                      <Trash2 className="size-[18px]" />
                    </button>
                  )}
                  <div className="flex-1" />
                  <Button size="sm" className="h-10 gap-1.5 px-5 font-medium" onClick={submit} disabled={busy || !titleOk}>
                    {!busy && <Check className="size-4" strokeWidth={2.5} />}
                    Speichern
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="h-10" onClick={onClose} disabled={busy}>
                    Abbrechen
                  </Button>
                  <div className="flex-1" />
                  <Button size="sm" className="h-10 gap-1.5 px-5 font-medium" onClick={submit} disabled={busy || !titleOk}>
                    {!busy && <Check className="size-4" strokeWidth={2.5} />}
                    Anlegen
                  </Button>
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
