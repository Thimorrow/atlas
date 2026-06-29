"use client";

import { useEffect, useState } from "react";
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
  ChevronsUpDown,
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
const MIN_W = 180;
const MAX_W = 420;

const clampW = (w: number) => Math.min(MAX_W, Math.max(MIN_W, Math.round(w)));

// Atlas-Signaturkurve (= --ease-atlas), als Array fuer Framer.
const EASE = [0.22, 1, 0.36, 1] as const;

export function AppSidebar({
  defaultCollapsed = false,
  defaultWidth = EXPANDED,
}: {
  defaultCollapsed?: boolean;
  defaultWidth?: number;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [width, setWidth] = useState(clampW(defaultWidth));
  const [resizing, setResizing] = useState(false);
  const pathname = usePathname();
  const logoSpin = useAnimationControls();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `atlas-sidebar=${next ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}`;
  };

  // Drag am rechten Rand -> Breite live anpassen. Pointer-Capture haelt das Ziehen
  // auch ueber dem Content-Bereich. Cookie merkt die Wahl bis zum naechsten Mal.
  const onResizeStart = (e: React.PointerEvent) => {
    if (collapsed) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => setWidth(clampW(startW + (ev.clientX - startX)));
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const finalW = clampW(startW + (ev.clientX - startX));
      document.cookie = `atlas-sidebar-w=${finalW}; path=/; max-age=${60 * 60 * 24 * 365}`;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const resetWidth = () => {
    setWidth(EXPANDED);
    document.cookie = `atlas-sidebar-w=${EXPANDED}; path=/; max-age=${60 * 60 * 24 * 365}`;
  };

  // Logo-Spielerei: einmal von oben nach unten durchdrehen, landet wieder gleich.
  // Rar + bewusst ausgeloest -> Delight erlaubt. 600ms statt 1600ms: ein Flourish,
  // kein Warten. Reduced-Motion-Gate kommt ueber <MotionConfig>.
  const flipLogo = () =>
    logoSpin.start({ rotateX: [0, 360] }, { duration: 0.6, ease: EASE });

  // F08: Logo-Motion ist jetzt allein dem seltenen, bewussten "Heute"-Sprung
  // vorbehalten (flipLogo). Der Nudge bei jeder Pfeil-/Woche-Navigation ist
  // entfallen -- ein peripheres Kippen bei Hochfrequenz-Aktionen zog das Auge
  // unnoetig in die Ecke. Respektiert Emils Frequency-Gate jetzt sauber.
  useEffect(() => {
    const onFocusToday = () => flipLogo();
    window.addEventListener("atlas:focus-today", onFocusToday);
    return () => {
      window.removeEventListener("atlas:focus-today", onFocusToday);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gemeinsame Zeilen-Optik. Icon sitzt zentriert in der Icon-Leiste, Label faded weg.
  const row = "group mx-2 flex h-10 items-center rounded-lg text-sm transition-colors";
  const iconBox = "flex w-10 shrink-0 items-center justify-center";
  const labelCls = (extra?: string) =>
    cn("flex-1 truncate text-left transition-opacity duration-200", collapsed && "pointer-events-none opacity-0", extra);

  return (
    <motion.div
      // Beim Reload slidet die Sidebar von links mit blur + opacity rein --
      // gleicher Auftritt wie die Page-Sections (Split & Stagger), nur aus der
      // Horizontalen. Reduced-Motion-Gate global ueber <MotionConfig>.
      initial={{ opacity: 0, x: -28, filter: "blur(6px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.7, ease: EASE }}
      className="sticky top-0 hidden h-screen shrink-0 md:block"
      style={{
        width: collapsed ? COLLAPSED : width,
        // Beim Ziehen keine Transition -> Breite folgt 1:1 dem Cursor.
        transition: resizing ? "none" : "width 280ms var(--ease-atlas)",
      }}
    >
      <aside className="relative h-full w-full overflow-hidden border-r bg-card/40">
      {/* Innen feste Breite (= aktuelle Ausklapp-Breite) -> kein Reflow, nur Clipping = flüssig */}
      <div className="flex h-full flex-col" style={{ width }}>
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
          <div className={cn("mx-2 pl-10 pr-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-opacity duration-200", collapsed && "opacity-0")}>
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
                className={cn(row, active ? "relative bg-accent font-medium text-foreground before:absolute before:inset-y-2 before:left-1 before:w-[3px] before:rounded-full before:bg-primary" : "text-muted-foreground/80 hover:bg-accent/40 hover:text-foreground")}
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
                <ChevronsUpDown
                  className={cn(
                    "mr-3 size-4 shrink-0 text-muted-foreground/70 transition-opacity duration-200",
                    collapsed && "pointer-events-none opacity-0",
                  )}
                />
              </button>
            </DropdownMenuTrigger>

            {/* Ausgeklappt -> Menue nach oben (sitzt ueber dem Profil, fuehlt sich
                verbunden an). Eingeklappt -> nach rechts neben das Avatar. */}
            <DropdownMenuContent
              side={collapsed ? "right" : "top"}
              align={collapsed ? "end" : "start"}
              className="min-w-[14rem]"
            >
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

      {/* Resize-Griff: sitzt mittig auf der Trennlinie (halb ueber dem Content),
          ausserhalb des aside-Clippings -> ueber die ganze Breite gut greifbar.
          Nur im ausgeklappten Zustand. Doppelklick = zuruecksetzen. */}
      {!collapsed && (
        <div
          onPointerDown={onResizeStart}
          onDoubleClick={resetWidth}
          title="Breite ziehen (Doppelklick: zurücksetzen)"
          role="separator"
          aria-orientation="vertical"
          className="group absolute inset-y-0 right-0 z-20 w-4 translate-x-1/2 cursor-col-resize touch-none"
        >
          <span
            className={cn(
              "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary/50 transition-opacity",
              resizing ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          />
        </div>
      )}
    </motion.div>
  );
}
