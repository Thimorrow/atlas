import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/gate";
import {
  NOT_CONFIGURED,
  exchangeCode,
  fetchMe,
  microsoftConfig,
  redirectUri,
  saveAccount,
} from "@/lib/microsoft";
import { STATE_COOKIE, VERIFIER_COOKIE } from "../login/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Der Nutzer landet hier ueber eine Weiterleitung im Browser, nicht ueber
// fetch. Eine JSON-Antwort waere an dieser Stelle eine Sackgasse -- es geht
// deshalb immer zurueck in die Einstellungen, mit dem Ergebnis im Querystring.
function back(req: Request, params: Record<string, string>) {
  const url = new URL("/settings", req.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(VERIFIER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

// GET /api/microsoft/callback?code=…&state=…
export async function GET(req: Request) {
  const config = microsoftConfig();
  if (!config) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });

  const url = new URL(req.url);
  const jar = await cookies();

  // Microsoft meldet einen Abbruch ("Zugriff verweigert") ueber ?error, nicht
  // ueber einen HTTP-Status.
  if (url.searchParams.get("error")) return back(req, { microsoft: "abgebrochen" });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = jar.get(STATE_COOKIE)?.value;
  const verifier = jar.get(VERIFIER_COOKIE)?.value;

  if (!code || !state || !expectedState || !verifier || !safeEqual(state, expectedState)) {
    return back(req, { microsoft: "ungueltig" });
  }

  const token = await exchangeCode(config, code, redirectUri(req), verifier);
  if ("error" in token) return back(req, { microsoft: "fehler" });

  // Ohne Refresh-Token waere die Verbindung in einer Stunde tot. Dann fehlt
  // offline_access in der App-Registrierung -- ein Einrichtungsfehler, kein
  // Laufzeitproblem.
  if (!token.refresh_token) return back(req, { microsoft: "kein-refresh" });

  const me = await fetchMe(token.access_token);
  await saveAccount({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresIn: token.expires_in,
    scope: token.scope,
    displayName: me.displayName,
    email: me.email,
  });

  return back(req, { microsoft: "verbunden" });
}
