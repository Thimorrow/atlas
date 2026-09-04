// Reine Logik des Lernplans (Einheiten aus Punkten ableiten, auf Tage
// verteilen, neu verteilen). Bewusst ohne DB-Import und ohne Date.now() --
// jede Zeitabhaengigkeit kommt als Parameter (heuteISO/jetztHM), damit die
// Funktionen im Client, im Server und im Test gleich rechnen. Siehe
// SPEC.md "Verhalten" Schritt B/C und "Neu verteilen".
//
// Datumsarithmetik laeuft in UTC ueber Date.UTC -- anders als lib/lernen.ts
// (lokale Zeit), weil hier reine ISO-Strings ohne Bezug zur Browser-
// Zeitzone verrechnet werden.

import type { Einheit, GelegteEinheit, Phase } from "@/lib/lernplan-types";

export class LernplanFehler extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "LernplanFehler";
    this.code = code;
  }
}

export function runde5(n: number): number {
  return Math.round(n / 5) * 5;
}

function parseISO(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function isoFromUTC(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addTageISO(iso: string, n: number): string {
  const [y, m, d] = parseISO(iso);
  return isoFromUTC(Date.UTC(y, m - 1, d) + n * 86_400_000);
}

function tageZwischen(vonISO: string, bisISO: string): string[] {
  const [vy, vm, vd] = parseISO(vonISO);
  const [by, bm, bd] = parseISO(bisISO);
  const von = Date.UTC(vy, vm - 1, vd);
  const bis = Date.UTC(by, bm - 1, bd);
  const tage: string[] = [];
  for (let t = von; t <= bis; t += 86_400_000) tage.push(isoFromUTC(t));
  return tage;
}

// --- Schritt B: Einheiten je Punkt ------------------------------------------
//
// Faktor nach Sicherheit: >= 80 -> 0,5 (nur ueben), 40..79 -> 1, < 40 -> 1,5.
// lernen nur unter 80, probe nur unter 80, ueben immer 10 Minuten.
export function einheitenFuer(
  punkt: { minuten: number; sicherheit: number },
  pointIndex: number,
): Einheit[] {
  const { minuten, sicherheit } = punkt;
  const faktor = sicherheit >= 80 ? 0.5 : sicherheit >= 40 ? 1 : 1.5;
  const einheiten: Einheit[] = [];
  if (sicherheit < 80) {
    einheiten.push({ pointIndex, phase: "lernen", minuten: Math.max(10, runde5(minuten * faktor)) });
  }
  einheiten.push({ pointIndex, phase: "ueben", minuten: 10 });
  if (sicherheit < 80) {
    einheiten.push({ pointIndex, phase: "probe", minuten: 10 });
  }
  return einheiten;
}

// --- Schritt C: Verteilung auf Tage ------------------------------------------

export type VerteilenOpts = {
  heuteISO: string;
  jetztHM: string;
  pruefungISO: string;
  schultag: (iso: string) => boolean;
  minutesWeekday: number;
  minutesWeekend: number;
  // Sicherheit je Punkt, Index = pointIndex -- fuer die Streich-Reihenfolge.
  sicherheiten: number[];
  // Bereits gelegte (behaltene) Einheiten aus einer vorherigen Verteilung --
  // fuer die Folgetag-Regel (neue "ueben"/"probe" duerfen nicht vor dem
  // behaltenen "lernen"/"ueben" desselben Punkts liegen) und damit neue
  // Einheiten nicht auf schon belegte Tage gelegt werden. Siehe neuVerteilen.
  vorbelegt?: { pointIndex: number; phase: Phase; date: string; minuten: number }[];
};

export type VerteilenErgebnis = {
  items: GelegteEinheit[];
  hinweis?: "knapp";
  gestrichen: number;
  tage: string[];
};

const summeMinuten = (liste: Einheit[]) => liste.reduce((sum, e) => sum + e.minuten, 0);

export function verteilen(einheiten: Einheit[], opts: VerteilenOpts): VerteilenErgebnis {
  const ersterTag = opts.jetztHM < "18:00" ? opts.heuteISO : addTageISO(opts.heuteISO, 1);
  const letzterPlantag = addTageISO(opts.pruefungISO, -1);
  const alleTage = tageZwischen(ersterTag, letzterPlantag);
  if (alleTage.length === 0) {
    throw new LernplanFehler("keine_tage", "Bis zur Pruefung sind keine Tage mehr");
  }

  // Ab 2 Plantagen ist der letzte Tag die Simulation, kein Platz fuer sonst
  // etwas -- deshalb aus den "Lerntagen" fuer die Verteilung ausgeschlossen.
  const simTag = alleTage.length >= 2 ? alleTage[alleTage.length - 1] : null;
  const lerntage = simTag ? alleTage.slice(0, -1) : alleTage.slice();

  const budgetFuer = (iso: string) => (opts.schultag(iso) ? opts.minutesWeekday : opts.minutesWeekend);
  const sicherheitVon = (pointIndex: number | null) =>
    pointIndex === null ? 100 : (opts.sicherheiten[pointIndex] ?? 50);

  const kapazitaet = (budgets: Map<string, number>) =>
    lerntage.reduce((sum, iso) => sum + (budgets.get(iso) ?? 0), 0);

  // Schritt 1: streichen, wenn die Gesamtzeit die Kapazitaet uebersteigt --
  // Reihenfolge: probe von Punkten >= 40, dann alle probe, dann ueben von
  // Punkten >= 80.
  const grundBudgets = new Map(lerntage.map((iso) => [iso, budgetFuer(iso)] as const));
  const arbeitsliste = einheiten.slice();
  let gestrichen = 0;

  const streicheWo = (passt: (e: Einheit) => boolean) => {
    for (let i = arbeitsliste.length - 1; i >= 0; i--) {
      if (summeMinuten(arbeitsliste) <= kapazitaet(grundBudgets)) return;
      if (passt(arbeitsliste[i])) {
        arbeitsliste.splice(i, 1);
        gestrichen++;
      }
    }
  };

  if (summeMinuten(arbeitsliste) > kapazitaet(grundBudgets)) {
    streicheWo((e) => e.phase === "probe" && sicherheitVon(e.pointIndex) >= 40);
    streicheWo((e) => e.phase === "probe");
    streicheWo((e) => e.phase === "ueben" && sicherheitVon(e.pointIndex) >= 80);
  }

  // Schritt 2: reicht es immer noch nicht, Budgets gleichmaessig erhoehen,
  // bis alles passt.
  const budgets = new Map(grundBudgets);
  let hinweis: "knapp" | undefined;
  if (gestrichen > 0) hinweis = "knapp";
  if (summeMinuten(arbeitsliste) > kapazitaet(budgets)) {
    hinweis = "knapp";
    const benoetigt = summeMinuten(arbeitsliste);
    const vorhanden = kapazitaet(budgets);
    const faktor = vorhanden > 0 ? benoetigt / vorhanden : 1;
    for (const iso of lerntage) budgets.set(iso, Math.ceil((budgets.get(iso) ?? 0) * faktor));
  }

  // Schritt 3: legen -- alle lernen (Punkt-Reihenfolge), dann alle ueben,
  // dann alle probe. Greedy auf den ersten Tag mit Restbudget.
  const reihenfolge: Einheit[] = (["lernen", "ueben", "probe"] as const).flatMap((phase) =>
    arbeitsliste.filter((e) => e.phase === phase),
  );

  const restbudget = new Map(budgets);
  const belegungProTag = new Map<string, number>(lerntage.map((iso) => [iso, 0]));
  const lernTagVonPunkt = new Map<number, number>();
  const uebenTagVonPunkt = new Map<number, number>();
  const items: GelegteEinheit[] = [];

  // Index des Tages in lerntage: liegt das Datum vor dem ersten Plantag,
  // gibt es -1 (keine Einschraenkung), liegt es danach den letzten Index.
  const tagIndexVon = (dateISO: string): number => {
    const idx = lerntage.indexOf(dateISO);
    if (idx !== -1) return idx;
    if (lerntage.length === 0) return -1;
    if (dateISO < lerntage[0]) return -1;
    if (dateISO > lerntage[lerntage.length - 1]) return lerntage.length - 1;
    return -1;
  };

  // Vorbelegte (behaltene) Einheiten aus einer vorherigen Verteilung: Budget
  // der betroffenen Tage reduzieren und die Folgetag-Maps vorbesetzen, damit
  // neue Einheiten nicht vor dem behaltenen lernen/ueben desselben Punkts
  // landen oder auf schon volle Tage gelegt werden.
  for (const v of opts.vorbelegt ?? []) {
    if (lerntage.includes(v.date)) {
      restbudget.set(v.date, (restbudget.get(v.date) ?? 0) - v.minuten);
      belegungProTag.set(v.date, (belegungProTag.get(v.date) ?? 0) + 1);
    }
    const idx = tagIndexVon(v.date);
    if (idx < 0) continue;
    if (v.phase === "lernen") {
      const bisher = lernTagVonPunkt.get(v.pointIndex);
      if (bisher === undefined || idx > bisher) lernTagVonPunkt.set(v.pointIndex, idx);
    } else if (v.phase === "ueben") {
      const bisher = uebenTagVonPunkt.get(v.pointIndex);
      if (bisher === undefined || idx > bisher) uebenTagVonPunkt.set(v.pointIndex, idx);
    }
  }

  const platziere = (e: Einheit, minIndex: number): number => {
    // a) erster Tag ab minIndex mit ausreichend Restbudget.
    for (let i = minIndex; i < lerntage.length; i++) {
      const iso = lerntage[i];
      if ((restbudget.get(iso) ?? 0) >= e.minuten) return i;
    }
    // b) Einheit ueber Tagesbudget: ganzer leerer Tag ab minIndex.
    for (let i = minIndex; i < lerntage.length; i++) {
      const iso = lerntage[i];
      if ((belegungProTag.get(iso) ?? 0) === 0) return i;
    }
    // c) kein spaeterer Tag frei: derselbe Tag wie minIndex (Ueberlauf).
    return Math.min(minIndex, lerntage.length - 1);
  };

  for (const e of reihenfolge) {
    let minIndex = 0;
    if (e.phase === "ueben" && e.pointIndex !== null && lernTagVonPunkt.has(e.pointIndex)) {
      minIndex = lernTagVonPunkt.get(e.pointIndex)! + 1;
    } else if (e.phase === "probe" && e.pointIndex !== null && uebenTagVonPunkt.has(e.pointIndex)) {
      minIndex = uebenTagVonPunkt.get(e.pointIndex)! + 1;
    }
    if (minIndex >= lerntage.length) {
      const vortag =
        e.phase === "ueben"
          ? lernTagVonPunkt.get(e.pointIndex!)
          : e.phase === "probe"
            ? uebenTagVonPunkt.get(e.pointIndex!)
            : undefined;
      minIndex = vortag ?? lerntage.length - 1;
    }

    const idx = platziere(e, minIndex);
    const iso = lerntage[idx];
    restbudget.set(iso, (restbudget.get(iso) ?? 0) - e.minuten);
    const position = belegungProTag.get(iso) ?? 0;
    belegungProTag.set(iso, position + 1);
    items.push({ ...e, date: iso, position });

    if (e.pointIndex !== null) {
      if (e.phase === "lernen") lernTagVonPunkt.set(e.pointIndex, idx);
      if (e.phase === "ueben") uebenTagVonPunkt.set(e.pointIndex, idx);
    }
  }

  if (simTag) {
    items.push({
      pointIndex: null,
      phase: "simulation",
      minuten: budgetFuer(simTag),
      date: simTag,
      position: 0,
    });
  }

  return { items, hinweis, gestrichen, tage: alleTage };
}

// --- Neu verteilen ------------------------------------------------------

export type NeuVerteilenItem = {
  id: string;
  pointIndex: number | null;
  phase: Phase;
  minuten: number;
  date: string;
  doneAt: string | null;
};

export type NeuVerteilenInput = {
  items: NeuVerteilenItem[];
  punkte: { sicherheit: number }[];
};

export type NeuVerteilenOpts = VerteilenOpts & { umfang: "ueberfaellig" | "alle_offen" };

export type NeuVerteilenErgebnis = {
  behalten: string[];
  neu: GelegteEinheit[];
  zusaetzlich: number;
  hinweis?: "knapp";
};

export function neuVerteilen(plan: NeuVerteilenInput, opts: NeuVerteilenOpts): NeuVerteilenErgebnis {
  const istBetroffen = (item: NeuVerteilenItem) => {
    if (item.doneAt !== null) return false;
    return opts.umfang === "ueberfaellig" ? item.date < opts.heuteISO : true;
  };

  const behalten = plan.items.filter((i) => !istBetroffen(i));
  const betroffene = plan.items.filter(istBetroffen);
  const simulationErledigt = plan.items.some((i) => i.phase === "simulation" && i.doneAt !== null);

  // Punkte >= 80 verlieren ihre offene probe -- die betroffene Einheit wird
  // geloescht (Schritt 2) und hier nicht wieder aufgenommen.
  const zuLegen: Einheit[] = betroffene
    .filter((i) => i.phase !== "simulation")
    .filter((i) => {
      if (i.phase !== "probe") return true;
      const sicherheit = i.pointIndex !== null ? (plan.punkte[i.pointIndex]?.sicherheit ?? 50) : 50;
      return sicherheit < 80;
    })
    .map((i): Einheit => ({ pointIndex: i.pointIndex, phase: i.phase, minuten: i.minuten }));

  // Punkte < 40 ohne offene ueben bekommen zusaetzlich eine.
  let zusaetzlich = 0;
  plan.punkte.forEach((punkt, pointIndex) => {
    if (punkt.sicherheit >= 40) return;
    const hatUeben =
      behalten.some((i) => i.pointIndex === pointIndex && i.phase === "ueben") ||
      zuLegen.some((e) => e.pointIndex === pointIndex && e.phase === "ueben");
    if (!hatUeben) {
      zuLegen.push({ pointIndex, phase: "ueben", minuten: 10 });
      zusaetzlich++;
    }
  });

  const vorbelegt = behalten
    .filter((i): i is NeuVerteilenItem & { pointIndex: number } => i.pointIndex !== null)
    .map((i) => ({ pointIndex: i.pointIndex, phase: i.phase, date: i.date, minuten: i.minuten }));

  const ergebnis = verteilen(zuLegen, { ...opts, vorbelegt });
  // Die Simulation ist schon erledigt: verteilen() legt trotzdem automatisch
  // eine neue an, die hier verworfen wird -- sonst gaebe es zwei.
  const neu = simulationErledigt ? ergebnis.items.filter((i) => i.phase !== "simulation") : ergebnis.items;

  return {
    behalten: behalten.map((i) => i.id),
    neu,
    zusaetzlich,
    hinweis: ergebnis.hinweis,
  };
}
