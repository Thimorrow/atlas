import { NextResponse } from "next/server";
import { accountInfo, deleteAccount, getAccount, microsoftEnabled } from "@/lib/microsoft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/microsoft/status -- { enabled, connected, account }
//
// enabled=false heisst "im Azure-Portal noch nichts eingerichtet". Das ist
// kein Fehler, deshalb 200 mit ruhiger Auskunft statt 503: die Oberflaeche
// fragt hier, um zu wissen, was sie ueberhaupt anbieten darf.
export async function GET() {
  if (!microsoftEnabled()) {
    return NextResponse.json({ enabled: false, connected: false, account: null });
  }
  const row = await getAccount();
  return NextResponse.json({
    enabled: true,
    connected: Boolean(row),
    account: row ? accountInfo(row) : null,
  });
}

// DELETE /api/microsoft/status -- Verbindung trennen.
// Loescht nur die Tokens bei uns. Die Zustimmung im Microsoft-Konto bleibt
// bestehen, die widerruft der Nutzer dort selbst.
export async function DELETE() {
  if (microsoftEnabled()) await deleteAccount();
  return NextResponse.json({ ok: true });
}
