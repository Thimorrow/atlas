import type { NotebookStroke } from "@/lib/notebook-types";

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
