import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotebookConflictError, readNotebookDraft, saveNotebookDraft, writeNotebookDraft } from "@/lib/notebook-drafts";
import type { NotebookPage } from "@/lib/notebook-types";

const basePage: NotebookPage = { id: "page", subjectId: "subject", title: "Seite 1", paper: "lined", content: { strokes: [], blocks: [] }, createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z" };
const response = (saved: NotebookPage, status = 200) => ({ ok: status < 400, status, json: async () => ({ page: saved }) });
let page: NotebookPage;
beforeEach(() => {
  page = { ...basePage, id: crypto.randomUUID() };
  const memory = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

describe("Heft: sichere Entwürfe und Autosave", () => {
  it("legt eine Offline-Seite an und nutzt den Server-Zeitstempel für den ersten Save", async () => {
    const created = { ...page, updatedAt: "2026-09-15T01:00:00.000Z" };
    const saved = { ...created, updatedAt: "2026-09-15T01:00:01.000Z" };
    const fetchMock = vi.fn().mockResolvedValueOnce(response(created)).mockResolvedValueOnce(response(saved));
    vi.stubGlobal("fetch", fetchMock);
    const draft = { page, dirty: true, needsCreate: true };
    writeNotebookDraft(draft);
    await saveNotebookDraft(draft);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).expectedUpdatedAt).toBe(created.updatedAt);
    expect(readNotebookDraft(page.id)).toMatchObject({ dirty: false, needsCreate: false, serverUpdatedAt: saved.updatedAt });
  });

  it("schickt Saves nacheinander und schützt einen neueren lokalen Entwurf", async () => {
    let finish!: (value: unknown) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(response({ ...page, title: "Neu", updatedAt: "2026-09-15T02:00:00.000Z" }));
    vi.stubGlobal("fetch", fetchMock);
    const first = { page, dirty: true, needsCreate: false, serverUpdatedAt: page.updatedAt };
    writeNotebookDraft(first);
    const save1 = saveNotebookDraft(first);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const second = { ...first, page: { ...page, title: "Neu" } };
    writeNotebookDraft(second);
    const save2 = saveNotebookDraft(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const timestamp = "2026-09-15T01:00:00.000Z";
    finish(response({ ...page, updatedAt: timestamp }));
    await save1;
    expect(readNotebookDraft(page.id)?.page.title).toBe("Neu");
    await save2;
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).expectedUpdatedAt).toBe(timestamp);
    expect(readNotebookDraft(page.id)?.dirty).toBe(false);
  });

  it("bewahrt bei einem Konflikt den lokalen Entwurf und Server-Token", async () => {
    const server = { ...page, title: "Anderes Gerät", updatedAt: "2026-09-15T02:00:00.000Z" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(server, 409)));
    const local = { page: { ...page, title: "Meine Notizen" }, dirty: true, needsCreate: false, serverUpdatedAt: page.updatedAt };
    writeNotebookDraft(local);
    await expect(saveNotebookDraft(local)).rejects.toBeInstanceOf(NotebookConflictError);
    expect(readNotebookDraft(page.id)).toEqual(local);
  });

  it("ein fremder localStorage-Token umgeht keine Konfliktprüfung", async () => {
    const newer = { ...page, title: "Anderer Tab", updatedAt: "2026-09-15T03:00:00.000Z" };
    const fetchMock = vi.fn().mockResolvedValue(response(newer, 409));
    vi.stubGlobal("fetch", fetchMock);
    const original = { page, dirty: true, needsCreate: false, serverUpdatedAt: page.updatedAt };
    writeNotebookDraft({ ...original, serverUpdatedAt: newer.updatedAt });
    await expect(saveNotebookDraft(original)).rejects.toBeInstanceOf(NotebookConflictError);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).expectedUpdatedAt).toBe(page.updatedAt);
  });

  it("behält nach einem Netzfehler die Seite für einen späteren Versuch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const local = { page, dirty: true, needsCreate: false, serverUpdatedAt: page.updatedAt };
    writeNotebookDraft(local);
    await expect(saveNotebookDraft(local)).rejects.toThrow("Keine Verbindung zum Server");
    expect(readNotebookDraft(page.id)?.dirty).toBe(true);
  });
});

it("preserves chapter assignments when creating and syncing an offline draft", async () => {
  page.chapterId = crypto.randomUUID();
  const fetchMock = vi.fn().mockResolvedValue(response(page));
  vi.stubGlobal("fetch", fetchMock);
  const draft = { page, dirty: true, needsCreate: true };
  writeNotebookDraft(draft);
  await saveNotebookDraft(draft);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  for (const call of fetchMock.mock.calls) expect(JSON.parse(call[1].body).chapterId).toBe(page.chapterId);
  expect(readNotebookDraft(page.id)?.page.chapterId).toBe(page.chapterId);
});

it("omits chapter changes for legacy drafts", async () => {
  const fetchMock = vi.fn().mockResolvedValue(response(page));
  vi.stubGlobal("fetch", fetchMock);
  await saveNotebookDraft({ page, dirty: true, needsCreate: false, serverUpdatedAt: page.updatedAt });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("chapterId");
});
