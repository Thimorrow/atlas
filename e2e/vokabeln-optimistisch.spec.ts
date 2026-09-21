import { expect, test, type Page, type Route } from "@playwright/test";
import { anmelden } from "./hilfen";

// Vokabeln: der Kartenwechsel darf nicht auf die Serverantwort warten.
//
// Uebersetzt aus scripts/vokabeln-optimistic-e2e.mjs. Der Kern ist ein
// kontrolliertes Netz: die Bewertung wird abgefangen und erst dann beantwortet,
// wenn der Test es sagt. Damit laesst sich pruefen, was sonst nur mit Glueck
// oder gar nicht auffaellt -- dass die naechste Karte schon steht, waehrend die
// vorige Antwort noch unterwegs ist, und dass Antworten in anderer Reihenfolge
// trotzdem zur richtigen Box fuehren.
//
// Echte Vokabeln bleiben unberuehrt: Ladedaten und Bewertungen sind Fixtures.

type Karte = {
  id: string;
  sprache: string;
  abschnitt: string;
  wort: string;
  deutsch: string;
  box: number;
  revision: number;
};

// Frisch je Testlauf gebaut, nicht als Modulzustand: die Boxen werden im Test
// veraendert, und ein Wiederholungslauf (CI) wuerde sonst auf dem Stand des
// vorigen Versuchs starten.
function baueKarten(): Karte[] {
  return ["amicus", "urbs", "laudare"].map((wort, i) => ({
  id: `${i + 1}1111111-1111-4111-8111-111111111111`,
  sprache: "latein",
  abschnitt: "Test",
  wort,
  deutsch: ["Freund", "Stadt", "loben"][i],
    box: 1,
    revision: 0,
  }));
}

test("Kartenwechsel, Fehler und Reihenfolge", async ({ page }) => {
  const KARTEN = baueKarten();
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await anmelden(page);

  const offen: { body: { id: string; richtig: boolean; revision: number }; route: Route; aufloesen: () => void }[] = [];

  await page.route("**/api/vokabeln", (route) => route.fulfill({ json: { vokabeln: KARTEN } }));
  await page.route("**/api/vokabeln/bewerten", async (route) => {
    const body = route.request().postDataJSON();
    await new Promise<void>((aufloesen) => offen.push({ body, route, aufloesen }));
  });

  // Eine Bewertung beantworten. ok=false spielt den echten Fehlerfall: der
  // Server antwortet 503.
  async function beantworten(index: number, ok = true) {
    const { body, route, aufloesen } = offen[index];
    if (ok) {
      const karte = KARTEN.find((k) => k.id === body.id)!;
      // Die Revision muss genau die sein, die der Client kennt -- sonst haette
      // er gegen einen veralteten Stand geschrieben.
      expect(body.revision, `Revision von ${karte.wort}`).toBe(karte.revision);
      karte.box = body.richtig ? Math.min(6, karte.box + 1) : 1;
      karte.revision++;
      await route.fulfill({ json: { vokabel: karte } });
    } else {
      await route.fulfill({ status: 503, json: { error: "Test: Speichern fehlgeschlagen" } });
    }
    aufloesen();
  }

  async function bewerten(page: Page, richtig: boolean) {
    await page.getByRole("button", { name: "Umdrehen", exact: true }).click();
    await page.getByRole("button", { name: richtig ? "Richtig" : "Falsch", exact: true }).click();
  }

  try {
    await page.goto("/lernen/vokabeln");
    const lektion = page.getByRole("button", { name: "Lektion Test öffnen", exact: true });
    await lektion.waitFor();
    // Die Lektionszeile ist ein Knopf, enthaelt aber keine weiteren Knoepfe --
    // sonst verschachtelt sich die Bedienung fuer Tastatur und Screenreader.
    await expect(lektion.locator("button")).toHaveCount(0);
    await lektion.click();
    // Der alte Skript-Stand suchte hier "3 Vokabeln lernen" und spaeter "Eine
    // Runde weiter." -- beide Beschriftungen gibt es in der Oberflaeche nicht
    // mehr. Genau das ist der Unterschied zwischen einem Skript, das niemand
    // aufruft, und einem Test, der laeuft: die Drift faellt auf.
    await page.getByRole("button", { name: "Lernen", exact: true }).click();

    await test.step("die naechste Karte steht vor der ersten Serverantwort", async () => {
      await bewerten(page, true);
      await page.getByRole("button", { name: /^Vokabelkarte: urbs/ }).waitFor({ timeout: 1200 });
      expect(offen).toHaveLength(1);
    });

    await test.step("mehrere Bewertungen gleichzeitig im Hintergrund", async () => {
      await bewerten(page, true);
      await page.getByRole("button", { name: /^Vokabelkarte: laudare/ }).waitFor({ timeout: 1200 });
      expect(offen).toHaveLength(2);
    });

    await test.step("spaeter Fehler: Hinweis, andere Karten bleiben bedienbar, gezieltes Wiederholen", async () => {
      await beantworten(1, false);
      await page
        .locator('[role="alert"][aria-live="assertive"]')
        .getByText("Test: Speichern fehlgeschlagen", { exact: true })
        .waitFor();
      await expect(page.getByRole("button", { name: /^Vokabelkarte: laudare/ })).toBeEnabled();

      await bewerten(page, false);
      await page.getByRole("heading", { name: "Runde abgeschlossen" }).waitFor({ timeout: 1200 });
      // Solange noch etwas offen ist, darf "Noch eine Runde" nicht gehen.
      await expect(page.getByRole("button", { name: "Noch eine Runde" })).toBeDisabled();

      await beantworten(2);
      await beantworten(0);
      const wiederholen = page.getByRole("button", { name: "Nicht gespeicherte Vokabeln wiederholen" });
      await wiederholen.waitFor();
      await wiederholen.click();
      await page.getByRole("button", { name: /^Vokabelkarte: urbs/ }).waitFor();
      // Die Karte, die durchkam, taucht dabei nicht wieder auf.
      await expect(page.getByRole("button", { name: /^Vokabelkarte: amicus/ })).toHaveCount(0);
    });

    await test.step("Antworten in anderer Reihenfolge ergeben die richtigen Boxen", async () => {
      await bewerten(page, true);
      await page.getByRole("heading", { name: "Runde abgeschlossen" }).waitFor({ timeout: 1200 });
      await beantworten(3);
      await page.getByRole("button", { name: "Noch eine Runde" }).waitFor({ state: "visible" });
      expect(KARTEN.map((k) => k.box)).toEqual([2, 2, 1]);
    });

    expect(fehler, "Ungefangene Fehler im Browser").toEqual([]);
  } finally {
    // Haengende Anfragen aufloesen, damit die Seite nicht auf sie wartet.
    for (const o of offen) o.aufloesen();
  }
});
