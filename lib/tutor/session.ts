// Kern des Tutors: eine Modell-Runde nach der anderen (wie app/api/bot/route.ts),
// aber mit den Tutor-Widgets als Tools und eigener Persistenz in
// tutor_messages. Siehe TUTOR-SPEC.md "Kern" fuer den Ablauf.
//
// `deps` buendelt alle Store-/Modellzugriffe, damit session.test.ts alles ohne
// DB und ohne Netzwerk mocken kann.

import { streamChatWithFallback, type ChatMessage, type ChatToolCall } from "@/lib/bot/model";
import { noteFuerProzent } from "@/lib/tutor/note";
import { buildSystemPrompt, type TutorContextCard, type TutorContextInput } from "@/lib/tutor/prompt";
import {
  appendTutorMessage,
  getTutorConversation,
  listTutorMessages,
  setAufgabeStatus,
  setCheckliste,
  setErgebnis,
} from "@/lib/tutor/store";
import {
  parseAufgabeErgebnis,
  parseCheckliste,
  parseFazit,
  parseFrageAuswahl,
  tutorTools,
} from "@/lib/tutor/tools";
import type { Checkliste, TutorErgebnis, TutorMessageDTO } from "@/lib/tutor/types";
import { getCard, getTopic, subjectDetail } from "@/lib/study-store";
import { aktualisiereAusFazit, planLaden, punktMitBlaettern } from "@/lib/lernplan-store";
import { readSubjectFile } from "@/lib/bot/files";

const MAX_ROUNDS = 6;
const ROUND_TIMEOUT_MS = 110_000;
// Gesamtlaenge aller Arbeitsblaetter eines Punkts im Prompt, siehe SPEC.md
// "Tutor kennt die Blätter des Punkts".
const MAX_BLAETTER_CHARS = 15_000;

export type TutorEvent =
  | { type: "text"; delta: string }
  | { type: "widget"; messageId: string; frage: string; optionen: string[]; mehrfach: boolean }
  | { type: "checkliste"; checkliste: Checkliste }
  | { type: "fazit"; ergebnis: TutorErgebnis }
  | { type: "error"; text: string }
  | { type: "done"; conversationId: string };

export type TutorSessionDeps = {
  streamChat: typeof streamChatWithFallback;
  getTutorConversation: typeof getTutorConversation;
  listTutorMessages: typeof listTutorMessages;
  appendTutorMessage: typeof appendTutorMessage;
  setCheckliste: typeof setCheckliste;
  setAufgabeStatus: typeof setAufgabeStatus;
  setErgebnis: typeof setErgebnis;
  getTopic: typeof getTopic;
  subjectDetail: typeof subjectDetail;
  getCard: typeof getCard;
  // Lernplan-Anbindung (SPEC.md "Tutor kennt die Blätter des Punkts") --
  // optional, damit session.test.ts nur stubbt, was ein Test wirklich braucht.
  ladePunktMitBlaettern?: typeof punktMitBlaettern;
  ladePlan?: typeof planLaden;
  sicherheitAusFazit?: typeof aktualisiereAusFazit;
  readSubjectFile?: typeof readSubjectFile;
};

export const defaultDeps: TutorSessionDeps = {
  streamChat: streamChatWithFallback,
  getTutorConversation,
  listTutorMessages,
  appendTutorMessage,
  setCheckliste,
  setAufgabeStatus,
  setErgebnis,
  getTopic,
  subjectDetail,
  getCard,
  ladePunktMitBlaettern: punktMitBlaettern,
  ladePlan: planLaden,
  sicherheitAusFazit: aktualisiereAusFazit,
  readSubjectFile,
};

