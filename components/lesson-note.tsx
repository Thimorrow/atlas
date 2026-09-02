"use client";

// Eine Stundennotiz: ein freies Textfeld an genau einer Schulstunde, ohne
// Titel und ohne Dialog-Geruest -- sofort tippbar, speichert sich per
// Autosave selbst. Wird sowohl vom Stundenplan (app/page.tsx) als auch vom
// Fachdetail (components/subject-detail.tsx) geoeffnet.

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Overlay } from "@/components/subject-notes";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

// Was der Aufrufer weiss, ohne dafuer erst die Notiz laden zu muessen -- die
// Kopfzeile steht sofort, der Text folgt.
export type LessonNoteTarget = {
  schoolBlockId: string;
  subject: string;
  dayLabel: string; // "Montag, 02.09."
  time: string; // "08:00" oder "08:00–08:45"
};

type SaveState = "idle" | "loading" | "saving" | "saved" | "error";

export function LessonNoteEditor({
  target,
  onClose,
  onSaved,
}: {
  target: LessonNoteTarget | null;
  onClose: () => void;
  // Meldet nach jedem erfolgreichen Speichern den neuen Stand -- der Aufrufer
  // aktualisiert damit Marker (Stundenplan) bzw. Eintrag (Fachdetail) ohne
  // vollen Reload.
  onSaved: (schoolBlockId: string, hasNote: boolean, body: string) => void;
}) {
  const toast = useToast();
  const open = target !== null;

  const [body, setBody] = useState("");
  const [state, setState] = useState<SaveState>("idle");

  // Letzter bekannter Server-Stand, um beim Schliessen nur zu speichern, wenn
  // sich wirklich etwas geaendert hat.
  const savedBodyRef = useRef("");
  const bodyRef = useRef("");
  bodyRef.current = body;
  const blockIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Race-Schutz: das Feld ist von der ersten Sekunde an tippbar (siehe unten,
  // kein disabled mehr) -- laeuft die GET-Antwort erst NACH dem ersten
  // Tastendruck ein, darf sie den schon getippten Text nicht ueberschreiben.
  const typedRef = useRef(false);

  async function persist(schoolBlockId: string, value: string) {
    setState("saving");
    try {
      const res = await fetch(`/api/lessons/${schoolBlockId}/note`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: value }),
      });
      const data = (await res.json().catch(() => null)) as { note?: { body: string } | null; error?: string } | null;
      if (!res.ok) {
        toast(data?.error ?? "Die Notiz konnte nicht gespeichert werden.");
        setState("error");
        return;
      }
      savedBodyRef.current = value;
      setState("saved");
      onSaved(schoolBlockId, value.trim().length > 0, value);
    } catch {
      toast("Keine Verbindung zum Server. Die Notiz wurde nicht gespeichert.");
      setState("error");
    }
  }

  // Notiz laden, sobald sich das Ziel aendert (neue Stunde geoeffnet).
  useEffect(() => {
    if (!target) return;
    let alive = true;
    blockIdRef.current = target.schoolBlockId;
    typedRef.current = false;
    setState("loading");
    setBody("");
    fetch(`/api/lessons/${target.schoolBlockId}/note`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { note: { body: string } | null }) => {
        if (!alive) return;
        const b = d.note?.body ?? "";
        savedBodyRef.current = b;
        // Nur uebernehmen, wenn der Nutzer seit dem Oeffnen noch nichts
        // eingegeben hat -- sonst reisst die spaet ankommende Antwort den
        // schon getippten Text wieder raus.
        if (!typedRef.current) setBody(b);
        setState("idle");
      })
      .catch(() => {
        if (alive) {
          toast("Die Notiz konnte nicht geladen werden.");
          // Ohne bekannten Server-Stand gilt "noch nichts gespeichert" --
          // sonst vergliche der naechste Autosave-Check gegen den Text der
          // vorher geoeffneten Notiz und würde faelschlich nichts speichern.
          savedBodyRef.current = "";
          setState("idle");
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.schoolBlockId]);

  // Autosave: 700ms nach der letzten Eingabe, nur wenn sich der Text vom
  // zuletzt gespeicherten Stand unterscheidet.
  useEffect(() => {
    if (!target || state === "loading") return;
    if (body === savedBodyRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persist(target.schoolBlockId, body);
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, target?.schoolBlockId]);

  // Speichern beim Schliessen: ein pending Debounce wird sofort ausgeloest
  // statt verworfen -- sonst ginge Text verloren, der noch keine 700ms alt
  // war. Fokus, Escape und Body-Scroll-Sperre uebernimmt Overlay bereits.
  useEffect(() => {
    if (!open) return;
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const id = blockIdRef.current;
      const current = bodyRef.current;
      if (id && current !== savedBodyRef.current) {
        void persist(id, current);
      }
    };
  }, [open]);

  // Cmd/Ctrl+Enter speichert (Autosave laeuft ohnehin) und schliesst gleich
  // mit -- Escape schliesst schon ueber Overlay.
  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onClose();
    }
  }

  const statusLabel =
    state === "saving" ? "Speichert …" : state === "saved" ? "Gespeichert" : state === "error" ? "Fehler" : "";

  return (
    <Overlay open={open} onClose={onClose} labelledBy="lesson-note-title">
      {target ? (
        <>
          <header className="flex items-start gap-2 border-b bg-muted/30 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 id="lesson-note-title" className="text-[16px] font-semibold leading-tight tracking-tight">
                {target.subject}
              </h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {target.dayLabel}, {target.time}
              </p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Notiz schließen" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {/* 16px ist Pflicht, nicht Geschmack: iOS-Safari zoomt beim Fokus
                in jedes kleinere Feld hinein. data-autofocus: Overlay holt sich
                dieses Element beim Oeffnen -- KEIN disabled hier, sonst nimmt
                das Feld gar keinen Fokus an und "sofort tippbar" stimmt nicht. */}
            <textarea
              data-autofocus
              value={body}
              onChange={(e) => {
                typedRef.current = true;
                setBody(e.target.value);
              }}
              onKeyDown={onKeyDown}
              placeholder="Was ist in dieser Stunde passiert?"
              rows={10}
              className="min-h-[220px] w-full resize-y rounded-lg border-0 bg-transparent p-0 text-[16px] leading-relaxed outline-none placeholder:text-muted-foreground"
            />
          </div>
          <footer className="flex items-center justify-end gap-2 border-t px-5 py-2.5">
            <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground" role="status" aria-live="polite">
              {state === "saving" && <Loader2 className="size-3 animate-spin" />}
              <span className={cn(state === "error" && "text-destructive")}>{statusLabel}</span>
            </span>
          </footer>
        </>
      ) : null}
    </Overlay>
  );
}
