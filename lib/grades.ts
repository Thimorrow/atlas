// Notenrechnung der gymnasialen Oberstufe: Punkte 0-15 als Leitwaehrung, die
// Note 1-6 nur als Beschriftung daneben.
//
// Diese Datei ist bewusst frei von Datenbank und React: die Umrechnung und die
// Schnittbildung sind die einzigen Stellen, an denen sich das Feature wirklich
// irren kann, und sie sollen ohne DATABASE_URL testbar bleiben.

export const POINTS_MIN = 0;
export const POINTS_MAX = 15;

export const GRADE_KINDS = ["oral", "written"] as const;
export type GradeKind = (typeof GRADE_KINDS)[number];

export const KIND_LABEL: Record<GradeKind, string> = {
  oral: "Muendlich",
  written: "Schriftlich",
};

// Anteil der muendlichen Noten am Fachschnitt, in Prozent. Zwei Presets, weil
// genau diese beiden an den meisten Schulen in der Verordnung stehen -- ein
// freies Zahlenfeld waere hier eine Einstellung, die niemand braucht.
export const ORAL_WEIGHT_PRESETS = [50, 40] as const;
export const DEFAULT_ORAL_WEIGHT = 50;

// Kurz gehalten: welche Seite gemeint ist, steht direkt darueber im Schnitt
// ("Muendlich ... Schriftlich"). Ein langes Label sprengt auf dem Handy die Karte.
export const ORAL_WEIGHT_LABEL: Record<number, string> = {
  50: "50 : 50",
  40: "40 : 60",
};

// --- Punkte zu Note ----------------------------------------------------------

// Die uebliche KMK-Tabelle, geschlossen ausgerechnet statt als 16-Zeilen-Liste:
// ab 1 Punkt laufen die Stufen in Dreiergruppen (+, glatt, -) von 1+ abwaerts,
// 0 Punkte sind die einzige Note ohne Tendenz.
export function pointsToGradeLabel(points: number): string {
  const p = clampPoints(Math.round(points));
  if (p === 0) return "6";
  const step = 16 - p; // 1 fuer 15 Punkte ... 15 fuer 1 Punkt
  const grade = Math.floor((step + 2) / 3);
  const tendency = step % 3 === 1 ? "+" : step % 3 === 0 ? "-" : "";
  return `${grade}${tendency}`;
}

// Die glatte Note ohne Tendenz -- fuer Faelle, in denen nur die Ziffer zaehlt.
export function pointsToGradeNumber(points: number): number {
  const p = clampPoints(Math.round(points));
  if (p === 0) return 6;
  return Math.floor((16 - p + 2) / 3);
}

export function clampPoints(points: number): number {
  if (!Number.isFinite(points)) return POINTS_MIN;
  return Math.min(POINTS_MAX, Math.max(POINTS_MIN, points));
}

export function isValidPoints(points: unknown): points is number {
  return (
    typeof points === "number" &&
    Number.isInteger(points) &&
    points >= POINTS_MIN &&
    points <= POINTS_MAX
  );
}

// --- Schnitt -----------------------------------------------------------------

export type GradeInput = {
  kind: GradeKind;
  points: number;
  weight: number;
};

export type GradeAverage = {
  points: number; // Schnitt in Punkten, ungerundet
  label: string; // zugehoerige Note, etwa "2+"
};

export type SubjectAverage = {
  average: GradeAverage | null; // null = noch keine verwertbare Note
  oral: GradeAverage | null;
  written: GradeAverage | null;
  count: number;
};

// Gewichtetes Mittel einer Notengruppe. Summiert sich die Gewichtung auf 0,
// gibt es nichts zu mitteln -- die Gruppe zaehlt dann wie gar nicht vorhanden,
// statt eine Division durch null zu riskieren.
function weightedAverage(grades: GradeInput[]): number | null {
  if (grades.length === 0) return null;
  let weightSum = 0;
  let pointSum = 0;
  for (const g of grades) {
    const w = Number.isFinite(g.weight) && g.weight > 0 ? g.weight : 0;
    weightSum += w;
    pointSum += clampPoints(g.points) * w;
  }
  if (weightSum === 0) return null;
  return pointSum / weightSum;
}

function toAverage(points: number | null): GradeAverage | null {
  return points === null ? null : { points, label: pointsToGradeLabel(points) };
}

// Fachschnitt aus muendlichem und schriftlichem Teil.
//
// Fehlt eine der beiden Seiten, zaehlt die andere allein: wer noch keine
// Klausur geschrieben hat, soll den Schnitt seiner muendlichen Noten sehen und
// nicht 60 Prozent Nichts eingerechnet bekommen.
export function subjectAverage(
  grades: GradeInput[],
  oralWeightPercent: number = DEFAULT_ORAL_WEIGHT,
): SubjectAverage {
  const oral = weightedAverage(grades.filter((g) => g.kind === "oral"));
  const written = weightedAverage(grades.filter((g) => g.kind === "written"));

  let combined: number | null;
  if (oral !== null && written !== null) {
    const share = Math.min(100, Math.max(0, oralWeightPercent)) / 100;
    combined = oral * share + written * (1 - share);
  } else {
    combined = oral ?? written;
  }

  return {
    average: toAverage(combined),
    oral: toAverage(oral),
    written: toAverage(written),
    count: grades.length,
  };
}

// --- Zielnoten-Rechner ---------------------------------------------------

// Ergebnis von requiredPointsForGoal: entweder ist das Ziel schon erreicht,
// es ist selbst mit 15 Punkten nicht mehr erreichbar, oder es braucht genau
// diese Punktzahl in der naechsten Note.
export type GoalOutcome =
  | { status: "reached"; current: number }
  | { status: "unreachable"; atMax: number }
  | { status: "achievable"; points: number };

