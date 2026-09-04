// DTO-Typen des Tutors -- ohne DB-Import, damit Client-Code sie direkt nutzen
// kann (Widgets, Themenseite, Kartensession). Form von checkliste/ergebnis
// gemaess TUTOR-SPEC.md "Datenmodell".

import type { CardKind } from "@/lib/lernen-types";

export type AufgabeStatus = "offen" | "richtig" | "falsch" | "uebersprungen";

export type Checkliste = {
  titel: string;
  aufgaben: {
    nr: number;
    text: string;
    schwierigkeit: number;
    status: AufgabeStatus;
    punkte?: number;
  }[];
};

export type TutorErgebnis = {
  gutWar: string[];
  schwach: string[];
  neueKarten: { question: string; answer: string; kind?: CardKind }[];
  punkte?: number;
  gesamt?: number;
  prozent?: number;
  note?: number;
  // Nur Simulation (mehrere Lernplan-Punkte): Prozentwert je Punkt, siehe
  // lib/lernplan-store.ts aktualisiereAusFazit(). Heisst bewusst nicht
  // "punkte" -- das Feld ist schon die Klassenarbeits-Punktzahl belegt.
  punktePlan?: { pointId: string; prozent: number }[];
};

export type TutorModusDTO = "lernen" | "probe";
export type TutorMessageRoleDTO = "user" | "assistant" | "tool";

export type TutorConversationDTO = {
  id: string;
  // null = Simulation ueber mehrere Lernplan-Punkte, siehe assignmentId.
  topicId: string | null;
  subjectId: string;
  modus: TutorModusDTO;
  cardId: string | null;
  // Lernplan-Einheit dieser Session (probe oder simulation), fuer den
  // Fazit-Rueckschreib-Hook. null ausserhalb des Lernplans.
  itemId: string | null;
  // Nur bei Simulation gesetzt.
  assignmentId: string | null;
  checkliste: Checkliste | null;
  ergebnis: TutorErgebnis | null;
  kartenAngelegt: boolean;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
};

export type TutorMessageDTO = {
  id: string;
  conversationId: string;
  role: TutorMessageRoleDTO;
  content: string;
  toolName: string | null;
  toolArgs: unknown;
  toolResult: unknown;
  createdAt: string;
};
