const { app, BrowserWindow, Menu, net, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { ATLAS_URL, isAtlasUrl, isExternalUrl } = require("./navigation.cjs");
const {
  iconDatenUrl,
  offlineHtml,
  zustandAusHome,
  zustandLesen,
  zustandSchreiben,
} = require("./offline-cache.cjs");

let window;

function openExternal(url) {
  if (isExternalUrl(url)) shell.openExternal(url).catch(console.error);
}

function zustandDatei() {
  return path.join(app.getPath("userData"), "atlas-offline.json");
}

// Den letzten Stand mitschreiben, den der Server ohnehin ausliefert.
//
// /api/home ist genau die eine Antwort, in der alles steckt, was die
// Offline-Seite braucht (Woche, Aufgaben, Sync-Stand) -- und die App ruft sie
// beim Start ohnehin auf. Deshalb wird nichts zusaetzlich abgefragt: erst wenn
// der Abruf erfolgreich war, holt die App denselben Aufruf noch einmal ueber
// dieselbe Sitzung (mit dem Anmelde-Cookie) und legt die Antwort ab. Ein
// Electron-eigenes Auslesen des Antwortkoerpers gibt es nicht; ueber net.fetch
// ist es derselbe Anmeldezustand ohne Nachfrage nach dem Passwort.
function letzterStandMerken(contents) {
  contents.session.webRequest.onCompleted({ urls: [`${ATLAS_URL}/api/home*`] }, (details) => {
    if (details.method !== "GET" || details.statusCode !== 200) return;
    net
      .fetch(details.url, { session: contents.session })
      .then((antwort) => (antwort.ok ? antwort.json() : null))
      .then((home) => {
        if (home) zustandSchreiben(zustandDatei(), zustandAusHome(home));
      })
      .catch(() => {
        // Kein Netz, kein Stand: die Offline-Seite faellt dann auf den
        // Hinweistext zurueck.
      });
  });
}

// Die Offline-Seite wird erzeugt statt als feste Datei geladen: nur so kann
// der zuletzt gemerkte Stand darin stehen. Geschrieben wird in den
// Benutzerordner, nicht in die App -- ein signiertes Buendel ist kein Ort fuer
// veraenderliche Dateien.
function offlineSeiteZeigen() {
  const zustand = zustandLesen(zustandDatei());
  const seite = path.join(app.getPath("userData"), "offline.html");
  fs.writeFileSync(
    seite,
    offlineHtml(zustand, {
      atlasUrl: ATLAS_URL,
      iconDatenUrl: iconDatenUrl(path.join(__dirname, "icon.png")),
    }),
    "utf8",
  );
  return window.loadFile(seite);
}

function createWindow() {
  window = new BrowserWindow({
    title: "Atlas",
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 580,
    backgroundColor: "#18181b",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: "persist:atlas",
    },
  });

  const contents = window.webContents;
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
  contents.on("will-attach-webview", (event) => event.preventDefault());
  for (const eventName of ["will-navigate", "will-redirect"]) {
    contents.on(eventName, (event, url) => {
      if (!isAtlasUrl(url)) {
        event.preventDefault();
        openExternal(url);
      }
    });
  }
  contents.setWindowOpenHandler(({ url }) => {
    if (isAtlasUrl(url)) contents.loadURL(url).catch(console.error);
    else openExternal(url);
    return { action: "deny" };
  });
  letzterStandMerken(contents);
  contents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    // -3 ist ERR_ABORTED und entsteht auch bei einem normalen Abbruch (z.B.
    // Weiterleitung) -- dafuer gibt es keinen Grund, offline zu gehen.
    if (isMainFrame && code !== -3 && isAtlasUrl(url)) {
      try {
        offlineSeiteZeigen().catch(console.error);
      } catch (fehler) {
        // Kann der Benutzerordner nicht beschrieben werden, bleibt die feste
        // Seite aus dem Programmordner -- lieber die alte Meldung als ein
        // leeres Fenster.
        console.error("Die Offline-Seite liess sich nicht schreiben:", fehler);
        window.loadFile(path.join(__dirname, "offline.html")).catch(console.error);
      }
    }
  });
  window.on("closed", () => { window = null; });
  window.loadURL(ATLAS_URL).catch(console.error);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "Atlas", submenu: [{ role: "about" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] },
      { label: "Bearbeiten", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
      { label: "Ansicht", submenu: [
        { label: "Atlas öffnen / erneut verbinden", accelerator: "CmdOrCtrl+R", click: () => window?.loadURL(ATLAS_URL).catch(console.error) },
        { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" },
      ] },
      { label: "Fenster", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }] },
    ]));
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
