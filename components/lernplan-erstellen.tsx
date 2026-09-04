"use client";

// Erstell-Seite des Lernplans, vier Schritte: Material, Punkte pruefen,
// Diagnosetest, Plan erstellen. Siehe SPEC.md "Erstell-Seite". Der Entwurf
// liegt in sessionStorage unter lernplan-entwurf:<assignmentId>, bis der Plan
// gespeichert oder verworfen ist -- Reload und Tab-Wechsel verlieren nichts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { localISO } from "@/lib/assignments-view";
import { verkleinereBild } from "@/lib/bild-verkleinern";
import { ladeDateiInFachHoch } from "@/lib/datei-upload";
import { ACCEPT_ATTR, ACCEPTED_TYPES } from "@/lib/file-limits";
import type { CheckDraft, PlanDTO, PunktDraft } from "@/lib/lernplan-types";

const LESEN_TIMEOUT = 90_000;
const BEWERTEN_TIMEOUT = 60_000;
const STORAGE_PREFIX = "lernplan-entwurf:";
const MAX_TEXT = 8000;

type Datei = { id: string; name: string; contentType: string };
type ChecklistMode = "upload" | "fach" | "text";
// Punkte tragen im Entwurf einen lokalen Schluessel fuer stabile Keys/Merge/
// Loeschen -- die Server-Form (PunktDraft) kennt keine ID, bis der Plan steht.
type PunktLokal = PunktDraft & { key: string };

type Entwurf = {
  checklistMode: ChecklistMode;
  checklistFileId: string | null;
  checklistFileName: string | null;
  checklistText: string;
  fileIds: string[];
  minutesWeekday: number;
  minutesWeekend: number;
  checklisteText: string;
  punkte: PunktLokal[];
  antworten: Record<string, string | null>;
  checks: CheckDraft[] | null;
};

function neuerSchluessel(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function leererEntwurf(): Entwurf {
  return {
    checklistMode: "upload",
    checklistFileId: null,
    checklistFileName: null,
    checklistText: "",
    fileIds: [],
    minutesWeekday: 30,
    minutesWeekend: 60,
    checklisteText: "",
    punkte: [],
    antworten: {},
    checks: null,
  };
}

const FEHLER_TEXT: Record<string, string> = {
  dateien_fremd: "Eine der Dateien gehoert nicht zu diesem Fach.",
  datei_laden: "Eine Datei konnte nicht geladen werden.",
  datei_nicht_lesbar: "Eine Datei kann nicht gelesen werden.",
  pdf_ohne_text: "Das PDF enthaelt keinen Text. Als Foto hochladen oder Text einfuegen.",
  modell: "Das Modell hat nicht geantwortet.",
  keine_punkte: "Keine Punkte erkannt. Text pruefen und erneut versuchen.",
  speichern: "Der Plan konnte nicht gespeichert werden.",
  pruefung: "Diese Pruefung gibt es nicht mehr.",
  keine_tage: "Bis zur Pruefung sind keine Tage mehr.",
  plan_gerade_erstellt: "Der Plan wurde gerade erstellt.",
};

function fehlerNachricht(code: string | undefined, hinweis: string | string[] | undefined): string {
  if (typeof hinweis === "string" && hinweis) return hinweis;
  if (Array.isArray(hinweis) && hinweis.length > 0) return hinweis[0];
  if (code && FEHLER_TEXT[code]) return FEHLER_TEXT[code];
  return "Das hat nicht geklappt.";
}

async function ladeMitTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// --- Datei-Upload direkt ins Fach, siehe lib/datei-upload.ts ----------------

async function uploadZuFach(subjectId: string, file: File): Promise<Datei> {
  return ladeDateiInFachHoch(subjectId, file);
}

async function bildFallsNoetigVerkleinern(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    return await verkleinereBild(file);
  } catch (e) {
    throw new Error(e instanceof Error && e.message === "Bild zu gross" ? "Bild zu gross" : "Das Bild konnte nicht verarbeitet werden.");
  }
}

