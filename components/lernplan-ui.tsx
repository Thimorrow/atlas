"use client";

// Geteilte kleine UI-Bausteine des Lernplans: Phase-Chip, Sicherheits-Farben
// und -Balken. War vorher vierfach dupliziert in lernplan-seite.tsx,
// pruefungen-view.tsx, morgen-panel.tsx und stunden-cockpit.tsx -- jetzt eine
// Quelle (Referenz war lernplan-seite.tsx).

import { cn } from "@/lib/utils";
import type { Phase } from "@/lib/lernplan-types";

export const PHASE_LABEL: Record<Phase, string> = {
  lernen: "Lernen",
  ueben: "Ueben",
  probe: "Probe",
  simulation: "Simulation",
};

export function balkenFarbe(v: number): string {
  if (v >= 80) return "bg-green-600 dark:bg-green-500";
  if (v >= 40) return "bg-yellow-600 dark:bg-yellow-500";
  return "bg-red-600 dark:bg-red-500";
}

export function balkenTextFarbe(v: number): string {
  if (v >= 80) return "text-green-700 dark:text-green-400";
  if (v >= 40) return "text-yellow-700 dark:text-yellow-400";
  return "text-red-700 dark:text-red-400";
}

export function PhaseChip({ phase }: { phase: Phase }) {
  const styles: Record<Phase, string> = {
    lernen: "border-blue-600/30 bg-blue-600/10 text-blue-700 dark:border-blue-500/30 dark:text-blue-400",
    ueben: "border-purple-600/30 bg-purple-600/10 text-purple-700 dark:border-purple-500/30 dark:text-purple-400",
    probe: "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:border-amber-500/30 dark:text-amber-400",
    simulation: "border-primary/30 bg-primary/10 text-primary",
  };
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", styles[phase])}>
      {PHASE_LABEL[phase]}
    </span>
  );
}

// Balken + Prozent-Text fuer die Sicherheit eines Punkts/Plans. `children`
// haengt sich rechts an, in derselben Zeile (z.B. "3 von 5" in
// pruefungen-view.tsx).
export function SicherheitsBalken({
  wert,
  className,
  children,
}: {
  wert: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={wert}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn("h-full rounded-full", balkenFarbe(wert))} style={{ width: `${wert}%` }} />
      </div>
      <span className={cn("shrink-0 tabular-nums text-[12.5px] font-medium", balkenTextFarbe(wert))}>{wert}%</span>
      {children}
    </div>
  );
}
