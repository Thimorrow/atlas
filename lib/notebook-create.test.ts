import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ inserted: vi.fn(), selected: vi.fn(), values: vi.fn(), where: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  insert: () => ({ values: (input: unknown) => { mocks.values(input); return { onConflictDoNothing: () => ({ returning: mocks.inserted }) }; } }),
  update: () => ({ set: (value: unknown) => { mocks.set(value); return { where: (condition: unknown) => { mocks.where(condition); return { returning: async () => [] }; } }; } }),
  select: () => ({ from: () => ({ where: () => ({ limit: mocks.selected }) }) }),
} }));
import { PgDialect } from "drizzle-orm/pg-core";
import { createNotebookPage, updateNotebookPage } from "@/lib/notebook-store";
const id = "11111111-1111-4111-8111-111111111111";
const subjectId = "22222222-2222-4222-8222-222222222222";
const row = { id, subjectId, title: "Vorhandene Seite", paper: "lined", content: { strokes: [], blocks: [] }, createdAt: new Date(), updatedAt: new Date() };
beforeEach(() => vi.clearAllMocks());
describe("optimistic notebook page creation", () => {
  it("returns the existing page after a lost creation response without overwriting it", async () => {
    mocks.inserted.mockResolvedValue([]);
    mocks.selected.mockResolvedValue([row]);
    const saved = await createNotebookPage({ id, subjectId, title: "Neuer Entwurf" });
    expect(saved.id).toBe(id);
    expect(saved.title).toBe("Vorhandene Seite");
    expect(mocks.values).toHaveBeenCalledWith({ id, subjectId, title: "Neuer Entwurf" });
  });
  it("never returns another subject's page for a reused client id", async () => {
    mocks.inserted.mockResolvedValue([]);
    mocks.selected.mockResolvedValue([{ ...row, subjectId: "other" }]);
    await expect(createNotebookPage({ id, subjectId })).rejects.toThrow("bereits vergeben");
  });
});


it("compares the revision in the SQL update rather than a separate read", async () => {
  const token = "2026-09-15T08:00:00.123Z";
  expect(await updateNotebookPage(id, { title: "Neu" }, token)).toBeNull();
  const dialect = new PgDialect();
  const where = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
  expect(where.sql).toContain('"notebook_pages"."id" =');
  expect(where.sql).toContain('"notebook_pages"."updated_at" =');
  expect(where.params).toEqual([id, token]);
  const update = dialect.sqlToQuery(mocks.set.mock.calls[0][0].updatedAt);
  expect(update.sql).toContain("interval '1 millisecond'");
});
