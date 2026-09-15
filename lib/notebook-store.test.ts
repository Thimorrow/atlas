import { describe, expect, it } from "vitest";
import { MAX_NOTEBOOK_BYTES, parseNotebookPatch, parseNotebookChapter, readNotebookBody } from "@/lib/notebook-store";

const content = () => ({ strokes: [{ id: "stroke", color: "#121212", width: 3, points: [{ x: 10, y: 20, pressure: 0.5 }] }], blocks: [{ id: "text", type: "text", x: 10, y: 20, width: 400, height: 200, text: "Mein Hefteintrag" }] });
describe("notebook content validation", () => {
  it("accepts mixed text, ink and a selected PDF page", () => {
    const c = content();
    const result = parseNotebookPatch({ title: " Mathe ", paper: "grid", content: { ...c, blocks: [...c.blocks, { id: "pdf", type: "pdf", x: 0, y: 0, width: 500, height: 700, fileId: "11111111-1111-4111-8111-111111111111", pageNumber: 3 }] } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title).toBe("Mathe");
  });
  it.each([NaN, Infinity, -1, 1001])("rejects unsafe stroke coordinate %s", (x) => {
    const c = content(); c.strokes[0].points[0].x = x;
    expect(parseNotebookPatch({ content: c }).ok).toBe(false);
  });
  it("rejects duplicate element ids to preserve reliable edits", () => {
    const c = content(); c.blocks[0].id = c.strokes[0].id;
    expect(parseNotebookPatch({ content: c }).ok).toBe(false);
  });
  it("rejects missing file references and invalid PDF page numbers", () => {
    const base = { id: "pdf", type: "pdf", x: 0, y: 0, width: 10, height: 10 };
    expect(parseNotebookPatch({ content: { strokes: [], blocks: [base] } }).ok).toBe(false);
    expect(parseNotebookPatch({ content: { strokes: [], blocks: [{ ...base, fileId: "11111111-1111-4111-8111-111111111111", pageNumber: 0 }] } }).ok).toBe(false);
  });
  it("rejects oversized point arrays", () => {
    const c = content(); c.strokes[0].points = Array.from({ length: 50001 }, () => ({ x: 1, y: 1, pressure: 1 }));
    expect(parseNotebookPatch({ content: c }).ok).toBe(false);
  });
  it("accepts an empty page and title-only changes", () => {
    expect(parseNotebookPatch({ content: { strokes: [], blocks: [] } }).ok).toBe(true);
    expect(parseNotebookPatch({ title: "Seite 2" }).ok).toBe(true);
    expect(parseNotebookPatch({}).ok).toBe(false);
  });
  it("limits the actual streamed request body, without trusting Content-Length", async () => {
    const req = new Request("http://localhost", { method: "POST", body: "x".repeat(MAX_NOTEBOOK_BYTES + 1) });
    expect(await readNotebookBody(req)).toBeNull();
    expect(await readNotebookBody(new Request("http://localhost", { method: "POST", body: '{"title":"Seite"}' }))).toEqual({ title: "Seite" });
  });
});

describe("chapter validation", () => {
  it.each(["", "  ", "x".repeat(101), 12, null])("rejects invalid chapter title %s", (title) => {
    expect(parseNotebookChapter({ title }).ok).toBe(false);
  });
  it("trims chapter names", () => {
    expect(parseNotebookChapter({ title: "  Geometrie  " })).toEqual({ ok: true, title: "Geometrie" });
  });
  it.each(["unknown", 42, {}, ""])("rejects invalid chapter reference %s", (chapterId) => {
    expect(parseNotebookPatch({ chapterId }).ok).toBe(false);
  });
  it("does not reset a chapter when an older client omits the field", () => {
    expect(parseNotebookPatch({ title: "Alt" })).toEqual({ ok: true, value: { title: "Alt" } });
    expect(parseNotebookPatch({ chapterId: null })).toEqual({ ok: true, value: { chapterId: null } });
  });
});
