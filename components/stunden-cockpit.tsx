"use client";

// Das Stunden-Cockpit: die eine Ansicht, die IMMER funktioniert -- laufende
// Stunde, Pause (naechste Stunde vorbereiten), vor/nach der Schule oder ein
// freier Tag. Anders als der fruehere Vollbild-Stundenmodus (der nur bei
// wirklich laufendem Unterricht erschien) ist das hier eine eigene Route
// (/stunde), die auf dem Handy waehrend des Unterrichts offen bleibt.
//
// Die Editoren sind bewusst nicht neu geschrieben: Meldung und Notiz sind
// dieselben Bausteine wie ueberall sonst (ParticipationCounter,
// LessonNoteField), die Hausaufgabe ist der Schnelleintrag von /aufgaben mit
// vorbelegtem Fach und Faelligkeitsdatum, und die Dateien sind der
// Datei-Bereich des Fachs.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, MapPin, User } from "lucide-react";
import { AssignmentCheckbox } from "@/components/assignment-checkbox";
import { AssignmentQuickAdd } from "@/components/assignment-quick-add";
import { LessonNoteField } from "@/components/lesson-note";
import { ParticipationCounter } from "@/components/lesson-participation";
import { SubjectFiles } from "@/components/subject-files";
import { Skeleton } from "@/components/ui/skeleton";
import { PhaseChip, balkenTextFarbe } from "@/components/lernplan-ui";
import { useToast } from "@/components/toast";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import { lessonProgress, minutesLeft, minutesUntil } from "@/lib/jetzt-stunde";
import { dueLabel, overdueLabel, weekdayDateLabel, type AssignmentDTO } from "@/lib/assignments-view";
import { cn } from "@/lib/utils";
import type { StundeResponse } from "@/app/api/stunde/route";
import type { ItemDTO } from "@/lib/lernplan-types";
import type { LernenFuerTagEintrag } from "@/lib/lernplan-store";

// Wie oft Restzeit und Fortschritt clientseitig nachgerechnet werden, ohne
// dafuer neu zu laden. Gleiches Mass wie der frueherer Vollbild-Stundenmodus.
const TICK_MS = 30_000;

function jetztHM(): string {
  return new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function StundenCockpit({ block }: { block: string | null }) {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<StundeResponse | null>(null);
  const [failed, setFailed] = useState(false);
  // Ohne explizite Auswahl folgt das Cockpit der Zeit (live wechselt
  // automatisch mit); mit Auswahl bleibt genau diese Stunde stehen, auch
  // wenn zwischenzeitlich eine andere zu laufen beginnt.
  const [selectedBlock, setSelectedBlock] = useState<string | null>(block);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const qs = selectedBlock ? `?block=${selectedBlock}` : "";
      const res = await fetch(`/api/stunde${qs}`);
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      setData((await res.json()) as StundeResponse);
    } catch {
      setFailed(true);
      toast("Das Cockpit konnte nicht geladen werden.");
    }
  }, [selectedBlock, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Alle 60s neu, und sofort wieder, sobald das Handy aus der Tasche kommt
  // (Tab wird wieder sichtbar) -- sonst steht eine veraltete Restzeit da.
  useEffect(() => {
    const id = setInterval(() => void load(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  function selectBlock(refId: string) {
    setSelectedBlock(refId);
    router.replace(`/stunde?block=${refId}`, { scroll: false });
  }

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
      <div className="mx-auto max-w-2xl">
        <CockpitSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Tagesleiste data={data} selectedRefId={data.selected?.refId ?? null} onSelect={selectBlock} />

      {data.modus === "frei" ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
          <p className="text-[15px] font-medium">Heute keine Schule.</p>
          <Link
            href="/"
            className="rounded-md px-2 py-1.5 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Zum Fokus
          </Link>
        </div>
      ) : data.selected ? (
        <CockpitBody data={data} onExpired={load} />
      ) : null}
    </div>
  );
}

// --- Tagesleiste -----------------------------------------------------------

function Tagesleiste({
  data,
  selectedRefId,
  onSelect,
}: {
  data: StundeResponse;
  selectedRefId: string | null;
  onSelect: (refId: string) => void;
}) {
  if (data.modus === "frei" || data.tag.length === 0) return null;

  return (
    <div className="-mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {data.tag.map((ev) => {
        const active = ev.refId === selectedRefId;
        const live = ev.refId === data.liveRefId;
        const cancelled = ev.status === "cancelled";
        const tint = ev.subjectId ? colorValue(ev.subjectColor) : NEUTRAL_COLOR;
        return (
          <button
            key={ev.refId}
            type="button"
            onClick={() => onSelect(ev.refId)}
            className={cn(
              "flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active ? "bg-accent border-border" : "border-transparent hover:bg-accent/50",
              cancelled && "text-muted-foreground line-through decoration-foreground/30",
            )}
          >
            {live && (
              <span aria-hidden className="size-1.5 shrink-0 rounded-full motion-safe:animate-pulse" style={{ backgroundColor: tint }} />
            )}
            <span className="tabular-nums text-muted-foreground">{ev.startTime}</span>
            <span className={cn(!cancelled && "text-foreground")}>{ev.title}</span>
          </button>
        );
      })}
    </div>
  );
}

