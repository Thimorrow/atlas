// Zugangsschutz fuer die oeffentlich erreichbare Vercel-Bereitstellung.
//
// Atlas hat bewusst kein Benutzerkonto (Single-User, so steht es in der Spec).
// Auf Vercel liegt die App aber unter einer URL, die jeder aufrufen kann, und
// die Deploy-URLs stehen sogar ohne Login in der GitHub-API des Repos. Ohne
// diese Huerde waeren Stundenplan, Faecher und Aufgaben fuer jeden les- UND
// aenderbar, weil die API-Routen keinerlei Pruefung kennen.
//
// Vercel Authentication faellt aus, die gibt es im Hobby-Plan nicht fuer
// Production. Deshalb eine eigene, bewusst kleine Loesung: ein Passwort, danach
// ein signiertes Cookie.
//
// Das ist kein Mehrbenutzer-Login und will keiner sein. Es haelt Fremde und
// Bots draussen, mehr soll es nicht.

// Laeuft in der Edge-Runtime des Proxy -> Web Crypto statt node:crypto.

export const COOKIE_NAME = "atlas-gate";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 Tage

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

// Zeitkonstanter Vergleich: ein frueh abbrechendes === verraet ueber die
// Laufzeit, wie viele Zeichen schon stimmen.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Cookie-Inhalt: "<ablaufzeit>.<signatur>". Die Ablaufzeit steckt IN der
// Signatur, sie laesst sich also nicht nachtraeglich verlaengern.
export async function issueToken(secret: string): Promise<string> {
  const exp = String(Date.now() + MAX_AGE_SECONDS * 1000);
  return `${exp}.${await hmac(secret, exp)}`;
}

export async function verifyToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
  return safeEqual(sig, await hmac(secret, exp));
}

export const COOKIE_MAX_AGE = MAX_AGE_SECONDS;

// Ohne gesetztes Passwort bleibt die App offen. Das ist der lokale Fall: beim
// Entwickeln soll nichts im Weg stehen. Auf Vercel IST die Variable gesetzt,
// dort greift der Schutz.
export function gateEnabled(password: string | undefined): password is string {
  return typeof password === "string" && password.length > 0;
}
