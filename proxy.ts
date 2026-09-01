import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, gateEnabled, verifyToken } from "@/lib/gate";

// Next 16: die Datei heisst proxy.ts und exportiert `proxy`. `middleware.ts`
// ist in dieser Version deprecated (siehe node_modules/next/dist/docs ->
// 01-app/03-api-reference/03-file-conventions/middleware.md).

export async function proxy(request: NextRequest) {
  const password = process.env.ATLAS_PASSWORD;

  // Kein Passwort gesetzt -> offen. Trifft die lokale Entwicklung.
  if (!gateEnabled(password)) return NextResponse.next();

  const secret = process.env.ATLAS_SESSION_SECRET || password;
  const ok = await verifyToken(request.cookies.get(COOKIE_NAME)?.value, secret);
  if (ok) return NextResponse.next();

  // API-Routen bekommen eine ehrliche 401 statt einer Weiterleitung -- ein
  // Redirect auf HTML waere fuer einen fetch() nur verwirrend.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  // Nach dem Anmelden zurueck dorthin, wo der Nutzer eigentlich hinwollte.
  url.searchParams.set("weiter", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Ohne matcher liefe der Proxy auf JEDEM Request, auch auf _next/static --
  // dann blockiert die Sperre das eigene CSS und die Login-Seite waere nackt.
  // Ausgenommen sind daher die Statik-Pfade, die Login-Seite selbst und die
  // Route, die das Passwort entgegennimmt.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/login).*)"],
};
