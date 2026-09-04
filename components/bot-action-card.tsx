"use client";

// Karte fuer eine vom Bot angelegte oder geaenderte Aufgabe/Notiz -- wird im
// laufenden Chat (components/bot-chat.tsx, mit Rueckgaengig) und im Verlauf
// (components/bot-verlauf-view.tsx, ohne Rueckgaengig, dafuer ggf. "nicht mehr
// vorhanden") gleichermassen verwendet. dimmed/dimmedLabel/footer decken die
// Unterschiede ab, ohne das Aussehen der Karte selbst zu veraendern.

import type { ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { GraduationCap, ListChecks, NotebookPen } from "lucide-react";
import { markdownPreview } from "@/lib/markdown";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import { TYPE_LABEL, type AssignmentDTO } from "@/lib/assignments-view";
import { cn } from "@/lib/utils";

// Typ-only-Import wie in bot-chat.tsx: der Typ selbst wird beim Build
// wegkompiliert, lib/subject-store zieht die DB aber nicht in den
// Client-Bundle, solange nur der Typ verwendet wird.
import type { NoteDTO } from "@/lib/subject-store";

export type AssignmentActionResult = { aufgabe: AssignmentDTO; hinweisFaellig?: string };
export type NoteActionResult = { notiz: NoteDTO };

// Ergebnisse von lernkarten_erzeugen und lernkarte_anlegen (lib/bot/tools.ts)
// -- dafuer gibt es kein Rueckgaengig, nur einen Link zum Lernbereich.
export type LernkartenErzeugenResult = {
  fach: string;
  subjectId: string;
  anzahl: number;
  karten: { id: string; frage: string; antwort: string }[];
  hinweis?: string;
  seite: string;
};
export type LernkarteAnlegenResult = {
  karte: { id: string; frage: string; antwort: string };
  subjectId: string;
  seite: string;
};

export type ActionResult = AssignmentActionResult | NoteActionResult | LernkartenErzeugenResult | LernkarteAnlegenResult;

export function isAssignmentResult(
  tool: string,
  _result: ActionResult,
): _result is AssignmentActionResult {
  return tool === "aufgabe_anlegen" || tool === "aufgabe_aendern";
}

function isLernkartenErzeugenResult(tool: string, _result: ActionResult): _result is LernkartenErzeugenResult {
  return tool === "lernkarten_erzeugen";
}

function isLernkarteAnlegenResult(tool: string, _result: ActionResult): _result is LernkarteAnlegenResult {
  return tool === "lernkarte_anlegen";
}

// Atlas-Signaturkurve, wie in components/stagger.tsx und assignment-list.tsx.
const EASE = [0.22, 1, 0.36, 1] as const;

export function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function ActionCard({
  tool,
  result,
  dimmed = false,
  dimmedLabel,
  footer,
}: {
  tool: string;
  result: ActionResult;
  // Aufgabe/Notiz laeuft ausgeblendet -- entweder zurueckgenommen (Chat) oder
  // inzwischen geloescht/nicht mehr auffindbar (Verlauf). Fuer Lernkarten gibt
  // es kein Rueckgaengig, dimmed bleibt dort ungenutzt.
  dimmed?: boolean;
  dimmedLabel?: string;
  footer?: ReactNode;
}) {
  const isAssignment = isAssignmentResult(tool, result);
  const isLernkartenErzeugen = isLernkartenErzeugenResult(tool, result);
  const isLernkarteAnlegen = isLernkarteAnlegenResult(tool, result);
  const reduce = useReducedMotion();
  const enter = {
    initial: reduce ? false : ({ opacity: 0, y: 6 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: EASE },
  };

  const footerNode =
    footer ?? (dimmed && dimmedLabel ? <p className="mt-2 text-[12px] text-muted-foreground">{dimmedLabel}</p> : null);

  if (isLernkartenErzeugen) {
    const r = result as LernkartenErzeugenResult;
    return (
      <motion.div {...enter} className="max-w-[92%] rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <GraduationCap className="size-3.5" />
          {r.anzahl} Lernkarten erzeugt
        </div>
        <p className="mt-1.5 text-[15px] font-medium leading-snug">{r.fach}</p>
        {r.karten.length > 0 && (
          <ul className="mt-1.5 space-y-1 text-[13.5px] text-muted-foreground">
            {r.karten.slice(0, 3).map((k) => (
              <li key={k.id} className="line-clamp-1">
                {k.frage}
              </li>
            ))}
          </ul>
        )}
        <Link href={r.seite} className="mt-2 inline-block text-[12.5px] font-medium text-primary hover:underline">
          Zum Lernen
        </Link>
        {footerNode}
      </motion.div>
    );
  }

  if (isLernkarteAnlegen) {
    const r = result as LernkarteAnlegenResult;
    return (
      <motion.div {...enter} className="max-w-[92%] rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <GraduationCap className="size-3.5" />
          Lernkarte angelegt
        </div>
        <p className="mt-1.5 text-[15px] font-medium leading-snug">{r.karte.frage}</p>
        <Link href={r.seite} className="mt-2 inline-block text-[12.5px] font-medium text-primary hover:underline">
          Zum Lernen
        </Link>
        {footerNode}
      </motion.div>
    );
  }

  if (isAssignment) {
    const a = (result as AssignmentActionResult).aufgabe;
    const tint = a.subjectId ? colorValue(a.subjectColor) : NEUTRAL_COLOR;
    return (
      <motion.div {...enter} className={cn("max-w-[92%] rounded-xl border bg-card px-4 py-3", dimmed && "opacity-55")}>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ListChecks className="size-3.5" />
          {tool === "aufgabe_anlegen" ? "Aufgabe angelegt" : "Aufgabe geändert"}
        </div>
        <p className={cn("mt-1.5 text-[15px] font-medium leading-snug", dimmed && "line-through decoration-foreground/30")}>
          {a.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: tint }} />
            {a.subjectName ?? "Allgemein"}
          </span>
          {a.type !== "homework" && (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
              {(a.type === "exam" || a.type === "test") && <GraduationCap className="size-3" strokeWidth={2.25} />}
              {TYPE_LABEL[a.type]}
            </span>
          )}
          {a.dueDate && <span className="tabular-nums">Fällig am {fmtDate(a.dueDate)}</span>}
        </div>
        {footerNode}
      </motion.div>
    );
  }

  const n = (result as NoteActionResult).notiz;
  return (
    <motion.div {...enter} className={cn("max-w-[92%] rounded-xl border bg-card px-4 py-3", dimmed && "opacity-55")}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <NotebookPen className="size-3.5" />
        {tool === "notiz_anlegen" ? "Notiz angelegt" : "Notiz geändert"}
      </div>
      <p className={cn("mt-1.5 text-[15px] font-medium leading-snug", dimmed && "line-through decoration-foreground/30")}>
        {n.title}
      </p>
      {n.body.trim() && (
        <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{markdownPreview(n.body)}</p>
      )}
      {footerNode}
    </motion.div>
  );
}
