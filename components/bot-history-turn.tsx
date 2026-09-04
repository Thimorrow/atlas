"use client";

// Ein Zug im Bot-Verlauf: Nutzerfrage, die dabei ausgefuehrten Werkzeuge
// (leise Zeile fuer lesende, Karte aus components/bot-action-card.tsx fuer
// schreibende) und die Antwort -- genau an der Stelle, an der sie entstanden
// sind. Statisch, ohne Streaming-Zustaende und ohne Rueckgaengig -- das ist
// eine Leseansicht.

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { renderMarkdown, repairMissingParagraphBreaks } from "@/lib/markdown";
import { ActionCard, type AssignmentActionResult, type NoteActionResult } from "@/components/bot-action-card";
import type { HistoryTurn } from "@/lib/bot/verlauf";
import { cn } from "@/lib/utils";

export function HistoryTurnView({
  turn,
  stillExists,
}: {
  turn: HistoryTurn;
  // undefined heisst "keine Karte, keine Pruefung noetig" (z. B. Notenvorschlag).
  stillExists: (messageId: string) => boolean | undefined;
}) {
  const html = useMemo(
    () => renderMarkdown(repairMissingParagraphBreaks(turn.assistantText)),
    [turn.assistantText],
  );

  return (
    <div className="flex flex-col gap-2.5">
      {turn.userText !== null && (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-[14px] leading-snug text-primary-foreground">
            {turn.userText}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {turn.items.map((item) =>
          item.kind === "write" ? (
            <ActionCard
              key={item.id}
              tool={item.tool}
              result={item.result as AssignmentActionResult | NoteActionResult}
              dimmed={stillExists(item.id) === false}
              dimmedLabel="Nicht mehr vorhanden."
            />
          ) : (
            <ReadLine key={item.id} label={item.label} tool={item.tool} args={item.args} result={item.result} />
          ),
        )}

        {turn.assistantText && (
          <div
            className={cn(
              "max-w-[92%] text-[15px] leading-relaxed text-foreground",
              "[&>*+*]:mt-2.5",
              "[&_strong]:font-semibold [&_em]:italic",
              "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-0.5",
              "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]",
              "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
            )}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}

// Ruhige, aufklappbare Zeile fuer ein lesendes Werkzeug -- der Klartext
// ("hat die Mathe-Notizen gelesen") steht immer da, die rohen Argumente und
// das Ergebnis nur, wer wirklich nachsehen will.
function ReadLine({ label, tool, args, result }: { label: string; tool: string; args: unknown; result: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-[92%]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="relative flex items-center gap-1.5 rounded px-1 py-0.5 text-[12.5px] text-muted-foreground transition-colors before:absolute before:-inset-1 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
        {label}
      </button>
      {open && (
        <pre className="mt-1 max-h-56 overflow-auto rounded-lg border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {truncateDump(JSON.stringify({ werkzeug: tool, argumente: args, ergebnis: result }, null, 2))}
        </pre>
      )}
    </div>
  );
}

// datei_lesen kann ein ganzes Bild als data:-URL oder viel extrahierten
// PDF-Text zurueckgeben -- ohne Deckel wuerde die aufklappbare Zeile dann ein
// paar Megabyte JSON ins DOM haengen. Fuer die "wer will kann nachsehen"-
// Ansicht reicht ein deutlich sichtbarer Ausschnitt.
const MAX_DUMP_CHARS = 4000;

function truncateDump(json: string): string {
  if (json.length <= MAX_DUMP_CHARS) return json;
  return `${json.slice(0, MAX_DUMP_CHARS)}\n… (gekuerzt, ${json.length} Zeichen insgesamt)`;
}
