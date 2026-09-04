"use client";

// Die einmalige Faecher-Auswahl plus die kleinen Bausteine, die sich Uebersicht
// und Detailseite mit ihr teilen (Modal, Farbwahl, "Fach anlegen"). Sie liegen
// hier statt in eigenen Dateien, weil sie ausserhalb des Faecher-Moduls keinen
// Verbraucher haben und sonst dreimal fast gleich dastuenden.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarClock, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SubjectDTO } from "@/components/subject-card";
import { SUBJECT_COLORS, colorValue } from "@/lib/subject-colors";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

// 16px ist Pflicht, nicht Geschmack: iOS-Safari zoomt beim Fokus in jedes Feld
// darunter hinein und schiebt den halben Dialog aus dem Bild.
const FIELD =
  "h-11 w-full rounded-lg border bg-background px-3 text-[16px] transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

// --- Modal -------------------------------------------------------------------
// Bewusst eigenes Overlay statt window.confirm/prompt: blockierende Browser-
// Dialoge sind in diesem Projekt verboten (und sehen ueberall anders aus).

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    // Erstes fokussierbares Element im Dialog bekommt den Fokus, damit die
    // Tastatur nicht hinter dem Overlay weiterlaeuft.
    panelRef.current?.querySelector<HTMLElement>(
      "input, textarea, select, button, [href], [tabindex]:not([tabindex='-1'])",
    )?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            onClick={onClose}
            className="absolute inset-0 bg-background/70 backdrop-blur-[2px]"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="relative w-full max-w-md rounded-2xl border bg-card p-5 shadow-popover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id={titleId} className="text-[15px] font-semibold leading-tight tracking-tight">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-1 text-[13px] leading-snug text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Schliessen">
                <X className="size-4" />
              </Button>
            </div>
            <div className="mt-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// --- Farbwahl ----------------------------------------------------------------
// Reihe von Farbpunkten, semantisch eine radiogroup: genau ein Punkt ist per Tab
// erreichbar, die Pfeiltasten wandern durch (WAI-ARIA "Radio Group", roving
// tabindex -- gleiches Muster wie die Theme-Kacheln in /settings).

export function ColorPicker({
  value,
  onChange,
  label = "Farbe",
}: {
  value: string | null;
  onChange: (token: string) => void;
  label?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    SUBJECT_COLORS.findIndex((c) => c.token === value),
  );

  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % SUBJECT_COLORS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + SUBJECT_COLORS.length) % SUBJECT_COLORS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = SUBJECT_COLORS.length - 1;
    else return;
    e.preventDefault();
    onChange(SUBJECT_COLORS[next].token);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {SUBJECT_COLORS.map((c, i) => {
        const selected = c.token === value;
        return (
          <button
            key={c.token}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={c.label}
            tabIndex={i === activeIndex ? 0 : -1}
            onClick={() => onChange(c.token)}
            onKeyDown={(e) => onKeyDown(e, i)}
            // size-11 = 44px Trefferflaeche, der sichtbare Punkt bleibt klein.
            className="flex size-11 items-center justify-center rounded-full transition-colors [touch-action:manipulation] hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span
              className={cn(
                "block size-5 rounded-full transition-[box-shadow] duration-150 ease-[var(--ease-atlas)]",
                selected && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
              )}
              style={{ backgroundColor: c.value }}
            />
          </button>
        );
      })}
    </div>
  );
}

// --- Fach anlegen ------------------------------------------------------------

