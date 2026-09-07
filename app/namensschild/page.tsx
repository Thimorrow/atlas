"use client";

import { useEffect, useRef, useState } from "react";
import { IdCard, Maximize, Minimize, RotateCcw, X } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { Button } from "@/components/ui/button";
import { readLocal, writeLocal } from "@/lib/safe-storage";
import { cn } from "@/lib/utils";

const KEY = "atlas:namensschild-name";
const DEFAULT_NAME = "Thimofej";

function initialName() {
  if (typeof window === "undefined") return DEFAULT_NAME;
  return readLocal(KEY) || DEFAULT_NAME;
}

export default function NamensschildPage() {
  const [name, setName] = useState(initialName);
  const cardRef = useRef<HTMLDivElement>(null);
  // Nativ: Browser zeigt die Karte als Fullscreen-Element. Fallback: eigenes
  // Overlay (iPhone-Safari kennt die Fullscreen-API gar nicht -- dort wuerde
  // der Knopf sonst still verpuffen).
  const [nativVollbild, setNativVollbild] = useState(false);
  const [overlay, setOverlay] = useState(false);

  // Esc oder Wischgeste beendet den nativen Vollbild -- der State muss dann
  // auch ohne Klick wieder zurueck.
  useEffect(() => {
    const onChange = () => setNativVollbild(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const save = (v: string) => {
    setName(v);
    writeLocal(KEY, v);
  };

  const reset = () => save(DEFAULT_NAME);

  const vollbildAn = async () => {
    const el = cardRef.current;
    // Manche Browser (aelteres Safari) melden requestFullscreen nur mit Prefix.
    const request =
      el?.requestFullscreen?.bind(el) ??
      (el as unknown as { webkitRequestFullscreen?: () => void })?.webkitRequestFullscreen?.bind(el);
    if (request) {
      try {
        await request();
        return;
      } catch {
        // Abgelehnt (z.B. ohne Nutzer-Geste) -> Overlay faengt auf.
      }
    }
    setOverlay(true);
  };

  const vollbildAus = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
    setOverlay(false);
  };

  const praesentiert = nativVollbild || overlay;
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
          {/* In der Praesentation gehoert der Name allein auf den Schirm: kein
              Rahmen, keine Sidebar, Schrift an der Kuerze des Namens bemessen. */}
          <div
            ref={cardRef}
            className={cn(
              "flex flex-col items-center justify-center gap-3 text-center",
              praesentiert
                ? "fixed inset-0 z-50 min-h-0 bg-background px-6"
                : "min-h-[40vh] rounded-2xl border bg-card px-6 py-14 shadow-card",
            )}
          >
            {praesentiert && (
              <button
                type="button"
                onClick={vollbildAus}
                aria-label="Vollbild schließen"
                className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors [touch-action:manipulation] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <X className="size-5" />
              </button>
            )}
            {!praesentiert && <IdCard className="size-6 text-muted-foreground" aria-hidden="true" />}
            {/* select-text hebt das app-weite select-none auf -- der Name soll kopierbar bleiben. */}
            <p
              aria-live="polite"
              className="w-full max-w-full truncate px-2 text-center font-semibold tracking-tight select-text"
              style={{
                fontSize: praesentiert ? "clamp(4rem, 22vw, 14rem)" : "clamp(3rem, 12vw, 7rem)",
                lineHeight: 1.05,
              }}
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
            <Button variant="outline" size="sm" className="h-10" onClick={praesentiert ? vollbildAus : vollbildAn}>
              {praesentiert ? <Minimize /> : <Maximize />}
              {praesentiert ? "Verkleinern" : "Vollbild"}
            </Button>
          </div>
        </StaggerItem>
      </Stagger>
    </main>
  );
}
