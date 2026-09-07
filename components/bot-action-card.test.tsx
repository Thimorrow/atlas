import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionCard, type AssignmentActionResult } from "./bot-action-card";

describe("Bot action feedback", () => {
  it("shows why no cards were generated instead of a success heading", () => {
    const html = renderToStaticMarkup(<ActionCard tool="lernkarten_erzeugen" result={{ fach: "Mathe", subjectId: "s", anzahl: 0, karten: [], hinweis: "Kein lesbarer Text vorhanden.", seite: "/lernen/s" }} />);
    expect(html).toContain("Keine Lernkarten erzeugt");
    expect(html).toContain("Kein lesbarer Text vorhanden.");
  });

  it("keeps a missing due-date warning visible on the assignment card", () => {
    const result = { aufgabe: { id: "a", title: "Übung", subjectId: null, type: "homework" }, hinweisFaellig: "Kein Fälligkeitsdatum angegeben." } as AssignmentActionResult;
    const html = renderToStaticMarkup(<ActionCard tool="aufgabe_anlegen" result={result} />);
    expect(html).toContain("Kein Fälligkeitsdatum angegeben.");
  });
});
