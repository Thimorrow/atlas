"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle } from "lucide-react";

// Schlanke Eigenloesung statt sonner (das in 36f031b bewusst entfernt wurde).
// Reicht fuer den einen Fall, den die Spec kennt: ein fehlgeschlagener Request,
// dessen Optimistic-Update zurueckgesprungen ist.

const EASE = [0.22, 1, 0.36, 1] as const;
type Toast = { id: number; message: string };

const ToastCtx = createContext<(message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduce = useReducedMotion();

  const show = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {/* aria-live: die Meldung erreicht auch Screenreader, ohne den Fokus zu
          stehlen. pointer-events-none am Container -> der Stapel blockiert
          nichts, die Karten selbst bleiben klickbar. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
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
              <AlertCircle className="mt-px size-4 shrink-0 text-destructive" />
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
