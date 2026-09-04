import { NextResponse } from "next/server";
import { COOKIE_MAX_AGE, COOKIE_NAME, gateEnabled, issueToken, safeEqual } from "@/lib/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nimmt das Passwort entgegen und setzt bei Erfolg das signierte Cookie.
// Diese Route ist im proxy.ts bewusst von der Sperre ausgenommen, sonst
// koennte man sich nie anmelden.

export async function POST(req: Request) {
  const password = process.env.ATLAS_PASSWORD;
  if (!gateEnabled(password)) {
    return NextResponse.json({ error: "Es ist kein Passwort eingerichtet." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungueltige Anfrage." }, { status: 400 });
  }

  const given = (body as { password?: unknown })?.password;
  if (typeof given !== "string" || !safeEqual(given, password)) {
    // Bewusst dieselbe Meldung fuer "leer" und "falsch": eine feinere Auskunft
    // hilft nur beim Raten.
    return NextResponse.json({ error: "Passwort stimmt nicht." }, { status: 401 });
  }

  const secret = process.env.ATLAS_SESSION_SECRET || password;
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
