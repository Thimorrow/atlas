import { describe, expect, it } from "vitest";
import { anchoredScroll, pagePoint, pinchScale, strokeNear } from "@/lib/notebook-drawing";

describe("Heft: skalierte Stifteingabe", () => {
  it("rechnet Bildschirmkoordinaten unabhängig vom Zoom ins Blatt um", () => {
    expect(pagePoint(270, 370, { left: 20, top: 20, width: 500, height: 700 })).toEqual({ x: 500, y: 700 });
    expect(pagePoint(1020, 1420, { left: 20, top: 20, width: 2000, height: 2800 })).toEqual({ x: 500, y: 700 });
  });
  it("begrenzt gezogene Striche auf das Blatt", () => {
    expect(pagePoint(-50, 2000, { left: 0, top: 0, width: 500, height: 700 })).toEqual({ x: 0, y: 1400 });
  });
  it("radiert auch zwischen zwei weit auseinanderliegenden Messpunkten", () => {
    const stroke = { id: "test", width: 3, color: "#000000", points: [{ x: 0, y: 100, pressure: 1 }, { x: 500, y: 100, pressure: 1 }] };
    expect(strokeNear(stroke, 250, 105)).toBe(true);
    expect(strokeNear(stroke, 250, 150)).toBe(false);
  });
});


describe("Heft: Pinch-Zoom", () => {
  it("skaliert relativ zum Beginn und begrenzt auf 50 bis 250 Prozent", () => {
    expect(pinchScale(100, 200, 300)).toBe(150);
    expect(pinchScale(150, 200, 100)).toBe(75);
    expect(pinchScale(100, 200, 10)).toBe(50);
    expect(pinchScale(200, 100, 200)).toBe(250);
  });
  it("hält beim Vergrößern denselben Blattpunkt unter dem Fingermittelpunkt", () => {
    const result = anchoredScroll({ left: 100, top: 200 }, { left: 20, top: -100, width: 1000, height: 1400 }, { x: 0.5, y: 0.5 }, { x: 270, y: 250 });
    expect(result).toEqual({ left: 350, top: 550 });
    expect(20 - (result.left - 100) + 500).toBe(270);
    expect(-100 - (result.top - 200) + 700).toBe(250);
  });
  it("verschiebt bei gleichem Zoom mit zwei Fingern und bleibt am Blattrand", () => {
    expect(anchoredScroll({ left: 200, top: 300 }, { left: -200, top: -300, width: 1000, height: 1400 }, { x: 0.5, y: 0.5 }, { x: 350, y: 450 })).toEqual({ left: 150, top: 250 });
    expect(anchoredScroll({ left: 0, top: 0 }, { left: 0, top: 0, width: 500, height: 700 }, { x: 0, y: 0 }, { x: 100, y: 100 })).toEqual({ left: 0, top: 0 });
  });
});

// Shapes must remain erasable using the same geometry that is saved.
import { shapePoints } from "@/lib/notebook-drawing";
describe("Heft: Formen", () => {
  const start = { x: 800, y: 900, pressure: 0.4 };
  const end = { x: 100, y: 200, pressure: 0.2 };
  it("schließt Rechtecke auch beim Ziehen nach links oben", () => {
    const points = shapePoints("rectangle", start, end);
    expect(points[0]).toEqual(points.at(-1));
    expect(strokeNear({ id: "rect", color: "#000", width: 3, points }, 450, 200)).toBe(true);
    expect(strokeNear({ id: "rect", color: "#000", width: 3, points }, 450, 550)).toBe(false);
  });
  it("hält Ellipsen innerhalb der gezogenen Fläche", () => {
    const points = shapePoints("ellipse", start, end);
    expect(points.every(p => p.x >= 100 && p.x <= 800 && p.y >= 200 && p.y <= 900)).toBe(true);
    expect(points.at(-1)!.x).toBeCloseTo(points[0].x);
    expect(points.at(-1)!.y).toBeCloseTo(points[0].y);
  });
});
