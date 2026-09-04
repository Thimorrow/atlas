"use client";

// Themen-Seite (/lernen/[subjectId]/themen/[topicId]): Lernzettel (Markdown,
// erzeugt oder von Hand), Karten dieses Themas erzeugen/schreiben/verwalten.
// "allgemein" (topicId "allgemein" = Karten ohne Thema) hat keinen Lernzettel
// und keinen Umbenennen-Knopf -- alles andere ist identisch.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { planText, tageBisLabel } from "@/components/lernen-uebersicht";
import { LernenQuellen, type Quelle } from "@/components/lernen-quellen";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { PROSE } from "@/components/subject-notes";
import { renderMarkdown } from "@/lib/markdown";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";
import {
  type CardKind,
  type ProgressDTO,
  type StudyCardDTO,
  type SubjectDetail,
  type TopicDTO,
} from "@/lib/lernen-types";

const EASE = [0.22, 1, 0.36, 1] as const;

const KIND_BADGE: Record<CardKind, string> = { wissen: "Wissen", vokabel: "Vokabel", aufgabe: "Aufgabe" };

export function LernenThema({ subjectId, topicId }: { subjectId: string; topicId: string }) {
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
      toast("Das Thema konnte nicht geladen werden.");
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
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const isAllgemein = topicId === "allgemein";
  const thema = isAllgemein ? null : data.themen.find((t) => t.id === topicId);

  if (!isAllgemein && !thema) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
          <p className="text-[15px] font-medium">Dieses Thema gibt es nicht (mehr).</p>
          <Link
            href={`/lernen/${subjectId}`}
            className="rounded-md px-2 py-1.5 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Zum Fach
          </Link>
        </div>
      </div>
    );
  }

  return (
    <LernenThemaBody
      subjectId={subjectId}
      topicId={topicId}
      isAllgemein={isAllgemein}
      thema={thema ?? null}
      data={data}
      setData={setData}
      toast={toast}
    />
  );
}

function LernenThemaBody({
  subjectId,
  topicId,
  isAllgemein,
  thema,
  data,
  setData,
  toast,
}: {
  subjectId: string;
  topicId: string;
  isAllgemein: boolean;
  thema: SubjectDetail["themen"][number] | null;
  data: SubjectDetail;
  setData: (fn: (prev: SubjectDetail | null) => SubjectDetail | null) => void;
  toast: (message: string, variant?: "error" | "success") => void;
}) {
  const tint = colorValue(data.subject.color) || NEUTRAL_COLOR;
  const title = isAllgemein ? "Allgemein" : thema!.title;
  const progress: ProgressDTO = isAllgemein ? data.ohneThema : thema!.progress;
  const cards = data.cards.filter((c) => (isAllgemein ? c.topicId === null : c.topicId === topicId));
  const exam = thema?.assignmentId ? data.pruefungen.find((p) => p.id === thema.assignmentId) : undefined;

  function patchThema(patch: Partial<Pick<TopicDTO, "title" | "summary" | "assignmentId">>) {
    if (isAllgemein || !thema) return Promise.resolve(false);
    return fetch(`/api/lernen/themen/${thema.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { thema?: TopicDTO } | null;
        if (!res.ok || !body?.thema) throw new Error("save failed");
        setData((p) =>
          p ? { ...p, themen: p.themen.map((t) => (t.id === thema.id ? { ...t, ...body.thema! } : t)) } : p,
        );
        return true;
      })
      .catch(() => {
        toast("Das Thema konnte nicht gespeichert werden.");
        return false;
      });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={`/lernen/${subjectId}`}
          className="inline-flex items-center gap-1 rounded-md py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          {data.subject.name}
        </Link>

        {isAllgemein ? (
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        ) : (
          <TitelBearbeiten title={title} onSave={(t) => patchThema({ title: t })} />
        )}

        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${progress.total > 0 ? progress.bereit : 0}%`, backgroundColor: tint }}
            />
          </div>
          <span className="shrink-0 tabular-nums text-[12.5px] text-muted-foreground">
            {progress.bereit}% bereit · {progress.faellig} fällig
          </span>
        </div>
      </div>

      {!isAllgemein && (
        <PruefungsSelect
          pruefungen={data.pruefungen}
          exam={exam}
          onSave={(assignmentId) => patchThema({ assignmentId })}
        />
      )}

      {progress.total > 0 && (
        <div className="flex gap-2">
          <Link
            href={`/lernen/${subjectId}/session?thema=${topicId}`}
            className={cn(buttonVariants({ size: "default" }), "flex-1")}
          >
            Lernen
          </Link>
          <Link
            href={`/lernen/${subjectId}/session?thema=${topicId}&modus=probe`}
            className={cn(buttonVariants({ size: "default", variant: "outline" }), "flex-1")}
          >
            Probe
          </Link>
        </div>
      )}

      {!isAllgemein && (
        <LernzettelBlock
          subjectId={subjectId}
          topicId={thema!.id}
          summary={thema!.summary}
          subject={data.subject}
          dateien={data.dateien}
          notizen={data.notizen}
          toast={toast}
          onSaved={(summary) =>
            setData((p) => (p ? { ...p, themen: p.themen.map((t) => (t.id === thema!.id ? { ...t, summary } : t)) } : p))
          }
        />
      )}

      <KartenBlock
        subjectId={subjectId}
        topicId={isAllgemein ? null : topicId}
        subject={data.subject}
        dateien={data.dateien}
        notizen={data.notizen}
        cards={cards}
        themen={data.themen}
        toast={toast}
        onCreated={(neue) => setData((p) => (p ? { ...p, cards: [...neue, ...p.cards] } : p))}
        onUpdated={(karte) =>
          setData((p) => (p ? { ...p, cards: p.cards.map((c) => (c.id === karte.id ? karte : c)) } : p))
        }
        onDeleted={(id) => setData((p) => (p ? { ...p, cards: p.cards.filter((c) => c.id !== id) } : p))}
      />
    </div>
  );
}

