import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { heuteISO, jetztHM } from "@/lib/zeit";
import { LernplanStoreFehler, planAnlegen } from "@/lib/lernplan-store";
import { MAX_PUNKTE_PRO_PLAN, ZEITBUDGET_MAX, ZEITBUDGET_MIN, type CheckDraft, type PunktDraft } from "@/lib/lernplan-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_IDS = 20;
const URTEILE = ["richtig", "teilweise", "falsch"] as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parsePunkt(raw: unknown): PunktDraft | null {
  if (!isObj(raw)) return null;
  if (typeof raw.titel !== "string" || raw.titel.length < 1 || raw.titel.length > 200) return null;
  const minuten = raw.minuten;
  if (typeof minuten !== "number" || !Number.isInteger(minuten) || minuten < 10 || minuten > 90) return null;
  const fileIds = Array.isArray(raw.fileIds) ? raw.fileIds : [];
  if (!fileIds.every((f) => typeof f === "string" && isUuid(f))) return null;
  return {
    titel: raw.titel,
    detail: typeof raw.detail === "string" ? raw.detail : "",
    seiten: typeof raw.seiten === "string" && raw.seiten.trim() ? raw.seiten : null,
    fileIds: fileIds as string[],
    minuten,
    frage: typeof raw.frage === "string" && raw.frage.trim() ? raw.frage : null,
    musterantwort: typeof raw.musterantwort === "string" && raw.musterantwort.trim() ? raw.musterantwort : null,
  };
}

function parseCheck(raw: unknown): CheckDraft | null {
  if (!isObj(raw)) return null;
  if (typeof raw.frage !== "string" || typeof raw.musterantwort !== "string") return null;
  if (typeof raw.urteil !== "string" || !(URTEILE as readonly string[]).includes(raw.urteil)) return null;
  if (raw.pointIndex !== undefined && typeof raw.pointIndex !== "number") return null;
  return {
    pointIndex: raw.pointIndex as number | undefined,
    frage: raw.frage,
    musterantwort: raw.musterantwort,
    antwort: typeof raw.antwort === "string" ? raw.antwort : null,
    urteil: raw.urteil as CheckDraft["urteil"],
    feedback: typeof raw.feedback === "string" ? raw.feedback : "",
  };
}

// POST /api/lernen/plan -- legt den Plan an (Schritt 4). Siehe SPEC.md
// "Schritt 4: POST /api/lernen/plan".
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!isObj(body)) {
    return NextResponse.json({ error: "body", hinweis: "Die Anfrage ist ungültig." }, { status: 400 });
  }

  const { assignmentId, checklist, fileIds, minutesWeekday, minutesWeekend, punkte, checks, ersetzen } = body;

  if (typeof assignmentId !== "string" || !isUuid(assignmentId)) {
    return NextResponse.json({ error: "assignmentId", hinweis: "Diese Prüfung ist ungültig." }, { status: 400 });
  }

  if (!isObj(checklist)) return NextResponse.json({ error: "checklist" }, { status: 400 });
  const hatFileId = typeof checklist.fileId === "string";
  const hatText = typeof checklist.text === "string";
  if (hatFileId === hatText) return NextResponse.json({ error: "checklist" }, { status: 400 });
  if (hatFileId && !isUuid(checklist.fileId as string)) {
    return NextResponse.json({ error: "checklist" }, { status: 400 });
  }

  const fileIdsArr = fileIds === undefined ? [] : fileIds;
  if (
    !Array.isArray(fileIdsArr) ||
    fileIdsArr.length > MAX_FILE_IDS ||
    !fileIdsArr.every((f) => typeof f === "string" && isUuid(f))
  ) {
    return NextResponse.json({ error: "fileIds", hinweis: "Eine der Dateien ist ungültig." }, { status: 400 });
  }

  if (typeof minutesWeekday !== "number" || !Number.isInteger(minutesWeekday) || minutesWeekday < ZEITBUDGET_MIN || minutesWeekday > ZEITBUDGET_MAX) {
    return NextResponse.json({ error: "minutesWeekday" }, { status: 400 });
  }
  if (typeof minutesWeekend !== "number" || !Number.isInteger(minutesWeekend) || minutesWeekend < ZEITBUDGET_MIN || minutesWeekend > ZEITBUDGET_MAX) {
    return NextResponse.json({ error: "minutesWeekend" }, { status: 400 });
  }

  if (!Array.isArray(punkte) || punkte.length === 0) {
    // Eigener Code statt "punkte": derselbe Code trug bisher zwei fachlich
    // verschiedene Faelle (leere Liste vs. kaputter Punkt) und nur einer von
    // beiden konnte in FEHLER_TEXT stehen. Muster wie bei zu_viele_punkte.
    return NextResponse.json({ error: "plan_ohne_punkte", hinweis: "Mindestens ein Punkt wird gebraucht." }, { status: 400 });
  }
  // BLOCKIEREND-Fix: ein eigener Code fuer zu viele Punkte statt desselben
  // "punkte" wie bei einem ungueltigen Titel/einer ungueltigen Minutenzahl --
  // sonst landet der Nutzer nach einem 21. Punkt in "Zurueck zur Liste" mit
  // einer Meldung, die einen Titel- oder Minutenfehler behauptet, den es gar
  // nicht gibt. MAX_PUNKTE_PRO_PLAN ist die einzige Quelle der Wahrheit fuer
  // die Grenze, siehe lib/lernplan-types.ts.
  if (punkte.length > MAX_PUNKTE_PRO_PLAN) {
    return NextResponse.json(
      {
        error: "zu_viele_punkte",
        hinweis: `Höchstens ${MAX_PUNKTE_PRO_PLAN} Punkte. Zwei zusammenlegen oder einen löschen.`,
      },
      { status: 400 },
    );
  }
  const parsedPunkte: PunktDraft[] = [];
  for (const p of punkte) {
    const parsed = parsePunkt(p);
    if (!parsed) {
      return NextResponse.json(
        { error: "punkte", hinweis: "Ein Punkt hat noch keinen Titel oder eine ungültige Minutenzahl." },
        { status: 400 },
      );
    }
    parsedPunkte.push(parsed);
  }

  let parsedChecks: CheckDraft[] | null = null;
  if (checks !== null && checks !== undefined) {
    if (!Array.isArray(checks)) {
      return NextResponse.json({ error: "checks", hinweis: "Die Testantworten sind ungültig." }, { status: 400 });
    }
    parsedChecks = [];
    for (const c of checks) {
      const parsed = parseCheck(c);
      if (!parsed) {
        return NextResponse.json({ error: "checks", hinweis: "Die Testantworten sind ungültig." }, { status: 400 });
      }
      parsedChecks.push(parsed);
    }
  }

  const checklistInput = hatFileId
    ? { fileId: checklist.fileId as string }
    : { text: checklist.text as string };

  try {
    const result = await planAnlegen(
      {
        assignmentId,
        checklist: checklistInput,
        fileIds: fileIdsArr as string[],
        minutesWeekday,
        minutesWeekend,
        punkte: parsedPunkte,
        checks: parsedChecks,
        ersetzen: ersetzen === true,
      },
      { heuteISO: heuteISO(), jetztHM: jetztHM() },
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LernplanStoreFehler) {
      return NextResponse.json({ error: err.code, ...(err.hinweis ? { hinweis: err.hinweis } : {}) }, { status: err.status });
    }
    console.error("[lernplan] plan: unbekannter Fehler:", err);
    return NextResponse.json({ error: "unbekannt" }, { status: 500 });
  }
}
