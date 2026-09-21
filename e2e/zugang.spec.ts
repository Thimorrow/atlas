import { expect, test } from "@playwright/test";

// Das Passwort-Gate aus proxy.ts.
//
// Diese Pruefung stand bisher nirgends: STATE.md belegt den Gate-Zustand mit
// einem handgemachten curl-Aufruf ("/ antwortet 307 auf /login?weiter=%2F"), und
// damit faellt eine Aenderung an proxy.ts erst auf, wenn Atlas offen im Netz
// steht. Die Tests hier brauchen keine Datenbank, nur ATLAS_PASSWORD.

const passwort = process.env.ATLAS_PASSWORD;

test("deutsche Pfade werden auf die Route umgeleitet", async ({ request, baseURL }) => {
  // /fächer ist nicht die Route, /faecher ist es. Die Weiterleitung passiert
  // VOR der Passwortsperre, damit "weiter" hinterher auf den richtigen Pfad
  // zeigt.
  const antwort = await request.get("/f%C3%A4cher", { maxRedirects: 0 });
  expect(antwort.status()).toBe(308);
  const ziel = new URL(antwort.headers()["location"], baseURL);
  expect(ziel.pathname).toBe("/faecher");
});

test("ohne Cookie: Seiten zum Anmelden, API mit 401", async ({ page }) => {
  test.skip(!passwort, "Ohne ATLAS_PASSWORD ist das Gate absichtlich offen.");

  const api = await page.request.get("/api/assignments");
  expect(api.status()).toBe(401);
  expect(await api.json()).toEqual({ error: "Nicht angemeldet." });

  // Und eine ehrliche 401 statt einer HTML-Weiterleitung: ein fetch() wuerde an
  // einer 307 auf /login nur scheitern.
  const session = await page.request.get("/api/session");
  expect(session.status()).toBe(401);

  await page.goto("/aufgaben");
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(new URL(page.url()).searchParams.get("weiter")).toBe("/aufgaben");
});

test("Anmelden ueber das Formular fuehrt zurueck auf die gewuenschte Seite", async ({ page }) => {
  test.skip(!passwort, "Ohne ATLAS_PASSWORD ist das Gate absichtlich offen.");
  const falsch = `nicht-${passwort}`;

  await page.goto("/aufgaben");
  expect(new URL(page.url()).searchParams.get("weiter")).toBe("/aufgaben");

  // Erst falsch: die Meldung sagt bewusst nicht, ob das Passwort leer oder
  // falsch war (beides dieselbe Antwort, siehe app/api/login/route.ts).
  await page.getByLabel("Passwort", { exact: true }).fill(falsch);
  await page.getByRole("button", { name: "Weiter" }).click();
  // Gezielt ueber die id, nicht ueber role=alert: Next bringt einen eigenen
  // Route-Announcer mit role=alert mit, ein blankes getByRole waere mehrdeutig.
  await expect(page.locator("#login-error")).toHaveText("Passwort stimmt nicht.");

  await page.getByLabel("Passwort", { exact: true }).fill(passwort!);
  await page.getByRole("button", { name: "Weiter" }).click();
  // Der Login wechselt hart auf die gewuenschte Seite, damit der Proxy das
  // frische Cookie sieht.
  await page.waitForURL((url) => url.pathname === "/aufgaben", { timeout: 15_000 });

  // Nach der Anmeldung antwortet die Sitzung mit Ablaufzeitpunkt -- daran
  // erkennt ein Client, wann er sich neu anmelden muss.
  const session = await page.request.get("/api/session");
  expect(session.status()).toBe(200);
  const sitzung = await session.json();
  expect(sitzung.authenticated).toBe(true);
  expect(sitzung.gateEnabled).toBe(true);
  expect(new Date(sitzung.expiresAt).getTime()).toBeGreaterThan(Date.now());
});
