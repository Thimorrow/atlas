"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
// Weiche Decel-Kurve fuer den Radiate-Ring: schnell raus, sanft aus.
const BURST_EASE = [0.16, 1, 0.3, 1] as const;

// Die Seele der To-Do-Liste: ein custom Kreis statt nacktem <input>. Ruhezustand
// = duenner Ring; abgehakt = fuellt sich mit --primary (monochrom, kein Farbstich),
// der Haken ZEICHNET sich (pathLength 0->1) auf der Atlas-Signaturkurve. Eigene
// Farbe (tint) faerbt nur den Ruhe-Ring dezent, damit farbige Aufgaben native
// wirken -- die Fuellung bleibt monochrom.
export function TodoCheckbox({
  checked,
  onClick,
  tint,
  size = 22,
  className,
  ariaLabel,
}: {
  checked: boolean;
  onClick: () => void;
  tint?: string | null;
  size?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const reduce = useReducedMotion();
  // Ein-Schuss-Trigger: nur wenn waehrend der Sitzung wirklich abgehakt wird
  // (false -> true). Schon erledigte Items, die spaeter mounten (z.B. die
  // "Erledigt"-Liste oder ein Tageswechsel), duerfen NICHT mitpulsen.
  const prev = useRef(checked);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (checked && !prev.current) setBurst((b) => b + 1);
    prev.current = checked;
  }, [checked]);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ width: size, height: size }}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full outline-none transition-transform active:scale-[0.9] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        className,
      )}
    >
      {/* Ring (Ruhezustand) -- faded weg, sobald gefuellt. Die Ringfarbe tweent
          weich (z.B. grau -> Amber, wenn ein Task der aktive/oberste wird). */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full border-2"
        initial={false}
        animate={{ opacity: checked ? 0 : 1, borderColor: tint || "color-mix(in oklab, var(--foreground) 34%, transparent)" }}
        transition={{ opacity: { duration: 0.18, ease: EASE }, borderColor: { duration: 0.3, ease: EASE } }}
      />
      {/* Radiate-Ring -- pulst beim Abhaken EINMAL nach aussen und fadet aus.
          Die "Tick"-Befriedigung; monochrom (--primary), kein Konfetti. Nur per
          burst-Trigger, damit er bei schon-erledigt mountenden Items still bleibt. */}
      {!reduce && (
        <AnimatePresence>
          {burst > 0 && (
            <motion.span
              key={burst}
              aria-hidden
              className="absolute inset-0 rounded-full border-2 border-primary"
              initial={{ scale: 0.55, opacity: 0.55 }}
              animate={{ scale: 2.1, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: BURST_EASE }}
            />
          )}
        </AnimatePresence>
      )}
      {/* Fuellung -- ploppt beim Abhaken mit Ueberschwung auf */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-primary"
        initial={false}
        animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
        transition={
          reduce
            ? { duration: 0 }
            : { type: "spring", duration: 0.34, bounce: 0.5 }
        }
      />
      {/* Haken -- zeichnet sich beim Abhaken ein und ploppt dabei minimal mit. */}
      <motion.svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        className="relative"
        style={{ width: size * 0.62, height: size * 0.62 }}
        initial={false}
        animate={{ scale: checked ? 1 : 0.6 }}
        transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.36, bounce: 0.45, delay: checked ? 0.04 : 0 }}
      >
        <motion.path
          d="M5 12.5l4.2 4.3L19 7"
          stroke="var(--primary-foreground)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={
            reduce
              ? { duration: 0 }
              : { pathLength: { duration: 0.28, ease: EASE, delay: checked ? 0.08 : 0 }, opacity: { duration: 0.12 } }
          }
        />
      </motion.svg>
    </button>
  );
}
