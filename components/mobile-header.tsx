"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, CalendarDays, IdCard, ListChecks, Library, MoreHorizontal, Radio, Settings } from "lucide-react";
import { namensschildSichtbar } from "@/components/app-sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function MobileHeader() {
  const pathname = usePathname();
  const [namensschildAn, setNamensschildAn] = useState(true);
  useEffect(() => {
    const sync = () => setNamensschildAn(namensschildSichtbar());
    sync();
    window.addEventListener("atlas:modules", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("atlas:modules", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const tap = "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-0.5 py-2 text-[11px] leading-tight [touch-action:manipulation] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";
  const secondaryActive = pathname.startsWith("/settings") || pathname.startsWith("/namensschild");

  return (
    <footer className="z-30 shrink-0 border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <nav aria-label="Hauptnavigation" className="grid grid-cols-6 gap-0.5">
        {[
          { href: "/", label: "Plan", ariaLabel: "Stundenplan", icon: CalendarDays },
          { href: "/stunde", label: "Stunde", icon: Radio },
          { href: "/aufgaben", label: "Aufgaben", icon: ListChecks },
          { href: "/faecher", label: "Fächer", icon: Library },
          { href: "/lernen", label: "Lernen", icon: Brain },
        ].map((m) => {
          const active = m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
          return (
            <Link key={m.href} href={m.href} aria-label={m.ariaLabel ?? m.label} aria-current={active ? "page" : undefined}
              className={cn(tap, active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
              <m.icon aria-hidden className="size-[18px]" />
              <span>{m.label}</span>
            </Link>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(tap, secondaryActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
              <MoreHorizontal aria-hidden className="size-[18px]" />
              <span>Mehr</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            {namensschildAn && <DropdownMenuItem asChild><Link href="/namensschild" className="min-h-11"><IdCard aria-hidden className="size-4" />Namensschild</Link></DropdownMenuItem>}
            <DropdownMenuItem asChild><Link href="/settings" className="min-h-11"><Settings aria-hidden className="size-4" />Einstellungen</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </footer>
  );
}
