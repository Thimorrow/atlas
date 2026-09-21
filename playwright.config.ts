import { defineConfig, devices } from "@playwright/test";
import { config as ladeEnv } from "dotenv";

// .env.local laden, BEVOR irgendetwas process.env liest.
//
// Playwright selbst tut das nicht, Next dagegen schon. Ohne diese Zeile laeuft
// der Testlauf gegen ein Gate, das der Server fuer eingeschaltet haelt und der
// Test fuer ausgeschaltet -- genau der Zustand, in dem die ersten Versuche hier
// alle 401 bekamen. dotenv ueberschreibt vorhandene Variablen nicht, in der CI
// gesetzte Werte gewinnen also.
ladeEnv({ path: ".env.local", quiet: true });

// Regressionssuite fuer die Abnahmekriterien, die bisher nur per Auge oder per
// Einzelskript geprueft wurden.
//
// Die Skripte unter scripts/*-e2e.mjs waren inhaltlich schon gute Tests: sie
// fangen eigene Netzwerkantworten ab (page.route), arbeiten also mit
// festgelegten Fixtures und fassen keine echten Daten an. Was fehlte, war die
// Form: sie schrieben "PASS" auf die Konsole, statt rot zu werden, und niemand
// rief sie auf. Hier stehen dieselben Pruefungen als Testfaelle in einer Suite,
// die die CI fahrt.
//
// Bewusst KEINE Screenshot-Baselines. Die Oberflaeche hier ist eine
// Zeichenflaeche auf Canvas, dazu Animationen und Framer Motion -- ein
// Pixelvergleich wuerde bei jedem Schriftart- oder Timing-Unterschied rot, ohne
// einen Fehler zu zeigen. Stattdessen wird geprueft, was die Abnahme wirklich
// meinte (Strich da, Reihenfolge richtig, kein Ueberlauf auf dem Handy), und
// Screenshots landen nur als Artefakt im Fehlerfall.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Ein verlorener Test soll nicht die halbe Suite mitreissen.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    // localhost, nicht 127.0.0.1: der Next-Entwicklungsserver liefert seine
    // Entwicklungs-Ressourcen nur an denselben Host aus ("Blocked cross-origin
    // request to Next.js dev resource /_next/hmr"). Mit 127.0.0.1 hydratisieren
    // die Seiten nicht mehr, und zwar still -- die Seite sieht dann aus wie
    // geladen, ist aber tot.
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1024, height: 1000 },
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Eigener Port, damit ein laufendes `npm run dev` auf 3000 nicht gestoert
  // wird und umgekehrt. Lokal wird ein bereits laufender Server benutzt.
  webServer: {
    command: "npx next dev --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
