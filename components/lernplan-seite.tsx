"use client";

// Planseite des Lernplans: Kopf, Sicherheits-Übersicht, Tage mit Einheiten.
// Siehe SPEC.md "Planseite". Die Karten-Queue-Leiste kommt erst spaeter
// (components/lernplan-karten-queue.tsx) -- hier nur ein Platzhalter und die
// neuLaden()-Funktion, an der sie sich einhaengen kann.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LernplanKartenQueue } from "@/components/lernplan-karten-queue";
import { PhaseChip, SicherheitsBalken, balkenTextFarbe } from "@/components/lernplan-ui";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import { daysBetween, localISO, weekdayDateLabel } from "@/lib/assignments-view";
import type { ItemDTO, PlanDTO, PunktDTO, SicherheitQuelle } from "@/lib/lernplan-types";

const EASE = [0.22, 1, 0.36, 1] as const;

type Assignment = { id: string; title: string; dueDate: string | null };
type SubjectInfo = { name: string; color: string | null; botEnabled: boolean };

const QUELLE_LABEL: Record<SicherheitQuelle, string> = {
  diagnose: "Test",
  karten: "Karten",
  fazit: "Tutor",
  selbst: "Selbst",
  ohne_test: "Ohne Test",
};

function formatZeitpunkt(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

export function LernplanSeite({ subjectId, assignmentId }: { subjectId: string; assignmentId: string }) {
  const toast = useToast();
  const [status, setStatus] = useState<"laden" | "leer" | "fehler" | "ok">("laden");
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [subject, setSubject] = useState<SubjectInfo | null>(null);

  const load = useCallback(async () => {
    try {
      const [pRes, sRes, aRes] = await Promise.all([
        fetch(`/api/lernen/plan/${assignmentId}`),
        fetch(`/api/lernen/${subjectId}`),
        fetch(`/api/assignments?subjectId=${subjectId}`),
      ]);
      if (pRes.status === 404) {
        setStatus("leer");
        return;
      }
      if (!pRes.ok || !sRes.ok || !aRes.ok) throw new Error("laden");
      const planData = ((await pRes.json()) as { plan: PlanDTO }).plan;
      const sData = (await sRes.json()) as { subject: { name: string; color: string | null }; botEnabled: boolean };
      const aData = (await aRes.json()) as { assignments: { id: string; title: string; dueDate: string | null }[] };
      setPlan(planData);
      setSubject({ name: sData.subject.name, color: sData.subject.color, botEnabled: sData.botEnabled });
      setAssignment(aData.assignments.find((a) => a.id === assignmentId) ?? null);
      setStatus("ok");
    } catch {
      setStatus("fehler");
    }
  }, [subjectId, assignmentId]);

  // neuLaden() ist der Einhaengepunkt fuer die spaetere Karten-Queue: sie ruft
  // dies nach jedem erzeugten Kartensatz, um cards_state/kartenAnzahl frisch
  // zu bekommen.
  const neuLaden = load;

  useEffect(() => {
    void load();
  }, [load]);

  function patchItem(id: string, patch: Partial<ItemDTO>) {
    setPlan((p) => (p ? { ...p, items: p.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) } : p));
  }

  async function toggleEinfach(item: ItemDTO) {
    const vorher = item;
    const done = item.doneAt === null;
    patchItem(item.id, { doneAt: done ? new Date().toISOString() : null, result: done ? item.result : null });
    try {
      const res = await fetch(`/api/lernen/plan/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!res.ok) throw new Error();
      const updated = ((await res.json().catch(() => null)) as { item: ItemDTO } | null)?.item ?? null;
      if (updated) patchItem(item.id, updated);
    } catch {
      patchItem(item.id, vorher);
      toast("Nicht gefunden, Seite neu laden.");
    }
  }

  async function setzeErgebnis(item: ItemDTO, result: number) {
    const vorher = item;
    patchItem(item.id, { doneAt: new Date().toISOString(), result });
    try {
      const res = await fetch(`/api/lernen/plan/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done: true, result }),
      });
      if (!res.ok) throw new Error();
      const updated = ((await res.json().catch(() => null)) as { item: ItemDTO } | null)?.item ?? null;
      if (updated) patchItem(item.id, updated);
      void neuLaden();
    } catch {
      patchItem(item.id, vorher);
      toast("Nicht gefunden, Seite neu laden.");
    }
  }

  async function abwaehlenProbe(item: ItemDTO) {
    const vorher = item;
    patchItem(item.id, { doneAt: null, result: null });
    try {
      const res = await fetch(`/api/lernen/plan/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done: false }),
      });
      if (!res.ok) throw new Error();
    } catch {
      patchItem(item.id, vorher);
      toast("Nicht gefunden, Seite neu laden.");
    }
  }

  async function neuVerteilen(umfang: "ueberfaellig" | "alle_offen") {
    if (!plan) return;
    try {
      const res = await fetch(`/api/lernen/plan/${plan.id}/verteilen`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ umfang }),
      });
      const data = (await res.json().catch(() => null)) as { plan?: PlanDTO; hinweis?: string; error?: string } | null;
      if (!res.ok || !data?.plan) {
        toast(data?.error === "404" ? "Plan gibt es nicht mehr" : "Konnte nicht neu verteilt werden.");
        return;
      }
      setPlan(data.plan);
      toast(data.hinweis ?? "Neu verteilt.", "success");
    } catch {
      toast("Konnte nicht neu verteilt werden.");
    }
  }

  function planLoeschen() {
    if (!plan) return;
    toast("Plan wirklich löschen? Themen und Karten bleiben erhalten.", "error", {
      label: "Löschen",
      onClick: async () => {
        try {
          const res = await fetch(`/api/lernen/plan/${plan.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error();
          setPlan(null);
          setStatus("leer");
        } catch {
          toast("Der Plan konnte nicht gelöscht werden.");
        }
      },
    });
  }

  if (status === "laden") return <LernplanSkeleton />;

  if (status === "leer") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
          <p className="text-[15px] font-medium">Noch kein Plan</p>
          <p className="text-[13px] text-muted-foreground">Zu dieser Prüfung gibt es noch keinen Lernplan.</p>
          <Link href={`/lernen/${subjectId}/plan/${assignmentId}/neu`} className="mt-1">
            <Button type="button" size="sm">
              Lernplan erstellen
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (status === "fehler" || !plan) {
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

  const tint = colorValue(subject?.color) || NEUTRAL_COLOR;
  const einheitenGesamt = plan.items.length;
  const einheitenFertig = plan.items.filter((i) => i.doneAt !== null).length;
  const minutenGesamt = plan.items.reduce((s, i) => s + i.minuten, 0);
  const minutenFertig = plan.items.filter((i) => i.doneAt !== null).reduce((s, i) => s + i.minuten, 0);
  const sicherheitGesamt =
    plan.punkte.length > 0 ? Math.round(plan.punkte.reduce((s, p) => s + p.sicherheit, 0) / plan.punkte.length) : 0;
  const heute = localISO();
  const tageBis = assignment?.dueDate ? Math.max(0, daysBetween(heute, assignment.dueDate)) : null;
  const verschoben = !!assignment?.dueDate && assignment.dueDate !== plan.examDate;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-card">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: tint }} />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {subject?.name ?? "Fach"}
        </p>
        <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight">{assignment?.title ?? "Prüfung"}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          {assignment?.dueDate && <span className="tabular-nums">{weekdayDateLabel(assignment.dueDate)}</span>}
          {tageBis !== null && <span>· {tageBis === 0 ? "heute" : tageBis === 1 ? "morgen" : `in ${tageBis} Tagen`}</span>}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="tabular-nums text-[13px] font-medium">
              {einheitenFertig} von {einheitenGesamt} Einheiten
            </p>
            <p className="tabular-nums text-[12px] text-muted-foreground">
              {minutenFertig} von {minutenGesamt} Minuten
            </p>
          </div>
          <div>
            <p className={cn("tabular-nums text-[13px] font-medium", balkenTextFarbe(sicherheitGesamt))}>
              {sicherheitGesamt}% Sicherheit
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <NeuVerteilenMenu onWaehlen={neuVerteilen} />
          <Button type="button" variant="outline" size="sm" onClick={planLoeschen}>
            Plan löschen
          </Button>
          <Link href={`/lernen/${subjectId}/plan/${assignmentId}/neu`}>
            <Button type="button" variant="outline" size="sm">
              Plan neu erstellen
            </Button>
          </Link>
        </div>

        <ChecklisteLink plan={plan} />
      </header>

      {verschoben && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
          <span>
            Prüfung ist jetzt am {assignment?.dueDate ? weekdayDateLabel(assignment.dueDate) : "?"}, neu verteilen?
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => void neuVerteilen("alle_offen")}>
            Neu verteilen
          </Button>
        </div>
      )}

      <SicherheitsUebersicht punkte={plan.punkte} />

      <LernplanKartenQueue
        subjectId={subjectId}
        assignmentId={assignmentId}
        punkte={plan.punkte}
        botEnabled={subject?.botEnabled ?? true}
        onAktualisiert={neuLaden}
      />

      <TageListe
        subjectId={subjectId}
        assignmentId={assignmentId}
        plan={plan}
        heute={heute}
        onToggleEinfach={toggleEinfach}
        onSetzeErgebnis={setzeErgebnis}
        onAbwaehlenProbe={abwaehlenProbe}
      />
    </div>
  );
}

