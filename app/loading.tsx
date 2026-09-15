import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="h-full px-6 py-6 lg:px-8" role="status" aria-label="Seite wird geöffnet" aria-busy="true">
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-7 w-36" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    </main>
  );
}
