// Playwright-Skript fuer die Emil-Feedbackschleife der /morgen-Seite.
// Meldet sich ueber /login an (Passwort NUR aus der Umgebung, nie im Code),
// ruft /morgen auf und legt Screenshots unter .ytstack/shots/morgen ab.
//
// Aufruf: node --env-file=.env.local scripts/morgen-shots.mjs <runde>
//
// Legt bei Bedarf EINE Testpruefung in "ZZ Testfach" an (fuer die Klassenarbeit-
// Karte im Screenshot) -- nichts wird geloescht oder zurueckgesetzt, und es
// wird ausschliesslich in ZZ Testfach geschrieben.

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.ATLAS_PASSWORD;
const round = process.argv[2] ?? "1";
const outDir = new URL("../.ytstack/shots/morgen/", import.meta.url).pathname;
const TESTFACH_ID = "a11c1fa7-f243-488a-abd2-875663b87f16"; // ZZ Testfach

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

  // Testpruefung anlegen, falls noch keine da ist -- zeigt die Pruefungs-Karte
  // am naechsten Schultag (in den Beispieldaten fallen dorthin schon mehrere
  // faellige Aufgaben, das macht den Tag im Screenshot realistisch voll).
  await page.evaluate(
    async ({ testfachId }) => {
      const morgen = await fetch("/api/morgen").then((r) => r.json());
      const targetDate = morgen.target.date;
      const already = (morgen.exams ?? []).some((e) => e.subjectId === testfachId);
      if (!already) {
        await fetch("/api/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "ZZ Klassenarbeit Morgen-Test",
            type: "exam",
            subjectId: testfachId,
            dueDate: targetDate,
          }),
        });
      }
    },
    { testfachId: TESTFACH_ID },
  );

  // 1) Normale Ansicht: naechster (Schul-)Tag mit Stunden, faelligen Aufgaben
  // und Pruefungskarte.
  await page.goto(`${BASE_URL}/morgen`);
  await page.waitForSelector("h1");
  await page.waitForTimeout(700);
  await page.screenshot({ path: shotPath("01-morgen"), fullPage: true });

  // 2) "Heute ansehen" -- die kleine Ausweiche auf den Rest des heutigen Tages.
  const todayToggle = page.getByRole("button", { name: /heute ansehen/i });
  if (await todayToggle.count()) {
    await todayToggle.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shotPath("02-heute"), fullPage: true });
  }

  await browser.close();
  console.log("Screenshots geschrieben:", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
