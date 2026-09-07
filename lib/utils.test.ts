import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("verbindet Klassen mit Leerzeichen", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("ignoriert falsy Werte", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("wertet Bedingungen und Objekte aus", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
    expect(cn({ a: true, b: false })).toBe("a");
  });

  it("loest Tailwind Konflikte nach rechts auf", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("gibt bei leerer Eingabe einen leeren String", () => {
    expect(cn()).toBe("");
  });
});
