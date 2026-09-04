import { describe, expect, it } from "vitest";
import { lehrplanAlsMarkdown } from "./rendern";
import { LEHRPLAN_NRW_G9_KLASSE_10, type LehrplanFach } from "./nrw-g9-klasse-10";
import { renderMarkdown } from "@/lib/markdown";

// Reiner Texttest, kein DB-Zugriff.

const beispiel: LehrplanFach = {
  fach: "Testfach",
  aliase: ["TF"],
  inhaltsfelder: [
    { titel: "Erstes Feld", schwerpunkte: ["Ein Schwerpunkt", "Noch einer"] },
    { titel: "Zweites Feld", schwerpunkte: ["Etwas anderes"] },
  ],
  quelle: "https://example.org/lehrplan.pdf",
};

describe("lehrplanAlsMarkdown", () => {
  it("macht aus jedem Inhaltsfeld eine Ueberschrift mit Liste", () => {
    const md = lehrplanAlsMarkdown(beispiel);
    expect(md).toContain("## Erstes Feld");
    expect(md).toContain("- Ein Schwerpunkt");
    expect(md).toContain("- Noch einer");
    expect(md).toContain("## Zweites Feld");
  });

  it("haengt die Quelle ans Ende", () => {
    const md = lehrplanAlsMarkdown(beispiel);
    expect(md.trimEnd().endsWith("Quelle: https://example.org/lehrplan.pdf")).toBe(true);
  });

  it("weist sichtbar auf einen unsicheren Eintrag hin", () => {
    const md = lehrplanAlsMarkdown({ ...beispiel, unsicher: true });
    expect(md).toContain("Hinweis:");
    expect(lehrplanAlsMarkdown(beispiel)).not.toContain("Hinweis:");
  });

  it("laesst sich vom Markdown-Renderer als Ueberschrift, Liste und Link darstellen", () => {
    const html = renderMarkdown(lehrplanAlsMarkdown(beispiel));
    expect(html).toContain("<h2>Erstes Feld</h2>");
    expect(html).toContain("<li>Ein Schwerpunkt</li>");
    expect(html).toContain('href="https://example.org/lehrplan.pdf"');
  });

  it("erzeugt fuer jedes Fach der Vorlage einen nicht leeren Text", () => {
    for (const fach of LEHRPLAN_NRW_G9_KLASSE_10) {
      const md = lehrplanAlsMarkdown(fach);
      expect(md.trim().length, `leerer Lehrplan-Text: ${fach.fach}`).toBeGreaterThan(0);
      expect(md, `Quelle fehlt: ${fach.fach}`).toContain(fach.quelle);
    }
  });
});
