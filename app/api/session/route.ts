import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, gateEnabled } from "@/lib/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/session
//
// Ein Client musste bisher irgendeine beliebige Route aufrufen und auf eine
// 401 warten, um zu erfahren, ob seine Sitzung noch gilt. Diese Route sagt es
// direkt -- und nennt vor allem den Ablaufzeitpunkt, damit die App die
// Anmeldung erneuern kann, BEVOR mitten in einer Aktion eine 401 hereinkommt.
//
// Eine Pruefung des Cookies findet hier bewusst nicht mehr statt: ein nicht
// angemeldeter Aufruf kommt gar nicht bis hierher, den faengt proxy.ts ab.
// Wer diese Zeilen erreicht, ist angemeldet.
export async function GET() {
  const enabled = gateEnabled(process.env.ATLAS_PASSWORD);
  if (!enabled) {
    // Ohne Passwort gibt es keine Sitzung, die ablaufen koennte. Das ist der
    // lokale Fall; der Client soll dann gar nicht erst einen Anmeldebildschirm
    // zeigen.
    return NextResponse.json({ authenticated: true, expiresAt: null, gateEnabled: false });
  }

  // Der Cookie-Inhalt ist "<ablaufzeit-in-ms>.<signatur>", siehe lib/gate.ts.
  // Die Signatur hat proxy.ts schon geprueft, hier zaehlt nur noch die Zahl.
  const token = (await cookies()).get(COOKIE_NAME)?.value ?? "";
  const ms = Number(token.slice(0, token.lastIndexOf(".")));
  const expiresAt = Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;

  return NextResponse.json({ authenticated: true, expiresAt, gateEnabled: true });
}
