"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Download, FileText, RotateCw, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { ladeDateiInFachHoch } from "@/lib/datei-upload";
import type { FileDTO } from "@/lib/subject-file-store";
import { ACCEPT_ATTR, ACCEPTED_TYPES, MAX_FILES_PER_UPLOAD, MAX_FILE_SIZE } from "@/lib/file-limits";

const EASE = [0.22, 1, 0.36, 1] as const;

// Ein Warteschlangen-Eintrag pro Datei -- die Datei selbst wird separat
// gehalten (siehe queueFiles), damit der sichtbare State serialisierbar bleibt.
type QueueItem = {
  key: string;
  name: string;
  size: number;
  status: "wartet" | "laedt" | "fertig" | "fehler";
  error?: string;
};

// Menschenlesbar und deutsch: Dezimalkomma, und erst ab 10 Einheiten ohne
// Nachkommastelle -- "9,4 MB" ist informativ, "9,43 MB" nur noch Rauschen.
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toLocaleString("de-DE", { maximumFractionDigits: kb < 10 ? 1 : 0 })} KB`;
  const mb = kb / 1024;
  return `${mb.toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function SubjectFiles({ subjectId }: { subjectId: string }): React.JSX.Element {
  const toast = useToast();
  const reduce = useReducedMotion();
  const uid = useId();

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [files, setFiles] = useState<FileDTO[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  // Fortschritt des laufenden Schwungs: wie viele von wie vielen bereits
  // fertig sind. Fertige Eintraege verschwinden sofort aus queue, daher
  // getrennt gezaehlt statt aus queue.length abgeleitet.
  const [batchDone, setBatchDone] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<FileDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  // dragenter/dragleave feuern auch beim Wechsel auf Kindelemente. Ein Zaehler
  // haelt den Aktiv-Zustand ruhig, statt beim Ueberfahren des Labels zu flackern.
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  // Das Element, das den Bestaetigen-Dialog geoeffnet hat -- dorthin kehrt der
  // Fokus beim Schliessen zurueck.
  const restoreRef = useRef<HTMLElement | null>(null);

  // Die eigentlichen File-Objekte gehoeren nicht in den React-State (nicht
  // seriell vergleichbar, kein Grund fuer Re-Renders bei jedem Zugriff).
  const pendingFilesRef = useRef<Map<string, File>>(new Map());
  // Wartende Keys plus laufende Zaehlung: eine simple Queue mit Parallelitaet
  // 3, unabhaengig vom React-Renderzyklus gesteuert.
  const waitingKeysRef = useRef<string[]>([]);
  const runningRef = useRef(0);
  const queueRef = useRef<QueueItem[]>([]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  const MAX_CONCURRENT = 3;

  useEffect(() => {
    let alive = true;
    fetch(`/api/subjects/${subjectId}/files`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((data: { enabled: boolean; files: FileDTO[] }) => {
        if (!alive) return;
        setEnabled(data.enabled);
        setFiles(data.files);
      })
      .catch(() => {
        if (alive) toast("Die Dateien konnten nicht geladen werden.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [subjectId, toast]);

  // Der Browser laedt direkt in den Store hoch und meldet die fertige Datei
  // danach an. Wuerde die Datei durch unsere Route wandern, waere bei 4,5 MB
  // Schluss -- das ist Vercels Grenze fuer den Rumpf einer Anfrage, und sie
  // liegt unter den 10 MB, die hier versprochen werden.
  const uploadOne = useCallback(
    async (key: string, file: File) => {
      setQueue((q) => q.map((it) => (it.key === key ? { ...it, status: "laedt", error: undefined } : it)));
      try {
        const datei = await ladeDateiInFachHoch(subjectId, file);
        // Die Datei erscheint sofort in der Liste, der Warteschlangen-Eintrag
        // verschwindet im selben Zug -- kein sichtbarer "fertig"-Zwischenstand.
        setFiles((prev) => [datei, ...prev]);
        setBatchDone((d) => d + 1);
        pendingFilesRef.current.delete(key);
        setQueue((q) => q.filter((it) => it.key !== key));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Die Datei konnte nicht hochgeladen werden.";
        setQueue((q) => q.map((it) => (it.key === key ? { ...it, status: "fehler", error: message } : it)));
      }
    },
    [subjectId],
  );

  // Zieht solange wartende Keys nach, bis 3 Uploads parallel laufen. Wird
  // nach jedem Enqueue und nach jedem abgeschlossenen Upload erneut gerufen.
  const pump = useCallback(() => {
    while (runningRef.current < MAX_CONCURRENT && waitingKeysRef.current.length > 0) {
      const key = waitingKeysRef.current.shift()!;
      const file = pendingFilesRef.current.get(key);
      if (!file) continue;
      runningRef.current += 1;
      void uploadOne(key, file).finally(() => {
        runningRef.current -= 1;
        pump();
      });
    }
  }, [uploadOne]);

  const sendMany = useCallback(
    (incoming: File[]) => {
      let selected = incoming;
      if (selected.length > MAX_FILES_PER_UPLOAD) {
        selected = selected.slice(0, MAX_FILES_PER_UPLOAD);
        toast(`Höchstens ${MAX_FILES_PER_UPLOAD} Dateien auf einmal, die ersten ${MAX_FILES_PER_UPLOAD} werden hochgeladen.`);
      }

      // Vorab im Browser pruefen. Das Token und der Server halten dieselben
      // Grenzen noch einmal; hier geht es nur darum, dem Nutzer den Weg durch
      // einen langen Upload zu ersparen, der ohnehin abgewiesen wuerde.
      const valid: File[] = [];
      let skipped = 0;
      for (const file of selected) {
        if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number]) || file.size > MAX_FILE_SIZE) {
          skipped += 1;
          continue;
        }
        valid.push(file);
      }
      if (skipped > 0) {
        toast(`${skipped} ${skipped === 1 ? "Datei" : "Dateien"} übersprungen: falscher Typ oder größer als 10 MB.`);
      }
      if (valid.length === 0) return;

      const startingFresh = queueRef.current.length === 0;
      setBatchTotal((t) => (startingFresh ? valid.length : t + valid.length));
      if (startingFresh) setBatchDone(0);

      const items: QueueItem[] = valid.map((file) => ({
        key: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        size: file.size,
        status: "wartet",
      }));
      items.forEach((item, i) => pendingFilesRef.current.set(item.key, valid[i]));
      setQueue((q) => [...q, ...items]);
      waitingKeysRef.current.push(...items.map((it) => it.key));
      pump();
    },
    [toast, pump],
  );

  const retryOne = useCallback(
    (key: string) => {
      const file = pendingFilesRef.current.get(key);
      if (!file) return;
      setQueue((q) => q.map((it) => (it.key === key ? { ...it, status: "wartet", error: undefined } : it)));
      waitingKeysRef.current.push(key);
      pump();
    },
    [pump],
  );

  const discardOne = useCallback((key: string) => {
    pendingFilesRef.current.delete(key);
    waitingKeysRef.current = waitingKeysRef.current.filter((k) => k !== key);
    setQueue((q) => q.filter((it) => it.key !== key));
  }, []);

  const uploading = queue.some((it) => it.status === "laedt" || it.status === "wartet");

  async function confirmDelete() {
    if (!pending || deleting) return;
    setDeleting(true);
    const id = pending.id;
    try {
      const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setFiles((prev) => prev.filter((f) => f.id !== id));
      setPending(null);
    } catch {
      toast("Die Datei konnte nicht gelöscht werden.");
    } finally {
      setDeleting(false);
    }
  }

  // Fokus in das Overlay ziehen, sonst bleibt er auf dem verschwundenen
  // Löschen-Knopf der Zeile hängen. Beim Schließen geht er dorthin zurück, wo er
  // herkam -- sonst faellt er auf <body> und die Tastatur-Navigation faengt von
  // vorn an. Die Zeile kann nach dem Löschen weg sein, daher der optionale Aufruf.
  useEffect(() => {
    if (!pending) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => cancelRef.current?.focus(), 20);
    return () => {
      window.clearTimeout(t);
      restoreRef.current?.focus?.();
    };
  }, [pending]);

  return (
    // Die Ueberschrift "Dateien" und die Karten-Huelle kommen von der
    // <Section> in subject-detail.tsx -- hier nur der Inhalt.
    <div className="space-y-3">
      {loading ? (
        <p className="text-[13px] text-muted-foreground">Wird geladen …</p>
      ) : !enabled ? (
        // Token fehlt: ein ruhiger Hinweis, kein Upload, keine Fehlerfarbe.
        // Der Rest der Seite bleibt davon unberührt.
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-[13px] text-muted-foreground">
          Der Dateispeicher ist noch nicht eingerichtet.
        </p>
      ) : (
        <>
          <div
            aria-busy={uploading}
            onDragEnter={(e) => {
              e.preventDefault();
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => {
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              const dropped = Array.from(e.dataTransfer.files ?? []);
              if (dropped.length > 0) sendMany(dropped);
            }}
            className={cn(
              "rounded-xl border border-dashed transition-colors duration-150 ease-[var(--ease-atlas)]",
              dragging ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            {/* Verstecktes, aber fokussierbares <input> plus echtes <label>:
                so ist die Auswahl per Tab und Enter erreichbar, nicht nur per
                Maus. peer-focus-visible traegt den Fokusring auf das Label.
                Bleibt waehrend des Uploads aktiv -- sonst liesse sich keine
                weitere Datei anhaengen, solange die Warteschlange laeuft. */}
            <input
              ref={inputRef}
              id={`${uid}-input`}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="peer sr-only"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                // Zuruecksetzen, damit dieselben Dateien erneut waehlbar bleiben.
                e.target.value = "";
                if (picked.length > 0) sendMany(picked);
              }}
            />
            <label
              htmlFor={`${uid}-input`}
              className={cn(
                "flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-4 py-6 text-center transition-colors [touch-action:manipulation] hover:bg-accent/40 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                uploading && "opacity-60",
              )}
            >
              <Upload aria-hidden className="size-4 text-muted-foreground" />
              <span className="text-[13px] font-medium">
                {uploading ? `Wird hochgeladen … (${batchDone} von ${batchTotal})` : "Datei auswählen oder hierher ziehen"}
              </span>
              <span className="text-[12px] text-muted-foreground">
                PDF, PNG, JPG, WEBP oder HEIC, bis 10 MB pro Datei, mehrere auf einmal möglich
              </span>
            </label>
          </div>

          {queue.length > 0 && (
            <ul aria-live="polite" className="space-y-1">
              {queue.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px]"
                >
                  <span className="min-w-0 flex-1 truncate" title={item.name}>
                    {item.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0",
                      item.status === "fehler" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {item.status === "wartet" && "Wartet …"}
                    {item.status === "laedt" && "Wird hochgeladen …"}
                    {item.status === "fertig" && "Fertig"}
                    {item.status === "fehler" && (item.error ?? "Fehlgeschlagen")}
                  </span>
                  {item.status === "fehler" && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => retryOne(item.key)}
                        aria-label={`${item.name} erneut hochladen`}
                        className="relative grid size-8 place-items-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <RotateCw className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => discardOne(item.key)}
                        aria-label={`${item.name} verwerfen`}
                        className="relative grid size-8 place-items-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {files.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Noch keine Dateien.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              <AnimatePresence initial={false}>
                {files.map((f) => (
                  <motion.li
                    key={f.id}
                    layout={reduce ? false : true}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.22, ease: EASE }}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium" title={f.name}>
                        {f.name}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {formatSize(f.size)} · {formatDate(f.createdAt)}
                      </p>
                    </div>
                    {/* A1 (Touch): before blaeht beide Aktionen unsichtbar auf 44px auf. */}
                    {/* Der Blob-Store ist privat, es gibt keine direkte
                        Datei-URL. Der Server reicht die Datei hinter der
                        Anmeldung durch. */}
                    <a
                      href={`/api/files/${f.id}`}
                      download={f.name}
                      rel="noopener"
                      aria-label={`${f.name} herunterladen`}
                      className="relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <Download className="size-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setPending(f)}
                      aria-label={`${f.name} löschen`}
                      className="relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </>
      )}

      {/* Eigenes Bestätigungs-Overlay statt window.confirm: das native Fenster
          bricht optisch aus der App aus und ist nicht gestaltbar. */}
      <AnimatePresence>
        {pending && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              onClick={() => !deleting && setPending(null)}
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={`${uid}-confirm`}
              onKeyDown={(e) => {
                if (e.key === "Escape" && !deleting) {
                  e.stopPropagation();
                  setPending(null);
                }
              }}
              initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="relative w-full max-w-sm rounded-t-2xl border bg-card p-5 shadow-popover sm:rounded-2xl"
            >
              <h3 id={`${uid}-confirm`} className="text-[15px] font-semibold tracking-tight">
                Datei löschen?
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {pending.name} wird endgültig entfernt. Das lässt sich nicht rückgängig machen.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  ref={cancelRef}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPending(null)}
                  disabled={deleting}
                >
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmDelete}
                  disabled={deleting}
                  // Es gibt kein --destructive-foreground-Token: text-background traegt.
                  className="bg-destructive text-background hover:bg-destructive/90"
                >
                  {deleting ? "Löscht …" : "Löschen"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
