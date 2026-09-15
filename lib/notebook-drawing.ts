import type { NotebookPoint, NotebookStroke } from "@/lib/notebook-types";

export function pagePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  return {
    x: Math.max(0, Math.min(1000, (clientX - rect.left) * 1000 / rect.width)),
    y: Math.max(0, Math.min(1400, (clientY - rect.top) * 1400 / rect.height)),
  };
}

export function strokeNear(stroke: NotebookStroke, x: number, y: number, radius = 18) {
  for (let i = 0; i < stroke.points.length; i++) {
    const a = stroke.points[i];
    const b = stroke.points[i + 1] ?? a;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= radius + stroke.width / 2) return true;
  }
  return false;
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: NotebookStroke) {
  if (stroke.kind) {
    drawSmoothStroke(ctx, stroke);
    return;
  }
  const points = stroke.points;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, stroke.width * (0.35 + points[0].pressure * 0.65) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 1; i < points.length; i++) {
    ctx.lineWidth = stroke.width * (0.35 + (points[i - 1].pressure + points[i].pressure) / 2 * 0.65);
    ctx.beginPath();
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
}

export function pinchScale(zoom: number, startDistance: number, distance: number) {
  return Math.max(50, Math.min(250, Math.round(zoom * distance / Math.max(1, startDistance))));
}

export function anchoredScroll(scroll: { left: number; top: number }, rect: { left: number; top: number; width: number; height: number }, anchor: { x: number; y: number }, center: { x: number; y: number }) {
  return {
    left: Math.max(0, scroll.left + rect.left + anchor.x * rect.width - center.x),
    top: Math.max(0, scroll.top + rect.top + anchor.y * rect.height - center.y),
  };
}


export type NotebookShape = "line" | "rectangle" | "ellipse";

export function shapePoints(shape: NotebookShape, start: NotebookPoint, end: NotebookPoint): NotebookPoint[] {
  const p = (x: number, y: number) => ({ x, y, pressure: 1 });
  if (shape === "line") return [p(start.x, start.y), p(end.x, end.y)];
  if (shape === "rectangle") return [p(start.x, start.y), p(end.x, start.y), p(end.x, end.y), p(start.x, end.y), p(start.x, start.y)];
  const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
  return Array.from({ length: 65 }, (_, i) => {
    const angle = i / 64 * Math.PI * 2;
    return p(cx + Math.abs(end.x - start.x) / 2 * Math.cos(angle), cy + Math.abs(end.y - start.y) / 2 * Math.sin(angle));
  });
}

function drawSmoothStroke(ctx: CanvasRenderingContext2D, stroke: NotebookStroke) {
  const points = stroke.points;
  if (!points.length) return;
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.width;
  ctx.globalAlpha = stroke.kind === "marker" ? 0.3 : 1;
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (stroke.kind === "shape" || stroke.kind === "marker") {
    // One path keeps a marker's opacity even throughout a single gesture.
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (stroke.kind === "shape") ctx.lineTo(b.x, b.y);
      else ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    ctx.lineTo(points.at(-1)!.x, points.at(-1)!.y);
    ctx.stroke();
  } else {
    let from = points[0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const to = i === points.length - 1 ? b : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ctx.lineWidth = stroke.width * (0.35 + (a.pressure + b.pressure) / 2 * 0.65);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(a.x, a.y, to.x, to.y);
      ctx.stroke();
      from = { ...a, ...to };
    }
  }
  ctx.restore();
}
