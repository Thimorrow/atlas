import { describe, expect, it } from "vitest";
import { clearSavedLessonNoteDraft, queueLessonNoteSave, readLessonNoteDraft, waitForLessonNoteSave, writeLessonNoteDraft } from "./lesson-note-persistence";
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
describe("lesson note persistence", () => {
  it("serializes saves across mounts and waits before reading the same lesson", async () => {
    let release!: () => void;
    const firstWait = new Promise<void>((resolve) => { release = resolve; });
    const calls: string[] = [];
    const first = queueLessonNoteSave("same", async () => { calls.push("old-start"); await firstWait; calls.push("old-end"); });
    const second = queueLessonNoteSave("same", async () => { calls.push("new"); });
    const read = waitForLessonNoteSave("same").then(() => calls.push("read"));
    await Promise.resolve();
    expect(calls).toEqual(["old-start"]);
    release();
    await Promise.all([first, second, read]);
    expect(calls).toEqual(["old-start", "old-end", "new", "read"]);
  });
  it("does not block other lessons or poison the queue after a failed save", async () => {
    const failed = queueLessonNoteSave("failure", async () => { throw new Error("offline"); });
    const next = queueLessonNoteSave("failure", async () => "retry");
    await expect(queueLessonNoteSave("other", async () => "independent")).resolves.toBe("independent");
    await expect(failed).rejects.toThrow("offline");
    await expect(next).resolves.toBe("retry");
  });
  it("restores a pre-load draft including intentionally empty text", () => {
    const s = storage();
    writeLessonNoteDraft("lesson", "Typed before GET", s);
    expect(readLessonNoteDraft("lesson", s)).toBe("Typed before GET");
    writeLessonNoteDraft("lesson", "", s);
    expect(readLessonNoteDraft("lesson", s)).toBe("");
  });
  it("never clears a newer draft when an older response succeeds", () => {
    const s = storage();
    writeLessonNoteDraft("lesson", "new text", s);
    clearSavedLessonNoteDraft("lesson", "old text", s);
    expect(readLessonNoteDraft("lesson", s)).toBe("new text");
    clearSavedLessonNoteDraft("lesson", "new text", s);
    expect(readLessonNoteDraft("lesson", s)).toBeNull();
  });
  it("surfaces storage failures instead of pretending the draft was saved", () => {
    const s = { ...storage(), setItem: () => { throw new Error("quota"); } };
    expect(() => writeLessonNoteDraft("lesson", "text", s)).toThrow("quota");
  });
});
