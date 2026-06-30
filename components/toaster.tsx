"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

// Atlas-Toaster: greift das aktive Theme (system/light/dark) auf, damit die
// Fehler-Toasts farblich zur App passen. Ruhig unten rechts, kein Dauer-Spam.
export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={(theme as "light" | "dark" | "system") ?? "system"}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: "font-sans",
        },
      }}
    />
  );
}
