"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useMicrosoftStatus, type MicrosoftStatus } from "@/components/subject-onenote";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

// Das Ergebnis der Anmeldung kommt als ?microsoft=… zurueck (siehe
// app/api/microsoft/callback). Jeder Fall bekommt einen Satz, der sagt, was
// zu tun ist -- "Fehler" allein hilft niemandem weiter.
const RESULTS: Record<string, { ok: boolean; text: string }> = {
  verbunden: { ok: true, text: "Microsoft ist verbunden." },
  abgebrochen: { ok: false, text: "Die Anmeldung bei Microsoft wurde abgebrochen." },
  ungueltig: {
    ok: false,
    text: "Die Anmeldung hat zu lange gedauert oder gehört nicht zu diesem Browser. Starte sie noch einmal.",
  },
  fehler: {
    ok: false,
    text: "Microsoft hat die Anmeldung abgelehnt. Prüf Client-ID, Geheimnis und Verzeichnis-ID.",
  },
  "kein-refresh": {
    ok: false,
    text: "Microsoft hat keine dauerhafte Berechtigung erteilt. In der App-Registrierung fehlt „offline_access“.",
  },
};

export function MicrosoftConnection() {
  const initial = useMicrosoftStatus();
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<MicrosoftStatus | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setStatus(initial), [initial]);

  // Bewusst window.location statt useSearchParams: der Hook zwaenge die ganze
  // Seite in eine Suspense-Grenze, nur um einen Parameter zu lesen, den es
  // genau einmal nach der Rueckkehr von Microsoft gibt.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("microsoft");
    if (!key) return;
    setResult(RESULTS[key] ?? RESULTS.fehler);
    // Der Parameter hat seinen Zweck erfuellt. Bleibt er stehen, meldet ein
    // Neuladen dasselbe Ergebnis noch einmal.
    params.delete("microsoft");
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
  }, []);

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/microsoft/status", { method: "DELETE" });
      if (!res.ok) throw new Error("disconnect failed");
      setStatus({ enabled: true, connected: false, account: null });
      setResult(null);
    } catch {
      setResult({ ok: false, text: "Die Verbindung konnte nicht getrennt werden." });
    } finally {
      setBusy(false);
    }
  }

  if (status === null) {
    return <p className="text-[13px] text-muted-foreground">Wird geladen …</p>;
  }

  if (!status.enabled) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Die Microsoft-Anbindung ist noch nicht eingerichtet. Wie du sie einrichtest, steht in der
        README unter „Microsoft 365 und OneNote“.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {status.connected ? (
          <div className="min-w-0">
            <p className="text-[13px] font-medium leading-tight">
              {status.account?.displayName ?? "Verbunden"}
            </p>
            {status.account?.email && (
              <p className="truncate font-mono text-xs text-muted-foreground" title={status.account.email}>
                {status.account.email}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Verbinde dein Schulkonto, um Notizen nach OneNote zu schicken.
          </p>
        )}

        {status.connected ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void disconnect()}>
            {busy && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            Verbindung trennen
          </Button>
        ) : (
          // Ein echter Link, kein fetch: /api/microsoft/login leitet den Browser
          // zu Microsoft weiter, das muss eine Seitennavigation sein.
          <a href="/api/microsoft/login" className={cn(buttonVariants({ size: "sm" }))}>
            Mit Microsoft verbinden
          </a>
        )}
      </div>

      {result && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] leading-snug",
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          )}
        >
          {result.ok ? (
            <Check aria-hidden="true" className="mt-px size-4 shrink-0" />
          ) : (
            <AlertTriangle aria-hidden="true" className="mt-px size-4 shrink-0" />
          )}
          <span>{result.text}</span>
        </motion.div>
      )}

      <p className="text-[12px] text-muted-foreground">
        Atlas darf damit dein Profil lesen, deine OneNote-Abschnitte sehen und neue Seiten anlegen.
        Bestehende Seiten werden nie verändert.
      </p>
    </div>
  );
}
