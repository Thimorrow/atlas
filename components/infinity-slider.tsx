"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildOklch, parseOklch } from "@/lib/event-colors";

// Ein-Griff-Shade-Explorer in Form einer liegenden Acht (Gerono-Lemniskate).
// Der Farbton bleibt FIX (kommt aus der aktuellen Farbe / dem gewaehlten Preset).
// Entlang der Bahn variieren NUR Helligkeit und Saettigung -- also z.B. bei Blau
// nur hell..dunkelblau, mal satt, mal blass. Helligkeit und Saettigung folgen
// zwei verschieden schnellen Wellen, daher ist die Zuordnung Position->Farbe
// bewusst verwoben: man zieht herum und entdeckt, statt sie abzulesen.

const VBW = 248;
const VBH = 132;
const CX = VBW / 2;
const CY = VBH / 2;
const AX = 104;
const AY = 96;
const SAMPLES = 320;
const TAU = Math.PI * 2;

// Spannen fuer Helligkeit/Saettigung (innerhalb des gut tragenden Bereichs).
const L_MIN = 0.46;
const L_MAX = 0.82;
const C_MIN = 0.05;
const C_MAX = 0.2;
const L_MID = (L_MIN + L_MAX) / 2;
const L_SPAN = (L_MAX - L_MIN) / 2;
const C_MID = (C_MIN + C_MAX) / 2;
const C_SPAN = (C_MAX - C_MIN) / 2;
const PHASE = 1.25; // Phasenversatz -> L und C laufen nie synchron

// Punkt der Lemniskate (Bildschirm-Koordinaten).
function point(t: number): { px: number; py: number } {
  return { px: CX + AX * Math.cos(t), py: CY - AY * Math.sin(t) * Math.cos(t) };
}

// Helligkeit/Saettigung an Position t (zwei Wellen unterschiedlicher Frequenz).
function shadeAt(t: number): { l: number; c: number } {
  return { l: L_MID + L_SPAN * Math.sin(2 * t + PHASE), c: C_MID + C_SPAN * Math.sin(t) };
}

