import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // webuntis ist eine Node-Server-Lib, nicht bundeln.
  //
  // otplib steht danebem, obwohl es im Code nirgends vorkommt: webuntis holt
  // es sich zur Laufzeit fuer die Anmeldung per Secret. Als optionale
  // Abhaengigkeit von webuntis wurde es lokal zwar installiert, auf Vercel
  // aber nicht mit in die Funktion gepackt -- /api/sync/untis antwortete dort
  // mit "Cannot find module 'otplib'". Als direkte Abhaengigkeit in
  // package.json plus Eintrag hier ist es fest dabei.
  serverExternalPackages: ["webuntis", "otplib"],
};

export default nextConfig;
