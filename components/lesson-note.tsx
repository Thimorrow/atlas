"use client";

// Eine Stundennotiz: ein freies Textfeld an genau einer Schulstunde, ohne
// Titel und ohne Dialog-Geruest -- sofort tippbar, speichert sich per
// Autosave selbst. Wird sowohl vom Stundenplan (app/page.tsx) als auch vom
// Fachdetail (components/subject-detail.tsx) geoeffnet.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
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
  // Fertiger CSS-Farbwert (aus fachFarbe / colorValue), kein Token-Name --
  // das Overlay traegt damit denselben linken Fachrand wie der Stundenplan-
  // Block, aus dem es geoeffnet wurde. Ohne Treffer bleibt der Rand weg.
  color?: string | null;
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
  const reduce = useReducedMotion();

  const [body, setBody] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Autowachsendes Feld: field-sizing: content waere die einfachere Loesung,
  // traegt aber in Firefox (das hier im Einsatz ist) noch nicht -- deshalb
  // Hoehe manuell aus scrollHeight ableiten. useLayoutEffect statt onChange,
  // damit auch eine frisch geladene Notiz sofort in passender Hoehe steht,
  // nicht erst beim ersten Tastendruck. Die Obergrenze (max-h-[40svh]) und
  // das interne Scrollen traegt CSS -- hier wird nur die natuerliche Hoehe
  // gesetzt, ein Ueberschreiten faengt max-height plus overflow-y-auto ab.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body, open]);

  // Tastenkuerzel-Anzeige ist plattformabhaengig (⌘ auf macOS, Strg sonst).
  // navigator ist erst nach der Hydration verlaesslich bekannt -- ein direktes
  // Lesen im Render wuerde SSR und ersten Client-Render auseinanderlaufen
  // lassen (Hydration-Mismatch). Start neutral (Strg, der haeufigere Fall),
  // die Korrektur fuer Mac laeuft erst im Effekt nach dem Mount.
  const [modKey, setModKey] = useState("Strg");
  useEffect(() => {
    if (/Mac/.test(navigator.userAgent)) setModKey("⌘");
  }, []);

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
          {/* Fachrand: Overlay hat kein style-Prop (subject-notes.tsx bleibt
              unangetastet) und eine Tailwind-Klasse kann keinen zur Laufzeit
              bestimmten Farbwert tragen -- deshalb ein eigener Balken statt
              eines echten border-left auf dem Panel. absolute + inset-y-0
              plus das overflow-hidden des Panels (aus Overlay) sorgen dafuer,
              dass er an den runden Ecken sauber mitgeclippt wird, genau wie
              die 3px-Kante an den Stundenplan-Bloecken in app/page.tsx. Ohne
              Farbe entfaellt der Balken komplett, kein Platzhalter-Rand. */}
          {target.color ? (
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: target.color }} />
          ) : null}
          <header className="flex items-start gap-2 px-5 pt-4">
            <div className="min-w-0 flex-1">
              <h3 id="lesson-note-title" className="text-[16px] font-semibold leading-tight tracking-tight">
                {target.subject}
              </h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {target.dayLabel}, {target.time}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notiz schließen"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground focus-visible:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </header>
          <div className="flex flex-col px-5 pt-2 pb-4">
            {/* 16px ist Pflicht, nicht Geschmack: iOS-Safari zoomt beim Fokus
                in jedes kleinere Feld hinein. data-autofocus: Overlay holt sich
                dieses Element beim Oeffnen -- KEIN disabled hier, sonst nimmt
                das Feld gar keinen Fokus an und "sofort tippbar" stimmt nicht.
                Keine feste Hoehe mehr: min-h-24 (~4 Zeilen) ist der Start,
                der useLayoutEffect oben zieht die Hoehe danach am Inhalt
                nach -- max-h-[40svh]+overflow-y-auto fangen sehr lange
                Notizen auf, statt das Panel endlos wachsen zu lassen. Die
                Transition auf height haelt das Wachsen ruhig, respektiert
                aber prefers-reduced-motion. resize-none: der Ziehgriff war in
                diesem randlosen Feld ohnehin kaum zu treffen und auf Touch
                nutzlos. touch-action manipulation verhindert den
                Doppeltipp-Zoom beim Tippen mitten im Text. */}
            <textarea
              ref={textareaRef}
              data-autofocus
              value={body}
              onChange={(e) => {
                typedRef.current = true;
                setBody(e.target.value);
              }}
              onKeyDown={onKeyDown}
              placeholder="Was ist in dieser Stunde passiert?"
              rows={4}
              className={cn(
                "min-h-24 w-full max-h-[40svh] resize-none overflow-y-auto rounded-lg border-0 bg-transparent p-0 text-[16px] leading-relaxed outline-none [touch-action:manipulation] placeholder:text-muted-foreground",
                !reduce && "transition-[height] duration-150 ease-[var(--ease-atlas)]",
              )}
            />
          </div>
          {/* min-h-11 statt von statusLabel bestimmt: bei state "idle" ist
              statusLabel anfangs ein leerer String, ohne Mindesthoehe waere
              die Fusszeile dann rund 16px niedriger und spraenge beim ersten
              Speichern auf. pb ergaenzt das untere Safe-Area-Inset (min-h
              statt h, damit dieses Polster die Zeile wachsen laesst statt
              ihren Inhalt zu clippen) -- das Overlay liegt fixed inset-0 und
              damit ausserhalb des Layout-Containers aus app/layout.tsx, der
              dieses Polster traegt (siehe dort), sonst klebt die Fusszeile
              auf dem iPhone am Home-Balken. Kein eigenes Band mehr (weder
              Trennlinie noch Toenung) -- der Status steht ruhig unter dem Feld. */}
          <footer className="flex min-h-11 items-center justify-between gap-2 px-5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
            {state === "idle" && !statusLabel ? (
              <p className="truncate text-[11px] text-muted-foreground">
                Speichert automatisch · {modKey} + Enter zum Schließen
              </p>
            ) : (
              <span />
            )}
            <span
              className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {/* Spinner-Slot immer vorhanden statt nur bei state "saving"
                  gerendert: sonst schiebt sein Erscheinen den Text mit an --
                  invisible haelt den Platz, ohne ihn zu zeigen. */}
              <Loader2 className={cn("size-3 animate-spin", state !== "saving" && "invisible")} />
              {/* Feste Mindestbreite auf den laengsten moeglichen Text, sonst
                  wandert die ganze Zeile bei jedem Statuswechsel. */}
              <span className={cn("inline-block min-w-[11ch]", state === "error" && "text-destructive")}>
                {statusLabel}
              </span>
            </span>
          </footer>
        </>
      ) : null}
    </Overlay>
  );
}