// --- Verlauf -> Modell-Nachrichten -------------------------------------------
//
// Jede gespeicherte Tool-Runde besteht aus zwei Zeilen: einer assistant-Zeile
// mit toolName/toolArgs (der Aufruf) und -- sobald bekannt -- einer
// tool-Zeile mit dem Ergebnis (siehe lib/tutor/store.ts). Bei frage_auswahl
// fehlt die zweite Zeile, bis submitWidgetAntwort() sie nachtraegt. Nutzt die
// Nachrichten-id direkt als tool_call_id, muss also nicht wie in
// lib/bot/history.ts synthetisch erfunden werden.
function toTutorModelMessages(history: TutorMessageDTO[], systemPrompt: string): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  let i = 0;
  while (i < history.length) {
    const m = history[i];

    if (m.role === "user") {
      if (m.content) messages.push({ role: "user", content: m.content });
      i++;
      continue;
    }

    if (m.role === "assistant" && m.toolName) {
      const callId = `msg_${m.id}`;
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: callId, type: "function", function: { name: m.toolName, arguments: JSON.stringify(m.toolArgs ?? {}) } },
        ],
      });
      i++;

      const next = history[i];
      if (next && next.role === "tool") {
        messages.push({
          role: "tool",
          tool_call_id: callId,
          name: m.toolName,
          content: JSON.stringify(next.toolResult),
        });
        i++;
      } else if (m.toolName === "frage_auswahl" && next && next.role === "user" && next.content) {
        // Client hat trotz offenem Widget getippt (z.B. skip/Beenden/Freitext,
        // bevor submitWidgetAntwort() nachziehen konnte): die user-Zeile steckt
        // inhaltlich im Tool-Ergebnis, nicht als eigene Modell-Nachricht --
        // sonst folgt auf einen tool_call kein tool_result und das Modell
        // bekommt eine ungueltige Nachrichtenfolge.
        messages.push({
          role: "tool",
          tool_call_id: callId,
          name: m.toolName,
          content: JSON.stringify({ auswahl: [], text: next.content }),
        });
        i++;
      }
      continue;
    }

    if (m.role === "assistant" && m.content) {
      messages.push({ role: "assistant", content: m.content });
      i++;
      continue;
    }

    // Verwaiste tool-Zeile ohne vorangehenden Aufruf (sollte nicht vorkommen) --
    // ueberspringen statt die Nachrichtenfolge zu zerstoeren.
    i++;
  }

  return messages;
}

function parseToolArgs(call: ChatToolCall): unknown {
  try {
    return call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    return {};
  }
}

function checklisteAus(input: { titel: string; aufgaben: { nr: number; text: string; schwierigkeit: number }[] }): Checkliste {
  return {
    titel: input.titel,
    aufgaben: input.aufgaben.map((a) => ({ nr: a.nr, text: a.text, schwierigkeit: a.schwierigkeit, status: "offen" as const })),
  };
}

