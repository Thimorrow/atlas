"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, MapPin, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeRangeField } from "@/components/time-range-field";
import { ColorPicker } from "@/components/color-picker";
import { DateField } from "@/components/date-field";
import { DEFAULT_EVENT_COLOR } from "@/lib/event-colors";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const WD_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const STEPS = ["Eckdaten", "Uhrzeit", "Details"];

// Breiten-Grenzen des Sheets (analog MIN_W/MAX_W der linken Sidebar).
const DEFAULT_W = 420;
const MIN_W = 360;
const MAX_W = 680;
const clampW = (w: number) => Math.min(MAX_W, Math.max(MIN_W, Math.round(w)));

// Klick-Ziel beim Bearbeiten -- aus einem CalendarEvent vorbelegt.
export type EditTarget = {
  source: "manual" | "routine";
  refId: string;
  title: string;
  date: string;
  weekday: number;
  startTime: string;
  endTime: string | null;
  color: string | null;
  location?: string | null;
  notes?: string | null;
  allDay?: boolean;
};

function weekdayOf(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

function nextHour(): { start: string; end: string } {
  const d = new Date();
  const h = (d.getHours() + 1) % 24;
  const e = (h + 1) % 24;
  return { start: `${String(h).padStart(2, "0")}:00`, end: `${String(e).padStart(2, "0")}:00` };
}

// --- Bausteine --------------------------------------------------------------

// Einheitliche Feld-Optik: hoehere Felder, ruhiger Default-Rahmen, weicher
// vierfach-Fokusring im Monochrom-Ton (kein Farbstich). Radius durchgaengig
// rounded-xl -- vorher mischten Name (lg) und Ort/Notiz (xl).
const inputCls =
  "h-11 w-full rounded-xl border bg-background px-3.5 text-[14px] outline-none transition-[box-shadow,border-color,background-color] focus-visible:border-foreground/35 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-foreground/[0.07] placeholder:text-muted-foreground/45";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>
  );
}

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

// --- Sheet ------------------------------------------------------------------

