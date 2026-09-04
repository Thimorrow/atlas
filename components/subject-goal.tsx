"use client";

// "Was brauche ich noch?" -- der Zielnoten-Rechner im Fach.
//
// Reine Client-Rechnung, wie schon der Fachschnitt in SubjectGrades: dieselbe
// Funktion (requiredPointsForGoal), dieselbe Quelle wie der Server (subjectAverage),
// kein Serveraufruf und kein Ladezustand -- das Ergebnis steht sofort neu da,
// sobald an einem Regler gedreht wird.

import { useMemo, useState } from "react";
import {
  KIND_LABEL,
  POINTS_MAX,
  POINTS_MIN,
  clampPoints,
  formatPoints,
  pointsToGradeLabel,
  requiredPointsForGoal,
  type GradeInput,
  type GradeKind,
} from "@/lib/grades";
import { cn } from "@/lib/utils";

const POINT_OPTIONS = Array.from({ length: POINTS_MAX - POINTS_MIN + 1 }, (_, i) => POINTS_MAX - i);

// Nur "einfach" und "doppelt" -- fuer den Rechner reichen die beiden Faelle,
// die eine Klausur ueberhaupt unterscheidet (siehe GradeForm in subject-grades.tsx).
const NEXT_WEIGHT_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Einfach" },
  { value: 2, label: "Doppelt" },
];

// Zwei-Wege-Umschalter im Stil von TitlePicker (subject-detail.tsx): bei genau
// zwei Optionen ist die Auswahl schon sichtbar, ein Aufklappmenue waere ein
// Schritt zu viel.
function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex h-9 shrink-0 items-center gap-0.5 rounded-lg border bg-background p-0.5"
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => value !== o.value && onChange(o.value)}
          className={cn(
            "h-full rounded-[6px] px-3 text-[13px] transition-colors [touch-action:manipulation]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SubjectGoal({
  grades,
  oralWeight,
  currentAveragePoints,
}: {
  grades: GradeInput[];
  oralWeight: number;
  currentAveragePoints: number;
}) {
  // Vorbelegung zwei Punkte ueber dem aktuellen Schnitt -- ein Ziel, das
  // realistisch klingt, statt gleich auf 15 zu stehen.
  const [target, setTarget] = useState(() => clampPoints(Math.round(currentAveragePoints) + 2));
  const [kind, setKind] = useState<GradeKind>("written");
  const [weight, setWeight] = useState(1);

  const outcome = useMemo(
    () => requiredPointsForGoal(grades, target, { kind, weight }, oralWeight),
    [grades, target, kind, weight, oralWeight],
  );

  const targetLabel = pointsToGradeLabel(target);
  const sentence = useMemo(() => {
    if (outcome.status === "reached") {
      return `Dein Schnitt liegt schon bei ${formatPoints(outcome.current)} Punkten. Eine ${targetLabel} hast du damit schon erreicht.`;
    }
    if (outcome.status === "unreachable") {
      return `Selbst mit 15 Punkten kaemst du auf ${formatPoints(outcome.atMax)} Punkte. Eine ${targetLabel} geht dieses Halbjahr nicht mehr.`;
    }
    const where = kind === "written" ? "Arbeit" : "muendlichen Note";
    return `Fuer eine ${targetLabel} brauchst du in der naechsten ${where} ${outcome.points} Punkte.`;
  }, [outcome, targetLabel, kind]);

  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <h3 className="text-[13px] font-medium">Was brauche ich noch?</h3>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="shrink-0">Ziel</span>
          <select
            aria-label="Wunschnote in Punkten"
            className="h-9 rounded-lg border bg-background px-2 text-[16px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          >
            {POINT_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p} Punkte (Note {pointsToGradeLabel(p)})
              </option>
            ))}
          </select>
        </label>

        <SegmentedControl
          ariaLabel="Art der naechsten Note"
          value={kind}
          onChange={setKind}
          options={[
            { value: "written", label: KIND_LABEL.written },
            { value: "oral", label: KIND_LABEL.oral },
          ]}
        />

        <SegmentedControl
          ariaLabel="Gewichtung der naechsten Note"
          value={weight}
          onChange={setWeight}
          options={NEXT_WEIGHT_OPTIONS}
        />
      </div>

      {/* min-h haelt den Platz fest -- die drei moeglichen Saetze sind
          unterschiedlich lang, ohne das wuerde der Inhalt darunter beim
          Umschalten springen. */}
      <p className="mt-3 min-h-[2.6em] text-[14px] leading-snug">{sentence}</p>
    </div>
  );
}
