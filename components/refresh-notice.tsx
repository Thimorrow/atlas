"use client";

export function RefreshNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border bg-card px-4 py-2 text-sm">
      <p>Aktualisierung fehlgeschlagen. Angezeigte Daten können veraltet sein.</p>
      <button type="button" onClick={onRetry} className="min-h-11 shrink-0 rounded-md px-2 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Erneut versuchen
      </button>
    </div>
  );
}
