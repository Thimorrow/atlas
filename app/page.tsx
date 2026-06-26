"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// --- Typen (Form der /api/calendar-Antwort) ---------------------------------

type Ev = {
  source: "school" | "routine" | "manual";
  refId: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
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
const DAY_END = 22;
const HOUR_H = 56;
const TOTAL_H = (DAY_END - DAY_START) * HOUR_H;
const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);

const SRC: Record<Ev["source"], string> = {
  school: "border-l-blue-500 bg-blue-50 dark:bg-blue-500/15",
  routine: "border-l-amber-500 bg-amber-50 dark:bg-amber-500/15",
  manual: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-500/15",
};

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
  | { kind: "free"; s: number; e: number; free: Free };

function TodayView({ day, goals, nowMin }: { day: Day | undefined; goals: Goal[]; nowMin: number }) {
  if (!day) {
    return <div className="py-24 text-center text-sm text-muted-foreground">Keine Daten.</div>;
  }

  const isToday = nowMin >= 0;

  const evs = mergeSchool(day.events)
    .filter((e) => e.startTime)
    .map((ev) => ({ ev, s: toMin(ev.startTime), e: ev.endTime ? toMin(ev.endTime) : toMin(ev.startTime) + 45 }))
    .sort((a, b) => a.s - b.s);

  const upcoming = evs.filter((x) => x.e > nowMin && x.ev.status !== "cancelled");
  const next = upcoming[0];
  const ongoing = isToday && next ? next.s <= nowMin : false;
  const nextKey = next ? `${next.ev.source}-${next.ev.refId}-${next.s}` : null;
  const openGoals = goals.filter((g) => g.done < g.targetPerWeek);

  // Events + freie Lücken zu EINER chronologischen Agenda verweben.
  const agenda: AgendaItem[] = [
    ...evs.map((x): AgendaItem => ({ kind: "ev", s: x.s, e: x.e, ev: x.ev })),
    ...day.freeSlots
      .filter((f) => f.minutes >= 30)
      .map((f): AgendaItem => ({ kind: "free", s: toMin(f.startTime), e: toMin(f.endTime), free: f })),
  ].sort((a, b) => a.s - b.s || a.e - b.e);

  // Status-Kopfzeile
  let kicker: ReactNode;
  if (next && ongoing) {
    kicker = (
      <span className="inline-flex items-center gap-1.5 text-red-500">
        <span className="size-1.5 animate-pulse rounded-full bg-red-500" /> Jetzt · {next.ev.title}
      </span>
    );
  } else if (next && isToday) {
    kicker = (
      <span className="text-foreground">
        Als Nächstes · <span className="font-semibold">{next.ev.title}</span>
        <span className="text-muted-foreground"> · {relLabel(next.s - nowMin)}</span>
      </span>
    );
  } else if (next) {
    kicker = (
      <span className="text-foreground">
        Erster Termin · <span className="font-semibold">{next.ev.title}</span>
        <span className="text-muted-foreground"> · {hm(next.ev.startTime)}</span>
      </span>
    );
  } else {
    kicker = <span className="text-muted-foreground">{isToday ? "Heute stehen keine Termine mehr an." : "Keine Termine an diesem Tag."}</span>;
  }

  return (
    <div className="mx-auto w-full max-w-xl pb-10">
      {/* Status-Kopf */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="mb-5 flex items-center justify-between gap-3 text-[15px] font-medium"
      >
        <div>{kicker}</div>
        {next && ongoing && <span className="shrink-0 font-mono text-[13px] tabular-nums text-red-500">noch {durLabel(next.e - nowMin)}</span>}
      </motion.div>

      {/* Tages-Agenda: Stunden + freie Lücken verwoben */}
      {agenda.length > 0 ? (
        <ul className="space-y-1.5">
          {agenda.map((it, i) => {
            const past = isToday && it.e <= nowMin;
            const delay = Math.min(0.05 + i * 0.025, 0.4);

            if (it.kind === "free") {
              return (
                <motion.li
                  key={`free-${it.s}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: past ? 0.4 : 1, y: 0 }}
                  transition={{ duration: 0.2, delay }}
                  className="grid grid-cols-[52px_1fr] items-center gap-3"
                >
                  <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">{hm(it.free.startTime)}</span>
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-1.5 text-[12px] text-muted-foreground">
                    <span>Frei</span>
                    <span className="font-mono tabular-nums">{durLabel(it.free.minutes)}</span>
                    <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground/70">
                      {hm(it.free.startTime)}–{hm(it.free.endTime)}
                    </span>
                  </div>
                </motion.li>
              );
            }

            const cancelled = it.ev.status === "cancelled";
            const isNext = `${it.ev.source}-${it.ev.refId}-${it.s}` === nextKey;
            const meta = eventMeta(it.ev);
            return (
              <motion.li
                key={`${it.ev.source}-${it.ev.refId}-${it.s}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: past ? 0.45 : 1, y: 0 }}
                transition={{ duration: 0.2, delay }}
                className="grid grid-cols-[52px_1fr] items-stretch gap-3"
              >
                <span className="pt-2 text-right font-mono text-[12px] tabular-nums text-muted-foreground">{hm(it.ev.startTime)}</span>
                <div
                  className={cn(
                    "rounded-lg border border-l-[3px] px-3 py-2",
                    cancelled ? "border-l-muted-foreground/40 bg-muted/40" : SRC[it.ev.source],
                    isNext && "ring-2 ring-primary/30",
                  )}
                >
                  <div className="flex items-baseline gap-2">
                    <span className={cn("flex-1 truncate text-[14px] font-semibold leading-tight", cancelled && "text-muted-foreground/80 line-through decoration-muted-foreground/50")}>
                      {it.ev.title}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {hm(it.ev.startTime)}{it.ev.endTime ? `–${hm(it.ev.endTime)}` : ""}
                    </span>
                  </div>
                  {(meta || cancelled || it.ev.status === "substituted") && (
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                      {it.ev.source === "school" && meta && <span>{meta}</span>}
                      {cancelled && (
                        <span className="inline-flex items-center gap-1 font-medium">
                          <span className="size-1.5 rounded-full bg-muted-foreground/50" /> Entfall
                        </span>
                      )}
                      {it.ev.status === "substituted" && (
                        <span className="inline-flex rounded bg-amber-500/15 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                          Vertretung
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          {isToday ? "Heute keine Termine." : "Keine Termine an diesem Tag."}
        </div>
      )}

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
  const [anchor, setAnchor] = useState(() => localISO(new Date()));
  const [mode, setMode] = useState<"week" | "today">("week");
  const [data, setData] = useState<RangeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<{ date: string; min: number } | null>(null);

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
  }, [anchor]);

  const label = data ? formatRange(data.start, data.end) : "";
  const todayISO = now?.date ?? localISO(new Date());
  const focusDay = data?.days.find((d) => d.date === anchor);
  const dayLabel = focusDay
    ? `${WEEKDAYS_LONG[focusDay.weekday]}, ${dayNum(anchor)}. ${MONTHS[monthOf(anchor)]}${anchor === todayISO ? " · Heute" : ""}`
    : "";
  const packedDays = useMemo(() => (data ? data.days.map((d) => packDay(mergeSchool(d.events))) : []), [data]);

  return (
    <main className="flex h-full min-h-0 flex-col">
      {/* Fixer Kopf: Modulname + Wochen-Navigation + Wochenziele */}
      <div className="shrink-0 px-6 pt-6 lg:px-8">
      {/* Content-Kopf: Modulname + Wochen-Navigation */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Kalender</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "today" ? "Dein heutiger Tag auf einen Blick." : "Schule, Routinen und Termine in einer Woche."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <h2 className="mr-1 text-[15px] font-medium tabular-nums text-foreground">{mode === "today" ? dayLabel : label}</h2>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setAnchor((a) => addDays(a, mode === "today" ? -1 : -7))}
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
              }}
            >
              Woche
            </Button>
          )}

          <Button
            variant="outline"
            size="icon"
            onClick={() => setAnchor((a) => addDays(a, mode === "today" ? 1 : 7))}
            aria-label={mode === "today" ? "Nächster Tag" : "Nächste Woche"}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {/* Wochenziele */}
      {data && data.flexibleGoals.length > 0 && (
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
      )}
      </div>

      {/* Kalender -- scrollender Bereich, fuellt Resthoehe */}
      <div className="min-h-0 flex-1 overflow-hidden px-6 pb-6 lg:px-8">
      {mode === "today" ? (
        <div className="h-full overflow-y-auto pt-1">
          {loading && !data ? (
            <div className="py-24 text-center text-sm text-muted-foreground">Lade …</div>
          ) : (
            <TodayView day={focusDay} goals={data?.flexibleGoals ?? []} nowMin={anchor === todayISO ? (now?.min ?? 0) : -1} />
          )}
        </div>
      ) : (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
        {loading && !data ? (
          <div className="py-24 text-center text-sm text-muted-foreground">Lade Woche …</div>
        ) : !data ? (
          <div className="py-24 text-center text-sm text-muted-foreground">Keine Daten.</div>
        ) : (
          <Fragment key={data.start}>
            {/* Spaltenkoepfe -- fix, scrollen NICHT mit */}
            <div className="shrink-0 grid border-b bg-card" style={{ gridTemplateColumns: `52px repeat(7, minmax(0,1fr))` }}>
              <div className="border-r" />
              {data.days.map((day, i) => {
                const today = now?.date === day.date;
                const weekend = day.weekday >= 5;
                return (
                  <motion.div
                    key={day.date}
                    className="border-r px-3 py-2 last:border-r-0"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: 0.025 * i }}
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
                  </motion.div>
                );
              })}
            </div>

            {/* Scrollbereich -- nur das Stunden-Raster scrollt */}
            <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Raster */}
            <div className="grid" style={{ gridTemplateColumns: `52px repeat(7, minmax(0,1fr))` }}>
              {/* Zeitachse */}
              <div className="relative border-r" style={{ height: TOTAL_H }}>
                {HOURS.map((h) => (
                  <span
                    key={h}
                    className="absolute right-2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-muted-foreground"
                    style={{ top: h === DAY_START ? 6 : (h - DAY_START) * HOUR_H }}
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
                    style={{ height: TOTAL_H }}
                  >
                    {HOURS.filter((h) => h > DAY_START).map((h) => (
                      <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: (h - DAY_START) * HOUR_H }} />
                    ))}

                    {/* Freie Lücken -- dezent */}
                    {day.freeSlots.map((f, i) => {
                      const top = ((toMin(f.startTime) - DAY_START * 60) / 60) * HOUR_H;
                      const height = (f.minutes / 60) * HOUR_H;
                      if (height < 22) return null;
                      return (
                        <div
                          key={`f${i}`}
                          className="absolute inset-x-1 rounded-md bg-foreground/[0.025] dark:bg-foreground/[0.05]"
                          style={{ top, height }}
                        />
                      );
                    })}

                    {/* Events */}
                    {packedDays[di].map((p, i) => {
                      const top = ((p.s - DAY_START * 60) / 60) * HOUR_H;
                      const height = Math.max(((p.e - p.s) / 60) * HOUR_H - 2, 20);
                      const left = `calc(${(p.lane / p.lanes) * 100}% + 2px)`;
                      const width = `calc(${100 / p.lanes}% - 4px)`;
                      const cancelled = p.ev.status === "cancelled";
                      // Schulstunden: keine Uhrzeit/Dauer im Block (Position im
                      // Raster zeigt sie ohnehin) -- nur der Raum als Zusatz.
                      const meta =
                        p.ev.source === "school"
                          ? (p.ev.room ?? "")
                          : `${hm(p.ev.startTime)}${p.ev.endTime ? `–${hm(p.ev.endTime)}` : ""}`;
                      return (
                        <motion.div
                          key={`${p.ev.source}-${p.ev.refId}-${i}`}
                          className={cn(
                            "absolute flex flex-col gap-0.5 overflow-hidden rounded-md border border-l-[3px] px-2 py-1",
                            cancelled ? "border-border/70 border-l-muted-foreground/40 bg-muted/50" : SRC[p.ev.source],
                          )}
                          style={{ top, height, left, width, zIndex: 2 + p.lane }}
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: Math.min(0.12 + i * 0.01 + di * 0.012, 0.4) }}
                        >
                          <span className={cn("truncate text-[12.5px] font-medium leading-tight", cancelled && "text-muted-foreground/80 line-through decoration-muted-foreground/50")}>
                            {p.ev.title}
                          </span>
                          {height > 30 && meta && !cancelled && (
                            <span className="truncate font-mono text-[10.5px] tabular-nums text-muted-foreground">{meta}</span>
                          )}
                          {cancelled && (
                            <span className="mt-0.5 inline-flex w-fit items-center gap-1 text-[10px] font-medium text-muted-foreground">
                              <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                              Entfall
                            </span>
                          )}
                          {p.ev.status === "substituted" && (
                            <span className="mt-0.5 inline-flex w-fit rounded bg-amber-500/15 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                              Vertretung
                            </span>
                          )}
                        </motion.div>
                      );
                    })}

                    {/* Jetzt-Linie */}
                    {showNow && (
                      <div className="absolute inset-x-0 z-10 h-px bg-red-500" style={{ top: ((now!.min - DAY_START * 60) / 60) * HOUR_H }}>
                        <span className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-red-500" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </Fragment>
        )}
      </div>
      )}
      </div>
    </main>
  );
}
