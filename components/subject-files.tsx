"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import type { FileDTO } from "@/lib/subject-file-store";

const EASE = [0.22, 1, 0.36, 1] as const;

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/heic";

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
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<FileDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  // dragenter/dragleave feuern auch beim Wechsel auf Kindelemente. Ein Zaehler
  // haelt den Aktiv-Zustand ruhig, statt beim Ueberfahren des Labels zu flackern.
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

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

  const upload = useCallback(
    async (file: File) => {
      if (uploading) return;
      setUploading(true);
      const body = new FormData();
      body.append("file", file);
      try {
        const res = await fetch(`/api/subjects/${subjectId}/files`, { method: "POST", body });
        const data = (await res.json().catch(() => null)) as
          | { file?: FileDTO; error?: string }
          | null;
        if (!res.ok || !data?.file) {
          // Die Serverantwort nennt den Grund (Typ, Größe, fehlender Speicher)
          // konkreter, als eine pauschale Meldung es könnte.
          toast(data?.error ?? "Die Datei konnte nicht hochgeladen werden.");
          return;
        }
        setFiles((prev) => [data.file!, ...prev]);
      } catch {
        toast("Die Datei konnte nicht hochgeladen werden.");
      } finally {
        setUploading(false);
      }
    },
    [subjectId, uploading, toast],
  );

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
  // Löschen-Knopf der Zeile hängen.
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => cancelRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
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
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) void upload(dropped);
            }}
            className={cn(
              "rounded-xl border border-dashed transition-colors duration-150 ease-[var(--ease-atlas)]",
              dragging ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            {/* Verstecktes, aber fokussierbares <input> plus echtes <label>:
                so ist die Auswahl per Tab und Enter erreichbar, nicht nur per
                Maus. peer-focus-visible traegt den Fokusring auf das Label. */}
            <input
              ref={inputRef}
              id={`${uid}-input`}
              type="file"
              accept={ACCEPT}
              className="peer sr-only"
              disabled={uploading}
              onChange={(e) => {
                const picked = e.target.files?.[0];
                // Zuruecksetzen, damit dieselbe Datei erneut waehlbar bleibt.
                e.target.value = "";
                if (picked) void upload(picked);
              }}
            />
            <label
              htmlFor={`${uid}-input`}
              className={cn(
                "flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-4 py-6 text-center transition-colors [touch-action:manipulation] hover:bg-accent/40 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                uploading && "pointer-events-none opacity-60",
              )}
            >
              <Upload aria-hidden className="size-4 text-muted-foreground" />
              <span className="text-[13px] font-medium">
                {uploading ? "Wird hochgeladen …" : "Datei auswählen oder hierher ziehen"}
              </span>
              <span className="text-[12px] text-muted-foreground">
                PDF, PNG, JPG, WEBP oder HEIC bis 10 MB
              </span>
            </label>
          </div>

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
                    <a
                      href={f.url}
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
