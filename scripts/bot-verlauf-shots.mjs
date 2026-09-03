// Playwright-Skript fuer die Emil-Feedbackschleife von /bot/verlauf. Meldet
// sich ueber /login an (Passwort NUR aus der Umgebung, nie im Code), nutzt
// echte Gespraeche aus der Nacht (keine neuen Bot-Anfragen, kein Rate-Limit-
// Risiko) und legt Screenshots unter .ytstack/shots/bot-verlauf ab.
//
// Aufruf: node --env-file=.env.local scripts/bot-verlauf-shots.mjs <runde> <schreib-id> <lese-id>

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.ATLAS_PASSWORD;
const round = process.argv[2] ?? "1";
const writeId = process.argv[3];
const readId = process.argv[4];
const outDir = new URL("../.ytstack/shots/bot-verlauf/", import.meta.url).pathname;

if (!PASSWORD) {
  console.error("ATLAS_PASSWORD fehlt in der Umgebung (.env.local laden mit --env-file).");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

function shotPath(name) {
  return `${outDir}runde-${round}-${name}.png`;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });

  await page.goto(`${BASE_URL}/login`);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /weiter/i }).click();
  await page.waitForURL(BASE_URL + "/", { timeout: 15000 }).catch(() => {});

  // 1) Liste: ein schreibendes und ein reines Frage-Gespraech nebeneinander.
  await page.goto(`${BASE_URL}/bot/verlauf`);
  await page.waitForSelector("text=Verlauf");
  await page.waitForTimeout(500);
  await page.screenshot({ path: shotPath("01-liste") });

  // 2) Geoeffnetes Gespraech mit Aufgabenkarte.
  if (writeId) {
    await page.goto(`${BASE_URL}/bot/verlauf/${writeId}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shotPath("02-schreibend") });
  }

  // 3) Geoeffnetes reines Frage-Antwort-Gespraech, mit einer aufgeklappten
  // Werkzeug-Zeile.
  if (readId) {
    await page.goto(`${BASE_URL}/bot/verlauf/${readId}`);
    await page.waitForTimeout(1500);
    const toggle = page.locator("button", { hasText: /hat/ }).first();
    if (await toggle.count()) await toggle.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: shotPath("03-lesend-aufgeklappt") });
  }

  // 4) Von /bot aus in einem Klick zum Verlauf.
  await page.goto(`${BASE_URL}/bot`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shotPath("04-bot-mit-verlauf-link") });

  await browser.close();
  console.log("Screenshots geschrieben:", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
