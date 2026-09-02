// Playwright-Skript fuer die Emil-Feedbackschleife der /pruefungen-Seite.
// Meldet sich ueber /login an (Passwort NUR aus der Umgebung, nie im Code),
// ruft /pruefungen auf und legt Screenshots unter .ytstack/shots/pruefungen ab.
//
// Aufruf: node --env-file=.env.local scripts/pruefungen-shots.mjs <runde>
//
// Schreibt ausschliesslich ueber das eigens angelegte Fach "ZZ Testfach" --
// nichts wird geloescht oder zurueckgesetzt.

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.ATLAS_PASSWORD;
const round = process.argv[2] ?? "1";
const outDir = new URL("../.ytstack/shots/pruefungen/", import.meta.url).pathname;

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

  // Anmeldung.
  await page.goto(`${BASE_URL}/login`);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /weiter/i }).click();
  await page.waitForURL(BASE_URL + "/", { timeout: 15000 }).catch(() => {});

  // 1) /pruefungen mit echten Daten: naechste Pruefung gross, Rest darunter.
  await page.goto(`${BASE_URL}/pruefungen`);
  await page.waitForSelector("text=Prüfungen");
  await page.waitForTimeout(700);
  await page.screenshot({ path: shotPath("01-liste"), fullPage: true });

  // 2) Neue-Pruefung-Dialog mit vorbelegtem Typ "Klassenarbeit".
  await page.getByRole("button", { name: /neue prüfung/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: shotPath("02-dialog") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 3) Vergangene Pruefungen aufklappen, falls vorhanden.
  const pastToggle = page.getByRole("button", { name: /vergangene prüfungen/i });
  if (await pastToggle.count()) {
    await pastToggle.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shotPath("03-vergangen"), fullPage: true });
  }

  await browser.close();
  console.log("Screenshots geschrieben:", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
