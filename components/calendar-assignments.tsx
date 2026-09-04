"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AssignmentCheckbox } from "@/components/assignment-checkbox";
import { isExam, TYPE_LABEL, type AssignmentDTO } from "@/lib/assignments-view";
import { colorValue } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

// Der Stundenplan bleibt ein Untis-Spiegel. Beide Komponenten hier sind
// bewusst additiv und geben bei leerer Liste `null` zurueck -- ein Tag ohne
// faellige Aufgaben rendert also KEIN Element, auch keinen leeren Platzhalter,
// und behaelt damit exakt die Hoehe von vorher.

// --- Wochenansicht: Punkte unter der Tageszahl ------------------------------

const MAX_DOTS = 4;

export function WeekDayDots({
  items,
  colorOf = (a) => colorValue(a.subjectColor),
}: {
  items: AssignmentDTO[];
  colorOf?: (a: AssignmentDTO) => string;
}) {
  // Erledigte zeigt die Wochenansicht nicht -- die Spur meint "das steht noch an".
  const open = items.filter((a) => !a.completedAt);
  if (open.length === 0) return null;

  const shown = open.slice(0, MAX_DOTS);
  const extra = open.length - shown.length;
  // Die Punkte sind nicht rein dekorativ: der Text nennt die Aufgaben, damit
  // Maus- und Screenreader-Nutzer dieselbe Information bekommen.
  const label = `Faellig: ${open
    .map((a) => `${a.subjectName ?? "Allgemein"} · ${a.title}${isExam(a.type) ? ` (${TYPE_LABEL[a.type]})` : ""}`)
    .join(", ")}`;

  return (
    <div className="mt-1 flex items-center gap-1" title={label} aria-label={label} role="img">
      {shown.map((a, i) => (
        <Dot key={a.id} color={colorOf(a)} ring={isExam(a.type)} index={i} />
      ))}
      {extra > 0 && (
        <span className="text-[9px] font-medium tabular-nums text-muted-foreground">+{extra}</span>
      )}
    </div>
  );
}

// Pruefung = Ring (nur Rand), alles andere = gefuellter Punkt. Zwei Formen
// statt zweier Farben, damit die Fachfarbe ihre Bedeutung behaelt.
function Dot({ color, ring, index }: { color: string; ring: boolean; index: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      className={cn("size-1.5 shrink-0 rounded-full", ring && "border-[1.5px]")}
      style={ring ? { borderColor: color } : { backgroundColor: color }}
      initial={reduce ? false : { opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.04, 0.16), ease: EASE }}
    />
  );
}

// --- Tagesansicht: schlanke Zeile "Faellig heute" ----------------------------

export function DayDueRow({
  items,
  onToggle,
}: {
  items: AssignmentDTO[];
  onToggle: (a: AssignmentDTO) => void;
}) {
  const reduce = useReducedMotion();
  if (items.length === 0) return null;

  return (
    <motion.section
      // Keine Karte, kein Rahmen, gedeckte Schrift -- die Zeile soll neben den
      // Stundenbloecken zuruecktreten, nicht mit ihnen konkurrieren.
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="mb-4 flex flex-col gap-1"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Faellig heute
      </h2>
      <ul className="flex flex-col gap-0.5">
        {items.map((a) => {
          const done = Boolean(a.completedAt);
          return (
            <li key={a.id} className="flex items-center gap-2.5 py-0.5">
              <AssignmentCheckbox
                checked={done}
                onClick={() => onToggle(a)}
                tint={colorValue(a.subjectColor)}
                size={18}
                ariaLabel={done ? `${a.title} als offen markieren` : `${a.title} abhaken`}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px] leading-tight text-muted-foreground",
                  done && "line-through opacity-60",
                )}
              >
                {a.subjectName && <span className="text-foreground/70">{a.subjectName} · </span>}
                {a.title}
              </span>
              {isExam(a.type) && (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {TYPE_LABEL[a.type]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
