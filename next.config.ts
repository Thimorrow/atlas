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
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/otplib/**/*", "./node_modules/@otplib/**/*"],
  },
};

export default nextConfig;
