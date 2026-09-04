"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/toast";

// Der Zustand der Microsoft-Anbindung, wie ihn /api/microsoft/status meldet.
// enabled=false heisst "im Azure-Portal noch nichts eingerichtet",
// connected=false heisst "eingerichtet, aber noch nicht angemeldet".
export type MicrosoftStatus = {
  enabled: boolean;
  connected: boolean;
  account: { displayName: string | null; email: string | null } | null;
};

// Ein Hook, weil zwei Stellen der Fach-Seite dieselbe Auskunft brauchen: die
// Abschnittswahl hier und der Sende-Knopf an der Notiz. `null` heisst "wird
// noch geladen" -- vor der Antwort darf nichts behauptet werden.
export function useMicrosoftStatus(): MicrosoftStatus | null {
  const [status, setStatus] = useState<MicrosoftStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/microsoft/status")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("status failed"))))
      .then((data: MicrosoftStatus) => {
        if (alive) setStatus(data);
      })
      .catch(() => {
        // Kein Toast: eine nicht erreichbare Statusabfrage darf die Fach-Seite
        // nicht mit einer Fehlermeldung begruessen. Die Anbindung gilt dann
        // schlicht als nicht verfuegbar.
        if (alive) setStatus({ enabled: false, connected: false, account: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  return status;
}

type SectionDTO = { id: string; name: string; notebook: string | null };

const FIELD =
  "h-11 w-full rounded-lg border bg-background px-3 text-[16px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

// Ruhiger Hinweis statt Fehler, im selben Ton wie der Dateibereich ohne
// Blob-Token: gestrichelter Rahmen, gedaempfte Schrift, keine Warnfarbe.
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-[13px] text-muted-foreground">
      {children}
    </p>
  );
}

export function SubjectOnenote({
  subjectId,
  status,
  sectionId,
  sectionName,
  onChange,
}: {
  subjectId: string;
  status: MicrosoftStatus | null;
  sectionId: string | null;
  sectionName: string | null;
  onChange: (next: { id: string | null; name: string | null }) => void;
}) {
  const toast = useToast();
  const selectId = useId();
  const [sections, setSections] = useState<SectionDTO[] | null>(null);
  const [saving, setSaving] = useState(false);

  const connected = status?.enabled && status.connected;

  // Die Abschnitte erst holen, wenn die Verbindung wirklich steht -- sonst
  // laeuft bei jedem Seitenaufruf ein Graph-Aufruf ins Leere.
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    fetch("/api/microsoft/sections")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }: { ok: boolean; data: { sections?: SectionDTO[]; error?: string } }) => {
        if (!alive) return;
        if (!ok) {
          toast(data.error ?? "Deine OneNote-Abschnitte konnten nicht geladen werden.");
          setSections([]);
          return;
        }
        setSections(data.sections ?? []);
      })
      .catch(() => {
        if (!alive) return;
        toast("Deine OneNote-Abschnitte konnten nicht geladen werden.");
        setSections([]);
      });
    return () => {
      alive = false;
    };
  }, [connected, toast]);

  const save = useCallback(
    async (next: SectionDTO | null) => {
      setSaving(true);
      const label = next ? [next.notebook, next.name].filter(Boolean).join(" / ") : null;
      try {
        const res = await fetch(`/api/subjects/${subjectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            onenoteSectionId: next?.id ?? null,
            onenoteSectionName: label,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          toast(data?.error ?? "Der Abschnitt konnte nicht gespeichert werden.");
          return;
        }
        onChange({ id: next?.id ?? null, name: label });
      } catch {
        toast("Keine Verbindung zum Server. Der Abschnitt wurde nicht gespeichert.");
      } finally {
        setSaving(false);
      }
    },
    [subjectId, onChange, toast],
  );

  if (status === null) {
    return <p className="text-[13px] text-muted-foreground">Wird geladen …</p>;
  }

  if (!status.enabled) {
    return <Hint>Die Microsoft-Anbindung ist noch nicht eingerichtet.</Hint>;
  }

  if (!status.connected) {
    return (
      <Hint>
        Noch nicht mit Microsoft verbunden.{" "}
        <Link
          href="/settings"
          className="font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          In den Einstellungen verbinden
        </Link>
      </Hint>
    );
  }

  if (sections === null) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Abschnitte werden geladen …
      </p>
    );
  }

  if (sections.length === 0) {
    return (
      <Hint>
        In deinem OneNote gibt es noch keinen Abschnitt. Leg in OneNote ein Notizbuch mit einem
        Abschnitt an, dann taucht er hier auf.
      </Hint>
    );
  }

  // Der gespeicherte Abschnitt kann in OneNote geloescht worden sein. Dann
  // steht er nicht mehr in der Liste und darf trotzdem nicht stillschweigend
  // verschwinden -- sonst zeigt die Auswahl "Kein Abschnitt", obwohl am Fach
  // noch einer haengt.
  const known = sections.some((s) => s.id === sectionId);

  return (
    <div className="space-y-2">
      {/* Persistentes Label ueber dem Feld, kein Platzhalter als Beschriftung. */}
      <label htmlFor={selectId} className="block text-[13px] font-medium">
        Abschnitt fuer dieses Fach
      </label>
      <div className="flex items-center gap-2">
        <select
          id={selectId}
          className={FIELD}
          value={sectionId ?? ""}
          disabled={saving}
          onChange={(e) => {
            const picked = sections.find((s) => s.id === e.target.value) ?? null;
            void save(picked);
          }}
        >
          <option value="">Kein Abschnitt</option>
          {sectionId && !known && (
            <option value={sectionId}>{sectionName ?? "Nicht mehr vorhanden"}</option>
          )}
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {[s.notebook, s.name].filter(Boolean).join(" / ")}
            </option>
          ))}
        </select>
        {saving && <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-[12px] text-muted-foreground">
        {sectionId
          ? "Notizen dieses Fachs lassen sich mit einem Klick als OneNote-Seite anlegen."
          : "Waehl einen Abschnitt, dann bekommt jede Notiz einen Knopf zum Senden."}
      </p>
    </div>
  );
}