// --- Titel inline bearbeiten --------------------------------------------------

function TitelBearbeiten({ title, onSave }: { title: string; onSave: (t: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    const t = value.trim();
    if (!t || saving) return;
    if (t === title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(t);
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(title);
          setEditing(true);
        }}
        className="group mt-1 flex items-center gap-1.5 rounded-md py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <Pencil aria-hidden className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <form
      className="mt-1 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setValue(title);
            setEditing(false);
          }
        }}
        spellCheck={false}
        disabled={saving}
        className="w-full rounded-md border bg-background px-2.5 py-1 text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </form>
  );
}

// --- Pruefungs-Select ----------------------------------------------------------

function PruefungsSelect({
  pruefungen,
  exam,
  onSave,
}: {
  pruefungen: SubjectDetail["pruefungen"];
  exam: SubjectDetail["pruefungen"][number] | undefined;
  onSave: (assignmentId: string | null) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  if (pruefungen.length === 0 && !exam) return null;

  return (
    <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
      <span>
        {exam ? (
          <>
            Prüfung: <span className="font-medium text-foreground">{exam.title}</span> · {tageBisLabel(exam.tageBis)}
          </>
        ) : (
          "Keine Prüfung zugeordnet"
        )}
      </span>
      <select
        value={exam?.id ?? ""}
        disabled={saving}
        onChange={async (e) => {
          setSaving(true);
          await onSave(e.target.value || null);
          setSaving(false);
        }}
        className="rounded-md border bg-background px-2.5 py-1.5 text-[16px] sm:text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <option value="">Keine</option>
        {pruefungen.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    </div>
  );
}

// --- Lernzettel -----------------------------------------------------------------

function LernzettelBlock({
  subjectId,
  topicId,
  summary,
  subject,
  dateien,
  notizen,
  toast,
  onSaved,
}: {
  subjectId: string;
  topicId: string;
  summary: string;
  subject: SubjectDetail["subject"];
  dateien: SubjectDetail["dateien"];
  notizen: SubjectDetail["notizen"];
  toast: (message: string, variant?: "error" | "success") => void;
  onSaved: (summary: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(summary);
  const [saving, setSaving] = useState(false);
  const [erzeugenOffen, setErzeugenOffen] = useState(summary === "");

  useEffect(() => setDraft(summary), [summary]);

  async function saveDraft() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/lernen/themen/${topicId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ summary: draft }),
      });
      if (!res.ok) throw new Error("save failed");
      onSaved(draft);
      setEditing(false);
    } catch {
      toast("Der Lernzettel konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lernzettel</h2>
        {summary !== "" && !editing && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md px-2 py-1 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Bearbeiten
            </button>
            <button
              type="button"
              onClick={() => setErzeugenOffen((o) => !o)}
              className="rounded-md px-2 py-1 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Neu erzeugen
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void saveDraft();
              }
            }}
            rows={10}
            className="w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setDraft(summary); setEditing(false); }} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="button" size="sm" onClick={() => void saveDraft()} disabled={saving}>
              {saving ? "Speichert …" : "Speichern"}
            </Button>
          </div>
        </div>
      ) : summary !== "" ? (
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <div className={PROSE} dangerouslySetInnerHTML={{ __html: renderMarkdown(summary) }} />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed px-4 py-6 text-center">
          <p className="text-[13px] text-muted-foreground">Noch kein Lernzettel für dieses Thema.</p>
        </div>
      )}

      {(erzeugenOffen || summary === "") && !editing && (
        <LernzettelErzeugen
          subjectId={subjectId}
          topicId={topicId}
          subject={subject}
          dateien={dateien}
          notizen={notizen}
          toast={toast}
          onCreated={(s) => {
            onSaved(s);
            setErzeugenOffen(false);
          }}
        />
      )}
    </section>
  );
}

