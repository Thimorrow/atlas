"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CircleAlert,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
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
    "min-h-11 w-full rounded-md border border-border-control bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 sm:text-[13px]";

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-6">
      <header>
        <Button
          variant="ghost"
          size="sm"
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
        <h1 className="text-xl font-semibold leading-tight tracking-tight">
          Fotos importieren
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {sprache === "latein"
            ? "Latein · Nach Lektionen"
            : "Englisch · Nach Seiten"}
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
        className={`interaction flex w-full items-center justify-center gap-4 rounded-xl border border-dashed border-border-control bg-card px-5 text-left hover:bg-interaction-hover press:bg-interaction-pressed disabled:cursor-wait ${entwurf.length ? "py-4" : "min-h-44 py-8"}`}
      >
        {busy ? (
          <Loader2 className="size-5 shrink-0 animate-spin motion-reduce:animate-none" />
        ) : (
          <ImagePlus className="size-5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            {busy ||
              (entwurf.length
                ? "Weitere Fotos hinzufügen"
                : "Fotos auswählen oder hineinziehen")}
          </span>
          <span className="mt-1 block break-words text-xs text-muted-foreground">
            {busy
              ? dateiname
              : "Bis zu 5 Fotos gleichzeitig · JPG, PNG oder WebP"}
          </span>
        </span>
      </button>
      {!entwurf.length && !busy && (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Fotografiere die Wörter mit{" "}
          {sprache === "latein" ? "der Lektionsüberschrift" : "der Seitenzahl"}.
          Danach kannst du die erkannten Vokabeln prüfen und korrigieren.
        </p>
      )}
      {fotos.length > 0 && (
        <details className="rounded-xl border bg-card shadow-card">
          <summary className="interaction cursor-pointer rounded-xl px-4 py-3 text-[13px] font-medium hover:bg-interaction-hover press:bg-interaction-pressed">
            Fotos zum Gegenprüfen ({fotos.length})
          </summary>
          <div className="grid gap-4 p-4 pt-1 sm:grid-cols-2">
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
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[13px] text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      {entwurf.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Vokabeln prüfen</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {entwurf.length} {entwurf.length === 1 ? "Vokabel" : "Vokabeln"}{" "}
              erkannt. Ergänze fehlende Nummern und korrigiere Lesefehler.
              Unlesbare Wörter können fehlen.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted p-3">
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
              size="sm"
              className="min-h-11 sm:min-h-9"
              onClick={() =>
                setEntwurf((alt) =>
                  alt.map((row) => ({ ...row, abschnitt: abschnitt.trim() })),
                )
              }
            >
              Für alle übernehmen
            </Button>
          </div>
          <fieldset
            disabled={!!busy}
            className="overflow-hidden rounded-xl border bg-card shadow-card"
          >
            <legend className="sr-only">Erkannte Vokabeln bearbeiten</legend>
            {entwurf.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_2.5rem] gap-3 border-b p-4 last:border-b-0 sm:grid-cols-[5rem_1fr_1.4fr_2.5rem]"
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
                  variant="destructive-ghost"
                  size="icon"
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-background py-4 sm:sticky sm:bottom-0">
            <p className="text-xs text-muted-foreground">
              Alle neuen Vokabeln starten in Box 1.
            </p>
            <Button size="sm" disabled={!!busy} onClick={speichern}>
              {busy
                ? "Bitte warten …"
                : `${entwurf.length} ${entwurf.length === 1 ? "Vokabel" : "Vokabeln"} speichern`}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