export function EventSheet({
  open,
  editing,
  defaultDate,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: EditTarget | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"manual" | "routine">("manual");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [weekday, setWeekday] = useState(0);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [color, setColor] = useState(DEFAULT_EVENT_COLOR);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const titleRef = useRef<HTMLInputElement>(null);

  // Breite des Sheets -- per Griff an der linken Kante zieh-/stauchbar, gemerkt.
  // Gleiches Muster wie die linke Sidebar: Delta-basiert, Body-Cursor-Lock waehrend
  // des Ziehens, Doppelklick setzt zurueck. resizing schaltet Layout-Animationen
  // (z.B. die kind-Pill) auf instant, damit nichts hinter dem Cursor herlagt.
  const [width, setWidth] = useState(DEFAULT_W);
  const [resizing, setResizing] = useState(false);
  const wRef = useRef(DEFAULT_W);

  useEffect(() => {
    const s = typeof window !== "undefined" && localStorage.getItem("atlas:sheetW");
    if (s) {
      const w = clampW(Number(s));
      wRef.current = w;
      setWidth(w);
    }
  }, []);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = wRef.current;
    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    // Sheet sitzt rechts -> nach links ziehen vergroessert (Delta negativ).
    const move = (ev: PointerEvent) => {
      const w = clampW(startW - (ev.clientX - startX));
      wRef.current = w;
      setWidth(w);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("atlas:sheetW", String(wRef.current));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const resetWidth = () => {
    wRef.current = DEFAULT_W;
    setWidth(DEFAULT_W);
    localStorage.setItem("atlas:sheetW", String(DEFAULT_W));
  };

  // Beim Oeffnen: Felder aus editing vorbelegen oder Defaults setzen.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    setConfirmDel(false);
    setStep(0);
    setDir(1);
    if (editing) {
      setKind(editing.source);
      setTitle(editing.title);
      setDate(editing.date);
      setWeekday(editing.weekday);
      setAllDay(!!editing.allDay);
      setStart(editing.allDay ? "09:00" : editing.startTime || "09:00");
      setEnd(editing.allDay ? "10:00" : editing.endTime || "10:00");
      setColor(editing.color || DEFAULT_EVENT_COLOR);
      setLocation(editing.location || "");
      setNotes(editing.notes || "");
    } else {
      const { start: s, end: e } = nextHour();
      setKind("manual");
      setTitle("");
      setDate(defaultDate);
      setWeekday(weekdayOf(defaultDate));
      setAllDay(false);
      setStart(s);
      setEnd(e);
      setColor(DEFAULT_EVENT_COLOR);
      setLocation("");
      setNotes("");
      setTimeout(() => titleRef.current?.focus(), 240);
    }
  }, [open, editing, defaultDate]);

  // Escape schliesst.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isEdit = !!editing;
  const titleOk = title.trim().length > 0;
  const timeOk = allDay || end > start;
  const valid = titleOk && timeOk;

  const go = (s: number) => {
    if (s === step) return;
    setConfirmDel(false);
    setDir(s > step ? 1 : -1);
    setStep(s);
  };
  const next = () => {
    if (step === 0 && !titleOk) return;
    if (step === 1 && !timeOk) {
      setError("Ende muss nach dem Start liegen.");
      return;
    }
    setError(null);
    go(Math.min(step + 1, STEPS.length - 1));
  };
  const back = () => go(Math.max(step - 1, 0));

  // Enter konsistent: ueberall "Weiter" bzw. "Anlegen/Speichern". Ausnahmen:
  // mehrzeilige Notiz (Zeilenumbruch), echte Buttons (machen ihre eigene Aktion)
  // und Felder, die Enter schon selbst verarbeiten (Zeit/Datum -> defaultPrevented).
  const onSheetKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.defaultPrevented) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || tag === "BUTTON") return;
    e.preventDefault();
    if (isEdit || step >= STEPS.length - 1) submit();
    else next();
  };

  async function submit() {
    if (!valid) {
      if (!titleOk) setError("Titel ist erforderlich.");
      else if (!timeOk) {
        setError("Ende muss nach dem Start liegen.");
        if (!isEdit) go(1);
      }
      return;
    }
    setBusy(true);
    setError(null);
    const time = allDay ? {} : { startTime: start, endTime: end };
    const body =
      kind === "manual"
        ? { title: title.trim(), date, ...time, color, location: location.trim() || null, notes: notes.trim() || null, allDay }
        : { title: title.trim(), type: "fixed", weekday, ...time, color, location: location.trim() || null, allDay };
    const collection = kind === "manual" ? "events" : "routines";
    const path = isEdit ? `/api/${collection}/${editing!.refId}` : `/api/${collection}`;
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
    const collection = editing.source === "manual" ? "events" : "routines";
    const res = await fetch(`/api/${collection}/${editing.refId}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Löschen fehlgeschlagen.");
      setBusy(false);
      return;
    }
    onSaved();
    onClose();
  }

  const stepVariants = {
    enter: (d: number) => ({ x: d * 36, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d * -36, opacity: 0 }),
  };

  // Feld-Bausteine -- in beiden Layouts wiederverwendet: als Wizard-Schritte beim
  // Anlegen, als eine gestaffelte Scroll-Seite beim Bearbeiten.
  const titleField = (
    <div className="border-b border-border pb-2.5 transition-colors focus-within:border-foreground/40">
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titel des Termins"
        className="w-full bg-transparent text-[22px] font-semibold tracking-tight outline-none placeholder:font-medium placeholder:text-muted-foreground/35"
      />
    </div>
  );

  const whenField =
    kind === "manual" ? (
      <div>
        <Label>Datum</Label>
        <DateField value={date} onChange={setDate} />
      </div>
    ) : (
      <div>
        <Label>Wochentag</Label>
        <div className="flex gap-1.5">
          {WD_SHORT.map((d, i) => {
            const on = weekday === i;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setWeekday(i)}
                className={cn(
                  "h-9 flex-1 rounded-lg border text-[13px] font-medium transition-[color,background-color,border-color,transform] active:scale-[0.96]",
                  on
                    ? "border-brand bg-brand text-brand-foreground shadow-sm"
                    : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    );

  const timeField = (
    // F23: layout-Animation traegt den Hoehenwechsel weich (statt Snap), und
    //      popLayout statt mode="wait" entfernt die ~0,4 s tote Pause.
    <motion.div layout className="space-y-4">
      <div
        onClick={() => setAllDay(!allDay)}
        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3 transition-colors hover:bg-accent/50"
      >
        <div>
          <span className="block text-[14px] font-medium">Ganztags</span>
          <span className="block text-[12px] text-muted-foreground">Termin ohne feste Uhrzeit</span>
        </div>
        <span onClick={(e) => e.stopPropagation()}>
          <Switch checked={allDay} onChange={setAllDay} />
        </span>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {allDay ? (
          <motion.p
            key="allday"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="rounded-xl border border-dashed py-10 text-center text-[13px] text-muted-foreground"
          >
            Ganztägig -- keine Uhrzeit nötig.
          </motion.p>
        ) : (
          <motion.div
            key="dial"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <TimeRangeField start={start} end={end} onStart={setStart} onEnd={setEnd} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  const colorField = (
    <div>
      <Label>Farbe</Label>
      <ColorPicker value={color} onPick={setColor} title={title} />
    </div>
  );

  const locationField = (
    <div>
      <Label>Ort</Label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Wo findet es statt?"
          className={cn(inputCls, "pl-10")}
        />
      </div>
    </div>
  );

  const notesField =
    kind === "manual" ? (
      <div>
        <Label>Notiz</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Worauf willst du dich noch erinnern?"
          className={cn(inputCls, "h-auto resize-none rounded-xl py-2.5 leading-relaxed")}
        />
      </div>
    ) : null;

  // Bearbeiten zeigt alle Felder auf einer Seite (gestaffelter Auftritt).
  const editFields = [titleField, whenField, timeField, colorField, locationField, notesField].filter(Boolean);

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
            style={{ width }}
            className="fixed inset-y-0 right-0 z-50 flex max-w-[100vw] flex-col border-l bg-card shadow-[-8px_0_40px_-12px_rgba(0,0,0,0.25)]"
            role="dialog"
            aria-modal="true"
            onKeyDown={onSheetKey}
          >
            {/* Resize-Griff: sitzt mittig auf der linken Trennlinie, durchgehende
                duenne Linie wie bei der linken Sidebar. Doppelklick = zuruecksetzen. */}
            <div
              onPointerDown={startResize}
              onDoubleClick={resetWidth}
              title="Breite ziehen (Doppelklick: zurücksetzen)"
              role="separator"
              aria-orientation="vertical"
              aria-label="Breite anpassen"
              className="group absolute inset-y-0 left-0 z-20 w-4 -translate-x-1/2 cursor-col-resize touch-none"
            >
              <span
                className={cn(
                  "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary/50 transition-opacity",
                  resizing ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
              />
            </div>

            {/* Kopf -- bleibt ueber allen Schritten gleich */}
            <div className="shrink-0 px-6 pb-4 pt-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {/* Lebendiger Farb-Punkt: spiegelt die gewaehlte Event-Farbe ueber
                      alle Schritte -- macht die Auswahl praesent, nicht erst in Schritt 3. */}
                  <motion.span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    animate={{ backgroundColor: color }}
                    transition={{ duration: 0.3, ease: EASE }}
                  />
                  <h2 className="truncate text-[18px] font-semibold tracking-tight">{isEdit ? "Termin bearbeiten" : "Neuer Termin"}</h2>
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

              {/* Schritt-Anzeige -- nur beim Anlegen (gefuehrt). Beim Bearbeiten
                  liegt alles auf einer Seite, daher kein Schrittindikator.
                  Aktiver Schritt traegt einen gleitenden Indikator (layoutId). */}
              {!isEdit && (
              <div className="mt-4 flex items-center gap-2">
                {STEPS.map((s, i) => {
                  const reachable = i === 0 || titleOk;
                  const on = i === step;
                  const done = i < step;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={!reachable}
                      onClick={() => reachable && go(i)}
                      className="group flex flex-1 flex-col gap-1.5 text-left disabled:cursor-not-allowed"
                    >
                      <span className={cn("relative h-1 overflow-hidden rounded-full transition-colors", done ? "bg-brand/40" : "bg-border")}>
                        {on && (
                          <motion.span
                            layoutId="step-track"
                            className="absolute inset-0 rounded-full bg-brand"
                            transition={resizing ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0 }}
                          />
                        )}
                      </span>
                      <span
                        className={cn(
                          "flex items-center gap-1 text-[11px] font-medium transition-colors",
                          on ? "text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/80",
                        )}
                      >
                        {done && <Check className="size-3" strokeWidth={3} />}
                        {s}
                      </span>
                    </button>
                  );
                })}
              </div>
              )}
            </div>

            {/* Inhalt: Bearbeiten = eine gestaffelte Scroll-Seite, Anlegen = Wizard */}
            {isEdit ? (
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="space-y-7">
                  {editFields.map((node, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.32, delay: 0.04 + i * 0.05, ease: EASE }}
                    >
                      {node}
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
            <div className="relative flex-1 overflow-hidden">
              <AnimatePresence mode="popLayout" custom={dir} initial={false}>
                <motion.div
                  key={step}
                  custom={dir}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.26, ease: EASE }}
                  // F24: Inhalt vertikal mittig (m-auto) statt am oberen Rand --
                  //      kurze Schritte (z.B. Eckdaten) fuellen die Sheet-Hoehe
                  //      optisch aus, statt ein leeres unteres Drittel zu lassen.
                  className="absolute inset-0 flex flex-col overflow-y-auto px-6 py-6"
                >
                  <div className="m-auto w-full space-y-7">
                  {step === 0 && (
                    <>
                      {/* Einmalig | Woechentlich */}
                      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                        {([
                          ["manual", "Einmalig"],
                          ["routine", "Wöchentlich"],
                        ] as const).map(([k, lbl]) => {
                          const on = kind === k;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setKind(k)}
                              className={cn(
                                "relative rounded-lg py-1.5 text-[13px] font-medium transition-colors",
                                on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {on && (
                                <motion.span
                                  layoutId="kind-pill"
                                  className="absolute inset-0 rounded-lg bg-card shadow-sm"
                                  transition={resizing ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }}
                                />
                              )}
                              <span className="relative z-10">{lbl}</span>
                            </button>
                          );
                        })}
                      </div>

                      {titleField}
                      {whenField}
                    </>
                  )}

                  {step === 1 && timeField}

                  {step === 2 && (
                    <>
                      {colorField}
                      {locationField}
                      {notesField}
                    </>
                  )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
            )}

            {error && <p className="shrink-0 px-6 pb-2 text-[13px] font-medium text-destructive">{error}</p>}

            {/* Footer -- Bearbeiten: Loeschen + Speichern. Anlegen: Schritt-Navigation. */}
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

                  <Button size="sm" className="h-10 gap-1.5 px-5 font-medium" onClick={submit} disabled={busy || !valid}>
                    {!busy && <Check className="size-4" strokeWidth={2.5} />}
                    Speichern
                  </Button>
                </>
              ) : (
                <>
                  {step === 0 ? (
                    <Button variant="ghost" size="sm" className="h-10" onClick={onClose} disabled={busy}>
                      Abbrechen
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="h-10 gap-1.5 pl-2.5" onClick={back} disabled={busy}>
                      <ArrowLeft className="size-4" />
                      Zurück
                    </Button>
                  )}

                  <div className="flex-1" />

                  {step < STEPS.length - 1 ? (
                    <Button size="sm" className="h-10 gap-1.5 pr-3.5 pl-4 font-medium" onClick={next} disabled={step === 0 && !titleOk}>
                      Weiter
                      <ArrowRight className="size-4" />
                    </Button>
                  ) : (
                    <Button size="sm" className="h-10 gap-1.5 px-5 font-medium" onClick={submit} disabled={busy || !valid}>
                      {!busy && <Check className="size-4" strokeWidth={2.5} />}
                      Anlegen
                    </Button>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
