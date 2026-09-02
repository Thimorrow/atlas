import { BotChat } from "@/components/bot-chat";

// Vollwertige Gespraechsseite. Dasselbe Bauteil wie im Cmd+K-Overlay --
// hier nur ohne Overlay-Rahmen, dafuer ueber die volle Hoehe der Inhaltsspalte.
export default function BotPage() {
  return (
    <main className="flex h-full flex-col overflow-hidden">
      <header className="border-b px-4 py-3 sm:px-6">
        <h1 className="text-[17px] font-semibold tracking-tight">Atlas-Bot</h1>
      </header>
      <div className="min-h-0 flex-1">
        <BotChat className="mx-auto h-full max-w-2xl" />
      </div>
    </main>
  );
}
