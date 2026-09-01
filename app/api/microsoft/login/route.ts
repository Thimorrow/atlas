import { NextResponse } from "next/server";
import {
  NOT_CONFIGURED,
  authorizeUrl,
  challengeFor,
  createVerifier,
  microsoftConfig,
  redirectUri,
} from "@/lib/microsoft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const STATE_COOKIE = "ms-oauth-state";
export const VERIFIER_COOKIE = "ms-oauth-verifier";

// Zehn Minuten reichen fuer eine Anmeldung mit Zwei-Faktor. Bricht der Nutzer
// ab, raeumt der Browser die Cookies von selbst weg.
const COOKIE_MAX_AGE = 600;

// GET /api/microsoft/login -- schickt den Browser zur Microsoft-Anmeldung.
//
// state und code_verifier gehen als kurzlebige httpOnly-Cookies mit. Erst der
// Rueckweg (siehe ../callback) prueft, ob die Antwort zu genau diesem Browser
// und genau diesem Start gehoert.
export async function GET(req: Request) {
  const config = microsoftConfig();
  if (!config) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });

  const state = createVerifier();
  const verifier = createVerifier();

  const res = NextResponse.redirect(
    authorizeUrl(config, {
      redirectUri: redirectUri(req),
      state,
      challenge: challengeFor(verifier),
    }),
  );

  // sameSite "lax": Microsoft schickt den Browser per Top-Level-Navigation
  // zurueck, "strict" wuerde die Cookies dabei unterschlagen.
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
  res.cookies.set(STATE_COOKIE, state, options);
  res.cookies.set(VERIFIER_COOKIE, verifier, options);
  return res;
}
