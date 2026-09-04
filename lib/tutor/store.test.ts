import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subjects, studyTopics } from "@/lib/db/schema";
import {
  appendTutorMessage,
  createTutorConversation,
  deleteTutorConversation,
  getTutorConversation,
  listTutorConversations,
  listTutorMessages,
  setAufgabeStatus,
  setCheckliste,
  setErgebnis,
} from "@/lib/tutor/store";
import type { Checkliste, TutorErgebnis } from "@/lib/tutor/types";

const mitDb = Boolean(process.env.DATABASE_URL);

const SUBJECT_NAME = "TST-Tutor";

async function cleanup() {
  await db.delete(subjects).where(eq(subjects.name, SUBJECT_NAME)); // cascade raeumt study_topics/tutor_* mit
}

describe.skipIf(!mitDb)("tutor-store (Integration, Neon)", () => {
  let subjectId: string;
  let topicId: string;

  beforeAll(async () => {
    await cleanup();
    const [subject] = await db.insert(subjects).values({ name: SUBJECT_NAME, untisSubject: null }).returning();
    subjectId = subject.id;
    const [topic] = await db
      .insert(studyTopics)
      .values({ subjectId, title: "TST-Thema" })
      .returning();
    topicId = topic.id;
  });

  afterAll(cleanup);

  it("createTutorConversation legt eine Session im Modus lernen an", async () => {
    const conversation = await createTutorConversation({ topicId, subjectId, modus: "lernen" });
    expect(conversation.topicId).toBe(topicId);
    expect(conversation.modus).toBe("lernen");
    expect(conversation.checkliste).toBeNull();
    expect(conversation.ergebnis).toBeNull();
    expect(conversation.kartenAngelegt).toBe(false);
    expect(conversation.endedAt).toBeNull();
  });

  it("getTutorConversation und listTutorConversations (neueste zuerst)", async () => {
    const a = await createTutorConversation({ topicId, subjectId, modus: "lernen" });
    const b = await createTutorConversation({ topicId, subjectId, modus: "probe" });

    expect((await getTutorConversation(a.id))?.id).toBe(a.id);

    const list = await listTutorConversations(topicId);
    expect(list[0].id).toBe(b.id);
    expect(list.some((c) => c.id === a.id)).toBe(true);
  });

  it("appendTutorMessage hängt eine Nachricht an und aktualisiert updatedAt", async () => {
    const conversation = await createTutorConversation({ topicId, subjectId, modus: "lernen" });
    const message = await appendTutorMessage(conversation.id, { role: "user", content: "Hallo" });
    expect(message.conversationId).toBe(conversation.id);
    expect(message.role).toBe("user");
    expect(message.content).toBe("Hallo");

    const messages = await listTutorMessages(conversation.id);
    expect(messages).toHaveLength(1);

    const updated = await getTutorConversation(conversation.id);
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(conversation.updatedAt).getTime());
  });

  it("setCheckliste und setAufgabeStatus", async () => {
    const conversation = await createTutorConversation({ topicId, subjectId, modus: "lernen" });
    const checkliste: Checkliste = {
      titel: "Test-Checkliste",
      aufgaben: [
        { nr: 1, text: "Aufgabe 1", schwierigkeit: 1, status: "offen" },
        { nr: 2, text: "Aufgabe 2", schwierigkeit: 2, status: "offen" },
      ],
    };
    await setCheckliste(conversation.id, checkliste);
    expect((await getTutorConversation(conversation.id))?.checkliste).toEqual(checkliste);

    const updated = await setAufgabeStatus(conversation.id, 1, "richtig", 1);
    expect(updated?.aufgaben.find((a) => a.nr === 1)?.status).toBe("richtig");
    expect(updated?.aufgaben.find((a) => a.nr === 1)?.punkte).toBe(1);
    expect(updated?.aufgaben.find((a) => a.nr === 2)?.status).toBe("offen");

    expect(await setAufgabeStatus(conversation.id, 99, "richtig")).toBeNull();
  });

  it("setErgebnis setzt ergebnis und endedAt", async () => {
    const conversation = await createTutorConversation({ topicId, subjectId, modus: "probe" });
    const ergebnis: TutorErgebnis = {
      gutWar: ["Grundlagen"],
      schwach: ["Textaufgaben"],
      neueKarten: [{ question: "Frage?", answer: "Antwort" }],
      punkte: 8,
      gesamt: 10,
      prozent: 80,
      note: 2,
    };
    const updated = await setErgebnis(conversation.id, ergebnis);
    expect(updated?.ergebnis).toEqual(ergebnis);
    expect(updated?.endedAt).not.toBeNull();
  });

  it("deleteTutorConversation löscht die Session", async () => {
    const conversation = await createTutorConversation({ topicId, subjectId, modus: "lernen" });
    await deleteTutorConversation(conversation.id);
    expect(await getTutorConversation(conversation.id)).toBeUndefined();
  });
});
