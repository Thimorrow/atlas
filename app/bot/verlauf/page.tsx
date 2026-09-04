"use client";

// Liste vergangener Bot-Gespraeche -- die Kontrollmoeglichkeit fuer einen
// Assistenten, der selbst Aufgaben und Notizen anlegt. Wiederverwendet
// GET /api/bot/verlauf (schon vorhanden), filtert dort serverseitig bereits
// leere Karteileichen heraus (jeder Aufruf von GET /api/bot legt eines an).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageCircle, Pencil } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { Skeleton } from "@/components/ui/skeleton";
import { conversationHasWrites, displayTitle, formatConversationWhen } from "@/lib/bot/verlauf";
import type { ConversationDTO, MessageDTO } from "@/lib/bot/store";
import { cn } from "@/lib/utils";

type ConversationWithMessages = ConversationDTO & { messages: MessageDTO[] };

export default function BotVerlaufPage() {
  const [conversations, setConversations] = useState<ConversationWithMessages[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/bot/verlauf")
      .then((r) => r.json())
      .then((d: { conversations?: ConversationWithMessages[] }) => {
        if (!alive) return;
        setConversations(d.conversations ?? []);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const loading = conversations === null && !loadError;

  return (
    <main className="h-full overflow-y-auto px-6 pt-6 pb-8 lg:px-8">
      <Stagger className="mx-auto max-w-2xl space-y-6">
        <StaggerItem>
          {/* Back-Link nur auf Mobile -- dort fehlt die Sidebar, gleiches
              Muster wie app/pruefungen/page.tsx. */}
          <Link
            href="/bot"
            className="relative mb-4 inline-flex items-center gap-1 rounded text-sm text-muted-foreground transition-colors [touch-action:manipulation] before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
          >
            <ChevronLeft className="size-4" />
            Zurueck zum Bot
          </Link>
          <div>
            <h1 className="text-xl font-semibold leading-tight tracking-tight">Verlauf</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {loading
                ? "Wird geladen …"
                : loadError
                  ? "Konnte nicht geladen werden."
                  : conversations!.length === 0
                    ? "Noch kein Gespraech."
                    : `${conversations!.length} Gespraech${conversations!.length === 1 ? "" : "e"}.`}
            </p>
          </div>
        </StaggerItem>

        <StaggerItem>
          {loading ? (
            <ListSkeleton />
          ) : loadError ? (
            <ErrorState />
          ) : conversations!.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="flex flex-col gap-1">
              {conversations!.map((c) => (
                <ConversationRow key={c.id} conversation={c} />
              ))}
            </ul>
          )}
        </StaggerItem>
      </Stagger>
    </main>
  );
}

function ConversationRow({ conversation }: { conversation: ConversationWithMessages }) {
  const wrote = conversationHasWrites(conversation.messages);
  return (
    <li>
      <Link
        href={`/bot/verlauf/${conversation.id}`}
        className="group flex items-center gap-3 rounded-lg px-2.5 py-3 transition-colors [touch-action:manipulation] hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            wrote ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {wrote ? <Pencil className="size-3.5" /> : <MessageCircle className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium leading-snug">{displayTitle(conversation.title)}</p>
          <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span className="tabular-nums">{formatConversationWhen(conversation.updatedAt)}</span>
            {wrote && (
              <span className="inline-flex items-center gap-1 font-medium text-foreground/70">
                · hat etwas angelegt
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
      <MessageCircle className="size-6 text-muted-foreground/60" />
      <div>
        <p className="text-[15px] font-medium">Noch kein Gespraech.</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Frag den Atlas-Bot etwas, dann erscheint es hier.</p>
      </div>
      <Link
        href="/bot"
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Zum Bot
      </Link>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-12 text-center">
      <p className="text-[14px] text-muted-foreground">Der Verlauf konnte nicht geladen werden.</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-1" aria-label="Verlauf wird geladen" aria-busy="true">
      {[1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 px-2.5 py-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <span className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5" style={{ width: `${64 - i * 8}%` }} />
            <Skeleton className="h-3 w-32 opacity-70" />
          </span>
        </li>
      ))}
    </ul>
  );
}
