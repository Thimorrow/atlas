"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  ChevronLeft,
  Sun,
  Moon,
  Monitor,
  LogOut,
  User,
  Palette,
  CalendarClock,
  RefreshCw,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Stagger, StaggerItem, SplitText } from "@/components/stagger";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const THEMES = [
  { key: "light", label: "Hell", icon: Sun },
  { key: "dark", label: "Dunkel", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
] as const;

// Mini-Vorschau pro Theme -> Tiles wirken weniger leer, man "sieht" die Wahl.
const PREVIEW: Record<string, { box: string; bar: string; barDim: string }> = {
  light: { box: "bg-white", bar: "bg-zinc-800/80", barDim: "bg-zinc-300" },
  dark: { box: "bg-zinc-900", bar: "bg-zinc-100/80", barDim: "bg-zinc-600" },
  system: { box: "bg-gradient-to-br from-white to-zinc-900", bar: "bg-zinc-500", barDim: "bg-zinc-400/60" },
};

type SyncState =
  | { ok: true; fetched: number; upserted: number; window: { start: string; end: string } }
  | { ok: false; error: string };

const fmtDay = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
};

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof User;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex items-start gap-3 border-b bg-muted/30 px-5 py-4">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight tracking-tight">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{desc}</p>
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sync, setSync] = useState<SyncState | null>(null);

  useEffect(() => setMounted(true), []);

  async function runSync() {
    setSyncing(true);
    setSync(null);
    try {
      const res = await fetch("/api/sync/untis", { method: "POST" });
      const data = await res.json();
      setSync(
        data.ok
          ? { ok: true, fetched: data.fetched, upserted: data.upserted, window: data.window }
          : { ok: false, error: data.error ?? "Unbekannter Fehler" },
      );
    } catch (e) {
      setSync({ ok: false, error: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="h-full overflow-y-auto px-6 py-8 lg:px-8">
      <Stagger className="mx-auto max-w-2xl space-y-6">
        {/* Kopf -- Back-Link nur auf Mobile (dort fehlt die Sidebar). */}
        <StaggerItem>
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground md:hidden"
          >
            <ChevronLeft className="size-4" />
            Zurück zum Kalender
          </Link>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight">
            <SplitText text="Einstellungen" />
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Profil, Erscheinungsbild und Datenquellen von Atlas.
          </p>
        </StaggerItem>

        {/* Profil */}
        <StaggerItem>
          <Section icon={User} title="Profil" desc="Deine Kontodaten.">
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full border bg-muted text-xl font-semibold">
                TZ
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-base font-medium leading-tight">Thimofej</div>
                <div className="text-sm text-muted-foreground">Schüler</div>
                <div className="truncate font-mono text-xs text-muted-foreground">
                  thimofej@yesterday-ai.de
                </div>
              </div>
              <span className="ml-auto self-start rounded-md bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                bald bearbeitbar
              </span>
            </div>
          </Section>
        </StaggerItem>

        {/* Erscheinungsbild */}
        <StaggerItem>
          <Section icon={Palette} title="Erscheinungsbild" desc="Hell, dunkel oder dem System folgen.">
            <div className="grid grid-cols-3 gap-3">
              {THEMES.map((t) => {
                const selected = mounted && theme === t.key;
                const p = PREVIEW[t.key];
                return (
                  <button
                    key={t.key}
                    onClick={() => setTheme(t.key)}
                    aria-pressed={selected}
                    className={cn(
                      // `isolate` = eigener Stacking-Context, sonst verschwindet der
                      // `-z-10`-Indikator hinter der opaken bg-card.
                      "relative isolate flex flex-col items-center gap-2.5 rounded-xl border p-3 text-sm transition-[color,transform] active:scale-[0.97]",
                      selected
                        ? "border-transparent font-medium text-foreground"
                        : "border-border/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    {selected && (
                      <motion.span
                        layoutId="theme-active"
                        className="absolute inset-0 -z-10 rounded-xl border-2 border-primary bg-primary/10"
                        transition={{ type: "spring", stiffness: 500, damping: 46 }}
                      />
                    )}
                    {/* Mini-Mock des jeweiligen Modes */}
                    <span className={cn("flex h-11 w-full items-center gap-2 rounded-lg border p-2", p.box)}>
                      <span className="size-4 shrink-0 rounded-full border border-black/10 bg-primary/70" />
                      <span className="flex-1 space-y-1.5">
                        <span className={cn("block h-1.5 w-4/5 rounded-full", p.bar)} />
                        <span className={cn("block h-1.5 w-3/5 rounded-full", p.barDim)} />
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <t.icon className="size-4" />
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        </StaggerItem>

        {/* Stundenplan / Untis-Sync -- echte Funktion */}
        <StaggerItem>
          <Section
            icon={CalendarClock}
            title="Stundenplan"
            desc="WebUntis-Stunden in deinen Kalender importieren."
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-muted-foreground">
                Lädt das Fenster <span className="font-medium text-foreground">letzte Woche bis +3 Wochen</span> und
                gleicht es idempotent ab.
              </p>
              <Button onClick={runSync} disabled={syncing} size="sm" variant="outline">
                <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
                {syncing ? "Synchronisiere…" : "Jetzt synchronisieren"}
              </Button>
            </div>

            {sync && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className={cn(
                  "mt-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px]",
                  sync.ok
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                )}
              >
                {sync.ok ? (
                  <Check className="mt-px size-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-px size-4 shrink-0" />
                )}
                <span className="leading-snug">
                  {sync.ok ? (
                    <>
                      <span className="font-medium">{sync.fetched} Stunden geladen</span>, {sync.upserted} aktualisiert.
                      <span className="block text-muted-foreground">
                        Zeitraum {fmtDay(sync.window.start)} – {fmtDay(sync.window.end)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">Sync fehlgeschlagen.</span>
                      <span className="block break-words font-mono text-xs opacity-80">{sync.error}</span>
                    </>
                  )}
                </span>
              </motion.div>
            )}
          </Section>
        </StaggerItem>

        {/* Konto */}
        <StaggerItem>
          <Section icon={LogOut} title="Konto" desc="Abmelden kommt mit dem Login (Mehrnutzer).">
            <Button disabled variant="outline" size="sm">
              <LogOut className="size-4" />
              Abmelden
              <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                bald
              </span>
            </Button>
          </Section>
        </StaggerItem>

        {/* Fuss */}
        <StaggerItem>
          <p className="pt-1 text-center text-xs text-muted-foreground/70">
            Atlas · Dein Alltag an einem Ort.
          </p>
        </StaggerItem>
      </Stagger>
    </main>
  );
}
