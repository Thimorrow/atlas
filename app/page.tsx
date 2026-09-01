"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarCheck, CalendarPlus, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stagger, StaggerItem, SplitText } from "@/components/stagger";
import { EventSheet, type EditTarget } from "@/components/event-sheet";
import { AgendaTodoRow, LooseTodos, DayTodoDots } from "@/components/calendar-todos";
import { AutoplanSheet } from "@/components/autoplan-sheet";
import { planWeek, type PlanSuggestion } from "@/lib/todo-autoplan";
import { persistWrite, persistBatch } from "@/lib/persist";
import { decideSync } from "@/lib/untis/sync-policy";
import { evVar } from "@/lib/event-colors";
import type { TodoInstance, TodayView as TodoView } from "@/lib/todos-view";
import { cn } from "@/lib/utils";

// Aufgaben pro Tag (Wochen-Raster): key = YYYY-MM-DD. Lokaler Typ, damit der
// Client nicht das Server-Modul (lib/todo-expand -> DB) ziehen muss.
type TodoRange = Record<string, TodoInstance[]>;

// Optimistisches Abhaken/Enthaken einer Aufgabe in der Heute-Todo-Ansicht:
// verschiebt die Instanz zwischen den Sektionen und flippt `done`. Ein Reload
// korrigiert spaeter exakt.
function toggleTodoView(v: TodoView, inst: TodoInstance, currentlyDone: boolean): TodoView {
  const id = inst.todoId;
  if (!currentlyDone) {
    return {
      ...v,
      overdue: v.overdue.filter((x) => x.todoId !== id),
      today: v.today.filter((x) => x.todoId !== id),
      completed: [...v.completed, { ...inst, done: true, overdue: false }],
    };
  }
  return {
    ...v,
    completed: v.completed.filter((x) => x.todoId !== id),
    today: [...v.today, { ...inst, done: false }],
  };
}

// --- Typen (Form der /api/calendar-Antwort) ---------------------------------

type Ev = {
  source: "school" | "routine" | "manual";
  refId: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  color?: string | null;
  location?: string | null;
  allDay?: boolean;
  notes?: string | null;
  status?: "regular" | "cancelled" | "substituted";
  room?: string | null;
  teacher?: string | null;
};
type Free = { date: string; startTime: string; endTime: string; minutes: number };
type Day = { date: string; weekday: number; events: Ev[]; freeSlots: Free[] };
type Goal = { routineId: string; title: string; targetPerWeek: number; done: number };
type RangeData = { start: string; end: string; days: Day[]; flexibleGoals: Goal[] };

// --- Konstanten -------------------------------------------------------------

const DAY_START = 6;
const DAY_END = 23;
const HOUR_H = 56;
// Kurze Termine (z.B. 30-min-Klavier) nie zur flachen Pille quetschen -- jeder
// Block ist mindestens so hoch, dass Titel + Uhrzeit als Karte lesbar sind.
const MIN_EVENT_H = 44;
const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);

// Atlas-Signaturkurve (= --ease-atlas), als Array fuer Framer.
const EASE = [0.22, 1, 0.36, 1] as const;
const BURST_EASE = [0.16, 1, 0.3, 1] as const;

// Mini-Aufgabe auf der Wochen-Zeitachse. Erledigt -> fadet auf 0.5; beim echten
// Abhaken (false -> true) ploppt der Punkt einmal kurz (eigener Trigger, damit
// schon-erledigt mountende Tage still bleiben).
function WeekTodoChip({
  title,
  done,
  accent,
  top,
  delay,
  reduce,
  onClick,
}: {
  title: string;
  done: boolean;
  accent: string;
  top: number;
  delay: number;
  reduce: boolean;
  onClick: () => void;
}) {
  const prev = useRef(done);
  const [pop, setPop] = useState(0);
  useEffect(() => {
    if (done && !prev.current) setPop((p) => p + 1);
    prev.current = done;
  }, [done]);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={done ? `${title} als offen markieren` : `${title} abhaken`}
      className="absolute inset-x-1 z-[1] flex items-center gap-1 rounded border border-l-2 border-border/60 bg-muted/50 px-1 py-px text-left transition-colors duration-150 hover:bg-muted/80"
      style={{ top, borderLeftColor: accent }}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: done ? 0.5 : 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: EASE }}
    >
      <motion.span
        key={pop}
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: accent }}
        initial={pop > 0 && !reduce ? { scale: 1 } : false}
        animate={pop > 0 && !reduce ? { scale: [1, 1.9, 1] } : {}}
        transition={{ duration: 0.42, ease: BURST_EASE }}
      />
      <span className={cn("truncate text-[11px] font-medium leading-tight text-foreground/80", done && "text-muted-foreground line-through")}>
        {title}
      </span>
    </motion.button>
  );
}

// --- Block-Stile ------------------------------------------------------------
// Fächer-Blöcke: dicker Farbrand (6px) + sattere Füllung -- hebt sie klar vom
// Hintergrund ab. Farbe codiert die Quelle (Schule/Routine/Manuell).
const SRC: Record<Ev["source"], string> = {
  school: "border-l-[6px] border-l-blue-500 bg-blue-100/80 ring-1 ring-inset ring-black/[0.06] dark:bg-blue-500/20 dark:ring-white/[0.08]",
  routine: "border-l-[6px] border-l-amber-500 bg-amber-100/80 ring-1 ring-inset ring-black/[0.06] dark:bg-amber-500/20 dark:ring-white/[0.08]",
  manual: "border-l-[6px] border-l-emerald-500 bg-emerald-100/80 ring-1 ring-inset ring-black/[0.06] dark:bg-emerald-500/20 dark:ring-white/[0.08]",
};

// Entfall (V3): entfallene Schulstunden werden NICHT als eigener Block gezeigt,
// sondern als leiser Chip an der ECHTEN Startzeit der Stunde. So bleibt die
// freigewordene Zeit (und dort geplante Aufgaben) klar lesbar, die Info "faellt
// aus" geht aber nicht verloren -- statt Doppelung "Frei" + "Entfall"-Block.
// Leiser Entfall-Chip fuer die Heute-Liste.
function CancelChip({ title }: { title: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-1.5 py-px text-[10px] font-medium text-muted-foreground/90">
      <span className="size-1 rounded-full bg-red-500/45" />
      {title} entfällt
    </span>
  );
}

// Ein terminiertes Todo bekommt nur dann eine Spur auf der Wochen-Zeitachse,
// wenn seine Uhrzeit an DEM Tag wirklich frei ist -- sonst laege es ueber einer
// Stunde (haesslich). Greift v. a. bei taeglichen Aufgaben mit fixer Uhrzeit.
function todoFitsTimeline(t: TodoInstance, freeSlots: Free[]): boolean {
  if (!t.scheduledTime || t.done) return false;
  const m = toMin(t.scheduledTime);
  return freeSlots.some((f) => toMin(f.startTime) <= m && m < toMin(f.endTime));
}

