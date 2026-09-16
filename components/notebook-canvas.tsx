"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Grip, Loader2, MoveDiagonal, Trash2, X } from "lucide-react";
import type { NotebookBlock, NotebookContent, NotebookPaper, NotebookPoint, NotebookStroke } from "@/lib/notebook-types";
import { anchoredScroll, drawStroke, pagePoint, pinchScale, shapePoints, type NotebookShape } from "@/lib/notebook-drawing";

import { inkBounds, lassoStrokes, moveInk, recognizeInkShape, strokeHitsSweep } from "@/lib/notebook-geometry";

export type NotebookTool = "pen" | "marker" | "shape" | "lasso" | "eraser" | "text" | "move";

export function NotebookCanvas({ content, paper, tool, color, width, shape = "line", eraserRadius = 18, markerOnly = false, autoShape = true, onAddText, zoom, onChange, onSelect, selectedBlock, onZoomChange }: {
  content: NotebookContent; paper: NotebookPaper; tool: NotebookTool; color: string; width: number; zoom: number;
  onChange: (next: NotebookContent, textEditId?: string) => void; onSelect: (id: string | null) => void; selectedBlock: string | null;
  onZoomChange?: (zoom: number) => void; shape?: NotebookShape; eraserRadius?: number; markerOnly?: boolean; autoShape?: boolean;
  onAddText?: (x: number, y: number) => void;
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
  const shapeStart = useRef<ReturnType<typeof point> | null>(null);
  const activeShape = useRef<NotebookShape>("line");
  const penActive = useRef(false);
  const erased = useRef<NotebookContent | null>(null);
  const eraserPoint = useRef<NotebookPoint | null>(null);
  const cursorPoint = useRef<NotebookPoint | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdAnchor = useRef<NotebookPoint | null>(null);
  const snapped = useRef<{ original: NotebookStroke; end: NotebookPoint } | null>(null);
  const lasso = useRef<NotebookPoint[] | null>(null);
  const selectionDrag = useRef<{ origin: NotebookPoint; content: NotebookContent } | null>(null);
  const selectionPreview = useRef<NotebookContent | null>(null);
  const [selectedInk, setSelectedInk] = useState<string[]>([]);
  const [previewInk, setPreviewInk] = useState<NotebookStroke[] | null>(null);
  const [shapeNotice, setShapeNotice] = useState("");
  const selectedIds = new Set(selectedInk);
  const selectedStrokes = (previewInk ?? content.strokes).filter(s => selectedIds.has(s.id));
  const selectionBounds = inkBounds(selectedStrokes);
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
      if (lasso.current?.length) {
        ctx.save(); ctx.strokeStyle = "#2563eb"; ctx.fillStyle = "#2563eb12";
        ctx.lineWidth = 1.5 / Math.max(pageScale, 0.1); ctx.setLineDash([6 / Math.max(pageScale, 0.1), 4 / Math.max(pageScale, 0.1)]);
        ctx.beginPath(); ctx.moveTo(lasso.current[0].x, lasso.current[0].y);
        lasso.current.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      if (tool === "eraser" && cursorPoint.current) {
        ctx.save(); ctx.strokeStyle = "#64748b"; ctx.fillStyle = "#94a3b822"; ctx.lineWidth = 1 / Math.max(pageScale, 0.1);
        ctx.beginPath(); ctx.arc(cursorPoint.current.x, cursorPoint.current.y, eraserRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      }
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

  function clearHold() {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }
  useEffect(() => () => clearHold(), []);
  useEffect(() => { clearHold(); cursorPoint.current = null; setShapeNotice(""); paintActive(); }, [tool, eraserRadius, autoShape]);

  function queueHold(p: NotebookPoint) {
    if (!autoShape || (tool !== "pen" && tool !== "marker") || snapped.current) return;
    if (holdTimer.current && holdAnchor.current && Math.hypot(p.x - holdAnchor.current.x, p.y - holdAnchor.current.y) < 3) return;
    clearHold(); holdAnchor.current = p;
    const id = stroke.current?.id;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      const current = stroke.current;
      if (!current || current.id !== id) return;
      const recognized = recognizeInkShape(current.points);
      if (!recognized || (current.kind === "marker" && recognized.shape !== "line")) return;
      snapped.current = { original: current, end: current.points.at(-1)! };
      stroke.current = { ...current, kind: current.kind === "marker" ? "marker" : "shape", points: recognized.points };
      setShapeNotice(`${recognized.shape === "line" ? "Linie" : recognized.shape === "rectangle" ? "Rechteck" : "Ellipse"} erkannt`);
      paintActive();
    }, 650);
  }

  function clearSelection() { setSelectedInk([]); setPreviewInk(null); }
  function deleteSelection() {
    onChange({ ...contentRef.current, strokes: contentRef.current.strokes.filter(s => !selectedInk.includes(s.id)) });
    clearSelection();
  }
  function duplicateSelection() {
    const original = contentRef.current.strokes.filter(s => selectedInk.includes(s.id));
    const copies = original.map(s => ({ ...s, id: crypto.randomUUID() }));
    const shifted = moveInk(copies, copies.map(s => s.id), 24, 24);
    onChange({ ...contentRef.current, strokes: [...contentRef.current.strokes, ...shifted] });
    setSelectedInk(shifted.map(s => s.id));
  }

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
    if (tool === "lasso") {
      const p = point(e);
      if (selectionBounds && p.x >= selectionBounds.left - 12 && p.x <= selectionBounds.right + 12 && p.y >= selectionBounds.top - 12 && p.y <= selectionBounds.bottom + 12) {
        selectionDrag.current = { origin: p, content: contentRef.current };
      } else {
        clearSelection(); lasso.current = [p]; paintActive();
      }
      return;
    }
    if (tool === "pen" || tool === "marker" || tool === "shape") {
      clearHold(); snapped.current = null; setShapeNotice("");
      shapeStart.current = tool === "shape" ? point(e) : null;
      activeShape.current = shape;
      stroke.current = { id: crypto.randomUUID(), color, width, kind: tool === "pen" ? "ink" : tool, points: [point(e)] };
      queueHold(point(e));
      paintActive();
    } else if (tool === "eraser") {
      eraserPoint.current = null;
      erased.current = contentRef.current;
      erase(e);
    }
  }
  function erase(e: React.PointerEvent<HTMLCanvasElement>) {
    const samples = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [e.nativeEvent]) {
      const p = point(sample), previous = erased.current!;
      const from = eraserPoint.current ?? p;
      const strokes = previous.strokes.filter(line => (markerOnly && line.kind !== "marker") || !strokeHitsSweep(line, from, p, eraserRadius));
      if (strokes.length !== previous.strokes.length) erased.current = { ...previous, strokes };
      eraserPoint.current = p; cursorPoint.current = p;
    }
    paintInk(erased.current!); paintActive();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "eraser" && e.pointerType !== "touch") { cursorPoint.current = point(e); paintActive(); }
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
    if (selectionDrag.current) {
      const p = point(e), d = selectionDrag.current;
      const next = { ...d.content, strokes: moveInk(d.content.strokes, selectedInk, p.x - d.origin.x, p.y - d.origin.y) };
      selectionPreview.current = next; setPreviewInk(next.strokes); paintInk(next);
      return;
    }
    if (lasso.current) { lasso.current.push(point(e)); paintActive(); return; }
    if (stroke.current) {
      if (snapped.current) {
        if (Math.hypot(point(e).x - snapped.current.end.x, point(e).y - snapped.current.end.y) < 12) return;
        stroke.current = snapped.current.original; snapped.current = null; setShapeNotice("");
      }
      if (shapeStart.current) {
        stroke.current.points = shapePoints(activeShape.current, shapeStart.current, point(e));
        paintActive();
        return;
      }
      const samples = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
      for (const sample of samples.length ? samples : [e.nativeEvent]) {
        const next = point(sample);
        const last = stroke.current.points.at(-1)!;
        if (Math.hypot(next.x - last.x, next.y - last.y) >= 1) { stroke.current.points.push(next); queueHold(next); }
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
    clearHold();
    penActive.current = false;
    if (selectionDrag.current) {
      if (e.type === "pointerup") {
        const p = point(e), d = selectionDrag.current;
        if (Math.hypot(p.x - d.origin.x, p.y - d.origin.y) > 0.1) selectionPreview.current = { ...d.content, strokes: moveInk(d.content.strokes, selectedInk, p.x - d.origin.x, p.y - d.origin.y) };
      }
      if (selectionPreview.current && e.type !== "pointercancel") onChange(selectionPreview.current);
      else paintInk(contentRef.current);
      selectionDrag.current = null; selectionPreview.current = null; setPreviewInk(null);
    }
    if (lasso.current) {
      if (e.type !== "pointercancel") setSelectedInk(lassoStrokes(contentRef.current.strokes, lasso.current));
      lasso.current = null;
    }
    gesture.current = null;
    if (stroke.current) {
      if (e.type === "pointerup" && !snapped.current) {
        const endpoint = point(e);
        endpoint.pressure = stroke.current.points.at(-1)!.pressure;
        if (shapeStart.current) stroke.current.points = shapePoints(activeShape.current, shapeStart.current, endpoint);
        else if (Math.hypot(endpoint.x - stroke.current.points.at(-1)!.x, endpoint.y - stroke.current.points.at(-1)!.y) > 0.1) stroke.current.points.push(endpoint);
      }
      shapeStart.current = null; snapped.current = null;
      const next = { ...contentRef.current, strokes: [...contentRef.current.strokes, stroke.current] };
      stroke.current = null;
      paintInk(next);
      onChange(next);
    }
    if (erased.current) {
      if (e.type === "pointerup") erase(e);
      if (erased.current !== contentRef.current) onChange(erased.current);
      erased.current = null; eraserPoint.current = null;
    }
    paintActive();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const backgroundImage = paper === "grid"
    ? "linear-gradient(#e0e7ef 1px, transparent 1px), linear-gradient(90deg, #e0e7ef 1px, transparent 1px)"
    : paper === "lined" ? "linear-gradient(transparent calc(100% - 1px), #dce5ef 1px)" : undefined;
  return <>
    {tool === "lasso" && <div className="flex min-h-12 shrink-0 items-center gap-1 border-b px-3 text-xs" role="group" aria-label="Lasso-Auswahl">
      <span className="min-w-0 flex-1 truncate text-muted-foreground" role="status">{selectedStrokes.length ? `${selectedStrokes.length} ${selectedStrokes.length === 1 ? "Strich" : "Striche"} · Auswahl ziehen` : "Handschrift und Zeichnungen einkreisen"}</span>
      <button type="button" aria-label="Auswahl duplizieren" title="Duplizieren" disabled={!selectedStrokes.length} onClick={duplicateSelection} className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30"><Copy className="size-4" /></button>
      <button type="button" aria-label="Auswahl löschen" title="Löschen" disabled={!selectedStrokes.length} onClick={deleteSelection} className="flex size-11 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-muted disabled:opacity-30"><Trash2 className="size-4" /></button>
      <button type="button" aria-label="Auswahl aufheben" title="Auswahl aufheben" disabled={!selectedStrokes.length} onClick={clearSelection} className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30"><X className="size-4" /></button>
    </div>}
    <span className="sr-only" role="status">{shapeNotice}</span>
    <div ref={scrollRef} tabIndex={0} role="region" className="min-h-48 flex-1 overflow-auto overscroll-contain bg-muted/40 p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-8" aria-label="Heftblatt, mit einem Finger verschieben und mit zwei Fingern zoomen">
    <div className="mx-auto" style={{ width: `${zoom}%`, minWidth: 150 }}>
      <div ref={pageRef} className="relative mx-auto aspect-[5/7] w-full overflow-hidden bg-white text-slate-900 shadow-md"
        style={{ backgroundImage, backgroundSize: paper === "grid" ? "2.5% 1.785714%" : "100% 2.5%" }}
        onClick={(e) => {
          if (tool !== "text" || e.target !== e.currentTarget) return;
          const p = pagePoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
          onAddText?.(p.x, p.y);
        }}>
        {content.blocks.map((block) => <PageBlock key={block.id} block={block} editable={tool === "text" || tool === "move"}
          selected={selectedBlock === block.id} pageScale={pageScale} onSelect={() => onSelect(block.id)} pageRef={pageRef}
          onChange={(next, textEdit) => onChange({ ...contentRef.current, blocks: contentRef.current.blocks.map((b) => b.id === next.id ? next : b) }, textEdit ? next.id : undefined)} />)}
        {tool === "lasso" && selectionBounds && <svg viewBox="0 0 1000 1400" className="pointer-events-none absolute inset-0 z-20 size-full" aria-hidden>
          <rect x={selectionBounds.left - 8} y={selectionBounds.top - 8} width={selectionBounds.right - selectionBounds.left + 16} height={selectionBounds.bottom - selectionBounds.top + 16} fill="#2563eb0a" stroke="#2563eb" strokeWidth={1.5 / Math.max(pageScale, 0.1)} strokeDasharray={`${5 / Math.max(pageScale, 0.1)} ${4 / Math.max(pageScale, 0.1)}`} />
        </svg>}
        <canvas ref={inkRef} width={1000 * resolution} height={1400 * resolution} className="pointer-events-none absolute inset-0 z-10 size-full" aria-hidden />
        <canvas ref={activeRef} width={1000 * resolution} height={1400 * resolution} className="absolute inset-0 z-20 size-full"
          style={{ touchAction: "none", pointerEvents: tool === "text" ? "none" : "auto", cursor: (tool === "pen" || tool === "marker" || tool === "shape") ? "crosshair" : tool === "eraser" ? "none" : tool === "lasso" ? "crosshair" : "grab" }}
          onPointerLeave={() => { cursorPoint.current = null; paintActive(); }}
          onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
          aria-label="Zeichenfläche. Mit Stift oder Maus zeichnen, mit einem Finger verschieben." />
      </div>
    </div>
  </div></>;
}

function PageBlock({ block, editable, selected, onSelect, onChange, pageRef, pageScale }: {
  block: NotebookBlock; editable: boolean; selected: boolean; pageScale: number; onSelect: () => void; onChange: (block: NotebookBlock, textEdit?: boolean) => void;
  pageRef: React.RefObject<HTMLDivElement | null>;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const livePosition = useRef<NotebookBlock | null>(null);
  useEffect(() => {
    if (!editable || !selected || block.type !== "text") return;
    const frame = requestAnimationFrame(() => textRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [editable, selected, block.type]);
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
    const next = d.resize ? { ...d.block, width: Math.max(100, Math.min(1000 - d.block.x, d.block.width + dx)), height: Math.max(70, Math.min(1400 - d.block.y, d.block.height + dy)) }
      : { ...d.block, x: Math.max(0, Math.min(1000 - d.block.width, d.block.x + dx)), y: Math.max(0, Math.min(1400 - d.block.height, d.block.y + dy)) };
    livePosition.current = next; setPosition(next);
  }
  function up(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return;
    dragging.current = null;
    if (livePosition.current && e.type !== "pointercancel") onChange(livePosition.current);
    livePosition.current = null; setPosition(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return <div className="absolute" style={{ left: `${live.x / 10}%`, top: `${live.y / 14}%`, width: `${live.width / 10}%`, height: `${live.height / 14}%`, zIndex: editable ? 30 : 1, outline: selected && editable ? "2px solid #2563eb" : undefined }} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
    {block.type === "text" ? <textarea ref={textRef} id={`notebook-text-${block.id}`} aria-label="Text auf dem Heftblatt" value={block.text ?? ""} readOnly={!editable}
      onFocus={onSelect} onChange={(e) => onChange({ ...block, text: e.target.value, height: Math.min(1400 - block.y, Math.max(block.height, e.currentTarget.scrollHeight)) }, true)}
      placeholder="Hier schreiben …" className="resize-none rounded-none border-0 bg-transparent p-2 text-[22px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-400"
      style={{ width: live.width, height: live.height, transform: `scale(${pageScale})`, transformOrigin: "top left", pointerEvents: editable ? "auto" : "none" }} />
      : block.type === "image" ? <img src={`/api/files/${block.fileId}?preview=1`} alt="Eingefügtes Bild" draggable={false} className="pointer-events-none size-full object-contain" />
      : <PdfBlock fileId={block.fileId!} pageNumber={block.pageNumber ?? 1} />}
    {editable && selected && <>
      <button aria-label="Element verschieben" className="absolute left-0 flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 outline-none interaction hover:bg-slate-100 press:bg-slate-200 press:scale-[0.96] focus-visible:ring-2 focus-visible:ring-slate-700" style={{ touchAction: "none", ...(live.y * pageScale >= 44 ? { bottom: "100%" } : { top: 0 }) }}
        onPointerDown={(e) => down(e, false)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><Grip className="size-4" /></button>
      <button aria-label="Elementgröße ändern" className="absolute bottom-0 right-0 flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 outline-none interaction hover:bg-slate-100 press:bg-slate-200 press:scale-[0.96] focus-visible:ring-2 focus-visible:ring-slate-700" style={{ touchAction: "none" }}
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
