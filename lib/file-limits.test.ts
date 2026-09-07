import { describe, expect, it } from "vitest";
import {
  ACCEPT_ATTR,
  ACCEPTED_TYPES,
  MAX_FILE_SIZE,
  MAX_FILES_PER_UPLOAD,
} from "@/lib/file-limits";

describe("file-limits", () => {
  it("begrenzt Groesse auf 10 MB", () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });

  it("begrenzt die Anzahl auf 10 Dateien", () => {
    expect(MAX_FILES_PER_UPLOAD).toBe(10);
  });

  it("akzeptiert PDF und gaengige Bildformate", () => {
    expect([...ACCEPTED_TYPES]).toEqual([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/heic",
    ]);
  });

  it("baut das accept Attribut aus den Typen", () => {
    expect(ACCEPT_ATTR).toBe(ACCEPTED_TYPES.join(","));
  });
});
