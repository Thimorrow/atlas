import { expect, test, type Page } from "@playwright/test";
import { anmelden, keinUeberlauf } from "./hilfen";

// Hefte: Stift, Marker, Formen, Rueckgaengig/Wiederholen, Speichern und
// Nachladen, Breite auf dem Handy.
//
// Alle Serverantworten sind hier Fixtures (page.route), es wird also nichts an
// echten Heftseiten gespeichert. Uebersetzt aus
// scripts/notebook-drawing-e2e.mjs -- dieselben Schritte, nur so, dass ein
// Fehlschlag den Test rot macht statt eine Zeile auf die Konsole zu schreiben.

type Strich = { kind: string; points: unknown[] };
type Gespeichert = {
  id: string;
  subjectId: string;
  title: string;
  paper: string;
  content: { strokes: Strich[]; blocks: unknown[] };
  createdAt: string;
  updatedAt: string;
};

const SEITE: Gespeichert = {
  id: "11111111-1111-4111-8111-111111111111",
  subjectId: "22222222-2222-4222-8222-222222222222",
  title: "Zeichenprobe",
  paper: "grid",
  content: { strokes: [], blocks: [] },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function zeichne(page: Page, canvas: ReturnType<Page["getByLabel"]>, werkzeug: string | null, y: number) {
  if (werkzeug) await page.getByRole("button", { name: werkzeug, exact: true }).click();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Die Zeichenflaeche hat keine Ausdehnung.");
  const x = box.x + box.width * 0.2;
  const yy = box.y + y;
  await page.mouse.move(x, yy);
  await page.mouse.down();
  await page.mouse.move(x + 100, yy + 50, { steps: 12 });
  // Eigener pointerup-Punkt: so faellt auf, wenn ein Strich am Ende abgeschnitten
  // wird und der letzte Punkt fehlt.
  await canvas.dispatchEvent("pointerup", {
    pointerId: 1,
    pointerType: "mouse",
    clientX: x + 110,
    clientY: yy + 55,
    pressure: 0,
  });
  await page.mouse.up();
}

test("zeichnen, rueckgaengig, nachladen und Handybreite", async ({ page }) => {
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  page.setDefaultTimeout(12_000);

  await anmelden(page);

  let gespeichert: Gespeichert = SEITE;
  await page.route("**/api/subjects", (r) => r.fulfill({ json: { subjects: [{ id: SEITE.subjectId, name: "Mathematik" }] } }));
  await page.route("**/api/notebooks?*", (r) => r.fulfill({ json: { pages: [gespeichert], chapters: [] } }));
  await page.route("**/api/notebooks/*", async (r) => {
    if (r.request().method() === "PATCH") {
      gespeichert = { ...gespeichert, ...r.request().postDataJSON(), updatedAt: new Date().toISOString() };
    }
    await r.fulfill({ json: { page: gespeichert } });
  });

  await page.goto("/hefte");
  const canvas = page.getByLabel("Zeichenfläche.", { exact: false });
  await canvas.waitFor();

  await test.step("Stift, Textmarker und Linie zeichnen", async () => {
    await zeichne(page, canvas, "Stift", 60);
    await zeichne(page, canvas, "Textmarker", 130);
    await page.getByRole("button", { name: "Einfügen", exact: true }).click();
    await page.getByRole("menuitem", { name: "Linie", exact: true }).click();
    await zeichne(page, canvas, null, 210);
    // Der lokale Entwurf kennt die drei Striche -- das ist die Zusage, dass
    // nichts verloren geht, wenn der Server gerade nicht antwortet.
    await page.waitForFunction(() =>
      Object.keys(localStorage).some((k) => {
        try {
          return JSON.parse(localStorage[k]).page?.content?.strokes?.length === 3;
        } catch {
          return false;
        }
      }),
    );
  });

  await test.step("Rueckgaengig und Wiederholen", async () => {
    await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
    await page.getByRole("button", { name: "Wiederholen", exact: true }).click();
    // Warten, bis das Speichern durch ist: danach steht der Stand fest.
    await page.waitForTimeout(1100);
    expect(gespeichert.content.strokes.map((s) => s.kind)).toEqual(["ink", "marker", "shape"]);
    // Eine Linie hat genau zwei Punkte -- nicht drei und nicht einen.
    expect(gespeichert.content.strokes[2].points).toHaveLength(2);
  });

  await test.step("Nach dem Nachladen ein Rechteck zeichnen", async () => {
    await page.reload();
    await canvas.waitFor();
    await page.getByRole("button", { name: "Einfügen", exact: true }).click();
    await page.getByRole("menuitem", { name: "Rechteck", exact: true }).click();
    await zeichne(page, canvas, null, 300);
    await page.waitForTimeout(1100);
    // Vier Ecken plus Schlusspunkt auf der ersten -- so wird das Rechteck
    // geschlossen.
    expect(gespeichert.content.strokes.at(-1)?.points).toHaveLength(5);
  });

  await test.step("Auf dem Handy laeuft nichts ueber", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Textmarker", exact: true }).click();
    await keinUeberlauf(page);
  });

  expect(fehler, "Ungefangene Fehler im Browser").toEqual([]);
});
