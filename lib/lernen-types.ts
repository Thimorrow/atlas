// Gemeinsame DTO-Typen des Lernbereichs. Bewusst ohne DB-Import: der Client
// (components/lernen-*.tsx), der Store (lib/study-store.ts) und die reine
// Logik (lib/lernen.ts) teilen sich diese Formen. Der Store fuellt sie, die
// Oberflaeche liest sie -- wer eine Form aendert, aendert beides.

export type StudyCardSource = "manuell" | "notizen" | "datei" | "lehrplan";

// Lernart eines Fachs: bestimmt, was der Generator erzeugt und wie die
// Sitzung abfragt. Wird aus dem Fachnamen vorbelegt (lernartFor) und ist je
// Fach umstellbar (subjects.lernart, null = automatisch).
//   aufgaben: Mathe, Physik, Chemie, Informatik -- Uebungsaufgaben mit Loesungsweg
//   vokabeln: Englisch, Franzoesisch, Latein, Spanisch -- Vokabeln beide
//             Richtungen mit Eintippen, dazu Grammatik
//   wissen:   Bio, Erdkunde, Geschichte, Politik, Religion, Musik, Kunst,
//             Sport -- Erklaerfragen und Lernzettel
//   texte:    Deutsch -- Stilmittel, Analysebausteine, Aufsatzaufbau
export type Lernart = "aufgaben" | "vokabeln" | "wissen" | "texte";
export const LERNARTEN: Lernart[] = ["aufgaben", "vokabeln", "wissen", "texte"];

// Art einer Karte; steuert die Darstellung in der Sitzung.
//   wissen:  Frage -> Antwort, Selbsteinschaetzung
//   vokabel: Paar Deutsch (question) / Fremdsprache (answer), beide
//            Richtungen, Antwort eintippen, Vergleich normalisiert
//   aufgabe: Aufgabe (question) -> Loesungsweg (answer), "Geloest / Nicht geloest"
export type CardKind = "wissen" | "vokabel" | "aufgabe";
export const CARD_KINDS: CardKind[] = ["wissen", "vokabel", "aufgabe"];

export type StudyCardDTO = {
  id: string;
  subjectId: string;
  // null = Karte ohne Thema ("Allgemein").
  topicId: string | null;
  kind: CardKind;
  question: string;
  answer: string;
  source: StudyCardSource;
  sourceRef: string | null;
  box: number;
  due: string;
  reviews: number;
  lapses: number;
  lastReviewedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Ein Thema buendelt Karten und traegt den Lernzettel (Markdown). Optional an
// eine Pruefung (assignments.id, type exam|test|presentation) gebunden.
export type TopicDTO = {
  id: string;
  subjectId: string;
  title: string;
  summary: string;
  assignmentId: string | null;
  position: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProgressDTO = {
  total: number;
  neu: number;
  lernend: number;
  sicher: number;
  faellig: number;
  // 0..100, gewichtete Sicherheit aller aktiven Karten (siehe readiness()).
  bereit: number;
};

export type TopicWithProgress = TopicDTO & { progress: ProgressDTO };

export type PruefungRef = {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  tageBis: number;
};

export type PlanDTO = { tageBis: number; proTag: number; offen: number };

// Ein Eintrag im Tagesplan ("Heute" auf /lernen).
export type HeuteItem = {
  subjectId: string;
  subjectName: string;
  color: string | null;
  // null = Karten ohne Thema.
  topicId: string | null;
  titel: string;
  grund: "pruefung" | "faellig";
  // Nur bei grund "pruefung".
  pruefung: PruefungRef | null;
  anzahl: number;
  minuten: number;
};

export type PruefungOverview = PruefungRef & {
  subjectId: string;
  subjectName: string;
  color: string | null;
  themen: { id: string; title: string; total: number; bereit: number }[];
  total: number;
  bereit: number;
};

export type SubjectOverview = {
  subjectId: string;
  name: string;
  color: string | null;
  lernart: Lernart;
  progress: ProgressDTO;
  heuteGelernt: number;
  naechstePruefung: PruefungRef | null;
  plan: PlanDTO | null;
};

export type OverviewResponse = {
  today: string;
  heuteGelernt: number;
  heute: { items: HeuteItem[]; karten: number; minuten: number };
  pruefungen: PruefungOverview[];
  faecher: SubjectOverview[];
};

export type SubjectDetail = {
  subject: {
    id: string;
    name: string;
    color: string | null;
    curriculum: string | null;
    // Wirksame Lernart (Override oder automatisch) und ob sie ein Override ist.
    lernart: Lernart;
    lernartAuto: boolean;
  };
  cards: StudyCardDTO[];
  themen: TopicWithProgress[];
  // Fortschritt der Karten ohne Thema.
  ohneThema: ProgressDTO;
  progress: ProgressDTO;
  naechstePruefung: PruefungRef | null;
  // Alle anstehenden Pruefungen des Fachs (fuer die Zuordnung eines Themas).
  pruefungen: PruefungRef[];
  plan: PlanDTO | null;
  dateien: { id: string; name: string; contentType: string }[];
  notizen: { id: string; title: string }[];
  // Nur von der Route gesetzt (subjectDetail() im Store kennt den Bot nicht):
  // ob ZAI_API_KEY konfiguriert ist, ohne dafuer eine Bot-Konversation anzulegen.
  botEnabled?: boolean;
};

export type SessionModus = "lernen" | "schwach" | "probe";
