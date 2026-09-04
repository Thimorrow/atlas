"use client";

// Uebersicht des Lernbereichs (/lernen): faellige Karten heute, Pruefungen
// mit Lernplan, und die Liste aller Faecher. Reine Anzeige -- alles kommt aus
// GET /api/lernen, das Fach selbst laedt erst auf /lernen/[subjectId].

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";
import type { SubjectOverview } from "@/lib/study-store";

type OverviewResponse = { today: string; heuteGelernt: number; faecher: SubjectOverview[] };

// "pro Tag" ergibt am Pruefungstag keinen Sinn mehr -- dann zaehlt nur noch,
// was offen ist.
export function planText(total: number, plan: { tageBis: number; proTag: number; offen: number } | null): string {
  if (total === 0) return "Noch keine Karten";
  if (!plan) return "";
  if (plan.offen === 0) return "Alle Karten sicher";
  if (plan.tageBis <= 0) return `Heute ist die Prüfung, ${plan.offen} noch offen`;
  if (plan.tageBis === 1) return `Morgen ist die Prüfung, ${plan.offen} noch offen`;
  return `${plan.proTag} Karten pro Tag, ${plan.offen} noch offen`;
}

function tageBisLabel(tageBis: number): string {
  if (tageBis <= 0) return "heute";
  if (tageBis === 1) return "morgen";
  return `in ${tageBis} Tagen`;
}

export function LernenUebersicht() {
  const toast = useToast();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/lernen");
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      setData((await res.json()) as OverviewResponse);
    } catch {
      setFailed(true);
      toast("Der Lernbereich konnte nicht geladen werden.");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed && data === null) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border bg-card px-4 py-6 text-center shadow-card">
          <p className="text-[14px] text-muted-foreground">Das hat nicht geklappt.</p>
          <button
            type="button"
            className="mt-3 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent"
            onClick={() => void load()}
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-2xl space-y-6" aria-label="Wird geladen" aria-busy="true">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const faelligGesamt = data.faecher.reduce((sum, f) => sum + f.faellig, 0);
  const pruefungen = data.faecher
    .filter((f) => f.naechstePruefung !== null)
    .sort((a, b) => a.naechstePruefung!.tageBis - b.naechstePruefung!.tageBis);
  const faecherSortiert = [...data.faecher].sort((a, b) => {
    if (a.faellig > 0 !== b.faellig > 0) return a.faellig > 0 ? -1 : 1;
    return 0;
  });
  const leer = data.faecher.every((f) => f.total === 0) && pruefungen.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Lernen</h1>
        <p className="text-sm text-muted-foreground">
          {faelligGesamt > 0
            ? `Heute ${faelligGesamt} ${faelligGesamt === 1 ? "Karte" : "Karten"} fällig · ${data.heuteGelernt} gelernt`
            : `Nichts fällig, ${data.heuteGelernt} heute gelernt`}
        </p>
      </div>

      {pruefungen.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Prüfungen bald
          </h2>
          <div className="space-y-2">
            {pruefungen.map((f) => (
              <PruefungCard key={f.subjectId} fach={f} />
            ))}
          </div>
        </section>
      )}

      {leer && (
        <div className="rounded-xl border border-dashed px-4 py-8 text-center">
          <p className="text-[14px] text-muted-foreground">
            Noch keine Lernkarten. Öffne ein Fach und lass Karten aus deinen Notizen erzeugen.
          </p>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Alle Fächer
        </h2>
        <ul className="divide-y rounded-xl border">
          {faecherSortiert.map((f) => (
            <li key={f.subjectId}>
              <Link
                href={`/lernen/${f.subjectId}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorValue(f.color) }}
                />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{f.name}</span>
                <span className="shrink-0 tabular-nums text-[12.5px] text-muted-foreground">
                  {f.total === 0 ? "Keine Karten" : `${f.faellig} fällig · ${f.sicher}/${f.total} sicher`}
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PruefungCard({ fach }: { fach: SubjectOverview }) {
  const exam = fach.naechstePruefung!;
  const tint = colorValue(fach.color) || NEUTRAL_COLOR;
  const anteil = fach.total > 0 ? Math.round((fach.sicher / fach.total) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} />
            <span className="truncate text-[13px] font-medium text-muted-foreground">{fach.name}</span>
          </div>
          <p className="mt-0.5 truncate text-[14px] font-medium">{exam.title}</p>
          <p className="text-[12.5px] tabular-nums text-muted-foreground">{tageBisLabel(exam.tageBis)}</p>
        </div>
        {/* Mit Karten fuehrt der Knopf immer in die Sitzung: sind keine
            faellig, wiederholt sie die schwaechsten -- dieselbe Regel wie auf
            der Fachseite. Ohne Karten fuehrt er dorthin, wo welche entstehen. */}
        {fach.total === 0 ? (
          <Link
            href={`/lernen/${fach.subjectId}`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "shrink-0")}
          >
            Karten anlegen
          </Link>
        ) : (
          <Link
            href={`/lernen/${fach.subjectId}/session`}
            className={cn(buttonVariants({ size: "sm", variant: fach.faellig > 0 ? "default" : "outline" }), "shrink-0")}
          >
            {fach.faellig > 0 ? "Lernen" : "Wiederholen"}
          </Link>
        )}
      </div>

      <p className="mt-2 text-[12px] text-muted-foreground">
        {planText(fach.total, fach.plan)}
      </p>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${anteil}%`, backgroundColor: tint }}
        />
      </div>
    </div>
  );
}
