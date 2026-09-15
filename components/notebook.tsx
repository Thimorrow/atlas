"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, Eraser, FilePlus2, Hand, Loader2, Paperclip, PenLine, Plus, Redo2, Settings2, Trash2, Type, Undo2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { NotebookCanvas, type NotebookTool } from "@/components/notebook-canvas";
import { useCachedJSON } from "@/lib/use-cached-json";
import { CACHE_TTLS } from "@/lib/fetch-cache";
import { cn } from "@/lib/utils";
import { ladeDateiInFachHoch } from "@/lib/datei-upload";
import { NotebookConflictError, readNotebookDraft, saveNotebookDraft, subjectNotebookDrafts, writeNotebookDraft, type NotebookDraft } from "@/lib/notebook-drafts";
import type { NotebookBlock, NotebookContent, NotebookPage, NotebookPageSummary, NotebookPaper } from "@/lib/notebook-types";

type Subject = { id: string; name: string };
const toolButton = "flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:text-muted-foreground/40 [touch-action:manipulation]";

export function Notebook() {
  const { data, loading, error, reload } = useCachedJSON<{ subjects: Subject[] }>("/api/subjects", CACHE_TTLS.subjects);
  const [chosenSubject, setChosenSubject] = useState("");
  const subjects = data?.subjects ?? [];
  const subjectId = chosenSubject || subjects[0]?.id || "";
  return <div className="mx-auto max-w-6xl space-y-2">
    <header className="flex min-h-12 items-center gap-3 px-1">
      <BookOpen aria-hidden className="size-5 shrink-0 text-muted-foreground" /><h1 className="text-base font-semibold tracking-tight">Hefte</h1>
      <span aria-hidden className="h-5 w-px bg-border" />
      {subjects.length > 0 && <Select aria-label="Fach auswählen" value={subjectId} onValueChange={setChosenSubject} className="min-h-11 min-w-0 max-w-[min(22rem,70%)] border-transparent bg-transparent font-medium shadow-none">
        {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
      </Select>}
    </header>
    {loading ? <Skeleton className="h-72 w-full rounded-xl" /> : error && !data ? <div className="rounded-xl border p-6"><p>Deine Fächer konnten nicht geladen werden.</p><Button onClick={reload} variant="outline" className="mt-3">Erneut versuchen</Button></div>
      : !subjectId ? <div className="rounded-xl border border-dashed p-8 text-center"><BookOpen className="mx-auto mb-3 size-8 text-muted-foreground" /><h2 className="font-medium">Ein Heft für jedes Fach</h2><p className="mt-2 text-sm text-muted-foreground">Lege zuerst ein Fach an. Danach kannst du hier loslegen.</p><Link href="/faecher" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground">Zu meinen Fächern</Link></div>
      : <SubjectNotebook key={subjectId} subjectId={subjectId} />}
  </div>;
}

function SubjectNotebook({ subjectId }: { subjectId: string }) {
  const { data, loading, error, reload } = useCachedJSON<{ pages: NotebookPageSummary[] }>(`/api/notebooks?subjectId=${subjectId}`, 60_000);
  const [localPages, setLocalPages] = useState<NotebookPage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => { setLocalPages(subjectNotebookDrafts(subjectId).map((draft) => draft.page)); }, [subjectId]);
  const merged = new Map<string, NotebookPageSummary>((data?.pages ?? []).map((page) => [page.id, page]));
  for (const page of localPages) {
    const remote = merged.get(page.id);
    if (!remote || page.updatedAt >= remote.updatedAt) merged.set(page.id, page);
  }
  const pages = [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const currentId = selected ?? pages[0]?.id ?? null;

  function updatePage(page: NotebookPage) {
    setLocalPages((old) => [...old.filter((entry) => entry.id !== page.id), page]);
  }
  function createPage() {
    const now = new Date().toISOString();
    const page: NotebookPage = { id: crypto.randomUUID(), subjectId, title: `Seite ${pages.length + 1}`, paper: "lined", content: { strokes: [], blocks: [] }, createdAt: now, updatedAt: now };
    try { writeNotebookDraft({ page, needsCreate: true, dirty: true }); } catch { setStorageError(true); }
    updatePage(page); setSelected(page.id);
  }
  return <div className="space-y-2">
    <div className="flex items-center gap-2 border-b px-1 pb-2">
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Heftseiten">
        {pages.map((page, index) => <button key={page.id} onClick={() => setSelected(page.id)} aria-pressed={currentId === page.id}
          className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [touch-action:manipulation]", currentId === page.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60")}>
          <span className="flex size-5 items-center justify-center rounded border border-current/20 text-[11px] tabular-nums text-muted-foreground">{index + 1}</span><span className="max-w-36 truncate">{page.title}</span>
        </button>)}
      </div>
      <Button variant="ghost" onClick={createPage} className="min-h-11 shrink-0 gap-2"><Plus className="size-4" /><span className="hidden sm:inline">Neue Seite</span><span className="sm:hidden">Seite</span></Button>
    </div>
    {storageError && <p role="alert" className="text-sm text-destructive">Auf diesem Gerät konnte kein Entwurf gesichert werden. Lass die Seite bis zum Speichern geöffnet.</p>}
    {error && <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" role="status">Die Seitenliste ist gerade nicht erreichbar. Lokale Seiten bleiben verfügbar.<Button variant="ghost" onClick={reload}>Erneut versuchen</Button></div>}
    {currentId ? <NotebookEditor key={currentId} id={currentId} initial={localPages.find((p) => p.id === currentId)} onPageChange={updatePage} />
      : loading ? <Skeleton className="h-96 w-full rounded-xl" />
      : <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center"><FilePlus2 className="mb-4 size-8 text-muted-foreground" /><h2 className="text-lg font-medium">Die erste Seite gehört dir</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">Schreibe mit dem Stift, tippe Text oder füge ein Arbeitsblatt ein.</p><Button onClick={createPage} className="mt-5 gap-2"><Plus className="size-4" />Erste Seite anlegen</Button></div>}
  </div>;
}

