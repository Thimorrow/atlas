// DTO- und Domaenen-Typen des Lernplans -- ohne DB-Import, damit reine Logik
// (lib/lernplan.ts) und Client-Code sie direkt nutzen koennen. Form gemaess
// SPEC.md "Datenmodell" und "Verhalten".

export type Phase = "lernen" | "ueben" | "probe" | "simulation";
export type SicherheitQuelle = "diagnose" | "karten" | "fazit" | "selbst" | "ohne_test";

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
  date: string;
  position: number;
  phase: Phase;
  minuten: number;
  doneAt: string | null;
  result: number | null;
};
