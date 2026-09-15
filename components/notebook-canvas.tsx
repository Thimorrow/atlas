"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Grip, Loader2, MoveDiagonal } from "lucide-react";
import type { NotebookBlock, NotebookContent, NotebookPaper, NotebookStroke } from "@/lib/notebook-types";
import { anchoredScroll, drawStroke, pagePoint, pinchScale, strokeNear } from "@/lib/notebook-drawing";

export type NotebookTool = "pen" | "eraser" | "text" | "move";

export function NotebookCanvas({ content, paper, tool, color, width, zoom, onChange, onSelect, selectedBlock, onZoomChange }: {
  content: NotebookContent; paper: NotebookPaper; tool: NotebookTool; color: string; width: number; zoom: number;
  onChange: (next: NotebookContent) => void; onSelect: (id: string | null) => void; selectedBlock: string | null;
  onZoomChange?: (zoom: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<NotebookStroke | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number; pan: boolean } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number; anchor: { x: number; y: number } } | null>(null);
  const zoomFrame = useRef<number | null>(null);
  const pendingAnchor = useRef<{ anchor: { x: number; y: number }; center: { x: number; y: number } } | null>(null);
  const penActive = useRef(false);
  const erased = useRef<NotebookContent | null>(null);
  const frame = useRef<number | null>(null);
  const [resolution, setResolution] = useState(1);
  const [pageScale, setPageScale] = useState(1);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => { setResolution(Math.min(2, window.devicePixelRatio || 1)); }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const observer = new ResizeObserver(() => setPageScale(page.getBoundingClientRect().width / 1000));
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  function alignAnchor() {
    const pending = pendingAnchor.current;
    const scroller = scrollRef.current;
    const page = pageRef.current;
    if (!pending || !scroller || !page) return;
    const next = anchoredScroll({ left: scroller.scrollLeft, top: scroller.scrollTop }, page.getBoundingClientRect(), pending.anchor, pending.center);
    scroller.scrollLeft = next.left;
    scroller.scrollTop = next.top;
    pendingAnchor.current = null;
  }
  useLayoutEffect(() => { alignAnchor(); }, [zoom]);
  useEffect(() => () => { if (zoomFrame.current !== null) cancelAnimationFrame(zoomFrame.current); }, []);

  function queuePinch() {
    if (zoomFrame.current !== null) return;
    zoomFrame.current = requestAnimationFrame(() => {
      zoomFrame.current = null;
      const state = pinch.current;
      const pair = [...touches.current.values()];
      if (!state || pair.length !== 2) return;
      const center = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
      const nextZoom = pinchScale(state.zoom, state.distance, Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y));
      pendingAnchor.current = { anchor: state.anchor, center };
      if (nextZoom === zoom || !onZoomChange) alignAnchor();
      else onZoomChange(nextZoom);
    });
  }

  function paintActive() {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const ctx = activeRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
      ctx.clearRect(0, 0, 1000, 1400);
      if (stroke.current) drawStroke(ctx, stroke.current);
    });
  }
  function paintInk(value: NotebookContent) {
    const ctx = inkRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
    ctx.clearRect(0, 0, 1000, 1400);
    value.strokes.forEach((line) => drawStroke(ctx, line));
  }
  useEffect(() => { paintInk(content); }, [content, resolution]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  function point(e: { clientX: number; clientY: number; pressure: number; pointerType: string }) {
    return { ...pagePoint(e.clientX, e.clientY, pageRef.current!.getBoundingClientRect()), pressure: e.pointerType === "pen" ? Math.max(0.05, e.pressure) : 0.7 };
  }
  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "touch") {
      if (penActive.current || (gesture.current && !gesture.current.pan) || touches.current.size >= 2) return;
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture(e.pointerId);
      if (touches.current.size === 1) gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: true };
      else {
        gesture.current = null;
        const pair = [...touches.current.values()];
        const rect = pageRef.current!.getBoundingClientRect();
        pinch.current = {
          distance: Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y), zoom,
          anchor: { x: ((pair[0].x + pair[1].x) / 2 - rect.left) / rect.width, y: ((pair[0].y + pair[1].y) / 2 - rect.top) / rect.height },
        };
      }
      return;
    }
    // Pencil übernimmt eine Touch-Geste; Handballen während des Strichs
    // dürfen weder das Blatt verschieben noch einen Zoom auslösen.
    if (gesture.current && (e.pointerType !== "pen" || !gesture.current.pan)) return;
    if (e.pointerType !== "pen" && touches.current.size) return;
    if (e.pointerType === "pen") {
      gesture.current = null;
      pinch.current = null;
      pendingAnchor.current = null;
      if (zoomFrame.current !== null) { cancelAnimationFrame(zoomFrame.current); zoomFrame.current = null; }
      const ids = [...touches.current.keys()];
      touches.current.clear();
      for (const pointerId of ids) if (e.currentTarget.hasPointerCapture(pointerId)) e.currentTarget.releasePointerCapture(pointerId);
      penActive.current = true;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const pan = tool === "move";
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, pan };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pan) return;
    if (tool === "pen") {
      stroke.current = { id: crypto.randomUUID(), color, width, points: [point(e)] };
      paintActive();
    } else if (tool === "eraser") {
      erased.current = contentRef.current;
      erase(e);
    }
  }
  function erase(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = point(e);
    const previous = erased.current!;
    erased.current = { ...previous, strokes: previous.strokes.filter((line) => !strokeNear(line, p.x, p.y)) };
    paintInk(erased.current);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current) { queuePinch(); return; }
    }
    const current = gesture.current;
    if (!current || current.id !== e.pointerId) return;
    if (current.pan) {
      if (scrollRef.current) {
        scrollRef.current.scrollLeft += current.x - e.clientX;
        scrollRef.current.scrollTop += current.y - e.clientY;
      }
      current.x = e.clientX; current.y = e.clientY;
      return;
    }
    if (stroke.current) {
      const samples = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
      for (const sample of samples.length ? samples : [e.nativeEvent]) {
        const next = point(sample);
        const last = stroke.current.points.at(-1)!;
        if (Math.hypot(next.x - last.x, next.y - last.y) >= 1) stroke.current.points.push(next);
      }
      paintActive();
    } else if (erased.current) erase(e);
  }
  function finish(e: React.PointerEvent<HTMLCanvasElement>) {
    if (touches.current.has(e.pointerId)) {
      touches.current.delete(e.pointerId);
      pinch.current = null;
      if (zoomFrame.current !== null) { cancelAnimationFrame(zoomFrame.current); zoomFrame.current = null; }
      const remaining = [...touches.current.entries()][0];
      gesture.current = remaining ? { id: remaining[0], ...remaining[1], pan: true } : null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      return;
    }
    if (gesture.current?.id !== e.pointerId) return;
    penActive.current = false;
    gesture.current = null;
    if (stroke.current) {
      const next = { ...contentRef.current, strokes: [...contentRef.current.strokes, stroke.current] };
      stroke.current = null;
      paintInk(next);
      onChange(next);
    }
    if (erased.current) { onChange(erased.current); erased.current = null; }
    paintActive();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const backgroundImage = paper === "grid"
    ? "linear-gradient(#e0e7ef 1px, transparent 1px), linear-gradient(90deg, #e0e7ef 1px, transparent 1px)"
    : paper === "lined" ? "linear-gradient(transparent calc(100% - 1px), #dce5ef 1px)" : undefined;
  return <div ref={scrollRef} tabIndex={0} role="region" className="min-h-48 flex-1 overflow-auto overscroll-contain bg-muted/40 p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-8" aria-label="Heftblatt, mit einem Finger verschieben und mit zwei Fingern zoomen">
    <div className="mx-auto" style={{ width: `${zoom}%`, minWidth: 150 }}>
      <div ref={pageRef} className="relative mx-auto aspect-[5/7] w-full overflow-hidden bg-white text-slate-900 shadow-md"
        style={{ backgroundImage, backgroundSize: paper === "grid" ? "2.5% 1.785714%" : "100% 2.5%" }}
        onClick={(e) => {
          if (tool !== "text" || e.target !== e.currentTarget) return;
          onSelect(null);
        }}>
        {content.blocks.map((block) => <PageBlock key={block.id} block={block} editable={tool === "text" || tool === "move"}
          selected={selectedBlock === block.id} pageScale={pageScale} onSelect={() => onSelect(block.id)} pageRef={pageRef}
          onChange={(next) => onChange({ ...contentRef.current, blocks: contentRef.current.blocks.map((b) => b.id === next.id ? next : b) })} />)}
        <canvas ref={inkRef} width={1000 * resolution} height={1400 * resolution} className="pointer-events-none absolute inset-0 z-10 size-full" aria-hidden />
        <canvas ref={activeRef} width={1000 * resolution} height={1400 * resolution} className="absolute inset-0 z-20 size-full"
          style={{ touchAction: "none", pointerEvents: tool === "text" ? "none" : "auto", cursor: tool === "pen" ? "crosshair" : tool === "eraser" ? "cell" : "grab" }}
          onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
          aria-label="Zeichenfläche. Mit Stift oder Maus zeichnen, mit einem Finger verschieben." />
      </div>
    </div>
  </div>;
}

