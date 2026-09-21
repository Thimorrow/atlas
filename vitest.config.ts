import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Die Abnahmetests unter e2e/ gehoeren Playwright, nicht Vitest. Beide
    // Runner sammeln von Haus aus *.spec.ts ein; ohne diesen Ausschluss laedt
    // Vitest die Playwright-Tests und bricht mit "Playwright Test did not
    // expect test() to be called here" ab -- was im Testlauf wie drei kaputte
    // Testdateien aussieht, obwohl beide Suiten fuer sich gruen sind.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
  resolve: {
    alias: { "@": root },
  },
});
