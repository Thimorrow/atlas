import { describe, expect, it } from "vitest";
import { asciiPfad } from "./pfad-ascii";

describe("asciiPfad", () => {
  it("laesst einen ASCII-Pfad in Ruhe", () => {
    expect(asciiPfad("/faecher")).toBeNull();
    expect(asciiPfad("/faecher/9d6b2f1e-0000-4000-8000-000000000000")).toBeNull();
  });

  it("macht aus /fächer wieder /faecher", () => {
    expect(asciiPfad("/fächer")).toBe("/faecher");
  });

  it("versteht auch die prozentkodierte Form aus der Adresszeile", () => {
    expect(asciiPfad("/f%C3%A4cher")).toBe("/faecher");
    expect(asciiPfad("/f%C3%A4cher/abc")).toBe("/faecher/abc");
  });

  it("deckt die uebrigen Umlaute und das Eszett ab", () => {
    expect(asciiPfad("/prüfungen")).toBe("/pruefungen");
    expect(asciiPfad("/Übungen")).toBe("/Uebungen");
    expect(asciiPfad("/größe")).toBe("/groesse");
  });

  it("gibt bei kaputter Kodierung auf, statt zu werfen", () => {
    expect(asciiPfad("/%E0%A4%A")).toBeNull();
  });
});