// --- Helfer -----------------------------------------------------------------

function toMin(t: string) {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}
function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localISO(d);
}
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const monthOf = (iso: string) => Number(iso.slice(5, 7)) - 1;
const hm = (t: string) => t.slice(0, 5);

function formatRange(start: string, end: string) {
  const sm = monthOf(start) === monthOf(end);
  return sm
    ? `${dayNum(start)}.–${dayNum(end)}. ${MONTHS[monthOf(end)]} ${end.slice(0, 4)}`
    : `${dayNum(start)}. ${MONTHS[monthOf(start)]} – ${dayNum(end)}. ${MONTHS[monthOf(end)]} ${end.slice(0, 4)}`;
}

// 0 = Montag ... 6 = Sonntag (lokal).
function weekdayOf(iso: string) {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

// Block-Look: eigene Farbe (manuell/Routine) -> ev-tint via --ev; sonst
// Quellen-Default (Schule blau, Routine ohne Farbe gelb, manuell gruen).
// Entfall rendert nicht mehr als Block (s. CancelChip / Wochen-Entfall-Chip).
function blockLook(ev: Ev): { className: string; style?: CSSProperties } {
  if (ev.color && ev.source !== "school") return { className: "border-l-[6px] ev-tint", style: evVar(ev.color) };
  return { className: SRC[ev.source] };
}

// Nur eigene Eintraege sind editierbar (Schulstunden kommen read-only aus Untis).
const editable = (ev: Ev) => ev.source === "manual" || ev.source === "routine";

// CalendarEvent -> Sheet-Vorbelegung.
function toEdit(ev: Ev): EditTarget {
  return {
    source: ev.source as "manual" | "routine",
    refId: ev.refId,
    title: ev.title,
    date: ev.date,
    weekday: weekdayOf(ev.date),
    startTime: ev.startTime,
    endTime: ev.endTime,
    color: ev.color ?? null,
    location: ev.location ?? null,
    notes: ev.notes ?? null,
    allDay: ev.allDay,
  };
}

type Packed = { ev: Ev; s: number; e: number; lane: number; lanes: number };

// Untis liefert Schulstunden teils als getrennte Perioden (z.B. 2x 45min mit
// kurzer Pause). Aufeinanderfolgende Stunden desselben Fachs (gleicher Status,
// Lücke <= 25min) zu EINEM Block zusammenfassen -> "eine Stunde statt zwei".
const GAP_MERGE_MIN = 25;

function mergeSchool(events: Ev[]): Ev[] {
  const school = events
    .filter((e) => e.source === "school")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const rest = events.filter((e) => e.source !== "school");

  const merged: Ev[] = [];
  for (const ev of school) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.title === ev.title &&
      last.status === ev.status &&
      last.endTime &&
      toMin(ev.startTime) - toMin(last.endTime) <= GAP_MERGE_MIN
    ) {
      last.endTime = ev.endTime ?? last.endTime;
    } else {
      merged.push({ ...ev });
    }
  }
  return [...merged, ...rest];
}

