"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AtlasLogo } from "@/components/atlas-logo";

// Die Schwelle vor der App. Bewusst karg: ein Feld, ein Knopf. Sie ist kein
// Konto-Login, sondern haelt Fremde von der oeffentlich erreichbaren
// Bereitstellung fern.

function LoginForm() {
  const params = useSearchParams();
  const weiter = params.get("weiter") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Anmeldung fehlgeschlagen.");
        setPassword("");
        setBusy(false);
        return;
      }
      // Harter Wechsel statt router.push: der Proxy soll die Seite mit dem
      // frischen Cookie neu bewerten.
      window.location.href = weiter.startsWith("/") ? weiter : "/";
    } catch {
      setError("Keine Verbindung zum Server.");
      setBusy(false);
    }
  };

  return (
    // Das Root-Layout rendert Sidebar und Kopfleiste um jede Seite. Die
    // Anmeldung legt sich als Vollflaeche darueber, statt alle bestehenden
    // Seiten in eine Route-Group umzuhaengen -- der Nutzer soll hier nur ein
    // Feld sehen, keine Navigation, die ohnehin nirgends hinfuehrt.
    <main className="fixed inset-0 z-50 flex items-center justify-center bg-background px-6">
      <form onSubmit={submit} className="w-full max-w-xs">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <AtlasLogo className="size-6" />
          </span>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight">Atlas</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Diese Seite ist geschuetzt.
            </p>
          </div>
        </div>

        <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium">
          Passwort
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          // 16px verhindert, dass iOS beim Fokussieren hineinzoomt.
          className="h-11 w-full rounded-md border bg-card px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />

        {/* role=alert, damit ein Screenreader die Fehlermeldung mitbekommt,
            ohne dass der Fokus aus dem Feld springt. */}
        {error && (
          <p id="login-error" role="alert" className="mt-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy || !password} className="mt-4 h-11 w-full">
          {busy ? "Einen Moment ..." : "Weiter"}
        </Button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams braucht eine Suspense-Grenze, sonst faellt die ganze Seite
  // beim Build in Client-Side-Rendering.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
