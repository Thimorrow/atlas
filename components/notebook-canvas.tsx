"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Grip, Loader2, MoveDiagonal, Pencil, Trash2, X } from "lucide-react";
import type { NotebookBlock, NotebookContent, NotebookPaper, NotebookPoint, NotebookStroke } from "@/lib/notebook-types";
import { anchoredScroll, drawStroke, pagePoint, pinchScale, shapePoints, strokeNear, type NotebookShape } from "@/lib/notebook-drawing";
import { inkBounds, lassoBlocks, lassoStrokes, moveSelection, strokeHitsSweep } from "@/lib/notebook-geometry";
import { cn } from "@/lib/utils";

export type NotebookTool = "pen" | "marker" | "eraser" | "select" | "shape";
export type NotebookPlacement = "text" | "attachment" | null;

const actionButton = "flex size-11 shrink-0 items-center justify-center rounded-md outline-none interaction hover:bg-interaction-hover press:bg-interaction-pressed press:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30";

export function NotebookCanvas({ content, paper, tool, color, width, shape = "line", eraserRadius = 18, markerOnly = false, placement, onPlace, onCancelPlacement, zoom, onChange, onZoomChange }: {
  content: NotebookContent; paper: NotebookPaper; tool: NotebookTool; color: string; width: number; zoom: number;
  onChange: (next: NotebookContent, textEditId?: string) => void;
  onZoomChange?: (zoom: number) => void; shape?: NotebookShape; eraserRadius?: number; markerOnly?: boolean;
  placement?: NotebookPlacement; onPlace?: (x: number, y: number) => string | null | void; onCancelPlacement?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<NotebookStroke | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number; pan: boolean } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number; startX: number; startY: number; moved: boolean }>());
  const pinch = useRef<{ distance: number; zoom: number; anchor: { x: number; y: number } } | null>(null);
  const zoomFrame = useRef<number | null>(null);
  const pendingAnchor = useRef<{ anchor: { x: number; y: number }; center: { x: number; y: number } } | null>(null);
  const shapeStart = useRef<NotebookPoint | null>(null);
  const activeShape = useRef<NotebookShape>("line");
  const penActive = useRef(false);
  const erased = useRef<NotebookContent | null>(null);
  const eraserPoint = useRef<NotebookPoint | null>(null);
  const cursorPoint = useRef<NotebookPoint | null>(null);
  const lasso = useRef<NotebookPoint[] | null>(null);
  const selectionDrag = useRef<{ origin: NotebookPoint; content: NotebookContent } | null>(null);
  const selectionPreview = useRef<NotebookContent | null>(null);
  const frame = useRef<number | null>(null);
  const contentRef = useRef(content);
  const spacePressed = useRef(false);
  const previousTool = useRef(tool);
  const [selectedInk, setSelectedInk] = useState<string[]>([]);
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([]);
  const [editingBlock, setEditingBlock] = useState<string | null>(null);
  const [preview, setPreview] = useState<NotebookContent | null>(null);
  const [resolution, setResolution] = useState(1);
  const [pageScale, setPageScale] = useState(1);
  contentRef.current = content;

  const shown = preview ?? content;
  const selectedStrokeSet = new Set(selectedInk);
  const selectedBlockSet = new Set(selectedBlocks);
  const inkSelectionBounds = inkBounds(shown.strokes.filter((item) => selectedStrokeSet.has(item.id)));
  const chosenBlocks = shown.blocks.filter((item) => selectedBlockSet.has(item.id));
  const selectionBounds = (() => {
    const xs = [inkSelectionBounds?.left, ...chosenBlocks.map((block) => block.x)].filter((value): value is number => value !== undefined);
    if (!xs.length) return null;
    return {
      left: Math.min(...xs),
      top: Math.min(...[inkSelectionBounds?.top, ...chosenBlocks.map((block) => block.y)].filter((value): value is number => value !== undefined)),
      right: Math.max(...[inkSelectionBounds?.right, ...chosenBlocks.map((block) => block.x + block.width)].filter((value): value is number => value !== undefined)),
      bottom: Math.max(...[inkSelectionBounds?.bottom, ...chosenBlocks.map((block) => block.y + block.height)].filter((value): value is number => value !== undefined)),
    };
  })();
  const selectedCount = selectedInk.length + selectedBlocks.length;

  useEffect(() => { setResolution(Math.min(2, window.devicePixelRatio || 1)); }, []);
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const observer = new ResizeObserver(() => setPageScale(page.getBoundingClientRect().width / 1000));
    observer.observe(page);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (previousTool.current !== tool && !placement) clearSelection();
    previousTool.current = tool;
  }, [tool, placement]);
  useEffect(() => { if (placement) clearSelection(); }, [placement]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest("dialog, [role=menu]"))) return;
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === "Escape") { if (placement) onCancelPlacement?.(); else clearSelection(); scrollRef.current?.focus({ preventScroll: true }); }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedCount) { event.preventDefault(); deleteSelection(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  function alignAnchor() {
    const pending = pendingAnchor.current, scroller = scrollRef.current, page = pageRef.current;
    if (!pending || !scroller || !page) return;
    const next = anchoredScroll({ left: scroller.scrollLeft, top: scroller.scrollTop }, page.getBoundingClientRect(), pending.anchor, pending.center);
    scroller.scrollLeft = next.left; scroller.scrollTop = next.top; pendingAnchor.current = null;
  }
  useLayoutEffect(() => { alignAnchor(); }, [zoom]);
  useEffect(() => () => { if (zoomFrame.current !== null) cancelAnimationFrame(zoomFrame.current); }, []);
  function queuePinch() {
    if (zoomFrame.current !== null) return;
    zoomFrame.current = requestAnimationFrame(() => {
      zoomFrame.current = null;
      const state = pinch.current, pair = [...touches.current.values()];
      if (!state || pair.length !== 2) return;
      const center = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
      const nextZoom = pinchScale(state.zoom, state.distance, Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y));
      pendingAnchor.current = { anchor: state.anchor, center };
      if (nextZoom === zoom || !onZoomChange) alignAnchor(); else onZoomChange(nextZoom);
    });
  }

  function paintActive() {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const ctx = activeRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(resolution, 0, 0, resolution, 0, 0); ctx.clearRect(0, 0, 1000, 1400);
      if (stroke.current) drawStroke(ctx, stroke.current);
      if (lasso.current?.length) {
        ctx.save(); ctx.strokeStyle = "#64748b"; ctx.fillStyle = "#64748b12"; ctx.lineWidth = 1.5 / Math.max(pageScale, .1); ctx.setLineDash([6 / Math.max(pageScale, .1), 4 / Math.max(pageScale, .1)]);
        ctx.beginPath(); ctx.moveTo(lasso.current[0].x, lasso.current[0].y); lasso.current.slice(1).forEach((point) => ctx.lineTo(point.x, point.y)); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      if (tool === "eraser" && cursorPoint.current) {
        ctx.save(); ctx.strokeStyle = "#64748b"; ctx.fillStyle = "#94a3b822"; ctx.lineWidth = 1 / Math.max(pageScale, .1);
        ctx.beginPath(); ctx.arc(cursorPoint.current.x, cursorPoint.current.y, eraserRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    });
  }
  function paintInk(value: NotebookContent) {
    const ctx = inkRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(resolution, 0, 0, resolution, 0, 0); ctx.clearRect(0, 0, 1000, 1400); value.strokes.forEach((line) => drawStroke(ctx, line));
  }
  useEffect(() => { paintInk(content); }, [content, resolution]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  useEffect(() => { cursorPoint.current = null; paintActive(); }, [tool, eraserRadius]);

  function clearSelection() {
    if (document.activeElement instanceof HTMLTextAreaElement && pageRef.current?.contains(document.activeElement)) document.activeElement.blur();
    setSelectedInk([]); setSelectedBlocks([]); setEditingBlock(null); setPreview(null);
  }
  function deleteSelection() {
    const ink = new Set(selectedInk), blocks = new Set(selectedBlocks);
    onChange({ strokes: contentRef.current.strokes.filter((item) => !ink.has(item.id)), blocks: contentRef.current.blocks.filter((item) => !blocks.has(item.id)) });
    clearSelection();
  }
  function duplicateSelection() {
    const strokes = contentRef.current.strokes.filter((item) => selectedStrokeSet.has(item.id)).map((item) => ({ ...item, id: crypto.randomUUID() }));
    const blocks = contentRef.current.blocks.filter((item) => selectedBlockSet.has(item.id)).map((item) => ({ ...item, id: crypto.randomUUID() }));
    const moved = moveSelection({ strokes, blocks }, strokes.map((item) => item.id), blocks.map((item) => item.id), 24, 24);
    onChange({ strokes: [...contentRef.current.strokes, ...moved.strokes], blocks: [...contentRef.current.blocks, ...moved.blocks] });
    setSelectedInk(moved.strokes.map((item) => item.id)); setSelectedBlocks(moved.blocks.map((item) => item.id)); setEditingBlock(null);
  }
  function point(e: { clientX: number; clientY: number; pressure: number; pointerType: string }) {
    return { ...pagePoint(e.clientX, e.clientY, pageRef.current!.getBoundingClientRect()), pressure: e.pointerType === "pen" ? Math.max(.05, e.pressure) : .7 };
  }
  function beginSelectionDrag(e: React.PointerEvent, origin = point(e)) {
    e.preventDefault(); e.stopPropagation();
    selectionDrag.current = { origin, content: contentRef.current };
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (placement) {
      e.preventDefault();
      const id = onPlace?.(point(e).x, point(e).y);
      if (id) {
        setSelectedBlocks([id]); setSelectedInk([]);
        if (placement === "text") {
          setEditingBlock(id);
          requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`notebook-text-${id}`)?.focus({ preventScroll: true })));
        }
      }
      return;
    }
    if (e.pointerType === "touch") {
      if (penActive.current || (gesture.current && !gesture.current.pan) || touches.current.size >= 2) return;
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false }); e.currentTarget.setPointerCapture(e.pointerId);
      if (touches.current.size === 1) gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: true };
      else {
        gesture.current = null;
        const pair = [...touches.current.values()], rect = pageRef.current!.getBoundingClientRect();
        pinch.current = { distance: Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y), zoom, anchor: { x: ((pair[0].x + pair[1].x) / 2 - rect.left) / rect.width, y: ((pair[0].y + pair[1].y) / 2 - rect.top) / rect.height } };
      }
      return;
    }
    if (gesture.current && (e.pointerType !== "pen" || !gesture.current.pan)) return;
    if (e.pointerType !== "pen" && touches.current.size) return;
    if (e.pointerType === "pen") {
      gesture.current = null; pinch.current = null; pendingAnchor.current = null;
      if (zoomFrame.current !== null) { cancelAnimationFrame(zoomFrame.current); zoomFrame.current = null; }
      const ids = [...touches.current.keys()]; touches.current.clear();
      for (const pointerId of ids) if (e.currentTarget.hasPointerCapture(pointerId)) e.currentTarget.releasePointerCapture(pointerId);
      penActive.current = true;
    }
    const p = point(e);
    const pan = spacePressed.current;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, pan }; e.currentTarget.setPointerCapture(e.pointerId);
    if (pan) return;
    if (tool === "select") {
      if (selectionBounds && p.x >= selectionBounds.left - 12 && p.x <= selectionBounds.right + 12 && p.y >= selectionBounds.top - 12 && p.y <= selectionBounds.bottom + 12) selectionDrag.current = { origin: p, content: contentRef.current };
      else { clearSelection(); lasso.current = [p]; paintActive(); }
      return;
    }
    if (tool === "pen" || tool === "marker" || tool === "shape") {
      clearSelection(); shapeStart.current = tool === "shape" ? p : null; activeShape.current = shape;
      stroke.current = { id: crypto.randomUUID(), color, width, kind: tool === "pen" ? "ink" : tool, points: [p] }; paintActive();
    } else if (tool === "eraser") { eraserPoint.current = null; erased.current = contentRef.current; erase(e); }
  }
  function erase(e: React.PointerEvent<HTMLCanvasElement>) {
    const samples = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [e.nativeEvent]) {
      const p = point(sample), previous = erased.current!, from = eraserPoint.current ?? p;
      const strokes = previous.strokes.filter((line) => (markerOnly && line.kind !== "marker") || !strokeHitsSweep(line, from, p, eraserRadius));
      if (strokes.length !== previous.strokes.length) erased.current = { ...previous, strokes };
      eraserPoint.current = p; cursorPoint.current = p;
    }
    paintInk(erased.current!); paintActive();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "eraser" && e.pointerType !== "touch") { cursorPoint.current = point(e); paintActive(); }
    if (touches.current.has(e.pointerId)) {
      const touch = touches.current.get(e.pointerId)!;
      touches.current.set(e.pointerId, { ...touch, x: e.clientX, y: e.clientY, moved: touch.moved || Math.hypot(e.clientX - touch.startX, e.clientY - touch.startY) > 6 });
      if (pinch.current) { queuePinch(); return; }
    }
    const current = gesture.current;
    if (!current || current.id !== e.pointerId) return;
    if (current.pan) {
      if (scrollRef.current) { scrollRef.current.scrollLeft += current.x - e.clientX; scrollRef.current.scrollTop += current.y - e.clientY; }
      current.x = e.clientX; current.y = e.clientY; return;
    }
    if (selectionDrag.current) {
      const p = point(e), drag = selectionDrag.current;
      const next = moveSelection(drag.content, selectedInk, selectedBlocks, p.x - drag.origin.x, p.y - drag.origin.y);
      selectionPreview.current = next; setPreview(next); paintInk(next); return;
    }
    if (lasso.current) { lasso.current.push(point(e)); paintActive(); return; }
    if (stroke.current) {
      if (shapeStart.current) { stroke.current.points = shapePoints(activeShape.current, shapeStart.current, point(e)); paintActive(); return; }
      const samples = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
      for (const sample of samples.length ? samples : [e.nativeEvent]) { const next = point(sample), last = stroke.current.points.at(-1)!; if (Math.hypot(next.x - last.x, next.y - last.y) >= 1) stroke.current.points.push(next); }
      paintActive();
    } else if (erased.current) erase(e);
  }
  function finish(e: React.PointerEvent<HTMLCanvasElement>) {
    if (touches.current.has(e.pointerId)) {
      const touch = touches.current.get(e.pointerId)!;
      touches.current.delete(e.pointerId); pinch.current = null;
      if (tool === "select" && !touch.moved && touches.current.size === 0) {
        const p = point(e), hit = [...contentRef.current.strokes].reverse().find((item) => strokeNear(item, p.x, p.y, 12));
        setSelectedInk(hit ? [hit.id] : []); setSelectedBlocks([]); setEditingBlock(null);
      }
      const remaining = [...touches.current.entries()][0]; gesture.current = remaining ? { id: remaining[0], ...remaining[1], pan: true } : null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); return;
    }
    if (gesture.current?.id !== e.pointerId) return;
    penActive.current = false;
    if (selectionDrag.current) {
      if (selectionPreview.current && e.type !== "pointercancel") onChange(selectionPreview.current); else paintInk(contentRef.current);
      selectionDrag.current = null; selectionPreview.current = null; setPreview(null);
    }
    if (lasso.current) {
      if (e.type !== "pointercancel") {
        const path = lasso.current, p = point(e);
        const small = path.length < 4 || ((Math.max(...path.map((item) => item.x)) - Math.min(...path.map((item) => item.x)) < 8) && (Math.max(...path.map((item) => item.y)) - Math.min(...path.map((item) => item.y)) < 8));
        if (small) {
          const hit = [...contentRef.current.strokes].reverse().find((item) => strokeNear(item, p.x, p.y, 12));
          setSelectedInk(hit ? [hit.id] : []); setSelectedBlocks([]);
        } else { setSelectedInk(lassoStrokes(contentRef.current.strokes, path)); setSelectedBlocks(lassoBlocks(contentRef.current.blocks, path)); }
      }
      lasso.current = null;
    }
    gesture.current = null;
    if (stroke.current) {
      if (e.type === "pointerup") {
        const endpoint = point(e); endpoint.pressure = stroke.current.points.at(-1)!.pressure;
        if (shapeStart.current) stroke.current.points = shapePoints(activeShape.current, shapeStart.current, endpoint);
        else if (Math.hypot(endpoint.x - stroke.current.points.at(-1)!.x, endpoint.y - stroke.current.points.at(-1)!.y) > .1) stroke.current.points.push(endpoint);
      }
      shapeStart.current = null;
      const next = { ...contentRef.current, strokes: [...contentRef.current.strokes, stroke.current] }; stroke.current = null; paintInk(next); onChange(next);
    }
    if (erased.current) { if (e.type === "pointerup") erase(e); if (erased.current !== contentRef.current) onChange(erased.current); erased.current = null; eraserPoint.current = null; }
    paintActive();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function selectionMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!selectionDrag.current || !gesture.current) return;
    const p = point(e), drag = selectionDrag.current;
    const next = moveSelection(drag.content, selectedInk, selectedBlocks, p.x - drag.origin.x, p.y - drag.origin.y);
    selectionPreview.current = next; setPreview(next); paintInk(next);
  }
  function selectionUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (selectionPreview.current && e.type !== "pointercancel") onChange(selectionPreview.current); else paintInk(contentRef.current);
    selectionDrag.current = null; selectionPreview.current = null; gesture.current = null; setPreview(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function selectBlock(id: string, edit = false) { setSelectedBlocks([id]); setSelectedInk([]); setEditingBlock(edit ? id : null); }

  const backgroundImage = paper === "grid" ? "linear-gradient(#e0e7ef 1px, transparent 1px), linear-gradient(90deg, #e0e7ef 1px, transparent 1px)" : paper === "lined" ? "linear-gradient(transparent calc(100% - 1px), #dce5ef 1px)" : undefined;
  return <div className="relative flex min-h-48 flex-1 overflow-hidden">
    {tool === "select" && selectedCount > 0 && <div className="absolute left-1/2 top-3 z-50 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-xl border bg-popover p-1 shadow-popover" role="group" aria-label="Auswahlaktionen">
      <span className="hidden whitespace-nowrap px-2 text-xs text-muted-foreground sm:block" role="status">{selectedCount} ausgewählt</span>
      {selectedBlocks.length === 1 && selectedInk.length === 0 && content.blocks.find((block) => block.id === selectedBlocks[0])?.type === "text" && <button type="button" aria-label="Text bearbeiten" title="Text bearbeiten" onClick={() => setEditingBlock(selectedBlocks[0])} className={actionButton}><Pencil className="size-4" /></button>}
      <button type="button" aria-label="Auswahl duplizieren" title="Duplizieren" onClick={duplicateSelection} className={actionButton}><Copy className="size-4" /></button>
      <button type="button" aria-label="Auswahl löschen" title="Löschen" onClick={deleteSelection} className={cn(actionButton, "text-destructive hover:bg-danger-hover press:bg-danger-pressed")}><Trash2 className="size-4" /></button>
      <button type="button" aria-label="Auswahl aufheben" title="Auswahl aufheben" onClick={clearSelection} className={actionButton}><X className="size-4" /></button>
    </div>}
    <div ref={scrollRef} tabIndex={0} role="region" className="min-h-48 flex-1 overflow-auto overscroll-contain bg-muted/40 p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-8"
      aria-label="Heftblatt, mit einem Finger verschieben und mit zwei Fingern zoomen"
      onKeyDown={(e) => {
        if (e.key === " " && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); spacePressed.current = true; }
        if (e.key === "Escape") { if (placement) onCancelPlacement?.(); else clearSelection(); }
        if ((e.key === "Delete" || e.key === "Backspace") && selectedCount && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); deleteSelection(); }
      }} onKeyUp={(e) => { if (e.key === " ") spacePressed.current = false; }} onBlur={() => { spacePressed.current = false; }}>
      <div className="mx-auto" style={{ width: `${zoom}%`, minWidth: 150 }}>
        <div ref={pageRef} className={cn("relative mx-auto aspect-[5/7] w-full overflow-hidden bg-white text-slate-900 shadow-md", placement && "ring-2 ring-ring ring-offset-2")} style={{ backgroundImage, backgroundSize: paper === "grid" ? "2.5% 1.785714%" : "100% 2.5%" }}>
          {shown.blocks.map((block) => <PageBlock key={block.id} block={block} selectable={tool === "select" && !placement} selected={selectedBlockSet.has(block.id)} editing={editingBlock === block.id} pageScale={pageScale}
            onSelect={(edit) => selectBlock(block.id, edit)}
            onChange={(next, textEdit) => onChange({ ...contentRef.current, blocks: contentRef.current.blocks.map((item) => item.id === next.id ? next : item) }, textEdit ? next.id : undefined)} />)}
          {tool === "select" && selectionBounds && <>
            <svg viewBox="0 0 1000 1400" className="pointer-events-none absolute inset-0 z-30 size-full" aria-hidden><rect x={selectionBounds.left - 8} y={selectionBounds.top - 8} width={selectionBounds.right - selectionBounds.left + 16} height={selectionBounds.bottom - selectionBounds.top + 16} fill="transparent" stroke="currentColor" className="text-slate-600" strokeWidth={1.5 / Math.max(pageScale, .1)} strokeDasharray={`${5 / Math.max(pageScale, .1)} ${4 / Math.max(pageScale, .1)}`} /></svg>
            <button type="button" aria-label="Auswahl verschieben" className="absolute z-40 flex size-11 items-center justify-center rounded-md border border-border-control bg-background text-foreground outline-none interaction hover:bg-interaction-hover press:bg-interaction-pressed focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: `${Math.max(0, selectionBounds.left) / 10}%`, top: `${Math.max(0, selectionBounds.top) / 14}%`, touchAction: "none" }} onPointerDown={(e) => beginSelectionDrag(e)} onPointerMove={selectionMove} onPointerUp={selectionUp} onPointerCancel={selectionUp}><Grip className="size-4" /></button>
          </>}
          <canvas ref={inkRef} width={1000 * resolution} height={1400 * resolution} className="pointer-events-none absolute inset-0 z-10 size-full" aria-hidden />
          <canvas ref={activeRef} width={1000 * resolution} height={1400 * resolution} className="absolute inset-0 z-20 size-full" style={{ touchAction: "none", pointerEvents: "auto", cursor: placement ? "crosshair" : (tool === "pen" || tool === "marker" || tool === "shape") ? "crosshair" : tool === "eraser" ? "none" : "default" }}
            onPointerLeave={() => { cursorPoint.current = null; paintActive(); }} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} aria-label="Zeichenfläche. Mit Stift oder Maus zeichnen, mit einem Finger verschieben." />
        </div>
      </div>
    </div>
  </div>;
}

