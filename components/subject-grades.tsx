"use client";

// Der Noten-Abschnitt der Fach-Detailseite: Schnitt, Liste, Eintragen.
//
// Gerechnet wird im Client mit derselben Funktion wie auf dem Server
// (lib/grades.ts). Das ist Absicht: der Schnitt steht damit sofort nach dem
// Eintragen richtig da, ohne eine zweite Runde zum Server -- und er kann nicht
// von der Serverantwort abweichen, weil es nur eine Rechnung gibt.

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import {
  KIND_LABEL,
  ORAL_WEIGHT_LABEL,
  ORAL_WEIGHT_PRESETS,
  POINTS_MAX,
  POINTS_MIN,
  formatPoints,
  pointsToGradeLabel,
  subjectAverage,
  type GradeAverage,
  type GradeKind,
} from "@/lib/grades";
import type { GradeDTO } from "@/lib/grade-store";
import { cn } from "@/lib/utils";

// 16px ist Pflicht, nicht Geschmack: iOS-Safari zoomt beim Fokus in jedes Feld
// darunter hinein und schiebt das halbe Formular aus dem Bild.
const FIELD =
  "h-11 w-full rounded-lg border bg-background px-3 text-[16px] transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const LABEL = "mb-1.5 block text-[13px] font-medium text-muted-foreground";

// Alle 16 Punktwerte mit der Note dahinter. Ein Auswahlfeld statt eines
// Zahlenfelds, weil es auf dem Handy ein Tippen ist statt Tastatur plus
// Zielen -- und weil ein ungueltiger Wert so gar nicht erst entstehen kann.
const POINT_OPTIONS = Array.from({ length: POINTS_MAX - POINTS_MIN + 1 }, (_, i) => POINTS_MAX - i);

// Gewichtung einer einzelnen Note. Bewusst vier benannte Faelle statt eines
// freien Zahlenfelds: mehr Abstufungen gibt eine Schulnote nicht her.
const WEIGHT_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Einfach" },
  { value: 2, label: "Doppelt" },
  { value: 0.5, label: "Halb" },
  { value: 0, label: "Zählt nicht" },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

