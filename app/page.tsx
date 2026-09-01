"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stagger, StaggerItem, SplitText } from "@/components/stagger";
import { decideSync } from "@/lib/untis/sync-policy";
import { cn } from "@/lib/utils";
import { readLocal, writeLocal } from "@/lib/safe-storage";

// --- Typen (Form der /api/calendar-Antwort) ---------------------------------

type Ev = {
  source: "school";
  refId: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  status?: "regular" | "cancelled" | "substituted";
  room?: string | null;
  teacher?: string | null;
};
type Day = { date: string; weekday: number; events: Ev[] };
type RangeData = { start: string; end: string; days: Day[] };

// --- Konstanten -------------------------------------------------------------

const HOUR_H = 56;
// Kurze Schulstunden nie zur flachen Pille quetschen -- jeder Block ist
// mindestens so hoch, dass Titel + Uhrzeit als Karte lesbar sind.
const MIN_EVENT_H = 44;
const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
// Fallback-Zeitachse, wenn die Woche keine school_blocks hat (z.B. Ferien).
const FALLBACK_DAY_START = 7;
const FALLBACK_DAY_END = 15;

// Atlas-Signaturkurve (= --ease-atlas), als Array fuer Framer.
const EASE = [0.22, 1, 0.36, 1] as const;

// --- Block-Stile ------------------------------------------------------------
// Fächer-Blöcke: Zurückhaltung (Design-Audit) -- vorher trugen sie gleichzeitig
// einen 6px-Farbrand links, eine getönte Füllung, einen inneren Ring UND einen
// Hover-Ring. Vier Signale für dieselbe Aussage ("das ist eine Schulstunde").
// Jetzt nur noch zwei im Ruhezustand: getönte Füllung + ein leiser, farblich
// passender Rand. Der Ring bleibt allein dem Hover vorbehalten -- er markiert
// dann wirklich einen Zustandswechsel statt nur mitzulaufen.
const BLOCK_CLS = "border border-blue-500/20 bg-blue-100/80 dark:border-blue-400/20 dark:bg-blue-500/20";

