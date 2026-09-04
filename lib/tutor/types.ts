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
};

export type TutorModusDTO = "lernen" | "probe";
export type TutorMessageRoleDTO = "user" | "assistant" | "tool";

export type TutorConversationDTO = {
  id: string;
  topicId: string;
  subjectId: string;
  modus: TutorModusDTO;
  cardId: string | null;
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