// --- Kopf + Erfassen + Kontext ----------------------------------------------

function CockpitBody({ data, onExpired }: { data: StundeResponse; onExpired: () => void }) {
  const sel = data.selected!;
  const tint = sel.subjectId ? colorValue(sel.subjectColor) : NEUTRAL_COLOR;

  const [localNow, setLocalNow] = useState(jetztHM);
  useEffect(() => {
    setLocalNow(jetztHM());
    const id = setInterval(() => setLocalNow(jetztHM()), TICK_MS);
    return () => clearInterval(id);
  }, [sel.refId]);

  const restLeft = sel.endTime ? minutesLeft(sel.endTime, localNow) : 0;
  const restUntil = minutesUntil(sel.startTime, localNow);
  const progress = sel.endTime ? lessonProgress(sel.startTime, sel.endTime, localNow) : 0;

  // Ist die laufende Stunde vorbei bzw. die naechste inzwischen angefangen,
  // laedt das Cockpit neu -- dort entscheidet der Server, was jetzt gilt.
  useEffect(() => {
    if (data.modus === "live" && restLeft <= 0) onExpired();
    if ((data.modus === "vor" || data.modus === "pause") && restUntil <= 0) onExpired();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localNow]);

  // Nur das Zustandswort steht in Versalien, der Rest liest sich normal
  // gesetzt schneller (gleiche Regel wie frueher im Vollbild-Stundenmodus).
  const [statusWort, statusRest] =
    data.modus === "live"
      ? ["Läuft", `noch ${restLeft} min`]
      : data.modus === "vor" || data.modus === "pause"
        ? ["Beginnt", `in ${restUntil} min`]
        : ["Vorbei", `${sel.startTime}${sel.endTime ? ` bis ${sel.endTime}` : ""}`];

  const [neu, setNeu] = useState<AssignmentDTO[]>([]);
  const [faellig, setFaellig] = useState(data.faellig);
  useEffect(() => setFaellig(data.faellig), [data.faellig]);
  const [ohneTermin, setOhneTermin] = useState(data.ohneTermin);
  useEffect(() => setOhneTermin(data.ohneTermin), [data.ohneTermin]);
  const [lernen, setLernen] = useState(data.lernen);
  useEffect(() => setLernen(data.lernen), [data.lernen]);

  return (
    <div className="space-y-6">
      <div>
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wide" style={{ color: tint }}>
          {data.modus === "live" && (
            <span aria-hidden className="size-2 shrink-0 rounded-full motion-safe:animate-pulse" style={{ backgroundColor: tint }} />
          )}
          <span>
            <span className="uppercase">{statusWort}</span> · {statusRest}
          </span>
        </p>
        {data.modus === "live" && (
          <div className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-full origin-left rounded-full transition-transform" style={{ transform: `scaleX(${progress})`, backgroundColor: tint }} />
          </div>
        )}
        <h1 className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight">{sel.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
          <span className="tabular-nums">
            {sel.startTime}
            {sel.endTime ? `–${sel.endTime}` : ""}
          </span>
          {sel.room && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" strokeWidth={2.25} aria-hidden />
                {sel.room}
              </span>
            </>
          )}
          {sel.teacher && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <User className="size-3" strokeWidth={2.25} aria-hidden />
                {sel.teacher}
              </span>
            </>
          )}
        </p>
        {/* Die naechste Arbeit als eine Zeile im Kopf statt als eigener Block:
            im Unterricht reicht der Hinweis, das Lernen selbst passiert auf
            /lernen. */}
        {data.naechstePruefung && sel.subjectId && (
          <Link
            href={`/lernen/${sel.subjectId}`}
            className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-md text-[13px] text-muted-foreground underline-offset-2 [touch-action:manipulation] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {data.naechstePruefung.title}{" "}
            {data.naechstePruefung.tageBis <= 0
              ? "heute"
              : data.naechstePruefung.tageBis === 1
                ? "morgen"
                : `in ${data.naechstePruefung.tageBis} Tagen`}
            , zum Lernen
            <ChevronRight className="size-3" aria-hidden />
          </Link>
        )}
      </div>

      {/* Reihenfolge folgt dem Ablauf einer Stunde: erst wird die alte
          Hausaufgabe kontrolliert (Faellig jetzt), dann wird mitgeschrieben
          und sich gemeldet (Notiz, Meldung), am Ende kommt die neue
          Hausaufgabe, und ein Tafelfoto passt jederzeit (Dateien). */}
      {(faellig.length > 0 || ohneTermin.length > 0) && (
        <Abschnitt titel="Fällig jetzt">
          <ul className="flex flex-col gap-1">
            {faellig.map((a) => (
              <FaelligRow
                key={a.id}
                a={a}
                today={data.today}
                onDone={() => setFaellig((prev) => prev.filter((x) => x.id !== a.id))}
              />
            ))}
            {/* Offen ohne Termin: gleiche Zeile, statt Datum steht "ohne Termin". */}
            {ohneTermin.map((a) => (
              <FaelligRow
                key={a.id}
                a={a}
                today={data.today}
                onDone={() => setOhneTermin((prev) => prev.filter((x) => x.id !== a.id))}
              />
            ))}
          </ul>
        </Abschnitt>
      )}

      {/* Kontext-Bereich, ohne Eintraege kein Block (SPEC.md "Bloecke in
          Pruefungen, Fokus, Cockpit"). */}
      {lernen.length > 0 && (
        <Abschnitt titel="Heute lernen">
          <div className="flex flex-col gap-3">
            {lernen.map((plan) => (
              <CockpitLernenCard key={plan.planId} plan={plan} />
            ))}
          </div>
        </Abschnitt>
      )}

      <Abschnitt titel="Notiz">
        {/* Die letzte Stunde steht zugeklappt direkt ueber der Notiz: dort
            schaut man nach, was letztes Mal dran war, bevor man weiterschreibt.
            Kein eigener Abschnitt, weil sie nur Zulieferung fuer die Notiz ist. */}
        {data.letzteNotiz && (
          <details className="group mb-1.5 rounded-lg px-2.5 py-1">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-[12.5px] text-muted-foreground [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
              Letzte Stunde, {weekdayDateLabel(data.letzteNotiz.date)}
            </summary>
            <p className="mt-1 line-clamp-6 whitespace-pre-wrap pl-5 text-[13px] leading-relaxed text-muted-foreground">
              {data.letzteNotiz.body.slice(0, 400)}
            </p>
          </details>
        )}
        <div className="rounded-xl border bg-card px-4 pt-1 pb-2 shadow-card">
          <LessonNoteField schoolBlockId={sel.refId} onSaved={() => {}} placeholder="Was kam dran?" />
        </div>
      </Abschnitt>

      <Abschnitt titel="Meldung">
        <div className="rounded-xl border bg-card px-4 pb-2 shadow-card">
          <ParticipationCounter schoolBlockId={sel.refId} onSaved={() => {}} />
        </div>
      </Abschnitt>

      <Abschnitt titel="Hausaufgabe">
        <AssignmentQuickAdd
          defaultSubjectId={sel.subjectId}
          defaultDueDate={data.naechsterTermin}
          placeholder="Was ist auf?"
          onCreated={(a) => setNeu((prev) => [a, ...prev])}
        />
        {data.naechsterTermin && (
          <p className="mt-1 px-2.5 text-[12px] text-muted-foreground">
            Fällig bis zur nächsten Stunde am {weekdayDateLabel(data.naechsterTermin)}.
          </p>
        )}
        {neu.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1 px-2.5">
            {neu.map((a) => (
              <li key={a.id} className="truncate text-[12.5px] text-muted-foreground">
                Eingetragen: {a.title}
              </li>
            ))}
          </ul>
        )}
      </Abschnitt>

      <Abschnitt titel="Dateien">
        {sel.subjectId ? (
          <SubjectFiles subjectId={sel.subjectId} />
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-4 text-center">
            <p className="text-[13px] text-muted-foreground">
              Zu „{sel.title}“ ist noch kein Fach angelegt. Notiz und Meldung hängen an der Stunde, Dateien brauchen
              ein Fach.
            </p>
            <Link
              href="/faecher"
              className="mt-2 inline-flex rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent"
            >
              Fächer abgleichen
            </Link>
          </div>
        )}
      </Abschnitt>
    </div>
  );
}

