"use client";

// Fach-Seite des Lernbereichs (/lernen/[subjectId]): Fortschritt, Karten
// erzeugen (per Bot), Karte schreiben, alle Karten mit Bearbeiten/Loeschen.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { planText } from "@/components/lernen-uebersicht";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import { isDue, MASTERED_BOX } from "@/lib/lernen";
import { cn } from "@/lib/utils";
import type { SubjectDetail } from "@/lib/study-store";
import type { StudyCardDTO } from "@/lib/study-store";

const EASE = [0.22, 1, 0.36, 1] as const;

type Quelle = "notizen" | "dateien" | "lehrplan" | "alles";

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

  return (
    <LernenFachBody
      subjectId={subjectId}
      data={data}
      setData={setData}
      tint={tint}
      toast={toast}
    />
  );
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
  toast: (message: string) => void;
}) {
  const { subject, cards, progress, faellig, naechstePruefung, plan, dateien } = data;
  const [offen, setOffen] = useState<"erzeugen" | "schreiben" | null>(cards.length === 0 ? "erzeugen" : null);

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
            : "Keine Prüfung eingetragen"}
        </p>
      </div>

      <FortschrittBalken progress={progress} tint={tint} />

      {progress.total > 0 && (
        <Link
          href={`/lernen/${subjectId}/session`}
          className={cn(buttonVariants({ size: "default" }), "w-full")}
        >
          {faellig > 0 ? `Lernen starten · ${faellig} fällig` : "Wiederholen"}
        </Link>
      )}

      {/* Die beiden Wege, an Karten zu kommen, stehen als zwei ruhige Schalter
          nebeneinander statt als zwei offene Formulare. Ohne Karten ist
          "erzeugen" von selbst offen: das ist dann der eine naechste Schritt. */}
      <div>
        <div className="flex gap-2" role="group" aria-label="Karten hinzufügen">
          <Button
            type="button"
            variant={offen === "erzeugen" ? "secondary" : "outline"}
            aria-expanded={offen === "erzeugen"}
            onClick={() => setOffen(offen === "erzeugen" ? null : "erzeugen")}
            className="flex-1"
          >
            Karten erzeugen
          </Button>
          <Button
            type="button"
            variant={offen === "schreiben" ? "secondary" : "outline"}
            aria-expanded={offen === "schreiben"}
            onClick={() => setOffen(offen === "schreiben" ? null : "schreiben")}
            className="flex-1"
          >
            Karte schreiben
          </Button>
        </div>

        {offen === "erzeugen" && (
          <div className="mt-3">
            <KartenErzeugen
              subjectId={subjectId}
              subject={subject}
              dateien={dateien}
              toast={toast}
              onCreated={(neue) => {
                setData((prev) => (prev ? { ...prev, cards: [...neue, ...prev.cards] } : prev));
                toast(`${neue.length} ${neue.length === 1 ? "Karte" : "Karten"} erzeugt`);
                setOffen(null);
              }}
            />
          </div>
        )}

        {offen === "schreiben" && (
          <div className="mt-3">
            <KarteSchreiben
              subjectId={subjectId}
              toast={toast}
              onCreated={(karte) => {
                setData((prev) => (prev ? { ...prev, cards: [karte, ...prev.cards] } : prev));
              }}
            />
          </div>
        )}
      </div>

      <KartenListe
        cards={cards}
        toast={toast}
        onUpdated={(karte) => {
          setData((prev) =>
            prev ? { ...prev, cards: prev.cards.map((c) => (c.id === karte.id ? karte : c)) } : prev,
          );
        }}
        onDeleted={(id) => {
          setData((prev) => (prev ? { ...prev, cards: prev.cards.filter((c) => c.id !== id) } : prev));
        }}
      />
    </div>
  );
}

