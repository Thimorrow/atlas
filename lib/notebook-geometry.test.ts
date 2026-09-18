import { describe, expect, it } from "vitest";
import { inkBounds, lassoBlocks, lassoStrokes, moveInk, moveSelection, recognizeInkShape, strokeHitsSweep } from "@/lib/notebook-geometry";
import { shapePoints } from "@/lib/notebook-drawing";
const p = (x: number, y: number) => ({ x, y, pressure: 0.7 });
const stroke = { id: "a", kind: "ink" as const, color: "#000", width: 3, points: [p(100, 100), p(100, 300)] };

describe("continuous erasing", () => {
  it("hits a stroke crossed between pointer samples", () => {
    expect(strokeHitsSweep(stroke, p(0, 200), p(200, 200), 8)).toBe(true);
    expect(strokeHitsSweep(stroke, p(0, 50), p(200, 50), 8)).toBe(false);
  });
  it("handles stationary erasers, dots and collinear strokes", () => {
    expect(strokeHitsSweep(stroke, p(100, 200), p(100, 200), 8)).toBe(true);
    expect(strokeHitsSweep(stroke, p(100, 320), p(100, 400), 8)).toBe(false);
    expect(strokeHitsSweep({ ...stroke, points: [p(100, 200)] }, p(0, 200), p(200, 200), 8)).toBe(true);
  });
});

describe("lasso selection", () => {
  const polygon = [p(50, 50), p(150, 50), p(150, 350), p(50, 350)];
  it("selects enclosed and crossing strokes independent of point density", () => {
    expect(lassoStrokes([stroke, { ...stroke, id: "b", points: [p(0, 200), p(300, 200)] }, { ...stroke, id: "c", points: [p(300, 20), p(400, 20)] }], polygon)).toEqual(["a", "b"]);
    expect(lassoStrokes([stroke], polygon.slice(0, 2))).toEqual([]);
  });
  it("selects blocks in the same lasso as ink", () => {
    const blocks = [
      { id: "inside", type: "text" as const, x: 80, y: 100, width: 40, height: 80, text: "Text" },
      { id: "outside", type: "image" as const, x: 300, y: 100, width: 100, height: 100, fileId: "file" },
    ];
    expect(lassoBlocks(blocks, polygon)).toEqual(["inside"]);
  });
  it("moves a selection as a group and clamps to the page without distortion", () => {
    const other = { ...stroke, id: "b", points: [p(200, 400)] };
    const moved = moveInk([stroke, other], ["a"], -500, 2000);
    expect(moved[0].points).toEqual([p(0, 1200), p(0, 1400)]);
    expect(moved[1]).toBe(other);
    expect(stroke.points[0]).toEqual(p(100, 100));
    expect(inkBounds(moved)).toEqual({ left: 0, top: 400, right: 200, bottom: 1400 });
  });
  it("clamps mixed ink and blocks with one shared offset", () => {
    const block = { id: "block", type: "text" as const, x: 850, y: 100, width: 130, height: 100, text: "Text" };
    const moved = moveSelection({ strokes: [stroke], blocks: [block] }, [stroke.id], [block.id], 200, 0);
    expect(moved.strokes[0].points[0].x).toBe(120);
    expect(moved.blocks[0].x).toBe(870);
    expect(moved.blocks[0].x - moved.strokes[0].points[0].x).toBe(750);
  });
});

describe("draw and hold", () => {
  it("recognizes a slightly wobbly line", () => {
    expect(recognizeInkShape([p(100, 100), p(150, 103), p(210, 99), p(300, 100)])?.shape).toBe("line");
  });
  it.each(["rectangle", "ellipse"] as const)("recognizes %s", shape => {
    expect(recognizeInkShape(shapePoints(shape, p(100, 100), p(400, 300)))?.shape).toBe(shape);
  });
  it("does not turn a dot, short letter or open zigzag into a shape", () => {
    expect(recognizeInkShape([p(1, 1)])).toBeNull();
    expect(recognizeInkShape([p(1, 1), p(10, 10)])).toBeNull();
    expect(recognizeInkShape([p(100, 100), p(200, 250), p(250, 100), p(300, 250)])).toBeNull();
  });
});
