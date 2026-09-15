"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Layers,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  abschnittLabel,
  fortschritt,
  type Sprache,
  type Vokabel,
} from "@/lib/vokabeln";
import { VokabelImport } from "./import";
import { VokabelSession } from "./session";

export async function vokabelRequest(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Die Anfrage ist fehlgeschlagen.");
  return data;
}

export function VokabelBereich() {
  const [karten, setKarten] = useState<Vokabel[]>([]);
  const [sprache, setSprache] = useState<Sprache>("latein");
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [ansicht, setAnsicht] = useState<"uebersicht" | "import" | "lernen">(
    "uebersicht",
  );
  const [session, setSession] = useState<Vokabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hinweis, setHinweis] = useState("");

  async function laden() {
    setLoading(true);
    setError("");
    try {
      setKarten((await vokabelRequest("/api/vokabeln")).vokabeln);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void laden();
  }, []);
  const fachKarten = karten.filter((k) => k.sprache === sprache);
  const abschnitte = [...new Set(fachKarten.map((k) => k.abschnitt))].sort(
    (a, b) => a.localeCompare(b, "de", { numeric: true }),
  );
  const gefiltert = fachKarten.filter(
    (k) => auswahl === null || k.abschnitt === auswahl,
  );
  const sichtbar = gefiltert.filter((k) =>
    `${k.wort} ${k.deutsch}`
      .toLocaleLowerCase("de")
      .includes(suche.toLocaleLowerCase("de")),
  );
  const prozent = fortschritt(gefiltert);
  const gelernt = gefiltert.filter((k) => k.box === 6).length;
  const offen = gefiltert.filter((k) => k.box < 6);
  const titel = auswahl
    ? abschnittLabel(sprache, auswahl)
    : sprache === "latein"
      ? "Dein Latein."
      : "Dein Englisch.";

  if (ansicht === "import")
    return (
      <VokabelImport
        sprache={sprache}
        onBack={() => setAnsicht("uebersicht")}
        onSaved={async (anzahl) => {
          setAnsicht("uebersicht");
          setHinweis(
            `${anzahl} neue Vokabeln gespeichert. Bereits vorhandene Einträge wurden übersprungen.`,
          );
          await laden();
        }}
      />
    );
  if (ansicht === "lernen")
    return (
      <VokabelSession
        karten={session}
        titel={titel}
        sprache={sprache}
        onUpdate={(karte) =>
          setKarten((alt) => alt.map((k) => (k.id === karte.id ? karte : k)))
        }
        onBack={() => {
          setAnsicht("uebersicht");
          void laden();
        }}
      />
    );

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/lernen"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Lernen
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Vokabeln</h1>
        </div>
        <Button onClick={() => setAnsicht("import")} className="min-h-11">
          <Plus className="size-4" /> Fotos importieren
        </Button>
      </header>
      <div
        className="flex w-fit gap-1 rounded-xl bg-muted p-1"
        aria-label="Sprache"
      >
        {(["latein", "englisch"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSprache(s);
              setAuswahl(null);
              setSuche("");
            }}
            aria-pressed={sprache === s}
            className={cn(
              "min-h-11 rounded-lg px-6 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              sprache === s
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "latein" ? "Latein" : "Englisch"}
          </button>
        ))}
      </div>
      {hinweis && (
        <p
          role="status"
          className="flex items-start gap-2 text-sm text-muted-foreground"
        >
          <Check className="mt-0.5 size-4 shrink-0" />
          {hinweis}
        </p>
      )}
      {error ? (
        <div role="alert" className="rounded-xl border p-6">
          <p>{error}</p>
          <Button variant="outline" className="mt-4" onClick={laden}>
            Erneut laden
          </Button>
        </div>
      ) : loading ? (
        <div
          aria-busy="true"
          aria-label="Vokabeln werden geladen"
          className="space-y-4"
        >
          <div className="h-52 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
          <div className="h-36 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        </div>
      ) : fachKarten.length === 0 ? (
        <section className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <BookOpen className="mb-6 size-9 text-muted-foreground" />
          <h2 className="text-xl font-medium">
            Aus deinem Buch. In deinen Kopf.
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Lade dein erstes Vokabelfoto hoch. Atlas liest die Wörter und
            sortiert sie nach {sprache === "latein" ? "Lektionen" : "Seiten"}.
            Du prüfst sie vor dem Speichern.
          </p>
          <Button
            variant="outline"
            className="mt-6 min-h-11"
            onClick={() => setAnsicht("import")}
          >
            Foto auswählen <ArrowUpRight className="size-4" />
          </Button>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border bg-card p-6 shadow-card sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  {sprache === "latein" ? "Latein" : "Englisch"} → Deutsch
                </p>
                <h2 className="text-3xl font-medium tracking-tight">{titel}</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  {gelernt} von {gefiltert.length} Vokabeln gelernt
                </p>
              </div>
              <div className="text-right">
                <p className="text-5xl font-medium tabular-nums tracking-tighter">
                  {prozent}
                  <span className="ml-1 text-2xl text-muted-foreground">%</span>
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Lernfortschritt
                </p>
              </div>
            </div>
            <div
              role="progressbar"
              aria-label="Lernfortschritt"
              aria-valuenow={prozent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-7 h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${prozent}%` }}
              />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                Jede Box zählt: Box 1 = 0 %, Box 6 = 100 %.
                <br />
                Dein Fortschritt ist der Durchschnitt aller Vokabeln.
              </p>
              <Button
                className="min-h-11"
                onClick={() => {
                  setSession(offen.length ? offen : gefiltert);
                  setAnsicht("lernen");
                }}
              >
                {offen.length
                  ? `${offen.length} Vokabeln lernen`
                  : "Gelernte wiederholen"}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </section>
          <section aria-label="Fortschritt je Abschnitt" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">
                {sprache === "latein" ? "Deine Lektionen" : "Deine Seiten"}
              </h2>
              <button
                onClick={() => setAuswahl(null)}
                aria-pressed={auswahl === null}
                className="min-h-11 px-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Alle anzeigen
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {abschnitte.map((abschnitt) => {
                const gruppe = fachKarten.filter(
                  (k) => k.abschnitt === abschnitt,
                );
                const wert = fortschritt(gruppe);
                return (
                  <button
                    key={abschnitt}
                    onClick={() =>
                      setAuswahl(auswahl === abschnitt ? null : abschnitt)
                    }
                    aria-pressed={auswahl === abschnitt}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      auswahl === abschnitt && "border-primary bg-accent",
                    )}
                  >
                    <div className="flex justify-between gap-3">
                      <span className="text-sm font-medium">
                        {abschnittLabel(sprache, abschnitt)}
                      </span>
                      <span className="text-sm font-semibold tabular-nums">
                        {wert} %
                      </span>
                    </div>
                    <div className="my-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${wert}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {gruppe.length} Vokabeln ·{" "}
                      {gruppe.filter((k) => k.box === 6).length} gelernt
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="rounded-xl border p-5">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Layers className="size-4" /> Deine sechs Boxen
            </h2>
            <div className="mt-5 grid grid-cols-6 gap-2 sm:gap-4">
              {[1, 2, 3, 4, 5, 6].map((box) => {
                const anzahl = gefiltert.filter((k) => k.box === box).length;
                return (
                  <div
                    key={box}
                    className="text-center"
                    aria-label={`Box ${box}: ${anzahl} Vokabeln`}
                  >
                    <div className="flex h-16 items-end rounded-md bg-muted">
                      <div
                        className="w-full rounded-md bg-primary/70"
                        style={{
                          height: anzahl
                            ? `${Math.max(6, (anzahl / gefiltert.length) * 100)}%`
                            : 0,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-sm font-medium tabular-nums">
                      {anzahl}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Box {box}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-medium">
                Durchgucken{" "}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {gefiltert.length}
                </span>
              </h2>
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-input px-3 focus-within:ring-2 focus-within:ring-ring">
                <Search className="size-4 text-muted-foreground" />
                <input
                  aria-label="Vokabel suchen"
                  value={suche}
                  onChange={(event) => setSuche(event.target.value)}
                  placeholder="Vokabel suchen"
                  className="w-44 bg-transparent py-2 text-base outline-none sm:text-sm"
                />
              </label>
            </div>
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[1fr_1fr_3rem] gap-3 bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
                <span>{sprache === "latein" ? "Latein" : "Englisch"}</span>
                <span>Deutsch</span>
                <span className="text-right">Box</span>
              </div>
              {sichtbar.map((karte) => (
                <div
                  key={karte.id}
                  className="grid grid-cols-[1fr_1fr_3rem] items-start gap-3 border-t px-4 py-4 text-sm"
                >
                  <div className="min-w-0">
                    <p className="select-text break-words font-medium">
                      {karte.wort}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {abschnittLabel(sprache, karte.abschnitt)}
                    </p>
                  </div>
                  <p className="select-text break-words leading-relaxed">
                    {karte.deutsch}
                  </p>
                  <span className="justify-self-end rounded-md bg-muted px-2 py-1 text-xs tabular-nums">
                    {karte.box}
                    {karte.box === 6 && (
                      <Check
                        aria-label="gelernt"
                        className="ml-1 inline size-3"
                      />
                    )}
                  </span>
                </div>
              ))}
              {sichtbar.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Keine Vokabel passt zu deiner Suche.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