export async function* runTutorTurn(
  conversationId: string,
  signal?: AbortSignal,
  deps: TutorSessionDeps = defaultDeps,
): AsyncGenerator<TutorEvent> {
  const conversation = await deps.getTutorConversation(conversationId);
  if (!conversation) {
    yield { type: "error", text: "Diese Tutor-Session gibt es nicht." };
    return;
  }

  // Simulation (SPEC.md "Tutor kennt die Blätter des Punkts"): keine
  // topicId, dafuer assignmentId -- Thema/Karten bleiben leer, stattdessen
  // alle Punkte des Plans im Kontext.
  const detail = await deps.subjectDetail(conversation.subjectId);
  if (!detail) {
    yield { type: "error", text: "Thema oder Fach nicht gefunden." };
    return;
  }

  let topicTitle: string | null = null;
  let summary: string | null = null;
  let cards: TutorContextCard[] = [];
  let entryCard: Awaited<ReturnType<typeof deps.getCard>> | undefined;
  const naechstePruefung: { title: string; tageBis: number } | null = detail.naechstePruefung
    ? { title: detail.naechstePruefung.title, tageBis: detail.naechstePruefung.tageBis }
    : null;

  if (conversation.topicId) {
    const topic = await deps.getTopic(conversation.topicId);
    if (!topic) {
      yield { type: "error", text: "Thema oder Fach nicht gefunden." };
      return;
    }
    topicTitle = topic.title;
    summary = topic.summary;
    cards = detail.cards
      .filter((c) => c.topicId === conversation.topicId)
      .map((c) => ({ question: c.question, answer: c.answer, box: c.box, kind: c.kind }));
    entryCard = conversation.cardId ? await deps.getCard(conversation.cardId) : undefined;
  }

  let simulation: TutorContextInput["simulation"] = null;
  if (conversation.assignmentId && deps.ladePlan) {
    try {
      const plan = await deps.ladePlan(conversation.assignmentId);
      if (plan) {
        simulation = { punkte: plan.punkte.map((p) => ({ pointId: p.id, titel: p.titel, sicherheit: p.sicherheit })) };
      }
    } catch (err) {
      console.warn("[tutor] Simulation: Plan konnte nicht geladen werden:", err);
    }
  }

  let blaetter: TutorContextInput["blaetter"] = null;
  if (conversation.itemId && deps.ladePunktMitBlaettern && deps.readSubjectFile) {
    try {
      const result = await deps.ladePunktMitBlaettern(conversation.itemId);
      if (result && result.punkt.blaetter.length > 0) {
        const fehlend: string[] = [];
        let text = "";
        for (const b of result.punkt.blaetter) {
          const file = await deps.readSubjectFile(b.id);
          if (!file || file.content.kind !== "text") {
            fehlend.push(b.name);
            console.warn(`[tutor] Blatt konnte nicht gelesen werden: ${b.name}`);
            continue;
          }
          text += (text ? "\n\n" : "") + `--- ${b.name} ---\n${file.content.text}`;
        }
        if (text || fehlend.length > 0) {
          const gekuerzt = text.length > MAX_BLAETTER_CHARS;
          blaetter = {
            text: gekuerzt ? text.slice(0, MAX_BLAETTER_CHARS) : text,
            seiten: result.punkt.seiten,
            gekuerzt,
            fehlend,
          };
        }
      }
    } catch (err) {
      console.warn("[tutor] Blätter konnten nicht geladen werden:", err);
    }
  }

  const system = buildSystemPrompt(conversation.modus, {
    subjectName: detail.subject.name,
    lernart: detail.subject.lernart,
    topicTitle,
    summary,
    cards,
    pruefung: naechstePruefung,
    card: entryCard ? { question: entryCard.question, answer: entryCard.answer } : null,
    blaetter,
    simulation,
  });

  const history = await deps.listTutorMessages(conversationId);
  const chatMessages = toTutorModelMessages(history, system);
  // Erster Turn einer neuen Session: es gibt noch keine Nachricht. Die API
  // verlangt mindestens eine, also ein nicht gespeicherter Startimpuls --
  // das Modell antwortet laut Prompt mit dem Wissensstand-Widget.
  if (chatMessages.length === 1) {
    chatMessages.push({ role: "user", content: "Los, starte die Session." });
  }

  // Aktueller Stand der Checkliste -- wird bei checkliste_erstellen und
  // aufgabe_ergebnis mitgefuehrt, damit fazit() im Modus probe fehlende
  // Punkte daraus berechnen kann, ohne die DB erneut zu lesen.
  let currentCheckliste: Checkliste | null = conversation.checkliste;

  let round = 0;
  while (round < MAX_ROUNDS) {
    if (signal?.aborted) return;
    round++;

    const roundController = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      roundController.abort();
    }, ROUND_TIMEOUT_MS);
    const onOuterAbort = () => roundController.abort();
    signal?.addEventListener("abort", onOuterAbort);

    let roundText = "";
    const toolCalls: ChatToolCall[] = [];

    try {
      for await (const event of deps.streamChat(chatMessages, tutorTools, roundController.signal)) {
        if (event.type === "text") {
          roundText += event.delta;
          yield { type: "text", delta: event.delta };
        } else if (event.type === "tool_calls") {
          toolCalls.push(...event.toolCalls);
        }
      }
    } catch (err) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
      if (signal?.aborted) return; // Client hat abgebrochen, kein Fehler-Event noetig.
      if (timedOut) {
        yield { type: "error", text: "Der Tutor hat zu lange nicht geantwortet. Bitte nochmal senden." };
        return;
      }
      yield { type: "error", text: err instanceof Error ? err.message : "Beim Tutor ist ein unbekannter Fehler aufgetreten." };
      return;
    }
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
    if (signal?.aborted) return;

    if (toolCalls.length === 0) {
      if (roundText) {
        await deps.appendTutorMessage(conversationId, { role: "assistant", content: roundText });
      }
      yield { type: "done", conversationId };
      return;
    }

    chatMessages.push({ role: "assistant", content: roundText.length > 0 ? roundText : null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      const args = parseToolArgs(call);
      const name = call.function.name;

      if (name === "frage_auswahl") {
        const parsed = parseFrageAuswahl(args);
        if (!parsed.ok) {
          await saveToolError(deps, conversationId, name, args, parsed.error);
          chatMessages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify({ error: parsed.error }) });
          continue;
        }

        const saved = await deps.appendTutorMessage(conversationId, {
          role: "assistant",
          content: "",
          toolName: name,
          toolArgs: args,
        });
        yield {
          type: "widget",
          messageId: saved.id,
          frage: parsed.value.frage,
          optionen: parsed.value.optionen,
          mehrfach: parsed.value.mehrfach,
        };
        yield { type: "done", conversationId };
        return;
      }

      if (name === "checkliste_erstellen") {
        const parsed = parseCheckliste(args);
        if (!parsed.ok) {
          await saveToolError(deps, conversationId, name, args, parsed.error);
          chatMessages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify({ error: parsed.error }) });
          continue;
        }

        const checkliste = checklisteAus(parsed.value);
        const updated = await deps.setCheckliste(conversationId, checkliste);
        currentCheckliste = updated?.checkliste ?? checkliste;

        await saveToolCallAndResult(deps, conversationId, name, args, { ok: true });
        chatMessages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify({ ok: true }) });
        yield { type: "checkliste", checkliste: currentCheckliste };
        continue;
      }

      if (name === "aufgabe_ergebnis") {
        const parsed = parseAufgabeErgebnis(args);
        if (!parsed.ok) {
          await saveToolError(deps, conversationId, name, args, parsed.error);
          chatMessages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify({ error: parsed.error }) });
          continue;
        }

        const updated = await deps.setAufgabeStatus(conversationId, parsed.value.nr, parsed.value.status, parsed.value.punkte);
        if (!updated) {
          const error = "Unbekannte Aufgabennummer.";
          await saveToolError(deps, conversationId, name, args, error);
          chatMessages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify({ error }) });
          continue;
        }

        currentCheckliste = updated;
        const offen = updated.aufgaben.filter((a) => a.status === "offen").length;
        const result = { ok: true, offen };
        await saveToolCallAndResult(deps, conversationId, name, args, result);
        chatMessages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify(result) });
        yield { type: "checkliste", checkliste: currentCheckliste };
        continue;
      }

      if (name === "fazit") {
        const parsed = parseFazit(args);
        if (!parsed.ok) {
          await saveToolError(deps, conversationId, name, args, parsed.error);
          chatMessages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify({ error: parsed.error }) });
          continue;
        }

        let { punkte, gesamt } = parsed.value;
        let prozent: number | undefined;
        let note: number | undefined;

        if (conversation.modus === "probe") {
          if (conversation.topicId === null && conversation.assignmentId) {
            // Simulation ueber mehrere Lernplan-Punkte: keine Checkliste, also
            // kein Punkte/Gesamt-Bruch -- Prozent kommt aus dem Durchschnitt
            // der punktePlan-Eintraege.
            punkte = undefined;
            gesamt = undefined;
            const planEintraege = parsed.value.punktePlan ?? [];
            if (planEintraege.length > 0) {
              prozent = Math.round(planEintraege.reduce((sum, p) => sum + p.prozent, 0) / planEintraege.length);
              note = noteFuerProzent(prozent);
            }
          } else {
            if (punkte === undefined || gesamt === undefined) {
              const aufgaben = currentCheckliste?.aufgaben ?? [];
              punkte = aufgaben.filter((a) => a.status === "richtig").reduce((sum, a) => sum + a.schwierigkeit, 0);
              gesamt = aufgaben.reduce((sum, a) => sum + a.schwierigkeit, 0);
            }
            prozent = gesamt > 0 ? Math.round((punkte / gesamt) * 100) : 0;
            note = noteFuerProzent(prozent);
          }
        }

        const ergebnis: TutorErgebnis = {
          gutWar: parsed.value.gutWar,
          schwach: parsed.value.schwach,
          neueKarten: parsed.value.neueKarten,
          ...(punkte !== undefined ? { punkte } : {}),
          ...(gesamt !== undefined ? { gesamt } : {}),
          ...(prozent !== undefined ? { prozent } : {}),
          ...(note !== undefined ? { note } : {}),
          ...(parsed.value.punktePlan ? { punktePlan: parsed.value.punktePlan } : {}),
        };

        await deps.setErgebnis(conversationId, ergebnis);
        await saveToolCallAndResult(deps, conversationId, name, args, { ok: true });
        chatMessages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify({ ok: true }) });

        // Sicherheit schreibt sich zurueck (SPEC.md), try/catch-isoliert --
        // Fehler duerfen die Tutor-Antwort nicht kaputt machen.
        if (conversation.itemId && conversation.modus === "probe" && deps.sicherheitAusFazit) {
          try {
            await deps.sicherheitAusFazit(conversation.itemId, ergebnis.prozent ?? null, ergebnis.punktePlan);
          } catch (err) {
            console.warn("[lernplan] Fazit-Hook:", err);
          }
        }

        yield { type: "fazit", ergebnis };
        continue;
      }

      // Unbekanntes Werkzeug -- dem Modell melden statt abzustuerzen.
      const error = "Unbekanntes Werkzeug.";
      await saveToolError(deps, conversationId, name, args, error);
      chatMessages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify({ error }) });
    }
  }

  yield { type: "done", conversationId };
}

