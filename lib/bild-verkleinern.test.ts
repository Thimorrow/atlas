import { describe, expect, it } from "vitest";
import { zielmasse } from "@/lib/bild-verkleinern";

describe("zielmasse", () => {
  it("lässt kleine Bilder unverändert", () => {
    expect(zielmasse(1000, 800)).toEqual({ breite: 1000, hoehe: 800 });
  });

  it("begrenzt die lange Kante (Querformat) auf 2000 px", () => {
    expect(zielmasse(4000, 2000)).toEqual({ breite: 2000, hoehe: 1000 });
  });

  it("begrenzt die lange Kante (Hochformat) auf 2000 px", () => {
    expect(zielmasse(2000, 4000)).toEqual({ breite: 1000, hoehe: 2000 });
  });

  it("nimmt eine eigene maxKante an", () => {
    expect(zielmasse(3000, 1500, 1000)).toEqual({ breite: 1000, hoehe: 500 });
  });

  it("genau an der Grenze bleibt unverändert", () => {
    expect(zielmasse(2000, 1000)).toEqual({ breite: 2000, hoehe: 1000 });
  });
});
