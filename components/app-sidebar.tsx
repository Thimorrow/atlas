"use client";

import { useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  MessagesSquare,
  Inbox,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  LogOut,
} from "lucide-react";
import { AtlasLogo } from "@/components/atlas-logo";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Mod = { label: string; icon: typeof CalendarDays; href?: string; soon?: boolean };

const MODULES: Mod[] = [
  { label: "Kalender", icon: CalendarDays, href: "/" },
  { label: "Nachrichten", icon: MessagesSquare, soon: true },
  { label: "Inbox", icon: Inbox, soon: true },
  { label: "Hermes", icon: Sparkles, soon: true },
];

const EXPANDED = 248;
const COLLAPSED = 56;

export function AppSidebar({ defaultCollapsed = false }: { defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const pathname = usePathname();
  const logoSpin = useAnimationControls();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `atlas-sidebar=${next ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}`;
  };

  // Logo-Spielerei: einmal von oben nach unten durchdrehen, landet wieder gleich.
  const flipLogo = () =>
    logoSpin.start({ rotateX: [0, 360] }, { duration: 1.6, ease: [0.4, 0, 0.2, 1] });

  // Gemeinsame Zeilen-Optik. Icon sitzt zentriert in der Icon-Leiste, Label faded weg.
  const row = "group mx-2 flex h-10 items-center rounded-lg text-sm transition-colors";
  const iconBox = "flex w-10 shrink-0 items-center justify-center";
  const labelCls = (extra?: string) =>
    cn("flex-1 truncate text-left transition-opacity duration-200", collapsed && "pointer-events-none opacity-0", extra);

  return (
    <aside
      className="sticky top-0 hidden h-screen shrink-0 overflow-hidden border-r bg-card/40 md:block"
      style={{
        width: collapsed ? COLLAPSED : EXPANDED,
        transition: "width 280ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Innen feste Breite -> kein Reflow, nur Clipping = flüssig */}
      <div className="flex h-full flex-col" style={{ width: EXPANDED }}>
        {/* Kopf: Wortmarke + Toggle. Crossfade statt Hard-Swap -> kein Pop, swipet mit. */}
        <div className="relative flex h-16 items-center pl-2 pr-2">
          {/* Ausgeklappt: Logo links + Einklapp-Button rechts. Faded weg beim Einklappen. */}
          <div
            className={cn(
              "flex w-full items-center transition-opacity duration-200",
              collapsed && "pointer-events-none opacity-0",
            )}
          >
            <div className={iconBox}>
              <button
                type="button"
                onClick={flipLogo}
                title="Atlas"
                aria-label="Atlas"
                style={{ perspective: 500 }}
                className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground active:scale-[0.96]"
              >
                <motion.span
                  animate={logoSpin}
                  style={{ transformStyle: "preserve-3d" }}
                  className="flex items-center justify-center"
                >
                  <AtlasLogo className="size-[20px]" />
                </motion.span>
              </button>
            </div>
            <button
              onClick={toggle}
              title="Einklappen"
              aria-label="Sidebar einklappen"
              className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.96]"
            >
              <PanelLeftClose className="size-[18px]" />
            </button>
          </div>

          {/* Eingeklappt: Ausklapp-Button am selben linken Slot. Faded ein, kein horizontaler Sprung. */}
          <div
            className={cn(
              "absolute left-2 top-1/2 -translate-y-1/2 transition-opacity duration-200",
              !collapsed && "pointer-events-none opacity-0",
            )}
          >
            <div className={iconBox}>
              <button
                onClick={toggle}
                title="Ausklappen"
                aria-label="Sidebar ausklappen"
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.96]"
              >
                <PanelLeftOpen className="size-[19px]" />
              </button>
            </div>
          </div>
        </div>

        {/* Module */}
        <nav className="flex flex-col gap-0.5 py-2">
          <div className={cn("mx-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-opacity duration-200", collapsed && "opacity-0")}>
            Module
          </div>
          {MODULES.map((m) => {
            const active = !!m.href && (m.href === "/" ? pathname === "/" : pathname.startsWith(m.href));
            const inner = (
              <>
                <span className={iconBox}>
                  <m.icon className="size-[18px]" />
                </span>
                <span className={labelCls()}>{m.label}</span>
                {m.soon && (
                  <span className={cn("mr-2 rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground transition-opacity duration-200", collapsed && "opacity-0")}>
                    bald
                  </span>
                )}
              </>
            );
            return m.href && !m.soon ? (
              <Link
                key={m.label}
                href={m.href}
                title={collapsed ? m.label : undefined}
                className={cn(row, active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground/80 hover:bg-accent/40 hover:text-foreground")}
              >
                {inner}
              </Link>
            ) : (
              <button
                key={m.label}
                disabled
                title={collapsed ? `${m.label} (bald)` : undefined}
                className={cn(row, "cursor-default text-muted-foreground/55")}
              >
                {inner}
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Profil -> Dropdown */}
        <div className="border-t p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center rounded-lg py-1 text-left transition-colors hover:bg-accent/50 data-[state=open]:bg-accent">
                <span className={iconBox}>
                  <span className="flex size-9 items-center justify-center rounded-full border bg-muted text-[12px] font-semibold text-foreground">
                    TZ
                  </span>
                </span>
                <span className={labelCls("leading-tight")}>
                  <span className="block truncate text-[13px] font-medium">Thimofej</span>
                  <span className="block truncate text-[11px] text-muted-foreground">Schüler</span>
                </span>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent side="right" align="end" className="ml-1">
              <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
                <span className="flex size-9 items-center justify-center rounded-full border bg-muted text-[12px] font-semibold">TZ</span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[13px] font-medium">Thimofej</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">thimofej@yesterday-ai.de</span>
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings />
                  Einstellungen
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <LogOut />
                Abmelden
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">bald</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  );
}