// --- Kopf: Checkliste-Link ----------------------------------------------------

function ChecklisteLink({ plan }: { plan: PlanDTO }) {
  const [offen, setOffen] = useState(false);
  if (plan.checklistFileId) {
    return (
      <a
        href={`/api/files/${plan.checklistFileId}`}
        target="_blank"
        rel="noopener"
        className="mt-3 inline-block rounded px-1 py-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Checkliste öffnen
      </a>
    );
  }
  if (!plan.checklistText) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", offen && "rotate-180")} />
        Checkliste
      </button>
      {offen && <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-muted-foreground">{plan.checklistText}</p>}
    </div>
  );
}

// --- Neu verteilen: Menü mit zwei Optionen -----------------------------------

function NeuVerteilenMenu({ onWaehlen }: { onWaehlen: (umfang: "ueberfaellig" | "alle_offen") => void }) {
  const [offen, setOffen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Aussen-Klick und Escape schliessen das Menue -- sonst bleibt es offen,
  // wenn woanders auf der Seite getippt wird.
  useEffect(() => {
    if (!offen) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOffen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOffen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [offen]);

  return (
    <div ref={wrapRef} className="relative">
      <Button type="button" variant="outline" size="sm" onClick={() => setOffen((v) => !v)} aria-expanded={offen}>
        Neu verteilen
        <ChevronDown className={cn("size-3.5 transition-transform", offen && "rotate-180")} />
      </Button>
      {offen && (
        <ul className="absolute z-10 mt-1 w-48 rounded-lg border bg-popover p-1 shadow-popover">
          <li>
            <button
              type="button"
              onClick={() => {
                onWaehlen("ueberfaellig");
                setOffen(false);
              }}
              className="block w-full rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-accent"
            >
              Nur Überfällige
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                onWaehlen("alle_offen");
                setOffen(false);
              }}
              className="block w-full rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-accent"
            >
              Alle offenen
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

// --- Sicherheits-Uebersicht ----------------------------------------------------

function SicherheitsUebersicht({ punkte }: { punkte: PunktDTO[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[13px] font-semibold">Sicherheit</h2>
      <ul className="space-y-2">
        {punkte.map((p) => (
          <PunktZeile key={p.id} punkt={p} />
        ))}
      </ul>
    </section>
  );
}

function PunktZeile({ punkt }: { punkt: PunktDTO }) {
  const [offen, setOffen] = useState(false);
  const hatFeedback = punkt.checks.some((c) => c.feedback);

  return (
    <li className="rounded-xl border bg-card p-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{punkt.titel}</p>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            "border-border text-muted-foreground",
          )}
        >
          {QUELLE_LABEL[punkt.sicherheitQuelle]} · {formatZeitpunkt(punkt.sicherheitAm)}
        </span>
      </div>
      <SicherheitsBalken wert={punkt.sicherheit} className="mt-2" />
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
        {punkt.cardsState === "fertig" || punkt.kartenAnzahl > 0 ? (
          <span className="tabular-nums">{punkt.kartenAnzahl} Karten</span>
        ) : punkt.cardsState === "fehler" ? (
          // Der eigentliche Erneut-Versuch sitzt zentral in der
          // Karten-Queue-Leiste (eine Quelle statt eigener fetch-Logik hier).
          <span className="text-destructive">Fehler, Erneut oben</span>
        ) : (
          <span>Karten werden erzeugt</span>
        )}
        {hatFeedback && (
          <button
            type="button"
            onClick={() => setOffen((v) => !v)}
            aria-expanded={offen}
            className="flex items-center gap-1 hover:text-foreground"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", offen && "rotate-180")} />
            Feedback
          </button>
        )}
      </div>
      {offen && hatFeedback && (
        <ul className="mt-2 space-y-1.5 border-t pt-2">
          {punkt.checks.map((c) => (
            <li key={c.id} className="text-[12.5px] text-muted-foreground">
              <span className="block font-medium text-foreground">{c.frage}</span>
              {c.feedback || "kein Feedback"}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// --- Tage -----------------------------------------------------------------------

type Tag = { date: string; items: ItemDTO[] };

function gruppiereTage(items: ItemDTO[]): Tag[] {
  const byDate = new Map<string, ItemDTO[]>();
  for (const item of items) {
    const arr = byDate.get(item.date) ?? [];
    arr.push(item);
    byDate.set(item.date, arr);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, its]) => ({ date, items: its.sort((a, b) => a.position - b.position) }));
}

function TageListe({
  subjectId,
  assignmentId,
  plan,
  heute,
  onToggleEinfach,
  onSetzeErgebnis,
  onAbwaehlenProbe,
}: {
  subjectId: string;
  assignmentId: string;
  plan: PlanDTO;
  heute: string;
  onToggleEinfach: (item: ItemDTO) => void;
  onSetzeErgebnis: (item: ItemDTO, result: number) => void;
  onAbwaehlenProbe: (item: ItemDTO) => void;
}) {
  const tage = useMemo(() => gruppiereTage(plan.items), [plan.items]);
  const punkteById = useMemo(() => new Map(plan.punkte.map((p) => [p.id, p])), [plan.punkte]);

  return (
    <section className="space-y-4">
      <h2 className="text-[13px] font-semibold">Tage</h2>
      {tage.map((tag) => {
        const istHeute = tag.date === heute;
        const ueberfaellig = tag.date < heute && tag.items.some((i) => i.doneAt === null);
        return (
          <div key={tag.date} className={cn("rounded-xl border p-3", istHeute && "border-primary/40 bg-primary/5")}>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-[12.5px] font-semibold tabular-nums">
                {istHeute ? "Heute" : weekdayDateLabel(tag.date)}
              </p>
              {ueberfaellig && (
                <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                  überfällig
                </span>
              )}
            </div>
            <ul className="space-y-2">
              {tag.items.map((item) => (
                <EinheitZeile
                  key={item.id}
                  subjectId={subjectId}
                  assignmentId={assignmentId}
                  item={item}
                  punkt={item.pointId ? (punkteById.get(item.pointId) ?? null) : null}
                  allePunkte={plan.punkte}
                  onToggleEinfach={onToggleEinfach}
                  onSetzeErgebnis={onSetzeErgebnis}
                  onAbwaehlenProbe={onAbwaehlenProbe}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

// --- Eine Einheit -------------------------------------------------------------

function EinheitZeile({
  subjectId,
  assignmentId,
  item,
  punkt,
  allePunkte,
  onToggleEinfach,
  onSetzeErgebnis,
  onAbwaehlenProbe,
}: {
  subjectId: string;
  assignmentId: string;
  item: ItemDTO;
  punkt: PunktDTO | null;
  allePunkte: PunktDTO[];
  onToggleEinfach: (item: ItemDTO) => void;
  onSetzeErgebnis: (item: ItemDTO, result: number) => void;
  onAbwaehlenProbe: (item: ItemDTO) => void;
}) {
  const [dialogOffen, setDialogOffen] = useState(false);
  const erledigt = item.doneAt !== null;
  const titel = item.punktTitel ?? (item.phase === "simulation" ? "Simulation" : "Thema fehlt");
  const manuell = item.phase === "probe" || item.phase === "simulation";

  function checkboxKlick() {
    if (!manuell) {
      onToggleEinfach(item);
      return;
    }
    if (erledigt) {
      onAbwaehlenProbe(item);
      return;
    }
    setDialogOffen(true);
  }

  return (
    <li className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={erledigt}
        aria-label={erledigt ? `${titel} als offen markieren` : `${titel} als erledigt markieren`}
        onClick={checkboxKlick}
        className={cn(
          // A2 (Touch): before blaeht die 20px-Box auf die 44x44-Mindestflaeche auf.
          "relative mt-0.5 grid size-5 shrink-0 place-items-center rounded border transition-colors before:absolute before:-inset-3 before:content-[''] [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          erledigt ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}
      >
        {erledigt && (
          <span aria-hidden className="text-[11px] leading-none">
            ✓
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <PhaseChip phase={item.phase} />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13.5px] font-medium",
              erledigt && "text-muted-foreground line-through",
            )}
          >
            {titel}
          </span>
          <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">{item.minuten} Min</span>
        </div>

        {item.phase === "lernen" && punkt && (
          <div className="text-[12.5px] text-muted-foreground">
            {punkt.detail && <p>{punkt.detail}</p>}
            {punkt.seiten && <p>Seiten {punkt.seiten}</p>}
            {punkt.blaetter.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {punkt.blaetter.map((b) => (
                  <a
                    key={b.id}
                    href={`/api/files/${b.id}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] hover:bg-accent"
                  >
                    {b.name}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {item.phase === "ueben" &&
          (!punkt || !punkt.topicId ? (
            <p className="text-[12.5px] text-muted-foreground">Thema fehlt</p>
          ) : punkt.kartenAnzahl > 0 ? (
            <Link
              href={`/lernen/${subjectId}/session?modus=lernen&thema=${punkt.topicId}&prüfung=${assignmentId}`}
              className="text-[12.5px] font-medium text-primary underline-offset-2 hover:underline"
            >
              Karten üben
            </Link>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">Karten werden erzeugt</p>
          ))}

        {item.phase === "probe" &&
          (!punkt || !punkt.topicId ? (
            <p className="text-[12.5px] text-muted-foreground">Thema fehlt</p>
          ) : (
            <Link
              href={`/lernen/${subjectId}/tutor?thema=${punkt.topicId}&modus=probe&einheit=${item.id}`}
              className="text-[12.5px] font-medium text-primary underline-offset-2 hover:underline"
            >
              Probe im Tutor
            </Link>
          ))}

        {item.phase === "simulation" && (
          <div className="space-y-1">
            <ul className="flex flex-wrap gap-1">
              {allePunkte.map((p) => (
                <li
                  key={p.id}
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] text-muted-foreground"
                >
                  {p.titel} · {p.sicherheit}%
                </li>
              ))}
            </ul>
            <Link
              href={`/lernen/${subjectId}/tutor?prüfung=${assignmentId}&modus=probe&einheit=${item.id}`}
              className="text-[12.5px] font-medium text-primary underline-offset-2 hover:underline"
            >
              Simulation im Tutor
            </Link>
          </div>
        )}
      </div>

      <WieLiefEsDialog
        offen={dialogOffen}
        onClose={() => setDialogOffen(false)}
        onWaehlen={(result) => {
          onSetzeErgebnis(item, result);
          setDialogOffen(false);
        }}
      />
    </li>
  );
}

// --- Dialog "Wie lief es?" ------------------------------------------------------

function WieLiefEsDialog({
  offen,
  onClose,
  onWaehlen,
}: {
  offen: boolean;
  onClose: () => void;
  onWaehlen: (result: number) => void;
}) {
  const reduce = useReducedMotion();
  const firstRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!offen) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => firstRef.current?.focus(), 20);
    return () => {
      window.clearTimeout(t);
      restoreRef.current?.focus?.();
    };
  }, [offen]);

  return (
    <AnimatePresence>
      {offen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            onClick={onClose}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="wie-lief-es-titel"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
              }
            }}
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="relative w-full max-w-sm rounded-t-2xl border bg-card p-5 shadow-popover sm:rounded-2xl"
          >
            <h3 id="wie-lief-es-titel" className="text-[15px] font-semibold tracking-tight">
              Wie lief es?
            </h3>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button ref={firstRef} type="button" variant="outline" className="h-11" onClick={() => onWaehlen(100)}>
                Sitzt
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => onWaehlen(50)}>
                Wackelt
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => onWaehlen(0)}>
                Fehlt
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// --- Ladezustand ------------------------------------------------------------

function LernplanSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-label="Plan wird geladen" aria-busy="true">
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-6 w-56" />
        <Skeleton className="mt-2 h-3.5 w-40" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
