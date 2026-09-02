"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Archive, ArchiveRestore, Loader2, Plus, Trash2 } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { Button } from "@/components/ui/button";
import { ColorPicker, EmptyPanel, Modal, ButtonLink } from "@/components/subject-setup";
import type { SubjectDTO } from "@/components/subject-card";
import { AssignmentList } from "@/components/assignment-list";
import { AssignmentComposer } from "@/components/assignment-composer";
import { SubjectNotes } from "@/components/subject-notes";
import { LessonNoteEditor, type LessonNoteTarget } from "@/components/lesson-note";
import { SubjectFiles } from "@/components/subject-files";
import { SubjectGrades } from "@/components/subject-grades";
import { SubjectOnenote, useMicrosoftStatus } from "@/components/subject-onenote";
import { useToast } from "@/components/toast";
import { colorValue } from "@/lib/subject-colors";
import { TEACHER_TITLES } from "@/lib/teacher";
import { cn } from "@/lib/utils";
import { dueLabel, type AssignmentDTO } from "@/lib/assignments-view";
import type { GradeDTO } from "@/lib/grade-store";

export type LessonDTO = {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  room: string | null;
  teacher: string | null;
  status: "regular" | "cancelled" | "substituted";
  substitutionText: string | null;
};

type NoteDTO = {
  id: string;
  subjectId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type LessonNoteEntryDTO = {
  id: string;
  schoolBlockId: string;
  date: string;
  startTime: string;
  body: string;
  updatedAt: string;
};

type Payload = {
  subject: SubjectDTO;
  notes: NoteDTO[];
  assignments: AssignmentDTO[];
  upcoming: LessonDTO[];
  grades: GradeDTO[];
  lessonNotes: LessonNoteEntryDTO[];
};

// 16px ist Pflicht, nicht Geschmack: iOS-Safari zoomt beim Fokus in jedes Feld
// darunter hinein und schiebt den halben Dialog aus dem Bild.
const FIELD =
  "h-11 w-full rounded-lg border bg-background px-3 text-[16px] transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const hm = (t: string) => t.slice(0, 5);

// "02.09.2026" fuer den Kopf einer Stundennotiz -- date kommt als YYYY-MM-DD.
function fmtLessonDate(dateISO: string) {
  const [y, m, d] = dateISO.split("-");
  return `${d}.${m}.${y}`;
}

// Neuste zuerst -- dieselbe Reihenfolge wie die API liefert, gebraucht beim
// Wiedereinfuegen eines Eintrags nach dem Speichern (siehe onSaved unten).
const byLessonDateDesc = (a: LessonNoteEntryDTO, b: LessonNoteEntryDTO) =>
  b.date === a.date ? b.startTime.localeCompare(a.startTime) : b.date.localeCompare(a.date);

// Zwei Knoepfe statt eines Auswahlfeldes: bei genau zwei Moeglichkeiten ist die
// Auswahl schon sichtbar, ein Aufklappen waere ein Schritt zu viel.
function TitlePicker({
  value,
  onChange,
}: {
  value: "herr" | "frau";
  onChange: (v: "herr" | "frau") => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Anrede"
      className="flex h-11 shrink-0 items-center gap-0.5 rounded-lg border bg-background p-0.5"
    >
      {TEACHER_TITLES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={value === t.value}
          onClick={() => value !== t.value && onChange(t.value)}
          className={cn(
            "h-full rounded-[6px] px-3 text-[14px] transition-colors [touch-action:manipulation]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === t.value
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3">
        <h2 className="text-[15px] font-semibold leading-tight tracking-tight">{title}</h2>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function SubjectDetail({ id }: { id: string }) {
  const toast = useToast();
  // Einmal pro Seite abgefragt: die Abschnittswahl und der Sende-Knopf an der
  // Notiz haengen an derselben Auskunft.
  const microsoft = useMicrosoftStatus();
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");

  // Stammdaten-Entwurf: die Felder sind direkt beschreibbar und speichern beim
  // Verlassen des Feldes, damit es keinen separaten "Bearbeiten"-Modus braucht.
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [noteTarget, setNoteTarget] = useState<LessonNoteTarget | null>(null);
  // date/startTime der gerade geoeffneten Stundennotiz -- gebraucht, um einen
  // Eintrag nach dem Leeren+Wiederbeschreiben an der richtigen Stelle zurueck
  // in die Liste einzufuegen (siehe onSaved am LessonNoteEditor unten).
  const [noteMeta, setNoteMeta] = useState<{ date: string; startTime: string } | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/subjects/${id}`);
      if (res.status === 404) {
        setState("missing");
        return;
      }
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      const json = (await res.json()) as Payload;
      setData(json);
      setName(json.subject.name);
      setTeacher(json.subject.teacher ?? "");
      setRoom(json.subject.room ?? "");
      setState("ready");
    } catch {
      setState("failed");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/subjects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Speichern fehlgeschlagen");
      setData((prev) => (prev ? { ...prev, subject: json.subject as SubjectDTO } : prev));
    } catch (e) {
      toast((e as Error).message || "Die Änderung konnte nicht gespeichert werden.");
      // Zurueck auf den zuletzt bestaetigten Serverstand, statt eine Aenderung
      // stehen zu lassen, die gar nicht angekommen ist.
      if (data) {
        setName(data.subject.name);
        setTeacher(data.subject.teacher ?? "");
        setRoom(data.subject.room ?? "");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/subjects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
      // Voller Reload statt router.push: die Uebersicht laedt ihre Zahlen ohnehin
      // frisch, und der geloeschte Eintrag darf nirgends im Cache stehenbleiben.
      window.location.href = "/faecher";
    } catch (e) {
      toast((e as Error).message || "Das Fach konnte nicht gelöscht werden.");
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (state === "loading") {
    return (
      <Shell>
        <div className="flex items-center gap-2 rounded-2xl border bg-card px-5 py-8 text-sm text-muted-foreground shadow-card">
          <Loader2 className="size-4 animate-spin" />
          Fach wird geladen…
        </div>
      </Shell>
    );
  }

  if (state === "missing") {
    return (
      <Shell>
        <EmptyPanel
          title="Fach nicht gefunden"
          text="Dieses Fach gibt es nicht mehr. Vielleicht wurde es gelöscht."
        >
          <ButtonLink href="/faecher">Zurück zu den Fächern</ButtonLink>
        </EmptyPanel>
      </Shell>
    );
  }

  if (state === "failed" || !data) {
    return (
      <Shell>
        <EmptyPanel
          title="Das Fach konnte nicht geladen werden"
          text="Prüf deine Verbindung und versuch es noch einmal."
        >
          <Button variant="outline" onClick={() => void load()}>
            Erneut versuchen
          </Button>
        </EmptyPanel>
      </Shell>
    );
  }

  const subject = data.subject;
  const archived = Boolean(subject.archivedAt);

  return (
    <Shell>
      <StaggerItem>
        <Link
          href="/faecher"
          className="relative mb-4 inline-flex items-center gap-1 rounded text-sm text-muted-foreground transition-colors [touch-action:manipulation] before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ChevronLeft className="size-4" />
          Alle Fächer
        </Link>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: colorValue(subject.color) }}
          />
          <h1 className="min-w-0 truncate text-xl font-semibold leading-tight tracking-tight">
            {subject.name}
          </h1>
          {archived && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Archiviert
            </span>
          )}
        </div>
      </StaggerItem>

      {/* --- Noten ---
          Steht bewusst ganz oben: der Schnitt ist die Zahl, wegen der diese
          Seite ueberhaupt geoeffnet wird. Stammdaten sind Einstellungen. */}
      <StaggerItem>
        <Section title="Noten">
          <SubjectGrades
            subjectId={subject.id}
            initialGrades={data.grades}
            initialOralWeight={subject.oralWeight}
          />
        </Section>
      </StaggerItem>

      {/* --- Stammdaten --- */}
      <StaggerItem>
        <Section title="Stammdaten">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium">Name</span>
              <input
                className={FIELD}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  const v = name.trim();
                  if (!v) {
                    setName(subject.name);
                    return;
                  }
                  if (v !== subject.name) void patch({ name: v });
                }}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium">Lehrer</span>
                {/* Untis kennt nur den Nachnamen, nicht das Geschlecht. Die
                    Anrede sitzt deshalb direkt am Feld statt in einer eigenen
                    Zeile -- sie ist Teil desselben Namens, keine zweite
                    Einstellung. */}
                <div className="flex gap-2">
                  <TitlePicker
                    value={subject.teacherTitle}
                    onChange={(v) => void patch({ teacherTitle: v })}
                  />
                  <input
                    className={FIELD}
                    value={teacher}
                    placeholder="Nicht hinterlegt"
                    onChange={(e) => setTeacher(e.target.value)}
                    onBlur={() => {
                      const v = teacher.trim();
                      if (v !== (subject.teacher ?? "")) void patch({ teacher: v || null });
                    }}
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium">Raum</span>
                <input
                  className={FIELD}
                  value={room}
                  placeholder="Nicht hinterlegt"
                  onChange={(e) => setRoom(e.target.value)}
                  onBlur={() => {
                    const v = room.trim();
                    if (v !== (subject.room ?? "")) void patch({ room: v || null });
                  }}
                />
              </label>
            </div>
            <div>
              <span className="mb-1 block text-[13px] font-medium">Farbe</span>
              <ColorPicker
                value={subject.color}
                onChange={(token) => void patch({ color: token })}
                label="Farbe des Fachs"
              />
            </div>
            <p className="text-[12px] text-muted-foreground">
              Änderungen werden gespeichert, sobald du das Feld verlässt.
            </p>
          </div>
        </Section>
      </StaggerItem>

      {/* --- Aktionen --- */}
      <StaggerItem>
        <Section title="Aktionen">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void patch({ archivedAt: archived ? null : "now" })}
            >
              {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              {archived ? "Reaktivieren" : "Archivieren"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
              Löschen
            </Button>
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Archivieren nimmt das Fach nur aus der Übersicht. Es taucht auch nach einem neuen
            Untis-Abgleich nicht wieder auf.
          </p>
        </Section>
      </StaggerItem>

      {/* --- Naechste Stunden --- */}
      <StaggerItem>
        <Section title="Nächste Stunden">
          {data.upcoming.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Keine kommenden Stunden</p>
          ) : (
            <ul className="divide-y">
              {data.upcoming.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
                  <span className="w-32 shrink-0 font-medium">{dueLabel(l.date)}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {hm(l.startTime)}
                    {l.endTime ? `–${hm(l.endTime)}` : ""}
                  </span>
                  {l.room && <span className="text-muted-foreground">{l.room}</span>}
                  {/* Chips im Stil des Stundenplans: Vertretung bernstein,
                      Ausfall leise grau mit rotem Punkt. */}
                  {l.status === "substituted" && (
                    <span className="inline-flex rounded bg-amber-500/20 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
                      Vertretung
                    </span>
                  )}
                  {l.status === "cancelled" && (
                    <span className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 text-[11px] font-medium text-muted-foreground">
                      <span aria-hidden="true" className="size-1 rounded-full bg-red-500/40" />
                      Entfällt
                    </span>
                  )}
                  {l.substitutionText && (
                    <span className="text-muted-foreground">{l.substitutionText}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </StaggerItem>

      {/* --- Aufgaben --- */}
      <StaggerItem>
        <Section
          title="Aufgaben"
          action={
            <Button variant="ghost" size="sm" onClick={() => setComposing(true)}>
              <Plus className="size-4" />
              Aufgabe hinzufügen
            </Button>
          }
        >
          <AssignmentList
            assignments={data.assignments}
            onChange={(next) => setData((prev) => (prev ? { ...prev, assignments: next } : prev))}
            grouped={false}
            showSubject={false}
            emptyLabel="Keine Aufgaben in diesem Fach."
          />
        </Section>
      </StaggerItem>

      {/* --- Notizen --- */}
      <StaggerItem>
        <Section title="Notizen">
          <SubjectNotes
            subjectId={subject.id}
            initialNotes={data.notes}
            onenoteReady={Boolean(microsoft?.connected && subject.onenoteSectionId)}
          />
        </Section>
      </StaggerItem>

      {/* --- Stundennotizen ---
          Anders als "Notizen" oben (frei angelegt, mit Titel) haengt hier
          jeder Eintrag an einer konkreten Schulstunde -- chronologisch nach
          Datum, ohne Titel, klickbar zum Bearbeiten. */}
      <StaggerItem>
        <Section title="Stundennotizen">
          {data.lessonNotes.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Noch keine Stundennotizen.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.lessonNotes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setNoteMeta({ date: n.date, startTime: n.startTime });
                      setNoteTarget({
                        schoolBlockId: n.schoolBlockId,
                        subject: subject.name,
                        dayLabel: fmtLessonDate(n.date),
                        time: hm(n.startTime),
                        color: colorValue(subject.color),
                      });
                    }}
                    className="relative flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-xl border bg-card px-4 py-3 text-left transition-colors [touch-action:manipulation] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span className="text-[12px] font-medium tabular-nums text-muted-foreground">
                      {fmtLessonDate(n.date)}, {hm(n.startTime)}
                    </span>
                    <span className="line-clamp-2 w-full text-[13px] text-foreground">{n.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </StaggerItem>

      {/* --- OneNote --- */}
      <StaggerItem>
        <Section title="OneNote">
          <SubjectOnenote
            subjectId={subject.id}
            status={microsoft}
            sectionId={subject.onenoteSectionId}
            sectionName={subject.onenoteSectionName}
            onChange={(next) =>
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      subject: {
                        ...prev.subject,
                        onenoteSectionId: next.id,
                        onenoteSectionName: next.name,
                      },
                    }
                  : prev,
              )
            }
          />
        </Section>
      </StaggerItem>

      {/* --- Dateien --- */}
      <StaggerItem>
        <Section title="Dateien">
          <SubjectFiles subjectId={subject.id} />
        </Section>
      </StaggerItem>

      <AssignmentComposer
        open={composing}
        onOpenChange={setComposing}
        subjects={[{ id: subject.id, name: subject.name, color: subject.color }]}
        initial={{ subjectId: subject.id }}
        onSaved={(a) =>
          setData((prev) => (prev ? { ...prev, assignments: [a, ...prev.assignments] } : prev))
        }
      />

      {/* Eigenes Bestaetigungs-Overlay statt window.confirm -- und es benennt
          ausdruecklich, was mitgeht und was bleibt. */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`„${subject.name}“ löschen?`}
        description="Das lässt sich nicht rückgängig machen."
      >
        <ul className="space-y-1.5 text-[13px] text-muted-foreground">
          <li>Die Notizen dieses Fachs werden mit gelöscht.</li>
          <li>Die Dateien dieses Fachs werden mit gelöscht.</li>
          <li>
            <span className="text-foreground">Die Aufgaben bleiben erhalten</span> und laufen danach
            unter „Allgemein“.
          </li>
        </ul>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Willst du das Fach nur aus der Übersicht nehmen, archivier es lieber.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Abbrechen
          </Button>
          <Button
            disabled={busy}
            onClick={() => void remove()}
            // Es gibt kein --destructive-foreground-Token: text-background traegt
            // in beiden Themes (helles Rot/dunkle Schrift bzw. umgekehrt).
            className="bg-destructive text-background hover:bg-destructive/90"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Endgültig löschen
          </Button>
        </div>
      </Modal>

      <LessonNoteEditor
        target={noteTarget}
        onClose={() => setNoteTarget(null)}
        onSaved={(schoolBlockId, hasNote, body) =>
          setData((prev) => {
            if (!prev) return prev;
            if (!hasNote) {
              // Leer gespeichert -> aus der Chronik raus.
              return { ...prev, lessonNotes: prev.lessonNotes.filter((n) => n.schoolBlockId !== schoolBlockId) };
            }
            const exists = prev.lessonNotes.some((n) => n.schoolBlockId === schoolBlockId);
            if (exists) {
              // Nur den Text aktualisieren, die Reihenfolge (Datum) aendert
              // sich durch eine Bearbeitung nicht.
              return {
                ...prev,
                lessonNotes: prev.lessonNotes.map((n) => (n.schoolBlockId === schoolBlockId ? { ...n, body } : n)),
              };
            }
            // War vorher leer und ist im selben geoeffneten Overlay wieder
            // beschrieben worden -- der Eintrag fehlt noch in der Liste
            // (onSaved mit hasNote=false hat ihn rausgefiltert). noteMeta
            // traegt date/startTime derselben Stunde, die aendern sich beim
            // erneuten Speichern nicht.
            if (!noteMeta) return prev;
            const entry: LessonNoteEntryDTO = {
              id: schoolBlockId,
              schoolBlockId,
              date: noteMeta.date,
              startTime: noteMeta.startTime,
              body,
              updatedAt: new Date().toISOString(),
            };
            return { ...prev, lessonNotes: [...prev.lessonNotes, entry].sort(byLessonDateDesc) };
          })
        }
      />
    </Shell>
  );
}

// Gleicher scrollbarer Container wie /settings: die Layout-Hoehe ist fix.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="h-full overflow-y-auto px-6 pt-6 pb-8 lg:px-8">
      <Stagger className="mx-auto max-w-2xl space-y-6">{children}</Stagger>
    </main>
  );
}
