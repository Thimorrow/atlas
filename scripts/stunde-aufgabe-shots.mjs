// Playwright-Skript fuer die Emil-Feedbackschleife des Features "Hausaufgabe
// direkt aus der Schulstunde eintragen". Meldet sich ueber /login an
// (Passwort NUR aus der Umgebung, nie im Code), oeffnet den Stundenplan auf
// einer Woche mit einer Stunde des Testfachs "ZZ Testfach" und legt daraus
// eine Aufgabe an. Schreibt ausschliesslich ueber das Testfach -- nichts wird
// geloescht oder zurueckgesetzt.
//
// Aufruf: node --env-file=.env.local scripts/stunde-aufgabe-shots.mjs <runde>

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.ATLAS_PASSWORD;
const round = process.argv[2] ?? "1";
const outDir = new URL("../.ytstack/shots/stunde-aufgabe/", import.meta.url).pathname;

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

  // Die ZZ-Testfach-Stunde liegt am 03.09.2026 -- direkt dorthin navigieren.
  await page.goto(`${BASE_URL}/?date=2026-09-03`);
  await page.waitForSelector("text=Stundenplan");
  await page.waitForTimeout(700);

  const block = page.getByText("ZZ Testfach", { exact: true }).first();
  await block.waitFor({ timeout: 10000 });
  await block.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath("01-stundenplan-stunde") });

  // Tastatur-Erreichbarkeit: die Stunde fokussieren und mit Enter oeffnen.
  await block.focus().catch(() => {});
  const trigger = page.locator('[role="button"]', { hasText: "ZZ Testfach" }).first();
  await trigger.click();
  await page.waitForTimeout(200);
  await page.getByRole("menuitem", { name: /Hausaufgabe hinzufuegen/i }).click();

  // Formular: Fach gesetzt, Faelligkeit vorbelegt (naechste ZZ-Testfach-
  // Stunde, die 10.09. faellt aus -> 17.09. muss stehen).
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(300);
  const titleInput = page.locator('input[placeholder="Was ist zu tun?"]');
  await titleInput.fill(`Seite 84 rechnen (Runde ${round})`);
  await page.screenshot({ path: shotPath("02-formular-vorbelegt") });

  await page.getByRole("button", { name: "Anlegen" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: shotPath("03-toast-bestaetigung") });

  // Stunde zeigt jetzt den Aufgaben-Marker.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: shotPath("04-stunde-mit-marker") });

  await browser.close();
  console.log("Screenshots geschrieben:", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
