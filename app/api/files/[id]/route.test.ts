import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/subject-file-store", () => ({ readFile: vi.fn(), deleteFile: vi.fn(), isUuid: () => true }));
import { readFile } from "@/lib/subject-file-store";
import { GET } from "./route";
const id = "11111111-1111-1111-1111-111111111111";
async function response(type: string, preview = false) {
  vi.mocked(readFile).mockResolvedValue({ row: { name: "Arbeitsblatt.pdf", contentType: type, size: 4 }, stream: new ReadableStream() } as never);
  return GET(new Request(`http://localhost/api/files/${id}${preview ? "?preview=1" : ""}`), { params: Promise.resolve({ id }) });
}
describe("private Dateivorschau", () => {
  it("liefert PDF inline nur für die ausdrückliche Vorschau", async () => {
    expect((await response("application/pdf", true)).headers.get("content-disposition")).toMatch(/^inline;/);
    expect((await response("application/pdf")).headers.get("content-disposition")).toMatch(/^attachment;/);
  });
  it("liefert aktive und unbekannte Inhalte stets als Download", async () => {
    for (const type of ["text/html", "image/svg+xml", "application/octet-stream"]) {
      const res = await response(type, true);
      expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });
});
