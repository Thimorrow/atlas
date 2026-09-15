import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  current: { id: "11111111-1111-4111-8111-111111111111", box: 3, revision: 2 },
  changed: [] as unknown[],
  set: vi.fn(),
  values: vi.fn(),
  select: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          fake.select();
          return [fake.current];
        },
      }),
    }),
    update: () => ({
      set: (value: unknown) => {
        fake.set(value);
        return { where: () => ({ returning: async () => fake.changed }) };
      },
    }),
    insert: () => ({
      values: (value: unknown) => {
        fake.values(value);
        return {
          onConflictDoNothing: () => ({ returning: async () => fake.changed }),
        };
      },
    }),
  },
}));
vi.mock("@/lib/bot/model", () => ({
  botEnabled: () => true,
  streamChatWithFallback: vi.fn(),
}));
import { POST as review } from "@/app/api/vokabeln/bewerten/route";
import { POST as save } from "@/app/api/vokabeln/route";
import { POST as read } from "@/app/api/vokabeln/lesen/route";
import { streamChatWithFallback } from "@/lib/bot/model";
const req = (body: unknown) =>
  new Request("http://localhost/api/vokabeln", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  fake.current.box = 3;
  fake.current.revision = 2;
  fake.changed = [];
});
describe("Vokabel API", () => {
  it("verhindert Bewertungen mit ungültigen IDs oder ohne Versionsstand", async () => {
    for (const data of [
      { id: "bad", richtig: true, revision: 2 },
      { id: fake.current.id, richtig: true },
      { id: fake.current.id, richtig: "ja", revision: 2 },
    ])
      expect((await review(req(data))).status).toBe(400);
    expect(fake.select).not.toHaveBeenCalled();
  });
  it("schreibt Box 4 nach einer richtigen Antwort und liefert den bestätigten Stand", async () => {
    fake.changed = [{ ...fake.current, box: 4, revision: 3 }];
    const response = await review(
      req({ id: fake.current.id, richtig: true, revision: 2 }),
    );
    expect(response.status).toBe(200);
    expect(fake.set).toHaveBeenCalledWith({ box: 4, revision: 3 });
    expect((await response.json()).vokabel.box).toBe(4);
  });
  it("weist eine veraltete/doppelte Bewertung zurück", async () => {
    expect(
      (await review(req({ id: fake.current.id, richtig: true, revision: 1 })))
        .status,
    ).toBe(409);
  });
  it("setzt auch gelernte Wörter bei falsch auf Box 1", async () => {
    fake.current.box = 6;
    fake.changed = [{ ...fake.current, box: 1, revision: 3 }];
    expect(
      (await review(req({ id: fake.current.id, richtig: false, revision: 2 })))
        .status,
    ).toBe(200);
    expect(fake.set).toHaveBeenCalledWith({ box: 1, revision: 3 });
  });
  it("speichert nur gültige Wörter und ignoriert eingeschleuste Boxwerte", async () => {
    expect(
      (await save(req({ sprache: "französisch", vokabeln: [] }))).status,
    ).toBe(400);
    expect(
      (
        await save(
          req({
            sprache: "latein",
            vokabeln: [{ wort: "a", deutsch: "b", abschnitt: "" }],
          }),
        )
      ).status,
    ).toBe(400);
    expect(fake.values).not.toHaveBeenCalled();
    expect(
      (
        await save(
          req({
            sprache: "latein",
            vokabeln: [{ wort: "a", deutsch: "b", abschnitt: "1", box: 6 }],
          }),
        )
      ).status,
    ).toBe(200);
    expect(fake.values).toHaveBeenCalledWith([
      { wort: "a", deutsch: "b", abschnitt: "1", sprache: "latein" },
    ]);
  });
  it("lehnt falsche Bildformate vor dem KI-Aufruf ab", async () => {
    const form = new FormData();
    form.set("sprache", "latein");
    form.set("foto", new File(["text"], "test.txt", { type: "text/plain" }));
    expect(
      (
        await read(
          new Request("http://localhost/api/vokabeln/lesen", {
            method: "POST",
            body: form,
          }),
        )
      ).status,
    ).toBe(400);
    expect(streamChatWithFallback).not.toHaveBeenCalled();
  });
});
