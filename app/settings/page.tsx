"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ChevronLeft, Sun, Moon, Monitor, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const THEMES = [
  { key: "light", label: "Hell", icon: Sun },
  { key: "dark", label: "Dunkel", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
] as const;

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Kopf */}
        <div className="mb-6">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Zurück zum Kalender
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Einstellungen</h1>
          <p className="text-sm text-muted-foreground">Profil und Erscheinungsbild von Atlas.</p>
        </div>

        <div className="space-y-5">
          {/* Profil */}
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Profil</h2>
            <p className="mb-4 text-[13px] text-muted-foreground">Deine Kontodaten.</p>
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full border bg-muted text-lg font-semibold">
                TZ
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="text-[15px] font-medium">Thimofej</div>
                <div className="text-sm text-muted-foreground">Schüler</div>
                <div className="truncate font-mono text-xs text-muted-foreground">thimofej@yesterday-ai.de</div>
              </div>
            </div>
          </section>

          {/* Erscheinungsbild */}
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Erscheinungsbild</h2>
            <p className="mb-4 text-[13px] text-muted-foreground">Hell, dunkel oder dem System folgen.</p>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => {
                const selected = mounted && theme === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTheme(t.key)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-[color,background-color,border-color,transform] active:scale-[0.96]",
                      selected
                        ? "border-primary bg-accent font-medium"
                        : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <t.icon className="size-5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Konto */}
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">Konto</h2>
                <p className="text-[13px] text-muted-foreground">Abmelden kommt mit dem Login (Mehrnutzer).</p>
              </div>
              <button
                disabled
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground opacity-60"
              >
                <LogOut className="size-4" />
                Abmelden
                <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">bald</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
