"use client";

// Kleiner Knopf fuer "Neuer Chat" -- feuert nur das Ereignis, das BotChat
// abhoert (siehe components/bot-chat.tsx). Als eigenes Bauteil, damit er
// sowohl auf der /bot-Seite (Server-Komponente) als auch im schwebenden
// Panel (Client) steckt, ohne Logik zu duplizieren.
import { SquarePen } from "lucide-react";
import { requestBotNewChat } from "@/lib/bot/chat-session";
import { cn } from "@/lib/utils";

export function BotNewChatButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={requestBotNewChat}
      aria-label="Neuen Chat starten"
      title="Neuen Chat starten"
      className={cn(
        "relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <SquarePen className="size-4" />
      <span className="hidden sm:inline">Neuer Chat</span>
    </button>
  );
}
