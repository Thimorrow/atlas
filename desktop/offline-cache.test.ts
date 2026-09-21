import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { offlineHtml, zustandAusHome, zustandLesen, zustandSchreiben, iconDatenUrl } = require("./offline-cache.cjs");

// Der Stand, den GET /api/home liefert -- gekuerzt auf die Felder, die die
// Offline-Seite benutzt. Aufbau siehe app/api/home/route.ts und
// lib/calendar-expand.ts.
function home(besonderheiten: Record<string, unknown> = {}) {
  return {
    week: {
      view: "week",
      start: "2026-09-21",
      end: "2026-09-27",
      days: [
        { date: "2026-09-21", weekday: 1, events: [] },
        {
          date: "2026-09-22",
          weekday: 2,
          events: [
            {
              date: "2026-09-22",
              startTime: "07:55",
              endTime: "09:30",
              title: "Mathematik",
              room: "A203",
              status: "regular",
            },
            {
              date: "2026-09-22",
              startTime: "09:50",
              endTime: "11:25",
              title: "Deutsch",
              room: null,
              status: "cancelled",
            },
          ],
        },
      ],
    },
    assignments: [
      { id: "a1", title: "Vokabeln Unit 3", subjectName: "Englisch", dueDate: "2026-09-25", type: "homework" },
      { id: "a2", title: "Referat halten", subjectName: "Geschichte", dueDate: "2026-09-22", type: "presentation" },
      { id: "a3", title: "Ohne Datum", subjectName: null, dueDate: null, type: "other" },
      { id: "a4", title: "Schon erledigt", subjectName: "Sport", dueDate: "2026-09-21", type: "homework", completedAt: "2026-09-21T10:00:00.000Z" },
    ],
    subjects: [],
    sync: { lastSyncAt: "2026-09-21T05:00:00.000Z" },
    ...besonderheiten,
  };
}

const tagBerlin = new Date("2026-09-22T06:30:00.000Z"); // 08:30 deutscher Zeit

describe("Offline-Stand aus der Serverantwort", () => {
  it("nimmt den Tag, an dem der Abruf passiert ist", () => {
    const stand = zustandAusHome(home(), tagBerlin);
    expect(stand.tag).toBe("2026-09-22");
    expect(stand.tagIstHeute).toBe(true);
    expect(stand.stunden.map((s: { titel: string }) => s.titel)).toEqual(["Mathematik", "Deutsch"]);
    expect(stand.stunden[0]).toMatchObject({ von: "07:55", bis: "09:30", raum: "A203", hinweis: null });
  });

  it("benennt eine Vertretung und einen Ausfall", () => {
    const stand = zustandAusHome(home(), tagBerlin);
    expect(stand.stunden[1].hinweis).toBe("entfällt");
  });

  it("nimmt nur Offenes, nach Faelligkeit sortiert, Aufgaben ohne Datum zuletzt", () => {
    const stand = zustandAusHome(home(), tagBerlin);
    expect(stand.aufgaben.map((a: { titel: string }) => a.titel)).toEqual([
      "Referat halten",
      "Vokabeln Unit 3",
      "Ohne Datum",
    ]);
  });

  it("nimmt den ersten Tag mit Unterricht, wenn der Abruftag nicht in der Woche liegt", () => {
    // Sonntag: in der Woche gibt es fuer diesen Tag nichts, also der erste Tag
    // mit Unterricht -- und der Stand ist ausdruecklich nicht \"heute\".
    const stand = zustandAusHome(home(), new Date("2026-09-27T08:00:00.000Z"));
    expect(stand.tag).toBe("2026-09-22");
    expect(stand.tagIstHeute).toBe(false);
  });

  it("haelt eine kaputte Antwort aus, statt zu werfen", () => {
    const stand = zustandAusHome({ week: null, assignments: "unsinn" }, tagBerlin);
    expect(stand.stunden).toEqual([]);
    expect(stand.aufgaben).toEqual([]);
  });
});

describe("Offline-Seite", () => {
  it("zeigt den Stand mit Datum und Uhrzeit -- veraltete Daten duerfen nicht wie aktuelle aussehen", () => {
    const html = offlineHtml(zustandAusHome(home(), tagBerlin), { jetzt: tagBerlin });
    expect(html).toContain("Letzter Stand: 22.09.2026, 08:30");
    expect(html).toContain("Du bist offline.");
    // Bewusst KEIN \"Heute\" oder \"jetzt\", sondern der Stand.
    expect(html).not.toContain(">Heute<");
  });

  it("escaped alles, was aus der Datenbank kommt", () => {
    const boese = home({
      assignments: [
        { id: "x", title: "<script>alert(1)</script>", subjectName: "Deutsch & \"Kunst\"", dueDate: "2026-09-22" },
      ],
    });
    const html = offlineHtml(zustandAusHome(boese, tagBerlin), { jetzt: tagBerlin });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Deutsch &amp; &quot;Kunst&quot;");
  });

  it("nennt ein ueberfaelliges Datum auch so", () => {
    const html = offlineHtml(zustandAusHome(home(), tagBerlin), { jetzt: tagBerlin });
    expect(html).toContain("heute fällig"); // Referat am 22.09.
    expect(html).toContain("fällig Freitag, 25.09."); // Vokabeln am 25.09.
  });

  it("faellt ohne Stand auf den Hinweis zurueck", () => {
    const html = offlineHtml(null, { jetzt: tagBerlin });
    expect(html).toContain("Prüfe deine Internetverbindung");
    expect(html).not.toContain("Letzter Stand");
    // Der Weg zurueck muss auch hier stehen.
    expect(html).toContain("Erneut versuchen");
  });

  it("laedt kein Skript und keine fremde Quelle nach", () => {
    const html = offlineHtml(zustandAusHome(home(), tagBerlin), { jetzt: tagBerlin });
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script/i);
  });

  it("haelt die eigene Angabe fuer ein fehlendes Symbol kurz", () => {
    // Kein Absturz, wenn icon.png fehlt -- dann eben ein leeres Bild.
    expect(iconDatenUrl("/gibt/es/nicht.png")).toMatch(/^data:image\//);
  });
});

describe("Stand auf der Platte", () => {
  it("liest zurueck, was geschrieben wurde", () => {
    const ordner = mkdtempSync(path.join(tmpdir(), "atlas-offline-"));
    const datei = path.join(ordner, "atlas-offline.json");
    const stand = zustandAusHome(home(), tagBerlin);
    zustandSchreiben(datei, stand);
    expect(zustandLesen(datei)).toEqual(stand);
  });

  it("haelt eine fehlende oder kaputte Datei fuer den Normalfall", () => {
    const ordner = mkdtempSync(path.join(tmpdir(), "atlas-offline-"));
    expect(zustandLesen(path.join(ordner, "gibt-es-nicht.json"))).toBeNull();
    const kaputt = path.join(ordner, "kaputt.json");
    writeFileSync(kaputt, "{kein json");
    expect(zustandLesen(kaputt)).toBeNull();
    // Eine Datei aus einer aelteren App-Version wird nicht interpretiert.
    const alt = path.join(ordner, "alt.json");
    writeFileSync(alt, JSON.stringify({ version: 0, stunden: [], aufgaben: [] }));
    expect(zustandLesen(alt)).toBeNull();
  });
});
