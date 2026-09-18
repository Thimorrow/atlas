import type { NotebookBlock, NotebookPoint, NotebookStroke } from "@/lib/notebook-types";
import { shapePoints, type NotebookShape } from "@/lib/notebook-drawing";

type Point = Pick<NotebookPoint, "x" | "y">;
export type InkBounds = { left: number; top: number; right: number; bottom: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function pointSegmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function segmentsDistance(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC < 0 && abD > 0) || (abC > 0 && abD < 0)) && ((cdA < 0 && cdB > 0) || (cdA > 0 && cdB < 0))) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  return segmentsDistance(a, b, c, d) <= 0.001;
}

function segmentHitsPolygon(a: Point, b: Point, polygon: Point[]) {
  return polygon.some((point, index) => segmentsIntersect(a, b, point, polygon[(index + 1) % polygon.length]));
}

export function strokeHitsSweep(stroke: NotebookStroke, from: Point, to: Point, radius: number) {
  return stroke.points.some((p, i) => segmentsDistance(from, to, p, stroke.points[i + 1] ?? p) <= radius + stroke.width / 2);
}

export function pointInLasso(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (pointSegmentDistance(point, a, b) <= 1) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function lassoStrokes(strokes: NotebookStroke[], polygon: Point[]) {
  if (polygon.length < 3) return [];
  return strokes.filter((stroke) => stroke.points.some((point) => pointInLasso(point, polygon))
    || stroke.points.some((point, index) => index > 0 && segmentHitsPolygon(stroke.points[index - 1], point, polygon))).map((stroke) => stroke.id);
}

export function lassoBlocks(blocks: NotebookBlock[], polygon: Point[]) {
  if (polygon.length < 3) return [];
  return blocks.filter((block) => {
    const points = [
      { x: block.x, y: block.y },
      { x: block.x + block.width, y: block.y },
      { x: block.x + block.width, y: block.y + block.height },
      { x: block.x, y: block.y + block.height },
      { x: block.x + block.width / 2, y: block.y + block.height / 2 },
    ];
    return points.some((point) => pointInLasso(point, polygon));
  }).map((block) => block.id);
}

export function inkBounds(strokes: NotebookStroke[]): InkBounds | null {
  if (!strokes.length) return null;
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const stroke of strokes) for (const p of stroke.points) {
    bounds.left = Math.min(bounds.left, p.x); bounds.right = Math.max(bounds.right, p.x);
    bounds.top = Math.min(bounds.top, p.y); bounds.bottom = Math.max(bounds.bottom, p.y);
  }
  return bounds;
}

export function moveInk(strokes: NotebookStroke[], ids: string[], dx: number, dy: number) {
  const selected = new Set(ids);
  const bounds = inkBounds(strokes.filter(s => selected.has(s.id)));
  if (!bounds) return strokes;
  dx = Math.max(-bounds.left, Math.min(1000 - bounds.right, dx));
  dy = Math.max(-bounds.top, Math.min(1400 - bounds.bottom, dy));
  return strokes.map(s => selected.has(s.id) ? { ...s, points: s.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) } : s);
}

export function moveBlocks(blocks: NotebookBlock[], ids: string[], dx: number, dy: number) {
  const selected = new Set(ids);
  const chosen = blocks.filter((block) => selected.has(block.id));
  if (!chosen.length) return blocks;
  const left = Math.min(...chosen.map((block) => block.x));
  const top = Math.min(...chosen.map((block) => block.y));
  const right = Math.max(...chosen.map((block) => block.x + block.width));
  const bottom = Math.max(...chosen.map((block) => block.y + block.height));
  const safeX = Math.max(-left, Math.min(1000 - right, dx));
  const safeY = Math.max(-top, Math.min(1400 - bottom, dy));
  return blocks.map((block) => selected.has(block.id) ? { ...block, x: block.x + safeX, y: block.y + safeY } : block);
}

