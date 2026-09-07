import { NextResponse } from "next/server";
import { COOKIE_MAX_AGE, COOKIE_NAME, gateEnabled, issueToken, safeEqual } from "@/lib/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nimmt das Passwort entgegen und setzt bei Erfolg das signierte Cookie.
// Diese Route ist im proxy.ts bewusst von der Sperre ausgenommen, sonst
// koennte man sich nie anmelden.

// Minimales In-Memory Rate-Limit: max 10 Login-Versuche pro IP alle 10
// Minuten, danach 429. Single-User-Betrieb: keine externe Lib noetig.
const ATTEMPTS_MAX = 10;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; reset: number }>();
let secretFallbackWarned = false;

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unbekannt"
  );
}

// Zaehlt den Versuch und meldet true, sobald die IP ueber dem Limit liegt.
function overLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.reset <= now) {
    attempts.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (attempts.size > 1000) {
    for (const [key, value] of attempts) if (value.reset <= now) attempts.delete(key);
  }
  return entry.count > ATTEMPTS_MAX;
}

export async function POST(req: Request) {
  const password = process.env.ATLAS_PASSWORD;
  if (!gateEnabled(password)) {
    return NextResponse.json({ error: "Es ist kein Passwort eingerichtet." }, { status: 400 });
  }

  if (!process.env.ATLAS_SESSION_SECRET && !secretFallbackWarned) {
    secretFallbackWarned = true;
    console.warn(
      "[atlas] ATLAS_SESSION_SECRET fehlt, das Sitzungs-Cookie nutzt ATLAS_PASSWORD als Fallback. Bitte ein separates Secret setzen.",
    );
  }

  const ip = clientIp(req);
  if (overLimit(ip)) {
    return NextResponse.json(
      { error: "Zu viele Versuche. Bitte in einigen Minuten erneut versuchen." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const given = (body as { password?: unknown })?.password;
  if (typeof given !== "string" || !safeEqual(given, password)) {
    // Bewusst dieselbe Meldung fuer "leer" und "falsch": eine feinere Auskunft
    // hilft nur beim Raten.
    return NextResponse.json({ error: "Passwort stimmt nicht." }, { status: 401 });
  }

  const secret = process.env.ATLAS_SESSION_SECRET || password;
  // Erfolg loescht den Zaehler: der legitime Nutzer startet unbelastet.
  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await issueToken(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

// Abmelden: Cookie entwerten.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
