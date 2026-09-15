import type { NotebookPage } from "@/lib/notebook-types";

export type NotebookDraft = { page: NotebookPage; needsCreate: boolean; dirty: boolean; serverUpdatedAt?: string };
const PREFIX = "atlas-notebook:";
const queues = new Map<string, Promise<NotebookPage>>();
const confirmedVersions = new Map<string, string>();

export class NotebookConflictError extends Error {
  constructor(public page: NotebookPage) {
    super("Diese Seite wurde auf einem anderen Gerät geändert.");
  }
}

export function readNotebookDraft(id: string): NotebookDraft | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    const draft = JSON.parse(raw) as NotebookDraft;
    return draft.page?.id === id && Array.isArray(draft.page.content?.strokes) && Array.isArray(draft.page.content?.blocks) ? draft : null;
  } catch { return null; }
}

export function subjectNotebookDrafts(subjectId: string): NotebookDraft[] {
  try {
    const drafts: NotebookDraft[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const draft = readNotebookDraft(key.slice(PREFIX.length));
      if (draft?.page.subjectId === subjectId) drafts.push(draft);
    }
    return drafts;
  } catch { return []; }
}

export function writeNotebookDraft(draft: NotebookDraft) {
  localStorage.setItem(PREFIX + draft.page.id, JSON.stringify(draft));
}

function updateLocal(id: string, fn: (draft: NotebookDraft) => NotebookDraft) {
  const local = readNotebookDraft(id);
  if (local) {
    // Netzwerk-Speichern muss auch bei vollem Gerätespeicher weitergehen.
    try { writeNotebookDraft(fn(local)); } catch { /* Editor zeigt fehlende lokale Sicherung. */ }
  }
}

// Eine Queue je Seite gilt auch über Wechsel und Remounts hinweg. Ein alter
// Autosave kann dadurch niemals nach einem neueren auf dem Server landen.
export function saveNotebookDraft(draft: NotebookDraft): Promise<NotebookPage> {
  const previous = queues.get(draft.page.id);
  const next = Promise.resolve(previous).catch(() => undefined).then(async (previousPage) => {
    // localStorage kann von einem anderen Tab geändert worden sein. Nur
    // der Ausgangsstand des Entwurfs und unsere eigenen bestätigten Saves
    // dürfen die Versionsprüfung fortschreiben.
    const confirmed = previousPage?.updatedAt ?? confirmedVersions.get(draft.page.id);
    let expectedUpdatedAt = confirmed && (!draft.serverUpdatedAt || confirmed > draft.serverUpdatedAt) ? confirmed : draft.serverUpdatedAt;
    if (draft.needsCreate && !confirmed) {
      const created = await notebookRequest("/api/notebooks", "POST", {
        id: draft.page.id, subjectId: draft.page.subjectId, title: draft.page.title.trim() || "Unbenannte Seite", paper: draft.page.paper, chapterId: draft.page.chapterId,
      });
      if ((created.content.strokes.length || created.content.blocks.length) && JSON.stringify(created.content) !== JSON.stringify(draft.page.content)) {
        throw new NotebookConflictError(created);
      }
      expectedUpdatedAt = created.updatedAt;
      confirmedVersions.set(draft.page.id, created.updatedAt);
      updateLocal(draft.page.id, (latest) => ({ ...latest, needsCreate: false, serverUpdatedAt: created.updatedAt }));
    }
    if (!expectedUpdatedAt) {
      throw new NotebookConflictError(await notebookRequest(`/api/notebooks/${draft.page.id}`, "GET", undefined));
    }
    const saved = await notebookRequest(`/api/notebooks/${draft.page.id}`, "PATCH", {
      title: draft.page.title.trim() || "Unbenannte Seite", paper: draft.page.paper, chapterId: draft.page.chapterId, content: draft.page.content, expectedUpdatedAt,
    });
    confirmedVersions.set(draft.page.id, saved.updatedAt);
    updateLocal(draft.page.id, (latest) => JSON.stringify(latest.page) === JSON.stringify(draft.page)
      ? { ...latest, needsCreate: false, serverUpdatedAt: saved.updatedAt, dirty: false }
      : latest);
    return saved;
  });
  queues.set(draft.page.id, next);
  void next.finally(() => { if (queues.get(draft.page.id) === next) queues.delete(draft.page.id); }).catch(() => {});
  return next;
}

async function notebookRequest(url: string, method: string, body: unknown): Promise<NotebookPage> {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) })
    .catch(() => { throw new Error("Keine Verbindung zum Server. Dein Entwurf wurde noch nicht synchronisiert."); });
  const data = await response.json().catch(() => null) as { page?: NotebookPage; error?: string } | null;
  if (response.status === 409 && data?.page) throw new NotebookConflictError(data.page);
  if (!response.ok || !data?.page) throw new Error(data?.error ?? "Die Seite konnte nicht gespeichert werden.");
  return data.page;
}
