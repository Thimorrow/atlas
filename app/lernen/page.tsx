import Link from "next/link";
import { Languages, ArrowUpRight } from "lucide-react";
import { LernenUebersicht } from "@/components/lernen-uebersicht";

export default function LernenPage() {
  return (
    <>
      <Link
        href="/lernen/vokabeln"
        className="mx-auto mb-6 flex max-w-2xl items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent"
      >
        <Languages className="size-5" />
        <span className="flex-1">
          <span className="block text-sm font-medium">Vokabeln lernen</span>
          <span className="text-xs text-muted-foreground">
            Latein & Englisch · Deine Fotos, sechs Boxen
          </span>
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground" />
      </Link>
      <LernenUebersicht />
    </>
  );
}
