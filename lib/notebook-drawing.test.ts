import { describe, expect, it } from "vitest";
import { pagePoint, strokeNear } from "@/lib/notebook-drawing";

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