type SaveState = "loading" | "pending" | "saving" | "saved" | "error";

function NotebookEditor({ id, initial, onPageChange }: { id: string; initial?: NotebookPage; onPageChange: (page: NotebookPage) => void }) {
  const [draft, setDraft] = useState<NotebookDraft | null>(null);
  const [status, setStatus] = useState<SaveState>("loading");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [conflict, setConflict] = useState<NotebookPage | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [tool, setTool] = useState<NotebookTool>("pen");
  const [color, setColor] = useState("#1e293b");
  const [width, setWidth] = useState(3);
  const [zoom, setZoom] = useState(100);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [pdfImport, setPdfImport] = useState<{ file: File; pages: number; pageNumber: number; ratio: number } | null>(null);
  const [, forceHistory] = useState(0);
  const history = useRef<{ past: NotebookContent[]; future: NotebookContent[] }>({ past: [], future: [] });
  const latest = useRef<NotebookDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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

  function change(fields: Partial<NotebookPage>, remember = true) {
    const current = latest.current;
    if (!current) return;
    if (fields.content && remember) {
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
    setSelectedBlock(block.id); setTool("text");
  }
  function addText(x = 100, y = 120) {
    addBlock({ id: crypto.randomUUID(), type: "text", x: Math.min(x, 650), y: Math.max(70, Math.min(y, 1200)), width: 330, height: 160, text: "" });
  }
  async function uploadFile(file: File, pageNumber = 1, ratio?: number) {
    const current = latest.current;
    if (!current) return;
    setUploading(true); setUploadError("");
    try {
      const uploaded = await ladeDateiInFachHoch(current.page.subjectId, file);
      if (!alive.current) return;
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      addBlock({ id: crypto.randomUUID(), type: isPdf ? "pdf" : "image", fileId: uploaded.id, pageNumber: isPdf ? pageNumber : undefined, x: 70, y: 80, width: 860, height: Math.min(1200, 860 / (ratio ?? 1.4)) });
      setPdfImport(null);
    } catch (err) { if (alive.current) setUploadError(err instanceof Error ? err.message : "Die Datei konnte nicht eingefügt werden."); }
    finally { if (alive.current) setUploading(false); }
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

  if (!draft) return status === "error" ? <div className="rounded-xl border p-6"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => setLoadAttempt((n) => n + 1)}>Erneut versuchen</Button></div> : <Skeleton className="h-96 w-full rounded-xl" />;
  const page = draft.page;
  const tools: { id: NotebookTool; label: string; icon: typeof PenLine }[] = [{ id: "pen", label: "Stift", icon: PenLine }, { id: "eraser", label: "Radierer", icon: Eraser }, { id: "text", label: "Text & Elemente", icon: Type }, { id: "move", label: "Blatt verschieben", icon: Hand }];
  const statusText = status === "saving" ? "Speichert …" : status === "pending" ? "Lokal gesichert" : status === "error" ? draft.dirty ? "Nicht synchronisiert" : "Offline verfügbar" : "Gespeichert";
  return <section className="space-y-2" aria-label="Heftseite bearbeiten" onKeyDown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault(); undo(e.shiftKey);
    }
  }}>
    <div className="flex min-h-11 items-center gap-3 px-1">
      <input aria-label="Seitentitel" value={page.title} maxLength={160} onChange={(e) => change({ title: e.target.value })} onBlur={() => { if (!latest.current?.page.title.trim()) change({ title: "Unbenannte Seite" }); }}
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-base font-medium outline-none hover:border-border focus-visible:border-ring" />
      <span role="status" className={cn("flex shrink-0 items-center gap-1.5 text-[11px]", status === "error" ? "text-destructive" : "text-muted-foreground")}>
        {status === "saving" ? <Loader2 className="size-3 animate-spin" /> : status === "saved" ? <Check className="size-3" /> : null}{statusText}
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
    <div className="sticky top-0 z-30 flex items-center gap-1 overflow-x-auto rounded-xl border bg-card p-1 shadow-sm" role="group" aria-label="Heftwerkzeuge">
      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Werkzeug wählen">
        {tools.map(({ id: toolId, label, icon: Icon }) => <button key={toolId} type="button" title={label} aria-label={label} aria-pressed={tool === toolId} onClick={() => setTool(toolId)}
          className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [touch-action:manipulation]", tool === toolId ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}><Icon aria-hidden className="size-5" /></button>)}
      </div>
      <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
      <div className="flex h-11 w-[88px] shrink-0 items-center" aria-label="Werkzeugeinstellungen">
        {tool === "pen" && <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" aria-label="Stiftfarbe und Stärke" title="Stiftfarbe und Stärke" className="flex h-11 w-full items-center justify-center gap-2 rounded-lg outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [touch-action:manipulation]"><span className="flex size-6 items-center justify-center rounded-full border border-border" style={{ background: color }}><span className="rounded-full bg-white" style={{ width: width + 2, height: width + 2 }} /></span><ChevronDown aria-hidden className="size-3.5 text-muted-foreground" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-52 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Stiftfarbe</DropdownMenuLabel>
            {[["#1e293b", "Schwarz"], ["#2563eb", "Blau"], ["#dc2626", "Rot"], ["#15803d", "Grün"]].map(([value, label]) => <DropdownMenuItem key={value} className="min-h-11" onSelect={() => setColor(value)}><span className="size-4 rounded-full" style={{ background: value }} />{label}{color === value && <Check aria-label="Ausgewählt" className="ml-auto" />}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Stiftstärke</DropdownMenuLabel>
            {[[2, "Fein"], [3, "Mittel"], [6, "Breit"]].map(([value, label]) => <DropdownMenuItem key={value} className="min-h-11" onSelect={() => setWidth(Number(value))}><span className="flex w-4 items-center justify-center"><span className="rounded-full bg-current" style={{ width: Number(value) + 2, height: Number(value) + 2 }} /></span>{label}{width === value && <Check aria-label="Ausgewählt" className="ml-auto" />}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>}
        {tool === "text" && <><button type="button" title="Textfeld hinzufügen" aria-label="Textfeld hinzufügen" onClick={() => addText()} className={toolButton}><Plus aria-hidden className="size-5" /></button><button type="button" title="Ausgewähltes Element löschen" aria-label="Ausgewähltes Element löschen" disabled={!selectedBlock} onClick={() => { change({ content: { ...page.content, blocks: page.content.blocks.filter((b) => b.id !== selectedBlock) } }); setSelectedBlock(null); }} className={cn(toolButton, "text-destructive")}><Trash2 aria-hidden className="size-4" /></button></>}
        {tool === "eraser" && <span className="px-2 text-xs text-muted-foreground">Strich löschen</span>}
        {tool === "move" && <span className="px-2 text-xs text-muted-foreground">Blatt bewegen</span>}
      </div>
      <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
      <input ref={fileInput} type="file" accept="image/*,.pdf,application/pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void chooseFile(file); e.target.value = ""; }} />
      <Button variant="ghost" disabled={uploading} onClick={() => fileInput.current?.click()} className="h-11 min-h-11 shrink-0 gap-2 px-3" title="Bild oder PDF einfügen" aria-label="Bild oder PDF einfügen">{uploading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Paperclip aria-hidden className="size-4" />}<span className="hidden sm:inline">Einfügen</span></Button>
      <div className="min-w-1 flex-1" />
      <button type="button" aria-label="Rückgängig" title="Rückgängig" disabled={!history.current.past.length} onClick={() => undo()} className={toolButton}><Undo2 aria-hidden className="size-4" /></button>
      <button type="button" aria-label="Wiederholen" title="Wiederholen" disabled={!history.current.future.length} onClick={() => undo(true)} className={toolButton}><Redo2 aria-hidden className="size-4" /></button>
      <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" aria-label="Papier und Ansicht" title="Papier und Ansicht" className={toolButton}><Settings2 aria-hidden className="size-5" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-52 overflow-y-auto">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Papier</DropdownMenuLabel>
          {[["blank", "Blanko"], ["lined", "Liniert"], ["grid", "Kariert"]].map(([value, label]) => <DropdownMenuItem key={value} className="min-h-11" onSelect={() => change({ paper: value as NotebookPaper })}>{label}{page.paper === value && <Check aria-label="Ausgewählt" className="ml-auto" />}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Ansicht</DropdownMenuLabel>
          {[[100, "Einpassen"], [150, "150 %"], [200, "200 %"]].map(([value, label]) => <DropdownMenuItem key={value} className="min-h-11" onSelect={() => setZoom(Number(value))}>{label}{zoom === value && <Check aria-label="Ausgewählt" className="ml-auto" />}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    {pdfImport && <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3"><span className="min-w-0 flex-1 truncate text-sm">{pdfImport.file.name}</span><Select aria-label="PDF-Seite auswählen" value={pdfImport.pageNumber} onValueChange={(v) => setPdfImport({ ...pdfImport, pageNumber: Number(v) })}>{Array.from({ length: pdfImport.pages }, (_, i) => <option key={i} value={i + 1}>Seite {i + 1}</option>)}</Select><Button disabled={uploading} onClick={() => void uploadFile(pdfImport.file, pdfImport.pageNumber, pdfImport.ratio)}>Seite einfügen</Button><Button variant="ghost" disabled={uploading} onClick={() => setPdfImport(null)}>Abbrechen</Button></div>}
    {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
    <NotebookCanvas content={page.content} paper={page.paper} tool={tool} color={color} width={width} zoom={zoom} selectedBlock={selectedBlock} onSelect={setSelectedBlock} onAddText={addText} onChange={(content) => change({ content })} />
    <p className="px-1 pb-2 text-center text-[11px] text-muted-foreground">{tool === "pen" ? "Mit dem Stift schreiben · Mit einem Finger verschieben" : tool === "eraser" ? "Tippe einen Strich an, um ihn zu entfernen" : tool === "text" ? "Auf das Blatt tippen, um Text einzufügen · Elemente zum Bearbeiten auswählen" : "Das Blatt ziehen, um den Ausschnitt zu verschieben"}</p>
  </section>;
}
