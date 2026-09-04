// Live-Smoke fuer den Lernplan (SPEC A23) gegen die Produktion, hinter der
// Passwortsperre. Nur lesende Aufrufe plus ein 307/401-Check ohne Login.
//
// Aufruf: set -a; . ./.env.local; set +a; node scripts/lernplan-live-check.mjs
const L = process.env.ATLAS_URL ?? "https://atlas-ten-orpin.vercel.app";
const pw = process.env.ATLAS_PASSWORD;
if (!pw) throw new Error("ATLAS_PASSWORD fehlt");

let cookie = "";
let fehler = 0;

async function ruf(pfad, methode = "GET", body, mitCookie = true) {
  const res = await fetch(L + pfad, {
    method: methode,
    headers: { "content-type": "application/json", ...(mitCookie && cookie ? { cookie } : {}) },
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
    json = text.slice(0, 200);
  }
  return { status: res.status, json, location: res.headers.get("location") };
}

function pruefe(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`);
  if (!ok) fehler++;
}

// A21: ohne Login
const ohne = await ruf("/api/lernen/plan/00000000-0000-0000-0000-000000000000", "GET", undefined, false);
pruefe("A21 API ohne Login 401/307", ohne.status === 401 || ohne.status === 307, `status ${ohne.status}`);
const seiteOhne = await ruf("/lernen/x/plan/y", "GET", undefined, false);
pruefe("A21 Seite ohne Login 307 /login", seiteOhne.status === 307 && (seiteOhne.location ?? "").includes("/login"), `status ${seiteOhne.status} ${seiteOhne.location ?? ""}`);

const login = await ruf("/api/login", "POST", { password: pw });
pruefe("Login", login.status === 200 && !!cookie, `status ${login.status}`);
if (login.status !== 200) process.exit(1);

// A19/A23: Felder vorhanden
const a = await ruf("/api/assignments");
const liste = a.json?.assignments ?? [];
pruefe("GET /api/assignments 200", a.status === 200, `status ${a.status}`);
const pruefungen = liste.filter((x) => x.type !== "hausaufgabe" && x.type !== "homework");
pruefe(
  "assignments: lernplan-Feld an Pruefungen",
  pruefungen.length === 0 || pruefungen.every((x) => "lernplan" in x),
  `${pruefungen.length} Pruefungen`,
);

const m = await ruf("/api/morgen");
pruefe("GET /api/morgen 200 mit lernen[]", m.status === 200 && Array.isArray(m.json?.lernen), `status ${m.status}, lernen=${JSON.stringify(m.json?.lernen)?.slice(0, 80)}`);

const s = await ruf("/api/stunde");
pruefe("GET /api/stunde 200 mit lernen[]", s.status === 200 && Array.isArray(s.json?.lernen), `status ${s.status}`);

// Planseite ohne Plan -> 200, API ohne Plan -> 404 kein_plan
const kandidat = pruefungen.find((x) => x.subjectId && !x.lernplan);
if (kandidat) {
  const p = await ruf(`/api/lernen/plan/${kandidat.id}`);
  pruefe("GET /api/lernen/plan/[a] ohne Plan 404 kein_plan", p.status === 404 && p.json?.error === "kein_plan", `status ${p.status}`);
  const seite = await ruf(`/lernen/${kandidat.subjectId}/plan/${kandidat.id}`);
  pruefe("Planseite ohne Plan 200", seite.status === 200, `status ${seite.status}`);
  const neu = await ruf(`/lernen/${kandidat.subjectId}/plan/${kandidat.id}/neu`);
  pruefe("Erstell-Seite 200", neu.status === 200, `status ${neu.status}`);
} else {
  console.log("SKIP Planseite: keine Pruefung ohne Plan gefunden");
}

// Bestand unveraendert
const k = await ruf("/api/lernen");
pruefe("GET /api/lernen 200", k.status === 200, `status ${k.status}`);

console.log(fehler === 0 ? "\nALLES GRUEN" : `\n${fehler} FEHLER`);
process.exit(fehler === 0 ? 0 : 1);
