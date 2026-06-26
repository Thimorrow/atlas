"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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

// --- Komponente -------------------------------------------------------------

export default function Home() {
  const [anchor, setAnchor] = useState(() => localISO(new Date()));
  const [data, setData] = useState<RangeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<{ date: string; min: number } | null>(null);

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
  const packedDays = useMemo(() => (data ? data.days.map((d) => packDay(d.events)) : []), [data]);

  return (
    <main className="px-6 py-6 lg:px-8">
      {/* Content-Kopf: Modulname + Wochen-Navigation */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Kalender</h1>
          <p className="text-sm text-muted-foreground">Schule, Routinen und Termine in einer Woche.</p>
        </div>

        <div className="flex items-center gap-2">
          <h2 className="mr-1 text-[15px] font-medium tabular-nums text-foreground">{label}</h2>
          <Button variant="outline" size="icon" onClick={() => setAnchor((a) => addDays(a, -7))} aria-label="Vorige Woche">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setAnchor(localISO(new Date()))}>
            Heute
          </Button>
          <Button variant="outline" size="icon" onClick={() => setAnchor((a) => addDays(a, 7))} aria-label="Naechste Woche">
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

      {/* Kalender */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {loading && !data ? (
          <div className="py-24 text-center text-sm text-muted-foreground">Lade Woche …</div>
        ) : !data ? (
          <div className="py-24 text-center text-sm text-muted-foreground">Keine Daten.</div>
        ) : (
          <Fragment key={data.start}>
            {/* Spaltenkoepfe */}
            <div className="grid border-b" style={{ gridTemplateColumns: `52px repeat(7, minmax(0,1fr))` }}>
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

                    {/* Freie Luecken -- dezent */}
                    {day.freeSlots.map((f, i) => {
                      const top = ((toMin(f.startTime) - DAY_START * 60) / 60) * HOUR_H;
                      const height = (f.minutes / 60) * HOUR_H;
                      if (height < 22) return null;
                      return (
                        <div
                          key={`f${i}`}
                          className="absolute inset-x-1 flex items-end justify-end rounded-md bg-foreground/[0.025] p-1 dark:bg-foreground/[0.05]"
                          style={{ top, height }}
                        >
                          {height > 40 && <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">{f.minutes}m</span>}
                        </div>
                      );
                    })}

                    {/* Events */}
                    {packedDays[di].map((p, i) => {
                      const top = ((p.s - DAY_START * 60) / 60) * HOUR_H;
                      const height = Math.max(((p.e - p.s) / 60) * HOUR_H - 2, 20);
                      const left = `calc(${(p.lane / p.lanes) * 100}% + 2px)`;
                      const width = `calc(${100 / p.lanes}% - 4px)`;
                      const cancelled = p.ev.status === "cancelled";
                      const meta =
                        p.ev.source === "school"
                          ? [hm(p.ev.startTime), p.ev.room].filter(Boolean).join(" · ")
                          : `${hm(p.ev.startTime)}${p.ev.endTime ? `–${hm(p.ev.endTime)}` : ""}`;
                      return (
                        <motion.div
                          key={`${p.ev.source}-${p.ev.refId}-${i}`}
                          className={cn(
                            "absolute flex flex-col gap-0.5 overflow-hidden rounded-md border border-l-[3px] px-2 py-1",
                            cancelled ? "border-dashed border-l-border bg-transparent opacity-60" : SRC[p.ev.source],
                          )}
                          style={{ top, height, left, width, zIndex: 2 + p.lane }}
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: Math.min(0.12 + i * 0.01 + di * 0.012, 0.4) }}
                        >
                          <span className={cn("truncate text-[12.5px] font-medium leading-tight", cancelled && "text-muted-foreground line-through")}>
                            {p.ev.title}
                          </span>
                          {height > 30 && (
                            <span className="truncate font-mono text-[10.5px] tabular-nums text-muted-foreground">{meta}</span>
                          )}
                          {cancelled && (
                            <span className="mt-0.5 inline-flex w-fit rounded bg-muted px-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
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
          </Fragment>
        )}
      </div>
    </main>
  );
}
