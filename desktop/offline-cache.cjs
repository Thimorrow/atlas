// Letzter bekannter Stand fuer die Offline-Seite der Mac-App.
//
// Die App zeigt bisher nur eine Fehlerseite, wenn das Netz weg ist -- dabei ist
// der haeufigste Fall unterwegs ("Was habe ich heute?") genau der, fuer den es
// die Daten schon einmal gab. Diese Datei haelt fest, was der Server zuletzt
// ausgeliefert hat, und rendert daraus eine Seite.
//
// Drei Entscheidungen:
//
// 1. Gespeichert wird NUR, was die App ohnehin geladen hat (GET /api/home).
//    Kein eigener Abruf im Hintergrund, keine zweite Anfrage.
// 2. Der Stand wird immer mit Datum und Uhrzeit angezeigt. Veraltete Daten, die
//    aussehen wie aktuelle, waeren schlimmer als gar keine -- man wuerde eine
//    abgesagte Stunde fuer echt halten.
// 3. Alles aus dem Server wird escaped. Titel und Facher kommen aus der
//    Datenbank und aus WebUntis; die Offline-Seite ist reines HTML ohne
//    Skript, aber ein < im Klassennamen darf die Seite trotzdem nicht
//    zerlegen.
//
// Die Datei ist bewusst reines CommonJS und ohne Electron-Import: damit laesst
// sie sich in Vitest testen, wie desktop/navigation.cjs es schon macht.

const fs = require("node:fs");
const path = require("node:path");

const VERSION = 1;

// Europe/Berlin, nicht UTC: nach 22 Uhr deutscher Sommerzeit waere
// toISOString() schon der naechste Tag.
function heuteBerlin(jetzt = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt);
}

function zeitBerlin(wert) {
  const datum = typeof wert === "string" ? new Date(wert) : wert;
  if (!(datum instanceof Date) || Number.isNaN(datum.getTime())) return null;
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(datum);
}

function tagBerlin(wert) {
  const datum = typeof wert === "string" ? new Date(wert) : wert;
  if (!(datum instanceof Date) || Number.isNaN(datum.getTime())) return null;
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(datum);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Welcher Tag aus der Woche gezeigt wird: der Tag, an dem der Abruf passiert
// ist. Laesst sich der nicht zuordnen (der Aufruf galt einem anderen Tag),
// faellt es auf den ersten Tag mit Unterricht zurueck.
function tagAuswaehlen(home, tagISO) {
  const days = home?.week?.days;
  if (!Array.isArray(days) || days.length === 0) return null;
  return days.find((d) => d?.date === tagISO) ?? days.find((d) => (d?.events ?? []).length > 0) ?? days[0];
}

function statusLabel(status) {
  if (status === "cancelled") return "entfällt";
  if (status === "substituted") return "Vertretung";
  return null;
}

// Aus der Serverantwort einen kleinen, langlebigen Stand machen. Absichtlich
// defensiv: fehlt ein Feld, faellt es weg -- die Offline-Seite darf an einer
// Aenderung im Server nicht zerbrechen.
function zustandAusHome(home, jetzt = new Date()) {
  const tagISO = heuteBerlin(jetzt);
  const tag = tagAuswaehlen(home, tagISO);

  const stunden = Array.isArray(tag?.events)
    ? tag.events.map((e) => ({
        von: typeof e?.startTime === "string" ? e.startTime.slice(0, 5) : null,
        bis: typeof e?.endTime === "string" ? e.endTime.slice(0, 5) : null,
        titel: String(e?.title ?? "Unterricht"),
        raum: e?.room ? String(e.room) : null,
        hinweis: statusLabel(e?.status),
      }))
    : [];

  const aufgaben = (Array.isArray(home?.assignments) ? home.assignments : [])
    .filter((a) => a && !a.completedAt && typeof a.title === "string")
    .map((a) => ({
      titel: String(a.title),
      fach: a.subjectName ? String(a.subjectName) : null,
      faellig: typeof a.dueDate === "string" ? a.dueDate : null,
      art: typeof a.type === "string" ? a.type : null,
    }))
    // Frueheste zuerst; Aufgaben ohne Datum danach.
    .sort((a, b) => (a.faellig ?? "9999-12-31").localeCompare(b.faellig ?? "9999-12-31"))
    .slice(0, 12);

  return {
    version: VERSION,
    gespeichertAm: jetzt.toISOString(),
    tag: tag?.date ?? null,
    tagIstHeute: (tag?.date ?? null) === tagISO,
    stunden,
    aufgaben,
  };
}

function zustandSchreiben(datei, zustand) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, JSON.stringify(zustand), "utf8");
}

function zustandLesen(datei) {
  try {
    const roh = JSON.parse(fs.readFileSync(datei, "utf8"));
    if (!roh || roh.version !== VERSION || !Array.isArray(roh.stunden) || !Array.isArray(roh.aufgaben)) return null;
    return roh;
  } catch {
    // Fehlende oder kaputte Datei ist kein Fehlerfall, sondern der Normalfall
    // beim ersten Start.
    return null;
  }
}