// Rundungsfehler aus der Bruchrechnung duerfen nicht ueber "erreichbar" oder
// "nicht erreichbar" entscheiden.
const GOAL_EPSILON = 1e-9;

// Kehrt subjectAverage() um: gegeben die vorhandenen Noten und eine geplante
// naechste Note (Art und Gewichtung), welche Punktzahl braucht diese naechste
// Note, damit der Fachschnitt targetPoints erreicht?
//
// Die Herleitung folgt exakt subjectAverage() oben: die neue Note veraendert
// nur den Schnitt ihrer eigenen Gruppe (muendlich oder schriftlich), die
// andere Gruppe bleibt unveraendert. Beide Gruppenschnitte sind linear in der
// neuen Punktzahl, ihr gewichtetes Mittel also auch -- die Umkehrung ist damit
// eine einzige Geradengleichung, keine Naeherung oder Suche.
export function requiredPointsForGoal(
  grades: GradeInput[],
  targetPoints: number,
  next: { kind: GradeKind; weight: number },
  oralWeightPercent: number = DEFAULT_ORAL_WEIGHT,
): GoalOutcome {
  const target = clampPoints(targetPoints);
  const w = Number.isFinite(next.weight) && next.weight > 0 ? next.weight : 0;
  const share = Math.min(100, Math.max(0, oralWeightPercent)) / 100;

  // Ist das Ziel schon ohne die neue Note erreicht?
  const current = subjectAverage(grades, oralWeightPercent).average;
  if (current !== null && current.points >= target - GOAL_EPSILON) {
    return { status: "reached", current: current.points };
  }

  if (w === 0) {
    // Eine Note ohne Gewicht zaehlt nirgends mit -- der Schnitt bleibt, wie er
    // ist, ganz gleich welche Punktzahl eingetragen wird.
    return { status: "unreachable", atMax: current?.points ?? 0 };
  }

  const sameKind = grades.filter((g) => g.kind === next.kind);
  let sameWeightSum = 0;
  let samePointSum = 0;
  for (const g of sameKind) {
    const gw = Number.isFinite(g.weight) && g.weight > 0 ? g.weight : 0;
    sameWeightSum += gw;
    samePointSum += clampPoints(g.points) * gw;
  }

  const otherAvg = weightedAverage(grades.filter((g) => g.kind !== next.kind));

  // Anteil, mit dem die eigene (neue) bzw. die andere Gruppe in den
  // Fachschnitt eingeht -- dieselbe Fallunterscheidung wie in subjectAverage.
  const ownShare = otherAvg === null ? 1 : next.kind === "oral" ? share : 1 - share;
  const otherShare = otherAvg === null ? 0 : next.kind === "oral" ? 1 - share : share;

  if (ownShare === 0) {
    // Die Gewichtung stellt die eigene Gruppe auf 0 Anteil (oralWeight 0 mit
    // einer muendlichen bzw. 100 mit einer schriftlichen naechsten Note) --
    // die neue Note aendert am Schnitt nichts, egal welche Punktzahl.
    return { status: "unreachable", atMax: otherAvg ?? 0 };
  }

  // combined(p) = ownShare * (samePointSum + p*w) / (sameWeightSum + w) + otherShare * otherAvg
  const m = otherAvg !== null ? otherShare * otherAvg : 0;
  const requiredOwnAverage = (target - m) / ownShare;
  const p = (requiredOwnAverage * (sameWeightSum + w) - samePointSum) / w;

  if (p > POINTS_MAX + GOAL_EPSILON) {
    const atMax = ownShare * ((samePointSum + POINTS_MAX * w) / (sameWeightSum + w)) + m;
    return { status: "unreachable", atMax: clampPoints(atMax) };
  }

  return { status: "achievable", points: Math.max(POINTS_MIN, Math.ceil(p - GOAL_EPSILON)) };
}

// Gesamtschnitt ueber die Faecher: jedes Fach zaehlt einmal, unabhaengig davon,
// wie viele Noten darin stehen. Faecher ohne Note bleiben aussen vor, sonst
// wuerde ein frisch angelegtes Fach den Schnitt verschieben.
export function overallAverage(subjectAverages: (GradeAverage | null)[]): GradeAverage | null {
  const values = subjectAverages.filter((a): a is GradeAverage => a !== null);
  if (values.length === 0) return null;
  const sum = values.reduce((acc, a) => acc + a.points, 0);
  return toAverage(sum / values.length);
}

// Faecher nach Schnitt sortieren, schwaechstes zuerst: genau da soll der Blick
// zuerst hinfallen. Faecher ohne Note sind kein "Schnitt 0" und stehen darum
// in einer zweiten Gruppe statt mittendrin -- eine echte Note ist immer
// aussagekraeftiger als das Fehlen einer.
export function sortSubjectsByAverage<T extends { average: GradeAverage | null }>(
  items: T[],
): { withGrades: T[]; withoutGrades: T[] } {
  const withGrades = items.filter((i) => i.average !== null);
  const withoutGrades = items.filter((i) => i.average === null);
  withGrades.sort((a, b) => a.average!.points - b.average!.points);
  return { withGrades, withoutGrades };
}

// --- Anzeige -----------------------------------------------------------------

// Eine Nachkommastelle mit deutschem Komma. Bewusst nicht toLocaleString:
// die Ausgabe soll auf jedem Geraet und in jedem Test identisch sein.
export function formatPoints(points: number): string {
  return points.toFixed(1).replace(".", ",");
}
