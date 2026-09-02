// Anbindung an Microsoft 365, ausschliesslich fuer OneNote.
//
// Wie beim Blob-Speicher (lib/subject-file-store.ts) ist die Anbindung
// optional: fehlt eine der drei Variablen, bleibt sie einfach aus. Deshalb
// wird die Umgebung nie beim Import gelesen, sondern erst im Request -- sonst
// bricht `next build` auf einem Rechner ohne die Werte ab.
//
// Bewusst ohne MSAL: fuer einen einzigen Authorization-Code-Flow und drei
// Graph-Aufrufe waere eine Bibliothek mehr Abhaengigkeit als Gewinn. fetch
// reicht.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { microsoftAccounts, type MicrosoftAccount } from "@/lib/db/schema";

// --- Konfiguration -----------------------------------------------------------

// Genau die Rechte, die das eine Feature braucht: wer der Nutzer ist, welche
// Abschnitte es gibt, und Seiten anlegen. Kein Schreibrecht auf bestehende
// Seiten, kein OneDrive, kein Kalender.
export const SCOPES = "offline_access User.Read Notes.Read Notes.Create";

export type MicrosoftConfig = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
};

export function microsoftConfig(): MicrosoftConfig | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  if (!clientId || !clientSecret || !tenantId) return null;
  return { clientId, clientSecret, tenantId };
}

export function microsoftEnabled(): boolean {
  return microsoftConfig() !== null;
}

// Einheitliche Antwort fuer alle Routen, solange nichts eingerichtet ist. Kein
// Fehler, nur eine Feststellung -- die App laeuft ohne die Anbindung weiter.
export const NOT_CONFIGURED = "Die Microsoft-Anbindung ist noch nicht eingerichtet.";

// Die Redirect-URI muss bei Microsoft exakt so registriert sein. Sie aus der
// laufenden Anfrage abzuleiten spart eine vierte Variable und trifft lokal wie
// auf Vercel automatisch die richtige Adresse.
export function redirectUri(req: Request): string {
  return new URL("/api/microsoft/callback", req.url).toString();
}