export function InfinitySlider({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  const cur = parseOklch(value);
  const hue = cur.h;
  const colorAt = (t: number) => {
    const { l, c } = shadeAt(t);
    return buildOklch({ l, c, h: hue });
  };

  // Lichtgradient des Bands: heller..dunkler IM SELBEN Farbton/Saettigung. Reine
  // Optik (3D-Glanz), verraet NICHT, welche Schattierung wo auf der Bahn liegt.
  const hi = buildOklch({ l: Math.min(0.92, cur.l + 0.13), c: cur.c, h: hue });
  const lo = buildOklch({ l: Math.max(0.28, cur.l - 0.12), c: cur.c, h: hue });

  // Geometrie einmal abtasten (hue-unabhaengig).
  const pos = useMemo(
    () => Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const t = (i / SAMPLES) * TAU;
      return { t, ...point(t) };
    }),
    [],
  );

  // Eine durchgehende Bahn (in der aktuellen Farbe gezeichnet).
  const pathD = useMemo(() => pos.map((p, i) => `${i ? "L" : "M"}${p.px.toFixed(2)} ${p.py.toFixed(2)}`).join(" "), [pos]);

  // t aus der aktuellen Helligkeit/Saettigung rekonstruieren (Farbton egal).
  const thetaFromShade = (val: string) => {
    const { l, c } = parseOklch(val);
    let best = 0;
    let bd = Infinity;
    for (const p of pos) {
      const s = shadeAt(p.t);
      const d = (s.l - l) ** 2 + ((s.c - c) * 3) ** 2;
      if (d < bd) {
        bd = d;
        best = p.t;
      }
    }
    return best;
  };

  const [t, setT] = useState(() => thetaFromShade(value));
  const tRef = useRef(t);
  const sync = (nt: number) => {
    tRef.current = nt;
    setT(nt);
  };

  // Externe Aenderung (Preset-Klick) -> Griff nachziehen, nicht waehrend des Ziehens.
  useEffect(() => {
    if (!draggingRef.current) sync(thetaFromShade(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const toSvg = (e: PointerEvent | React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VBW, y: ((e.clientY - r.top) / r.height) * VBH };
  };

  // Naechster Bahnpunkt zum Zeiger. Mit anchor (= aktuelles t) eine
  // Kontinuitaets-Bremse: am Kreuzungspunkt liegen zwei Aeste pixelnah -- ohne
  // Bremse springt der Griff auf den anderen Ast (das fuehlte sich glitchy an).
  // Der Strafterm haelt ihn beim Ziehen am aktuellen Ast; ein frischer Klick
  // (anchor = null) darf frei springen.
  const nearest = (x: number, y: number, anchor: number | null) => {
    let best = 0;
    let bd = Infinity;
    for (const p of pos) {
      let cost = (p.px - x) ** 2 + (p.py - y) ** 2;
      if (anchor !== null) {
        let dt = Math.abs(p.t - anchor);
        dt = Math.min(dt, TAU - dt);
        cost += 1400 * dt * dt;
      }
      if (cost < bd) {
        bd = cost;
        best = p.t;
      }
    }
    return best;
  };

  const apply = (x: number, y: number, anchor: number | null) => {
    const th = nearest(x, y, anchor);
    sync(th);
    onChange(colorAt(th));
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const p = toSvg(e);
    apply(p.x, p.y, null);
    const move = (ev: PointerEvent) => {
      const q = toSvg(ev);
      apply(q.x, q.y, tRef.current);
    };
    const up = () => {
      draggingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const [hot, setHot] = useState(false);
  const hp = point(t);

  return (
    <div className="space-y-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VBW} ${VBH}`}
        className="w-full touch-none select-none"
        role="slider"
        aria-label="Helligkeit und Sättigung auf der Acht"
        aria-valuemin={0}
        aria-valuemax={SAMPLES}
        aria-valuenow={Math.round((t / TAU) * SAMPLES)}
        tabIndex={0}
        onKeyDown={(e) => {
          const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          const nt = (t + (d * TAU) / SAMPLES + TAU) % TAU;
          sync(nt);
          onChange(colorAt(nt));
        }}
        onPointerDown={onDown}
        onPointerEnter={() => setHot(true)}
        onPointerLeave={() => setHot(false)}
      >
        <defs>
          {/* Sehr dezenter Lichtgradient im selben Farbton -- Satin, kein Neon. */}
          <linearGradient id="ev8-ribbon" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={hi} />
            <stop offset="0.5" stopColor={value} />
            <stop offset="1" stopColor={lo} />
          </linearGradient>
        </defs>

        {/* Eingravierte Rille: feine, ruhige Bahn -- gibt der Acht Halt ohne Laerm. */}
        <path d={pathD} fill="none" stroke="currentColor" className="text-foreground/[0.08]" strokeWidth={9} strokeLinecap="round" />
        {/* Schlankes Satin-Band in der aktuellen Farbe, weicher Material-Schatten. */}
        <path
          d={pathD}
          fill="none"
          stroke="url(#ev8-ribbon)"
          strokeWidth={6}
          strokeLinecap="round"
          style={{ filter: "drop-shadow(0 1px 2px var(--slider-shadow))", transition: "stroke 160ms var(--ease-atlas)" }}
        />

        {/* Griff als Juwel: weiche Fassung, weisser Bezel, Farbkern. */}
        <circle cx={hp.px} cy={hp.py} r={hot ? 11.5 : 10.5} fill="#fff" style={{ filter: "drop-shadow(0 1px 4px var(--slider-shadow))", transition: "r 160ms var(--ease-atlas)" }} />
        <circle
          cx={hp.px}
          cy={hp.py}
          r={hot ? 7.5 : 6.5}
          fill={value}
          stroke="#fff"
          strokeWidth={1.5}
          style={{ transition: "r 160ms var(--ease-atlas), fill 160ms var(--ease-atlas)" }}
        />
      </svg>
      <p className="text-center text-[11px] text-muted-foreground/70">Zieh den Punkt um die Acht</p>
    </div>
  );
}