function PageBlock({ block, selectable, selected, editing, onSelect, onChange, pageScale }: {
  block: NotebookBlock; selectable: boolean; selected: boolean; editing: boolean; pageScale: number; onSelect: (edit?: boolean) => void; onChange: (block: NotebookBlock, textEdit?: boolean) => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const livePosition = useRef<NotebookBlock | null>(null);
  const dragging = useRef<{ x: number; y: number; block: NotebookBlock } | null>(null);
  const [position, setPosition] = useState<NotebookBlock | null>(null);
  const live = position ?? block;
  useEffect(() => { if (!editing || block.type !== "text") return; const frame = requestAnimationFrame(() => textRef.current?.focus({ preventScroll: true })); return () => cancelAnimationFrame(frame); }, [editing, block.type]);
  function resizeDown(e: React.PointerEvent<HTMLButtonElement>) { e.preventDefault(); e.stopPropagation(); onSelect(); dragging.current = { x: e.clientX, y: e.clientY, block }; e.currentTarget.setPointerCapture(e.pointerId); }
  function resizeMove(e: React.PointerEvent<HTMLButtonElement>) {
    const state = dragging.current; if (!state) return;
    const next = { ...state.block, width: Math.max(100, Math.min(1000 - state.block.x, state.block.width + (e.clientX - state.x) / pageScale)), height: Math.max(70, Math.min(1400 - state.block.y, state.block.height + (e.clientY - state.y) / pageScale)) };
    livePosition.current = next; setPosition(next);
  }
  function resizeUp(e: React.PointerEvent<HTMLButtonElement>) { if (!dragging.current) return; dragging.current = null; if (livePosition.current && e.type !== "pointercancel") onChange(livePosition.current); livePosition.current = null; setPosition(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }
  const boxStyle = { left: `${live.x / 10}%`, top: `${live.y / 14}%`, width: `${live.width / 10}%`, height: `${live.height / 14}%` };
  if (block.type === "text") return <div className="absolute z-30" style={{ ...boxStyle, pointerEvents: selectable ? "auto" : "none" }} onClick={(e) => { e.stopPropagation(); onSelect(false); }} onDoubleClick={(e) => { e.stopPropagation(); onSelect(true); }}>
    <textarea ref={textRef} id={`notebook-text-${block.id}`} aria-label="Text auf dem Heftblatt" value={block.text ?? ""} readOnly={!editing}
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onChange={(e) => onChange({ ...block, text: e.target.value, height: Math.min(1400 - block.y, Math.max(block.height, e.currentTarget.scrollHeight)) }, true)} placeholder={editing ? "Hier schreiben …" : ""}
      className="resize-none rounded-none border-0 bg-transparent p-2 text-[22px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-400" style={{ width: live.width, height: live.height, transform: `scale(${pageScale})`, transformOrigin: "top left", pointerEvents: editing ? "auto" : "none" }} />
    {selectable && selected && <button aria-label="Elementgröße ändern" className="absolute bottom-0 right-0 z-40 flex size-11 items-center justify-center rounded-md border border-border-control bg-background text-foreground outline-none interaction hover:bg-interaction-hover press:bg-interaction-pressed focus-visible:ring-2 focus-visible:ring-ring" style={{ touchAction: "none" }} onPointerDown={resizeDown} onPointerMove={resizeMove} onPointerUp={resizeUp} onPointerCancel={resizeUp}><MoveDiagonal className="size-4" /></button>}
  </div>;
  return <>
    <div className="pointer-events-none absolute z-[1]" style={boxStyle}>{block.type === "image" ? <img src={`/api/files/${block.fileId}?preview=1`} alt="Eingefügtes Bild" draggable={false} className="size-full object-contain" /> : <PdfBlock fileId={block.fileId!} pageNumber={block.pageNumber ?? 1} />}</div>
    {selectable && <div className="absolute z-30" style={boxStyle} onClick={(event) => { event.stopPropagation(); onSelect(false); }}>
      {selected && <button aria-label="Elementgröße ändern" className="absolute bottom-0 right-0 z-40 flex size-11 items-center justify-center rounded-md border border-border-control bg-background text-foreground outline-none interaction hover:bg-interaction-hover press:bg-interaction-pressed focus-visible:ring-2 focus-visible:ring-ring" style={{ touchAction: "none" }} onPointerDown={resizeDown} onPointerMove={resizeMove} onPointerUp={resizeUp} onPointerCancel={resizeUp}><MoveDiagonal className="size-4" /></button>}
    </div>}
  </>;
}

function PdfBlock({ fileId, pageNumber }: { fileId: string; pageNumber: number }) {
  const canvas = useRef<HTMLCanvasElement>(null); const [state, setState] = useState<"loading" | "ready" | "error">("loading"); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let dispose: (() => void) | undefined; setState("loading");
    void (async () => { try {
      const { openNotebookPdf } = await import("@/lib/notebook-pdf"); const response = await fetch(`/api/files/${fileId}?preview=1`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) }); if (!response.ok) throw new Error("PDF nicht verfügbar");
      const pdf = await openNotebookPdf(await response.arrayBuffer()); dispose = () => { void pdf.destroy(); }; if (controller.signal.aborted) return;
      const page = await pdf.document.getPage(pageNumber), viewport = page.getViewport({ scale: 1500 / page.getViewport({ scale: 1 }).width }), target = canvas.current; if (!target || controller.signal.aborted) return;
      target.width = viewport.width; target.height = viewport.height; const task = page.render({ canvas: target, canvasContext: target.getContext("2d")!, viewport }); dispose = () => { task.cancel(); void pdf.destroy(); }; await task.promise; if (!controller.signal.aborted) setState("ready");
    } catch { if (!controller.signal.aborted) setState("error"); } finally { if (controller.signal.aborted) dispose?.(); } })();
    return () => { controller.abort(); dispose?.(); };
  }, [fileId, pageNumber, retry]);
  return <div className="relative size-full bg-white"><canvas ref={canvas} className="size-full object-contain" />{state === "loading" && <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-500" role="status"><Loader2 className="size-4 animate-spin" />PDF wird geladen …</div>}{state === "error" && <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center text-sm text-slate-600"><p>PDF konnte nicht geladen werden.</p><button onClick={() => setRetry((value) => value + 1)} className="mt-2 min-h-11 rounded-md border px-3">Erneut versuchen</button></div>}</div>;
}
