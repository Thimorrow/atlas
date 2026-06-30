"use client";

import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TodoCheckbox } from "@/components/todo-checkbox";
import type { TodoInstance } from "@/lib/todos-view";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

// Subtiler als ein Termin (KEINE gefuellte Karte, kein dicker Farbrand), aber
// klar als eigene Spur erkennbar: leise getoente Lane mit duennem farbigem
// Akzent links, Checkbox + Titel. Erledigt -> durchgestrichen + geblasst.
export function AgendaTodoRow({
  inst,
  onToggle,
  meta,
}: {
  inst: TodoInstance;
  onToggle: (inst: TodoInstance, done: boolean) => void;
  meta?: ReactNode;
}) {
  const accent = inst.color ?? "color-mix(in oklab, var(--foreground) 35%, transparent)";
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg border border-l-[3px] border-border/60 bg-muted/40 px-2.5 py-1.5",
        inst.done && "opacity-55",
      )}
      style={{ borderLeftColor: accent }}
    >
      <TodoCheckbox
        checked={inst.done}
        onClick={() => onToggle(inst, inst.done)}
        tint={inst.color}
        size={18}
        ariaLabel={inst.done ? `${inst.title} als offen markieren` : `${inst.title} abhaken`}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[13px] font-medium leading-tight text-foreground/85",
          inst.done && "font-normal text-muted-foreground line-through",
        )}
      >
        {inst.title}
      </span>
      {meta ?? (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">Aufgabe</span>
      )}
    </div>
  );
}

// "Auch heute" -- Aufgaben ohne feste Uhrzeit (und Ueberfaelliges) liegen nicht
// auf der Zeitachse, also eine ruhige Zeile unter der Agenda statt eigener Bloecke.
export function LooseTodos({
  open,
  overdue,
  onToggle,
  stagger,
}: {
  open: TodoInstance[];
  overdue: TodoInstance[];
  onToggle: (inst: TodoInstance, done: boolean) => void;
  stagger: boolean;
}) {
  const reduce = useReducedMotion();
  const animate = stagger && !reduce;
  if (open.length === 0 && overdue.length === 0) return null;

  return (
    <motion.section
      initial={animate ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2, ease: EASE }}
      className="mt-5 border-t border-dashed pt-3"
    >
      <h4 className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        Auch heute
      </h4>
      <div className="flex flex-col gap-1.5">
        {overdue.map((inst) => (
          <AgendaTodoRow
            key={`o-${inst.todoId}`}
            inst={inst}
            onToggle={onToggle}
            meta={
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-600/90 dark:text-amber-400/90">
                überfällig
              </span>
            }
          />
        ))}
        {open.map((inst) => (
          <AgendaTodoRow key={inst.todoId} inst={inst} onToggle={onToggle} />
        ))}
      </div>
    </motion.section>
  );
}

// Wochen-Raster: winzige Punkte unter der Tageszahl -- reine Praesenz, kein Text.
// Offene Aufgaben farbcodiert (eigene Farbe, sonst neutral), gedeckelt + "+N".
const MAX_DOTS = 4;

export function DayTodoDots({ todos }: { todos: TodoInstance[] }) {
  const open = todos.filter((t) => !t.done);
  if (open.length === 0) return null;
  const shown = open.slice(0, MAX_DOTS);
  const extra = open.length - shown.length;
  return (
    <div className="mt-1 flex items-center gap-1" aria-label={`${open.length} offene Aufgaben`}>
      {shown.map((t) => (
        <span
          key={t.todoId}
          className="size-1.5 rounded-full"
          style={{ backgroundColor: t.color ?? "color-mix(in oklab, var(--foreground) 40%, transparent)" }}
        />
      ))}
      {extra > 0 && <span className="text-[9px] font-medium tabular-nums text-muted-foreground/70">+{extra}</span>}
    </div>
  );
}
