"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, ListPlus, CircleCheck, ChevronDown, MoreHorizontal, Pencil, Trash2, Repeat, CalendarClock, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stagger, StaggerItem, SplitText } from "@/components/stagger";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TodoCheckbox } from "@/components/todo-checkbox";
import { TodoSheet, type TodoEditTarget } from "@/components/todo-sheet";
import {
  type TodayView,
  type TodoInstance,
  addDays,
  localISO,
  dayLabel,
  overdueLabel,
  dueLabel,
  buildStatus,
  sectionFor,
  byTime,
} from "@/lib/todos-view";
import { rruleToLabel } from "@/lib/todo-recurrence";
import { persistWrite } from "@/lib/persist";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
// Weiche In-Out-Kurve nur fuers Zuklappen: kein Yank am Anfang, sanft am Ende.
const EXIT_EASE = [0.4, 0, 0.2, 1] as const;

// Amber-Ring fuer den aktiven (obersten) Task -- der einzige Farbakzent, der den
// "das ist als Naechstes dran"-Fokus traegt. Sonst bleibt die Liste monochrom.
const ACTIVE_RING = "oklch(0.72 0.15 67)";

/* ── COMPLETION-STORYBOARD (Klick = erledigt) ─────────────────────────────
 *     0ms   Klick → Checkbox füllt + Haken zeichnet sich (Feder)
 *   350ms   Beat: erledigtes Item steht mit Durchstrich, dann ab nach „Erledigt"
 *   350ms   Liste schließt die Lücke (layout-Feder); der nächste Task wird aktiv
 *           → sein Ring tweent grau→amber. Kein Fly, kein Sprung.
 *    fill   Fortschrittsbalken füllt nach (0.5 s)
 * ──────────────────────────────────────────────────────────────────────── */
const MOTION = {
  beatMs: 350,
  row: {
    enterSpring: { type: "spring" as const, stiffness: 440, damping: 34 },
    // Bounce 0 = kein Nachschnappen; ueber die Dauer gleiten die Zeilen weich nach.
    reflow: { type: "spring" as const, duration: 0.5, bounce: 0 },
    exitDur: 0.34,
  },
  bar: { duration: 0.5 },
};
const BEAT_MS = MOTION.beatMs;

type RawTodo = { id: string; title: string; notes: string | null; color: string | null; dueDate: string | null; rrule: string | null };

// --- Seite ------------------------------------------------------------------

