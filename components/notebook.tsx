"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Highlighter, LassoSelect, Shapes, CircleAlert, Minus, MoreHorizontal, ChevronRight, Search, PanelLeftClose, PanelLeftOpen, Check, ChevronDown, Eraser, Loader2, Paperclip, PenLine, Plus, Redo2, Settings2, Type, Undo2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { NotebookCanvas, type NotebookPlacement, type NotebookTool } from "@/components/notebook-canvas";
import { useCachedJSON } from "@/lib/use-cached-json";
import { CACHE_TTLS } from "@/lib/fetch-cache";
import { cn } from "@/lib/utils";
import { ladeDateiInFachHoch } from "@/lib/datei-upload";
import { NotebookConflictError, readNotebookDraft, saveNotebookDraft, subjectNotebookDrafts, writeNotebookDraft, type NotebookDraft } from "@/lib/notebook-drafts";
import type { NotebookBlock, NotebookChapter, NotebookContent, NotebookPage, NotebookPageSummary, NotebookPaper } from "@/lib/notebook-types";

import type { NotebookShape } from "@/lib/notebook-drawing";

type Subject = { id: string; name: string };
const control = "cursor-pointer rounded-md outline-none interaction hover:bg-interaction-hover press:bg-interaction-pressed press:scale-[0.96] data-[state=open]:bg-interaction-hover disabled:pointer-events-none disabled:text-muted-foreground/40 [touch-action:manipulation]";
const toolButton = cn(control, "flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground");