export function NewSubjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (subject: SubjectDTO) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [color, setColor] = useState<string>(SUBJECT_COLORS[1].token);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setTeacher("");
      setRoom("");
      setColor(SUBJECT_COLORS[1].token);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          teacher: teacher.trim() || null,
          room: room.trim() || null,
          color,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Anlegen fehlgeschlagen");
      onCreated(data.subject as SubjectDTO);
      onOpenChange(false);
    } catch (e) {
      toast((e as Error).message || "Das Fach konnte nicht angelegt werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Fach anlegen"
      description="Fuer alles, was nicht aus Untis kommt, etwa eine AG."
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium">Name</span>
          <input
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Zum Beispiel Informatik-AG"
            required
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium">Lehrer</span>
            <input
              className={FIELD}
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium">Raum</span>
            <input
              className={FIELD}
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
        <div>
          <span className="mb-1 block text-[13px] font-medium">Farbe</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={!name.trim() || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Anlegen
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Einmalige Auswahl -------------------------------------------------------

type Candidates = { candidates: string[]; hasBlocks: boolean };

export function SubjectSetup({ onDone }: { onDone: (subjects: SubjectDTO[]) => void }) {
  const toast = useToast();
  const [data, setData] = useState<Candidates | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/subjects/candidates");
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      const json = (await res.json()) as Candidates;
      setData(json);
      // Spec: alle Faecher sind vorausgewaehlt, der Nutzer nimmt nur Haken weg.
      setSelected(new Set(json.candidates));
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm() {
    if (!data || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/subjects/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selected: [...selected], all: data.candidates }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Speichern fehlgeschlagen");
      onDone(json.subjects as SubjectDTO[]);
    } catch (e) {
      toast((e as Error).message || "Die Auswahl konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  if (failed) {
    return (
      <EmptyPanel
        title="Die Faecher konnten nicht geladen werden"
        text="Pruef deine Verbindung und versuch es noch einmal."
      >
        <Button variant="outline" onClick={() => void load()}>
          Erneut versuchen
        </Button>
      </EmptyPanel>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border bg-card px-5 py-8 text-sm text-muted-foreground shadow-card">
        <Loader2 className="size-4 animate-spin" />
        Faecher werden geladen…
      </div>
    );
  }

  // Edge Case aus der Spec: school_blocks ist leer, es gab also noch keinen
  // Untis-Sync. Statt einer leeren Auswahlmaske ein ruhiger Hinweis mit Weg
  // nach vorn (Sync in den Einstellungen ODER Fach von Hand anlegen).
  if (!data.hasBlocks) {
    return (
      <>
        <EmptyPanel
          title="Noch keine Stunden da"
          text="Atlas kennt deine Faecher aus dem Stundenplan. Sobald einmal mit WebUntis abgeglichen wurde, kannst du hier auswaehlen, welche Faecher du behalten willst."
        >
          <ButtonLink href="/settings">
            <CalendarClock className="size-4" />
            Zu den Einstellungen
          </ButtonLink>
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Fach manuell anlegen
          </Button>
        </EmptyPanel>
        <NewSubjectDialog
          open={creating}
          onOpenChange={setCreating}
          onCreated={(s) => onDone([s])}
        />
      </>
    );
  }

  const allSelected = selected.size === data.candidates.length;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <header className="border-b bg-muted/30 px-5 py-4">
        <h2 className="text-[15px] font-semibold leading-tight tracking-tight">
          Welche Faecher hast du?
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Das sind alle Faecher aus deinem Stundenplan. Nimm den Haken weg bei allem, was du nicht
          brauchst. Diese Frage kommt nur einmal.
        </p>
      </header>

      <div className="flex items-center justify-between gap-3 border-b px-5 py-2.5">
        <span className="text-[13px] tabular-nums text-muted-foreground">
          {selected.size} von {data.candidates.length} ausgewaehlt
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelected(allSelected ? new Set() : new Set(data.candidates))}
        >
          {allSelected ? "Alle abwaehlen" : "Alle auswaehlen"}
        </Button>
      </div>

      <ul className="max-h-[46vh] overflow-y-auto p-2">
        {data.candidates.map((name) => {
          const checked = selected.has(name);
          return (
            <li key={name}>
              {/* Die ganze Zeile ist das Label -> Trefferflaeche >= 44px, nicht
                  nur die 16px-Box der Checkbox selbst. */}
              <label
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors [touch-action:manipulation]",
                  "hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-card",
                )}
              >
                <input
                  type="checkbox"
                  className="size-[18px] shrink-0 accent-[var(--primary)] focus-visible:outline-none"
                  checked={checked}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(name);
                      else next.delete(name);
                      return next;
                    })
                  }
                />
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorValue(null) }}
                />
                <span className="truncate">{name}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4">
        <p className="text-[12px] text-muted-foreground">
          Abgewaehlte Faecher werden archiviert, nicht geloescht.
        </p>
        <Button onClick={() => void confirm()} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Auswahl bestaetigen
        </Button>
      </div>
    </section>
  );
}

// --- Leerer Zustand ----------------------------------------------------------

export function EmptyPanel({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card px-6 py-10 text-center shadow-card">
      <h2 className="text-[15px] font-semibold leading-tight tracking-tight">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        {text}
      </p>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </section>
  );
}

// Kleiner Link, der wie ein Button aussieht -- der Button aus ui/button rendert
// ein <button>, hier braucht es aber echte Navigation.
export function ButtonLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="relative inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,scale] duration-150 ease-[var(--ease-atlas)] [touch-action:manipulation] before:absolute before:-inset-1 before:content-[''] hover:bg-primary/90 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </Link>
  );
}
