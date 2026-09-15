"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verkleinereBild } from "@/lib/bild-verkleinern";
import {
  pruefeEntwurf,
  type Sprache,
  type VokabelEntwurf,
} from "@/lib/vokabeln";

export function VokabelImport({
  sprache,
  onBack,
  onSaved,
}: {
  sprache: Sprache;
  onBack: () => void;
  onSaved: (anzahl: number) => Promise<void>;
}) {
  const [entwurf, setEntwurf] = useState<VokabelEntwurf[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dateiname, setDateiname] = useState("");
  const [abschnitt, setAbschnitt] = useState("");
  const [fotos, setFotos] = useState<{ name: string; url: string }[]>([]);
  const fotoUrls = useRef<string[]>([]);
  useEffect(
    () => () => {
      fotoUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  const input = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const label = sprache === "latein" ? "Lektion" : "Seite";

  async function lesen(files: File[]) {
    if (locked.current || !files.length) return;
    if (files.length > 5) {
      setError("Wähle höchstens fünf Fotos auf einmal.");
      return;
    }
    locked.current = true;
    setError("");
    try {
      for (let i = 0; i < files.length; i++) {
        setBusy(`Foto ${i + 1} von ${files.length} wird gelesen …`);
        const file = files[i];
        setDateiname(file.name);
        const foto = await verkleinereBild(file).catch(() => {
          throw new Error(
            "Dieses Bildformat konnte nicht geöffnet werden. Verwende JPG, PNG oder WebP.",
          );
        });
        if (foto.size > 3_000_000)
          throw new Error(
            "Das Foto ist zu groß. Wähle einen kleineren Bildausschnitt.",
          );
        const url = URL.createObjectURL(foto);
        fotoUrls.current.push(url);
        setFotos((alt) => [...alt, { name: file.name, url }]);
        const form = new FormData();
        form.set("foto", foto);
        form.set("sprache", sprache);
        const response = await fetch("/api/vokabeln/lesen", {
          method: "POST",
          body: form,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const rows = pruefeEntwurf(data.vokabeln, true);
        setEntwurf((alt) => [...alt, ...rows]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
      locked.current = false;
      if (input.current) input.current.value = "";
    }
  }
  async function speichern() {
    if (locked.current) return;
    setError("");
    try {
      pruefeEntwurf(entwurf);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    locked.current = true;
    setBusy("Vokabeln werden gespeichert …");
    try {
      const response = await fetch("/api/vokabeln", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprache, vokabeln: entwurf }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await onSaved(data.hinzugefuegt);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
      locked.current = false;
    }
  }
  function bearbeiten(
    index: number,
    feld: keyof VokabelEntwurf,
    value: string,
  ) {
    setEntwurf((alt) =>
      alt.map((row, i) => (i === index ? { ...row, [feld]: value } : row)),
    );
  }
  const feldKlasse =
    "min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm";

  return (
    <div className="mx-auto max-w-4xl space-y-7 pb-6">
      <header>
        <Button
          variant="ghost"
          disabled={!!busy}
          onClick={() => {
            if (
              !entwurf.length ||
              window.confirm("Den ungespeicherten Entwurf verwerfen?")
            )
              onBack();
          }}
          className="mb-3 -ml-3"
        >
          <ArrowLeft className="size-4" /> Vokabeln
        </Button>
        <p className="mb-2 text-sm text-muted-foreground">
          {sprache === "latein"
            ? "Latein · Nach Lektionen"
            : "Englisch · Nach Seiten"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Vom Foto zur Vokabel.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Fotografiere die Vokabeln mit{" "}
          {sprache === "latein" ? "der Lektionsüberschrift" : "der Seitenzahl"}.
          Prüfe danach die erkannten Wörter und Bedeutungen.
        </p>
      </header>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        disabled={!!busy}
        className="sr-only"
        aria-label="Vokabelfotos auswählen"
        onChange={(event) => void lesen(Array.from(event.target.files ?? []))}
      />
      <button
        disabled={!!busy}
        onClick={() => input.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void lesen(Array.from(event.dataTransfer.files));
        }}
        className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-border-control bg-muted/20 px-6 py-9 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
      >
        {busy ? (
          <Loader2 className="size-7 animate-spin motion-reduce:animate-none" />
        ) : (
          <ImagePlus className="size-7 text-muted-foreground" />
        )}
        <span className="font-medium">
          {busy ||
            (entwurf.length
              ? "Weitere Fotos hinzufügen"
              : "Fotos auswählen oder hierher ziehen")}
        </span>
        <span className="text-sm text-muted-foreground">
          {busy
            ? dateiname
            : "Bis zu 5 Fotos gleichzeitig · JPG, PNG oder WebP"}
        </span>
      </button>
      {fotos.length > 0 && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Fotos zum Gegenprüfen ({fotos.length})
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {fotos.map((foto) => (
              <figure key={foto.url}>
                <img
                  src={foto.url}
                  alt={`Vokabelfoto: ${foto.name}`}
                  className="h-auto w-full rounded-lg"
                />
                <figcaption className="mt-2 truncate text-xs text-muted-foreground">
                  {foto.name}
                </figcaption>
              </figure>
            ))}
          </div>
        </details>
      )}
      {busy && (
        <p role="status" className="sr-only">
          {busy}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {entwurf.length > 0 && (
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-medium">
              Kurz prüfen, dann loslernen.
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {entwurf.length} Vokabeln erkannt. Ergänze fehlende Nummern und
              korrigiere Lesefehler. Unlesbare Wörter können fehlen.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-muted/50 p-4">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>{label} für alle Einträge</span>
              <input
                className={feldKlasse}
                value={abschnitt}
                maxLength={80}
                disabled={!!busy}
                onChange={(e) => setAbschnitt(e.target.value)}
                placeholder={sprache === "latein" ? "z. B. 12" : "z. B. 227"}
              />
            </label>
            <Button
              variant="outline"
              disabled={!abschnitt.trim() || !!busy}
              className="min-h-11"
              onClick={() =>
                setEntwurf((alt) =>
                  alt.map((row) => ({ ...row, abschnitt: abschnitt.trim() })),
                )
              }
            >
              Für alle übernehmen
            </Button>
          </div>
          <fieldset disabled={!!busy} className="space-y-3">
            {entwurf.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_3rem] gap-3 rounded-xl border p-4 sm:grid-cols-[5rem_1fr_1.4fr_3rem]"
              >
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>{label}</span>
                  <input
                    className={feldKlasse}
                    value={row.abschnitt}
                    maxLength={80}
                    onChange={(e) => bearbeiten(i, "abschnitt", e.target.value)}
                    aria-label={`${label} für Vokabel ${i + 1}`}
                  />
                </label>
                <label className="col-span-2 space-y-1 text-xs text-muted-foreground sm:col-span-1">
                  <span>{sprache === "latein" ? "Latein" : "Englisch"}</span>
                  <textarea
                    rows={2}
                    className={feldKlasse}
                    value={row.wort}
                    maxLength={400}
                    onChange={(e) => bearbeiten(i, "wort", e.target.value)}
                    aria-label={`Vokabel ${i + 1}`}
                  />
                </label>
                <label className="col-span-2 space-y-1 text-xs text-muted-foreground sm:col-span-1">
                  <span>Deutsch</span>
                  <textarea
                    rows={2}
                    className={feldKlasse}
                    value={row.deutsch}
                    maxLength={1000}
                    onChange={(e) => bearbeiten(i, "deutsch", e.target.value)}
                    aria-label={`Deutsche Bedeutung ${i + 1}`}
                  />
                </label>
                <Button
                  variant="ghost"
                  className="col-start-2 row-start-1 min-h-11 sm:col-start-4 sm:mt-5"
                  aria-label={`Vokabel ${i + 1} entfernen`}
                  onClick={() =>
                    setEntwurf((alt) => alt.filter((_, index) => index !== i))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </fieldset>
          <Button
            variant="ghost"
            disabled={!!busy}
            onClick={() =>
              setEntwurf((alt) => [
                ...alt,
                { abschnitt, wort: "", deutsch: "" },
              ])
            }
          >
            <Plus className="size-4" /> Fehlende Vokabel ergänzen
          </Button>
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-4 shadow-card backdrop-blur">
            <p className="text-xs text-muted-foreground">
              Alle neuen Vokabeln starten in Box 1.
            </p>
            <Button disabled={!!busy} onClick={speichern} className="min-h-11">
              {busy ? "Bitte warten …" : `${entwurf.length} Vokabeln speichern`}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
