import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // webuntis ist eine Node-Server-Lib, nicht bundeln.
  //
  // otplib steht daneben, obwohl es im Code nirgends vorkommt: webuntis holt
  // es sich zur Laufzeit fuer die Anmeldung per Secret. Als optionale
  // Abhaengigkeit von webuntis wurde es lokal zwar installiert, auf Vercel
  // aber nicht mit in die Funktion gepackt -- /api/sync/untis antwortete dort
  // mit "Cannot find module 'otplib'". Als direkte Abhaengigkeit in
  // package.json plus Eintrag hier ist es fest dabei.
  serverExternalPackages: ["webuntis", "otplib"],

  // Und weil otplib nirgends importiert wird, findet die Ablaufverfolgung es
  // auch nicht: der Aufruf steht tief in webuntis und wird erst zur Laufzeit
  // aufgeloest. Ein Eintrag in package.json genuegte nicht, der Deploy blieb
  // bei derselben 500. Hier wird das Paket ausdruecklich mitgenommen.
  // Aufgezaehlt statt geraten: das ist die vollstaendige Huelle von otplib.
  // Der erste Versuch nahm nur otplib und @otplib mit, dann fehlte thirty-two.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/otplib/**/*",
      "./node_modules/@otplib/**/*",
      "./node_modules/thirty-two/**/*",
    ],
    // Die Migrationsdateien selbst, damit /api/admin/migrate sie zur Laufzeit
    // findet. Ohne diesen Eintrag liegt der Ordner nicht in der Funktion.
    // scripts/migrate.mjs kommt normalerweise ueber den JS-Import automatisch
    // mit in die Funktion, steht hier aber trotzdem ausdruecklich, weil die
    // Ausfuehrungslogik seit kurzem dort liegt und nicht mehr in der Route.
    "/api/admin/migrate": ["./drizzle/**/*", "./scripts/migrate.mjs"],
  },
};

export default nextConfig;