export function SubjectGrades({
  subjectId,
  initialGrades,
  initialOralWeight,
}: {
  subjectId: string;
  initialGrades: GradeDTO[];
  initialOralWeight: number;
}) {
  const toast = useToast();
  const [grades, setGrades] = useState<GradeDTO[]>(initialGrades);
  const [oralWeight, setOralWeight] = useState(initialOralWeight);
  const [composing, setComposing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const summary = useMemo(() => subjectAverage(grades, oralWeight), [grades, oralWeight]);

  async function changeOralWeight(next: number) {
    const previous = oralWeight;
    setOralWeight(next); // Der Schnitt steht sofort neu da.
    try {
      const res = await fetch(`/api/subjects/${subjectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oralWeight: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setOralWeight(previous);
      toast("Die Gewichtung konnte nicht gespeichert werden.");
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/grades/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setGrades((prev) => prev.filter((g) => g.id !== id));
    } catch {
      toast("Die Note konnte nicht gelöscht werden.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <AverageBlock summary={summary} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="shrink-0">Gewichtung</span>
          <select
            // 16px, sonst zoomt iOS-Safari beim Antippen in die Seite hinein.
            aria-label="Gewichtung mündlich zu schriftlich"
            className="h-9 rounded-lg border bg-background px-2 text-[16px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            value={oralWeight}
            onChange={(e) => void changeOralWeight(Number(e.target.value))}
          >
            {ORAL_WEIGHT_PRESETS.map((w) => (
              <option key={w} value={w}>
                {ORAL_WEIGHT_LABEL[w]}
              </option>
            ))}
          </select>
        </label>
        {!composing && (
          <Button size="sm" onClick={() => setComposing(true)}>
            <Plus className="size-4" />
            Note eintragen
          </Button>
        )}
      </div>

      {composing && (
        <GradeForm
          subjectId={subjectId}
          onCancel={() => setComposing(false)}
          onSaved={(grade) => {
            // Neueste zuerst, wie die Serverliste sortiert ist.
            setGrades((prev) =>
              [grade, ...prev].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
            );
            setComposing(false);
          }}
        />
      )}

      {grades.length === 0 ? (
        !composing && (
          <p className="text-[13px] text-muted-foreground">
            Noch keine Note eingetragen. Trag deine erste Klausur oder mündliche Note ein, dann
            steht hier dein Schnitt.
          </p>
        )
      ) : (
        <ul className="divide-y">
          {grades.map((g) => (
            <li key={g.id} className="flex items-center gap-3 py-2.5">
              {/* Die Punktzahl ist die Zahl, nach der gesucht wird -- sie steht
                  links und in fester Breite, damit die Spalte nicht zittert. */}
              <span className="w-9 shrink-0 text-right text-[15px] font-semibold tabular-nums">
                {g.points}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium leading-tight">{g.label}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                  <span>{KIND_LABEL[g.kind]}</span>
                  <span aria-hidden="true" className="opacity-50">
                    ·
                  </span>
                  <span className="tabular-nums">{formatDate(g.date)}</span>
                  {g.weight !== 1 && (
                    <>
                      <span aria-hidden="true" className="opacity-50">
                        ·
                      </span>
                      <span>
                        {WEIGHT_OPTIONS.find((w) => w.value === g.weight)?.label ??
                          `${g.weight}-fach`}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[12px] font-semibold tabular-nums">
                {g.grade}
              </span>
              <button
                type="button"
                onClick={() => void remove(g.id)}
                disabled={busyId === g.id}
                aria-label={`Note „${g.label}“ löschen`}
                // Die Trefferflaeche reicht ueber das Symbol hinaus (before),
                // sonst sind es auf dem Handy 16 statt 44 Pixel.
                className="relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                {busyId === g.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Der Schnitt als eine grosse Zahl, alles andere leise darunter: es gibt genau
// einen Wert, den der Nutzer hier sucht.
function AverageBlock({
  summary,
}: {
  summary: { average: GradeAverage | null; oral: GradeAverage | null; written: GradeAverage | null };
}) {
  if (!summary.average) {
    return (
      <div className="rounded-xl border bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground">
        Noch kein Schnitt
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-muted/30 px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums">
          {formatPoints(summary.average.points)}
        </span>
        <span className="text-[13px] text-muted-foreground">Punkte</span>
        <span className="text-[13px] text-muted-foreground">·</span>
        <span className="text-[15px] font-medium">Note {summary.average.label}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] tabular-nums text-muted-foreground">
        <span>
          {KIND_LABEL.oral}: {summary.oral ? formatPoints(summary.oral.points) : "–"}
        </span>
        <span>
          {KIND_LABEL.written}: {summary.written ? formatPoints(summary.written.points) : "–"}
        </span>
      </div>
    </div>
  );
}

// Inline statt Overlay: auf dem Handy spart das den Dialog, das Sperren des
// Hintergrunds und den Rueckweg -- vier Felder passen unter den Schnitt.
function GradeForm({
  subjectId,
  onCancel,
  onSaved,
}: {
  subjectId: string;
  onCancel: () => void;
  onSaved: (grade: GradeDTO) => void;
}) {
  const toast = useToast();
  const [points, setPoints] = useState(POINTS_MAX - 4); // 11 Punkte, eine glatte 2
  const [kind, setKind] = useState<GradeKind>("written");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState(1);
  const [saving, setSaving] = useState(false);
  // Erst nach dem Absenden meckern, nicht beim ersten Buchstaben.
  const [showError, setShowError] = useState(false);

  const trimmed = label.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!trimmed) {
      setShowError(true);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/grades`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ points, kind, label: trimmed, date, weight }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Speichern fehlgeschlagen");
      onSaved(json.grade as GradeDTO);
    } catch (e) {
      // Das Formular bleibt stehen, damit die Eingaben nicht verloren gehen.
      toast((e as Error).message || "Die Note konnte nicht gespeichert werden.");
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="space-y-3 rounded-xl border bg-muted/20 p-4"
      aria-label="Note eintragen"
    >
      {/* Punkte ueber die volle Breite: das wichtigste Feld, und die Option
          "12 — Note 2+" wird in einer halben Spalte auf 390px abgeschnitten. */}
      <div>
        <label className={LABEL} htmlFor="grade-points">
          Punkte
        </label>
        <select
          id="grade-points"
          className={FIELD}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
        >
          {POINT_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p} — Note {pointsToGradeLabel(p)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="grade-kind">
            Art
          </label>
          <select
            id="grade-kind"
            className={FIELD}
            value={kind}
            onChange={(e) => setKind(e.target.value as GradeKind)}
          >
            <option value="written">{KIND_LABEL.written}</option>
            <option value="oral">{KIND_LABEL.oral}</option>
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="grade-weight">
            Gewichtung
          </label>
          <select
            id="grade-weight"
            className={FIELD}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
          >
            {WEIGHT_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="grade-label">
          Bezeichnung
        </label>
        <input
          id="grade-label"
          className={cn(FIELD, showError && !trimmed && "border-destructive")}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            if (showError) setShowError(false);
          }}
          placeholder="Klausur 1"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={showError && !trimmed}
          aria-describedby={showError && !trimmed ? "grade-label-error" : undefined}
        />
        {showError && !trimmed && (
          <p id="grade-label-error" className="mt-1.5 text-[12px] text-destructive">
            Gib der Note einen Namen, etwa „Klausur 1“ oder „Referat“.
          </p>
        )}
      </div>

      {/* Auch das Datumsfeld braucht die volle Breite -- in einer halben
          Spalte schneidet Safari die Jahreszahl ab. */}
      <div>
        <label className={LABEL} htmlFor="grade-date">
          Datum
        </label>
        <input
          id="grade-date"
          type="date"
          className={FIELD}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="size-4" />
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saving ? "Speichert …" : "Note speichern"}
        </Button>
      </div>
    </form>
  );
}
