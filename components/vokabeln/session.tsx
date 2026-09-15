"use client";

import { useRef, useState } from "react";
import { ArrowLeft, Check, RotateCcw } from "lucide-react";
import { useToast } from "@/components/toast";
import { VokabelLernkarte } from "./lernkarte";
import { Button } from "@/components/ui/button";
import { fortschritt, type Sprache, type Vokabel } from "@/lib/vokabeln";

export function VokabelSession({
  karten,
  titel,
  sprache,
  onUpdate,
  onBack,
}: {
  karten: Vokabel[];
  titel: string;
  sprache: Sprache;
  onUpdate: (karte: Vokabel) => void;
  onBack: () => void;
}) {
  const toast = useToast();
  const [runde, setRunde] = useState(karten);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [richtigAnzahl, setRichtigAnzahl] = useState(0);
  const [animateIn, setAnimateIn] = useState(false);
  const [feedback, setFeedback] = useState("");
  const locked = useRef(false);
  const karte = runde[index];
  const fertig = index >= runde.length;

  async function bewerten(
    richtig: boolean,
    animation: Promise<unknown>,
    animateNext: boolean,
  ) {
    if (!karte || locked.current || error) return false;
    locked.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/vokabeln/bewerten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: karte.id,
          revision: karte.revision,
          richtig,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const updated = data.vokabel as Vokabel;
      await animation;
      onUpdate(updated);
      setRunde((alt) => alt.map((k) => (k.id === updated.id ? updated : k)));
      setFeedback(
        richtig
          ? `${karte.wort}: ${updated.box === 6 ? "gelernt · Box 6" : `weiter in Box ${updated.box}`}`
          : `${karte.wort}: zurück in Box 1`,
      );
      if (richtig) setRichtigAnzahl((n) => n + 1);
      setAnimateIn(animateNext);
      setIndex((n) => n + 1);
      return true;
    } catch (err) {
      const message =
        err instanceof Error && !(err instanceof TypeError)
          ? err.message
          : "Deine Antwort konnte nicht gespeichert werden. Prüfe deine Verbindung.";
      setError(message);
      toast(message, "error");
      return false;
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 overflow-x-clip pb-6">
      <header className="flex items-center justify-between gap-4">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={onBack}
          className="-ml-3 min-h-11"
        >
          <ArrowLeft className="size-4" /> Übersicht
        </Button>
        <span className="text-sm text-muted-foreground">{titel}</span>
      </header>
      <div>
        <div className="mb-3 flex justify-between text-xs text-muted-foreground">
          <span>{fertig ? "Runde abgeschlossen" : "Deine Lernrunde"}</span>
          <span className="tabular-nums">
            {index} / {runde.length}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary"
            style={{ width: `${(index / Math.max(1, runde.length)) * 100}%` }}
          />
        </div>
      </div>
      <p
        role="status"
        className="min-h-5 truncate text-center text-xs text-muted-foreground"
      >
        {feedback}
      </p>
      {fertig ? (
        <section className="rounded-2xl border bg-card p-8 text-center shadow-card">
          <Check className="mx-auto mb-5 size-8" />
          <h1 className="text-3xl font-medium tracking-tight">
            Eine Runde weiter.
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            {richtigAnzahl} von {runde.length} Antworten richtig.
          </p>
          <p className="mt-6 text-5xl font-medium tabular-nums">
            {fortschritt(runde)} %
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Fortschritt der Vokabeln dieser Runde
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              onClick={() => {
                const offen = runde.filter((k) => k.box < 6);
                setRunde(offen.length ? offen : runde);
                setIndex(0);
                setRichtigAnzahl(0);
                setFeedback("");
              }}
            >
              <RotateCcw className="size-4" /> Noch eine Runde
            </Button>
            <Button variant="outline" onClick={onBack}>
              Zur Übersicht
            </Button>
          </div>
        </section>
      ) : (
        <>
          <VokabelLernkarte
            key={`${karte.id}-${index}`}
            animateIn={animateIn}
            karte={karte}
            sprache={sprache}
            busy={busy}
            error={!!error}
            onBewerten={bewerten}
          />
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/40 p-4"
            >
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={onBack} className="mt-3">
                Lernstand neu laden
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