function LernzettelErzeugen({
  subjectId,
  topicId,
  subject,
  dateien,
  notizen,
  toast,
  onCreated,
}: {
  subjectId: string;
  topicId: string;
  subject: SubjectDetail["subject"];
  dateien: SubjectDetail["dateien"];
  notizen: SubjectDetail["notizen"];
  toast: (message: string, variant?: "error" | "success") => void;
  onCreated: (summary: string) => void;
}) {
  const [quelle, setQuelle] = useState<Quelle>("notizen");
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [noteIds, setNoteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/lernen/themen/${topicId}/lernzettel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quelle,
          fileIds: quelle === "dateien" || quelle === "alles" ? fileIds : undefined,
          noteIds: quelle === "notizen" || quelle === "alles" ? noteIds : undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { thema?: { summary: string }; hinweis?: string; error?: string }
        | null;
      if (res.status === 503) {
        toast(body?.error ?? "Der Bot ist nicht eingerichtet.");
        return;
      }
      if (!res.ok || !body?.thema) {
        toast(body?.error ?? "Der Lernzettel konnte nicht erzeugt werden.");
        return;
      }
      onCreated(body.thema.summary);
      if (body.hinweis) toast(body.hinweis, "success");
    } catch {
      toast("Der Lernzettel konnte nicht erzeugt werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-card">
      <p className="text-[13px] font-medium">Lernzettel aus Notizen/Dateien erzeugen</p>
      <LernenQuellen
        subject={subject}
        dateien={dateien}
        notizen={notizen}
        quelle={quelle}
        onQuelleChange={setQuelle}
        fileIds={fileIds}
        onFileIdsChange={setFileIds}
        noteIds={noteIds}
        onNoteIdsChange={setNoteIds}
      />
      <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={() => void submit()}>
        {loading ? "Erzeugt … das dauert bis zu einer Minute" : "Erzeugen"}
      </Button>
    </div>
  );
}

// --- Karten ------------------------------------------------------------------

function KartenBlock({
  subjectId,
  topicId,
  subject,
  dateien,
  notizen,
  cards,
  themen,
  toast,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  subjectId: string;
  topicId: string | null;
  subject: SubjectDetail["subject"];
  dateien: SubjectDetail["dateien"];
  notizen: SubjectDetail["notizen"];
  cards: StudyCardDTO[];
  themen: SubjectDetail["themen"];
  toast: (message: string, variant?: "error" | "success") => void;
  onCreated: (cards: StudyCardDTO[]) => void;
  onUpdated: (card: StudyCardDTO) => void;
  onDeleted: (id: string) => void;
}) {
  const [offen, setOffen] = useState<"erzeugen" | "schreiben" | null>(cards.length === 0 ? "erzeugen" : null);

  return (
    <section className="space-y-2">
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
        <KartenErzeugen
          subjectId={subjectId}
          topicId={topicId}
          subject={subject}
          dateien={dateien}
          notizen={notizen}
          toast={toast}
          onCreated={(neue) => {
            onCreated(neue);
            toast(`${neue.length} ${neue.length === 1 ? "Karte" : "Karten"} erzeugt`, "success");
            setOffen(null);
          }}
        />
      )}

      {offen === "schreiben" && (
        <KarteSchreiben subjectId={subjectId} topicId={topicId} toast={toast} onCreated={onCreated ? (c) => onCreated([c]) : () => {}} />
      )}

      <h2 className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Karten ({cards.length})
      </h2>
      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
          Noch keine Karten. Erzeuge welche oder schreib selbst eine.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {cards.map((c) => (
            <KartenZeile
              key={c.id}
              card={c}
              themen={themen}
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

function KartenErzeugen({
  subjectId,
  topicId,
  subject,
  dateien,
  notizen,
  toast,
  onCreated,
}: {
  subjectId: string;
  topicId: string | null;
  subject: SubjectDetail["subject"];
  dateien: SubjectDetail["dateien"];
  notizen: SubjectDetail["notizen"];
  toast: (message: string, variant?: "error" | "success") => void;
  onCreated: (cards: StudyCardDTO[]) => void;
}) {
  const [quelle, setQuelle] = useState<Quelle>("notizen");
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [noteIds, setNoteIds] = useState<string[]>([]);
  const [kind, setKind] = useState<CardKind | undefined>(undefined);
  const [anzahl, setAnzahl] = useState(12);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/lernen/generieren", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId,
          topicId: topicId ?? undefined,
          quelle,
          fileIds: quelle === "dateien" || quelle === "alles" ? fileIds : undefined,
          noteIds: quelle === "notizen" || quelle === "alles" ? noteIds : undefined,
          anzahl,
          kind,
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
      if (body.hinweis) toast(body.hinweis, "success");
    } catch {
      toast("Die Karten konnten nicht erzeugt werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4 shadow-card">
      <h2 className="text-[13px] font-semibold">Karten erzeugen</h2>
      <div className="mt-3 space-y-3">
        <LernenQuellen
          subject={subject}
          dateien={dateien}
          notizen={notizen}
          quelle={quelle}
          onQuelleChange={setQuelle}
          fileIds={fileIds}
          onFileIdsChange={setFileIds}
          noteIds={noteIds}
          onNoteIdsChange={setNoteIds}
          kind={kind}
          onKindChange={setKind}
          anzahl={anzahl}
          onAnzahlChange={setAnzahl}
        />
        <Button type="button" variant="outline" disabled={loading} className="w-full" onClick={() => void submit()}>
          {loading ? "Erzeugt … das dauert bis zu einer Minute" : "Erzeugen"}
        </Button>
      </div>
    </section>
  );
}

function KarteSchreiben({
  subjectId,
  topicId,
  toast,
  onCreated,
}: {
  subjectId: string;
  topicId: string | null;
  toast: (message: string, variant?: "error" | "success") => void;
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
        body: JSON.stringify({ subjectId, topicId: topicId ?? undefined, question: q, answer: answer.trim() }),
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

function KartenZeile({
  card,
  themen,
  toast,
  onUpdated,
  onDeleted,
}: {
  card: StudyCardDTO;
  themen: SubjectDetail["themen"];
  toast: (message: string, variant?: "error" | "success") => void;
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

  async function moveTo(topicId: string) {
    try {
      const res = await fetch(`/api/lernen/karten/${card.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topicId: topicId === "allgemein" ? null : topicId }),
      });
      const body = (await res.json().catch(() => null)) as { card?: StudyCardDTO; error?: string } | null;
      if (!res.ok || !body?.card) throw new Error("move failed");
      onUpdated(body.card);
    } catch {
      toast("Die Karte konnte nicht verschoben werden.");
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
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            aria-label="Frage"
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={2}
            aria-label="Antwort"
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
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
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {KIND_BADGE[card.kind]}
        </span>
      </button>
      <div className="flex items-center justify-end gap-1 px-3 pb-2">
        {themen.length > 0 && (
          <select
            value={card.topicId ?? "allgemein"}
            onChange={(e) => void moveTo(e.target.value)}
            aria-label="Thema verschieben"
            className="mr-auto rounded-md border bg-background px-2 py-1 text-[16px] sm:text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="allgemein">Allgemein</option>
            {themen.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}
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