// Entfallene Schulstunden werden nicht als eigener Block gezeigt, sondern als
// leiser Chip an der ECHTEN Startzeit der Stunde -- statt Doppelung "Frei" +
// "Entfall"-Block.
// Leiser Entfall-Chip fuer die Heute-Liste.
function CancelChip({ title }: { title: string }) {
  return (
    // A2 (Kontrast): /90 auf bg-muted/40 lag im Hellmodus bei ~3.8:1 -- unter
    // der AA-Mindestgrenze fuer kleinen Text. Volle muted-foreground erreicht 4.6:1.
    // Design-Audit: 10px auf 11px angehoben -- der Grid-Entfall-Chip (engerer
    // Platz als hier in der Heute-Liste) lag bereits bei 11px, kleiner-bei-mehr-
    // Platz war die falsche Richtung.
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-1.5 py-px text-[11px] font-medium text-muted-foreground">
      <span className="size-1 rounded-full bg-red-500/45" />
      {title} entfällt
    </span>
  );
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

type Packed = { ev: Ev; s: number; e: number; lane: number; lanes: number };

// Untis liefert Schulstunden teils als getrennte Perioden (z.B. 2x 45min mit
// kurzer Pause). Aufeinanderfolgende Stunden desselben Fachs (gleicher Status,
// Lücke <= 25min) zu EINEM Block zusammenfassen -> "eine Stunde statt zwei".
const GAP_MERGE_MIN = 25;

function mergeSchool(events: Ev[]): Ev[] {
  const school = [...events].sort((a, b) => a.startTime.localeCompare(b.startTime));

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
  return merged;
}

function packDay(events: Ev[], dayStart: number, dayEnd: number): Packed[] {
  const items: Packed[] = events
    .map((ev) => {
      const s = Math.max(toMin(ev.startTime), dayStart * 60);
      const raw = ev.endTime ? toMin(ev.endTime) : dayEnd * 60;
      const e = Math.min(Math.max(raw, s + 5), dayEnd * 60);
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
function buildSegments(packedDays: Packed[][], days: Day[], dayStart: number, dayEnd: number): Seg[] {
  const DS = dayStart * 60;
  const DE = dayEnd * 60;
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
  return [ev.room, ev.teacher].filter(Boolean).join(" · ");
}

// Ruhige Fehlermeldung bei fehlgeschlagenem Fetch -- klar unterscheidbar vom
// leeren Zustand ("Keine Stunden an diesem Tag").
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center text-sm text-muted-foreground">
      <p>Der Stundenplan konnte nicht geladen werden.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Erneut versuchen
      </Button>
    </div>
  );
}

// Polish: "Lade Woche …" stand vorher als nackter Text mittig im leeren
// Bereich -- ein Skelett, das die Form des Rasters (Spaltenkoepfe + Bloecke je
// Werktag) vorwegnimmt, wirkt ruhiger als ein Textsprung. animate-pulse ist
// eine reine CSS-Animation und faellt damit automatisch unter das globale
// prefers-reduced-motion-Gate in globals.css.
function WeekSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-hidden="true">
      <div className="shrink-0 grid border-b bg-card" style={{ gridTemplateColumns: "52px repeat(5, minmax(0,1fr))" }}>
        <div className="border-r" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="border-r px-3 pb-2 pt-1.5 last:border-r-0">
            <div className="h-2.5 w-6 animate-pulse rounded bg-muted" />
            <div className="mt-1.5 h-7 w-7 animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full gap-x-0" style={{ gridTemplateColumns: "52px repeat(5, minmax(0,1fr))" }}>
          <div />
          {[
            [10, 20, 45],
            [16, 30],
            [8, 20, 24],
            [24, 30],
            [12, 20, 16],
          ].map((blocks, col) => (
            <div key={col} className="flex flex-col gap-2 px-1.5 pt-3">
              {blocks.map((h, i) => (
                <div key={i} className="animate-pulse rounded-md bg-muted" style={{ height: h, opacity: 0.5 - i * 0.08 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Heute-Ansicht ----------------------------------------------------------

type AgendaItem =
  | { kind: "ev"; s: number; e: number; ev: Ev }
  | { kind: "cancel"; s: number; e: number; ev: Ev };

function TodayView({ day, nowMin, dayPast, stagger }: { day: Day | undefined; nowMin: number; dayPast: boolean; stagger: boolean }) {
  // F10: Reduced-Motion explizit gaten -- sonst laufen opacity + filter:blur
  // trotz globalem reducedMotion="user" weiter. Hook vor jedem Early-Return.
  const reduce = useReducedMotion();
  const animate = stagger && !reduce;
  if (!day) {
    return <div className="py-24 text-center text-sm text-muted-foreground">Keine Daten.</div>;
  }

  const isToday = nowMin >= 0;

  const onTimeline = mergeSchool(day.events).filter((e) => e.startTime);
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

  // Events zu einer chronologischen Agenda.
  const agenda: AgendaItem[] = [
    ...evs.map((x): AgendaItem => ({ kind: "ev", s: x.s, e: x.e, ev: x.ev })),
    ...cancelledEvs.map((ev): AgendaItem => ({
      kind: "cancel",
      s: toMin(ev.startTime),
      e: ev.endTime ? toMin(ev.endTime) : toMin(ev.startTime) + 45,
      ev,
    })),
  ].sort((a, b) => a.s - b.s || a.e - b.e);

  // Status-Kopfzeile
  let kicker: ReactNode;
  if (next && ongoing) {
    kicker = (
      // A2 (Kontrast): reines red-500 liegt auf hellem Grund bei ~3.8:1 -- unter
      // AA fuer 15px-Text. red-600/red-400 (wie beim Vertretung-Tag) tragen in
      // beiden Themes.
      <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
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
        Erste Stunde · <span className="font-semibold">{next.ev.title}</span>
        <span className="font-mono tabular-nums text-muted-foreground"> · {hm(next.ev.startTime)}</span>
      </span>
    );
  } else {
    kicker = <span className="text-muted-foreground">{isToday ? "Heute steht nichts mehr an." : "An diesem Tag stehen keine Stunden an."}</span>;
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
        {next && ongoing && <span className="shrink-0 font-mono text-[13px] tabular-nums text-red-600 dark:text-red-400">noch {durLabel(next.e - nowMin)}</span>}
      </motion.div>

      {/* Tages-Agenda: Stunden + freie Lücken verwoben */}
      {agenda.length > 0 ? (
        <ul className="space-y-1.5">
          {agenda.map((it, i) => {
            // Vergangener Tag (gestern & frueher) -> alles geblasst; heute nur
            // das, was zeitlich schon vorbei ist; Zukunft -> nichts.
            const past = dayPast || (isToday && it.e <= nowMin);
            // Agenda cascadet beim Mount Item fuer Item klar nacheinander rein
            // (groesserer Schritt + Basis-Delay -> spuerbar, nicht "alles auf einmal").
            // Polish: Deckel lag bei 0.8s -- bei einem vollen Schultag fuehlte sich
            // das letzte Item wie Warten an statt wie Kaskade. 0.35s haelt die
            // Bewegung sichtbar, ohne zu ziehen.
            const delay = stagger ? 0.06 + Math.min(i * 0.04, 0.35) : 0;

            if (it.kind === "cancel") {
              return (
                <motion.li
                  key={`cancel-${it.ev.source}-${it.ev.refId}-${it.s}`}
                  initial={animate ? { opacity: 0, y: 8, filter: "blur(5px)" } : false}
                  animate={{ opacity: past ? 0.4 : 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.42, delay, ease: EASE }}
                  className="grid grid-cols-[52px_1fr] items-center gap-3"
                >
                  {/* A2 (Kontrast): /70 faellt auf der Karte unter 4.5:1 -- volle
                      muted-foreground traegt in beiden Themes. */}
                  <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">{hm(it.ev.startTime)}</span>
                  <div className="flex items-center">
                    <CancelChip title={it.ev.title} />
                  </div>
                </motion.li>
              );
            }

            const isNext = `${it.ev.source}-${it.ev.refId}-${it.s}` === nextKey;
            const meta = eventMeta(it.ev);
            return (
              <motion.li
                key={`${it.ev.source}-${it.ev.refId}-${it.s}`}
                // A3 (Reduced-Motion): nutzte bislang nur `stagger`, nicht das lokal
                // gegatete `animate` -- unter Reduced-Motion lief opacity+blur trotzdem.
                initial={animate ? { opacity: 0, y: 8, filter: "blur(5px)" } : false}
                animate={{ opacity: past ? 0.45 : 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.42, delay, ease: EASE }}
                className="grid grid-cols-[52px_1fr] items-stretch gap-3"
              >
                {/* A2 (Kontrast): /70 faellt auf der Karte unter 4.5:1. */}
                <span className="pt-2 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{hm(it.ev.startTime)}</span>
                <div
                  // Polish: gleiche Tooltip/Kopier-Logik wie im Wochenraster -- der
                  // Fachname kann hier zwar seltener abgeschnitten sein (Karte ist
                  // breiter), title schadet aber nicht und Raum/Lehrer sollen
                  // kopierbar bleiben.
                  title={`${it.ev.title}${meta ? `, ${meta}` : ""}`}
                  className={cn(
                    "relative select-text overflow-hidden rounded-lg px-3 py-2 transition-[background-color,box-shadow] duration-150 ease-out",
                    BLOCK_CLS,
                    isNext ? "ring-2 ring-primary/30" : "hover:ring-2 hover:ring-inset hover:ring-black/[0.1] dark:hover:ring-white/[0.14]",
                  )}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="flex-1 truncate text-[14px] font-semibold leading-tight">
                      {it.ev.title}
                    </span>
                    {it.ev.endTime && (
                      // A2 (Kontrast): volle muted-foreground liegt auf der
                      // Fach-Block-Fuellung (blau) nur bei ~4:1 -- knapp unter AA.
                      // foreground/70 traegt in beiden Themes deutlich (6:1+).
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/70">
                        {durLabel(it.e - it.s)}
                      </span>
                    )}
                  </div>
                  {(meta || it.ev.status === "substituted") && (
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-foreground/70">
                      {it.ev.source === "school" && meta && <span>{meta}</span>}
                      {it.ev.status === "substituted" && (
                        <motion.span
                          initial={animate ? { opacity: 0, scale: 0.9, filter: "blur(2px)" } : false}
                          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                          transition={{ duration: 0.25, delay: delay + 0.1, ease: EASE }}
                          // A2 (Kontrast): amber-600 auf amber/15+Block-Blau lag im
                          // Hellmodus bei ~2.5:1 -- praktisch unlesbar. amber-800 +
                          // etwas kraeftigerer Fuellung traegt (~5:1); Dark blieb schon gut.
                          className="inline-flex rounded bg-amber-500/20 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400"
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
          // A3 (Reduced-Motion): nutzte nur `stagger`, nicht `animate` -- lief
          // unter Reduced-Motion trotzdem mit opacity+y an.
          initial={animate ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground"
        >
          <CalendarCheck className="size-6 text-muted-foreground/50" />
          {isToday ? "Heute keine Stunden. Genieß den freien Tag!" : "An diesem Tag stehen keine Stunden an."}
        </motion.div>
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
  const [error, setError] = useState(false);
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
  // Bleibt einmal true, sobald die erste echte Messung da ist -- verhindert den
  // sichtbaren Sprung beim ersten Paint (Fallback-Hoehe -> gemessene Hoehe).
  const [viewMeasured, setViewMeasured] = useState(false);

  // Reload-Trigger + Untis-Sync.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const urlView = p.get("view");
    // URL-Parameter hat Vorrang, sonst gemerkten Modus aus localStorage nehmen.
    if (urlView === "today" || (!urlView && readLocal("atlas:calMode") === "today")) {
      setMode("today");
      if (urlView === "today") writeLocal("atlas:calMode", "today");
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
      const v = Number(readLocal(KEY));
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
          writeLocal(KEY, String(Date.now()));
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
    setError(false);
    fetch(`/api/calendar?view=week&date=${anchor}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: RangeData) => alive && (setData(d), setLoading(false)))
      .catch(() => alive && (setError(true), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [anchor, reloadKey]);

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
  // Zeitachse begrenzt auf den tatsaechlichen Schulbereich der Woche: fruehester
  // Beginn / spaetestes Ende ueber alle school_blocks. Keine Bloecke (z.B. Ferien)
  // -> Fallback-Spanne, damit das Raster nicht kollabiert.
  const dayBounds = useMemo(() => {
    if (!data) return { start: FALLBACK_DAY_START, end: FALLBACK_DAY_END };
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const day of data.days) {
      for (const ev of day.events) {
        minStart = Math.min(minStart, toMin(ev.startTime));
        maxEnd = Math.max(maxEnd, ev.endTime ? toMin(ev.endTime) : toMin(ev.startTime) + 45);
      }
    }
    if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) {
      return { start: FALLBACK_DAY_START, end: FALLBACK_DAY_END };
    }
    return { start: Math.floor(minStart / 60), end: Math.ceil(maxEnd / 60) };
  }, [data]);
  const HOURS = useMemo(
    () => Array.from({ length: dayBounds.end - dayBounds.start + 1 }, (_, i) => dayBounds.start + i),
    [dayBounds],
  );

  // Entfallene Stunden rendern nicht als Block -> raus aus dem Packen, getrennt
  // gehalten fuer die Entfall-Chips im Raster.
  const packedDays = useMemo(
    () =>
      data
        ? data.days.map((d) => packDay(mergeSchool(d.events).filter((e) => e.status !== "cancelled"), dayBounds.start, dayBounds.end))
        : [],
    [data, dayBounds],
  );
  const cancelledByDay = useMemo(
    () => (data ? data.days.map((d) => mergeSchool(d.events).filter((e) => e.status === "cancelled")) : []),
    [data],
  );
  // Werktage immer zeigen, Samstag/Sonntag nur wenn dort tatsaechlich Stunden
  // liegen. Original-Index (i) bleibt erhalten -> packedDays/cancelledByDay
  // bleiben ueber i konsistent adressierbar, auch wenn Wochenend-Spalten fehlen.
  const visibleDayIdx = useMemo(
    () => (data ? data.days.map((_, i) => i).filter((i) => data.days[i].weekday < 5 || data.days[i].events.length > 0) : []),
    [data],
  );
  // Segmente (Anker/leer) -- aus den gepackten Tagen, hoehenunabhaengig.
  const segments = useMemo(
    () => buildSegments(packedDays, data?.days ?? [], dayBounds.start, dayBounds.end),
    [packedDays, data, dayBounds],
  );

  // Scrollbereich messen (mode/data -> Raster gerade gemountet bzw. neu befuellt).
  useEffect(() => {
    const el = gridScrollRef.current;
    if (!el) return;
    const measure = () => {
      setViewH(el.clientHeight);
      setViewMeasured(true);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, data]);

  // Pixel-Verteilung: die dynamische Zeitachse (dayBounds) fuellt EXAKT die
  // sichtbare Hoehe ohne Scrollen. Oben/unten ein Polster, damit die Rand-Labels
  // voll sichtbar bleiben. Anker bekommen Gewicht nach Dauer, leere Zeit gestaucht
  // (BREAK_SCALE). Danach: jeder Anker-Abschnitt, der kuerzer als MIN_EVENT_H
  // waere, wird auf MIN_EVENT_H gehoben -- der fehlende Platz kommt aus der leeren
  // Zeit. So bleibt auch eine kurze Schulstunde eine lesbare Karte UND endet
  // exakt zur echten Uhrzeit.
  const fitScale = useMemo<TimeScale>(() => {
    const DS = dayBounds.start * 60;
    const DE = dayBounds.end * 60;
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
  }, [segments, viewH, dayBounds]);

  return (
    <main className="flex h-full min-h-0 flex-col">
      {/* Split & Stagger (Jakub Krehel): die Page-Sections kommen beim Reload
          gestaffelt mit blur + opacity + translateY rein -- Kopf, dann die
          Kalender-Card. Reduced-Motion-Gate global ueber MotionConfig. */}
      <Stagger className="flex min-h-0 flex-1 flex-col">
      {/* Kopf: Modulname + Wochen-Navigation */}
      <StaggerItem className="shrink-0 px-6 pt-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold leading-tight tracking-tight">
            <SplitText text="Stundenplan" />
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {mode === "today" ? "Dein heutiger Tag auf einen Blick." : "Deine Schulwoche auf einen Blick."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Polish: Text wechselt je nach Woche/Tag stark in der Laenge ("1.–7.
              September 2026" vs. "29. September – 5. Oktober 2026") -- ohne
              reservierte Breite ruckeln die Buttons rechts daneben beim Blaettern
              mit. min-w + text-right haelt ihre Position fest, der Text waechst
              nach links. */}
          <h2 className="mr-1 min-w-[17ch] text-right text-[15px] font-medium tabular-nums text-foreground">
            {mode === "today" ? dayLabel : label}
          </h2>

          {/* Design-Audit (Knopf-Rangfolge): alle vier Kopf-Buttons standen bislang
              gleichrangig auf variant="outline". Die Pfeile sind reine Schritt-
              Navigation (Struktur, nicht Entscheidung) und treten jetzt als ghost
              zurueck -- Heute/Woche bleibt outline und ist damit sichtbar der
              gewichtigere der drei Aktionen. */}
          <Button
            variant="ghost"
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
                writeLocal("atlas:calMode", "today");
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
                writeLocal("atlas:calMode", "week");
                // F08: kein Logo-Nudge mehr beim Woche-Wechsel.
              }}
            >
              Woche
            </Button>
          )}

          <Button
            variant="ghost"
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
        </div>
      </div>
      </StaggerItem>

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
        // A3 (Reduced-Motion): kein manuelles Gate hier -- die globale
        // <MotionConfig reducedMotion="user"> kappt nur transform, opacity blieb an.
        initial={firstView.current || reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22, ease: EASE }}
        className={mode === "today" ? "h-full overflow-y-auto pt-1" : "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"}
      >
        {mode === "today" ? (
          error && !data ? (
            <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
          ) : loading && !data ? (
            <div className="py-24 text-center text-sm text-muted-foreground">Lade …</div>
          ) : (
            <TodayView day={focusDay} nowMin={anchor === todayISO ? (now?.min ?? 0) : -1} dayPast={anchor < todayISO} stagger />
          )
        ) : error && !data ? (
          <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
        ) : loading && !data ? (
          <WeekSkeleton />
        ) : !data ? (
          <div className="py-24 text-center text-sm text-muted-foreground">Keine Daten.</div>
        ) : (
          // C2: Wochenwechsel blendet das ganze Grid ruhig durch (key=data.start),
          // die Einzel-Items stagger nur noch beim First-Paint.
          <motion.div
            key={data.start}
            // A3 (Reduced-Motion): opacity-Fade war ungegatet.
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: viewMeasured ? 1 : 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="flex h-full min-h-0 flex-col"
          >
            {/* Spaltenkoepfe -- fix, scrollen NICHT mit */}
            <div className="shrink-0 grid border-b bg-card" style={{ gridTemplateColumns: `52px repeat(${visibleDayIdx.length}, minmax(0,1fr))` }}>
              <div className="border-r" />
              {visibleDayIdx.map((di) => {
                const day = data.days[di];
                const today = now?.date === day.date;
                const weekend = day.weekday >= 5;
                return (
                  <div
                    key={day.date}
                    className="border-r px-3 pb-2 pt-1.5 last:border-r-0"
                  >
                    {/* A2 (Kontrast): /70 faellt auf der Karte unter 4.5:1 -- volle
                        muted-foreground traegt in beiden Themes. */}
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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
                        {/* A2: "heute" wurde bislang allein ueber die Fuellfarbe
                            transportiert -- fuer Screenreader per sr-only ergaenzt. */}
                        {today && <span className="sr-only"> · Heute</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Raster fittet exakt in die Hoehe -- kein Scrollen noetig. */}
            <div ref={gridScrollRef} className="min-h-0 flex-1 overflow-hidden">
            {/* Raster */}
            <div className="grid" style={{ gridTemplateColumns: `52px repeat(${visibleDayIdx.length}, minmax(0,1fr))` }}>
              {/* Zeitachse -- rein visuelle Skala, jeder Termin traegt seine Zeit
                  schon in seinem eigenen aria-label. Fuer AT ausgeblendet, damit
                  niemand durch 15+ freistehende Stundenzahlen tabben/browsen muss. */}
              <div className="relative border-r" aria-hidden="true" style={{ height: fitScale.total }}>
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

              {visibleDayIdx.map((di) => {
                const day = data.days[di];
                const today = now?.date === day.date;
                const weekend = day.weekday >= 5;
                const showNow = today && now && now.min >= dayBounds.start * 60 && now.min <= dayBounds.end * 60;
                return (
                  // A4 (Semantik): eine Tagesspalte im Wochenraster ist reiner Positions-
                  // Container ohne Rolle. role="group" + aria-label geben ihr einen
                  // Namen ("Montag, 3. Februar[, Heute]"), ohne sie in eine Grid/Table-
                  // Rolle zu zwingen, die volle Keyboard-Grid-Navigation erwarten wuerde.
                  <div
                    key={day.date}
                    role="group"
                    aria-label={`${WEEKDAYS_LONG[day.weekday]}, ${dayNum(day.date)}. ${MONTHS[monthOf(day.date)]}${today ? ", Heute" : ""}`}
                    // Polish (Stacking): isolate spannt hier eine eigene Stacking-
                    // Context auf. Die drei handgesetzten z-Werte darin (Entfall-Chip
                    // z-[1] < Termin-Bloecke 2+lane < Jetzt-Linie z-10) beschreiben nur
                    // die Reihenfolge INNERHALB einer Tagesspalte -- isolate stellt
                    // sicher, dass sie niemals mit der globalen Chrome-Ebene (Sidebar-
                    // Resize-Griff z-20, Mobile-Header z-30) verrechnet werden koennen.
                    className={cn(
                      "relative isolate border-r last:border-r-0",
                      today && "bg-primary/[0.035]",
                      weekend && "bg-muted/30",
                    )}
                    style={{ height: fitScale.total }}
                  >
                    {HOURS.filter((h) => h > dayBounds.start).map((h) => (
                      <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: fitScale.yOf(h * 60) }} />
                    ))}

                    {/* Entfall -- leiser Chip an der ECHTEN Startzeit der Stunde. */}
                    {(cancelledByDay[di] ?? []).map((e, i) => (
                      <div
                        key={`c${i}`}
                        className="absolute inset-x-1 z-[1] flex"
                        style={{ top: fitScale.yOf(Math.max(toMin(e.startTime), dayBounds.start * 60)) + 1 }}
                      >
                        {/* A2 (Kontrast): bg-muted/60 + text/80 lag bei ~3.1:1 (hell) --
                            unter AA. /50-Fuellung + volle muted-foreground traegt (4.5:1+). */}
                        <span
                          title={`${e.title} entfällt`}
                          className="flex max-w-full items-center gap-1 truncate rounded bg-muted/50 px-1 text-[11px] font-medium text-muted-foreground"
                        >
                          <span className="size-1 shrink-0 rounded-full bg-red-500/40" />
                          <span className="truncate">{e.title} entfällt</span>
                        </span>
                      </div>
                    ))}

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
                      const meta = p.ev.room ?? "";
                      // A4 (Semantik): reine divs ohne Bedeutung -- ein Screenreader
                      // liest sonst nur den sichtbaren Titel vor, ohne Zeit/Raum/Status
                      // (die stecken nur in Position/Hoehe). role="group" (nicht
                      // "button", der Block ist nicht klickbar) + ein Label, das genau
                      // das zusammenfasst, was das Auge aus Position + Text liest.
                      const blockLabel = `${p.ev.title}, ${hm(p.ev.startTime)}${p.ev.endTime ? `–${hm(p.ev.endTime)} Uhr` : " Uhr"}${p.ev.room ? `, ${p.ev.room}` : ""}${p.ev.status === "substituted" ? ", Vertretung" : ""}`;
                      return (
                        <motion.div
                          key={`${p.ev.source}-${p.ev.refId}-${i}`}
                          role="group"
                          aria-label={blockLabel}
                          // Polish: Fachnamen werden im schmalen Block abgeschnitten --
                          // title gibt Maus-Nutzern den vollen Namen als Tooltip (kostet
                          // keine Dependency, ergaenzt das schon vorhandene aria-label
                          // fuer Screenreader). select-text hebt das app-weite select-none
                          // fuer den Blockinhalt auf -- Fach/Raum sollen kopierbar bleiben.
                          // hover signalisiert, dass der Block reagiert (Tooltip), ohne
                          // eine Klickbarkeit vorzutaeuschen, die es nicht gibt.
                          title={blockLabel}
                          className={cn(
                            "absolute flex select-text flex-col gap-1 overflow-hidden rounded-md px-2 py-1 transition-[background-color,box-shadow] duration-150 ease-out hover:ring-2 hover:ring-inset hover:ring-black/[0.12] dark:hover:ring-white/[0.16]",
                            BLOCK_CLS,
                          )}
                          style={{ top, height, left, width, zIndex: 2 + p.lane }}
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
                          <span aria-hidden="true" className="truncate text-[12px] font-medium leading-tight">
                            {p.ev.title}
                          </span>
                          {height > 30 && meta && (
                            // A2 (Kontrast): volle muted-foreground liegt auf der
                            // Block-Fuellung nur bei ~4:1 -- foreground/70 traegt sicher.
                            <span aria-hidden="true" className="truncate font-mono text-[10px] tabular-nums text-foreground/70">{meta}</span>
                          )}
                          {p.ev.status === "substituted" && (
                            <span
                              aria-hidden="true"
                              className="mt-0.5 inline-flex w-fit rounded bg-amber-500/20 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400"
                            >
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
                        aria-hidden="true"
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
    </main>
  );
}
