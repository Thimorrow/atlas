"use client";

// Fach-Seite des Lernbereichs (/lernen/[subjectId]): Fortschritt, Lernart,
// Liste der Themen (jedes Thema traegt seinen eigenen Lernzettel und seine
// eigenen Karten -- das lebt auf der Themenseite) und "Neues Thema".

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { planText, tageBisLabel } from "@/components/lernen-uebersicht";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";
import { LERNARTEN, type Lernart, type SubjectDetail, type TopicDTO } from "@/lib/lernen-types";

const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function weekdayOf(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

const LERNART_LABEL: Record<Lernart, string> = {
  aufgaben: "Aufgaben",
  vokabeln: "Vokabeln",
  wissen: "Wissen",
  texte: "Texte",
};

export function LernenFach({ subjectId }: { subjectId: string }) {
  const toast = useToast();
  const [data, setData] = useState<SubjectDetail | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/lernen/${subjectId}`);
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      setData((await res.json()) as SubjectDetail);
    } catch {
      setFailed(true);
      toast("Das Fach konnte nicht geladen werden.");
    }
  }, [subjectId, toast]);

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
        <Skeleton className="h-5 w-20" />
        <div className="space-y-1.5">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const tint = colorValue(data.subject.color) || NEUTRAL_COLOR;

  return <LernenFachBody subjectId={subjectId} data={data} setData={setData} tint={tint} toast={toast} />;
}

function LernenFachBody({
  subjectId,
  data,
  setData,
  tint,
  toast,
}: {
  subjectId: string;
  data: SubjectDetail;
  setData: (fn: (prev: SubjectDetail | null) => SubjectDetail | null) => void;
  tint: string;
  toast: (message: string, variant?: "error" | "success") => void;
}) {
  const router = useRouter();
  const { subject, progress, naechstePruefung, plan, themen, ohneThema, pruefungen } = data;
  const [savingLernart, setSavingLernart] = useState(false);

  async function changeLernart(value: string) {
    const lernart = value === "auto" ? null : (value as Lernart);
    setSavingLernart(true);
    // Optimistisch: sofort anzeigen, bei Fehler zurueckdrehen.
    const prev = data.subject;
    setData((p) =>
      p ? { ...p, subject: { ...p.subject, lernart: lernart ?? prev.lernart, lernartAuto: lernart === null } } : p,
    );
    try {
      const res = await fetch(`/api/subjects/${subjectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lernart }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setData((p) => (p ? { ...p, subject: prev } : p));
      toast("Die Lernart konnte nicht gespeichert werden.");
    } finally {
      setSavingLernart(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/lernen"
          className="inline-flex items-center gap-1 rounded-md py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Lernen
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{subject.name}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {naechstePruefung
            ? `${naechstePruefung.title} ${tageBisLabel(naechstePruefung.tageBis)}${
                plan && progress.total > 0 ? ` · ${planText(progress.total, plan)}` : ""
              }`
            : "Keine Pruefung eingetragen"}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="lernart" className="text-[13px] text-muted-foreground">
          Lernart: <span className="font-medium text-foreground">{LERNART_LABEL[subject.lernart]}</span>
        </label>
        <select
          id="lernart"
          value={subject.lernartAuto ? "auto" : subject.lernart}
          onChange={(e) => void changeLernart(e.target.value)}
          disabled={savingLernart}
          className="rounded-md border bg-background px-2.5 py-1.5 text-[16px] sm:text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <option value="auto">Automatisch</option>
          {LERNARTEN.map((l) => (
            <option key={l} value={l}>
              {LERNART_LABEL[l]}
            </option>
          ))}
        </select>
      </div>

      {progress.total > 0 && (
        <FortschrittBalken progress={progress} tint={tint} />
      )}

      {progress.total > 0 && (
        <div className="flex gap-2">
          <Link
            href={`/lernen/${subjectId}/session`}
            className={cn(buttonVariants({ size: "default" }), "flex-1")}
          >
            {progress.faellig > 0 ? `Lernen · ${progress.faellig} faellig` : "Lernen"}
          </Link>
          <Link
            href={`/lernen/${subjectId}/session?modus=schwach`}
            className={cn(buttonVariants({ size: "default", variant: "outline" }), "flex-1")}
          >
            Schwache ueben
          </Link>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Themen</h2>
        {themen.length === 0 && ohneThema.total === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
            Noch keine Themen. Lege eins an, dann kommen Lernzettel und Karten dorthin.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {themen.map((t) => {
              const exam = t.assignmentId ? pruefungen.find((p) => p.id === t.assignmentId) : undefined;
              const bereit = t.progress.total > 0 ? t.progress.bereit : 0;
              return (
                <li key={t.id}>
                  <Link
                    href={`/lernen/${subjectId}/themen/${t.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[14px] font-medium">{t.title}</p>
                        {exam && (
                          <span className="shrink-0 rounded-full border border-primary/40 px-1.5 py-0.5 text-[10.5px] font-medium text-primary">
                            Arbeit {WEEKDAYS_SHORT[weekdayOf(exam.dueDate)]}.
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${bereit}%`, backgroundColor: tint }} />
                        </div>
                        <span className="tabular-nums text-[12px] text-muted-foreground">
                          {t.progress.faellig} faellig
                        </span>
                      </div>
                    </div>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
            {ohneThema.total > 0 && (
              <li>
                <Link
                  href={`/lernen/${subjectId}/themen/allgemein`}
                  className="flex items-center gap-3 px-4 py-3 text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px]">Allgemein ({ohneThema.total} Karten)</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0" />
                </Link>
              </li>
            )}
          </ul>
        )}

        <NeuesThema
          subjectId={subjectId}
          pruefungen={pruefungen}
          toast={toast}
          onCreated={(thema) => {
            setData((p) => (p ? { ...p, themen: [...p.themen, { ...thema, progress: { total: 0, neu: 0, lernend: 0, sicher: 0, faellig: 0, bereit: 0 } }] } : p));
            router.push(`/lernen/${subjectId}/themen/${thema.id}`);
          }}
        />
      </section>
    </div>
  );
}

// --- Fortschrittsbalken ------------------------------------------------------

function FortschrittBalken({
  progress,
  tint,
}: {
  progress: SubjectDetail["progress"];
  tint: string;
}) {
  const { total, neu, lernend, sicher } = progress;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-muted-foreground/30" style={{ width: `${pct(neu)}%` }} />
        <div className="h-full" style={{ width: `${pct(lernend)}%`, backgroundColor: tint, opacity: 0.5 }} />
        <div className="h-full" style={{ width: `${pct(sicher)}%`, backgroundColor: tint }} />
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[12px] tabular-nums text-muted-foreground">
        <span>{neu} neu</span>
        <span>{lernend} lernend</span>
        <span>{sicher} sicher</span>
      </div>
    </div>
  );
}

// --- Neues Thema --------------------------------------------------------------

function NeuesThema({
  subjectId,
  pruefungen,
  toast,
  onCreated,
}: {
  subjectId: string;
  pruefungen: SubjectDetail["pruefungen"];
  toast: (message: string, variant?: "error" | "success") => void;
  onCreated: (thema: TopicDTO) => void;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  async function submit() {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/lernen/themen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectId, title: t, assignmentId: assignmentId || undefined }),
      });
      const body = (await res.json().catch(() => null)) as { thema?: TopicDTO; error?: string } | null;
      if (!res.ok || !body?.thema) {
        toast(body?.error ?? "Das Thema konnte nicht angelegt werden.");
        return;
      }
      onCreated(body.thema);
      setTitle("");
      setAssignmentId("");
      setOpen(false);
    } catch {
      toast("Das Thema konnte nicht angelegt werden.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        Neues Thema
      </Button>
    );
  }

  return (
    <form
      className="space-y-2 rounded-xl border bg-card p-4 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div>
        <label htmlFor={`${uid}-titel`} className="mb-1 block text-[12.5px] font-medium text-muted-foreground">
          Titel
        </label>
        <input
          ref={titleRef}
          id={`${uid}-titel`}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          spellCheck={false}
          className="w-full rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="z. B. Quadratische Funktionen"
        />
      </div>
      {pruefungen.length > 0 && (
        <div>
          <label htmlFor={`${uid}-pruefung`} className="mb-1 block text-[12.5px] font-medium text-muted-foreground">
            Pruefung (optional)
          </label>
          <select
            id={`${uid}-pruefung`}
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Keine</option>
            {pruefungen.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={saving || !title.trim()}>
          {saving ? "Legt an …" : "Anlegen"}
        </Button>
      </div>
    </form>
  );
}
