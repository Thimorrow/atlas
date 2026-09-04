// Dünne Schicht für die Chat-Sitzung: welcher Gesprächs-Faden ist gerade
// aktiv, und wie wird ein neuer angefordert. Bewusst ohne schwere Imports,
// damit der Launcher (components/bot-launcher.tsx) das Ereignis feuern kann,
// ohne den ganzen Chat-Code ins Erstladen zu ziehen -- BotChat hört zu und
// macht die Arbeit.
export const BOT_STORAGE_KEY = "atlas:bot-conversation-id";
export const BOT_NEW_EVENT = "atlas:bot-new";

export function loadStoredConversationId(): string | null {
  try {
    return localStorage.getItem(BOT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveStoredConversationId(id: string | null) {
  try {
    if (id) localStorage.setItem(BOT_STORAGE_KEY, id);
    else localStorage.removeItem(BOT_STORAGE_KEY);
  } catch {
    // Privater Modus o. ä. -- der Chat läuft dann einfach ohne Persistenz.
  }
}

export function requestBotNewChat() {
  window.dispatchEvent(new Event(BOT_NEW_EVENT));
}

// --- Entwurf --------------------------------------------------------------
// Der getippte, noch nicht gesendete Text. Wandert bei jeder Aenderung ins
// localStorage, damit er Schliessen, Reload und Navigation ueberlebt, und
// wird beim Absenden geleert.
export const BOT_DRAFT_KEY = "atlas:bot-draft";

export function loadStoredDraft(): string {
  try {
    return localStorage.getItem(BOT_DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveStoredDraft(value: string) {
  try {
    if (value) localStorage.setItem(BOT_DRAFT_KEY, value);
    else localStorage.removeItem(BOT_DRAFT_KEY);
  } catch {
    // Privater Modus o. ae. -- dann gibt es halt keinen Entwurfsschutz.
  }
}

// --- Sofort-Cache ----------------------------------------------------------
// BotChat wird beim Schliessen des Panels ausgehaengt und beim Oeffnen neu
// gemountet. Ohne Cache hiesse das: Verlauf wird neu geladen (Spinner),
// getippter Text ist weg. Darum spiegelt BotChat seinen Stand (Begruessung,
// Gespraechs-Id, Zuege) in diesen fluechtigen Speicher -- Wiedereroeffnen
// liest ihn synchron und zeigt sofort, die Auffrischung laeuft leise im
// Hintergrund. Absichtlich nur im Speicher, nicht in localStorage: nach
// einem Reload kommt der Verlauf ohnehin vom Server, der Entwurf separat
// von oben.
export type ChatSnapshot<TInfo = unknown, TTurn = unknown> = {
  info: TInfo | null;
  conversationId: string | null;
  turns: TTurn[];
  savedAt: number;
};

let snapshot: ChatSnapshot | null = null;

export function getChatSnapshot<TInfo = unknown, TTurn = unknown>(): ChatSnapshot<
  TInfo,
  TTurn
> | null {
  return snapshot as ChatSnapshot<TInfo, TTurn> | null;
}

export function setChatSnapshot<TInfo = unknown, TTurn = unknown>(
  next: ChatSnapshot<TInfo, TTurn>,
) {
  snapshot = next as ChatSnapshot;
}

export function clearChatSnapshot() {
  snapshot = null;
}