function packDay(events: Ev[]): Packed[] {
  const items: Packed[] = events
    .map((ev) => {
      const s = Math.max(toMin(ev.startTime), DAY_START * 60);
      const raw = ev.endTime ? toMin(ev.endTime) : DAY_END * 60;
      const e = Math.min(Math.max(raw, s + 5), DAY_END * 60);
      return { ev, s, e, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.s - b.s || a.e - b.e);

  let cluster: Packed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const ends: number[] = [];
    for (const it of cluster) {
      let placed = false;
      for (let i = 0; i < ends.length; i++) {
        if (it.s >= ends[i]) {
          it.lane = i;
          ends[i] = it.e;
          placed = true;
          break;
        }
      }
      if (!placed) {
        it.lane = ends.length;
        ends.push(it.e);
      }
    }
    const n = ends.length || 1;
    for (const it of cluster) it.lanes = n;
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = cluster.length === 1 ? it.e : Math.max(clusterEnd, it.e);
  }
  flush();
  return items;
}

// Wochen-Zeitachse: alle 7 Tage teilen sich EINE Y-Achse. "Anker" = volle Höhe
// bekommt nur, wo ein WERKTAGS-Termin (Mo-Fr) KÜRZER als 3 h liegt. Alles andere
// staucht: leere Zeit (Pausen, Morgen, Abend), Wochenend-Termine und lange Blöcke
// (>= 3 h) dürfen kürzer aussehen. So gibt die Woche den Takt vor und der Tag
// bleibt kompakt. Geteilte Achse: ein Anker an einer Minute hält ALLE Tage auf.
const BREAK_SCALE = 0.3;
const LONG_EVENT_MIN = 180; // ab 3 h gilt ein Termin als "lang" -> nicht ankern

type Seg = { s: number; e: number; anchored: boolean };
type TimeScale = { yOf: (min: number) => number; total: number };

// Zerlegt den Tag in Segmente mit Anker-Flag. Die Pixel-Verteilung passiert
// spaeter hoehenabhaengig (fitScale), damit kurze Termine eine Mindesthoehe IN
// DER ACHSE bekommen -> der Block endet exakt zu seiner echten Uhrzeit.
function buildSegments(packedDays: Packed[][], days: Day[]): Seg[] {
  const DS = DAY_START * 60;
  const DE = DAY_END * 60;
  const clamp = (m: number) => Math.max(DS, Math.min(DE, m));

  // Anker-Intervalle: Werktags-Termine (weekday < 5) unter 3 h.
  const ivs: [number, number][] = [];
  packedDays.forEach((day, i) => {
    if (!days[i] || days[i].weekday >= 5) return;
    for (const p of day) {
      if (p.e - p.s >= LONG_EVENT_MIN) continue;
      ivs.push([clamp(p.s), clamp(p.e)]);
    }
  });

  if (ivs.length === 0) return [{ s: DS, e: DE, anchored: false }];

  ivs.sort((a, b) => a[0] - b[0]);
  const anchors: [number, number][] = [];
  for (const iv of ivs) {
    const last = anchors[anchors.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else anchors.push([iv[0], iv[1]]);
  }
  const isAnchored = (s: number, e: number) => anchors.some(([a, b]) => s >= a && e <= b);

  const pts = new Set<number>([DS, DE]);
  for (const [a, b] of anchors) {
    pts.add(a);
    pts.add(b);
  }
  const bounds = [...pts].filter((x) => x >= DS && x <= DE).sort((a, b) => a - b);

  const segs: Seg[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    segs.push({ s: bounds[i], e: bounds[i + 1], anchored: isAnchored(bounds[i], bounds[i + 1]) });
  }
  return segs;
}

// "in 25 min" / "in 1 h 10 min" / "läuft" -- relativ zu jetzt.
function relLabel(deltaMin: number) {
  if (deltaMin <= 0) return "läuft";
  if (deltaMin < 60) return `in ${deltaMin} min`;
  const h = Math.floor(deltaMin / 60);
  const m = deltaMin % 60;
  return m ? `in ${h} h ${m} min` : `in ${h} h`;
}
function durLabel(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const WEEKDAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function eventMeta(ev: Ev) {
  if (ev.source === "school") {
    return [ev.room, ev.teacher].filter(Boolean).join(" · ");
  }
  return `${hm(ev.startTime)}${ev.endTime ? `–${hm(ev.endTime)}` : ""}`;
}

// --- Heute-Ansicht ----------------------------------------------------------

type AgendaItem =
  | { kind: "ev"; s: number; e: number; ev: Ev }
  | { kind: "free"; s: number; e: number; free: Free }
  | { kind: "cancel"; s: number; e: number; ev: Ev }
  | { kind: "todo"; s: number; e: number; inst: TodoInstance };

function TodayView({ day, goals, todos, nowMin, dayPast, stagger, onEdit, onToggleTodo }: { day: Day | undefined; goals: Goal[]; todos: TodoView | null; nowMin: number; dayPast: boolean; stagger: boolean; onEdit: (ev: Ev) => void; onToggleTodo: (inst: TodoInstance, done: boolean) => void }) {
  // F10: Reduced-Motion explizit gaten -- sonst laufen opacity + filter:blur
  // trotz globalem reducedMotion="user" weiter. Hook vor jedem Early-Return.
  const reduce = useReducedMotion();
  const animate = stagger && !reduce;
  if (!day) {
    return <div className="py-24 text-center text-sm text-muted-foreground">Keine Daten.</div>;
  }

  const isToday = nowMin >= 0;

  // Ganztags-Eintraege liegen nicht auf der Zeitachse -> eigene Balken oben.
  const allDayEvents = day.events.filter((e) => e.allDay);

  const onTimeline = mergeSchool(day.events).filter((e) => e.startTime && !e.allDay);
  // Entfall (V3): nicht als Block, sondern als leiser Chip -- an der ECHTEN
  // Startzeit der Stunde (eigene schlanke Agenda-Zeile), nicht am Frei-Anfang.
  const cancelledEvs = onTimeline.filter((e) => e.status === "cancelled");
  const evs = onTimeline
    .filter((e) => e.status !== "cancelled")
    .map((ev) => ({ ev, s: toMin(ev.startTime), e: ev.endTime ? toMin(ev.endTime) : toMin(ev.startTime) + 45 }))
    .sort((a, b) => a.s - b.s);

  const upcoming = evs.filter((x) => x.e > nowMin);
  const next = upcoming[0];
  const ongoing = isToday && next ? next.s <= nowMin : false;
  const nextKey = next ? `${next.ev.source}-${next.ev.refId}-${next.s}` : null;
  const openGoals = goals.filter((g) => g.done < g.targetPerWeek);

  // Aufgaben (subtil): terminierte (mit Uhrzeit) weben sich in die Zeitachse,
  // der Rest (ohne Uhrzeit) + Ueberfaelliges liegt als ruhige Zeile darunter.
  const tToday = todos?.today ?? [];
  const tCompleted = todos?.completed ?? [];
  const tOverdue = todos?.overdue ?? [];
  const scheduledTodos = [...tToday, ...tCompleted].filter((t) => t.scheduledTime);
  const looseTodos = tToday.filter((t) => !t.scheduledTime);

  // Events + freie Lücken + terminierte Aufgaben zu EINER chronologischen Agenda.
  const agenda: AgendaItem[] = [
    ...evs.map((x): AgendaItem => ({ kind: "ev", s: x.s, e: x.e, ev: x.ev })),
    ...day.freeSlots
      .filter((f) => f.minutes >= 30)
      .map((f): AgendaItem => ({ kind: "free", s: toMin(f.startTime), e: toMin(f.endTime), free: f })),
    ...cancelledEvs.map((ev): AgendaItem => ({
      kind: "cancel",
      s: toMin(ev.startTime),
      e: ev.endTime ? toMin(ev.endTime) : toMin(ev.startTime) + 45,
      ev,
    })),
    ...scheduledTodos.map((inst): AgendaItem => {
      const s = toMin(inst.scheduledTime!);
      return { kind: "todo", s, e: s + (inst.estMinutes ?? 0), inst };
    }),
  ].sort((a, b) => a.s - b.s || a.e - b.e);

  // Status-Kopfzeile
  let kicker: ReactNode;
  if (next && ongoing) {
    kicker = (
      <span className="inline-flex items-center gap-1.5 text-red-500">
        {/* I3: solider Punkt statt endlosem animate-pulse (AI-Slop-Tell + nervt
            dauerhaft). Die rote Farbe + "Jetzt"-Text tragen die Aussage. */}
        <span className="size-1.5 rounded-full bg-red-500" /> Jetzt · {next.ev.title}
      </span>
    );
  } else if (next && isToday) {
    kicker = (
      <span className="text-foreground">
        Als Nächstes · <span className="font-semibold">{next.ev.title}</span>
        <span className="tabular-nums text-muted-foreground"> · {relLabel(next.s - nowMin)}</span>
      </span>
    );
  } else if (next) {
    kicker = (
      <span className="text-foreground">
        Erster Termin · <span className="font-semibold">{next.ev.title}</span>
        <span className="font-mono tabular-nums text-muted-foreground"> · {hm(next.ev.startTime)}</span>
      </span>
    );
  } else {
    kicker = <span className="text-muted-foreground">{isToday ? "Heute stehen keine Termine mehr an." : "Keine Termine an diesem Tag."}</span>;
  }

  return (
    <div className="mx-auto w-full max-w-xl pb-10">
      {/* Status-Kopf */}
      <motion.div
        initial={animate ? { opacity: 0, y: 6 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: EASE }}
        className="mb-5 flex items-center justify-between gap-3 text-[15px] font-medium"
      >
        <div>{kicker}</div>
        {next && ongoing && <span className="shrink-0 font-mono text-[13px] tabular-nums text-red-500">noch {durLabel(next.e - nowMin)}</span>}
      </motion.div>

      {/* Ganztags-Eintraege -- als Balken oben, klickbar zum Bearbeiten */}
      {allDayEvents.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5">
          {allDayEvents.map((ev) => {
            const look = blockLook(ev);
            return (
              <button
                key={`${ev.source}-${ev.refId}`}
                onClick={() => onEdit(ev)}
                style={look.style}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-l-[6px] px-3 py-2 text-left transition-shadow hover:shadow-sm",
                  look.className,
                )}
              >
                <span className="flex-1 truncate text-[14px] font-semibold leading-tight">{ev.title}</span>
                {ev.location && <span className="shrink-0 truncate text-[12px] text-muted-foreground">{ev.location}</span>}
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">Ganztags</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Tages-Agenda: Stunden + freie Lücken verwoben */}
      {agenda.length > 0 ? (
        <ul className="space-y-1.5">
          {agenda.map((it, i) => {
            // Vergangener Tag (gestern & frueher) -> alles geblasst; heute nur
            // das, was zeitlich schon vorbei ist; Zukunft -> nichts.
            const past = dayPast || (isToday && it.e <= nowMin);
            // Agenda cascadet beim Mount Item fuer Item klar nacheinander rein
            // (groesserer Schritt + Basis-Delay -> spuerbar, nicht "alles auf einmal").
            const delay = stagger ? 0.1 + Math.min(i * 0.07, 0.8) : 0;

            if (it.kind === "free") {
              return (
                <motion.li
                  key={`free-${it.s}`}
                  initial={animate ? { opacity: 0, y: 8, filter: "blur(5px)" } : false}
                  animate={{ opacity: past ? 0.4 : 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.42, delay, ease: EASE }}
                  className="grid grid-cols-[52px_1fr] items-center gap-3"
                >
                  <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">{hm(it.free.startTime)}</span>
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-1.5 text-[12px] text-muted-foreground">
                    <span>Frei</span>
                    <span className="ml-auto font-mono tabular-nums text-muted-foreground/70">{durLabel(it.free.minutes)}</span>
                  </div>
                </motion.li>
              );
            }

            if (it.kind === "cancel") {
              return (
                <motion.li
                  key={`cancel-${it.ev.source}-${it.ev.refId}-${it.s}`}
                  initial={animate ? { opacity: 0, y: 8, filter: "blur(5px)" } : false}
                  animate={{ opacity: past ? 0.4 : 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.42, delay, ease: EASE }}
                  className="grid grid-cols-[52px_1fr] items-center gap-3"
                >
                  <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">{hm(it.ev.startTime)}</span>
                  <div className="flex items-center">
                    <CancelChip title={it.ev.title} />
                  </div>
                </motion.li>
              );
            }

            if (it.kind === "todo") {
              return (
                <motion.li
                  key={`todo-${it.inst.todoId}`}
                  initial={animate ? { opacity: 0, y: 8, filter: "blur(5px)" } : false}
                  animate={{ opacity: past ? 0.4 : 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.42, delay, ease: EASE }}
                  className="grid grid-cols-[52px_1fr] items-center gap-3"
                >
                  <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">{hm(it.inst.scheduledTime!)}</span>
                  <AgendaTodoRow inst={it.inst} onToggle={onToggleTodo} />
                </motion.li>
              );
            }

            const isNext = `${it.ev.source}-${it.ev.refId}-${it.s}` === nextKey;
            const meta = eventMeta(it.ev);
            const look = blockLook(it.ev);
            const canEdit = editable(it.ev);
            return (
              <motion.li
                key={`${it.ev.source}-${it.ev.refId}-${it.s}`}
                initial={stagger ? { opacity: 0, y: 8, filter: "blur(5px)" } : false}
                animate={{ opacity: past ? 0.45 : 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.42, delay, ease: EASE }}
                className="grid grid-cols-[52px_1fr] items-stretch gap-3"
              >
                <span className="pt-2 text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">{hm(it.ev.startTime)}</span>
                <div
                  onClick={canEdit ? () => onEdit(it.ev) : undefined}
                  className={cn(
                    "relative overflow-hidden rounded-lg border border-l-[3px] px-3 py-2",
                    look.className,
                    isNext && "ring-2 ring-primary/30",
                    canEdit && "cursor-pointer transition-[box-shadow,scale] hover:shadow-sm active:scale-[0.96]",
                  )}
                  style={look.style}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="flex-1 truncate text-[14px] font-semibold leading-tight">
                      {it.ev.title}
                    </span>
                    {it.ev.endTime && (
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {durLabel(it.e - it.s)}
                      </span>
                    )}
                  </div>
                  {(meta || it.ev.status === "substituted" || (canEdit && it.ev.location)) && (
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                      {it.ev.source === "school" && meta && <span>{meta}</span>}
                      {canEdit && it.ev.location && <span className="truncate">{it.ev.location}</span>}
                      {it.ev.status === "substituted" && (
                        <motion.span
                          initial={animate ? { opacity: 0, scale: 0.9, filter: "blur(2px)" } : false}
                          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                          transition={{ duration: 0.25, delay: delay + 0.1, ease: EASE }}
                          className="inline-flex rounded bg-amber-500/15 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400"
                        >
                          Vertretung
                        </motion.span>
                      )}
                    </div>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      ) : (
        // O8: seltener, ruhiger Moment -> ein kleiner Reveal + Icon ist hier
        // willkommen statt nacktem Text.
        <motion.div
          initial={stagger ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground"
        >
          <CalendarCheck className="size-6 text-muted-foreground/50" />
          {isToday ? "Heute keine Termine." : "Keine Termine an diesem Tag."}
        </motion.div>
      )}

      {/* Aufgaben ohne Uhrzeit + Ueberfaelliges -- ruhig unter der Agenda */}
      <LooseTodos open={looseTodos} overdue={tOverdue} onToggle={onToggleTodo} stagger={stagger} />

      {/* Offene flexible Ziele der Woche */}
      {openGoals.length > 0 && (
        <section className="mt-6">
          <h4 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Offene Wochenziele</h4>
          <div className="flex flex-wrap gap-2">
            {openGoals.map((g) => (
              <span key={g.routineId} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-amber-500" />
                {g.title}
                <span className="font-mono tabular-nums text-foreground">
                  {g.done}/{g.targetPerWeek}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// --- Komponente -------------------------------------------------------------

export default function Home() {
  const reduce = useReducedMotion();
  const [anchor, setAnchor] = useState(() => localISO(new Date()));
  const [mode, setMode] = useState<"week" | "today">("week");
  const [data, setData] = useState<RangeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<{ date: string; min: number } | null>(null);
  // Beim allerersten Load warten die Termine auf den Section-Auftritt der Card
  // (groessere Basis-Verzoegerung). Danach (Wochenwechsel) cascaden sie sofort.
  const firstPaint = useRef(true);
  // Nur der allererste View-Mount blurrt NICHT (da traegt der StaggerItem-Auftritt).
  // Jeder spaetere Remount (Mode-Switch, Tageswechsel) blurrt als Block rein.
  const firstView = useRef(true);

  // Sichtbare Hoehe des Wochen-Scrollbereichs -- damit das (durch Stauchung
  // kurze) Raster nach unten auf den Screen gezogen wird statt leer zu enden.
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(0);

  // Anlegen/Bearbeiten-Sheet + Reload-Trigger + Untis-Sync.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Aufgaben subtil im Kalender: Heute-Ansicht zieht die Tagesliste, Wochen-
  // Ansicht die konkret terminierten Aufgaben pro Tag (fuer die Punkte).
  const [dayTodos, setDayTodos] = useState<TodoView | null>(null);
  const [weekTodos, setWeekTodos] = useState<TodoRange>({});

  // Auto-Planer: Vorschlaege + bestaetigen (nichts wird ohne Zutun geschrieben).
  const [planOpen, setPlanOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PlanSuggestion[]>([]);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());

  const toggleTodo = useCallback(
    (inst: TodoInstance, currentlyDone: boolean) => {
      setDayTodos((v) => (v ? toggleTodoView(v, inst, currentlyDone) : v));
      persistWrite(
        () =>
          fetch(`/api/todos/${inst.todoId}/complete`, {
            method: currentlyDone ? "DELETE" : "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ date: anchor }),
          }),
        {
          message: currentlyDone ? "Konnte nicht als offen markieren." : "Konnte nicht abhaken.",
          onFail: () => setReloadKey((k) => k + 1),
          retry: () => toggleTodo(inst, currentlyDone),
        },
      );
    },
    [anchor],
  );

  // Abhaken direkt aus dem Wochen-Raster: jede Spur traegt ihren eigenen Tag
  // (inst.date), abgehakt wird also fuer genau diesen Tag -- nicht fuer "anchor".
  const toggleWeekTodo = useCallback(
    (inst: TodoInstance) => {
      const date = inst.date;
      const wasDone = inst.done;
      setWeekTodos((prev) => {
        const day = prev[date];
        if (!day) return prev;
        return { ...prev, [date]: day.map((t) => (t.todoId === inst.todoId ? { ...t, done: !wasDone } : t)) };
      });
      // Wenn derselbe Tag gerade auch als Heute-Detail offen ist: dort spiegeln.
      if (date === anchor) setDayTodos((v) => (v ? toggleTodoView(v, inst, wasDone) : v));
      persistWrite(
        () =>
          fetch(`/api/todos/${inst.todoId}/complete`, {
            method: wasDone ? "DELETE" : "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ date }),
          }),
        {
          message: wasDone ? "Konnte nicht als offen markieren." : "Konnte nicht abhaken.",
          onFail: () => setReloadKey((k) => k + 1),
          retry: () => toggleWeekTodo(inst),
        },
      );
    },
    [anchor],
  );

  // Atlas plant die Woche: offene, un-terminierte Aufgaben in die freien Luecken.
  const openPlan = () => {
    if (!data) return;
    const freeByDay = Object.fromEntries(data.days.map((d) => [d.date, d.freeSlots]));
    const onToday = now && data.days.some((d) => d.date === now.date);
    const sugg = planWeek(weekTodos, freeByDay, {
      minStartISO: now?.date,
      minStartMin: onToday ? now!.min : 0,
    });
    setSuggestions(sugg);
    setAcceptedIds(new Set());
    setPlanOpen(true);
  };

  const patchTime = (id: string, time: string) =>
    fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduledTime: time }),
    });

  const acceptOne = (s: PlanSuggestion) => {
    setAcceptedIds((prev) => new Set(prev).add(s.todoId));
    persistWrite(() => patchTime(s.todoId, s.startTime), {
      message: "Konnte den Vorschlag nicht einplanen.",
      onFail: () =>
        setAcceptedIds((prev) => {
          const n = new Set(prev);
          n.delete(s.todoId);
          return n;
        }),
      retry: () => acceptOne(s),
    });
  };

  const acceptAll = () => {
    const pending = suggestions.filter((s) => !acceptedIds.has(s.todoId));
    if (pending.length === 0) return;
    setAcceptedIds(new Set(suggestions.map((s) => s.todoId)));
    persistBatch(
      pending.map((s) => () => patchTime(s.todoId, s.startTime)),
      {
        message: "Einige Vorschläge konnten nicht eingeplant werden.",
        onFail: () =>
          setAcceptedIds((prev) => {
            const n = new Set(prev);
            pending.forEach((s) => n.delete(s.todoId));
            return n;
          }),
        retry: () => acceptAll(),
      },
    );
  };

  // Beim Schliessen die Ansicht aktualisieren, damit angenommene Zeiten erscheinen.
  const closePlan = () => {
    setPlanOpen(false);
    if (acceptedIds.size > 0) setReloadKey((k) => k + 1);
  };

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (ev: Ev) => {
    setEditing(toEdit(ev));
    setSheetOpen(true);
  };
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const urlView = p.get("view");
    // URL-Parameter hat Vorrang, sonst gemerkten Modus aus localStorage nehmen.
    if (urlView === "today" || (!urlView && localStorage.getItem("atlas:calMode") === "today")) {
      setMode("today");
      if (urlView === "today") localStorage.setItem("atlas:calMode", "today");
    }
    const d = p.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setAnchor(d);
  }, []);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow({ date: localISO(d), min: d.getHours() * 60 + d.getMinutes() });
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // Untis-Sync nach Tageszeit-Politik (lib/untis/sync-policy):
  // - beim Laden/Reload: synct, wenn der letzte Sync fuer die aktuelle Uhrzeit zu alt ist
  // - 60s-Tick: synct nur in aktiven Poll-Fenstern (morgens 06:30–07:15 alle 2 min)
  // lastSync wird geraetelokal in localStorage gemerkt. Nach Erfolg -> reloadKey++,
  // damit der Kalender die frischen DB-Daten still nachzieht (kein Spinner, data bleibt).
  useEffect(() => {
    const KEY = "atlas:untisLastSync";
    let alive = true;
    let busy = false;

    const readLast = (): number | null => {
      const v = Number(localStorage.getItem(KEY));
      return Number.isFinite(v) && v > 0 ? v : null;
    };

    const runSync = async (reason: "load" | "tick") => {
      if (busy) return;
      const { shouldSync, pollMin } = decideSync(new Date(), readLast());
      if (!shouldSync) return;
      if (reason === "tick" && pollMin == null) return; // Ticks nur in Poll-Fenstern
      busy = true;
      try {
        const res = await fetch("/api/sync/untis", { method: "POST" });
        if (res.ok && alive) {
          localStorage.setItem(KEY, String(Date.now()));
          setReloadKey((k) => k + 1);
        }
      } catch {
        // Netzfehler ignorieren — der naechste Tick/Reload versucht es erneut.
      } finally {
        busy = false;
      }
    };

    runSync("load");
    const id = setInterval(() => runSync("tick"), 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/calendar?view=week&date=${anchor}`)
      .then((r) => r.json())
      .then((d: RangeData) => alive && (setData(d), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [anchor, reloadKey]);

  // Aufgaben laden -- je nach Ansicht der Tag (Heute) bzw. die Woche (Punkte).
  useEffect(() => {
    let alive = true;
    if (mode === "today") {
      fetch(`/api/todos/today?date=${anchor}`)
        .then((r) => r.json())
        .then((d: { view: TodoView }) => alive && setDayTodos(d.view))
        .catch(() => {});
    } else {
      const start = addDays(anchor, -weekdayOf(anchor));
      const end = addDays(start, 6);
      fetch(`/api/todos/range?start=${start}&end=${end}`)
        .then((r) => r.json())
        .then((d: { days: TodoRange }) => alive && setWeekTodos(d.days ?? {}))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [anchor, mode, reloadKey]);

  // Nach dem ersten Datensatz die Basis-Verzoegerung der Termine abschalten.
  useEffect(() => {
    if (data) firstPaint.current = false;
  }, [data]);

  // Nach dem ersten Paint duerfen alle weiteren View-Remounts blurren.
  useEffect(() => {
    firstView.current = false;
  }, []);

  const label = data ? formatRange(data.start, data.end) : "";
  const todayISO = now?.date ?? localISO(new Date());
  const focusDay = data?.days.find((d) => d.date === anchor);
  const dayLabel = focusDay
    ? `${WEEKDAYS_LONG[focusDay.weekday]}, ${dayNum(anchor)}. ${MONTHS[monthOf(anchor)]}${anchor === todayISO ? " · Heute" : ""}`
    : "";
  // Ganztags-Eintraege liegen nicht im Zeitraster -> vor dem Packen rauswerfen.
  // Entfall (V3) ebenfalls nicht als Block -> raus aus dem Packen, getrennt
  // gehalten fuer die Chips in den freien Luecken.
  const packedDays = useMemo(
    () => (data ? data.days.map((d) => packDay(mergeSchool(d.events).filter((e) => !e.allDay && e.status !== "cancelled"))) : []),
    [data],
  );
  const cancelledByDay = useMemo(
    () => (data ? data.days.map((d) => mergeSchool(d.events).filter((e) => !e.allDay && e.status === "cancelled")) : []),
    [data],
  );
  // Segmente (Anker/leer) -- aus den gepackten Tagen, hoehenunabhaengig.
  const segments = useMemo(() => buildSegments(packedDays, data?.days ?? []), [packedDays, data]);

  // Scrollbereich messen (mode/data -> Raster gerade gemountet bzw. neu befuellt).
  useEffect(() => {
    const el = gridScrollRef.current;
    if (!el) return;
    const measure = () => setViewH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, data]);

  // Pixel-Verteilung: der ganze Tag (06-23 Uhr) fuellt EXAKT die sichtbare Hoehe
  // ohne Scrollen. Oben/unten ein Polster, damit 06- und 23-Uhr-Label voll
  // sichtbar bleiben. Anker bekommen Gewicht nach Dauer, leere Zeit gestaucht
  // (BREAK_SCALE). Danach: jeder Anker-Abschnitt, der kuerzer als MIN_EVENT_H
  // waere, wird auf MIN_EVENT_H gehoben -- der fehlende Platz kommt aus der leeren
  // Zeit. So ist ein 30-min-Klavier eine lesbare Karte UND endet exakt bei 16:45.
  const fitScale = useMemo<TimeScale>(() => {
    const DS = DAY_START * 60;
    const DE = DAY_END * 60;
    const ppm = HOUR_H / 60;
    const PAD_TOP = 12;
    const PAD_BOTTOM = 16;
    const clamp = (m: number) => Math.max(DS, Math.min(DE, m));

    const items = segments.map((sg) => {
      const mins = sg.e - sg.s;
      return { ...sg, mins, weight: sg.anchored ? mins : mins * BREAK_SCALE, px: 0, y0: 0 };
    });
    const totalWeight = items.reduce((a, x) => a + x.weight, 0) || 1;

    const usable = viewH > 0 ? Math.max(viewH - PAD_TOP - PAD_BOTTOM, 1) : (DE - DS) * ppm;
    items.forEach((x) => (x.px = (x.weight / totalWeight) * usable));

    // Kurze Anker-Abschnitte auf MIN_EVENT_H heben, Defizit aus leerer Zeit ziehen.
    const bumped = items.filter((x) => x.anchored && x.px < MIN_EVENT_H);
    const deficit = bumped.reduce((a, x) => a + (MIN_EVENT_H - x.px), 0);
    const emptyItems = items.filter((x) => !x.anchored);
    const emptyPx = emptyItems.reduce((a, x) => a + x.px, 0);
    if (deficit > 0 && emptyPx - deficit > 0) {
      const factor = (emptyPx - deficit) / emptyPx;
      bumped.forEach((x) => (x.px = MIN_EVENT_H));
      emptyItems.forEach((x) => (x.px *= factor));
    }

    let y = PAD_TOP;
    items.forEach((x) => {
      x.y0 = y;
      y += x.px;
    });

    const total = viewH > 0 ? viewH : y + PAD_BOTTOM;
    const yOf = (min: number) => {
      const c = clamp(min);
      for (const x of items) {
        if (c <= x.e) return x.y0 + ((c - x.s) / (x.mins || 1)) * x.px;
      }
      return y;
    };
    return { yOf, total };
  }, [segments, viewH]);

  return (
    <main className="flex h-full min-h-0 flex-col">
      {/* Split & Stagger (Jakub Krehel): die Page-Sections kommen beim Reload
          gestaffelt mit blur + opacity + translateY rein -- Kopf, dann Wochenziele,
          dann die Kalender-Card. Reduced-Motion-Gate global ueber MotionConfig. */}
      <Stagger className="flex min-h-0 flex-1 flex-col">
      {/* Kopf: Modulname + Wochen-Navigation */}
      <StaggerItem className="shrink-0 px-6 pt-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold leading-tight tracking-tight">
            <SplitText text="Kalender" />
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {mode === "today" ? "Dein heutiger Tag auf einen Blick." : "Schule, Routinen und Termine in einer Woche."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <h2 className="mr-1 text-[15px] font-medium tabular-nums text-foreground">{mode === "today" ? dayLabel : label}</h2>

          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              // Navigation mountet die View neu -> Items/Termine cascaden von selbst.
              // F08: Logo-Nudge entkoppelt -- Navigation loest keinen Tilt mehr aus.
              setAnchor((a) => addDays(a, mode === "today" ? -1 : -7));
            }}
            aria-label={mode === "today" ? "Voriger Tag" : "Vorige Woche"}
          >
            <ChevronLeft />
          </Button>

          {mode === "week" ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                setMode("today");
                setAnchor(localISO(new Date()));
                localStorage.setItem("atlas:calMode", "today");
                // O5: bewusster "Heute"-Sprung -> Logo dreht voll durch als Feedback.
                window.dispatchEvent(new CustomEvent("atlas:focus-today"));
              }}
            >
              Heute
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                setMode("week");
                localStorage.setItem("atlas:calMode", "week");
                // F08: kein Logo-Nudge mehr beim Woche-Wechsel.
              }}
            >
              Woche
            </Button>
          )}

          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              // Navigation mountet die View neu -> Items/Termine cascaden von selbst.
              // F08: Logo-Nudge entkoppelt -- Navigation loest keinen Tilt mehr aus.
              setAnchor((a) => addDays(a, mode === "today" ? 1 : 7));
            }}
            aria-label={mode === "today" ? "Nächster Tag" : "Nächste Woche"}
          >
            <ChevronRight />
          </Button>

          {/* Auto-Planer -- nur in der Wochenansicht (braucht die freien Luecken) */}
          {mode === "week" && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openPlan} aria-label="Woche automatisch planen">
              <Sparkles className="size-4" />
              Planen
            </Button>
          )}

          {/* Trenner -> "Neuer Termin" rechts abgesetzt */}
          <span className="mx-1 h-6 w-px bg-border" />

          <Button variant="outline" size="icon" onClick={openCreate} aria-label="Neuer Termin">
            <CalendarPlus />
          </Button>
        </div>
      </div>
      </StaggerItem>

      {/* Wochenziele -- eigene Section, staggert separat rein */}
      {data && data.flexibleGoals.length > 0 && (
        <StaggerItem className="shrink-0 px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap gap-2">
          {data.flexibleGoals.map((g) => (
            <span
              key={g.routineId}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground"
            >
              <span className="size-1.5 rounded-full bg-amber-500" />
              {g.title}
              <span className="font-mono tabular-nums text-foreground">
                {g.done}/{g.targetPerWeek}
              </span>
            </span>
          ))}
        </div>
        </StaggerItem>
      )}

      {/* Kalender -- scrollender Bereich, fuellt Resthoehe */}
      <StaggerItem className="min-h-0 flex-1 overflow-hidden px-6 pb-6 lg:px-8">
      {/* Woche <-> Heute: beim Umschalten blurrt die neue View per keyed Remount
          rein -- laeuft zuverlaessig bei JEDEM Klick durch (kein AnimatePresence-
          Haenger durch den Minuten-Tick). Erster Mount aus (firstView) -> da
          traegt der Section-Auftritt der StaggerItem. */}
      <motion.div
        // key wechselt bei Mode-Switch UND bei Tages-Navigation -> die View mountet
        // frisch. Der Wrapper macht nur einen ruhigen Opacity-Fade (Blur auf so
        // grossen Flaechen glitcht/repaintet unzuverlaessig). Der "mit blur,
        // nacheinander"-Effekt liegt auf den KLEINEN Elementen drin: Heute-Agenda
        // cascadet Item fuer Item, Woche cascadet die einzelnen Termine.
        key={mode === "today" ? `today-${anchor}` : "week"}
        initial={firstView.current ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22, ease: EASE }}
        className={mode === "today" ? "h-full overflow-y-auto pt-1" : "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"}
      >
        {mode === "today" ? (
          loading && !data ? (
            <div className="py-24 text-center text-sm text-muted-foreground">Lade …</div>
          ) : (
            <TodayView day={focusDay} goals={data?.flexibleGoals ?? []} todos={dayTodos} nowMin={anchor === todayISO ? (now?.min ?? 0) : -1} dayPast={anchor < todayISO} stagger onEdit={openEdit} onToggleTodo={toggleTodo} />
          )
        ) : loading && !data ? (
          <div className="py-24 text-center text-sm text-muted-foreground">Lade Woche …</div>
        ) : !data ? (
          <div className="py-24 text-center text-sm text-muted-foreground">Keine Daten.</div>
        ) : (
          // C2: Wochenwechsel blendet das ganze Grid ruhig durch (key=data.start),
          // die Einzel-Items stagger nur noch beim First-Paint.
          <motion.div
            key={data.start}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="flex h-full min-h-0 flex-col"
          >
            {/* Spaltenkoepfe -- fix, scrollen NICHT mit */}
            <div className="shrink-0 grid border-b bg-card" style={{ gridTemplateColumns: `52px repeat(7, minmax(0,1fr))` }}>
              <div className="border-r" />
              {data.days.map((day) => {
                const today = now?.date === day.date;
                const weekend = day.weekday >= 5;
                return (
                  <div
                    key={day.date}
                    className="border-r px-3 pb-2 pt-1.5 last:border-r-0"
                  >
                    <div className={cn("text-[11px] font-medium uppercase tracking-wide", weekend ? "text-muted-foreground/70" : "text-muted-foreground")}>
                      {DAY_NAMES[day.weekday]}
                    </div>
                    <div className="mt-0.5 flex items-center">
                      <span
                        className={cn(
                          "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-[15px] font-semibold tabular-nums",
                          today ? "bg-primary text-primary-foreground" : weekend ? "text-muted-foreground" : "text-foreground",
                        )}
                      >
                        {dayNum(day.date)}
                      </span>
                    </div>

                    {/* Ganztags-Eintraege -- kleine klickbare Balken unter dem Datum */}
                    {(() => {
                      const ad = day.events.filter((e) => e.allDay);
                      if (ad.length === 0) return null;
                      return (
                        <div className="mt-1 flex flex-col gap-1">
                          {ad.slice(0, 2).map((ev) => {
                            const look = blockLook(ev);
                            return (
                              <button
                                key={ev.refId}
                                onClick={() => openEdit(ev)}
                                style={look.style}
                                className={cn(
                                  "truncate rounded border px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight transition-shadow hover:shadow-sm",
                                  look.className,
                                )}
                              >
                                {ev.title}
                              </button>
                            );
                          })}
                          {ad.length > 2 && <span className="px-1 text-[10px] text-muted-foreground">+{ad.length - 2} mehr</span>}
                        </div>
                      );
                    })()}

                    {/* Aufgaben des Tags -- dezente Punkte fuer alles, was NICHT als
                        eigene Spur auf der Zeitachse liegt (ohne Uhrzeit, oder Uhrzeit
                        an dem Tag belegt). */}
                    <DayTodoDots todos={(weekTodos[day.date] ?? []).filter((t) => !todoFitsTimeline(t, day.freeSlots))} />
                  </div>
                );
              })}
            </div>

            {/* Raster fittet exakt in die Hoehe -- kein Scrollen noetig. */}
            <div ref={gridScrollRef} className="min-h-0 flex-1 overflow-hidden">
            {/* Raster */}
            <div className="grid" style={{ gridTemplateColumns: `52px repeat(7, minmax(0,1fr))` }}>
              {/* Zeitachse */}
              <div className="relative border-r" style={{ height: fitScale.total }}>
                {HOURS.map((h) => (
                  <span
                    key={h}
                    className="absolute right-2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-muted-foreground"
                    style={{ top: fitScale.yOf(h * 60) }}
                  >
                    {String(h).padStart(2, "0")}
                  </span>
                ))}
              </div>

              {data.days.map((day, di) => {
                const today = now?.date === day.date;
                const weekend = day.weekday >= 5;
                const showNow = today && now && now.min >= DAY_START * 60 && now.min <= DAY_END * 60;
                return (
                  <div
                    key={day.date}
                    className={cn(
                      "relative border-r last:border-r-0",
                      today && "bg-primary/[0.035]",
                      weekend && "bg-muted/30",
                    )}
                    style={{ height: fitScale.total }}
                  >
                    {HOURS.filter((h) => h > DAY_START).map((h) => (
                      <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: fitScale.yOf(h * 60) }} />
                    ))}

                    {/* Freie Lücken -- dezent */}
                    {day.freeSlots.map((f, i) => {
                      const top = fitScale.yOf(toMin(f.startTime));
                      const height = fitScale.yOf(toMin(f.endTime)) - top;
                      if (height < 22) return null;
                      return (
                        <div
                          key={`f${i}`}
                          className="absolute inset-x-1 rounded-md bg-foreground/[0.025] dark:bg-foreground/[0.05]"
                          style={{ top, height }}
                        />
                      );
                    })}

                    {/* Entfall -- leiser Chip an der ECHTEN Startzeit der Stunde. */}
                    {(cancelledByDay[di] ?? []).map((e, i) => (
                      <div
                        key={`c${i}`}
                        className="absolute inset-x-1 z-[1] flex"
                        style={{ top: fitScale.yOf(Math.max(toMin(e.startTime), DAY_START * 60)) + 1 }}
                      >
                        <span className="flex max-w-full items-center gap-1 truncate rounded bg-muted/60 px-1 text-[11px] font-medium text-muted-foreground/80">
                          <span className="size-1 shrink-0 rounded-full bg-red-500/40" />
                          <span className="truncate">{e.title} entfällt</span>
                        </span>
                      </div>
                    ))}

                    {/* Terminierte Aufgaben -- dezente Spur auf der Zeitachse,
                        aber nur wo die Uhrzeit an dem Tag frei ist. */}
                    {(weekTodos[day.date] ?? [])
                      .filter((t) => todoFitsTimeline(t, day.freeSlots))
                      .map((t, ti) => {
                        const accent = t.color ?? "color-mix(in oklab, var(--foreground) 35%, transparent)";
                        return (
                          // Aufgaben kommen per eigenem Fetch (asynchron, nach den
                          // Terminen) -- darum die GLEICHE Einblendung wie die Events:
                          // sie gleiten beim Mounten ruhig rein statt zu poppen.
                          // Erledigen -> kurzer Punkt-Pop (siehe WeekTodoChip).
                          <WeekTodoChip
                            key={`wt${t.todoId}`}
                            title={t.title}
                            done={t.done}
                            accent={accent}
                            top={fitScale.yOf(toMin(t.scheduledTime!))}
                            delay={Math.min(di * 0.05 + ti * 0.03, 0.32)}
                            reduce={!!reduce}
                            onClick={() => toggleWeekTodo(t)}
                          />
                        );
                      })}

                    {/* Events */}
                    {packedDays[di].map((p, i) => {
                      const top = fitScale.yOf(p.s);
                      // Mindesthoehe steckt schon in der Achse -> Block endet
                      // exakt zur echten Uhrzeit; hier nur ein kleiner Sicherheitsfloor.
                      const height = Math.max(fitScale.yOf(p.e) - fitScale.yOf(p.s) - 2, 18);
                      const left = `calc(${(p.lane / p.lanes) * 100}% + 2px)`;
                      const width = `calc(${100 / p.lanes}% - 4px)`;
                      // Schulstunden: keine Uhrzeit/Dauer im Block (Position im
                      // Raster zeigt sie ohnehin) -- nur der Raum als Zusatz.
                      const meta =
                        p.ev.source === "school"
                          ? (p.ev.room ?? "")
                          : `${hm(p.ev.startTime)}${p.ev.endTime ? `–${hm(p.ev.endTime)}` : ""}`;
                      const look = blockLook(p.ev);
                      const canEdit = editable(p.ev);
                      return (
                        <motion.div
                          key={`${p.ev.source}-${p.ev.refId}-${i}`}
                          onClick={canEdit ? () => openEdit(p.ev) : undefined}
                          className={cn(
                            "absolute flex flex-col gap-[3px] overflow-hidden rounded-md border border-l-[3px] px-2 py-1",
                            look.className,
                            canEdit && "cursor-pointer transition-[box-shadow,scale] hover:shadow-sm active:scale-[0.96]",
                          )}
                          style={{ top, height, left, width, zIndex: 2 + p.lane, ...look.style }}
                          // Termine loaden einzeln rein -- erst wenn die Card-Section
                          // steht (kurzer Basis-Delay beim ersten Load), dann gestaffelt
                          // ueber Tage + Stunden. F02: kein Blur (Lesbarkeit + GPU),
                          // F05: knapperes Timing, F10: Reduced-Motion -> sofort.
                          initial={reduce ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.32,
                            delay: (firstPaint.current ? 0.12 : 0.06) + Math.min(di * 0.05 + i * 0.025, 0.3),
                            ease: EASE,
                          }}
                        >
                          <span className="truncate text-[12px] font-medium leading-tight">
                            {p.ev.title}
                          </span>
                          {height > 30 && meta && (
                            <span className="truncate font-mono text-[10px] tabular-nums text-muted-foreground">{meta}</span>
                          )}
                          {p.ev.status === "substituted" && (
                            <span className="mt-0.5 inline-flex w-fit rounded bg-amber-500/15 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                              Vertretung
                            </span>
                          )}
                        </motion.div>
                      );
                    })}

                    {/* Jetzt-Linie -- O3: zeichnet sich beim Erscheinen einmal von
                        links ein und gleitet danach sanft mit der Zeit (statt
                        instant zu springen). */}
                    {showNow && (
                      <div
                        className="absolute inset-x-0 z-10 transition-[top] duration-700 ease-out"
                        style={{ top: fitScale.yOf(now!.min) }}
                      >
                        <motion.div
                          className="h-px origin-left bg-red-500"
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.5, ease: EASE }}
                        />
                        <motion.span
                          className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-red-500"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.3, delay: 0.15, ease: EASE }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </motion.div>
        )}
      </motion.div>
      </StaggerItem>
      </Stagger>

      <EventSheet
        open={sheetOpen}
        editing={editing}
        defaultDate={anchor}
        onClose={() => setSheetOpen(false)}
        onSaved={reload}
      />

      <AutoplanSheet
        open={planOpen}
        suggestions={suggestions}
        acceptedIds={acceptedIds}
        onAccept={acceptOne}
        onAcceptAll={acceptAll}
        onClose={closePlan}
      />
    </main>
  );
}
