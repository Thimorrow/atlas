"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { AtlasLogo } from "@/components/atlas-logo";

// Schlanke Kopfleiste fuer Mobile (< md) -- die Sidebar ist dort ausgeblendet,
// ohne diese Leiste waere /settings vom Handy aus nicht erreichbar.
export function MobileHeader() {
  return (
    // Polish: bg-card/40 war ohne backdrop-blur -- beim Scrollen schien der
    // Inhalt darunter durch und der Text der Leiste wurde unlesbar. blur statt
    // voller Deckung, damit die gewollte Transluzenz bleibt.
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b bg-card/40 px-2 backdrop-blur-md md:hidden">
      <div className="flex size-11 items-center justify-center">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <AtlasLogo className="size-[20px]" />
        </span>
      </div>
      <Link
        href="/settings"
        aria-label="Einstellungen"
        className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors [touch-action:manipulation] hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Settings className="size-[18px]" />
      </Link>
    </header>
  );
}