export function Notebook() {
  const { data, loading, error, reload } = useCachedJSON<{ subjects: Subject[] }>("/api/subjects", CACHE_TTLS.subjects);
  const [chosenSubject, setChosenSubject] = useState("");
  const subjects = data?.subjects ?? [];
  const subjectId = chosenSubject || subjects[0]?.id || "";
  return <div className="mx-auto flex h-full max-w-[1600px] flex-col antialiased">
    {!subjectId && <header className="flex min-h-16 shrink-0 items-center justify-between gap-6 px-5 sm:px-8">
      <h1 className="text-base font-semibold">Hefte</h1>
      {subjects.length > 0 && <Select aria-label="Fach auswählen" value={subjectId} onValueChange={setChosenSubject} className={cn(control, "min-h-11 min-w-0 max-w-[min(22rem,70%)] border-transparent bg-transparent px-3 font-medium shadow-none")}>
        {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
      </Select>}
    </header>}
    {loading ? <Skeleton className="h-72 w-full rounded-xl" /> : error && !data ? <div className="rounded-xl border p-6"><p>Deine Fächer konnten nicht geladen werden.</p><Button onClick={reload} variant="outline" className="mt-3">Erneut versuchen</Button></div>
      : !subjectId ? <div className="rounded-xl border border-dashed p-8 text-center"><BookOpen className="mx-auto mb-3 size-8 text-muted-foreground" /><h2 className="font-medium">Ein Heft für jedes Fach</h2><p className="mt-2 text-sm text-muted-foreground">Lege zuerst ein Fach an. Danach kannst du hier loslegen.</p><Link href="/faecher" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground">Zu meinen Fächern</Link></div>
      : <SubjectNotebook key={subjectId} subjectId={subjectId} subjects={subjects} onSubjectChange={setChosenSubject} subjectName={subjects.find((subject) => subject.id === subjectId)?.name ?? ""} />}
  </div>;
}

function SubjectNotebook({ subjectId, subjectName, subjects, onSubjectChange }: { subjectId: string; subjectName: string; subjects: Subject[]; onSubjectChange: (id: string) => void }) {
  const { data, loading, error, reload, patch } = useCachedJSON<{ pages: NotebookPageSummary[]; chapters: NotebookChapter[] }>(`/api/notebooks?subjectId=${subjectId}`, 60_000);
  const [localPages, setLocalPages] = useState<NotebookPage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("created");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileContentsOpen, setMobileContentsOpen] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [activeChapter, setActiveChapter] = useState<string | null | undefined>(undefined);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [chapterForm, setChapterForm] = useState<{ id?: string; title: string } | null>(null);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [chapterError, setChapterError] = useState("");
  const [workspace, setWorkspace] = useState<NotebookWorkspace>({
    tool: "pen", color: "#1e293b", width: 3, markerColor: "#facc15", markerWidth: 24,
    eraserRadius: 18, markerOnly: false, shape: "line", zoom: 100,
  });
  const chapters = data?.chapters ?? [];
  useEffect(() => { setLocalPages(subjectNotebookDrafts(subjectId).map((draft) => draft.page)); }, [subjectId]);
  const merged = new Map<string, NotebookPageSummary>((data?.pages ?? []).map((page) => [page.id, page]));
  for (const page of localPages) {
    const remote = merged.get(page.id);
    if (!remote || page.updatedAt >= remote.updatedAt) merged.set(page.id, page);
  }
  const pages = [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const chapterGroups = new Map(chapters.map((chapter) => [chapter.id, { id: chapter.id, title: chapter.title }]));
  for (const page of pages) {
    if (page.chapterId && !chapterGroups.has(page.chapterId)) chapterGroups.set(page.chapterId, { id: page.chapterId, title: "Kapitel nicht geladen" });
  }
  const currentChapterId = activeChapter === undefined ? pages[0]?.chapterId ?? null : activeChapter;
  const currentChapter = chapters.find((chapter) => chapter.id === currentChapterId);
  const currentId = selected ?? pages.find((page) => (page.chapterId ?? null) === currentChapterId)?.id ?? null;
  const visiblePages = pages.filter((page) => page.title.toLocaleLowerCase("de").includes(query.trim().toLocaleLowerCase("de"))).sort((a, b) => sort === "updated" ? b.updatedAt.localeCompare(a.updatedAt) : a.createdAt.localeCompare(b.createdAt));

  function updatePage(page: NotebookPage) {
    setActiveChapter(page.chapterId ?? null);
    setFolded((old) => { const next = new Set(old); next.delete(page.chapterId ?? ""); return next; });
    setLocalPages((old) => [...old.filter((entry) => entry.id !== page.id), page]);
  }
  function createPage(chapterId: string | null = currentChapterId) {
    const now = new Date().toISOString();
    const page: NotebookPage = { id: crypto.randomUUID(), subjectId, chapterId, title: `Seite ${pages.length + 1}`, paper: "lined", content: { strokes: [], blocks: [] }, createdAt: now, updatedAt: now };
    try { writeNotebookDraft({ page, needsCreate: true, dirty: true }); } catch { setStorageError(true); }
    updatePage(page); setSelected(page.id); setQuery(""); setMobileContentsOpen(false);
  }
  async function saveChapter() {
    if (!chapterForm?.title.trim() || chapterBusy) return;
    setChapterBusy(true); setChapterError("");
    try {
      const response = await fetch(chapterForm.id ? `/api/notebook-chapters/${chapterForm.id}` : "/api/notebook-chapters", {
        method: chapterForm.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, title: chapterForm.title.trim() }), signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json() as { chapter?: NotebookChapter; error?: string };
      if (!response.ok || !result.chapter) throw new Error(result.error ?? "Das Kapitel konnte nicht gespeichert werden.");
      const chapter = result.chapter;
      patch((old) => ({ pages: old?.pages ?? [], chapters: chapterForm.id ? (old?.chapters ?? []).map((entry) => entry.id === chapter.id ? chapter : entry) : [...(old?.chapters ?? []), chapter] }));
      if (!chapterForm.id) { setActiveChapter(chapter.id); setSelected(null); setQuery(""); }
      setChapterForm(null);
    } catch (err) { setChapterError(err instanceof Error && err.name !== "TypeError" ? err.message : "Keine Verbindung. Dein Kapitelname bleibt hier. Versuche es erneut."); }
    finally { setChapterBusy(false); }
  }
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex min-h-16 shrink-0 items-center gap-2 border-b px-3 sm:px-6">
      <button type="button" className={cn(toolButton, "hidden lg:flex")} onClick={() => setSidebarOpen(!sidebarOpen)} aria-expanded={sidebarOpen} aria-controls="notebook-pages" aria-label={sidebarOpen ? "Inhalt ausblenden" : "Inhalt einblenden"} title={sidebarOpen ? "Inhalt ausblenden" : "Inhalt einblenden"}>{sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}</button>
      <button type="button" className={cn(control, "flex min-h-11 shrink-0 items-center gap-2 px-2 text-sm aria-expanded:bg-accent lg:hidden")} onClick={() => setMobileContentsOpen(!mobileContentsOpen)} aria-expanded={mobileContentsOpen} aria-controls="notebook-pages">{mobileContentsOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}Inhalt</button>
      <h1 className="sr-only">Hefte</h1>
      <Select aria-label="Fach auswählen" value={subjectId} onValueChange={onSubjectChange} className={cn(control, "min-h-11 min-w-0 flex-1 border-transparent bg-transparent px-3 font-medium shadow-none sm:flex-none sm:max-w-64")}>
        {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
      </Select>
      <span className="hidden min-w-0 flex-1 truncate pl-2 text-sm text-muted-foreground sm:block">{currentChapter?.title ?? "Ohne Kapitel"}</span>
      <Button variant="ghost" onClick={() => createPage()} className="min-h-11 shrink-0 gap-2 px-3 text-sm before:inset-0"><Plus className="size-4" /><span><span className="hidden sm:inline">Neue </span>Seite</span></Button>
    </div>
    <div className={cn("grid min-h-0 flex-1", sidebarOpen && "lg:grid-cols-[296px_minmax(0,1fr)]")}>
      {(sidebarOpen || mobileContentsOpen) && <aside id="notebook-pages" aria-label="Seitenübersicht" className={cn("min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-5 lg:border-r", mobileContentsOpen ? "flex" : "hidden", sidebarOpen ? "lg:flex" : "lg:hidden")}>
        <label className="flex min-h-11 shrink-0 items-center gap-3 rounded-md bg-muted/50 px-3 interaction hover:bg-muted focus-within:bg-muted focus-within:ring-2 focus-within:ring-ring"><Search aria-hidden className="size-4 shrink-0 text-muted-foreground" /><input aria-label="Seiten suchen" placeholder="Seiten suchen …" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 w-full bg-transparent text-base outline-none" /></label>
        <div className="mt-1 flex shrink-0 items-center justify-between gap-3"><h2 className="text-xs font-medium tabular-nums text-muted-foreground">Inhalt · {pages.length}</h2><Select aria-label="Seiten sortieren" value={sort} onValueChange={setSort} className={cn(control, "min-h-11 w-auto border-transparent bg-transparent px-3 text-xs shadow-none")}><option value="created">Reihenfolge</option><option value="updated">Zuletzt bearbeitet</option></Select></div>
        <nav aria-label="Heftseiten" className="space-y-5 pb-2">
          {[{ id: "", title: "Ohne Kapitel" }, ...chapterGroups.values()].map((chapter) => {
            const chapterPages = visiblePages.filter((page) => (page.chapterId ?? "") === chapter.id);
            if (query.trim() && !chapterPages.length) return null;
            const expanded = query.trim() || !folded.has(chapter.id);
            return <div key={chapter.id}>
              <div className="flex items-center gap-1">
                <button type="button" aria-label={`${chapter.title} ${expanded ? "zuklappen" : "aufklappen"}`} aria-expanded={Boolean(expanded)} className={toolButton} onClick={() => {
                  setFolded((old) => { const next = new Set(old); if (expanded) next.add(chapter.id); else next.delete(chapter.id); return next; });
                }} disabled={Boolean(query.trim())}>{expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button>
                <button type="button" className={cn(control, "min-h-11 min-w-0 flex-1 px-2 py-2 text-left text-sm font-medium leading-5 [overflow-wrap:anywhere]")} onClick={() => { setActiveChapter(chapter.id || null); setSelected(null); setFolded((old) => { const next = new Set(old); next.delete(chapter.id); return next; }); }} title={chapter.title}>{chapter.title}</button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" disabled={chapterBusy} className={toolButton} aria-label={`Aktionen für ${chapter.title}`} title="Kapitelaktionen"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-lg p-1.5 motion-reduce:animate-none">
                    <DropdownMenuItem className="min-h-11 rounded-md px-3 py-2.5" onSelect={() => createPage(chapter.id || null)}><Plus className="size-4" />Seite hinzufügen</DropdownMenuItem>
                    {chapters.some((entry) => entry.id === chapter.id) && <DropdownMenuItem className="min-h-11 rounded-md px-3 py-2.5" onSelect={() => { setChapterForm({ id: chapter.id, title: chapter.title }); setChapterError(""); }}><PenLine className="size-4" />Kapitel umbenennen</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {chapterForm?.id === chapter.id && <form className="ml-12 mt-2 space-y-3 rounded-lg border bg-card p-3" onSubmit={(e) => { e.preventDefault(); void saveChapter(); }}>
                <label htmlFor={`chapter-title-${chapter.id}`} className="text-sm font-medium">Kapitel umbenennen</label>
                <input id={`chapter-title-${chapter.id}`} autoFocus maxLength={100} required disabled={chapterBusy} value={chapterForm.title} onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })} className="min-h-11 w-full rounded-md border border-border-control bg-background px-3 py-2 text-base outline-none interaction focus-visible:ring-2 focus-visible:ring-ring" />
                {chapterError && <p role="alert" className="text-sm text-destructive">{chapterError}</p>}
                <div className="flex flex-wrap gap-2"><Button type="submit" disabled={chapterBusy || !chapterForm.title.trim()} className="min-h-11">{chapterBusy ? "Speichert …" : "Speichern"}</Button><Button type="button" variant="ghost" disabled={chapterBusy} className="min-h-11" onClick={() => setChapterForm(null)}>Abbrechen</Button></div>
              </form>}
              {expanded && <div className="mt-2 ml-3 space-y-1.5">
                {chapterPages.map((page) => <button key={page.id} onClick={() => { setActiveChapter(page.chapterId ?? null); setSelected(page.id); setMobileContentsOpen(false); }} aria-current={currentId === page.id ? "page" : undefined}
                  className={cn(control, "flex min-h-12 w-full items-start gap-3 rounded-l-none border-l-2 px-3 py-3 text-left", currentId === page.id ? "border-foreground bg-accent text-foreground hover:bg-accent press:bg-accent" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  <span className="w-5 shrink-0 pt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">{String(pages.findIndex((entry) => entry.id === page.id) + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 text-sm leading-5 [overflow-wrap:anywhere]">{page.title || "Unbenannte Seite"}</span>
                </button>)}
                {!chapterPages.length && !query.trim() && <button type="button" className={cn(control, "min-h-11 px-3 text-sm text-muted-foreground")} onClick={() => createPage(chapter.id || null)}>Erste Seite anlegen</button>}
              </div>}
            </div>;
          })}
          {!visiblePages.length && query.trim() && <p className="p-3 text-sm text-muted-foreground">Keine Seite mit diesem Titel gefunden.</p>}
        </nav>
        <Button variant="ghost" disabled={chapterBusy} className="mt-3 min-h-11 w-full shrink-0 justify-start gap-3 px-3 text-muted-foreground before:inset-0" onClick={() => { setChapterForm({ title: "" }); setChapterError(""); }}><Plus className="size-4" />Kapitel hinzufügen</Button>
        {chapterForm && !chapterForm.id && <form className="mt-2 space-y-3 border-t pt-4" onSubmit={(e) => { e.preventDefault(); void saveChapter(); }}>
          <label htmlFor="chapter-title" className="text-sm font-medium">Neues Kapitel</label>
          <input id="chapter-title" autoFocus maxLength={100} required disabled={chapterBusy} value={chapterForm.title} onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })} placeholder="z. B. Lineare Funktionen" className="min-h-11 w-full rounded-md border bg-background px-3 py-2 text-base outline-none interaction hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring" />
          {chapterError && <p role="alert" className="text-sm text-destructive">{chapterError}</p>}
          <div className="flex flex-wrap gap-3"><Button type="submit" disabled={chapterBusy || !chapterForm.title.trim()} className="min-h-11">{chapterBusy ? "Speichert …" : "Speichern"}</Button><Button type="button" variant="ghost" disabled={chapterBusy} className="min-h-11" onClick={() => setChapterForm(null)}>Abbrechen</Button></div>
        </form>}
        {query && <button className={cn(control, "mt-2 min-h-11 shrink-0 px-3 text-left text-sm text-muted-foreground")} onClick={() => setQuery("")}>Suche zurücksetzen</button>}
      </aside>}
      <div className={cn("min-h-0 min-w-0 flex-col overflow-y-auto", mobileContentsOpen ? "hidden lg:flex" : "flex")}>
        {storageError && <p role="alert" className="text-sm text-destructive">Auf diesem Gerät konnte kein Entwurf gesichert werden. Lass die Seite bis zum Speichern geöffnet.</p>}
        {error && <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" role="status">Die Seitenliste ist gerade nicht erreichbar. Lokale Seiten bleiben verfügbar.<Button variant="ghost" onClick={reload}>Erneut versuchen</Button></div>}
        {currentId ? <NotebookEditor key={currentId} id={currentId} chapters={chapters} initial={localPages.find((p) => p.id === currentId)} onPageChange={updatePage} workspace={workspace} onWorkspaceChange={setWorkspace} />
          : loading ? <Skeleton className="h-96 w-full rounded-xl" />
          : <div className="flex min-h-64 flex-1 flex-col justify-center px-8 py-12 sm:px-12"><p className="mb-4 text-xs text-muted-foreground">{subjectName} / {currentChapter?.title ?? "Ohne Kapitel"}</p><h2 className="max-w-md text-3xl font-semibold leading-tight">Hier beginnt {currentChapter ? "dein Kapitel." : "dein Heft."}</h2><p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">Lege die erste Seite an und halte fest, was du gelernt hast.</p><Button onClick={() => createPage()} className="mt-6 min-h-11 w-fit gap-2"><Plus className="size-4" />Erste Seite anlegen</Button></div>}

      </div>
    </div>
  </div>;
}

type SaveState = "loading" | "pending" | "saving" | "saved" | "error";

type NotebookWorkspace = {
  tool: NotebookTool; color: string; width: number; markerColor: string; markerWidth: number;
  eraserRadius: number; markerOnly: boolean; shape: NotebookShape; zoom: number;
};

function NotebookEditor({ id, initial, chapters, onPageChange, workspace, onWorkspaceChange }: { id: string; initial?: NotebookPage; chapters: NotebookChapter[]; onPageChange: (page: NotebookPage) => void; workspace: NotebookWorkspace; onWorkspaceChange: (value: NotebookWorkspace | ((current: NotebookWorkspace) => NotebookWorkspace)) => void }) {
  const [draft, setDraft] = useState<NotebookDraft | null>(null);
  const [status, setStatus] = useState<SaveState>("loading");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [conflict, setConflict] = useState<NotebookPage | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { tool, color, width, markerColor, markerWidth, eraserRadius, markerOnly, shape, zoom } = workspace;
  const setWorkspaceField = <K extends keyof NotebookWorkspace>(key: K, value: NotebookWorkspace[K]) => onWorkspaceChange((current) => ({ ...current, [key]: value }));
  const setTool = (value: NotebookTool) => setWorkspaceField("tool", value);
  const lastTextEdit = useRef<{ id: string; time: number } | null>(null);
  const activeColor = tool === "marker" ? markerColor : color;
  const activeWidth = tool === "marker" ? markerWidth : width;
  const setZoom = (value: number | ((current: number) => number)) => setWorkspaceField("zoom", typeof value === "function" ? value(zoom) : value);
  const [placement, setPlacement] = useState<NotebookPlacement>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{ fileId: string; type: "image" | "pdf"; pageNumber?: number; ratio: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [pdfImport, setPdfImport] = useState<{ file: File; pages: number; pageNumber: number; ratio: number } | null>(null);
  const [, forceHistory] = useState(0);
  const history = useRef<{ past: NotebookContent[]; future: NotebookContent[] }>({ past: [], future: [] });
  const latest = useRef<NotebookDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const insertMenuAction = useRef(false);
  const insertButton = useRef<HTMLButtonElement>(null);
  const pdfDialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    const local = readNotebookDraft(id) ?? (initial ? { page: initial, needsCreate: true, dirty: true } : null);
    if (local) { latest.current = local; setDraft(local); setStatus(local.dirty ? "pending" : "saved"); }
    if (!local?.dirty) {
      void fetch(`/api/notebooks/${id}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) }).then(async (res) => {
        if (!res.ok) throw new Error("Die Seite konnte nicht geladen werden.");
        return res.json() as Promise<{ page: NotebookPage }>;
      }).then(({ page }) => {
        if (controller.signal.aborted || latest.current?.dirty) return;
        const next = { page, needsCreate: false, dirty: false, serverUpdatedAt: page.updatedAt };
        latest.current = next; setDraft(next); setStatus("saved");
        onPageChangeRef.current(page);
        try { writeNotebookDraft(next); } catch { setStorageError(true); }
      }).catch(() => { if (!controller.signal.aborted) { setError("Die Seite ist gerade nicht erreichbar."); setStatus("error"); } });
    }
    return () => { controller.abort(); alive.current = false; };
    // Ein bestehender lokaler Entwurf hat Vorrang vor einer Netzantwort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadAttempt]);

  async function persist(snapshot: NotebookDraft) {
    if (alive.current) { setStatus("saving"); setError(""); }
    try {
      const server = await saveNotebookDraft(snapshot);
      if (!alive.current) return;
      if (latest.current?.page === snapshot.page) {
        const saved = { ...snapshot, dirty: false, needsCreate: false, serverUpdatedAt: server.updatedAt };
        latest.current = saved; setDraft(saved); setStatus("saved");
      } else {
        if (latest.current) latest.current = { ...latest.current, needsCreate: false, serverUpdatedAt: server.updatedAt };
        setStatus("pending");
      }
    } catch (err) {
      if (alive.current) { setStatus("error"); setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen."); if (err instanceof NotebookConflictError) setConflict(err.page); }
    }
  }
  useEffect(() => {
    if (!draft?.dirty || conflict) return;
    timer.current = setTimeout(() => { void persist(draft); }, 700);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, conflict]);
  useEffect(() => {
    const flush = () => {
      const current = latest.current;
      if (current?.dirty) { if (timer.current) clearTimeout(timer.current); void persist(current); }
    };
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("online", flush); document.removeEventListener("visibilitychange", hidden); flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function change(fields: Partial<NotebookPage>, remember = true, textEditId?: string) {
    const current = latest.current;
    if (!current) return;
    const groupedText = textEditId && lastTextEdit.current?.id === textEditId && Date.now() - lastTextEdit.current.time < 1200;
    lastTextEdit.current = textEditId ? { id: textEditId, time: Date.now() } : null;
    if (fields.content && remember && !groupedText) {
      history.current.past.push(current.page.content);
      if (history.current.past.length > 50) history.current.past.shift();
      history.current.future = [];
    }
    const next = { ...current, page: { ...current.page, ...fields, updatedAt: new Date().toISOString() }, dirty: true };
    latest.current = next; setDraft(next); setStatus("pending"); setError("");
    try { writeNotebookDraft(next); setStorageError(false); } catch { setStorageError(true); }
    onPageChangeRef.current(next.page);
  }
  function undo(redo = false) {
    const current = latest.current;
    if (!current) return;
    lastTextEdit.current = null;
    const from = redo ? history.current.future : history.current.past;
    const to = redo ? history.current.past : history.current.future;
    const previous = from.pop();
    if (!previous) return;
    to.push(current.page.content); change({ content: previous }, false); forceHistory((n) => n + 1);
  }
  function addBlock(block: NotebookBlock) {
    const current = latest.current;
    if (!current) return;
    change({ content: { ...current.page.content, blocks: [...current.page.content.blocks, block] } });
    return block.id;
  }
  function addText(x: number, y: number) {
    const id = crypto.randomUUID();
    addBlock({ id, type: "text", x: Math.max(0, Math.min(x, 670)), y: Math.max(0, Math.min(y, 1240)), width: 330, height: 160, text: "" });
    setPlacement(null); setTool("select");
    return id;
  }
  async function uploadFile(file: File, pageNumber = 1, ratio?: number) {
    const current = latest.current;
    if (!current) return;
    setUploading(true); setUploadError("");
    try {
      const uploaded = await ladeDateiInFachHoch(current.page.subjectId, file);
      if (!alive.current) return;
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      setPendingAttachment({ fileId: uploaded.id, type: isPdf ? "pdf" : "image", pageNumber: isPdf ? pageNumber : undefined, ratio: ratio ?? 1.4 });
      setPlacement("attachment");
      closePdfImport();
    } catch (err) { if (alive.current) setUploadError(err instanceof Error ? err.message : "Die Datei konnte nicht eingefügt werden."); }
    finally { if (alive.current) setUploading(false); }
  }
  function placeAttachment(x: number, y: number) {
    if (!pendingAttachment) return null;
    const width = Math.min(700, Math.max(280, 520 * Math.min(1.5, pendingAttachment.ratio)));
    const height = Math.min(950, width / pendingAttachment.ratio);
    const id = crypto.randomUUID();
    addBlock({ id, type: pendingAttachment.type, fileId: pendingAttachment.fileId, pageNumber: pendingAttachment.pageNumber, x: Math.max(0, Math.min(1000 - width, x - width / 2)), y: Math.max(0, Math.min(1400 - height, y - height / 2)), width, height });
    setPendingAttachment(null); setPlacement(null); setTool("select");
    return id;
  }
  async function chooseFile(file: File) {
    setUploadError("");
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      setUploading(true);
      try {
        const { openNotebookPdf } = await import("@/lib/notebook-pdf");
        const pdf = await openNotebookPdf(await file.arrayBuffer());
        try {
          const first = await pdf.document.getPage(1);
          const viewport = first.getViewport({ scale: 1 });
          if (alive.current) setPdfImport({ file, pages: pdf.document.numPages, pageNumber: 1, ratio: viewport.width / viewport.height });
        } finally { await pdf.destroy(); }
      } catch { if (alive.current) setUploadError("Dieses PDF konnte nicht geöffnet werden. Prüfe, ob es mit einem Passwort geschützt oder beschädigt ist."); }
      finally { if (alive.current) setUploading(false); }
    } else if (file.type.startsWith("image/")) {
      let ratio = 1.4;
      try { const bitmap = await createImageBitmap(file); ratio = bitmap.width / bitmap.height; bitmap.close(); } catch { /* Vorschau übernimmt unterstützte Bildformate. */ }
      await uploadFile(file, 1, ratio);
    } else setUploadError("Füge ein Bild oder eine PDF-Datei ein.");
  }
  function closePdfImport() {
    if (pdfDialog.current?.open) pdfDialog.current.close();
    setPdfImport(null);
    requestAnimationFrame(() => insertButton.current?.focus({ preventScroll: true }));
  }
  useEffect(() => {
    if (pdfImport && pdfDialog.current && !pdfDialog.current.open) pdfDialog.current.showModal();
  }, [pdfImport]);

  if (!draft) return status === "error" ? <div className="rounded-xl border p-6"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => setLoadAttempt((n) => n + 1)}>Erneut versuchen</Button></div> : <Skeleton className="h-96 w-full rounded-xl" />;
  const page = draft.page;
  const tools: { id: NotebookTool; label: string; icon: typeof PenLine }[] = [{ id: "pen", label: "Stift", icon: PenLine }, { id: "marker", label: "Textmarker", icon: Highlighter }, { id: "eraser", label: "Radierer", icon: Eraser }, { id: "select", label: "Auswahl", icon: LassoSelect }];
  const statusText = status === "saving" ? "Speichert …" : status === "pending" ? "Lokal gesichert" : status === "error" ? draft.dirty ? "Nicht synchronisiert" : "Offline verfügbar" : "Gespeichert";
  return <section className="@container/editor relative flex min-h-0 flex-1 flex-col" aria-label="Heftseite bearbeiten" onKeyDown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault(); undo(e.shiftKey);
    }
  }}>
    <div className="flex shrink-0 items-center gap-3 px-4 py-2 sm:px-7">
      <input aria-label="Seitentitel" value={page.title} maxLength={160} onChange={(e) => change({ title: e.target.value })} onBlur={() => { if (!latest.current?.page.title.trim()) change({ title: "Unbenannte Seite" }); }}
        className="min-h-11 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-3 py-2 text-xl font-medium outline-none interaction hover:border-border hover:bg-interaction-hover focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring" />
      <span role="status" title={statusText} className={cn("flex min-h-8 w-5 shrink-0 items-center justify-end sm:w-24 gap-1.5 text-[11px]", status === "error" ? "text-destructive" : "text-muted-foreground")}>
        {status === "saving" ? <Loader2 className="size-3 animate-spin" /> : status === "saved" ? <Check className="size-3" /> : status === "error" ? <CircleAlert className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}<span className="sr-only sm:not-sr-only">{statusText}</span>
      </span>
    </div>
    {conflict && <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4" role="alert"><p className="text-sm">Diese Seite wurde auf einem anderen Gerät geändert. Dein Entwurf ist noch hier. Welche Version möchtest du behalten?</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => {
      const next = { page: conflict, dirty: false, needsCreate: false, serverUpdatedAt: conflict.updatedAt };
      latest.current = next; setDraft(next); setConflict(null); setError(""); setStatus("saved");
      history.current = { past: [], future: [] };
      try { writeNotebookDraft(next); } catch { setStorageError(true); }
      onPageChangeRef.current(next.page);
    }}>Serverstand laden</Button><Button onClick={() => {
      if (!latest.current) return;
      const next = { ...latest.current, dirty: true, serverUpdatedAt: conflict.updatedAt };
      latest.current = next; setDraft(next); setConflict(null); setError("");
      try { writeNotebookDraft(next); } catch { setStorageError(true); }
      void persist(next);
    }}>Meinen Entwurf übernehmen</Button></div></div>}
    {!conflict && (error || storageError) && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/20 px-3 py-2 text-sm" role="alert"><span>{error || "Lokale Sicherung nicht möglich. Lass die Seite bis zum Speichern geöffnet."}{error && !storageError ? " Dein Entwurf bleibt auf diesem Gerät." : ""}</span><Button variant="outline" onClick={() => { if (latest.current?.dirty) void persist(latest.current); else setLoadAttempt((n) => n + 1); }}>{draft.dirty ? "Erneut speichern" : "Erneut laden"}</Button></div>}
    <div className="z-30 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-y bg-background px-3 py-2 sm:px-7 @min-[360px]/editor:grid-cols-[1fr_auto] @min-[1000px]/editor:grid-cols-[auto_auto_1fr] @min-[1000px]/editor:gap-x-4" role="group" aria-label="Heftwerkzeuge">
      <div className="col-span-3 flex min-w-0 items-center justify-between gap-0 @min-[360px]/editor:col-span-1 @min-[360px]/editor:justify-start @min-[360px]/editor:gap-1" role="group" aria-label="Werkzeug wählen">
        {tools.map(({ id: toolId, label, icon: Icon }) => <button key={toolId} type="button" title={label} aria-label={label} aria-pressed={tool === toolId} onClick={() => setTool(toolId)}
          className={cn(toolButton, "h-12 min-w-[50px] flex-col gap-0.5 px-0.5 text-[10px] leading-none @min-[360px]/editor:min-w-[58px] @min-[360px]/editor:px-1 @min-[360px]/editor:text-[11px] @min-[560px]/editor:min-w-20 @min-[560px]/editor:flex-row @min-[560px]/editor:gap-2 @min-[560px]/editor:text-xs", tool === toolId ? "bg-accent text-foreground ring-1 ring-inset ring-border hover:bg-accent press:bg-accent" : "")}><Icon aria-hidden className="size-4 shrink-0" /><span>{label}</span></button>)}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Rückgängig" title="Rückgängig" disabled={!history.current.past.length} onClick={() => undo()} className={toolButton}><Undo2 aria-hidden className="size-4" /></button>
        <button type="button" aria-label="Wiederholen" title="Wiederholen" disabled={!history.current.future.length} onClick={() => undo(true)} className={toolButton}><Redo2 aria-hidden className="size-4" /></button>
      </div>
      <div className="col-span-2 flex min-w-0 items-center gap-2 @min-[1000px]/editor:col-span-1">
      <div className="flex min-h-11 shrink-0 items-center gap-1" aria-label="Werkzeugeinstellungen">
        <span className="hidden pl-2 pr-1 text-xs text-muted-foreground @min-[460px]/editor:block">{tool === "shape" ? "Form" : tools.find((entry) => entry.id === tool)?.label}</span>
        {(tool === "pen" || tool === "marker" || tool === "shape") && <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" aria-label="Stiftfarbe und Stärke" title="Stiftfarbe und Stärke" className={cn(control, "flex h-11 shrink-0 items-center justify-center gap-2 px-3")}><span className="flex size-6 items-center justify-center rounded-full border border-border" style={{ background: activeColor }}><span className="rounded-full bg-white" style={{ width: Math.min(12, activeWidth + 2), height: Math.min(12, activeWidth + 2) }} /></span><ChevronDown aria-hidden className="size-3.5 text-muted-foreground" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-52 overflow-y-auto rounded-lg p-1.5 motion-reduce:animate-none">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Stiftfarbe</DropdownMenuLabel>
            {(tool === "marker" ? [["#facc15", "Gelb"], ["#4ade80", "Mint"], ["#38bdf8", "Hellblau"], ["#f472b6", "Rosa"]] : [["#1e293b", "Schwarz"], ["#2563eb", "Blau"], ["#dc2626", "Rot"], ["#15803d", "Grün"]]).map(([value, label]) => <DropdownMenuItem key={value} className="min-h-11 rounded-md px-3 py-2.5" onSelect={() => setWorkspaceField(tool === "marker" ? "markerColor" : "color", value)}><span className="size-4 rounded-full" style={{ background: value }} />{label}{activeColor === value && <Check aria-label="Ausgewählt" className="ml-auto" />}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Stiftstärke</DropdownMenuLabel>
            {(tool === "marker" ? [[14, "Schmal"], [24, "Mittel"], [36, "Breit"]] : [[2, "Fein"], [3, "Mittel"], [6, "Breit"]]).map(([value, label]) => <DropdownMenuItem key={value} className="min-h-11 rounded-md px-3 py-2.5" onSelect={() => setWorkspaceField(tool === "marker" ? "markerWidth" : "width", Number(value))}><span className="flex w-4 items-center justify-center"><span className="rounded-full bg-current" style={{ width: Math.min(14, Number(value) + 2), height: Math.min(14, Number(value) + 2) }} /></span>{label}{activeWidth === value && <Check aria-label="Ausgewählt" className="ml-auto" />}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>}
        {tool === "eraser" && <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" aria-label="Radierer einstellen" className={cn(control, "min-h-11 px-2 text-xs")}>{markerOnly ? "Nur Marker" : "Ganze Striche"}<ChevronDown className="ml-1 inline size-3" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Radiergröße</DropdownMenuLabel>
            {([[8, "Klein"], [18, "Mittel"], [32, "Groß"]] as const).map(([value, label]) => <DropdownMenuItem key={value} className="min-h-11" onSelect={() => setWorkspaceField("eraserRadius", value)}>{label}{eraserRadius === value && <Check className="ml-auto size-4" />}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11" onSelect={() => setWorkspaceField("markerOnly", !markerOnly)}>Nur Textmarker radieren{markerOnly && <Check className="ml-auto size-4" />}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
      <input ref={fileInput} type="file" accept="image/*,.pdf,application/pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void chooseFile(file); e.target.value = ""; }} />
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button ref={insertButton} variant="ghost" disabled={uploading} className="min-h-11 shrink-0 gap-2 px-3 text-xs before:inset-0 data-[state=open]:bg-interaction-hover">{uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Einfügen</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-lg p-1.5 motion-reduce:animate-none" onCloseAutoFocus={(event) => { if (insertMenuAction.current) { event.preventDefault(); insertMenuAction.current = false; } }}>
          <DropdownMenuItem className="min-h-11 rounded-md px-3 py-2.5" onSelect={() => { insertMenuAction.current = true; setPlacement("text"); setPendingAttachment(null); setTool("select"); }}><Type className="size-4" />Text platzieren</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 rounded-md px-3 py-2.5" onSelect={() => { insertMenuAction.current = true; fileInput.current?.click(); }}><Paperclip className="size-4" />Bild oder PDF</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Form</DropdownMenuLabel>
          {([["line", "Linie"], ["rectangle", "Rechteck"], ["ellipse", "Ellipse"]] as const).map(([value, label]) => <DropdownMenuItem key={value} className="min-h-11 rounded-md px-3 py-2.5" onSelect={() => { setWorkspaceField("shape", value); setTool("shape"); setPlacement(null); }}><Shapes className="size-4" />{label}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" aria-label="Seiteneinstellungen" title="Seiteneinstellungen" className={toolButton}><Settings2 aria-hidden className="size-5" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-52 overflow-y-auto rounded-lg p-1.5 motion-reduce:animate-none">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Seite verschieben nach</DropdownMenuLabel>
          {[{ id: "", title: "Ohne Kapitel" }, ...chapters].map((chapter) => <DropdownMenuItem key={chapter.id} className="min-h-11 rounded-md px-3 py-2.5" onSelect={() => change({ chapterId: chapter.id || null })}>{chapter.title}{(page.chapterId ?? "") === chapter.id && <Check aria-label="Ausgewählt" className="ml-auto" />}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Papier</DropdownMenuLabel>
          {[["blank", "Blanko"], ["lined", "Liniert"], ["grid", "Kariert"]].map(([value, label]) => <DropdownMenuItem key={value} className="min-h-11 rounded-md px-3 py-2.5" onSelect={() => change({ paper: value as NotebookPaper })}>{label}{page.paper === value && <Check aria-label="Ausgewählt" className="ml-auto" />}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </div>
    {pdfImport && <dialog ref={pdfDialog} aria-labelledby="pdf-import-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl bg-transparent p-0 text-foreground backdrop:bg-background/70 backdrop:backdrop-blur-sm" onCancel={(event) => { event.preventDefault(); event.stopPropagation(); closePdfImport(); }} onClick={(event) => { if (event.target === event.currentTarget) closePdfImport(); }}>
      <div className="space-y-4 rounded-xl border bg-popover p-5 shadow-popover">
        <div><h2 id="pdf-import-title" className="font-medium">PDF-Seite einfügen</h2><p className="mt-1 truncate text-sm text-muted-foreground">{pdfImport.file.name}</p></div>
        <Select autoFocus aria-label="PDF-Seite auswählen" value={pdfImport.pageNumber} onValueChange={(v) => setPdfImport({ ...pdfImport, pageNumber: Number(v) })}>{Array.from({ length: pdfImport.pages }, (_, i) => <option key={i} value={i + 1}>Seite {i + 1}</option>)}</Select>
        <div className="flex justify-end gap-2"><Button variant="ghost" disabled={uploading} onClick={closePdfImport}>Abbrechen</Button><Button disabled={uploading} onClick={() => void uploadFile(pdfImport.file, pdfImport.pageNumber, pdfImport.ratio)}>{uploading ? "Lädt …" : "Weiter"}</Button></div>
      </div>
    </dialog>}
    {uploadError && <p role="alert" className="shrink-0 px-4 py-2 text-sm text-destructive sm:px-7">{uploadError}</p>}
    <NotebookCanvas content={page.content} paper={page.paper} tool={tool} color={activeColor} width={activeWidth} shape={shape} eraserRadius={eraserRadius} markerOnly={markerOnly} placement={placement} onPlace={(x, y) => placement === "text" ? addText(x, y) : placeAttachment(x, y)} onCancelPlacement={() => { setPlacement(null); setPendingAttachment(null); }} zoom={zoom} onZoomChange={setZoom} onChange={(content, textEditId) => change({ content }, true, textEditId)} />
    <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-t px-3 sm:px-7">
      <span className="min-w-0 truncate text-xs text-muted-foreground" role={placement ? "status" : undefined}>{placement === "text" ? "Tippe auf das Blatt, um Text zu platzieren · Esc bricht ab" : placement === "attachment" ? "Tippe auf das Blatt, um die Datei zu platzieren · Esc bricht ab" : tool === "pen" ? "Stift · Schreiben und zeichnen" : tool === "marker" ? "Textmarker · Transparent markieren" : tool === "shape" ? "Form · Zum Zeichnen ziehen" : tool === "select" ? "Auswahl · Antippen oder einkreisen" : markerOnly ? "Radierer · Nur Textmarker" : "Radierer · Ganze Striche"}</span>
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Blattgröße">
        <button type="button" className={toolButton} aria-label="Blatt verkleinern" title="Verkleinern" disabled={zoom <= 50} onClick={() => setZoom((value) => Math.max(50, value - 25))}><Minus className="size-4" /></button>
        <button type="button" className={cn(control, "min-h-11 min-w-14 px-2 font-mono text-xs tabular-nums")} aria-label="Blatt auf Breite einpassen" title="Auf Breite einpassen" onClick={() => setZoom(100)}>{Math.round(zoom)} %</button>
        <button type="button" className={toolButton} aria-label="Blatt vergrößern" title="Vergrößern" disabled={zoom >= 250} onClick={() => setZoom((value) => Math.min(250, value + 25))}><Plus className="size-4" /></button>
      </div>
    </div>
  </section>;
}
