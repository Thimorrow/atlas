// Playwright-Skript fuer die Emil-Feedbackschleife der Bot-Oberflaeche.
// Meldet sich ueber /login an (Passwort NUR aus der Umgebung, nie im Code),
// ruft die neuen Ansichten auf und legt Screenshots unter .ytstack/shots/bot ab.
//
// Aufruf: node --env-file=.env.local scripts/bot-shots.mjs <runde>
//
// Schreibt ausschliesslich ueber ein eigenes Testfach ("ZZ Testfach") --
// nichts wird geloescht oder zurueckgesetzt.

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.ATLAS_PASSWORD;
const round = process.argv[2] ?? "1";
const outDir = new URL("../.ytstack/shots/bot/", import.meta.url).pathname;

if (!PASSWORD) {
  console.error("ATLAS_PASSWORD fehlt in der Umgebung (.env.local laden mit --env-file).");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

function shotPath(name) {
  return `${outDir}runde-${round}-${name}.png`;
}

// Das kostenlose Modell hinter dem AI Gateway limitiert Anfragen pro Minute --
// ohne grosszuegige Pause zwischen den Gespraechsrunden antwortet die Route
// mit 429.
const PAUSE = 65000;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });

  // Anmeldung.
  await page.goto(`${BASE_URL}/login`);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /weiter/i }).click();
  await page.waitForURL(BASE_URL + "/", { timeout: 15000 }).catch(() => {});

  // 1) /bot: leerer Start mit Begruessung + Vorschlaegen.
  await page.goto(`${BASE_URL}/bot`);
  await page.waitForSelector("text=Atlas-Bot");
  await page.waitForTimeout(600); // GET /api/bot laden lassen
  await page.screenshot({ path: shotPath("01-start") });

  // 2) Eine Frage per Vorschlag abschicken, die Statuszeile abpassen
  // (Werkzeugaufruf braucht kurz, bevor Text kommt).
  const suggestion = page.locator("button", { hasText: "?" }).first();
  if (await suggestion.count()) {
    await page.waitForTimeout(PAUSE);
    await suggestion.click();
    await page.waitForTimeout(300);
    // Auf die dezente "tut gerade etwas"-Zeile warten -- sie steht ueber der
    // noch leeren Antwort. Erscheint sie nicht rechtzeitig, wird trotzdem
    // fotografiert (kein harter Fehlschlag der Runde).
    await page
      .locator("p", { hasText: /liest|schlägt|legt|ändert|führt/ })
      .first()
      .waitFor({ timeout: 4000 })
      .catch(() => {});
    await page.screenshot({ path: shotPath("02-antwort-laeuft") });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: shotPath("03-verlauf") });
  }

  // 3) Eine Aufgabe im Testfach anlegen lassen -> Karte + Rueckgaengig.
  const input = page.locator("textarea");
  await page.waitForTimeout(PAUSE);
  await input.fill('Leg mir im Fach "ZZ Testfach" eine Hausaufgabe "Testaufgabe vom Bot" fuer morgen an.');
  await input.press("Enter");
  await page.waitForTimeout(7000);
  await page.screenshot({ path: shotPath("04-aufgabe-angelegt") });

  // 4) Notenvorschlag anfordern -> Vorschau-Karte mit "Eintragen"/"Verwerfen".
  // "ZZ Testfach" klingt fuer das Modell nach einem Platzhalter -- es fragt
  // dann erst zurueck, statt das Werkzeug aufzurufen. Einmal bestaetigen.
  await page.waitForTimeout(PAUSE);
  await input.fill(
    '"ZZ Testfach" ist der echte, absichtlich so benannte Fachname. Schlag dort eine Note vor: 13 Punkte, mündlich, "Mitarbeit", heute.',
  );
  await input.press("Enter");
  await page.waitForTimeout(9000);
  if (await page.getByText(/bestätig/i).count()) {
    await input.fill("Ja, bitte.");
    await input.press("Enter");
    await page.waitForTimeout(9000);
  }
  await page.screenshot({ path: shotPath("05-notenvorschlag") });

  // 5) Overlay per Cmd+K ueber dem Stundenplan.
  await page.goto(`${BASE_URL}/`);
  await page.waitForTimeout(500);
  await page.keyboard.press("Meta+K");
  await page.waitForTimeout(400);
  await page.screenshot({ path: shotPath("06-overlay") });

  await browser.close();
  console.log("Screenshots geschrieben:", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
