"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListChecks, Library, Settings } from "lucide-react";
import { AtlasLogo } from "@/components/atlas-logo";
import { cn } from "@/lib/utils";

// Schlanke Kopfleiste fuer Mobile (< md) -- die Sidebar ist dort ausgeblendet,
// ohne diese Leiste waere /settings vom Handy aus nicht erreichbar.
export function MobileHeader() {
  const pathname = usePathname();
  const onSettings = pathname.startsWith("/settings");

  const tap =
    "flex size-11 items-center justify-center rounded-md transition-colors [touch-action:manipulation] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    // Polish: bg-card/40 war ohne backdrop-blur -- beim Scrollen schien der
    // Inhalt darunter durch und der Text der Leiste wurde unlesbar. blur statt
    // voller Deckung, damit die gewollte Transluzenz bleibt.
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b bg-card/40 px-2 backdrop-blur-md md:hidden">
      {/* Das Logo ist der Heimweg: ohne Sidebar gaebe es auf dem Handy sonst
          keinen naheliegenden Weg von den Einstellungen zurueck. */}
      <Link href="/" aria-label="Zum Stundenplan" className={cn(tap, "hover:bg-accent")}>
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <AtlasLogo className="size-[20px]" />
        </span>
      </Link>
      <nav className="flex items-center gap-0.5">
      {[
        { href: "/aufgaben", label: "Aufgaben", icon: ListChecks },
        { href: "/faecher", label: "Fächer", icon: Library },
      ].map((m) => {
        const active = pathname.startsWith(m.href);
        return (
          <Link
            key={m.href}
            href={m.href}
            aria-label={m.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              tap,
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <m.icon className="size-[18px]" />
          </Link>
        );
      })}
      <Link
        href="/settings"
        aria-label="Einstellungen"
        aria-current={onSettings ? "page" : undefined}
        className={cn(
          tap,
          onSettings
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Settings className="size-[18px]" />
      </Link>
      </nav>
    </header>
  );
}
