import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/notebook-store", async (original) => ({ ...await original<typeof import("@/lib/notebook-store")>(), getNotebookPage: vi.fn(), updateNotebookPage: vi.fn(), notebookFilesBelongToSubject: vi.fn(), notebookChapterBelongsToSubject: vi.fn() }));
import { PATCH } from "@/app/api/notebooks/[id]/route";
import { getNotebookPage, notebookChapterBelongsToSubject, notebookFilesBelongToSubject, updateNotebookPage } from "@/lib/notebook-store";
const id = "11111111-1111-4111-8111-111111111111";
const page = { id, subjectId: "22222222-2222-4222-8222-222222222222", title: "Seite", paper: "grid" as const, content: { strokes: [], blocks: [] }, createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z" };
const request = (body: unknown) => new Request("http://localhost/api/notebooks/" + id, { method: "PATCH", body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id }) };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getNotebookPage).mockResolvedValue(page); });
describe("notebook API", () => {
  it("never saves a foreign-subject file", async () => {
    vi.mocked(notebookFilesBelongToSubject).mockResolvedValue(false);
    const content = { strokes: [], blocks: [{ id: "pdf", type: "pdf", x: 0, y: 0, width: 500, height: 700, fileId: id }] };
    const response = await PATCH(request({ content }), ctx);
    expect(response.status).toBe(400);
    expect(notebookFilesBelongToSubject).toHaveBeenCalledWith(page.subjectId, content);
    expect(updateNotebookPage).not.toHaveBeenCalled();
  });
  it("saves only validated editable fields", async () => {
    vi.mocked(updateNotebookPage).mockResolvedValue({ ...page, title: "Neu" });
    const response = await PATCH(request({ title: "Neu", subjectId: id, id: "other" }), ctx);
    expect(response.status).toBe(200);
    expect(updateNotebookPage).toHaveBeenCalledWith(id, { title: "Neu" }, page.updatedAt);
  });
  it("returns the newer server page when an atomic revision check fails", async () => {
    const newer = { ...page, title: "Auf dem iPad geändert", updatedAt: "2026-09-15T00:00:01.000Z" };
    vi.mocked(getNotebookPage).mockResolvedValueOnce(page).mockResolvedValueOnce(newer);
    vi.mocked(updateNotebookPage).mockResolvedValue(null);
    const response = await PATCH(request({ title: "Alter Mac-Entwurf", expectedUpdatedAt: page.updatedAt }), ctx);
    expect(response.status).toBe(409);
    expect((await response.json()).page).toEqual(newer);
    expect(updateNotebookPage).toHaveBeenCalledWith(id, { title: "Alter Mac-Entwurf" }, page.updatedAt);
  });
  it("rejects invalid revision tokens before writing", async () => {
    expect((await PATCH(request({ title: "Neu", expectedUpdatedAt: "yesterday" }), ctx)).status).toBe(400);
    expect(updateNotebookPage).not.toHaveBeenCalled();
  });
  it("returns 404 for removed pages without a write", async () => {
    vi.mocked(getNotebookPage).mockResolvedValue(null);
    expect((await PATCH(request({ title: "Neu" }), ctx)).status).toBe(404);
    expect(updateNotebookPage).not.toHaveBeenCalled();
  });
});

describe("chapter assignment", () => {
  it("rejects a chapter from another subject without changing the page", async () => {
    vi.mocked(notebookChapterBelongsToSubject).mockResolvedValue(false);
    expect((await PATCH(request({ chapterId: id }), ctx)).status).toBe(400);
    expect(notebookChapterBelongsToSubject).toHaveBeenCalledWith(page.subjectId, id);
    expect(updateNotebookPage).not.toHaveBeenCalled();
  });
  it("moves a page with the same revision protection as its content", async () => {
    vi.mocked(notebookChapterBelongsToSubject).mockResolvedValue(true);
    vi.mocked(updateNotebookPage).mockResolvedValue({ ...page, chapterId: id });
    expect((await PATCH(request({ chapterId: id, expectedUpdatedAt: page.updatedAt }), ctx)).status).toBe(200);
    expect(updateNotebookPage).toHaveBeenCalledWith(id, { chapterId: id }, page.updatedAt);
  });
  it("can return a page to Ohne Kapitel without erasing its contents", async () => {
    vi.mocked(updateNotebookPage).mockResolvedValue({ ...page, chapterId: null });
    expect((await PATCH(request({ chapterId: null }), ctx)).status).toBe(200);
    expect(updateNotebookPage).toHaveBeenCalledWith(id, { chapterId: null }, page.updatedAt);
  });
});
