"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/stagger";
import { cn } from "@/lib/utils";
import {
  abschnittLabel,
  fortschritt,
  lernkartenFuerAbschnitt,
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

  function lernen(abschnitt: string) {
    const runde = lernkartenFuerAbschnitt(karten, sprache, abschnitt);
    if (!runde.length) return;
    setAuswahl(abschnitt);
    setSession(runde);
    setAnsicht("lernen");
  }

  if (ansicht === "import")
    return (
      <VokabelImport
        sprache={sprache}
        onBack={() => setAnsicht("uebersicht")}
        onSaved={async (anzahl) => {
          setAnsicht("uebersicht");
          setHinweis(
            `${anzahl} neue ${anzahl === 1 ? "Vokabel" : "Vokabeln"} gespeichert. Bereits vorhandene Einträge wurden übersprungen.`,
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
    <Stagger className="mx-auto max-w-4xl space-y-6 pb-6">
      <StaggerItem>
        <header>
          {auswahl !== null && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-3 -ml-3"
              onClick={() => {
                setAuswahl(null);
                setSuche("");
              }}
            >
              <ArrowLeft /> Vokabeln
            </Button>
          )}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="break-words text-xl font-semibold leading-tight tracking-tight">
                {auswahl === null ? "Vokabeln" : titel}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {auswahl === null
                  ? "Latein und Englisch. Nach Lektionen und Seiten geordnet."
                  : `${sprache === "latein" ? "Latein" : "Englisch"} → Deutsch · ${gefiltert.length} ${gefiltert.length === 1 ? "Vokabel" : "Vokabeln"}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={auswahl === null ? "default" : "ghost"}
                size="sm"
                onClick={() => setAnsicht("import")}
              >
                <Plus /> Fotos importieren
              </Button>
              {auswahl !== null &&
                !loading &&
                !error &&
                gefiltert.length > 0 && (
                  <Button size="sm" onClick={() => lernen(auswahl)}>
                    {offen.length ? "Lernen" : "Wiederholen"} <ChevronRight />
                  </Button>
                )}
            </div>
          </div>
        </header>
      </StaggerItem>

      {auswahl === null && (
        <StaggerItem>
          <div
            className="flex w-full gap-1 rounded-lg border bg-card p-1 shadow-card sm:w-fit"
            role="group"
            aria-label="Sprache"
          >
            {(["latein", "englisch"] as const).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => {
                  setSprache(s);
                  setAuswahl(null);
                  setSuche("");
                }}
                aria-pressed={sprache === s}
                className={cn(
                  "interaction min-h-11 flex-1 rounded-md px-5 text-[13px] font-medium [touch-action:manipulation] sm:min-h-9",
                  sprache === s
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-interaction-hover hover:text-foreground press:bg-interaction-pressed",
                )}
              >
                {s === "latein" ? "Latein" : "Englisch"}
              </button>
            ))}
          </div>
        </StaggerItem>
      )}

      {hinweis && (
        <p
          role="status"
          className="flex items-start gap-2 text-[13px] text-muted-foreground"
        >
          <Check className="mt-0.5 size-4 shrink-0" /> {hinweis}
        </p>
      )}

      <StaggerItem>
        {error ? (
          <div
            role="alert"
            className="rounded-xl border bg-card px-6 py-10 text-center shadow-card"
          >
            <p className="text-sm font-medium">
              Vokabeln konnten nicht geladen werden.
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={laden}
            >
              Erneut laden
            </Button>
          </div>
        ) : loading ? (
          <div
            aria-busy="true"
            aria-label="Vokabeln werden geladen"
            className="space-y-3"
          >
            <div className="h-5 w-36 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-32 animate-pulse rounded-xl border bg-card p-4 motion-reduce:animate-none"
                >
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="mt-2 h-3 w-32 rounded bg-muted" />
                  <div className="mt-7 h-1 rounded-full bg-muted" />
                </div>
              ))}
            </div>
          </div>
        ) : fachKarten.length === 0 ? (
          <section className="flex min-h-64 flex-col items-center justify-center rounded-xl border bg-card px-6 py-10 text-center shadow-card">
            <BookOpen
              className="mb-4 size-6 text-muted-foreground"
              strokeWidth={1.5}
            />
            <h2 className="text-sm font-semibold">
              Noch keine {sprache === "latein" ? "Latein-" : "Englisch-"}
              Vokabeln
            </h2>
            <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              Importiere ein Foto aus deinem Buch. Die erkannten Wörter kannst
              du vor dem Speichern prüfen.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-5"
              onClick={() => setAnsicht("import")}
            >
              <Plus /> Foto auswählen
            </Button>
          </section>
        ) : auswahl === null ? (
          <section aria-label="Fortschritt je Abschnitt" className="space-y-3">
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <h2 className="font-medium">
                {sprache === "latein" ? "Lektionen" : "Seiten"}{" "}
                <span className="ml-1 font-normal tabular-nums text-muted-foreground">
                  {abschnitte.length}
                </span>
              </h2>
              <p className="tabular-nums text-muted-foreground">
                {fachKarten.length}{" "}
                {fachKarten.length === 1 ? "Vokabel" : "Vokabeln"}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {abschnitte.map((abschnitt) => {
                const gruppe = fachKarten.filter(
                  (k) => k.abschnitt === abschnitt,
                );
                const wert = fortschritt(gruppe);
                const abgeschlossen = gruppe.filter((k) => k.box === 6).length;
                return (
                  <button
                    type="button"
                    key={abschnitt}
                    aria-label={`${abschnittLabel(sprache, abschnitt)} öffnen`}
                    onClick={() => {
                      setAuswahl(abschnitt);
                      setSuche("");
                    }}
                    className="group interaction flex min-h-32 flex-col justify-between rounded-xl border bg-card p-4 text-left shadow-card [touch-action:manipulation] hover:bg-interaction-hover press:scale-[0.985] press:bg-interaction-pressed"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block break-words text-[15px] font-semibold leading-tight tracking-tight">
                          {abschnittLabel(sprache, abschnitt)}
                        </span>
                        <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">
                          {gruppe.length}{" "}
                          {gruppe.length === 1 ? "Vokabel" : "Vokabeln"}
                        </p>
                      </div>
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="mt-5">
                      <div className="mb-2 flex justify-between gap-3 text-xs tabular-nums text-muted-foreground">
                        <span>
                          {abgeschlossen === gruppe.length
                            ? "Alle gelernt"
                            : `${abgeschlossen} gelernt`}
                        </span>
                        <span>{wert} %</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${wert}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="space-y-6">
            <section
              aria-label="Lernfortschritt"
              className="overflow-hidden rounded-xl border bg-card shadow-card"
            >
              <div className="p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <h2 className="text-[13px] font-medium">Lernfortschritt</h2>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {gelernt} von {gefiltert.length} Vokabeln gelernt
                    </p>
                  </div>
                  <p className="text-xl font-semibold tabular-nums tracking-tight">
                    {prozent}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      %
                    </span>
                  </p>
                </div>
                <div
                  role="progressbar"
                  aria-label="Lernfortschritt"
                  aria-valuenow={prozent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-4 h-1 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${prozent}%` }}
                  />
                </div>
              </div>
              <details className="border-t">
                <summary className="interaction cursor-pointer px-4 py-3 text-xs text-muted-foreground hover:bg-interaction-hover press:bg-interaction-pressed">
                  Verteilung auf die Lernboxen
                </summary>
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-6 gap-2">
                    {[1, 2, 3, 4, 5, 6].map((box) => (
                      <div
                        key={box}
                        className="rounded-md bg-muted py-2 text-center"
                      >
                        <p className="text-sm font-medium tabular-nums">
                          {gefiltert.filter((k) => k.box === box).length}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Box {box}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Richtig beantwortete Vokabeln steigen eine Box auf. Falsche
                    starten wieder in Box 1. Ab Box 6 gilt eine Vokabel als
                    gelernt.
                  </p>
                </div>
              </details>
            </section>

            <section aria-label="Wortliste" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[13px] font-medium">
                  Vokabeln{" "}
                  <span className="ml-1 font-normal tabular-nums text-muted-foreground">
                    {gefiltert.length}
                  </span>
                </h2>
                <label className="flex min-h-11 w-full items-center gap-2 rounded-md border border-border-control bg-background px-3 focus-within:ring-2 focus-within:ring-ring sm:min-h-9 sm:w-56">
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    aria-label="Vokabel suchen"
                    value={suche}
                    onChange={(event) => setSuche(event.target.value)}
                    placeholder="Vokabel suchen …"
                    className="min-w-0 w-full bg-transparent py-2 text-base outline-none sm:text-[13px]"
                  />
                </label>
              </div>
              <div className="overflow-hidden rounded-xl border bg-card shadow-card">
                <table className="w-full table-fixed text-left text-[13px]">
                  <thead className="bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        {sprache === "latein" ? "Latein" : "Englisch"}
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Deutsch
                      </th>
                      <th
                        scope="col"
                        className="w-16 py-2.5 pr-4 text-right font-medium"
                      >
                        Box
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sichtbar.map((karte) => (
                      <tr key={karte.id} className="border-t align-top">
                        <td className="select-text break-words px-4 py-3 font-medium leading-relaxed">
                          {karte.wort}
                        </td>
                        <td className="select-text break-words px-3 py-3 leading-relaxed text-muted-foreground">
                          {karte.deutsch}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span
                            className="inline-flex min-w-6 items-center justify-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums"
                            aria-label={`Box ${karte.box}${karte.box === 6 ? ", gelernt" : ""}`}
                          >
                            {karte.box}
                            {karte.box === 6 && (
                              <Check className="size-3" aria-hidden="true" />
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {sichtbar.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-8 text-center text-sm text-muted-foreground"
                        >
                          Keine Vokabel passt zu deiner Suche.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </StaggerItem>
    </Stagger>
  );
}
