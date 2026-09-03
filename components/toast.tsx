"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2 } from "lucide-react";

// Schlanke Eigenloesung statt sonner (das in 36f031b bewusst entfernt wurde).
// Ursprruenglich nur fuer den einen Fall gedacht, den die Spec kannte: ein
// fehlgeschlagener Request, dessen Optimistic-Update zurueckgesprungen ist.
// Der Bot-Chat meldet darueber inzwischen auch erfolgreiche Aktionen
// (Rueckgaengig, Note eingetragen) -- dafuer gibt es die zweite Variante
// "success" mit eigenem Symbol, statt ueberall das Fehler-Rot zu zeigen.

const EASE = [0.22, 1, 0.36, 1] as const;
// Exportiert, damit ein Aufrufer mit "Rueckgaengig"-Aktion (z.B. das
// Loeschen einer Aufgabe) seine eigene Frist exakt auf die sichtbare Dauer
// des Toasts abstimmen kann, statt eine zweite Zahl zu raten.
export const TOAST_DURATION = 4000;
const DURATION = TOAST_DURATION;
type ToastVariant = "error" | "success";
// action ist additiv: ein Toast kann eine einzelne Aktion tragen (z.B.
// "Rueckgaengig"), die verschwindet, sobald der Toast selbst verschwindet --
// darum kein eigener Timer fuer die Aktion, sie teilt sich den des Toasts.
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; variant: ToastVariant; action?: ToastAction };

const ToastCtx = createContext<(message: string, variant?: ToastVariant, action?: ToastAction) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduce = useReducedMotion();

  const show = useCallback((message: string, variant: ToastVariant = "error", action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, variant, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), DURATION);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {/* aria-live: die Meldung erreicht auch Screenreader, ohne den Fokus zu
          stehlen. pointer-events-none am Container -> der Stapel blockiert
          nichts, die Karten selbst bleiben klickbar. bottom-20 statt bottom-4,
          damit der Stapel nicht auf einer bodennahen Eingabeleiste liegt (z. B.
          das Bot-Eingabefeld). */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-popover"
            >
              {t.variant === "success" ? (
                <CheckCircle2 className="mt-px size-4 shrink-0 text-primary" />
              ) : (
                <AlertCircle className="mt-px size-4 shrink-0 text-destructive" />
              )}
              <span className="flex-1">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action!.onClick();
                    setToasts((cur) => cur.filter((x) => x.id !== t.id));
                  }}
                  className="relative -my-1 -mr-1 shrink-0 rounded px-1.5 py-1 font-medium text-primary underline-offset-2 outline-none before:absolute before:-inset-2.5 before:content-[''] hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
