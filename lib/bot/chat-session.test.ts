import { afterEach, describe, expect, it } from "vitest";
import {
  clearChatSnapshot,
  getChatSnapshot,
  loadStoredDraft,
  saveStoredDraft,
  setChatSnapshot,
} from "@/lib/bot/chat-session";

afterEach(() => {
  clearChatSnapshot();
});

describe("chat-session: Sofort-Cache", () => {
  it("ist anfangs leer", () => {
    expect(getChatSnapshot()).toBeNull();
  });

  it("gibt zurück, was hineingelegt wurde", () => {
    setChatSnapshot({ info: { greeting: "Hallo" }, conversationId: "abc", turns: [{ id: "t1" }], savedAt: 1 });
    expect(getChatSnapshot()).toEqual({
      info: { greeting: "Hallo" },
      conversationId: "abc",
      turns: [{ id: "t1" }],
      savedAt: 1,
    });
  });

  it("vergisst nach clear wieder alles", () => {
    setChatSnapshot({ info: null, conversationId: null, turns: [], savedAt: 1 });
    clearChatSnapshot();
    expect(getChatSnapshot()).toBeNull();
  });
});

describe("chat-session: Entwurf", () => {
  it("stürzt ohne localStorage nicht ab und liefert Leerstring", () => {
    expect(loadStoredDraft()).toBe("");
    expect(() => saveStoredDraft("halb getippt")).not.toThrow();
  });
});