export default function TodosPage() {
  const reduce = useReducedMotion();
  const [anchor, setAnchor] = useState(() => localISO(new Date()));
  const [today, setToday] = useState(() => localISO(new Date()));
  const [view, setView] = useState<TodayView | null>(null);
  const [rawById, setRawById] = useState<Record<string, RawTodo>>({});
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TodoEditTarget | null>(null);
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [cleared, setCleared] = useState(false);

  const isToday = anchor === today;

  useEffect(() => {
    const tick = () => setToday(localISO(new Date()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/todos/today?date=${anchor}`).then((r) => r.json()),
      fetch(`/api/todos`).then((r) => r.json()),
    ])
      .then(([t, all]) => {
        if (!alive) return;
        setView(t.view as TodayView);
        const map: Record<string, RawTodo> = {};
        for (const r of (all.todos ?? []) as RawTodo[]) map[r.id] = r;
        setRawById(map);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [anchor, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (inst: TodoInstance) => {
    const raw = rawById[inst.todoId];
    setEditing(
      raw
        ? { id: raw.id, title: raw.title, notes: raw.notes, color: raw.color, dueDate: raw.dueDate, rrule: raw.rrule }
        : { id: inst.todoId, title: inst.title, notes: inst.notes, color: inst.color, dueDate: inst.dueDate, rrule: inst.rrule },
    );
    setSheetOpen(true);
  };

  const remove = useCallback((inst: TodoInstance) => {
    const id = inst.todoId;
    setView((v) =>
      v
        ? {
            ...v,
            overdue: v.overdue.filter((x) => x.todoId !== id),
            today: v.today.filter((x) => x.todoId !== id),
            completed: v.completed.filter((x) => x.todoId !== id),
          }
        : v,
    );
    persistWrite(() => fetch(`/api/todos/${id}`, { method: "DELETE" }), {
      message: "Konnte die Aufgabe nicht löschen.",
      onFail: reload,
      retry: () => remove(inst),
    });
  }, []);

  // Abhaken/Enthaken -- optimistic, mit "Beat" vor dem Wandern in Erledigt.
  const toggle = useCallback(
    (inst: TodoInstance, currentlyDone: boolean) => {
      if (!view) return;
      const id = inst.todoId;
      if (!currentlyDone) {
        setCompleting((s) => new Set(s).add(id));
        window.setTimeout(
          () => {
            setView((v) => {
              if (!v) return v;
              const overdue = v.overdue.filter((x) => x.todoId !== id);
              const todayArr = v.today.filter((x) => x.todoId !== id);
              const moved = { ...inst, done: true, overdue: false };
              const completed = [...v.completed, moved].sort(byTime);
              const openBefore = v.overdue.length + v.today.length;
              const openAfter = overdue.length + todayArr.length;
              if (openBefore > 0 && openAfter === 0 && isToday) {
                setCleared(true);
                window.setTimeout(() => setCleared(false), 1800);
              }
              return { ...v, overdue, today: todayArr, completed };
            });
            setCompleting((s) => {
              const n = new Set(s);
              n.delete(id);
              return n;
            });
          },
          reduce ? 0 : BEAT_MS,
        );
        persistWrite(
          () =>
            fetch(`/api/todos/${id}/complete`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ date: anchor }),
            }),
          { message: "Konnte nicht abhaken.", onFail: reload, retry: () => toggle(inst, currentlyDone) },
        );
      } else {
        setView((v) => {
          if (!v) return v;
          const completed = v.completed.filter((x) => x.todoId !== id);
          const back = { ...inst, done: false };
          const where = sectionFor(back, anchor);
          const overdue = where === "overdue" ? [...v.overdue, { ...back, overdue: true }].sort(byTime) : v.overdue;
          const todayArr = where === "today" ? [...v.today, back].sort(byTime) : v.today;
          return { ...v, overdue, today: todayArr, completed };
        });
        persistWrite(
          () =>
            fetch(`/api/todos/${id}/complete`, {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ date: anchor }),
            }),
          { message: "Konnte nicht als offen markieren.", onFail: reload, retry: () => toggle(inst, currentlyDone) },
        );
      }
    },
    [view, anchor, isToday, reduce],
  );

  const goToday = () => {
    setAnchor(localISO(new Date()));
    window.dispatchEvent(new CustomEvent("atlas:focus-today"));
  };

  return (
    <main className="flex h-full min-h-0 flex-col">
      <Stagger className="flex min-h-0 flex-1 flex-col">
        <StaggerItem className="shrink-0 px-6 pt-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-xl flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold leading-tight tracking-tight">
                <SplitText text="To-Dos" />
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{dayLabel(anchor, today)}</p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setAnchor((a) => addDays(a, -1))} aria-label="Voriger Tag">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="sm" className="h-9" onClick={goToday}>
                Heute
              </Button>
              <Button variant="outline" size="icon" onClick={() => setAnchor((a) => addDays(a, 1))} aria-label="Nächster Tag">
                <ChevronRight />
              </Button>
              <span aria-hidden className="mx-1 h-7 w-px self-center bg-border" />
              <Button variant="outline" size="icon" onClick={openCreate} aria-label="Neue Aufgabe">
                <ListPlus className="size-[18px]" />
              </Button>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 lg:px-8">
          <div className="mx-auto w-full max-w-xl pt-6">
            {loading && !view ? (
              <div className="py-20 text-center text-sm text-muted-foreground">Lade …</div>
            ) : !view ? (
              <div className="py-20 text-center text-sm text-muted-foreground">Keine Daten.</div>
            ) : (
              // Tageswechsel: der Block blendet nur per Opacity um (wie im
              // Kalender) -- den Blur tragen die einzelnen Zeilen beim Auftritt.
              <AnimatePresence mode="wait">
                <motion.div
                  key={view.date}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: EASE }}
                >
                  <FocusView
                    view={view}
                    cleared={cleared}
                    completing={completing}
                    onToggle={toggle}
                    onEdit={openEdit}
                    onDelete={remove}
                    onCreate={openCreate}
                    isToday={isToday}
                  />
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </StaggerItem>
      </Stagger>

      <TodoSheet open={sheetOpen} editing={editing} defaultDate={anchor} onClose={() => setSheetOpen(false)} onSaved={reload} />
    </main>
  );
}

// --- ⋯-Menue (Bearbeiten/Loeschen), erscheint auf Hover ----------------------

function RowMenu({ inst, onEdit, onDelete }: { inst: TodoInstance; onEdit: (i: TodoInstance) => void; onDelete: (i: TodoInstance) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Mehr"
          onClick={(e) => e.stopPropagation()}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/50 opacity-0 transition-[opacity,color,background-color] hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="size-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => onEdit(inst)}>
          <Pencil />
          Bearbeiten
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDelete(inst)} className="text-destructive [&_svg]:text-destructive focus:bg-destructive/10 focus:text-destructive">
          <Trash2 />
          Löschen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Typ-Pill rechts: macht auf einen Blick klar, WAS die Zeile ist.
//   Routine (wiederkehrend)  -> Repeat-Icon + Kadenz, dazu Streak (Flamme, amber).
//   Einmalig mit Deadline    -> Kalender-Icon + "Heute fällig"/Datum, ueberfaellig rot.
//   Einmalig ohne Deadline   -> dezentes "offen".
function MetaPill({ inst, viewDate }: { inst: TodoInstance; viewDate: string }) {
  const base = "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium";

  if (inst.recurring) {
    return (
      <span className={cn(base, "border-border text-muted-foreground")}>
        <Repeat className="-ml-0.5 size-3" strokeWidth={2.25} />
        {rruleToLabel(inst.rrule ?? "")}
        {inst.streak > 0 && (
          <span className="ml-0.5 inline-flex items-center gap-0.5 tabular-nums text-amber-600 dark:text-amber-400">
            <Flame className="size-3" strokeWidth={2.25} />
            {inst.streak}
          </span>
        )}
      </span>
    );
  }
  if (inst.overdue) {
    return (
      <span className={cn(base, "border-red-500/40 tabular-nums text-red-600 dark:text-red-400")}>
        <CalendarClock className="-ml-0.5 size-3" strokeWidth={2.25} />
        {overdueLabel(inst.date, viewDate)}
      </span>
    );
  }
  if (inst.dueDate) {
    const today = inst.dueDate === viewDate;
    return (
      <span className={cn(base, "border-border tabular-nums", today ? "text-foreground" : "text-muted-foreground")}>
        <CalendarClock className="-ml-0.5 size-3" strokeWidth={2.25} />
        {dueLabel(inst.dueDate, viewDate)}
      </span>
    );
  }
  if (inst.scheduledTime) {
    return (
      <span className={cn(base, "border-border tabular-nums text-muted-foreground")}>
        {inst.scheduledTime}
      </span>
    );
  }
  return (
    <span className={cn(base, "border-transparent text-muted-foreground/55")}>offen</span>
  );
}

// --- Zeile: flach, grosszuegig (wie Referenzbild). KLICK = erledigt. ---------

type RowProps = {
  inst: TodoInstance;
  checked: boolean;
  active: boolean; // oberster offener Task -> Amber-Ring
  viewDate: string;
  onToggle: (inst: TodoInstance, done: boolean) => void;
  onEdit: (inst: TodoInstance) => void;
  onDelete: (inst: TodoInstance) => void;
  faded?: boolean;
};

function TodoRow({ inst, checked, active, viewDate, onToggle, onEdit, onDelete, faded }: RowProps) {
  const ring = active ? ACTIVE_RING : inst.color ?? null;
  return (
    <div
      onClick={() => onToggle(inst, checked)}
      className={cn(
        "group flex cursor-pointer items-start gap-3.5 rounded-lg px-2.5 py-3 transition-[background-color,transform] hover:bg-accent/40 active:scale-[0.995]",
        faded && "opacity-55",
      )}
    >
      <TodoCheckbox checked={checked} tint={ring} size={24} className="mt-0.5" ariaLabel={`${inst.title} ${checked ? "enthaken" : "abhaken"}`} onClick={() => onToggle(inst, checked)} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className={cn("min-w-0 flex-1 text-[16px] font-medium leading-snug [text-wrap:pretty]", checked && "text-muted-foreground line-through decoration-foreground/30")}>
            {inst.title}
          </span>
          {!checked && <MetaPill inst={inst} viewDate={viewDate} />}
          <RowMenu inst={inst} onEdit={onEdit} onDelete={onDelete} />
        </div>
        {inst.notes && <p className={cn("mt-0.5 truncate text-[12.5px] text-muted-foreground", checked && "line-through decoration-foreground/20")}>{inst.notes}</p>}
      </div>
    </div>
  );
}

// Zeilen-Auftritt wie im Kalender: gestaffelt mit blur(5px) + y, runter auf 0.
// EXIT = EINE Bewegung: die Zeile klappt ihre Hoehe synchron zum Wegfaden zu
// (overflow-hidden klippt den Inhalt), sodass die Luecke WAEHREND des Fadens
// kontinuierlich zugeht. Die Zeilen darunter tragen die Bewegung per layout-Feder mit.
function Row({ children, instId, index = 0 }: { children: React.ReactNode; instId: string; index?: number }) {
  const reduce = useReducedMotion();
  const enterDelay = 0.1 + Math.min(index * 0.07, 0.8);
  return (
    <motion.li
      layout={!reduce}
      key={instId}
      style={{ overflow: "hidden" }}
      initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(5px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={
        reduce
          ? { opacity: 0 }
          : {
              opacity: 0,
              height: 0,
              marginTop: 0,
              filter: "blur(2px)",
              transition: {
                height: { duration: MOTION.row.exitDur, ease: EXIT_EASE },
                marginTop: { duration: MOTION.row.exitDur, ease: EXIT_EASE },
                opacity: { duration: MOTION.row.exitDur, ease: EXIT_EASE },
                filter: { duration: MOTION.row.exitDur, ease: EXIT_EASE },
              },
            }
      }
      transition={{
        opacity: { duration: 0.42, delay: enterDelay, ease: EASE },
        y: { duration: 0.42, delay: enterDelay, ease: EASE },
        filter: { duration: 0.42, delay: enterDelay, ease: EASE },
        layout: MOTION.row.reflow,
      }}
    >
      {children}
    </motion.li>
  );
}

// Feine Trennlinie am Uebergang heute-offen -> ueberfaellig. Kleines rotes Label
// im Atlas-Stil (wie der "Erledigt"-Header), damit der Schnitt Bedeutung traegt
// statt nur eine zufaellige Linie zu sein.
function OpenDivider() {
  const reduce = useReducedMotion();
  return (
    <motion.li
      layout={!reduce}
      aria-hidden
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex items-center gap-2.5 px-2.5 pb-1 pt-2.5"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-red-600/80 dark:text-red-400/80">Überfällig</span>
      <span className="h-px flex-1 bg-border" />
    </motion.li>
  );
}

// --- Der Tag: flache Fokus-Liste --------------------------------------------

type ViewProps = {
  view: TodayView;
  cleared: boolean;
  completing: Set<string>;
  onToggle: (inst: TodoInstance, done: boolean) => void;
  onEdit: (inst: TodoInstance) => void;
  onDelete: (inst: TodoInstance) => void;
  onCreate: () => void;
  isToday: boolean;
};

function FocusView({ view, cleared, completing, onToggle, onEdit, onDelete, onCreate, isToday }: ViewProps) {
  const reduce = useReducedMotion();
  const [showDone, setShowDone] = useState(false);
  const open = [...view.today, ...view.overdue]; // heute offen zuerst, dann ueberfaellig
  const done = view.completed.length;
  const total = open.length + done;
  const frac = total > 0 ? done / total : 1;
  const status = buildStatus(view, isToday);

  return (
    <div>
      {/* Fortschritt: runterzaehlender Satz + lesbarer Tages-Fuellstand */}
      {total > 0 && (
        <div className="mb-7">
          {open.length > 0 && (
            <div className="mb-3 flex items-center justify-between gap-3 text-[15px] font-medium">
              <ClearableStatus text={status.text} cleared={cleared} />
              {status.overdue > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[13px] text-red-600 dark:text-red-400">
                  <span className="size-1.5 rounded-full bg-red-500" />
                  {status.overdue} überfällig
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-foreground" initial={false} animate={{ width: `${frac * 100}%` }} transition={{ duration: MOTION.bar.duration, ease: EASE }} />
            </div>
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">{done} / {total}</span>
          </div>
        </div>
      )}

      {/* Offene Tasks -- eine flache Liste in einer Karte, die die To-Dos klar
          vom restlichen Raum abgrenzt. Der oberste ist aktiv (Amber-Ring). */}
      {/* EINE durchgehende Karte: beim "alles erledigt" kommt KEINE neue Karte
          rein -- die bestehende waechst per layout-Feder in den Erledigt-Zustand.
          Die Reihen poppen (popLayout) aus dem Fluss raus, der Erledigt-Block
          rueckt sofort nach, und die Karten-Hoehe gleitet einmalig mit. */}
      <motion.div
        layout
        transition={{ layout: MOTION.row.reflow }}
        className="overflow-hidden rounded-2xl border bg-card p-1.5 shadow-sm"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {open.length > 0 ? (
            <motion.ul
              key="open"
              exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)", transition: { duration: 0.22, ease: EXIT_EASE } }}
              className="space-y-0.5"
            >
              <AnimatePresence>
                {open.flatMap((inst, i) => {
                  const node = (
                    <Row key={inst.todoId} instId={inst.todoId} index={i}>
                      <TodoRow inst={inst} checked={completing.has(inst.todoId)} active={i === 0} viewDate={view.date} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
                    </Row>
                  );
                  // Trenner genau vor der ersten ueberfaelligen Zeile (nur wenn oben
                  // auch offene Tasks stehen).
                  return view.today.length > 0 && view.overdue.length > 0 && i === view.today.length
                    ? [<OpenDivider key="open-divider" />, node]
                    : node;
                })}
              </AnimatePresence>
            </motion.ul>
          ) : (
            <motion.div
              key="cleared"
              initial={reduce ? false : { opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.32, delay: reduce ? 0 : 0.06, ease: EASE }}
            >
              <ClearedState isToday={isToday} hadAny={done > 0} cleared={cleared} onCreate={onCreate} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Erledigt */}
      {view.completed.length > 0 && (
        <section className="mt-7">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="mb-1 flex w-full items-center gap-2 px-2.5 text-left">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Erledigt</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">{view.completed.length}</span>
            <ChevronDown className={cn("ml-auto size-4 text-muted-foreground/60 transition-transform", showDone && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {showDone && (
              <motion.ul layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.24, ease: EASE }} className="space-y-0.5 overflow-hidden">
                {view.completed.map((inst, i) => (
                  <Row key={inst.todoId} instId={inst.todoId} index={i}>
                    <TodoRow inst={inst} checked active={false} viewDate={view.date} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} faded />
                  </Row>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}


// --- Kleinteile -------------------------------------------------------------

function ClearableStatus({ text, cleared }: { text: string; cleared: boolean }) {
  return (
    <span className="relative inline-flex items-center gap-2 text-foreground">
      <AnimatePresence>
        {cleared && (
          <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", duration: 0.5, bounce: 0.45 }}>
            <CircleCheck className="size-[18px]" strokeWidth={2.25} />
          </motion.span>
        )}
      </AnimatePresence>
      {text}
    </span>
  );
}

function ClearedState({ isToday, hadAny, cleared, onCreate }: { isToday: boolean; hadAny: boolean; cleared: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <motion.div initial={cleared ? { scale: 0, rotate: -12 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", duration: 0.55, bounce: 0.4 }}>
        <CircleCheck className="size-8 text-foreground" strokeWidth={1.75} />
      </motion.div>
      <p className="text-[15px] font-medium">{hadAny ? (isToday ? "Alles erledigt." : "Tag abgeräumt.") : isToday ? "Nichts fällig heute." : "Nichts fällig."}</p>
      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onCreate}>
        <Plus className="size-4" />
        Aufgabe
      </Button>
    </div>
  );
}
