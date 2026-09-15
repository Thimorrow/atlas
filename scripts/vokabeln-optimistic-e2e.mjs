// Regression: Kartenwechsel darf nicht auf eine Serverantwort warten.
// Bewertungs- und Ladedaten sind Browser-Fixtures; echte Vokabeln bleiben unverändert.
// Start: node --env-file=.env.local scripts/vokabeln-optimistic-e2e.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";

const base = process.env.ATLAS_URL ?? "http://127.0.0.1:3004";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const cards = ["amicus", "urbs", "laudare"].map((wort, i) => ({
  id: `${i + 1}1111111-1111-4111-8111-111111111111`,
  sprache: "latein",
  abschnitt: "Test",
  wort,
  deutsch: ["Freund", "Stadt", "loben"][i],
  box: 1,
  revision: 0,
}));
const requests = [];
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  if (process.env.ATLAS_PASSWORD) {
    const login = await page.request.post(`${base}/api/login`, {
      data: { password: process.env.ATLAS_PASSWORD },
    });
    assert.equal(login.status(), 200);
  }
  await page.route("**/api/vokabeln", (route) =>
    route.fulfill({ json: { vokabeln: cards } }),
  );
  await page.route("**/api/vokabeln/bewerten", async (route) => {
    const body = route.request().postDataJSON();
    await new Promise((resolve) => requests.push({ body, route, resolve }));
  });
  async function settle(index, ok = true) {
    const { body, route, resolve } = requests[index];
    if (ok) {
      const card = cards.find((card) => card.id === body.id);
      assert.equal(body.revision, card.revision);
      card.box = body.richtig ? Math.min(6, card.box + 1) : 1;
      card.revision++;
      await route.fulfill({ json: { vokabel: card } });
    } else
      await route.fulfill({
        status: 503,
        json: { error: "Test: Speichern fehlgeschlagen" },
      });
    resolve();
  }
  async function grade(correct) {
    await page.getByRole("button", { name: "Umdrehen", exact: true }).click();
    await page
      .getByRole("button", {
        name: correct ? "Richtig" : "Falsch",
        exact: true,
      })
      .click();
  }
  await page.goto(`${base}/lernen/vokabeln`);
  const lesson = page.getByRole("button", {
    name: "Lektion Test öffnen",
    exact: true,
  });
  await lesson.waitFor();
  assert.equal(await lesson.locator("button").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Durchgucken", exact: true })
      .count(),
    0,
  );
  await lesson.click();
  await page
    .getByRole("button", { name: "3 Vokabeln lernen", exact: true })
    .click();
  await grade(true);
  await page
    .getByRole("button", { name: /^Vokabelkarte: urbs/ })
    .waitFor({ timeout: 1200 });
  assert.equal(requests.length, 1);
  console.log("PASS: nächste Karte vor der ersten Serverantwort");
  await grade(true);
  await page
    .getByRole("button", { name: /^Vokabelkarte: laudare/ })
    .waitFor({ timeout: 1200 });
  assert.equal(requests.length, 2);
  console.log("PASS: mehrere Bewertungen gleichzeitig im Hintergrund");
  await settle(1, false);
  await page
    .locator('[role="alert"][aria-live="assertive"]')
    .getByText("Test: Speichern fehlgeschlagen", { exact: true })
    .waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: /^Vokabelkarte: laudare/ })
      .isEnabled(),
  );
  await grade(false);
  await page
    .getByRole("heading", { name: "Eine Runde weiter." })
    .waitFor({ timeout: 1200 });
  assert.ok(
    await page.getByRole("button", { name: "Noch eine Runde" }).isDisabled(),
  );
  await settle(2);
  await settle(0);
  await page
    .getByRole("button", { name: "Nicht gespeicherte Vokabeln wiederholen" })
    .waitFor();
  await page
    .getByRole("button", { name: "Nicht gespeicherte Vokabeln wiederholen" })
    .click();
  await page.getByRole("button", { name: /^Vokabelkarte: urbs/ }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: /^Vokabelkarte: amicus/ }).count(),
    0,
  );
  console.log(
    "PASS: später Fehler mit Toast, andere Karten bleiben bedienbar; gezieltes Wiederholen nach Abgleich",
  );
  await grade(true);
  await page
    .getByRole("heading", { name: "Eine Runde weiter." })
    .waitFor({ timeout: 1200 });
  await settle(3);
  await page
    .getByRole("button", { name: "Noch eine Runde" })
    .waitFor({ state: "visible" });
  assert.deepEqual(
    cards.map((card) => card.box),
    [2, 2, 1],
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Bestätigungen in anderer Reihenfolge erhalten korrekte Boxen und Revisionen",
  );
} finally {
  for (const request of requests) request.resolve();
  await browser.close();
}