export function LernplanErstellen({
  subjectId,
  assignmentId,
  initialSchritt,
}: {
  subjectId: string;
  assignmentId: string;
  initialSchritt: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const storageKey = `${STORAGE_PREFIX}${assignmentId}`;

  const [schritt, setSchrittState] = useState(initialSchritt);
  useEffect(() => setSchrittState(initialSchritt), [initialSchritt]);

  const gehe = useCallback(
    (n: number) => {
      setSchrittState(n);
      router.push(`/lernen/${subjectId}/plan/${assignmentId}/neu?schritt=${n}`, { scroll: false });
    },
    [router, subjectId, assignmentId],
  );

  // --- Voraussetzungen -------------------------------------------------------
  const [gate, setGate] = useState<"laden" | "ok" | "fehlt">("laden");
  const [gateGrund, setGateGrund] = useState("");
  const [assignment, setAssignment] = useState<{ id: string; title: string; dueDate: string | null } | null>(null);
  const [dateien, setDateien] = useState<Datei[]>([]);
  const [bestehenderPlan, setBestehenderPlan] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [aRes, sRes, pRes] = await Promise.all([
          fetch(`/api/assignments?subjectId=${subjectId}`),
          fetch(`/api/lernen/${subjectId}`),
          fetch(`/api/lernen/plan/${assignmentId}`),
        ]);
        if (!alive) return;
        if (!aRes.ok || !sRes.ok) throw new Error("laden");
        const aData = (await aRes.json()) as {
          assignments: { id: string; title: string; dueDate: string | null; subjectId: string | null }[];
        };
        const sData = (await sRes.json()) as { dateien: Datei[]; botEnabled: boolean };
        const found = aData.assignments.find((a) => a.id === assignmentId) ?? null;
        setDateien(sData.dateien);
        setBestehenderPlan(pRes.status === 200);

        if (!found) {
          setGateGrund("Diese Pruefung gibt es nicht (mehr).");
          setGate("fehlt");
        } else if (!found.subjectId) {
          setGateGrund("Diese Pruefung hat kein Fach.");
          setGate("fehlt");
        } else if (!found.dueDate || found.dueDate <= localISO()) {
          setGateGrund("Bis zur Pruefung sind keine Tage mehr.");
          setGate("fehlt");
        } else if (!sData.botEnabled) {
          setGateGrund("Die KI ist nicht eingerichtet, ein Lernplan laesst sich gerade nicht erstellen.");
          setGate("fehlt");
        } else {
          setAssignment({ id: found.id, title: found.title, dueDate: found.dueDate });
          setGate("ok");
        }
      } catch {
        if (!alive) return;
        setGateGrund("Die Daten konnten nicht geladen werden.");
        setGate("fehlt");
      }
    })();
    return () => {
      alive = false;
    };
  }, [subjectId, assignmentId]);

  // --- Entwurf in sessionStorage ---------------------------------------------
  const [entwurf, setEntwurf] = useState<Entwurf>(leererEntwurf);
  const loadedRef = useRef(false);
  const [speicherWarnung, setSpeicherWarnung] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setEntwurf({ ...leererEntwurf(), ...(JSON.parse(raw) as Partial<Entwurf>) });
    } catch {
      setSpeicherWarnung(true);
    }
    loadedRef.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(entwurf));
    } catch {
      setSpeicherWarnung(true);
    }
  }, [entwurf, storageKey]);

  function verwerfeEntwurf() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignorieren -- der Entwurf existiert dann nur noch im Speicher, spielt
      // nach dem Redirect keine Rolle mehr.
    }
  }

  if (gate === "laden") {
    return (
      <div className="mx-auto max-w-2xl space-y-4" aria-label="Wird geladen" aria-busy="true">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (gate === "fehlt") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
          <p className="text-[15px] font-medium">Lernplan laesst sich nicht erstellen</p>
          <p className="text-[13px] text-muted-foreground">{gateGrund}</p>
          <Link
            href={`/lernen/${subjectId}`}
            className="rounded-md px-2 py-1.5 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Zurueck zum Fach
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Lernplan erstellen
        </p>
        <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight">{assignment?.title}</h1>
      </div>

      <Fortschritt schritt={schritt} />

      {bestehenderPlan && (
        <div className="rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
          Es gibt schon einen Plan zu dieser Pruefung, ein neuer ersetzt ihn.
        </div>
      )}
      {speicherWarnung && (
        <p className="text-[12px] text-muted-foreground">Entwurf wird nicht gesichert.</p>
      )}

      {schritt === 1 && (
        <SchrittMaterial
          subjectId={subjectId}
          assignmentId={assignmentId}
          dateien={dateien}
          setDateien={setDateien}
          entwurf={entwurf}
          setEntwurf={setEntwurf}
          onWeiter={(daten) => {
            setEntwurf((e) => ({
              ...e,
              checklisteText: daten.checklisteText,
              punkte: daten.punkte.map((p) => ({ ...p, key: neuerSchluessel() })),
              checks: null,
              antworten: {},
            }));
            gehe(2);
          }}
          toast={toast}
        />
      )}

      {schritt === 2 && (
        <SchrittPunkte
          entwurf={entwurf}
          setEntwurf={setEntwurf}
          dateien={dateien}
          onZurueck={() => gehe(1)}
          onWeiter={() => gehe(3)}
        />
      )}

      {schritt === 3 && (
        <SchrittTest
          subjectId={subjectId}
          entwurf={entwurf}
          setEntwurf={setEntwurf}
          onZurueck={() => gehe(2)}
          onWeiter={() => gehe(4)}
          toast={toast}
        />
      )}

      {schritt === 4 && assignment && (
        <SchrittPlan
          subjectId={subjectId}
          assignmentId={assignmentId}
          assignment={assignment}
          entwurf={entwurf}
          bestehenderPlan={bestehenderPlan}
          onZurueck={() => gehe(3)}
          onFertig={(createdTopicIds, planId, anzahlEinheiten) => {
            verwerfeEntwurf();
            router.push(`/lernen/${subjectId}/plan/${assignmentId}`);
            toast(
              `Lernplan mit ${anzahlEinheiten} ${anzahlEinheiten === 1 ? "Einheit" : "Einheiten"} angelegt`,
              "success",
              {
                label: "Rueckgaengig",
                onClick: () => {
                  void fetch(`/api/lernen/plan/${planId}`, {
                    method: "DELETE",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ topicIds: createdTopicIds }),
                  });
                },
              },
            );
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

// --- Fortschrittsanzeige der vier Schritte ----------------------------------

const SCHRITT_LABEL = ["Material", "Punkte pruefen", "Diagnosetest", "Plan"];

function Fortschritt({ schritt }: { schritt: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label={`Schritt ${schritt} von 4`}>
      {SCHRITT_LABEL.map((label, i) => {
        const n = i + 1;
        const aktiv = n === schritt;
        const erledigt = n < schritt;
        return (
          <li key={label} className="flex flex-1 items-center gap-1.5">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                aktiv && "bg-primary text-primary-foreground",
                erledigt && !aktiv && "bg-primary/20 text-primary",
                !aktiv && !erledigt && "bg-muted text-muted-foreground",
              )}
            >
              {n}
            </span>
            <span
              className={cn(
                "hidden truncate text-[12px] sm:inline",
                aktiv ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {n < 4 && <span aria-hidden className="h-px flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

// --- Schritt 1: Material -----------------------------------------------------

function ChipRadio({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={cn(
        "relative min-h-11 rounded-full border px-3.5 text-[13px] font-medium transition-colors [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function SchrittMaterial({
  subjectId,
  assignmentId,
  dateien,
  setDateien,
  entwurf,
  setEntwurf,
  onWeiter,
  toast,
}: {
  subjectId: string;
  assignmentId: string;
  dateien: Datei[];
  setDateien: React.Dispatch<React.SetStateAction<Datei[]>>;
  entwurf: Entwurf;
  setEntwurf: React.Dispatch<React.SetStateAction<Entwurf>>;
  onWeiter: (daten: { checklisteText: string; punkte: PunktDraft[] }) => void;
  toast: (message: string, variant?: "error" | "success") => void;
}) {
  const [checklistUploading, setChecklistUploading] = useState(false);
  const [blattQueue, setBlattQueue] = useState<{ key: string; name: string; status: "laedt" | "fehler"; error?: string }[]>(
    [],
  );
  const [lesenLoading, setLesenLoading] = useState(false);
  const [lesenError, setLesenError] = useState<string | null>(null);

  const checklistInputRef = useRef<HTMLInputElement | null>(null);
  const blattInputRef = useRef<HTMLInputElement | null>(null);

  async function checklisteHochladen(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
      toast("Nur PDF, PNG, JPG, WEBP oder HEIC.");
      return;
    }
    setChecklistUploading(true);
    try {
      const zu = await bildFallsNoetigVerkleinern(file);
      const datei = await uploadZuFach(subjectId, zu);
      setDateien((d) => [datei, ...d]);
      setEntwurf((e) => ({ ...e, checklistMode: "upload", checklistFileId: datei.id, checklistFileName: datei.name }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Die Datei konnte nicht hochgeladen werden.");
    } finally {
      setChecklistUploading(false);
    }
  }

  async function blaetterHochladen(files: File[]) {
    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
        toast(`${file.name}: falscher Dateityp.`);
        continue;
      }
      const key = neuerSchluessel();
      setBlattQueue((q) => [...q, { key, name: file.name, status: "laedt" }]);
      try {
        const zu = await bildFallsNoetigVerkleinern(file);
        const datei = await uploadZuFach(subjectId, zu);
        setDateien((d) => [datei, ...d]);
        setEntwurf((e) => (e.fileIds.includes(datei.id) ? e : { ...e, fileIds: [...e.fileIds, datei.id] }));
        setBlattQueue((q) => q.filter((it) => it.key !== key));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Fehlgeschlagen";
        setBlattQueue((q) => q.map((it) => (it.key === key ? { ...it, status: "fehler", error: message } : it)));
      }
    }
  }

  function toggleBlatt(id: string) {
    setEntwurf((e) => ({
      ...e,
      fileIds: e.fileIds.includes(id) ? e.fileIds.filter((f) => f !== id) : [...e.fileIds, id],
    }));
  }

  const hatChecklist =
    (entwurf.checklistMode !== "text" && !!entwurf.checklistFileId) ||
    (entwurf.checklistMode === "text" && entwurf.checklistText.trim().length > 0);

  async function checklisteLesen() {
    setLesenError(null);
    setLesenLoading(true);
    try {
      const body =
        entwurf.checklistMode === "text"
          ? { checklist: { text: entwurf.checklistText.trim() } }
          : { checklist: { fileId: entwurf.checklistFileId } };
      const res = await ladeMitTimeout(
        "/api/lernen/plan/lesen",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            assignmentId,
            ...body,
            fileIds: entwurf.fileIds,
          }),
        },
        LESEN_TIMEOUT,
      );
      const data = (await res.json().catch(() => null)) as
        | { entwurf: { checklisteText: string; punkte: PunktDraft[] }; hinweis?: string[] }
        | { error: string; hinweis?: string }
        | null;
      if (!res.ok || !data || "error" in data) {
        setLesenError(fehlerNachricht(data && "error" in data ? data.error : undefined, data && "hinweis" in data ? data.hinweis : undefined));
        return;
      }
      if (data.hinweis && data.hinweis.length > 0) {
        toast(data.hinweis.join(" "), "success");
      }
      onWeiter(data.entwurf);
    } catch {
      setLesenError("Das Modell hat nicht geantwortet. Erneut versuchen.");
    } finally {
      setLesenLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold">Checkliste</h2>
        <p className="text-[12.5px] text-muted-foreground">Genau eine Quelle: Foto, PDF, Fach-Datei oder Text.</p>
        <div className="flex flex-wrap gap-2">
          <ChipRadio checked={entwurf.checklistMode === "upload"} onChange={() => setEntwurf((e) => ({ ...e, checklistMode: "upload" }))}>
            Foto/PDF hochladen
          </ChipRadio>
          <ChipRadio checked={entwurf.checklistMode === "fach"} onChange={() => setEntwurf((e) => ({ ...e, checklistMode: "fach" }))}>
            Aus Fach-Dateien
          </ChipRadio>
          <ChipRadio checked={entwurf.checklistMode === "text"} onChange={() => setEntwurf((e) => ({ ...e, checklistMode: "text" }))}>
            Text einfuegen
          </ChipRadio>
        </div>

        {entwurf.checklistMode === "upload" && (
          <div>
            <input
              ref={checklistInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void checklisteHochladen(file);
              }}
            />
            <button
              type="button"
              onClick={() => checklistInputRef.current?.click()}
              disabled={checklistUploading}
              className="flex min-h-[64px] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-4 text-center transition-colors [touch-action:manipulation] hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {checklistUploading ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="size-4 text-muted-foreground" />
              )}
              <span className="text-[13px] font-medium">
                {entwurf.checklistFileId ? entwurf.checklistFileName : "Foto oder PDF waehlen"}
              </span>
            </button>
          </div>
        )}

        {entwurf.checklistMode === "fach" && (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
            {dateien.length === 0 && <li className="px-2 py-1.5 text-[13px] text-muted-foreground">Noch keine Fach-Dateien.</li>}
            {dateien.map((f) => (
              <li key={f.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent">
                  <input
                    type="radio"
                    name="checklist-fach"
                    checked={entwurf.checklistFileId === f.id}
                    onChange={() => setEntwurf((e) => ({ ...e, checklistFileId: f.id, checklistFileName: f.name }))}
                    className="size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {entwurf.checklistMode === "text" && (
          <textarea
            value={entwurf.checklistText}
            onChange={(e) => setEntwurf((prev) => ({ ...prev, checklistText: e.target.value.slice(0, MAX_TEXT) }))}
            rows={6}
            placeholder="Checkliste einfuegen"
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
        {entwurf.checklistMode === "text" && (
          <p className="text-right text-[11px] tabular-nums text-muted-foreground">
            {entwurf.checklistText.length}/{MAX_TEXT}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold">Arbeitsblaetter</h2>
        <p className="text-[12.5px] text-muted-foreground">Optional, Mehrfachauswahl.</p>
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
          {dateien.length === 0 && <li className="px-2 py-1.5 text-[13px] text-muted-foreground">Noch keine Fach-Dateien.</li>}
          {dateien.map((f) => (
            <li key={f.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent">
                <input
                  type="checkbox"
                  checked={entwurf.fileIds.includes(f.id)}
                  onChange={() => toggleBlatt(f.id)}
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
              </label>
            </li>
          ))}
        </ul>
        <input
          ref={blattInputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) void blaetterHochladen(files);
          }}
        />
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => blattInputRef.current?.click()}>
          <Upload className="size-3.5" />
          Blatt hochladen
        </Button>
        {blattQueue.length > 0 && (
          <ul className="space-y-1">
            {blattQueue.map((it) => (
              <li key={it.key} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px]">
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                <span className={cn("shrink-0", it.status === "fehler" ? "text-destructive" : "text-muted-foreground")}>
                  {it.status === "laedt" ? "Wird hochgeladen …" : (it.error ?? "Fehlgeschlagen")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="minuten-schultag" className="mb-1 block text-[12.5px] font-medium text-muted-foreground">
            Minuten Schultag
          </label>
          <input
            id="minuten-schultag"
            type="number"
            inputMode="numeric"
            min={10}
            max={240}
            value={entwurf.minutesWeekday}
            onChange={(e) =>
              setEntwurf((prev) => ({ ...prev, minutesWeekday: Math.min(240, Math.max(10, Number(e.target.value) || 10)) }))
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-[16px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="minuten-wochenende" className="mb-1 block text-[12.5px] font-medium text-muted-foreground">
            Minuten Wochenende
          </label>
          <input
            id="minuten-wochenende"
            type="number"
            inputMode="numeric"
            min={10}
            max={240}
            value={entwurf.minutesWeekend}
            onChange={(e) =>
              setEntwurf((prev) => ({ ...prev, minutesWeekend: Math.min(240, Math.max(10, Number(e.target.value) || 10)) }))
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-[16px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </section>

      {lesenError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive">
          {lesenError}
        </div>
      )}

      <Button
        type="button"
        className="h-11 w-full"
        disabled={!hatChecklist || lesenLoading || checklistUploading}
        onClick={() => void checklisteLesen()}
      >
        {lesenLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Checkliste wird gelesen …
          </>
        ) : lesenError ? (
          "Erneut versuchen"
        ) : (
          "Checkliste lesen"
        )}
      </Button>
    </div>
  );
}

// --- Schritt 2: Punkte pruefen ----------------------------------------------

function SchrittPunkte({
  entwurf,
  setEntwurf,
  dateien,
  onZurueck,
  onWeiter,
}: {
  entwurf: Entwurf;
  setEntwurf: React.Dispatch<React.SetStateAction<Entwurf>>;
  dateien: Datei[];
  onZurueck: () => void;
  onWeiter: () => void;
}) {
  const [markiert, setMarkiert] = useState<string[]>([]);
  const [checklisteOffen, setChecklisteOffen] = useState(false);

  function patchPunkt(key: string, patch: Partial<PunktLokal>) {
    setEntwurf((e) => ({ ...e, punkte: e.punkte.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  }

  function loeschePunkt(key: string) {
    setEntwurf((e) => ({ ...e, punkte: e.punkte.filter((p) => p.key !== key) }));
    setMarkiert((m) => m.filter((k) => k !== key));
  }

  function punktHinzufuegen() {
    setEntwurf((e) => ({
      ...e,
      punkte: [
        ...e.punkte,
        { key: neuerSchluessel(), titel: "", detail: "", seiten: null, fileIds: [], minuten: 30, frage: null, musterantwort: null },
      ],
    }));
  }

  function toggleMarkiert(key: string) {
    setMarkiert((m) => (m.includes(key) ? m.filter((k) => k !== key) : m.length < 2 ? [...m, key] : m));
  }

  function zusammenlegen() {
    if (markiert.length !== 2) return;
    setEntwurf((e) => {
      // "des ersten": Reihenfolge in der Liste zaehlt, nicht die Markier-Reihenfolge.
      const [a, b] = e.punkte.filter((p) => markiert.includes(p.key));
      if (!a || !b) return e;
      const zusammengelegt: PunktLokal = {
        ...a,
        detail: [a.detail, b.detail].filter(Boolean).join(" "),
        fileIds: Array.from(new Set([...a.fileIds, ...b.fileIds])),
        minuten: Math.min(90, a.minuten + b.minuten),
      };
      return { ...e, punkte: e.punkte.filter((p) => p.key !== a.key && p.key !== b.key).concat(zusammengelegt) };
    });
    setMarkiert([]);
  }

  function dateiName(id: string): string {
    return dateien.find((d) => d.id === id)?.name ?? "Datei";
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        {entwurf.punkte.length} {entwurf.punkte.length === 1 ? "Punkt" : "Punkte"} erkannt. Titel, Seiten, Blaetter und Minuten
        lassen sich anpassen.
      </p>

      <ul className="space-y-2">
        {entwurf.punkte.map((p) => (
          <li key={p.key} className="rounded-xl border bg-card p-3 shadow-card">
            <div className="flex items-start gap-1">
              {/* A2 (Touch): label traegt die 44x44-Trefflaeche, der sichtbare
                  Haken bleibt klein -- wie die Chip-Zeilen in lernen-quellen.tsx. */}
              <label className="-m-1 grid size-11 shrink-0 cursor-pointer place-items-center">
                <input
                  type="checkbox"
                  aria-label={`${p.titel || "Punkt"} zum Zusammenlegen markieren`}
                  checked={markiert.includes(p.key)}
                  disabled={!markiert.includes(p.key) && markiert.length >= 2}
                  onChange={() => toggleMarkiert(p.key)}
                  className="size-4 shrink-0"
                />
              </label>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  type="text"
                  value={p.titel}
                  onChange={(e) => patchPunkt(p.key, { titel: e.target.value.slice(0, 200) })}
                  placeholder="Titel"
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={p.seiten ?? ""}
                    onChange={(e) => patchPunkt(p.key, { seiten: e.target.value || null })}
                    placeholder="Seiten"
                    className="w-24 rounded-md border bg-background px-2 py-1 text-[13px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    Minuten
                    <input
                      type="number"
                      inputMode="numeric"
                      min={10}
                      max={90}
                      value={p.minuten}
                      onChange={(e) => patchPunkt(p.key, { minuten: Math.min(90, Math.max(10, Number(e.target.value) || 10)) })}
                      className="w-16 rounded-md border bg-background px-2 py-1 text-[13px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.fileIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] text-muted-foreground"
                    >
                      {dateiName(id)}
                      <button
                        type="button"
                        aria-label={`${dateiName(id)} entfernen`}
                        onClick={() => patchPunkt(p.key, { fileIds: p.fileIds.filter((f) => f !== id) })}
                        className="relative -mr-0.5 grid size-4 place-items-center rounded-full before:absolute before:-inset-3.5 before:content-[''] hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <BlattHinzufuegen
                    dateien={dateien.filter((d) => !p.fileIds.includes(d.id))}
                    onAdd={(id) => patchPunkt(p.key, { fileIds: [...p.fileIds, id] })}
                  />
                </div>
              </div>
              <button
                type="button"
                aria-label={`${p.titel || "Punkt"} loeschen`}
                onClick={() => loeschePunkt(p.key)}
                className="relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={punktHinzufuegen}>
          <Plus className="size-3.5" />
          Punkt hinzufuegen
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={markiert.length !== 2} onClick={zusammenlegen}>
          Zusammenlegen
        </Button>
      </div>

      {entwurf.checklisteText && (
        <div className="rounded-lg border">
          <button
            type="button"
            onClick={() => setChecklisteOffen((v) => !v)}
            aria-expanded={checklisteOffen}
            className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium"
          >
            Checklisten-Text
            <ChevronDown className={cn("size-4 shrink-0 transition-transform", checklisteOffen && "rotate-180")} />
          </button>
          {checklisteOffen && (
            <p className="whitespace-pre-wrap border-t px-3 py-2.5 text-[13px] text-muted-foreground">
              {entwurf.checklisteText}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onZurueck}>
          Zurueck
        </Button>
        <Button type="button" className="h-11 flex-1" disabled={entwurf.punkte.length === 0} onClick={onWeiter}>
          Weiter zum Test
        </Button>
      </div>
    </div>
  );
}

function BlattHinzufuegen({ dateien, onAdd }: { dateien: Datei[]; onAdd: (id: string) => void }) {
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

  if (dateien.length === 0) return null;
  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="relative inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11.5px] text-muted-foreground before:absolute before:-inset-2 before:content-[''] hover:bg-accent"
      >
        <Plus className="size-3" />
        Blatt
      </button>
      {offen && (
        <ul className="absolute z-10 mt-1 max-h-40 w-48 overflow-y-auto rounded-lg border bg-popover p-1 shadow-popover">
          {dateien.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => {
                  onAdd(d.id);
                  setOffen(false);
                }}
                className="block w-full truncate rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-accent"
              >
                {d.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Schritt 3: Diagnosetest --------------------------------------------------

function SchrittTest({
  subjectId,
  entwurf,
  setEntwurf,
  onZurueck,
  onWeiter,
  toast,
}: {
  subjectId: string;
  entwurf: Entwurf;
  setEntwurf: React.Dispatch<React.SetStateAction<Entwurf>>;
  onZurueck: () => void;
  onWeiter: () => void;
  toast: (message: string, variant?: "error" | "success") => void;
}) {
  const fragePunkte = useMemo(() => entwurf.punkte.filter((p) => p.frage), [entwurf.punkte]);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [auswertenLoading, setAuswertenLoading] = useState(false);
  const [auswertenError, setAuswertenError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [index]);

  // Ohne Fragen direkt weiter (Edge Case "Diagnose ohne Fragen").
  useEffect(() => {
    if (fragePunkte.length === 0 && entwurf.checks === null) {
      setEntwurf((e) => ({
        ...e,
        checks: [],
        punkte: e.punkte.map((p) => ({ ...p })),
      }));
      onWeiter();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fertig = index >= fragePunkte.length;

  function antworten(antwort: string | null) {
    const punkt = fragePunkte[index];
    if (!punkt) return;
    setEntwurf((e) => ({ ...e, antworten: { ...e.antworten, [punkt.key]: antwort } }));
    setValue("");
    setIndex((i) => i + 1);
  }

  function ohneTestPlanen() {
    setEntwurf((e) => ({
      ...e,
      checks: [],
      punkte: e.punkte.map((p) => ({ ...p })),
    }));
    onWeiter();
  }

  async function auswerten() {
    setAuswertenError(null);
    setAuswertenLoading(true);
    try {
      const zuSenden = fragePunkte.filter((p) => entwurf.antworten[p.key] !== null && entwurf.antworten[p.key] !== undefined);

      // Alle Diagnosefragen uebersprungen: kein POST noetig, Checks direkt
      // lokal bauen (alle "falsch", Feedback "Uebersprungen").
      if (zuSenden.length === 0) {
        const checks: CheckDraft[] = fragePunkte.map((p) => ({
          pointIndex: entwurf.punkte.findIndex((q) => q.key === p.key),
          frage: p.frage!,
          musterantwort: p.musterantwort ?? "",
          antwort: null,
          urteil: "falsch",
          feedback: "Uebersprungen",
        }));
        setEntwurf((e) => ({ ...e, checks }));
        return;
      }

      const res = await ladeMitTimeout(
        "/api/lernen/plan/bewerten",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subjectId,
            antworten: zuSenden.map((p) => ({
              frage: p.frage,
              musterantwort: p.musterantwort,
              antwort: entwurf.antworten[p.key],
            })),
          }),
        },
        BEWERTEN_TIMEOUT,
      );
      const data = (await res.json().catch(() => null)) as
        | { urteil: "richtig" | "teilweise" | "falsch"; feedback: string }[]
        | { error: string; hinweis?: string }
        | null;
      if (!res.ok || !data || !Array.isArray(data)) {
        setAuswertenError(fehlerNachricht(data && "error" in data ? data.error : undefined, data && "hinweis" in data ? data.hinweis : undefined));
        return;
      }
      let urteilIndex = 0;
      // pointIndex zeigt auf die Position im vollen Punkte-Array, weil der
      // Store Checks sonst nach Array-Position zuordnet und Punkte ohne Frage
      // die Reihenfolge verschieben wuerden.
      const checks: CheckDraft[] = fragePunkte.map((p) => {
        const pointIndex = entwurf.punkte.findIndex((q) => q.key === p.key);
        const antwort = entwurf.antworten[p.key] ?? null;
        if (antwort === null) {
          return { pointIndex, frage: p.frage!, musterantwort: p.musterantwort ?? "", antwort: null, urteil: "falsch", feedback: "Uebersprungen" };
        }
        const urteil = data[urteilIndex];
        urteilIndex += 1;
        return {
          pointIndex,
          frage: p.frage!,
          musterantwort: p.musterantwort ?? "",
          antwort,
          urteil: urteil?.urteil ?? "falsch",
          feedback: urteil?.feedback ?? "",
        };
      });
      setEntwurf((e) => ({ ...e, checks }));
    } catch {
      setAuswertenError("Das Modell hat nicht geantwortet. Erneut versuchen.");
    } finally {
      setAuswertenLoading(false);
    }
  }

  if (fragePunkte.length === 0) return null;

  if (entwurf.checks && entwurf.checks.length > 0) {
    return <TestErgebnis checks={entwurf.checks} onZurueck={onZurueck} onWeiter={onWeiter} />;
  }

  if (fertig) {
    return (
      <div className="space-y-4">
        {auswertenError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive">
            {auswertenError}
          </div>
        )}
        <Button type="button" className="h-11 w-full" disabled={auswertenLoading} onClick={() => void auswerten()}>
          {auswertenLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Wird bewertet …
            </>
          ) : (
            "Auswerten"
          )}
        </Button>
        <Button type="button" variant="ghost" className="h-11 w-full" onClick={() => setIndex(0)}>
          Zurueck zu den Fragen
        </Button>
      </div>
    );
  }

  const punkt = fragePunkte[index];

  return (
    <div className="space-y-4">
      <p className="tabular-nums text-[13px] text-muted-foreground">
        {index + 1} von {fragePunkte.length}
      </p>
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <p className="text-[12.5px] font-medium text-muted-foreground">{punkt.titel}</p>
        <p className="mt-1.5 text-[16px] font-medium">{punkt.frage}</p>
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            antworten(value.trim() || null);
          }}
        >
          <label htmlFor="test-antwort" className="sr-only">
            Deine Antwort
          </label>
          <input
            ref={inputRef}
            id="test-antwort"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, 500))}
            placeholder="Antwort eintippen"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-md border bg-background px-3 py-2.5 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={() => antworten(null)}>
              Weiss ich nicht
            </Button>
            <Button type="submit" className="h-11">
              Weiter
            </Button>
          </div>
        </form>
      </div>
      <button
        type="button"
        onClick={ohneTestPlanen}
        className="relative rounded px-1 py-1 text-[13px] text-muted-foreground underline-offset-2 before:absolute before:-inset-2.5 before:content-[''] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Ohne Test planen
      </button>
    </div>
  );
}

const URTEIL_STYLE: Record<string, string> = {
  richtig: "border-green-600/30 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:text-green-400",
  teilweise: "border-yellow-600/30 bg-yellow-600/10 text-yellow-700 dark:border-yellow-500/30 dark:text-yellow-400",
  falsch: "border-red-600/30 bg-red-600/10 text-red-700 dark:border-red-500/30 dark:text-red-400",
};
const URTEIL_LABEL: Record<string, string> = { richtig: "Richtig", teilweise: "Teilweise", falsch: "Falsch" };

function TestErgebnis({
  checks,
  onZurueck,
  onWeiter,
}: {
  checks: CheckDraft[];
  onZurueck: () => void;
  onWeiter: () => void;
}) {
  const [offen, setOffen] = useState<number | null>(null);
  const sitzen = checks.filter((c) => c.urteil === "richtig").length;
  const wackeln = checks.filter((c) => c.urteil === "teilweise").length;
  const fehlen = checks.filter((c) => c.urteil === "falsch").length;

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        {sitzen} sitzen, {wackeln} wackeln, {fehlen} fehlen
      </p>
      <ul className="space-y-2">
        {checks.map((c, i) => (
          <li key={i} className="rounded-xl border bg-card p-3 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-[13.5px] font-medium">{c.frage}</p>
              <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium", URTEIL_STYLE[c.urteil])}>
                {URTEIL_LABEL[c.urteil]}
              </span>
            </div>
            {c.feedback && (
              <button
                type="button"
                onClick={() => setOffen((v) => (v === i ? null : i))}
                aria-expanded={offen === i}
                className="mt-1.5 flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", offen === i && "rotate-180")} />
                Feedback
              </button>
            )}
            {offen === i && c.feedback && <p className="mt-1 text-[12.5px] text-muted-foreground">{c.feedback}</p>}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onZurueck}>
          Zurueck
        </Button>
        <Button type="button" className="h-11 flex-1" onClick={onWeiter}>
          Plan erstellen
        </Button>
      </div>
    </div>
  );
}

// --- Schritt 4: Plan erstellen ------------------------------------------------

function SchrittPlan({
  subjectId,
  assignmentId,
  assignment,
  entwurf,
  bestehenderPlan,
  onZurueck,
  onFertig,
  toast,
}: {
  subjectId: string;
  assignmentId: string;
  assignment: { id: string; title: string; dueDate: string | null };
  entwurf: Entwurf;
  bestehenderPlan: boolean;
  onZurueck: () => void;
  onFertig: (createdTopicIds: string[], planId: string, anzahlEinheiten: number) => void;
  toast: (message: string, variant?: "error" | "success") => void;
}) {
  const [loading, setLoading] = useState(false);
  const [fehler, setFehler] = useState<{ code: string; text: string } | null>(null);
  const punkteAnzahl = entwurf.punkte.length;
  const minutenGesamt = entwurf.punkte.reduce((sum, p) => sum + p.minuten, 0);

  async function planErstellen(ersetzen: boolean) {
    setLoading(true);
    setFehler(null);
    try {
      const checklist =
        entwurf.checklistMode === "text" ? { text: entwurf.checklistText.trim() } : { fileId: entwurf.checklistFileId };
      const res = await fetch("/api/lernen/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          checklist,
          fileIds: entwurf.fileIds,
          minutesWeekday: entwurf.minutesWeekday,
          minutesWeekend: entwurf.minutesWeekend,
          punkte: entwurf.punkte.map(({ key: _key, ...p }) => p),
          checks: entwurf.checks && entwurf.checks.length > 0 ? entwurf.checks : null,
          ersetzen,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { plan: PlanDTO; createdTopicIds: string[]; hinweis?: string[] }
        | { error: string; hinweis?: string }
        | null;
      if (res.status === 409) {
        setFehler({ code: "plan_gerade_erstellt", text: fehlerNachricht("plan_gerade_erstellt", undefined) });
        return;
      }
      if (!res.ok || !data || "error" in data) {
        setFehler({
          code: data && "error" in data ? data.error : "speichern",
          text: fehlerNachricht(data && "error" in data ? data.error : undefined, data && "hinweis" in data ? data.hinweis : undefined),
        });
        return;
      }
      if (data.hinweis && data.hinweis.length > 0) toast(data.hinweis.join(" "), "success");
      onFertig(data.createdTopicIds, data.plan.id, data.plan.items.length);
    } catch {
      setFehler({ code: "netzwerk", text: "Der Plan konnte nicht gespeichert werden." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <p className="text-[13.5px] font-medium">{assignment.title}</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {punkteAnzahl} {punkteAnzahl === 1 ? "Punkt" : "Punkte"} · {minutenGesamt} Minuten geschaetzt
        </p>
      </div>

      {fehler && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive">
          <p>{fehler.text}</p>
          {fehler.code === "plan_gerade_erstellt" && (
            <Link
              href={`/lernen/${subjectId}/plan/${assignmentId}`}
              className="mt-1 inline-block underline-offset-2 hover:underline"
            >
              Zur Planseite
            </Link>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onZurueck} disabled={loading}>
          Zurueck
        </Button>
        <Button
          type="button"
          className="h-11 flex-1"
          disabled={loading}
          onClick={() => void planErstellen(bestehenderPlan || fehler?.code === "plan_gerade_erstellt")}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Wird erstellt …
            </>
          ) : bestehenderPlan ? (
            "Plan neu erstellen"
          ) : (
            "Plan erstellen"
          )}
        </Button>
      </div>
    </div>
  );
}
