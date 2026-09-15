import { describe, expect, it } from "vitest";
import {
  ACCEPT_ATTR,
  uploadContentType,
  canPreview,
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
    expect([...ACCEPTED_TYPES]).toEqual(expect.arrayContaining([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/heic",
    ]));
  });

  it("baut das accept Attribut aus den Typen", () => {
    expect(ACCEPT_ATTR).toContain(".docx");
    expect(ACCEPT_ATTR).toContain("application/pdf");
  });
});

it("erkennt Office-Dateien ohne Browser-MIME und mit generischem MIME", () => {
  expect(uploadContentType({ name: "Arbeitsblatt.DOCX", type: "" })).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  expect(uploadContentType({ name: "Vortrag.pptx", type: "application/octet-stream" })).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
  expect(uploadContentType({ name: "unknown.exe", type: "application/octet-stream" })).toBe("application/octet-stream");
});
it("zeigt nur browserlesbare passive Formate inline", () => {
  expect(canPreview("application/pdf")).toBe(true);
  expect(canPreview("image/png")).toBe(true);
  expect(canPreview("text/html")).toBe(false);
  expect(canPreview("image/svg+xml")).toBe(false);
});
