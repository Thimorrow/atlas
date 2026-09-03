"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History, X } from "lucide-react";
import { Overlay } from "@/components/subject-notes";
import { BotChat } from "@/components/bot-chat";

// Zentraler Einstiegspunkt fuer den Atlas-Bot per Cmd+K/Strg+K, einmal im
// Layout montiert -- keine Seite muss das Overlay selbst verdrahten. Der
// sichtbare Einstieg (Sidebar, Kopfleiste) stoesst dasselbe Ereignis an, statt
// eigenen State zu halten.
export function BotOverlayHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("atlas:bot-toggle", onToggle);
    return () => window.removeEventListener("atlas:bot-toggle", onToggle);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
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
      setOpen((o) => !o);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Overlay
      open={open}
      onClose={() => setOpen(false)}
      labelledBy="bot-overlay-title"
      // Waechst mit dem Fenster (mehr Platz fuer die Aktions-/Notenkarten),
      // bleibt auf kleinen Fenstern durch w-full der Basiskomponente
      // trotzdem innerhalb des Viewports.
      className="sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      // Deutlich leichterer Schleier als der App-Standard (der auf
      // Lese-/Bearbeiten-Dialogen bewusst kraeftig ist) -- der Stundenplan
      // dahinter soll erkennbar bleiben. Gleicher Wert wie der
      // Aufgaben-Dialog in assignment-composer.tsx.
      backdropClassName="bg-foreground/25 backdrop-blur-[2px]"
    >
      <header className="flex items-center gap-2 border-b bg-muted/30 px-5 py-3.5">
        <h2 id="bot-overlay-title" className="flex-1 text-[15px] font-semibold leading-tight tracking-tight">
          Atlas-Bot
        </h2>
        <Link
          href="/bot/verlauf"
          onClick={() => setOpen(false)}
          className="relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <History className="size-3.5" />
          Verlauf
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Schließen"
          className="relative -mr-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <X className="size-4" />
        </button>
      </header>
      <div data-bot-chat style={{ height: "min(70svh, 640px)" }}>
        {open && <BotChat autoFocus className="h-full" />}
      </div>
    </Overlay>
  );
}

// Von Sidebar/Kopfleiste aufgerufen, um das Overlay zu oeffnen bzw. zu
// schliessen -- ein CustomEvent statt Context, damit kein Provider noetig ist.
export function toggleBotOverlay() {
  window.dispatchEvent(new Event("atlas:bot-toggle"));
}