function stundenListe(stunden) {
  if (stunden.length === 0) return "<p class=\"leer\">Kein Unterricht eingetragen.</p>";
  return `<ul>${stunden
    .map((s) => {
      const zeit = s.von ? `${escapeHtml(s.von)}${s.bis ? `–${escapeHtml(s.bis)}` : ""}` : "";
      const neben = [s.raum ? escapeHtml(s.raum) : null, s.hinweis ? `<em>${escapeHtml(s.hinweis)}</em>` : null]
        .filter(Boolean)
        .join(" · ");
      return `<li><span class="zeit">${zeit}</span><span class="titel">${escapeHtml(s.titel)}</span>${
        neben ? `<span class="neben">${neben}</span>` : ""
      }</li>`;
    })
    .join("")}</ul>`;
}

function aufgabenListe(aufgaben, tagISO) {
  if (aufgaben.length === 0) return "<p class=\"leer\">Nichts Offenes.</p>";
  return `<ul>${aufgaben
    .map((a) => {
      const neben = [a.fach ? escapeHtml(a.fach) : null, faelligLabel(a.faellig, tagISO)].filter(Boolean).join(" · ");
      return `<li><span class="titel">${escapeHtml(a.titel)}</span>${neben ? `<span class="neben">${neben}</span>` : ""}</li>`;
    })
    .join("")}</ul>`;
}

function faelligLabel(faellig, tagISO) {
  if (!faellig) return "ohne Datum";
  if (faellig === tagISO) return "heute fällig";
  const label = tagBerlin(`${faellig}T00:00:00Z`);
  return faellig < tagISO ? `überfällig seit ${label}` : `fällig ${label}`;
}

// Die Offline-Seite. Ohne Stand kommt genau die Meldung, die es vorher gab --
// nur ohne die Behauptung, es gaebe nichts anzuzeigen.
function offlineHtml(zustand, optionen = {}) {
  const atlasUrl = optionen.atlasUrl ?? "https://atlas-ten-orpin.vercel.app";
  const jetzt = optionen.jetzt ?? new Date();
  const tagISO = heuteBerlin(jetzt);
  const icon = optionen.iconDatenUrl;

  const kopf = `<img src="${icon}" alt="">`;
  const knoepfe = `<p><a class="knopf" href="${escapeHtml(atlasUrl)}">Erneut versuchen</a></p>`;

  const inhalt = zustand
    ? `
      <p class="stand">Letzter Stand: ${escapeHtml(zeitBerlin(zustand.gespeichertAm) ?? "unbekannt")}${
        zustand.tag ? ` · ${escapeHtml(tagBerlin(`${zustand.tag}T00:00:00Z`) ?? zustand.tag)}` : ""
      }</p>
      <p class="hinweis">Du bist offline. Atlas zeigt, was zuletzt vom Server kam – neu ist das nicht.</p>
      <section><h2>Stunden</h2>${stundenListe(zustand.stunden)}</section>
      <section><h2>Offen</h2>${aufgabenListe(zustand.aufgaben, tagISO)}</section>`
    : `
      <p class="hinweis">Prüfe deine Internetverbindung und versuche es erneut. Auch eine kurze Serverstörung kann die Ursache sein.</p>`;

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
    <title>Atlas – ${zustand ? "offline, letzter Stand" : "Verbindung prüfen"}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #18181b; color: #fafafa; font: 16px/1.6 system-ui, sans-serif; }
      main { width: min(560px, 100%); padding: 40px; }
      img { width: 64px; height: 64px; }
      h1 { font-size: 24px; line-height: 1.25; margin: 16px 0 8px; }
      h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #a1a1aa; margin: 28px 0 8px; }
      .stand { color: #a1a1aa; font-size: 14px; margin: 0; }
      .hinweis { color: #d4d4d8; font-size: 14px; }
      .leer { color: #71717a; font-size: 14px; margin: 0; }
      ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
      li { display: grid; grid-template-columns: 4.5rem 1fr auto; gap: 10px; align-items: baseline; padding: 10px 12px; background: #27272a; border-radius: 10px; }
      li .titel { font-weight: 600; }
      li .zeit { font-variant-numeric: tabular-nums; color: #a1a1aa; font-size: 13px; }
      li .neben { grid-column: 2 / -1; color: #a1a1aa; font-size: 13px; }
      .knopf { display: inline-block; margin-top: 24px; padding: 10px 22px; background: #fafafa; color: #18181b; border-radius: 10px; text-decoration: none; font-weight: 600; }
      .knopf:focus-visible { outline: 3px solid #a5b4fc; outline-offset: 5px; }
    </style>
  </head>
  <body>
    <main>
      ${kopf}
      <h1>Atlas ist gerade nicht erreichbar</h1>
      ${inhalt}
      ${knoepfe}
    </main>
  </body>
</html>
`;
}

// Das Icon als Daten-URL einbetten: die erzeugte Seite wird in den
// Benutzerordner geschrieben, ein relativer Pfad wuerde dort ins Leere zeigen.
function iconDatenUrl(iconPfad) {
  try {
    return `data:image/png;base64,${fs.readFileSync(iconPfad).toString("base64")}`;
  } catch {
    return "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  }
}

module.exports = {
  VERSION,
  escapeHtml,
  heuteBerlin,
  iconDatenUrl,
  offlineHtml,
  zustandAusHome,
  zustandLesen,
  zustandSchreiben,
};