function PageBlock({ block, editable, selected, onSelect, onChange, pageRef, pageScale }: {
  block: NotebookBlock; editable: boolean; selected: boolean; pageScale: number; onSelect: () => void; onChange: (block: NotebookBlock) => void;
  pageRef: React.RefObject<HTMLDivElement | null>;
}) {
  const dragging = useRef<{ x: number; y: number; block: NotebookBlock; resize: boolean } | null>(null);
  const [position, setPosition] = useState<NotebookBlock | null>(null);
  const live = position ?? block;
  function down(e: React.PointerEvent<HTMLButtonElement>, resize: boolean) {
    e.preventDefault(); e.stopPropagation(); onSelect();
    dragging.current = { x: e.clientX, y: e.clientY, block, resize };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragging.current;
    if (!d || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    const dx = (e.clientX - d.x) * 1000 / rect.width, dy = (e.clientY - d.y) * 1400 / rect.height;
    setPosition(d.resize ? { ...d.block, width: Math.max(100, Math.min(1000 - d.block.x, d.block.width + dx)), height: Math.max(70, Math.min(1400 - d.block.y, d.block.height + dy)) }
      : { ...d.block, x: Math.max(0, Math.min(1000 - d.block.width, d.block.x + dx)), y: Math.max(60, Math.min(1400 - d.block.height, d.block.y + dy)) });
  }
  function up(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return;
    dragging.current = null;
    if (position) onChange(position);
    setPosition(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return <div className="absolute" style={{ left: `${live.x / 10}%`, top: `${live.y / 14}%`, width: `${live.width / 10}%`, height: `${live.height / 14}%`, zIndex: editable ? 30 : 1, outline: selected && editable ? "2px solid #2563eb" : undefined }} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
    {block.type === "text" ? <textarea autoFocus={editable && selected} aria-label="Text auf dem Heftblatt" value={block.text ?? ""} readOnly={!editable}
      onFocus={onSelect} onChange={(e) => onChange({ ...block, text: e.target.value })}
      placeholder="Hier schreiben …" className="resize-none rounded-none border-0 bg-transparent p-2 text-[22px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-400"
      style={{ width: live.width, height: live.height, transform: `scale(${pageScale})`, transformOrigin: "top left", pointerEvents: editable ? "auto" : "none" }} />
      : block.type === "image" ? <img src={`/api/files/${block.fileId}?preview=1`} alt="Eingefügtes Bild" draggable={false} className="pointer-events-none size-full object-contain" />
      : <PdfBlock fileId={block.fileId!} pageNumber={block.pageNumber ?? 1} />}
    {editable && selected && <>
      <button aria-label="Element verschieben" className="absolute left-0 flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 outline-none interaction hover:bg-slate-100 press:bg-slate-200 press:scale-[0.96] focus-visible:ring-2 focus-visible:ring-slate-700" style={{ touchAction: "none", ...(live.y * pageScale >= 44 ? { bottom: "100%" } : { top: "100%" }) }}
        onPointerDown={(e) => down(e, false)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><Grip className="size-4" /></button>
      <button aria-label="Elementgröße ändern" className="absolute right-0 flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 outline-none interaction hover:bg-slate-100 press:bg-slate-200 press:scale-[0.96] focus-visible:ring-2 focus-visible:ring-slate-700" style={{ touchAction: "none", ...(live.y * pageScale >= 44 ? { bottom: "100%" } : { top: "100%" }) }}
        onPointerDown={(e) => down(e, true)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><MoveDiagonal className="size-4" /></button>
    </>}
  </div>;
}

function PdfBlock({ fileId, pageNumber }: { fileId: string; pageNumber: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    setState("loading");
    void (async () => {
      try {
        const { openNotebookPdf } = await import("@/lib/notebook-pdf");
        const response = await fetch(`/api/files/${fileId}?preview=1`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
        if (!response.ok) throw new Error("PDF nicht verfügbar");
        const pdf = await openNotebookPdf(await response.arrayBuffer());
        dispose = () => { void pdf.destroy(); };
        if (controller.signal.aborted) return;
        const page = await pdf.document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1500 / page.getViewport({ scale: 1 }).width });
        const target = canvas.current;
        if (!target || controller.signal.aborted) return;
        target.width = viewport.width; target.height = viewport.height;
        const task = page.render({ canvas: target, canvasContext: target.getContext("2d")!, viewport });
        dispose = () => { task.cancel(); void pdf.destroy(); };
        await task.promise;
        if (!controller.signal.aborted) setState("ready");
      } catch { if (!controller.signal.aborted) setState("error"); }
      finally { if (controller.signal.aborted) dispose?.(); }
    })();
    return () => { controller.abort(); dispose?.(); };
  }, [fileId, pageNumber, retry]);
  return <div className="relative size-full bg-white">
    <canvas ref={canvas} className="size-full object-contain" />
    {state === "loading" && <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-500" role="status"><Loader2 className="size-4 animate-spin" />PDF wird geladen …</div>}
    {state === "error" && <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center text-sm text-slate-600"><p>PDF konnte nicht geladen werden.</p><button onClick={() => setRetry((n) => n + 1)} className="mt-2 min-h-11 rounded-md border px-3">Erneut versuchen</button></div>}
  </div>;
}
