import type { NewSchoolBlock } from "@/lib/db/schema";

// Minimal-Shape einer Untis-Lesson (nur was wir brauchen).
export type UntisLesson = {
  id: number;
  date: number; // yyyymmdd
  startTime: number; // hmm, z.B. 750 = 07:50
  endTime: number;
  su?: { name?: string; longname?: string }[];
  ro?: { name?: string }[];
  te?: { name?: string; longname?: string }[];
  code?: "cancelled" | "irregular";
  substText?: string;
  lstext?: string;
};

function untisDateToISO(n: number): string {
  const s = String(n);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function untisTimeToHM(n: number): string {
  const s = String(n).padStart(4, "0");
  return `${s.slice(0, 2)}:${s.slice(2)}`;
}

function mapStatus(code?: string): NewSchoolBlock["status"] {
  if (code === "cancelled") return "cancelled";
  if (code === "irregular") return "substituted";
  return "regular";
}

// Untis-Langnamen sind sperrig / inkonsistent. Auf saubere Anzeigenamen mappen.
// Erste passende Regel gewinnt (case-insensitive Teilstring); sonst Original.
const SUBJECT_RULES: [needle: string, clean: string][] = [
  ["lateinisch", "Latein"],
  ["informatorische", "Deutsch"],
  ["informatik", "Informatik"], // deckt "Informatik / angewandte Mathe" ab
];

export function normalizeSubject(raw: string): string {
  const s = raw.toLowerCase();
  for (const [needle, clean] of SUBJECT_RULES) {
    if (s.includes(needle)) return clean;
  }
  return raw;
}

// Untis-Lesson -> Atlas SchoolBlock. Untis-Feldnamen leben NUR hier
// (duenner Adapter, austauschbar gegen kuenftige API).
// aliases bildet Untis-Kuerzel auf Nachnamen ab. Noetig, weil der Stundenplan zu
// manchen Lehrern nur das Kuerzel nennt, das Lehrerverzeichnis den Nachnamen
// aber kennt -- ohne das Nachschlagen schriebe der Import ein Kuerzel, das der
// Abgleich danach erst wieder einsammeln muesste.
export function lessonToSchoolBlock(
  l: UntisLesson,
  aliases?: Map<string, string>,
): NewSchoolBlock {
  const te = l.te?.[0];
  const teacher = te?.longname ?? (te?.name ? (aliases?.get(te.name) ?? te.name) : null);

  return {
    untisLessonId: String(l.id),
    date: untisDateToISO(l.date),
    startTime: untisTimeToHM(l.startTime),
    endTime: untisTimeToHM(l.endTime),
    subject: normalizeSubject(l.su?.[0]?.longname ?? l.su?.[0]?.name ?? "?"),
    room: l.ro?.[0]?.name ?? null,
    // Nachname statt Kuerzel: "Schulze" sagt etwas, "Sch" nur dem, der ohnehin
    // schon weiss, wer gemeint ist.
    teacher,
    status: mapStatus(l.code),
    substitutionText: l.substText || l.lstext || null,
  };
}
