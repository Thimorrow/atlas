// Playwright-Skript fuer die Emil-Feedbackschleife des Zielnoten-Rechners im
// Fach. Meldet sich ueber /login an (Passwort NUR aus der Umgebung, nie im
// Code), oeffnet drei Faecher und legt Screenshots unter .ytstack/shots/zielnote ab.
//
// Klickt nichts Zerstoererisches: kein Loeschen, kein Zuruecksetzen, keine
// bestehende Note wird angefasst -- nur die Auswahlfelder des Rechners selbst.
//
// Aufruf: node --env-file=.env.local scripts/zielnote-shots.mjs <runde>

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.ATLAS_PASSWORD;
const round = process.argv[2] ?? "1";
const outDir = new URL("../.ytstack/shots/zielnote/", import.meta.url).pathname;

// Biologie hat schon eine Note -- erreichbares Ziel.
const SUBJECT_WITH_GOAL = "fa99d3a7-8dd8-42c3-b7ff-b70a38255302";
// ZZ Testfach: oral 6, written 4, 50:50 -- fuer ein hohes Ziel unerreichbar.
const SUBJECT_UNREACHABLE = "a11c1fa7-f243-488a-abd2-875663b87f16";
// Mathe hat noch keine Note -- der Rechner darf hier gar nicht erscheinen.
const SUBJECT_NO_GRADES = "eb6c3f33-f769-464a-ab90-1a6d1a7550dc";

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

  // --- Erreichbares Ziel ------------------------------------------------
  await page.goto(`${BASE_URL}/faecher/${SUBJECT_WITH_GOAL}`);
  await page.waitForSelector("text=Was brauche ich noch?", { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shotPath("01-erreichbar"), fullPage: true });

  // --- Unerreichbares Ziel: Wunschnote auf 15 Punkte stellen -------------
  await page.goto(`${BASE_URL}/faecher/${SUBJECT_UNREACHABLE}`);
  await page.waitForSelector("text=Was brauche ich noch?", { timeout: 15000 });
  await page.getByLabel("Wunschnote in Punkten").selectOption("15");
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath("02-unerreichbar"), fullPage: true });

  // --- Fach ohne Noten: der Abschnitt erscheint gar nicht erst -----------
  await page.goto(`${BASE_URL}/faecher/${SUBJECT_NO_GRADES}`);
  await page.waitForSelector("text=Noten");
  await page.waitForTimeout(400);
  await page.screenshot({ path: shotPath("03-ohne-noten"), fullPage: true });

  await browser.close();
  console.log("Screenshots geschrieben:", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
