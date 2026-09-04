"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import { AssignmentComposer } from "@/components/assignment-composer";
import { useToast } from "@/components/toast";
import { colorValue } from "@/lib/subject-colors";
import { addDays, endOfWeek, localISO, type AssignmentDTO } from "@/lib/assignments-view";
import { cn } from "@/lib/utils";

type SubjectOption = { id: string; name: string; color: string | null };

// Der schnelle Weg fuer den Normalfall: eine Zeile, die aussieht wie die
// Liste selbst, klappt sich beim Fokussieren zu drei Feldern auf und
// speichert per Enter -- kein Dialog fuer die Hausaufgabe, die man "eben noch
// schnell eintraegt". Legt IMMER eine Hausaufgabe an (dieses Modul ist nach
// der Trennung von Klassenarbeiten reine Hausaufgaben-Eingabe); wer einen
// anderen Typ braucht (Referat, Sonstiges) oder eine Notiz dazuschreiben
// will, wechselt ueber "Mehr Optionen" in den vollen Dialog.
export function AssignmentQuickAdd({
  onCreated,
  defaultSubjectId = null,
  placeholder = "Hausaufgabe hinzufügen …",
}: {
  onCreated: (a: AssignmentDTO) => void;
  // Vorbelegtes Fach, wenn der Kontext es schon kennt -- im
  // Vollbild-Stundenmodus (components/jetzt-stunde.tsx) ist das Fach der
  // laufenden Stunde gesetzt, sonst bleibt es wie bisher "Allgemein".
  defaultSubjectId?: string | null;
  placeholder?: string;
}) {
  const reduce = useReducedMotion();
  const toast = useToast();
  const containerRef = useRef<HTMLFormElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? "");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);

  // Faecher erst laden, wenn die Zeile wirklich aufklappt -- auf /aufgaben
  // sonst ein zweiter Request, den ein Besuch ohne Neuanlage nie braucht.
  // Ausnahme: ist ein Fach vorbelegt, muss die Liste sofort da sein, sonst
  // steht im Select eine leere Auswahl statt des vorbelegten Fachs.
  useEffect(() => {
    if ((!expanded && !defaultSubjectId) || subjects.length > 0) return;
    let alive = true;
    fetch("/api/subjects")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setSubjects((d.subjects ?? []) as SubjectOption[]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [expanded, subjects.length, defaultSubjectId]);

  const today = localISO();
  const chips: { label: string; value: string }[] = [
    { label: "Heute", value: today },
    { label: "Morgen", value: addDays(today, 1) },
    { label: "Diese Woche", value: endOfWeek(today) },
  ];

  const collapse = useCallback(() => {
    setExpanded(false);
    setDueDate("");
    // Das zuletzt gewaehlte Fach bleibt stehen -- bei mehreren Aufgaben
    // hintereinander fuer dasselbe Fach spart das jedes Mal die Auswahl.
  }, []);

  const onBlurContainer = (e: React.FocusEvent<HTMLFormElement>) => {
    if (title.trim()) return;
    const next = e.relatedTarget as Node | null;
    if (next && containerRef.current?.contains(next)) return;
    collapse();
  };

  // Escape klappt die Zeile zu und verwirft den Entwurf -- ohne das gibt es
  // keinen Tastatur-Weg zurueck in den Ruhezustand, der Dialog daneben kann
  // das laengst.
  const onKeyDownContainer = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Escape") return;
    setTitle("");
    collapse();
    titleRef.current?.blur();
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          type: "homework",
          subjectId: subjectId || null,
          untisSubject: null,
          dueDate: dueDate || null,
          notes: null,
        }),
      });
      if (!res.ok) throw new Error("create failed");
      const data = (await res.json()) as { assignment: AssignmentDTO };
      onCreated(data.assignment);
      setTitle("");
      setDueDate("");
      setSaving(false);
      // Fokus bleibt im Titelfeld -- wer mehrere Hausaufgaben nacheinander
      // eintraegt, tippt einfach weiter, ohne die Zeile neu anzuklicken.
      titleRef.current?.focus();
    } catch {
      setSaving(false);
      toast("Die Aufgabe konnte nicht angelegt werden.");
    }
  }

  const selectedSubject = subjects.find((s) => s.id === subjectId);

  return (
    <>
      <form
        ref={containerRef}
        onSubmit={save}
        onBlur={onBlurContainer}
        onKeyDown={onKeyDownContainer}
        className={cn(
          "rounded-lg border border-dashed transition-colors",
          expanded ? "border-border bg-card" : "border-transparent hover:border-border hover:bg-accent/40",
        )}
      >
        <div className="flex items-center gap-2.5 px-2.5 py-2.5">
          <Plus className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder={placeholder}
            aria-label="Neue Hausaufgabe"
            autoComplete="off"
            // text-[16px] ist Pflicht (iOS-Zoom), s. assignment-composer.tsx.
            className="w-full min-w-0 flex-1 bg-transparent text-[16px] leading-snug outline-none placeholder:text-muted-foreground"
          />
          {title.trim() && (
            <button
              type="submit"
              disabled={saving}
              className="relative min-h-9 shrink-0 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-[opacity,scale] active:scale-[0.96] disabled:opacity-60 [touch-action:manipulation]"
            >
              {saving ? "Speichert …" : "Hinzufügen"}
            </button>
          )}
        </div>

        {/* grid-template-rows 0fr->1fr statt einer height-Animation: eine CSS-
            Transition ist unterbrechbar (schnelles Auf-zu-Fokussieren kehrt
            sauber um), eine Framer-Keyframe-Animation auf `height` waere das
            nicht und animiert ausserdem eine Layout-Property statt transform/
            opacity. */}
        <div
          // inert statt bloss unsichtbar: eingeklappt duerfen Fach-Select,
          // Chips und Datum nicht per Tab erreichbar sein -- sie sind zwar
          // im DOM (fuer die Transition), aber mit 0fr Zeilenhoehe unsichtbar.
          inert={!expanded}
          className={cn(
            "grid overflow-hidden transition-[grid-template-rows,opacity] ease-[var(--ease-atlas)]",
            reduce ? "duration-0" : "duration-200",
          )}
          style={{ gridTemplateRows: expanded ? "1fr" : "0fr", opacity: expanded ? 1 : 0 }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: selectedSubject ? colorValue(selectedSubject.color) : "var(--muted-foreground)" }}
                />
                <select
                  aria-label="Fach"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="relative rounded-md border bg-background px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring [touch-action:manipulation]"
                >
                  <option value="">Allgemein</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />

                {chips.map((c) => {
                  const active = dueDate === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setDueDate(active ? "" : c.value)}
                      className={cn(
                        "relative rounded-full border px-2.5 py-1.5 text-[13px] transition-colors before:absolute before:-inset-y-2.5 before:content-[''] [touch-action:manipulation]",
                        active
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {c.label}
                    </button>
                  );
                })}

                <input
                  type="date"
                  aria-label="Anderes Datum"
                  value={chips.some((c) => c.value === dueDate) ? "" : dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="relative rounded-md border bg-background px-2 py-1.5 text-[13px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [touch-action:manipulation]"
                />

                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  className="relative ml-auto rounded-md px-2 py-1.5 text-[12.5px] text-muted-foreground underline-offset-2 before:absolute before:-inset-2 before:content-[''] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [touch-action:manipulation]"
                >
                  Mehr Optionen
                </button>
              </div>
            </div>
          </div>
      </form>

      <AssignmentComposer
        open={moreOpen}
        onOpenChange={setMoreOpen}
        subjects={subjects}
        initial={{ title, subjectId, dueDate }}
        onSaved={(a) => {
          onCreated(a);
          setTitle("");
          collapse();
        }}
      />
    </>
  );
}