function FaelligRow({ a, today, onDone }: { a: AssignmentDTO; today: string; onDone: () => void }) {
  const [checked, setChecked] = useState(Boolean(a.completedAt));
  const toast = useToast();
  const overdue = Boolean(a.dueDate && a.dueDate < today);

  async function toggle() {
    setChecked(true);
    try {
      const res = await fetch(`/api/assignments/${a.id}/complete`, { method: "POST" });
      if (!res.ok) throw new Error();
      setTimeout(onDone, 250);
    } catch {
      setChecked(false);
      toast("Die Aufgabe konnte nicht abgehakt werden.");
    }
  }

  return (
    <li className={cn("flex items-center gap-3 rounded-lg px-2.5 py-2 transition-opacity", checked && "opacity-50")}>
      <AssignmentCheckbox checked={checked} onClick={toggle} ariaLabel={`${a.title} abhaken`} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[14px] font-medium leading-snug", checked && "line-through decoration-foreground/30")}>
          {a.title}
        </p>
      </div>
      <span className={cn("shrink-0 tabular-nums text-[12.5px]", overdue ? "text-destructive" : "text-muted-foreground")}>
        {a.dueDate ? (overdue ? overdueLabel(a.dueDate, today) : dueLabel(a.dueDate, today)) : "ohne Termin"}
      </span>
    </li>
  );
}

