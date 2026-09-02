// Einmaliger Live-Durchlauf gegen die Produktion, hinter der Passwortsperre.
//
// Aufruf: set -a; . ./.env.local; set +a; node scripts/live-check.mjs "POST /api/..."
const L = process.env.ATLAS_URL ?? "https://atlas-ten-orpin.vercel.app";
const pw = process.env.ATLAS_PASSWORD;
if (!pw) throw new Error("ATLAS_PASSWORD fehlt");

let cookie = "";

async function ruf(pfad, methode = "GET", body) {
  const res = await fetch(L + pfad, {
    method: methode,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    if (!c.startsWith("__")) cookie = c.split(";")[0];
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 300);
  }
  return { status: res.status, json };
}

const login = await ruf("/api/login", "POST", { password: pw });
console.log("login:", login.status, cookie ? "Cookie erhalten" : "KEIN Cookie");
if (login.status !== 200) process.exit(1);

for (const schritt of process.argv.slice(2)) {
  const [methode, pfad] = schritt.split(" ");
  const r = await ruf(pfad, methode);
  console.log(`\n${methode} ${pfad} -> ${r.status}`);
  console.log(JSON.stringify(r.json, null, 2).slice(0, 5000));
}
