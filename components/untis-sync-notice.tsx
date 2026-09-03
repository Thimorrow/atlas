"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CloudOff, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

const EASE = [0.22, 1, 0.36, 1] as const;

// Alter des Stands in Worten. Absolute Zeitstempel zwingen zum Kopfrechnen --
// die Frage des Nutzers ist "wie alt ist das", nicht "wann war das".
function ageInWords(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 60) return min <= 1 ? "vor einer Minute" : `vor ${min} Minuten`;
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? "vor einer Stunde" : `vor ${h} Stunden`;
  const d = Math.floor(h / 24);
  return d === 1 ? "vor einem Tag" : `vor ${d} Tagen`;
}

export function UntisSyncNotice({
  hinweis,
  lastSyncOk,
  retrying,
  onRetry,
}: {
  // Auskunft von Untis statt Fehlschlag: der Abgleich lief durch, es gab fuer
  // den Zeitraum nur nichts zu holen. Ist sie gesetzt, hat sie Vorrang -- und
  // der Wiederholen-Knopf entfaellt, weil es nichts zu wiederholen gibt.
  hinweis?: string | null;
  // Zeitpunkt des letzten ERFOLGREICHEN Abgleichs, oder null wenn es auf diesem
  // Geraet noch nie einen gab.
  lastSyncOk: number | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  const reduce = useReducedMotion();
  const age =
    lastSyncOk == null
      ? "auf diesem Gerät noch nie abgeglichen"
      : `zuletzt ${ageInWords(Date.now() - lastSyncOk)} aktualisiert`;

  return (
    <motion.div
      // Der Hinweis erscheint nachtraeglich (der Abgleich laeuft erst nach dem
      // Paint) -- ohne Auftritt springt er in die fertige Seite hinein.
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      // Kein Alarm: der Stundenplan ist da, er ist nur aelter als gedacht. Ruhige
      // muted-Flaeche statt Warnfarbe, damit der Plan selbst der Hauptinhalt bleibt.
      // Die Auskunft von Untis teilt sich diese Flaeche: sie ist noch weniger ein
      // Problem als ein Fehlschlag, eine zweite Gestaltung waere lauter statt klarer.
      // Mobil stapelt das Banner bewusst: Icon+Text in einer Reihe, der Knopf
      // vollbreit darunter. Ein halb umgebrochener Outline-Button neben dem
      // Text sah nach kaputtem Layout aus, vollbreit liest er sich als
      // beabsichtigte zweite Zeile. Ab sm wieder alles in einer Reihe.
      className="mb-5 flex flex-col gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2"
      role="status"
      aria-live="polite"
    >
      {hinweis ? (
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{hinweis}</p>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1">
              Der Stundenplan kann gerade nicht mit Untis abgeglichen werden, {age}.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full sm:w-auto"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? "Wird versucht …" : "Erneut versuchen"}
          </Button>
        </>
      )}
    </motion.div>
  );
}
