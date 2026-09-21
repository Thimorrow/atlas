import { expect, type Page } from "@playwright/test";

// Meldet die Browsersitzung an, falls ein Passwort gesetzt ist.
//
// Der Aufruf laeuft ueber page.request, das Cookie landet also im selben Kontext
// wie die Seite selbst. Ohne ATLAS_PASSWORD bleibt das Gate offen (siehe
// proxy.ts) -- dann gibt es nichts anzumelden, und die Tests laufen trotzdem.
export async function anmelden(page: Page): Promise<boolean> {
  const passwort = process.env.ATLAS_PASSWORD;
  if (!passwort) return false;
  const antwort = await page.request.post("/api/login", { data: { password: passwort } });
  expect(antwort.status(), "Anmeldung am Passwort-Gate").toBe(200);
  return true;
}

// Kein Ueberlauf in der Breite -- die Pruefung aus den alten Skripten, hier an
// einer Stelle, damit sie in jedem Test gleich heisst.
export async function keinUeberlauf(page: Page): Promise<void> {
  const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(ueberlauf, "Die Seite laeuft in der Breite ueber").toBe(false);
}
