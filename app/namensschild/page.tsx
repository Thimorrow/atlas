"use client";

import { useState } from "react";
import { IdCard, Maximize, RotateCcw } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { Button } from "@/components/ui/button";
import { readLocal, writeLocal } from "@/lib/safe-storage";

const KEY = "atlas:namensschild-name";
const DEFAULT_NAME = "Thimofej";

function initialName() {
  if (typeof window === "undefined") return DEFAULT_NAME;
  return readLocal(KEY) || DEFAULT_NAME;
}

export default function NamensschildPage() {
  const [name, setName] = useState(initialName);

  const save = (v: string) => {
    setName(v);
    writeLocal(KEY, v);
  };

  const reset = () => save(DEFAULT_NAME);

  const fullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const shown = name.trim() || DEFAULT_NAME;

  return (
    <main className="h-full overflow-y-auto px-6 pt-6 pb-8 lg:px-8">
      <Stagger className="mx-auto max-w-3xl space-y-6">
        <StaggerItem>
          <h1 className="text-xl font-semibold leading-tight tracking-tight">Namensschild</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Dein Name groß für die Klasse.
          </p>
        </StaggerItem>

        <StaggerItem>
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border bg-card px-6 py-14 text-center shadow-card">
            <IdCard className="size-6 text-muted-foreground" aria-hidden="true" />
            {/* select-text hebt das app-weite select-none auf -- der Name soll kopierbar bleiben. */}
            <p
              aria-live="polite"
              className="w-full max-w-full truncate px-2 text-center font-semibold tracking-tight select-text"
              style={{ fontSize: "clamp(3rem, 12vw, 7rem)", lineHeight: 1.05 }}
            >
              {shown}
            </p>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="flex flex-wrap items-center gap-2">
            {/* 16px Text verhindert den iOS-Auto-Zoom auf Eingabefeldern. */}
            <input
              value={name}
              onChange={(e) => save(e.target.value)}
              placeholder={DEFAULT_NAME}
              aria-label="Name auf dem Schild"
              maxLength={40}
              className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
            <Button variant="outline" size="sm" className="h-10" onClick={reset}>
              <RotateCcw />
              Zurücksetzen
            </Button>
            <Button variant="outline" size="sm" className="h-10" onClick={fullscreen}>
              <Maximize />
              Vollbild
            </Button>
          </div>
        </StaggerItem>
      </Stagger>
    </main>
  );
}
