import Link from "next/link";
import { History } from "lucide-react";
import { BotChat } from "@/components/bot-chat";

// Vollwertige Gespraechsseite. Dasselbe Bauteil wie im Cmd+K-Overlay --
// hier nur ohne Overlay-Rahmen, dafuer ueber die volle Hoehe der Inhaltsspalte.
export default function BotPage() {
  return (
    <main className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b px-4 py-3 sm:px-6">
        <h1 className="flex-1 text-[17px] font-semibold tracking-tight">Atlas-Bot</h1>
        <Link
          href="/bot/verlauf"
          className="relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <History className="size-4" />
          Verlauf
        </Link>
      </header>
      <div className="min-h-0 flex-1">
        <BotChat className="mx-auto h-full max-w-2xl" />
      </div>
    </main>
  );
}
