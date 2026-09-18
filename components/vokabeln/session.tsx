"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, RotateCcw } from "lucide-react";
import { useToast } from "@/components/toast";
import { VokabelLernkarte } from "./lernkarte";
import { Button } from "@/components/ui/button";
import {
  fortschritt,
  naechsteBox,
  type Sprache,
  type Vokabel,
} from "@/lib/vokabeln";

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
  const [pending, setPending] = useState(0);
  const [fehler, setFehler] = useState<Vokabel[]>([]);
  const [richtigAnzahl, setRichtigAnzahl] = useState(0);
  const [animateIn, setAnimateIn] = useState(false);
  const [feedback, setFeedback] = useState("");
  const locked = useRef(false);
  const karte = runde[index];
  const fertig = index >= runde.length;

  useEffect(() => {
    if (!pending) return;
    const warnen = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, [pending]);

  async function speichern(vorher: Vokabel, richtig: boolean) {
    try {
      const response = await fetch("/api/vokabeln/bewerten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: vorher.id,
          revision: vorher.revision,
          richtig,
        }),
        keepalive: true,
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const updated = data.vokabel as Vokabel;
      onUpdate(updated);
      setRunde((alt) => alt.map((k) => (k.id === updated.id ? updated : k)));
    } catch (err) {
      const message =
        err instanceof Error &&
        !(err instanceof TypeError) &&
        err.name !== "TimeoutError"
          ? err.message
          : "Deine Antwort konnte nicht gespeichert werden. Prüfe deine Verbindung.";
      // Nur diese Karte zurücksetzen: spätere Antworten dürfen erhalten bleiben.
      onUpdate(vorher);
      setRunde((alt) => alt.map((k) => (k.id === vorher.id ? vorher : k)));
      if (richtig) setRichtigAnzahl((n) => n - 1);
      setFehler((alt) => [...alt, vorher]);
      toast(message, "error");
    } finally {
      setPending((n) => n - 1);
    }
  }

  async function bewerten(
    richtig: boolean,
    animation: Promise<unknown>,
    animateNext: boolean,
  ) {
    if (!karte || locked.current) return false;
    locked.current = true;
    setBusy(true);
    const updated = {
      ...karte,
      box: naechsteBox(karte.box, richtig),
      revision: karte.revision + 1,
    };
    onUpdate(updated);
    setRunde((alt) => alt.map((k) => (k.id === karte.id ? updated : k)));
    if (richtig) setRichtigAnzahl((n) => n + 1);
    setPending((n) => n + 1);
    void speichern(karte, richtig);
    // Der Kartenwechsel wartet ausschließlich auf die kurze Ausfluganimation.
    await animation;
    setFeedback(
      richtig
        ? `${karte.wort}: ${updated.box === 6 ? "gelernt · Box 6" : `weiter in Box ${updated.box}`}`
        : `${karte.wort}: zurück in Box 1`,
    );
    setAnimateIn(animateNext);
    setIndex((n) => n + 1);
    setBusy(false);
    locked.current = false;
    return true;
  }

  async function fehlgeschlageneWiederholen() {
    if (pending || busy) return;
    setBusy(true);
    try {
      // Bei einer verlorenen Antwort kann der Server bereits gespeichert haben.
      // Vor einer neuen Bewertung deshalb den tatsächlichen Stand abgleichen.
      const response = await fetch("/api/vokabeln", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const ids = new Set(fehler.map((eintrag) => eintrag.id));
      const neu = (data.vokabeln as Vokabel[]).filter((k) => ids.has(k.id));
      if (neu.length !== ids.size)
        throw new Error("Eine Vokabel fehlt. Lade die Lektionsübersicht neu.");
      neu.forEach(onUpdate);
      setRunde(neu);
      setIndex(0);
      setRichtigAnzahl(0);
      setFehler([]);
      setFeedback("");
      setAnimateIn(false);
    } catch {
      toast(
        "Der Lernstand konnte nicht abgeglichen werden. Deine nicht bestätigten Vokabeln bleiben erhalten.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 overflow-x-clip pb-6">
      <header>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || pending > 0}
          onClick={onBack}
          className="mb-3 -ml-3"
        >
          <ArrowLeft /> Zur Übersicht
        </Button>
        <h1 className="break-words text-xl font-semibold leading-tight tracking-tight">
          {titel}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {sprache === "latein" ? "Latein" : "Englisch"} → Deutsch · Lernrunde
        </p>
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

      {fertig ? (
        <section className="rounded-xl border bg-card p-6 text-center shadow-card sm:p-8">
          <Check className="mx-auto mb-4 size-6 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">
            Runde abgeschlossen
          </h2>
          <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 divide-x rounded-lg border py-4">
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {richtigAnzahl} / {runde.length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Richtig beantwortet
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {fortschritt(runde)} %
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Fortschritt dieser Karten
              </p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              size="sm"
              disabled={pending > 0 || fehler.length > 0 || busy}
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
            <Button
              size="sm"
              variant="outline"
              disabled={pending > 0 || busy}
              onClick={onBack}
            >
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
            onBewerten={bewerten}
          />
        </>
      )}
      <p
        role="status"
        className="min-h-5 text-center text-xs text-muted-foreground"
      >
        {feedback}
      </p>
      {pending > 0 && (
        <p role="status" className="text-center text-xs text-muted-foreground">
          {pending} {pending === 1 ? "Antwort wird" : "Antworten werden"} im
          Hintergrund gespeichert …
        </p>
      )}
      {fehler.length > 0 && (
        <section
          role="alert"
          className="space-y-3 rounded-xl border border-destructive/40 p-4"
        >
          <p className="text-sm font-medium">
            {fehler.length}{" "}
            {fehler.length === 1 ? "Antwort wurde" : "Antworten wurden"} nicht
            bestätigt.
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {fehler.map((fehlend) => (
              <li key={fehlend.id}>{fehlend.wort}</li>
            ))}
          </ul>
          {fertig ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending > 0 || busy}
              onClick={fehlgeschlageneWiederholen}
              className="h-auto min-h-11 whitespace-normal text-left"
            >
              Nicht gespeicherte Vokabeln wiederholen
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Du kannst diese Vokabeln am Ende der Runde erneut aufrufen. Deine
              anderen Antworten bleiben erhalten.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
