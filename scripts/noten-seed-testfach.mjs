// Einmaliges Hilfsskript: legt ein paar Testnoten im eigenen "ZZ Testfach" an,
// damit /noten mit realistischerer Streuung (mehrere Faecher mit Noten,
// muendlich + schriftlich gemischt) fotografiert werden kann. Schreibt
// ausschliesslich ins Testfach, nichts wird geloescht oder veraendert.
//
// Aufruf: node --env-file=.env.local scripts/noten-seed-testfach.mjs

import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.ATLAS_PASSWORD;
const SUBJECT_ID = "a11c1fa7-f243-488a-abd2-875663b87f16"; // ZZ Testfach

if (!PASSWORD) {
  console.error("ATLAS_PASSWORD fehlt in der Umgebung (.env.local laden mit --env-file).");
  process.exit(1);
}

async function addGrade(page, { points, kind, label, date }) {
  await page.getByRole("button", { name: "Note eintragen" }).click();
  await page.selectOption("#grade-points", String(points));
  await page.selectOption("#grade-kind", kind);
  await page.fill("#grade-label", label);
  await page.fill("#grade-date", date);
  await page.getByRole("button", { name: "Note speichern" }).click();
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${BASE_URL}/login`);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /weiter/i }).click();
  await page.waitForURL(BASE_URL + "/", { timeout: 15000 }).catch(() => {});

  await page.goto(`${BASE_URL}/faecher/${SUBJECT_ID}`);
  await page.waitForTimeout(500);

  await addGrade(page, { points: 4, kind: "written", label: "Klausur 1", date: "2026-08-25" });
  await addGrade(page, { points: 6, kind: "oral", label: "Mitarbeit", date: "2026-08-28" });

  await browser.close();
  console.log("ZZ Testfach: zwei Testnoten angelegt.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
