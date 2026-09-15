import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/notebook-store", async (original) => ({ ...await original<typeof import("@/lib/notebook-store")>(), createNotebookChapter: vi.fn(), renameNotebookChapter: vi.fn(), createNotebookPage: vi.fn(), notebookChapterBelongsToSubject: vi.fn() }));
vi.mock("@/lib/subject-store", async (original) => ({ ...await original<typeof import("@/lib/subject-store")>(), getSubject: vi.fn() }));
import { POST } from "@/app/api/notebook-chapters/route";
import { PATCH } from "@/app/api/notebook-chapters/[id]/route";
import { POST as createPage } from "@/app/api/notebooks/route";
import { createNotebookChapter, renameNotebookChapter, createNotebookPage, notebookChapterBelongsToSubject } from "@/lib/notebook-store";
import { getSubject } from "@/lib/subject-store";
const id = "11111111-1111-4111-8111-111111111111";
const chapter = { id, subjectId: id, title: "Funktionen", createdAt: "2026-09-15T00:00:00.000Z" };
const request = (method: string, body: unknown) => new Request("http://localhost/api/notebook-chapters", { method, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSubject).mockResolvedValue({ id } as NonNullable<Awaited<ReturnType<typeof getSubject>>>);
});
describe("chapter API", () => {
  it("creates an empty chapter without creating a page", async () => {
    vi.mocked(createNotebookChapter).mockResolvedValue(chapter);
    const res = await POST(request("POST", { subjectId: id, title: " Funktionen " }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ chapter });
    expect(createNotebookChapter).toHaveBeenCalledWith(id, "Funktionen");
    expect(createNotebookPage).not.toHaveBeenCalled();
  });
  it("rejects blank titles without a write", async () => {
    expect((await POST(request("POST", { subjectId: id, title: " " }))).status).toBe(400);
    expect(createNotebookChapter).not.toHaveBeenCalled();
  });
  it("rejects missing subjects", async () => {
    vi.mocked(getSubject).mockResolvedValue(undefined);
    expect((await POST(request("POST", { subjectId: id, title: "Funktionen" }))).status).toBe(404);
    expect(createNotebookChapter).not.toHaveBeenCalled();
  });
  it("renames only the chapter title, ignoring subject changes", async () => {
    vi.mocked(renameNotebookChapter).mockResolvedValue(chapter);
    expect((await PATCH(request("PATCH", { title: "Funktionen", subjectId: "other" }), { params: Promise.resolve({ id }) })).status).toBe(200);
    expect(renameNotebookChapter).toHaveBeenCalledWith(id, "Funktionen");
  });
  it("returns 404 for missing chapters", async () => {
    vi.mocked(renameNotebookChapter).mockResolvedValue(null);
    expect((await PATCH(request("PATCH", { title: "Funktionen" }), { params: Promise.resolve({ id }) })).status).toBe(404);
  });
  it("rejects creation of a page in a foreign chapter", async () => {
    vi.mocked(notebookChapterBelongsToSubject).mockResolvedValue(false);
    expect((await createPage(request("POST", { subjectId: id, chapterId: id }))).status).toBe(400);
    expect(createNotebookPage).not.toHaveBeenCalled();
  });
});