function tageBisLabel(tageBis: number): string {
  if (tageBis <= 0) return "heute";
  if (tageBis === 1) return "morgen";
  return `in ${tageBis} Tagen`;
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

// --- Karten erzeugen ---------------------------------------------------------

function KartenErzeugen({
  subjectId,
  subject,
  dateien,
  toast,
  onCreated,
}: {
  subjectId: string;
  subject: SubjectDetail["subject"];
  dateien: SubjectDetail["dateien"];
  toast: (message: string) => void;
  onCreated: (cards: StudyCardDTO[]) => void;
}) {
  const uid = useId();
  const [quelle, setQuelle] = useState<Quelle>("notizen");
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [thema, setThema] = useState("");
  const [anzahl, setAnzahl] = useState(12);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/lernen/generieren", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId,
          quelle,
          fileIds: quelle === "dateien" ? fileIds : undefined,
          anzahl,
          thema: thema.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { cards?: StudyCardDTO[]; hinweis?: string; error?: string }
        | null;
      if (res.status === 503) {
        toast(body?.error ?? "Der Bot ist nicht eingerichtet.");
        return;
      }
      if (!res.ok || !body) {
        toast(body?.error ?? "Die Karten konnten nicht erzeugt werden.");
        return;
      }
      if ((body.cards?.length ?? 0) === 0) {
        toast(body.hinweis ?? "Es konnten keine Karten erzeugt werden.");
        return;
      }
      onCreated(body.cards!);
      if (body.hinweis) toast(body.hinweis);
    } catch {
      toast("Die Karten konnten nicht erzeugt werden.");
    } finally {
      setLoading(false);
    }
  }

  function toggleFile(id: string) {
    setFileIds((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  return (
    <section className="rounded-xl border bg-card p-4 shadow-card">
      <h2 className="text-[13px] font-semibold">Karten erzeugen</h2>
      <form className="mt-3 space-y-3" onSubmit={submit}>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Quelle</legend>
          {(
            [
              { value: "notizen", label: "Notizen" },
              { value: "dateien", label: "Dateien", hidden: dateien.length === 0 },
              { value: "lehrplan", label: "Lehrplan", hidden: !subject.curriculum },
              { value: "alles", label: "Alles" },
            ] as { value: Quelle; label: string; hidden?: boolean }[]
          )
            .filter((o) => !o.hidden)
            .map((o) => (
              <label
                key={o.value}
                className={cn(
                  "relative flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors [touch-action:manipulation] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                  quelle === o.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent",
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-quelle`}
                  value={o.value}
                  checked={quelle === o.value}
                  onChange={() => setQuelle(o.value)}
                  className="peer sr-only"
                />
                {o.label}
              </label>
            ))}
        </fieldset>

        {quelle === "dateien" && dateien.length > 0 && (
          <ul className="space-y-1 rounded-lg border p-2">
            {dateien.map((f) => (
              <li key={f.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={fileIds.includes(f.id)}
                    onChange={() => toggleFile(f.id)}
                    className="size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div>
          <label htmlFor={`${uid}-thema`} className="mb-1 block text-[12.5px] font-medium text-muted-foreground">
            Thema (optional)
          </label>
          <input
            id={`${uid}-thema`}
            type="text"
            value={thema}
            onChange={(e) => setThema(e.target.value)}
            spellCheck={false}
            className="w-full rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="z. B. Photosynthese"
          />
        </div>

        <div>
          <label htmlFor={`${uid}-anzahl`} className="mb-1 block text-[12.5px] font-medium text-muted-foreground">
            Anzahl
          </label>
          <select
            id={`${uid}-anzahl`}
            value={anzahl}
            onChange={(e) => setAnzahl(Number(e.target.value))}
            className="w-full rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={8}>8</option>
            <option value={12}>12</option>
            <option value={20}>20</option>
          </select>
        </div>

        <Button type="submit" variant="outline" disabled={loading} className="w-full">
          {loading ? "Erzeugt … das dauert bis zu einer Minute" : "Erzeugen"}
        </Button>
      </form>
    </section>
  );
}

// --- Karte schreiben ----------------------------------------------------------

function KarteSchreiben({
  subjectId,
  toast,
  onCreated,
}: {
  subjectId: string;
  toast: (message: string) => void;
  onCreated: (card: StudyCardDTO) => void;
}) {
  const uid = useId();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const questionRef = useRef<HTMLTextAreaElement | null>(null);

  async function submit() {
    const q = question.trim();
    if (!q || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/lernen/karten", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectId, question: q, answer: answer.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { card?: StudyCardDTO; error?: string } | null;
      if (!res.ok || !body?.card) {
        toast(body?.error ?? "Die Karte konnte nicht gespeichert werden.");
        return;
      }
      onCreated(body.card);
      setQuestion("");
      setAnswer("");
      questionRef.current?.focus();
    } catch {
      toast("Die Karte konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4 shadow-card">
      <h2 className="text-[13px] font-semibold">Karte schreiben</h2>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label htmlFor={`${uid}-frage`} className="mb-1 block text-[12.5px] font-medium text-muted-foreground">
            Frage
          </label>
          <textarea
            ref={questionRef}
            id={`${uid}-frage`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-antwort`} className="mb-1 block text-[12.5px] font-medium text-muted-foreground">
            Antwort
          </label>
          <textarea
            id={`${uid}-antwort`}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button type="submit" variant="outline" disabled={saving || !question.trim()} className="w-full">
          {saving ? "Speichert …" : "Speichern"}
        </Button>
      </form>
    </section>
  );
}

// --- Alle Karten ---------------------------------------------------------------

function KartenListe({
  cards,
  toast,
  onUpdated,
  onDeleted,
}: {
  cards: StudyCardDTO[];
  toast: (message: string) => void;
  onUpdated: (card: StudyCardDTO) => void;
  onDeleted: (id: string) => void;
}) {
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;

  return (
    <section>
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Alle Karten ({cards.length})
      </h2>
      {cards.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
          Noch keine Karten. Erzeuge welche aus deinen Notizen oder schreib selbst eine.
        </p>
      ) : (
        <ul className="mt-2 divide-y rounded-xl border">
          {cards.map((c) => (
            <KartenZeile
              key={c.id}
              card={c}
              todayISO={todayISO}
              toast={toast}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function KartenZeile({
  card,
  todayISO,
  toast,
  onUpdated,
  onDeleted,
}: {
  card: StudyCardDTO;
  todayISO: string;
  toast: (message: string) => void;
  onUpdated: (card: StudyCardDTO) => void;
  onDeleted: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(card.question);
  const [answer, setAnswer] = useState(card.answer);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const badge = card.reviews === 0 ? "Neu" : card.box >= MASTERED_BOX ? "Sicher" : `Box ${card.box}`;
  const faellig = isDue(card, todayISO);

  async function saveEdit() {
    const q = question.trim();
    if (!q || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/lernen/karten/${card.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, answer }),
      });
      const body = (await res.json().catch(() => null)) as { card?: StudyCardDTO; error?: string } | null;
      if (!res.ok || !body?.card) {
        toast(body?.error ?? "Die Karte konnte nicht gespeichert werden.");
        return;
      }
      onUpdated(body.card);
      setEditing(false);
    } catch {
      toast("Die Karte konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/lernen/karten/${card.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      onDeleted(card.id);
      setPendingDelete(false);
    } catch {
      toast("Die Karte konnte nicht gelöscht werden.");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!pendingDelete) return;
    const t = window.setTimeout(() => cancelRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [pendingDelete]);

  if (editing) {
    return (
      <li className="px-3 py-3">
        <div className="space-y-2">
          <div>
            <label htmlFor={`${uid}-frage`} className="sr-only">
              Frage
            </label>
            <textarea
              id={`${uid}-frage`}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label htmlFor={`${uid}-antwort`} className="sr-only">
              Antwort
            </label>
            <textarea
              id={`${uid}-antwort`}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setQuestion(card.question);
                setAnswer(card.answer);
              }}
              disabled={saving}
            >
              Abbrechen
            </Button>
            <Button type="button" size="sm" onClick={() => void saveEdit()} disabled={saving || !question.trim()}>
              {saving ? "Speichert …" : "Speichern"}
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium">{card.question}</p>
          <p className={cn("text-[13px] text-muted-foreground", !open && "line-clamp-3")}>{card.answer}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium",
              faellig ? "border-primary/40 text-primary" : "text-muted-foreground",
            )}
          >
            {badge}
            {faellig ? " · fällig" : ""}
          </span>
        </div>
      </button>
      <div className="flex items-center justify-end gap-1 px-3 pb-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Karte bearbeiten"
          className="relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setPendingDelete(true)}
          aria-label="Karte löschen"
          className="relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <AnimatePresence>
        {pendingDelete && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              onClick={() => !deleting && setPendingDelete(false)}
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={`${uid}-confirm`}
              onKeyDown={(e) => {
                if (e.key === "Escape" && !deleting) {
                  e.stopPropagation();
                  setPendingDelete(false);
                }
              }}
              initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="relative w-full max-w-sm rounded-t-2xl border bg-card p-5 shadow-popover sm:rounded-2xl"
            >
              <h3 id={`${uid}-confirm`} className="text-[15px] font-semibold tracking-tight">
                Karte löschen?
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Die Karte wird endgültig entfernt. Das lässt sich nicht rückgängig machen.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  ref={cancelRef}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingDelete(false)}
                  disabled={deleting}
                >
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void confirmDelete()}
                  disabled={deleting}
                  className="bg-destructive text-background hover:bg-destructive/90"
                >
                  {deleting ? "Löscht …" : "Löschen"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </li>
  );
}
