// Shared across editor mounts: returning to a lesson cannot overtake its last save.
const queues = new Map<string, Promise<void>>();
export function queueLessonNoteSave<T>(id: string, save: () => Promise<T>): Promise<T> {
  const result = (queues.get(id) ?? Promise.resolve()).then(save);
  const tail = result.then(() => {}, () => {});
  queues.set(id, tail);
  void tail.then(() => { if (queues.get(id) === tail) queues.delete(id); });
  return result;
}
export function waitForLessonNoteSave(id: string): Promise<void> {
  return queues.get(id) ?? Promise.resolve();
}
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = (id: string) => `atlas:lesson-note-draft:${id}`;
export function readLessonNoteDraft(id: string, storage: DraftStorage = window.localStorage): string | null {
  return storage.getItem(key(id));
}
export function writeLessonNoteDraft(id: string, body: string, storage: DraftStorage = window.localStorage) {
  storage.setItem(key(id), body);
}
export function clearSavedLessonNoteDraft(id: string, saved: string, storage: DraftStorage = window.localStorage) {
  if (storage.getItem(key(id)) === saved) storage.removeItem(key(id));
}
