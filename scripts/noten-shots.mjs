// Playwright-Skript fuer die Emil-Feedbackschleife der Notenuebersicht (/noten).
// Meldet sich ueber /login an (Passwort NUR aus der Umgebung, nie im Code),
// ruft /noten auf und legt Screenshots unter .ytstack/shots/noten ab.
//
// Aufruf: node --env-file=.env.local scripts/noten-shots.mjs <runde>

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.ATLAS_PASSWORD;
const round = process.argv[2] ?? "1";
const outDir = new URL("../.ytstack/shots/noten/", import.meta.url).pathname;

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

  await page.goto(`${BASE_URL}/noten`);
  await page.waitForSelector("h1:has-text('Noten')");
  await page.waitForTimeout(700); // Daten laden lassen, Skeleton verschwinden
  await page.screenshot({ path: shotPath("01-uebersicht"), fullPage: true });

  await browser.close();
  console.log("Screenshots geschrieben:", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
