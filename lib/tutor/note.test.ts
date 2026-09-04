import { describe, expect, it } from "vitest";
import { noteFuerProzent } from "@/lib/tutor/note";

describe("noteFuerProzent", () => {
  it.each([
    [100, 1],
    [85, 1],
    [84, 2],
    [70, 2],
    [55, 3],
    [40, 4],
    [20, 5],
    [19, 6],
    [0, 6],
  ])("%i Prozent -> Note %i", (p, erwartet) => {
    expect(noteFuerProzent(p)).toBe(erwartet);
  });
});
