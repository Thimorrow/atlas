"use client";

import { useEffect, useRef, useState } from "react";
import { FileWarning, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The parent renders into the frame, but document content cannot run scripts,
// submit forms or fetch external resources. Embedded HTML parts stay disabled.
const FRAME = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>html{color-scheme:light}body{margin:0;background:#e7e5e4}#pages>.docx-wrapper{padding:16px;background:transparent}#pages>.docx-wrapper>section.docx{margin-bottom:16px;box-shadow:0 1px 5px #0002}</style>
</head><body><div id="styles"></div><main id="pages"></main></body></html>`;

type Props = { src: string; name: string; className?: string };

export function DocxPreview(props: Props) {
  return <DocxDocument key={props.src} {...props} />;
}

function DocxDocument({ src, name, className }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    // srcDoc can finish loading before React hydrates and attaches onLoad.
    if (frameRef.current?.contentDocument?.getElementById("pages")) setFrameReady(true);
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const pages = doc?.getElementById("pages");
    const styles = doc?.getElementById("styles");
    if (!frameReady || !frame || !doc || !pages || !styles) return;
    const controller = new AbortController();
    let resize: ResizeObserver | undefined;
    const timeout = setTimeout(() => { controller.abort(); setState("failed"); }, 30_000);
    setState("loading");
    pages.replaceChildren();
    styles.replaceChildren();

    async function load() {
      try {
        const [response, { renderAsync }] = await Promise.all([
          fetch(src, { signal: controller.signal }),
          import("docx-preview"),
        ]);
        if (!response.ok) throw new Error("Download fehlgeschlagen");
        const data = await response.arrayBuffer();
        if (controller.signal.aborted) return;
        await renderAsync(data, pages!, styles!, {
          useBase64URL: true,
          renderAltChunks: false,
          ignoreLastRenderedPageBreak: false,
          ignoreHeight: true,
          breakPages: true,
        });
        if (controller.signal.aborted) return;
        // A preview stays in Atlas even when the source document contains links.
        pages!.querySelectorAll("a").forEach((link) => link.removeAttribute("href"));
        // Keep Word's page layout and shrink the whole page to fit the panel.
        const pageWidth = Math.max(...Array.from(pages!.querySelectorAll<HTMLElement>("section.docx")).map((page) => page.offsetWidth));
        if (!Number.isFinite(pageWidth) || pageWidth <= 0) throw new Error("Keine Dokumentseiten");
        const fit = () => { pages!.style.zoom = String(Math.min(1, frame!.clientWidth / (pageWidth + 32))); };
        fit();
        resize = new ResizeObserver(fit);
        resize.observe(frame!);
        setState("ready");
      } catch {
        if (!controller.signal.aborted) setState("failed");
      } finally { clearTimeout(timeout); }
    }
    void load();
    return () => { clearTimeout(timeout); controller.abort(); resize?.disconnect(); };
  }, [src, frameReady, attempt]);

  return (
    <div className={cn("relative h-full min-h-[400px] w-full overflow-hidden rounded-lg bg-muted", className)}>
      <iframe
        ref={frameRef}
        title={`Vorschau: ${name}`}
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        srcDoc={FRAME}
        onLoad={() => setFrameReady(true)}
        className={cn("h-full min-h-[400px] w-full border-0", state !== "ready" && "invisible")}
      />
      {state === "loading" && (
        <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-5 animate-spin" />
          Word-Dokument wird vorbereitet …
        </div>
      )}
      {state === "failed" && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <FileWarning aria-hidden className="size-7 text-muted-foreground" />
          <p className="text-sm font-medium">Die Word-Vorschau konnte nicht geladen werden.</p>
          <p className="max-w-sm text-sm text-muted-foreground">Versuche es erneut oder lade die Originaldatei herunter.</p>
          <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}><RotateCcw className="size-4" />Erneut versuchen</Button>
        </div>
      )}
    </div>
  );
}
