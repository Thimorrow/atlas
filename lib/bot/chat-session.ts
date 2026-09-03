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
