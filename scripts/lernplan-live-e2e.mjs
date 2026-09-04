// End-to-End-Probe des Lernplans gegen die Produktion (SPEC A8 bis A18),
// hinter der Passwortsperre. Legt ein Fach "TST-Lernplan" mit einer
// Pruefung an, laeuft alle Routen durch und raeumt am Ende auf.
//
// Aufruf: set -a; . ./.env.local; set +a; node scripts/lernplan-live-e2e.mjs
// Optional: PNG_ID, PDF1_ID, PDF2_ID, SUBJECT_ID fuer A8 mit echten Dateien
// (dann wird kein TST-Fach angelegt, sondern SUBJECT_ID genutzt).
const L = process.env.ATLAS_URL ?? "https://atlas-ten-orpin.vercel.app";
const pw = process.env.ATLAS_PASSWORD;
if (!pw) throw new Error("ATLAS_PASSWORD fehlt");

let cookie = "";
let fehler = 0;
const aufraeumen = [];

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
    json = text.slice(0, 200);
  }
  return { status: res.status, json };
}

function pruefe(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`);
  if (!ok) fehler++;
  return ok;
}

function isoPlus(tage) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

const login = await ruf("/api/login", "POST", { password: pw });
if (!pruefe("Login", login.status === 200 && !!cookie, `status ${login.status}`)) process.exit(1);

try {
  // --- Fach und Pruefung ---------------------------------------------------
  let subjectId = process.env.SUBJECT_ID;
  if (!subjectId) {
    const f = await ruf("/api/subjects", "POST", { name: "TST-Lernplan" });
    subjectId = f.json?.subject?.id ?? f.json?.id;
    pruefe("Fach TST-Lernplan angelegt", f.status < 300 && !!subjectId, `status ${f.status}`);
    aufraeumen.push(() => ruf(`/api/subjects/${subjectId}`, "DELETE"));
  }
  const a = await ruf("/api/assignments", "POST", {
    subjectId,
    type: "exam",
    title: "TST-Lernplan Klassenarbeit",
    dueDate: isoPlus(8),
  });
  const assignmentId = a.json?.assignment?.id;
  if (!pruefe("Pruefung angelegt", a.status === 201 && !!assignmentId, `status ${a.status}`)) throw new Error("abbruch");
  aufraeumen.push(() => ruf(`/api/assignments/${assignmentId}`, "DELETE"));

  // --- A8: lesen -------------------------------------------------------------
  const checklistText = [
    "Klassenarbeit Mathe, Thema Bruchrechnung",
    "1. Brueche kuerzen und erweitern (S. 12-14)",
    "2. Brueche addieren und subtrahieren mit gleichem Nenner (S. 15)",
    "3. Brueche mit verschiedenen Nennern addieren, Hauptnenner finden (S. 16-18)",
    "4. Brueche multiplizieren (S. 20)",
  ].join("\n");
  const mitDateien = process.env.PNG_ID && process.env.PDF1_ID && process.env.PDF2_ID;
  const lesenBody = mitDateien
    ? { assignmentId, checklist: { fileId: process.env.PNG_ID }, fileIds: [process.env.PDF1_ID, process.env.PDF2_ID] }
    : { assignmentId, checklist: { text: checklistText }, fileIds: [] };
  const lesen = await ruf("/api/lernen/plan/lesen", "POST", lesenBody);
  const punkte = lesen.json?.entwurf?.punkte ?? [];
  pruefe(`A8 lesen 200 mit >= 3 Punkten${mitDateien ? " (PNG + 2 PDF)" : " (Text, ohne Dateien)"}`, lesen.status === 200 && punkte.length >= 3, `status ${lesen.status}, ${punkte.length} Punkte, hinweis ${JSON.stringify(lesen.json?.hinweis ?? null)}`);
  pruefe("A8 jeder Punkt mit frage", punkte.length > 0 && punkte.every((p) => typeof p.frage === "string" && p.frage.length > 0), punkte.map((p) => p.frage?.slice(0, 40)).join(" | "));
  if (mitDateien) pruefe("A8 mindestens ein Punkt mit fileIds", punkte.some((p) => p.fileIds?.length > 0));
  if (punkte.length < 3) throw new Error("abbruch");

  // --- A9: bewerten ----------------------------------------------------------
  const drei = punkte.slice(0, 3);
  const bew = await ruf("/api/lernen/plan/bewerten", "POST", {
    subjectId,
    antworten: [
      { frage: drei[0].frage, musterantwort: drei[0].musterantwort, antwort: drei[0].musterantwort },
      { frage: drei[1].frage, musterantwort: drei[1].musterantwort, antwort: "Banane" },
      { frage: drei[2].frage, musterantwort: drei[2].musterantwort, antwort: null },
    ],
  });
  const urteile = Array.isArray(bew.json) ? bew.json : [];
  pruefe("A9 bewerten 3 Urteile", bew.status === 200 && urteile.length === 3, `status ${bew.status}, ${JSON.stringify(urteile.map((u) => u.urteil))}`);
  pruefe("A9 richtig bei Musterantwort", urteile[0]?.urteil === "richtig", urteile[0]?.urteil);
  pruefe("A9 Unsinn nicht richtig", urteile[1]?.urteil && urteile[1].urteil !== "richtig", urteile[1]?.urteil);
  pruefe("A9 null ist falsch mit Uebersprungen", urteile[2]?.urteil === "falsch" && /bersprungen/.test(urteile[2]?.feedback ?? ""), JSON.stringify(urteile[2]));

  // --- A10: plan -------------------------------------------------------------
  const checks = drei.map((p, i) => ({
    pointIndex: i,
    frage: p.frage,
    musterantwort: p.musterantwort ?? "",
    antwort: i === 2 ? null : i === 0 ? p.musterantwort : "Banane",
    urteil: i === 0 ? "richtig" : "falsch",
    feedback: urteile[i]?.feedback ?? "",
  }));
  const planBody = {
    assignmentId,
    checklist: mitDateien ? { fileId: process.env.PNG_ID } : { text: checklistText },
    fileIds: mitDateien ? [process.env.PDF1_ID, process.env.PDF2_ID] : [],
    minutesWeekday: 30,
    minutesWeekend: 60,
    punkte: drei,
    checks,
    ersetzen: false,
  };
  const plan1 = await ruf("/api/lernen/plan", "POST", planBody);
  const plan = plan1.json?.plan;
  if (!pruefe("A10 plan 200", plan1.status === 200 && !!plan, `status ${plan1.status} ${JSON.stringify(plan1.json).slice(0, 200)}`)) throw new Error("abbruch");
  const heute = isoPlus(0);
  const vortag = isoPlus(7);
  const p0 = plan.punkte[0];
  const p1 = plan.punkte[1];
  const itemsVon = (pid) => plan.items.filter((i) => i.pointId === pid).map((i) => i.phase);
  pruefe("A10 richtig-Punkt ohne lernen", !itemsVon(p0.id).includes("lernen"), JSON.stringify(itemsVon(p0.id)));
  pruefe("A10 falsch-Punkt mit lernen/ueben/probe", ["lernen", "ueben", "probe"].every((ph) => itemsVon(p1.id).includes(ph)), JSON.stringify(itemsVon(p1.id)));
  pruefe("A10 alle Items zwischen heute und Vortag", plan.items.every((i) => i.date >= heute && i.date <= vortag), `${plan.items.length} Items`);
  const letzter = [...plan.items].sort((x, y) => x.date.localeCompare(y.date)).at(-1);
  pruefe("A10 letzter Tag simulation", letzter?.phase === "simulation" && letzter.date === vortag, `${letzter?.phase} ${letzter?.date}`);
  pruefe("A10 Sicherheit diagnose 100/0", p0.sicherheit === 100 && p0.sicherheitQuelle === "diagnose" && p1.sicherheit === 0, `${p0.sicherheit}/${p1.sicherheit}`);
  const plan2 = await ruf("/api/lernen/plan", "POST", planBody);
  pruefe("A10 zweiter POST ohne ersetzen 409", plan2.status === 409 && plan2.json?.error === "plan_gerade_erstellt", `status ${plan2.status}`);

  // --- A11: ohne Test --------------------------------------------------------
  const plan3 = await ruf("/api/lernen/plan", "POST", { ...planBody, checks: null, ersetzen: true });
  const pl3 = plan3.json?.plan;
  pruefe("A11 checks null 200, alle 50 ohne_test", plan3.status === 200 && pl3?.punkte.every((p) => p.sicherheit === 50 && p.sicherheitQuelle === "ohne_test"), `status ${plan3.status}`);
  pruefe("A11 Themen wiederverwendet", (plan3.json?.createdTopicIds ?? []).length === 0, `${(plan3.json?.createdTopicIds ?? []).length} neu`);

  // --- A12: fremde Datei -----------------------------------------------------
  const fremd = await ruf("/api/lernen/plan/lesen", "POST", { assignmentId, checklist: { text: checklistText }, fileIds: ["00000000-0000-0000-0000-000000000001"] });
  pruefe("A12 fremde fileId 400 dateien_fremd", fremd.status === 400 && fremd.json?.error === "dateien_fremd", `status ${fremd.status} ${fremd.json?.error}`);
  if (process.env.SCAN_PDF_ID) {
    const scan = await ruf("/api/lernen/plan/lesen", "POST", { assignmentId, checklist: { fileId: process.env.SCAN_PDF_ID }, fileIds: [] });
    pruefe("A12 Scan-PDF 422 pdf_ohne_text", scan.status === 422 && scan.json?.error === "pdf_ohne_text", `status ${scan.status}`);
  } else console.log("SKIP A12 pdf_ohne_text (SCAN_PDF_ID nicht gesetzt)");

  // Fuer A13/A17 einen Plan mit Diagnose (Punkt 1 falsch -> probe vorhanden)
  const plan4 = await ruf("/api/lernen/plan", "POST", { ...planBody, ersetzen: true });
  const pl4 = plan4.json?.plan;
  if (!pruefe("Plan fuer A13 neu", plan4.status === 200 && !!pl4)) throw new Error("abbruch");
  const planId = pl4.id;
  const probe = pl4.items.find((i) => i.phase === "probe");
  const vorher = (await ruf("/api/assignments")).json?.assignments?.find((x) => x.id === assignmentId)?.lernplan;

  // --- A13: probe abhaken ----------------------------------------------------
  const patch = await ruf(`/api/lernen/plan/items/${probe.id}`, "PATCH", { done: true, result: 0 });
  pruefe("A13 PATCH probe done result 0", patch.status === 200 && patch.json?.item?.doneAt, `status ${patch.status}`);
  const nach13 = (await ruf(`/api/lernen/plan/${assignmentId}`)).json?.plan;
  const punktProbe = nach13?.punkte.find((p) => p.id === probe.pointId);
  pruefe("A13 Punkt 0 mit Quelle selbst", punktProbe?.sicherheit === 0 && punktProbe?.sicherheitQuelle === "selbst", `${punktProbe?.sicherheit} ${punktProbe?.sicherheitQuelle}`);
  const nachher = (await ruf("/api/assignments")).json?.assignments?.find((x) => x.id === assignmentId)?.lernplan;
  pruefe("A13 assignments lernplan.done +1", nachher?.done === (vorher?.done ?? 0) + 1, `${vorher?.done} -> ${nachher?.done}`);
  pruefe("A19 assignments lernplan-Feld", nachher && typeof nachher.total === "number" && typeof nachher.sicherheit === "number", JSON.stringify(nachher).slice(0, 120));

  // --- A14: Karte bewerten setzt Quelle karten ------------------------------
  const punktKarte = nach13.punkte[1];
  const karte = await ruf("/api/lernen/karten", "POST", { subjectId, question: "TST Frage?", answer: "TST Antwort", topicId: punktKarte.topicId });
  const karteId = karte.json?.card?.id ?? karte.json?.id;
  pruefe("A14 Karte am Thema angelegt", karte.status < 300 && !!karteId, `status ${karte.status}`);
  const rev = await ruf(`/api/lernen/karten/${karteId}/antwort`, "POST", { correct: true });
  pruefe("A14 reviewCard 200", rev.status === 200, `status ${rev.status}`);
  const nach14 = (await ruf(`/api/lernen/plan/${assignmentId}`)).json?.plan;
  const pk = nach14?.punkte.find((p) => p.id === punktKarte.id);
  pruefe("A14 Punkt-Sicherheit Quelle karten (Box 1 -> 20)", pk?.sicherheitQuelle === "karten" && pk?.sicherheit === 20, `${pk?.sicherheit} ${pk?.sicherheitQuelle}`);

  // --- A17: verteilen --------------------------------------------------------
  const vert = await ruf(`/api/lernen/plan/${planId}/verteilen`, "POST", { umfang: "ueberfaellig" });
  pruefe("A17 verteilen ueberfaellig 200", vert.status === 200, `status ${vert.status} neu ${vert.json?.neu} zusaetzlich ${vert.json?.zusaetzlich}`);
  const erledigtBleibt = vert.json?.plan?.items.find((i) => i.id === probe.id);
  pruefe("A17 erledigte Einheit bleibt", !!erledigtBleibt && !!erledigtBleibt.doneAt);
  const vertAlle = await ruf(`/api/lernen/plan/${planId}/verteilen`, "POST", { umfang: "alle_offen" });
  const uebenA13 = vertAlle.json?.plan?.items.filter((i) => i.pointId === probe.pointId && i.phase === "ueben" && !i.doneAt) ?? [];
  pruefe("A17 Punkt aus A13 (0 %) hat offene ueben", vertAlle.status === 200 && uebenA13.length >= 1, `${uebenA13.length} ueben`);
  console.log("HINWEIS A17: frisch angelegter Plan hat keine ueberfaelligen Einheiten, 'ueberfaellig' legt daher nichts neu; Zusatz-ueben ueber 'alle_offen' belegt.");

  // --- A18: loeschen ---------------------------------------------------------
  const topicIds = nach14.punkte.map((p) => p.topicId).filter(Boolean);
  const fremdDel = await ruf(`/api/lernen/plan/${planId}`, "DELETE", { topicIds: ["00000000-0000-0000-0000-000000000002"] });
  pruefe("A18 fremde topicIds 400", fremdDel.status === 400, `status ${fremdDel.status}`);
  const del = await ruf(`/api/lernen/plan/${planId}`, "DELETE", { topicIds: [topicIds[0]] });
  pruefe("A18 DELETE 200", del.status === 200 || del.status === 204, `status ${del.status}`);
  const weg = await ruf(`/api/lernen/plan/${assignmentId}`);
  pruefe("A18 Plan weg (404 kein_plan)", weg.status === 404, `status ${weg.status}`);
  const themen = (await ruf(`/api/lernen/${subjectId}`)).json;
  const themenIds = JSON.stringify(themen);
  pruefe("A18 erstes Thema mitgeloescht, restliche bleiben", !themenIds.includes(topicIds[0]) && topicIds.slice(1).every((t) => themenIds.includes(t)), `${topicIds.length} Themen`);
  for (const t of topicIds.slice(1)) aufraeumen.push(() => ruf(`/api/lernen/themen/${t}`, "DELETE"));
} catch (e) {
  if (String(e?.message) !== "abbruch") {
    console.log("FAIL Ausnahme:", e);
    fehler++;
  }
} finally {
  for (const f of aufraeumen.reverse()) {
    try {
      const r = await f();
      console.log("aufgeraeumt:", r.status);
    } catch (e) {
      console.log("Aufraeumen fehlgeschlagen:", e?.message);
    }
  }
}

console.log(fehler === 0 ? "\nALLES GRUEN" : `\n${fehler} FEHLER`);
process.exit(fehler === 0 ? 0 : 1);
