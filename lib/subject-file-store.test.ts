import { describe, expect, it } from "vitest";
import {
  MULTIPART_MAX_SIZE,
  isAllowedContentType,
  storeUploadedFile,
} from "./subject-file-store";

// Die Waechter im Multipart-Weg greifen VOR dem ersten Aufruf an den
// Blob-Store und an die Datenbank. Genau deshalb sind sie hier ohne beides
// pruefbar -- und genau deshalb muessen sie dort auch stehen bleiben: eine
// zu grosse Datei darf gar nicht erst hochgeladen werden.
const subjectId = "00000000-0000-4000-8000-000000000000";

function datei(bytes: number, type: string, name = "probe.pdf"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("storeUploadedFile, Abweisungen vor dem Upload", () => {
  it("weist zu große Dateien mit 413 ab und erklärt den Grund auf Deutsch", async () => {
    const res = await storeUploadedFile(subjectId, datei(MULTIPART_MAX_SIZE + 1, "application/pdf"));
    expect(res).toMatchObject({ status: 413 });
    // Der Client soll aus der Meldung ablesen koennen, wie es doch geht.
    expect("error" in res && res.error).toContain("4 MB");
    expect("error" in res && res.error).toContain("10 MB");
  });

  it("weist leere Dateien mit 400 ab", async () => {
    const res = await storeUploadedFile(subjectId, datei(0, "application/pdf"));
    expect(res).toMatchObject({ status: 400 });
  });

  it("weist nicht erlaubte Dateitypen mit 400 ab", async () => {
    const res = await storeUploadedFile(subjectId, datei(10, "text/plain", "notiz.txt"));
    expect(res).toMatchObject({ status: 400 });
  });

  it("hält die Multipart-Grenze unter Vercels 4,5 MB pro Anfrage", () => {
    expect(MULTIPART_MAX_SIZE).toBeLessThan(4.5 * 1024 * 1024);
  });

  it("lässt genau die Typen der Spec durch", () => {
    for (const t of ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"]) {
      expect(isAllowedContentType(t)).toBe(true);
    }
    expect(isAllowedContentType("text/plain")).toBe(false);
    expect(isAllowedContentType("image/gif")).toBe(false);
  });
});
