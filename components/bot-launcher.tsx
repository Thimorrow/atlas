"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { History, Minus, X } from "lucide-react";
import { AtlasBotMark } from "@/components/atlas-bot-mark";
import { cn } from "@/lib/utils";

// Der Chat-Code (Markdown-Renderer, Karten, Stream-Parser) haengt nicht am
// ersten Rendern der App: er wird erst geholt, wenn jemand den Knopf
// anfasst. Bis dahin kostet der Bot nur diesen Launcher.
const BotChat = dynamic(() => import("@/components/bot-chat").then((m) => m.BotChat), {
  ssr: false,
  // Bewusst kein Spinner: das Panel soll im Moment des Oeffnens fertig
  // aussehen, nicht "am Laden". Die Kopfzeile steht ja schon.
  loading: () => <div className="h-full" />,
});

let prefetched = false;
function prefetchChat() {
  if (prefetched) return;
  prefetched = true;
  void import("@/components/bot-chat");
}

// Atlas-Signaturkurve, wie in components/stagger.tsx.
const EASE = [0.22, 1, 0.36, 1] as const;

// Schwebender Einstieg unten rechts. Bewusst kein Dialog: kein Schleier, kein
// Fokus-Kaefig, kein gesperrter Body -- der Stundenplan dahinter bleibt
// bedienbar, waehrend der Bot offen ist. Einmal im Layout montiert, alle
// Einstiege (Sidebar, Cmd+K) stossen dasselbe Ereignis an.
export function BotLauncher() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const pathname = usePathname();
  // Auf den Bot-Seiten selbst waere der Knopf ein zweiter Weg zum selben
  // Gespraech und legte sich ueber deren Inhalt.
  const onBotPage = pathname.startsWith("/bot");

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onToggle = () => {
      prefetchChat();
      setOpen((o) => !o);
    };
    window.addEventListener("atlas:bot-toggle", onToggle);
    return () => window.removeEventListener("atlas:bot-toggle", onToggle);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      // Nicht feuern, waehrend in einem Feld getippt wird, das selbst Cmd+K
      // braucht (z. B. eine Link-Eingabe) -- ausser dem Bot-Eingabefeld
      // selbst, das Cmd+K ohnehin nicht nutzt.
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) &&
        !el.closest("[data-bot-chat]");
      if (typing) return;
      e.preventDefault();
      prefetchChat();
      setOpen((o) => !o);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (onBotPage) return null;

  return (
    // Der Rahmen deckt die Ecke ab, faengt aber keine Klicks -- nur Panel und
    // Knopf selbst sind anfassbar, alles dahinter bleibt die App.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-end gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pr-[max(1rem,env(safe-area-inset-right))]">
      <AnimatePresence>
        {open && (
          <motion.div
            // Waechst aus dem Knopf: Ursprung unten rechts, dazu ein kurzer
            // Weg nach oben. Beim Schliessen faellt es in denselben Punkt
            // zurueck.
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 12 }}
            transition={{ duration: 0.26, ease: EASE }}
            style={{ transformOrigin: "bottom right" }}
            role="dialog"
            aria-label="Atlas-Bot"
            className={cn(
              "pointer-events-auto flex w-[min(26rem,100%)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-foreground/10",
              // Waechst mit dem Fenster, bleibt aber immer ueber dem Knopf
              // und innerhalb des sichtbaren Bereichs.
              "h-[min(36rem,calc(100svh-9rem))]",
            )}
          >
            <PanelHeader onClose={close} />
            <div data-bot-chat className="min-h-0 flex-1">
              <BotChat autoFocus className="h-full" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => {
          prefetchChat();
          setOpen((o) => !o);
        }}
        onPointerEnter={prefetchChat}
        onFocus={prefetchChat}
        aria-expanded={open}
        aria-label={open ? "Atlas-Bot schließen" : "Atlas-Bot öffnen (⌘K)"}
        title={open ? "Schließen" : "Atlas-Bot (⌘K)"}
        whileTap={reduce ? undefined : { scale: 0.94 }}
        transition={{ duration: 0.16, ease: EASE }}
        className="pointer-events-auto grid size-14 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 outline-none transition-shadow [touch-action:manipulation] hover:shadow-xl hover:shadow-primary/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {/* Zeichen und Kreuz teilen sich den Platz und blenden ineinander --
            der Knopf bleibt derselbe, nur seine Bedeutung dreht sich. */}
        <span className="relative grid size-6 place-items-center">
          <motion.span
            className="absolute inset-0 grid place-items-center"
            animate={{ opacity: open ? 0 : 1, rotate: open ? -90 : 0, scale: open ? 0.6 : 1 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
          >
            <AtlasBotMark className="size-6" />
          </motion.span>
          <motion.span
            className="absolute inset-0 grid place-items-center"
            animate={{ opacity: open ? 1 : 0, rotate: open ? 0 : 90, scale: open ? 1 : 0.6 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
          >
            <X className="size-5" />
          </motion.span>
        </span>
      </motion.button>
    </div>
  );
}

function PanelHeader({ onClose }: { onClose: () => void }) {
  const action =
    "relative grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

  return (
    <header className="flex items-center gap-2.5 border-b bg-gradient-to-b from-muted/50 to-muted/20 px-3.5 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <AtlasBotMark className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[14px] font-semibold tracking-tight">Atlas</p>
        <p className="truncate text-[11.5px] text-muted-foreground">Dein Assistent im Stundenplan</p>
      </div>
      <Link href="/bot/verlauf" onClick={onClose} aria-label="Verlauf öffnen" title="Verlauf" className={action}>
        <History className="size-4" />
      </Link>
      <button type="button" onClick={onClose} aria-label="Schließen" title="Schließen" className={action}>
        <Minus className="size-4" />
      </button>
    </header>
  );
}

// Von Sidebar/Kopfleiste aufgerufen, um das Panel zu oeffnen bzw. zu
// schliessen -- ein CustomEvent statt Context, damit kein Provider noetig ist.
export function toggleBotOverlay() {
  window.dispatchEvent(new Event("atlas:bot-toggle"));
}
