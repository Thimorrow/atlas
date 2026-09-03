"use client";

import { useEffect, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  BarChart3,
  CalendarDays,
  GraduationCap,
  ListChecks,
  Library,
  Sunrise,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ChevronsUpDown,
} from "lucide-react";
import { AtlasLogo } from "@/components/atlas-logo";
import { toggleBotOverlay } from "@/components/bot-overlay-host";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { writeCookie } from "@/lib/safe-storage";

type Mod = { label: string; icon: typeof CalendarDays; href: string };

// Reihenfolge nach zeitlicher Naehe: was heute und morgen dran ist, steht
// oben, das Halbjahresbild unten.
const MODULES: Mod[] = [
  { label: "Stundenplan", icon: CalendarDays, href: "/" },
  { label: "Morgen", icon: Sunrise, href: "/morgen" },
  { label: "Aufgaben", icon: ListChecks, href: "/aufgaben" },
  { label: "Prüfungen", icon: GraduationCap, href: "/pruefungen" },
  { label: "Fächer", icon: Library, href: "/faecher" },
  { label: "Noten", icon: BarChart3, href: "/noten" },
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
    writeCookie("atlas-sidebar", next ? "1" : "0", 60 * 60 * 24 * 365);
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
      writeCookie("atlas-sidebar-w", String(finalW), 60 * 60 * 24 * 365);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const resetWidth = () => {
    setWidth(EXPANDED);
    writeCookie("atlas-sidebar-w", String(EXPANDED), 60 * 60 * 24 * 365);
  };

  // A1: Resize-Griff hat role="separator", war aber weder fokussierbar noch per
  // Tastatur bedienbar -- Pfeiltasten verschieben die Breite in 16px-Schritten,
  // Home setzt wie der Doppelklick zurueck. aria-value* macht den Zustand fuer
  // AT lesbar (WAI-ARIA: ein fokussierbarer separator sollte diese tragen).
  const onResizeKeyDown = (e: React.KeyboardEvent) => {
    const STEP = 16;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWidth((w) => {
        const next = clampW(w - STEP);
        writeCookie("atlas-sidebar-w", String(next), 60 * 60 * 24 * 365);
        return next;
      });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setWidth((w) => {
        const next = clampW(w + STEP);
        writeCookie("atlas-sidebar-w", String(next), 60 * 60 * 24 * 365);
        return next;
      });
    } else if (e.key === "Home") {
      e.preventDefault();
      resetWidth();
    }
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
  // A1 (Touch): h-10 (40px) unterschreitet die 44px-Mindesttreffflaeche -- `after`
  // (nicht `before`, das traegt schon den aktiven Marker-Strich) blaeht sie
  // unsichtbar vertikal auf 44px auf.
  const row = "group relative mx-2 flex h-10 items-center rounded-lg text-sm transition-colors after:absolute after:-inset-y-0.5 after:inset-x-0 after:content-['']";
  const iconBox = "flex w-10 shrink-0 items-center justify-center";
  const labelCls = (extra?: string) =>
    cn("flex-1 truncate text-left transition-opacity duration-200", collapsed && "pointer-events-none opacity-0", extra);

  return (
    // Animations-Audit: die Sidebar ist Navigations-Chrome, das bei JEDEM
    // Seitenaufruf an derselben Stelle steht -- kein State-Wechsel, den der
    // Nutzer ausgeloest hat (Skill-Regel 8: Ruhezustand beim Laden bekommt
    // keinen Auftritt). Vorher liefen 700ms mit blur(6px) + translateX --
    // deutlich ueber dem Rahmen fuer Seiten-Transitions (300-400ms) UND ein
    // teurer Blur-Filter auf einer grossen Flaeche bei jedem Reload. Entfernt
    // statt gekuerzt: die Sidebar braucht keinen Auftritt, sie ist einfach da.
    <div
      className="sticky top-0 hidden h-dvh shrink-0 md:block"
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
          {/* Ausgeklappt: Logo links + Einklapp-Button rechts. Faded weg beim Einklappen.
              A1: `inert` (statt nur opacity-0) nimmt den Block bei collapsed=true
              zusaetzlich aus Tab-Reihenfolge UND AT-Baum -- sonst tabbt man auf
              unsichtbare Buttons. */}
          <div
            inert={collapsed}
            className={cn(
              "flex w-full items-center transition-opacity duration-200",
              collapsed && "pointer-events-none opacity-0",
            )}
          >
            <div className={iconBox}>
              {/* A1: `before` blaeht die 36px-Trefferflaeche unsichtbar auf 44px auf. */}
              <button
                type="button"
                onClick={flipLogo}
                title="Atlas"
                aria-label="Atlas"
                style={{ perspective: 500 }}
                className="relative flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground [touch-action:manipulation] before:absolute before:-inset-1 before:content-[''] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
              className="relative ml-auto flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors [touch-action:manipulation] before:absolute before:-inset-1 before:content-[''] hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <PanelLeftClose className="size-[18px]" />
            </button>
          </div>

          {/* Eingeklappt: Ausklapp-Button am selben linken Slot. Faded ein, kein horizontaler Sprung. */}
          <div
            inert={!collapsed}
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
                className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors [touch-action:manipulation] before:absolute before:-inset-1 before:content-[''] hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <PanelLeftOpen className="size-[19px]" />
              </button>
            </div>
          </div>
        </div>

        {/* Module */}
        <nav className="flex flex-col gap-0.5 py-2">
          {/* A2 (Kontrast): /70 auf Kartenweiss faellt auf ~2.7:1 -- unter der
              AA-Mindestgrenze fuer Text. Volle muted-foreground erreicht 4.7:1. */}
          <div className={cn("mx-2 pl-10 pr-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-opacity duration-200", collapsed && "opacity-0")}>
            Module
          </div>
          {MODULES.map((m) => {
            const active = m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
            return (
              <Link
                key={m.label}
                href={m.href}
                title={collapsed ? m.label : undefined}
                className={cn(
                  row,
                  "[touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  // A2 (Kontrast): /80 faellt auf der Karte auf ~3.2:1 -- volle
                  // muted-foreground erreicht 4.7:1 (14px-Text braucht 4.5:1).
                  active ? "relative bg-accent font-medium text-foreground before:absolute before:inset-y-2 before:left-1 before:w-[3px] before:rounded-full before:bg-primary" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
              >
                <span className={iconBox}>
                  <m.icon className="size-[18px]" />
                </span>
                <span className={labelCls()}>{m.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sichtbarer Einstieg zum Atlas-Bot fuer alle, die Cmd+K nicht
            kennen. Bewusst ein Button statt eines Links: er oeffnet das
            Overlay ueber der aktuellen Seite, statt zu /bot zu navigieren. */}
        <div className="mx-2 border-t pt-2">
          <button
            type="button"
            onClick={toggleBotOverlay}
            title={collapsed ? "Atlas-Bot (⌘K)" : undefined}
            className={cn(
              row,
              "mx-0 [touch-action:manipulation] text-muted-foreground hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            <span className={iconBox}>
              <Bot className="size-[18px]" />
            </span>
            <span className={labelCls("flex items-center justify-between gap-2")}>
              Atlas-Bot
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                ⌘K
              </kbd>
            </span>
          </button>
        </div>

        <div className="flex-1" />

        {/* Profil -> Dropdown */}
        <div className="border-t p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  // Eingeklappt: Button auf Avatar-Breite begrenzen. Sonst behaelt
                  // er die volle (geclippte) Innenbreite -> Radix verankert das
                  // Dropdown an der unsichtbaren rechten Kante (~248px) und es
                  // klappt "wo die Sidebar waere" auf statt neben dem Avatar.
                  // A1: relative + after blaeht die Trefferflaeche horizontal auf
                  // (bei collapsed ist w-10=40px sonst knapp unter 44px).
                  "relative flex items-center rounded-lg py-1 text-left transition-colors [touch-action:manipulation] after:absolute after:-inset-x-1 after:inset-y-0 after:content-[''] hover:bg-accent/50 data-[state=open]:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  collapsed ? "w-10" : "w-full",
                )}
              >
                <span className={iconBox}>
                  <span className="flex size-9 items-center justify-center rounded-full border bg-muted text-[12px] font-semibold text-foreground">
                    TZ
                  </span>
                </span>
                <span className={labelCls("leading-tight")}>
                  <span className="block truncate text-[13px] font-medium">Thimofej</span>
                  <span className="block truncate text-[11px] text-muted-foreground">Schüler</span>
                </span>
                {/* A2 (Kontrast): /70 auf der Karte faellt unter 3:1 fuer ein
                    bedeutungstragendes Icon -- volle muted-foreground reicht. */}
                <ChevronsUpDown
                  className={cn(
                    "mr-3 size-4 shrink-0 text-muted-foreground transition-opacity duration-200",
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      </aside>

      {/* Resize-Griff: sitzt mittig auf der Trennlinie (halb ueber dem Content),
          ausserhalb des aside-Clippings -> ueber die ganze Breite gut greifbar.
          Nur im ausgeklappten Zustand. Doppelklick = zuruecksetzen. */}
      {!collapsed && (
        // A1: war weder fokussierbar noch per Tastatur bedienbar -- tabIndex +
        // onKeyDown (Pfeiltasten/Home) holen das nach, aria-value* macht die
        // aktuelle Breite fuer AT lesbar, focus-visible zeigt den Griff auch
        // ohne Maus-Hover (sonst nur ueber :hover erreichbare Sichtbarkeit).
        <div
          onPointerDown={onResizeStart}
          onDoubleClick={resetWidth}
          onKeyDown={onResizeKeyDown}
          title="Breite ziehen (Doppelklick oder Pfeiltasten, Home: zurücksetzen)"
          role="separator"
          aria-orientation="vertical"
          aria-label="Sidebar-Breite"
          aria-valuenow={width}
          aria-valuemin={MIN_W}
          aria-valuemax={MAX_W}
          tabIndex={0}
          className="group absolute inset-y-0 right-0 z-20 w-4 translate-x-1/2 cursor-col-resize touch-none focus-visible:outline-none"
        >
          <span
            className={cn(
              "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary/50 transition-opacity",
              resizing ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          />
        </div>
      )}
    </div>
  );
}
