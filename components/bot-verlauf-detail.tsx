"use client";

// Ein einzelnes Gespraech aus dem Bot-Verlauf, statisch nachlesbar: Fragen,
// Antworten und die Karten der angelegten/geaenderten Aufgaben und Notizen an
// der Stelle, an der sie entstanden sind. Laedt GET /api/bot/verlauf/[id]
// (ergaenzt stillExists an Schreib-Werkzeugen additiv gegenueber
// GET /api/bot/verlauf).

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, MessageCircleQuestion } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Stagger, StaggerItem } from "@/components/stagger";
import { HistoryTurnView } from "@/components/bot-history-turn";
import { displayTitle, formatConversationWhen, groupMessagesIntoTurns } from "@/lib/bot/verlauf";
import type { ConversationDTO, MessageDTO } from "@/lib/bot/store";

type DetailMessage = MessageDTO & { stillExists?: boolean };
type Status = "loading" | "ok" | "notfound" | "error";

export function BotVerlaufDetail({ id }: { id: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [conversation, setConversation] = useState<ConversationDTO | null>(null);
  const [messages, setMessages] = useState<DetailMessage[]>([]);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    fetch(`/api/bot/verlauf/${id}`)
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 404) {
          setStatus("notfound");
          return;
        }
        if (!r.ok) {
          setStatus("error");
          return;
        }
        const data = (await r.json()) as { conversation: ConversationDTO; messages: DetailMessage[] };
        setConversation(data.conversation);
        setMessages(data.messages);
        setStatus("ok");
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const turns = groupMessagesIntoTurns(messages);
  const existsById = new Map(messages.map((m) => [m.id, m.stillExists]));

  return (
    <main className="h-full overflow-y-auto px-4 pt-6 pb-8 sm:px-6">
      <Stagger className="mx-auto max-w-2xl space-y-5">
        <StaggerItem>
          <Link
            href="/bot/verlauf"
            className="relative mb-3 inline-flex items-center gap-1 rounded text-sm text-muted-foreground transition-colors [touch-action:manipulation] before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ChevronLeft className="size-4" />
            Zurueck zum Verlauf
          </Link>
          {status === "ok" && conversation && (
            <div>
              <h1 className="text-lg font-semibold leading-snug tracking-tight text-balance">
                {displayTitle(conversation.title)}
              </h1>
              <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">
                {formatConversationWhen(conversation.updatedAt)}
              </p>
            </div>
          )}
        </StaggerItem>

        <StaggerItem>
          {status === "loading" && <DetailSkeleton />}
          {status === "notfound" && <NotFoundState />}
          {status === "error" && <ErrorState />}
          {status === "ok" && (
            <div className="space-y-5">
              {turns.map((t) => (
                <HistoryTurnView key={t.id} turn={t} stillExists={(messageId) => existsById.get(messageId)} />
              ))}
            </div>
          )}
        </StaggerItem>
      </Stagger>
    </main>
  );
}

function NotFoundState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
      <MessageCircleQuestion className="size-6 text-muted-foreground/60" />
      <p className="text-[14px] text-muted-foreground">Dieses Gespraech gibt es nicht (mehr).</p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
      <AlertTriangle className="size-6 text-muted-foreground/60" />
      <p className="text-[14px] text-muted-foreground">Das Gespraech konnte nicht geladen werden.</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-label="Gespraech wird geladen" aria-busy="true">
      {[1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <div className="flex justify-end">
            <Skeleton className="h-9 w-2/3 rounded-2xl" />
          </div>
          <Skeleton className="h-16 w-4/5 rounded-xl" />
        </div>
      ))}
    </div>
  );
}