// Speichert den Aufruf (assistant-Zeile) und im selben Zug das Ergebnis
// (tool-Zeile) -- fuer alle Werkzeuge ausser frage_auswahl, deren Ergebnis
// erst mit dem Klick auf das Widget kommt.
async function saveToolCallAndResult(
  deps: TutorSessionDeps,
  conversationId: string,
  name: string,
  args: unknown,
  result: unknown,
): Promise<void> {
  await deps.appendTutorMessage(conversationId, { role: "assistant", content: "", toolName: name, toolArgs: args });
  await deps.appendTutorMessage(conversationId, { role: "tool", content: JSON.stringify(result), toolName: name, toolResult: result });
}

async function saveToolError(
  deps: TutorSessionDeps,
  conversationId: string,
  name: string,
  args: unknown,
  error: string,
): Promise<void> {
  await saveToolCallAndResult(deps, conversationId, name, args, { error });
}

// --- Widget-Antwort -----------------------------------------------------------

export type SubmitWidgetAntwortDeps = {
  listTutorMessages: typeof listTutorMessages;
  appendTutorMessage: typeof appendTutorMessage;
};

const defaultSubmitDeps: SubmitWidgetAntwortDeps = { listTutorMessages, appendTutorMessage };

// Haengt die Antwort auf ein frage_auswahl-Widget als tool-Nachricht an.
// Wirft, wenn die messageId kein unbeantwortetes Auswahl-Widget dieser
// Konversation ist -- die Route macht daraus eine 400.
export async function submitWidgetAntwort(
  conversationId: string,
  messageId: string,
  auswahl: string[],
  text?: string,
  deps: SubmitWidgetAntwortDeps = defaultSubmitDeps,
): Promise<void> {
  const history = await deps.listTutorMessages(conversationId);
  const index = history.findIndex((m) => m.id === messageId);
  if (index === -1) throw new Error("Diese Nachricht gibt es nicht.");

  const message = history[index];
  if (message.role !== "assistant" || message.toolName !== "frage_auswahl") {
    throw new Error("Das ist kein Auswahl-Widget.");
  }

  const next = history[index + 1];
  if (next && next.role === "tool") {
    throw new Error("Diese Frage wurde schon beantwortet.");
  }

  const toolResult = auswahl.length > 0 ? { auswahl } : { auswahl: [], text: text ?? "" };
  await deps.appendTutorMessage(conversationId, {
    role: "tool",
    content: JSON.stringify(toolResult),
    toolName: "frage_auswahl",
    toolResult,
  });
}