// --- Heute lernen --------------------------------------------------------------

function CockpitLernenCard({ plan }: { plan: LernenFuerTagEintrag }) {
  const toast = useToast();
  const [items, setItems] = useState(plan.items);

  async function toggle(item: ItemDTO) {
    const neuErledigt = item.doneAt === null;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, doneAt: neuErledigt ? new Date().toISOString() : null } : i)));
    try {
      const res = await fetch(`/api/lernen/plan/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done: neuErledigt }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, doneAt: item.doneAt } : i)));
      toast("Einheit konnte nicht aktualisiert werden.");
    }
  }

  return (
    <div className="rounded-xl border bg-card px-3.5 py-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[14px] font-medium leading-snug">{plan.examTitle}</p>
        <Link
          href={`/lernen/${plan.subjectId}/plan/${plan.assignmentId}`}
          className={cn(
            "relative shrink-0 rounded px-1 py-1 text-[12.5px] font-medium tabular-nums before:absolute before:-inset-2 before:content-[''] hover:underline",
            balkenTextFarbe(plan.sicherheit),
          )}
        >
          {plan.sicherheit}%
        </Link>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {items.map((item) => (
          <CockpitLernenEinheitZeile
            key={item.id}
            subjectId={plan.subjectId}
            assignmentId={plan.assignmentId}
            item={item}
            onToggle={toggle}
          />
        ))}
      </ul>
    </div>
  );
}

function CockpitLernenEinheitZeile({
  subjectId,
  assignmentId,
  item,
  onToggle,
}: {
  subjectId: string;
  assignmentId: string;
  item: ItemDTO;
  onToggle: (item: ItemDTO) => void;
}) {
  const erledigt = item.doneAt !== null;
  const titel = item.punktTitel ?? (item.phase === "simulation" ? "Simulation" : "Thema fehlt");
  const manuell = item.phase === "probe" || item.phase === "simulation";

  const inhalt = (
    <>
      {!manuell && (
        <button
          type="button"
          role="checkbox"
          aria-checked={erledigt}
          aria-label={erledigt ? `${titel} als offen markieren` : `${titel} als erledigt markieren`}
          onClick={() => onToggle(item)}
          className={cn(
            "relative grid size-5 shrink-0 place-items-center rounded border transition-colors before:absolute before:-inset-3 before:content-[''] [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            erledigt ? "border-primary bg-primary text-primary-foreground" : "border-border",
          )}
        >
          {erledigt && (
            <span aria-hidden className="text-[11px] leading-none">
              ✓
            </span>
          )}
        </button>
      )}
      <PhaseChip phase={item.phase} />
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", erledigt && !manuell && "text-muted-foreground line-through")}>
        {titel}
      </span>
      <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">{item.minuten} Min</span>
      {manuell && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  );

  if (manuell) {
    return (
      <li>
        <Link
          href={`/lernen/${subjectId}/plan/${assignmentId}`}
          className="flex items-center gap-2 rounded-lg px-1 py-1.5 transition-colors [touch-action:manipulation] hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {inhalt}
        </Link>
      </li>
    );
  }

  return <li className="flex items-center gap-2 px-1 py-1.5">{inhalt}</li>;
}

// --- Kleinteile --------------------------------------------------------------

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titel}</h2>
      {children}
    </section>
  );
}

function CockpitSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Wird geladen" aria-busy="true">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-7 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}