function authority(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0`;
}

// --- Verschluesselung --------------------------------------------------------
//
// Die Tokens landen in derselben Datenbank wie Stundenplan und Notizen. Ein
// Blick in die Tabelle darf aber nicht reichen, um sich bei Microsoft als der
// Nutzer auszugeben. Deshalb AES-256-GCM mit einem Schluessel, der nur in der
// Umgebung steht: bevorzugt ATLAS_SESSION_SECRET, ersatzweise das
// Client-Secret. Wechselt der Schluessel, sind die alten Tokens unlesbar --
// dann meldet sich der Nutzer einmal neu an, mehr passiert nicht.

function encryptionKey(): Buffer {
  const source = process.env.ATLAS_SESSION_SECRET || process.env.MICROSOFT_CLIENT_SECRET || "";
  return createHash("sha256").update(source).digest();
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

function decrypt(packed: string): string | null {
  const parts = packed.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, data] = parts.map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    // Falscher Schluessel oder manipulierte Zeile. Beides heisst dasselbe:
    // dieses Token ist nicht mehr brauchbar.
    return null;
  }
}

// --- PKCE --------------------------------------------------------------------
//
// Der Code-Verifier haengt die Rueckkehr an genau den Browser, der den Flow
// gestartet hat. Ein abgefangener Code allein bringt damit nichts.

export function createVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function authorizeUrl(
  config: MicrosoftConfig,
  params: { redirectUri: string; state: string; challenge: string },
): string {
  const url = new URL(`${authority(config.tenantId)}/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// --- Token holen und erneuern ------------------------------------------------

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

async function requestToken(
  config: MicrosoftConfig,
  form: Record<string, string>,
): Promise<TokenResponse | { error: string }> {
  const res = await fetch(`${authority(config.tenantId)}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...form,
    }),
    cache: "no-store",
  }).catch(() => null);

  if (!res) return { error: "Microsoft ist gerade nicht erreichbar." };

  const data = (await res.json().catch(() => null)) as
    | (TokenResponse & { error_description?: string })
    | null;
  if (!res.ok || !data?.access_token) {
    // error_description ist die Meldung von Microsoft (englisch). Sie bleibt
    // im Log, dem Nutzer wird ein deutscher Satz gezeigt.
    console.error("[microsoft] Token-Anfrage fehlgeschlagen:", res.status, data?.error_description);
    return { error: "Microsoft hat die Anmeldung abgelehnt." };
  }
  return data;
}

export function exchangeCode(
  config: MicrosoftConfig,
  code: string,
  uri: string,
  verifier: string,
): Promise<TokenResponse | { error: string }> {
  return requestToken(config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: uri,
    code_verifier: verifier,
    scope: SCOPES,
  });
}

// --- Konto in der Datenbank --------------------------------------------------

const SINGLETON = "only";

export type AccountInfo = {
  displayName: string | null;
  email: string | null;
  connectedAt: string;
};

export async function getAccount(): Promise<MicrosoftAccount | null> {
  const [row] = await db
    .select()
    .from(microsoftAccounts)
    .where(eq(microsoftAccounts.singleton, SINGLETON))
    .limit(1);
  return row ?? null;
}

export async function saveAccount(data: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope?: string | null;
  displayName?: string | null;
  email?: string | null;
}): Promise<void> {
  const values = {
    singleton: SINGLETON,
    accessToken: encrypt(data.accessToken),
    refreshToken: encrypt(data.refreshToken),
    // 60 Sekunden Sicherheitsabstand: ein Token, das waehrend des Aufrufs
    // ablaeuft, waere ein Fehler, den der Nutzer nicht erklaeren koennte.
    expiresAt: new Date(Date.now() + (data.expiresIn - 60) * 1000),
    scope: data.scope ?? null,
    displayName: data.displayName ?? null,
    email: data.email ?? null,
    updatedAt: new Date(),
  };

  await db
    .insert(microsoftAccounts)
    .values(values)
    .onConflictDoUpdate({ target: microsoftAccounts.singleton, set: values });
}

export async function deleteAccount(): Promise<void> {
  await db.delete(microsoftAccounts).where(eq(microsoftAccounts.singleton, SINGLETON));
}

export function accountInfo(row: MicrosoftAccount): AccountInfo {
  return {
    displayName: row.displayName,
    email: row.email,
    connectedAt: row.createdAt.toISOString(),
  };
}

// Gueltiges Access-Token, notfalls frisch erneuert. Schlaegt das Erneuern fehl,
// ist die Verbindung tot -- die Zeile verschwindet dann, damit die Oberflaeche
// sauber "nicht verbunden" zeigt statt bei jedem Klick denselben Fehler.
export async function accessTokenFor(
  config: MicrosoftConfig,
): Promise<{ token: string } | { error: string }> {
  const row = await getAccount();
  if (!row) return { error: "Du bist noch nicht mit Microsoft verbunden." };

  if (row.expiresAt.getTime() > Date.now()) {
    const token = decrypt(row.accessToken);
    if (token) return { token };
  }

  const refresh = decrypt(row.refreshToken);
  if (!refresh) {
    await deleteAccount();
    return { error: "Die Verbindung zu Microsoft ist abgelaufen. Bitte melde dich neu an." };
  }

  const fresh = await requestToken(config, {
    grant_type: "refresh_token",
    refresh_token: refresh,
    scope: SCOPES,
  });
  if ("error" in fresh) {
    await deleteAccount();
    return { error: "Die Verbindung zu Microsoft ist abgelaufen. Bitte melde dich neu an." };
  }

  await saveAccount({
    accessToken: fresh.access_token,
    // Microsoft schickt beim Erneuern meist ein neues Refresh-Token mit. Fehlt
    // es, bleibt das alte gueltig.
    refreshToken: fresh.refresh_token ?? refresh,
    expiresIn: fresh.expires_in,
    scope: fresh.scope ?? row.scope,
    displayName: row.displayName,
    email: row.email,
  });

  return { token: fresh.access_token };
}

// --- Graph -------------------------------------------------------------------

const GRAPH = "https://graph.microsoft.com/v1.0";

async function graph(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response | null> {
  return fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    cache: "no-store",
  }).catch(() => null);
}

export type MeDTO = { displayName: string | null; email: string | null };

export async function fetchMe(token: string): Promise<MeDTO> {
  const res = await graph(token, "/me?$select=displayName,mail,userPrincipalName");
  if (!res || !res.ok) return { displayName: null, email: null };
  const data = (await res.json().catch(() => null)) as {
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  } | null;
  return {
    displayName: data?.displayName ?? null,
    email: data?.mail ?? data?.userPrincipalName ?? null,
  };
}

// Ein Abschnitt ist die kleinste Einheit, in der eine OneNote-Seite liegen
// kann. Der Notizbuch-Name kommt per $expand gleich mit, sonst braeuchte die
// Liste einen Aufruf pro Abschnitt.
export type SectionDTO = { id: string; name: string; notebook: string | null };

export async function listSections(token: string): Promise<SectionDTO[] | { error: string }> {
  const res = await graph(
    token,
    "/me/onenote/sections?$select=id,displayName&$expand=parentNotebook($select=displayName)&$top=100",
  );
  if (!res) return { error: "Microsoft ist gerade nicht erreichbar." };
  if (!res.ok) {
    console.error("[microsoft] Abschnitte nicht abrufbar:", res.status, await res.text());
    return { error: "Deine OneNote-Abschnitte konnten nicht geladen werden." };
  }

  const data = (await res.json().catch(() => null)) as {
    value?: Array<{ id: string; displayName: string; parentNotebook?: { displayName?: string } }>;
  } | null;

  return (data?.value ?? []).map((s) => ({
    id: s.id,
    name: s.displayName,
    notebook: s.parentNotebook?.displayName ?? null,
  }));
}

// OneNote nimmt Seiten als HTML-Dokument entgegen, nicht als JSON. Der Titel
// steht im <title>, der Rest im <body> -- genau das, was lib/markdown.ts aus
// dem Notiz-Body macht.
export async function createPage(
  token: string,
  sectionId: string,
  title: string,
  bodyHtml: string,
): Promise<{ link: string | null } | { error: string }> {
  const html =
    `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>` +
    `<meta name="created" content="${new Date().toISOString()}" /></head>` +
    `<body>${bodyHtml}</body></html>`;

  const res = await graph(token, `/me/onenote/sections/${encodeURIComponent(sectionId)}/pages`, {
    method: "POST",
    headers: { "content-type": "text/html" },
    body: html,
  });

  if (!res) return { error: "Microsoft ist gerade nicht erreichbar." };
  if (res.status === 404) return { error: "Dieser OneNote-Abschnitt gibt es nicht mehr." };
  if (!res.ok) {
    console.error("[microsoft] Seite nicht angelegt:", res.status, await res.text());
    return { error: "Die Seite konnte in OneNote nicht angelegt werden." };
  }

  const data = (await res.json().catch(() => null)) as {
    links?: { oneNoteWebUrl?: { href?: string } };
  } | null;
  return { link: data?.links?.oneNoteWebUrl?.href ?? null };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
