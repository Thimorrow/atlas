"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

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
      {/* Fuellung -- skaliert beim Abhaken auf */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-primary"
        initial={false}
        animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
        transition={
          reduce
            ? { duration: 0 }
            : { type: "spring", duration: 0.32, bounce: 0.28 }
        }
      />
      {/* Haken -- zeichnet sich beim Abhaken ein */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        className="relative"
        style={{ width: size * 0.62, height: size * 0.62 }}
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
              : { pathLength: { duration: 0.28, ease: EASE, delay: checked ? 0.06 : 0 }, opacity: { duration: 0.12 } }
          }
        />
      </svg>
    </button>
  );
}
