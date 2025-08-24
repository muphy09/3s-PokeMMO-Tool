// electron/main.js
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

// ------------------------------
// Small updater log helper
// ------------------------------
function upLog(msg) {
  try {
    fs.appendFileSync(
      path.join(app.getPath('userData'), 'pokemmo-tool.log'),
      `[${new Date().toISOString()}] ${msg}\n`
    );
  } catch (_) {}
}

let mainWindow = null;
let liveRouteProc = null;

// Resolve a resource path both in dev and prod
function resolveResource(...p) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...p)
    : path.resolve(__dirname, '..', ...p);
}

// ------------------------------
// LiveRouteOCR helper launcher
// ------------------------------
function findLiveRouteExe() {
  const exe = process.platform === 'win32' ? 'LiveRouteOCR.exe' : 'LiveRouteOCR';
  const candidates = app.isPackaged
    ? [
        // packaged (extraResources)
        path.join(process.resourcesPath, 'LiveRouteOCR', exe),
        path.join(process.resourcesPath, 'live-helper', exe),
        path.join(process.resourcesPath, 'resources', 'LiveRouteOCR', exe),
      ]
    : [
        // dev – run from repo
        path.join(__dirname, '..', 'LiveRouteOCR', exe),
        path.join(__dirname, 'LiveRouteOCR', exe),
        path.join(__dirname, '..', 'resources', 'LiveRouteOCR', exe),
      ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function startLiveRouteOCR() {
  try {
    const exe = findLiveRouteExe();
    if (!exe) {
      console.warn('[LiveRouteOCR] executable not found in expected locations.');
      return;
    }

    liveRouteProc = spawn(exe, [], {
      cwd: path.dirname(exe),
      windowsHide: true,
      detached: false,
      stdio: 'ignore',
    });

    liveRouteProc.on('error', (err) => {
      console.warn('[LiveRouteOCR] spawn error:', err);
      dialog.showMessageBox({
        type: 'warning',
        message: 'Could not start LiveRouteOCR helper.',
        detail: String(err && err.message || err),
      });
    });

    liveRouteProc.on('exit', (code, signal) => {
      console.log('[LiveRouteOCR] exited', code, signal);
      liveRouteProc = null;
    });
  } catch (err) {
    console.warn('[LiveRouteOCR] failed to launch:', err);
  }
}

// ------------------------------
// Browser window
// ------------------------------
function createWindow() {
  const windowIcon = (() => {
    const dev = resolveResource('resources', 'icon.ico');
    const prod = resolveResource('icon.ico');
    return fs.existsSync(app.isPackaged ? prod : dev) ? (app.isPackaged ? prod : dev) : undefined;
  })();

  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0b1220',
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Required on Windows for correct taskbar icon/pinning
  app.setAppUserModelId('com.pokemmo.tool');

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173/');
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ------------------------------
// Auto updates
// ------------------------------
ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('check-updates', async () => {
  try {
    upLog('manual: checkForUpdatesAndNotify()');
    const res = await autoUpdater.checkForUpdatesAndNotify();
    upLog(`manual: result ${res ? JSON.stringify(res.updateInfo) : 'no update'}`);
    return res?.updateInfo ?? null;
  } catch (err) {
    upLog(`manual: error ${err?.stack || err}`);
    throw err;
  }
});

function setupAutoUpdates() {
  // Force GitHub feed; removes dependence on app-update.yml shipping
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'muphy09',
    repo: '3s-PokeMMO-Tool',
  });

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => upLog('updater: checking-for-update'));
  autoUpdater.on('update-available', (info) => upLog(`updater: update-available ${info?.version}`));
  autoUpdater.on('update-not-available', () => upLog('updater: update-not-available'));
  autoUpdater.on('error', (err) => upLog(`updater: error ${err?.stack || err}`));
  autoUpdater.on('download-progress', (p) => upLog(`updater: progress ${Math.round(p?.percent || 0)}%`));
  autoUpdater.on('update-downloaded', (info) => {
    upLog(`updater: update-downloaded ${info?.version}`);
    // Uncomment if you prefer an immediate prompt instead of install-on-quit:
    // const { dialog } = require('electron');
    // dialog.showMessageBox({ message: `Update ${info?.version} downloaded. Install now?`, buttons: ['Install now', 'Later'] })
    //   .then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall(); });
  });

  // Kick off at startup (few seconds after ready)
  setTimeout(() => {
    upLog('startup: checkForUpdatesAndNotify()');
    autoUpdater.checkForUpdatesAndNotify().catch((e) => upLog(`startup: error ${e}`));
  }, 3000);

  // Background checks every 6h
  setInterval(() => {
    upLog('interval: checkForUpdates()');
    autoUpdater.checkForUpdates().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}

// ------------------------------
// App lifecycle
// ------------------------------
app.whenReady().then(() => {
  createWindow();
  startLiveRouteOCR();
  setupAutoUpdates();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    if (liveRouteProc && !liveRouteProc.killed) liveRouteProc.kill();
  } catch (_) {}
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
