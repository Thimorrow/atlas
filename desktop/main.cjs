const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");
const { ATLAS_URL, isAtlasUrl, isExternalUrl } = require("./navigation.cjs");

let window;

function openExternal(url) {
  if (isExternalUrl(url)) shell.openExternal(url).catch(console.error);
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
  contents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isAtlasUrl(url)) {
      window.loadFile(path.join(__dirname, "offline.html")).catch(console.error);
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
