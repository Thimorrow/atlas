"use client";

// Uebersicht des Lernbereichs (/lernen): was heute ansteht (Heute), welche
// Pruefungen bevorstehen (mit Bereitschaft je Thema), und alle Faecher.
// Reine Anzeige -- alles kommt aus GET /api/lernen.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";
import type { HeuteItem, OverviewResponse, PlanDTO, PruefungOverview, SubjectOverview } from "@/lib/lernen-types";

// "pro Tag" ergibt am Pruefungstag keinen Sinn mehr -- dann zaehlt nur noch,
// was offen ist. Von Fach- und Themenseite genutzt (Pruefungszeile).
export function planText(total: number, plan: PlanDTO | null): string {
  if (total === 0) return "Noch keine Karten";
  if (!plan) return "";
  if (plan.offen === 0) return "Alle Karten sicher";
  if (plan.tageBis <= 0) return `Heute ist die Prüfung, ${plan.offen} noch offen`;
  if (plan.tageBis === 1) return `Morgen ist die Prüfung, ${plan.offen} noch offen`;
  return `${plan.proTag} Karten pro Tag, ${plan.offen} noch offen`;
}

export function tageBisLabel(tageBis: number): string {
  if (tageBis <= 0) return "heute";
  if (tageBis === 1) return "morgen";
  return `in ${tageBis} Tagen`;
}

function grundText(item: HeuteItem): string {
  if (item.grund === "pruefung" && item.pruefung) return `Arbeit ${tageBisLabel(item.pruefung.tageBis)}`;
  return "fällig";
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

  const leer = data.faecher.every((f) => f.progress.total === 0) && data.pruefungen.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Lernen</h1>
        <p className="text-sm text-muted-foreground">
          {data.heute.karten > 0
            ? `Heute ${data.heute.karten} ${data.heute.karten === 1 ? "Karte" : "Karten"}, etwa ${data.heute.minuten} ${
                data.heute.minuten === 1 ? "Minute" : "Minuten"
              } · ${data.heuteGelernt} gelernt`
            : `Heute nichts fällig · ${data.heuteGelernt} gelernt`}
        </p>
      </div>

      {data.heute.items.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Heute</h2>
          <ul className="space-y-2">
            {data.heute.items.map((item, i) => (
              <HeuteZeile key={`${item.subjectId}-${item.topicId ?? "allgemein"}`} item={item} first={i === 0} />
            ))}
          </ul>
        </section>
      )}

      {data.pruefungen.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Prüfungen bald
          </h2>
          <div className="space-y-2">
            {data.pruefungen.map((p) => (
              <PruefungCard key={p.id} pruefung={p} />
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
          {[...data.faecher]
            .sort((a, b) => {
              if (a.progress.faellig > 0 !== b.progress.faellig > 0) return a.progress.faellig > 0 ? -1 : 1;
              return 0;
            })
            .map((f) => (
              <FachZeile key={f.subjectId} fach={f} />
            ))}
        </ul>
      </section>
    </div>
  );
}

function HeuteZeile({ item, first }: { item: HeuteItem; first: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-card">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: colorValue(item.color) }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{item.titel}</p>
        <p className="text-[12.5px] text-muted-foreground">
          {grundText(item)} · {item.anzahl} {item.anzahl === 1 ? "Karte" : "Karten"}
        </p>
      </div>
      <Link
        href={`/lernen/${item.subjectId}/session?thema=${item.topicId ?? "allgemein"}`}
        className={cn(buttonVariants({ size: "sm", variant: first ? "default" : "outline" }), "shrink-0")}
      >
        Los
      </Link>
    </li>
  );
}

function PruefungCard({ pruefung }: { pruefung: PruefungOverview }) {
  const tint = colorValue(pruefung.color) || NEUTRAL_COLOR;
  const anteil = pruefung.total > 0 ? Math.round((pruefung.bereit / pruefung.total) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} />
            <span className="truncate text-[13px] font-medium text-muted-foreground">{pruefung.subjectName}</span>
          </div>
          <p className="mt-0.5 truncate text-[14px] font-medium">{pruefung.title}</p>
          <p className="text-[12.5px] tabular-nums text-muted-foreground">{tageBisLabel(pruefung.tageBis)}</p>
        </div>
        {pruefung.themen.length === 0 ? (
          <Link
            href={`/lernen/${pruefung.subjectId}`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "shrink-0")}
          >
            Themen festlegen
          </Link>
        ) : (
          <div className="flex shrink-0 gap-1.5">
            <Link
              href={`/lernen/${pruefung.subjectId}/session?prüfung=${pruefung.id}`}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Lernen
            </Link>
            <Link
              href={`/lernen/${pruefung.subjectId}/session?prüfung=${pruefung.id}&modus=probe`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              Probe
            </Link>
          </div>
        )}
      </div>

      {pruefung.total > 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full" style={{ width: `${anteil}%`, backgroundColor: tint }} />
        </div>
      )}

      {pruefung.themen.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {pruefung.themen.map((t) => (
            <span
              key={t.id}
              className="rounded-full border px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground"
            >
              {t.title} · {t.total > 0 ? Math.round((t.bereit / t.total) * 100) : 0}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FachZeile({ fach }: { fach: SubjectOverview }) {
  const { progress } = fach;
  return (
    <li>
      <Link
        href={`/lernen/${fach.subjectId}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: colorValue(fach.color) }}
        />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{fach.name}</span>
        <span className="shrink-0 tabular-nums text-[12.5px] text-muted-foreground">
          {progress.total === 0 ? "Keine Karten" : `${progress.faellig} fällig · ${progress.bereit}% bereit`}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
