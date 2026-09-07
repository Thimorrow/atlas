// DTO- und Domaenen-Typen des Lernplans -- ohne DB-Import, damit reine Logik
// (lib/lernplan.ts) und Client-Code sie direkt nutzen koennen. Form gemaess
// SPEC.md "Datenmodell" und "Verhalten".

export type Phase = "lernen" | "ueben" | "probe" | "simulation";
export type SicherheitQuelle = "diagnose" | "karten" | "fazit" | "selbst" | "ohne_test";

// Obergrenze der Punkte pro Plan -- eine Quelle der Wahrheit fuer Server
// (app/api/lernen/plan/route.ts, lehnt Ueberschreitung ab) und Client
// (components/lernplan-erstellen.tsx, zeigt die Grenze an und sperrt
// "Punkt hinzufuegen" vorher, statt den Fehler erst nach dem Diagnosetest
// zu zeigen).
export const MAX_PUNKTE_PRO_PLAN = 20;

// Grenzen des taeglichen Zeitbudgets (Schultag und Wochenende) -- eine
// Quelle der Wahrheit fuer Client (components/lernplan-erstellen.tsx, kappt
// die Eingabe schon beim Tippen) und Server (lib/lernplan-store.ts,
// budgetAendernImStore lehnt Werte ausserhalb ab). Schultag und Wochenende
// teilen sich dieselbe Grenze: lib/lernplan-store.ts hat schon vor diesem
// Fix beide Felder mit derselben gueltig()-Pruefung (BUDGET_MIN/BUDGET_MAX)
// behandelt, es gibt also keinen fachlichen Grund fuer zwei verschiedene
// Obergrenzen -- der Client hatte hier nur (vermutlich versehentlich) einen
// eigenen, niedrigeren Wert fuer den Schultag.
export const ZEITBUDGET_MIN = 10;
export const ZEITBUDGET_MAX = 240;

// Ein vom Modell erkannter (oder von Hand ergaenzter) Checklisten-Punkt vor
// dem Speichern -- Zwischenstand in Schritt 2 und 3 der Erstell-Seite.
export type PunktDraft = {
  titel: string;
  detail: string;
  seiten: string | null;
  fileIds: string[];
  minuten: number;
  frage: string | null;
  musterantwort: string | null;
};

// Ergebnis des Diagnosetests je Punkt -- CheckDraft traegt zusaetzlich die
// Nutzerantwort und das Modell-Urteil.
export type CheckDraft = {
  // NEU (lernplan-store): Index des zugehoerigen Punkts in punkte[], falls
  // die Checks nicht 1:1 an der Position im checks-Array haengen (Punkte
  // ohne frage werden im Diagnosetest uebersprungen). Fehlt das Feld, gilt
  // die Position im Array als Index -- siehe lib/lernplan-store.ts.
  pointIndex?: number;
  frage: string;
  musterantwort: string;
  antwort: string | null;
  urteil: "richtig" | "teilweise" | "falsch";
  feedback: string;
};

// Eine geplante Einheit, wie sie einheitenFuer() vor der Verteilung liefert
// -- noch ohne Datum.
export type Einheit = {
  pointIndex: number | null;
  phase: Phase;
  minuten: number;
};

// Eine Einheit, nachdem verteilen() ihr einen Tag zugewiesen hat.
export type GelegteEinheit = Einheit & {
  date: string;
  position: number;
};

export type PlanDTO = {
  id: string;
  assignmentId: string;
  subjectId: string;
  checklistFileId: string | null;
  checklistText: string;
  minutesWeekday: number;
  minutesWeekend: number;
  examDate: string;
  createdAt: string;
  updatedAt: string;
  punkte: PunktDTO[];
  items: ItemDTO[];
};

export type PunktDTO = {
  id: string;
  planId: string;
  topicId: string | null;
  position: number;
  titel: string;
  detail: string;
  seiten: string | null;
  fileIds: string[];
  blaetter: { id: string; name: string }[];
  minutenSchaetzung: number;
  sicherheit: number;
  sicherheitQuelle: SicherheitQuelle;
  sicherheitAm: string;
  cardsState: "offen" | "fertig" | "fehler";
  kartenAnzahl: number;
  checks: CheckDTO[];
};

export type CheckDTO = {
  id: string;
  pointId: string;
  frage: string;
  musterantwort: string;
  antwort: string | null;
  urteil: "richtig" | "teilweise" | "falsch" | null;
  feedback: string;
  createdAt: string;
};

export type ItemDTO = {
  id: string;
  planId: string;
  pointId: string | null;
  punktTitel: string | null;
  // Thema des zugehoerigen Punkts, direkt mitgeliefert -- ohne das muesste
  // jeder Aufrufer (morgen-panel.tsx, stunden-cockpit.tsx) selbst nach dem
  // Punkt suchen, um einen Ueben-Link mit `thema=` zu bauen (siehe
  // lernplan-seite.tsx). null = kein Punkt (Simulation) oder Punkt ohne
  // Thema ("Allgemein").
  topicId: string | null;
  date: string;
  position: number;
  phase: Phase;
  minuten: number;
  doneAt: string | null;
  result: number | null;
};
