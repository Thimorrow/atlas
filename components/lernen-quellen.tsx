"use client";

// Gemeinsame Quellenauswahl fuer Lernzettel und Kartenerzeugung: woher kommt
// der Stoff (Notizen/Dateien/Lehrplan/Alles), welche Dateien/Notizen genau,
// und -- nur wenn onKindChange gesetzt ist -- was erzeugt werden soll
// (Fragen/Vokabeln/Aufgaben) und wie viele. Reine Formularlogik, kein
// eigener Submit: der Aufrufer (lernen-thema.tsx) haengt seinen Knopf an.

import { useId } from "react";
import { cn } from "@/lib/utils";
import type { CardKind, SubjectDetail } from "@/lib/lernen-types";

export type Quelle = "notizen" | "dateien" | "lehrplan" | "alles";

const KIND_LABEL: Record<CardKind, string> = {
  wissen: "Fragen",
  vokabel: "Vokabeln",
  aufgabe: "Aufgaben",
};

function Chip({
  checked,
  onChange,
  name,
  value,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  name: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors [touch-action:manipulation] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      {children}
    </label>
  );
}

export function LernenQuellen({
  subject,
  dateien,
  notizen,
  quelle,
  onQuelleChange,
  fileIds,
  onFileIdsChange,
  noteIds,
  onNoteIdsChange,
  kind,
  onKindChange,
  defaultKindLabel,
  anzahl,
  onAnzahlChange,
}: {
  subject: { curriculum: string | null };
  dateien: SubjectDetail["dateien"];
  notizen: SubjectDetail["notizen"];
  quelle: Quelle;
  onQuelleChange: (q: Quelle) => void;
  fileIds: string[];
  onFileIdsChange: (ids: string[]) => void;
  noteIds: string[];
  onNoteIdsChange: (ids: string[]) => void;
  // Optional: nur die Kartenerzeugung bietet die Kartenart an, der
  // Lernzettel nicht (der hat immer dieselbe Form je Lernart).
  kind?: CardKind | undefined;
  onKindChange?: (kind: CardKind | undefined) => void;
  defaultKindLabel?: string;
  anzahl?: number;
  onAnzahlChange?: (n: number) => void;
}) {
  const uid = useId();

  function toggleFile(id: string) {
    onFileIdsChange(fileIds.includes(id) ? fileIds.filter((f) => f !== id) : [...fileIds, id]);
  }
  function toggleNote(id: string) {
    onNoteIdsChange(noteIds.includes(id) ? noteIds.filter((n) => n !== id) : [...noteIds, id]);
  }

  const zeigeDateien = quelle === "dateien" || quelle === "alles";
  const zeigeNotizen = quelle === "notizen" || quelle === "alles";

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 block text-[12.5px] font-medium text-muted-foreground">Quelle</legend>
        {(
          [
            { value: "notizen", label: "Notizen", hidden: notizen.length === 0 },
            { value: "dateien", label: "Dateien", hidden: dateien.length === 0 },
            { value: "lehrplan", label: "Lehrplan", hidden: !subject.curriculum },
            { value: "alles", label: "Alles" },
          ] as { value: Quelle; label: string; hidden?: boolean }[]
        )
          .filter((o) => !o.hidden)
          .map((o) => (
            <Chip
              key={o.value}
              name={`${uid}-quelle`}
              value={o.value}
              checked={quelle === o.value}
              onChange={() => onQuelleChange(o.value)}
            >
              {o.label}
            </Chip>
          ))}
      </fieldset>

      {zeigeDateien && dateien.length > 0 && (
        <div>
          <p className="mb-1 text-[12.5px] font-medium text-muted-foreground">
            Dateien {quelle === "alles" ? "(optional einschränken)" : ""}
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
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
        </div>
      )}

      {zeigeNotizen && notizen.length > 0 && (
        <div>
          <p className="mb-1 text-[12.5px] font-medium text-muted-foreground">
            Notizen {quelle === "alles" ? "(optional einschränken)" : ""}
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
            {notizen.map((n) => (
              <li key={n.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={noteIds.includes(n.id)}
                    onChange={() => toggleNote(n.id)}
                    className="size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{n.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onKindChange && (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 block text-[12.5px] font-medium text-muted-foreground">Was erzeugen?</legend>
          <Chip name={`${uid}-kind`} value="auto" checked={kind === undefined} onChange={() => onKindChange(undefined)}>
            {defaultKindLabel ?? "Automatisch"}
          </Chip>
          {(["wissen", "vokabel", "aufgabe"] as CardKind[]).map((k) => (
            <Chip key={k} name={`${uid}-kind`} value={k} checked={kind === k} onChange={() => onKindChange(k)}>
              {KIND_LABEL[k]}
            </Chip>
          ))}
        </fieldset>
      )}

      {onAnzahlChange && (
        <div>
          <label htmlFor={`${uid}-anzahl`} className="mb-1 block text-[12.5px] font-medium text-muted-foreground">
            Anzahl
          </label>
          <select
            id={`${uid}-anzahl`}
            value={anzahl}
            onChange={(e) => onAnzahlChange(Number(e.target.value))}
            className="w-full rounded-md border bg-background px-3 py-2 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={8}>8</option>
            <option value={12}>12</option>
            <option value={20}>20</option>
          </select>
        </div>
      )}
    </div>
  );
}