export function moveSelection(content: { strokes: NotebookStroke[]; blocks: NotebookBlock[] }, strokeIds: string[], blockIds: string[], dx: number, dy: number) {
  const strokes = new Set(strokeIds), blocks = new Set(blockIds);
  const chosenStrokes = content.strokes.filter((stroke) => strokes.has(stroke.id));
  const chosenBlocks = content.blocks.filter((block) => blocks.has(block.id));
  const strokeBounds = inkBounds(chosenStrokes);
  const left = Math.min(strokeBounds?.left ?? Infinity, ...chosenBlocks.map((block) => block.x));
  const top = Math.min(strokeBounds?.top ?? Infinity, ...chosenBlocks.map((block) => block.y));
  const right = Math.max(strokeBounds?.right ?? -Infinity, ...chosenBlocks.map((block) => block.x + block.width));
  const bottom = Math.max(strokeBounds?.bottom ?? -Infinity, ...chosenBlocks.map((block) => block.y + block.height));
  if (!Number.isFinite(left)) return content;
  const safeX = Math.max(-left, Math.min(1000 - right, dx));
  const safeY = Math.max(-top, Math.min(1400 - bottom, dy));
  return {
    strokes: content.strokes.map((stroke) => strokes.has(stroke.id) ? { ...stroke, points: stroke.points.map((point) => ({ ...point, x: point.x + safeX, y: point.y + safeY })) } : stroke),
    blocks: content.blocks.map((block) => blocks.has(block.id) ? { ...block, x: block.x + safeX, y: block.y + safeY } : block),
  };
}

// Resample by travelled distance, so a slow corner has the same weight as a fast edge.
function samplePath(points: NotebookPoint[]) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  const length = lengths.at(-1)!;
  let segment = 1;
  const samples = Array.from({ length: 65 }, (_, i) => {
    const target = length * i / 64;
    while (segment < points.length - 1 && lengths[segment] < target) segment++;
    const a = points[segment - 1], b = points[segment];
    const t = (target - lengths[segment - 1]) / (lengths[segment] - lengths[segment - 1] || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, pressure: 1 };
  });
  return { samples, length };
}

export function recognizeInkShape(points: NotebookPoint[]): { shape: NotebookShape; points: NotebookPoint[] } | null {
  if (points.length < 2) return null;
  const { samples, length } = samplePath(points);
  if (length < 70) return null;
  const start = points[0], end = points.at(-1)!;
  const chord = distance(start, end);
  if (chord / length > 0.94 && samples.every(p => pointSegmentDistance(p, start, end) < Math.max(5, chord * 0.035))) {
    return { shape: "line", points: shapePoints("line", start, end) };
  }
  const bounds = inkBounds([{ id: "", color: "#000", width: 1, points }])!;
  const w = bounds.right - bounds.left, h = bounds.bottom - bounds.top;
  if (w < 35 || h < 35 || distance(start, end) > Math.min(w, h) * 0.25 || length > (w + h) * 2.5 || length < (w + h) * 1.2) return null;
  const a = { x: bounds.left, y: bounds.top, pressure: 1 }, b = { x: bounds.right, y: bounds.bottom, pressure: 1 };
  const edgeError = samples.reduce((sum, p) => sum + Math.min(p.x - bounds.left, bounds.right - p.x, p.y - bounds.top, bounds.bottom - p.y), 0) / samples.length;
  const corners = shapePoints("rectangle", a, b);
  if (edgeError < Math.min(w, h) * 0.045 && corners.every(c => samples.some(p => distance(p, c) < Math.min(w, h) * 0.2))) {
    return { shape: "rectangle", points: corners };
  }
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  const radialError = samples.reduce((sum, p) => sum + Math.abs(Math.hypot((p.x - cx) / (w / 2), (p.y - cy) / (h / 2)) - 1), 0) / samples.length;
  if (radialError < 0.12) return { shape: "ellipse", points: shapePoints("ellipse", a, b) };
  return null;
}
