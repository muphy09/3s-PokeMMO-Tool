// electron/main.js
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let liveRouteProc = null;

/* =========================
   Logging (updater + OCR)
   ========================= */
function logLine(scope, msg) {
  try {
    fs.appendFileSync(
      path.join(app.getPath('userData'), 'pokemmo-tool.log'),
      `[${new Date().toISOString()}] ${scope}: ${msg}\n`
    );
  } catch {}
}

/* =========================
   Resource resolution
   ========================= */
function resolveResource(...p) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...p)
    : path.resolve(__dirname, '..', ...p);
}

/* =========================
   LiveRouteOCR launcher
   ========================= */
function listOcrCandidates() {
  const exe = process.platform === 'win32' ? 'LiveRouteOCR.exe' : 'LiveRouteOCR';
  const list = [];

  // ---- Packaged locations (extraResources variants)
  // flat inside resources
  list.push(path.join(process.resourcesPath, 'LiveRouteOCR', exe));
  // with resources/ prefix sometimes added by builders
  list.push(path.join(process.resourcesPath, 'resources', 'LiveRouteOCR', exe));
  // deep .NET publish paths (common when copying publish/ into resources)
  list.push(
    path.join(
      process.resourcesPath,
      'LiveRouteOCR',
      'bin',
      'Release',
      'net6.0-windows',
      'win-x64',
      exe
    )
  );
  list.push(
    path.join(
      process.resourcesPath,
      'resources',
      'LiveRouteOCR',
      'bin',
      'Release',
      'net6.0-windows',
      'win-x64',
      exe
    )
  );

  // ---- Dev locations (running with Vite)
  list.push(path.join(__dirname, '..', 'LiveRouteOCR', exe));
  list.push(
    path.join(
      __dirname,
      '..',
      'LiveRouteOCR',
      'bin',
      'Release',
      'net6.0-windows',
      'win-x64',
      exe
    )
  );
  list.push(path.join(__dirname, 'LiveRouteOCR', exe));
  list.push(
    path.join(
      __dirname,
      'LiveRouteOCR',
      'bin',
      'Release',
      'net6.0-windows',
      'win-x64',
      exe
    )
  );

  return list;
}

function findLiveRouteExe() {
  const candidates = listOcrCandidates();
  logLine('OCR', `probing ${candidates.length} candidate paths`);
  for (const p of candidates) {
    const ok = fs.existsSync(p);
    logLine('OCR', `${ok ? 'FOUND' : 'miss'}: ${p}`);
    if (ok) return p;
  }
  return null;
}

function startLiveRouteOCR() {
  try {
    if (liveRouteProc) {
      logLine('OCR', 'requested start but process already exists; ignoring');
      return;
    }

    const exe = findLiveRouteExe();
    if (!exe) {
      const detail =
        'LiveRouteOCR executable not found in packaged resources.\n' +
        'Ensure your electron-builder `extraResources` includes: "LiveRouteOCR/**"\n' +
        'and that the executable is inside that folder (or its published net6.0 path).';
      logLine('OCR', 'NOT FOUND\n' + detail);
      // Warn once in UI so it’s visible
      dialog.showMessageBox({
        type: 'warning',
        message: 'LiveRouteOCR missing',
        detail,
      });
      return;
    }

    const cwd = path.dirname(exe);
    logLine('OCR', `spawning: ${exe}  (cwd=${cwd})`);
    liveRouteProc = spawn(exe, [], {
      cwd,
      windowsHide: true,
      detached: false,
      stdio: 'ignore',
    });

    liveRouteProc.on('error', (err) => {
      logLine('OCR', `spawn error: ${err?.stack || err}`);
      dialog.showMessageBox({
        type: 'warning',
        message: 'Could not start LiveRouteOCR helper.',
        detail: String(err && err.message || err),
      });
    });

    liveRouteProc.on('exit', (code, signal) => {
      logLine('OCR', `exited (code=${code}, signal=${signal})`);
      liveRouteProc = null;
    });
  } catch (err) {
    logLine('OCR', `unexpected start error: ${err?.stack || err}`);
  }
}

function stopLiveRouteOCR() {
  try {
    if (liveRouteProc && !liveRouteProc.killed) {
      logLine('OCR', 'killing process on app quit');
      liveRouteProc.kill();
    }
  } catch (e) {
    logLine('OCR', `kill error: ${e?.stack || e}`);
  } finally {
    liveRouteProc = null;
  }
}

/* =========================
   BrowserWindow
   ========================= */
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

  // proper taskbar / notifications on Windows
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

/* =========================
   Auto updates (GitHub)
   ========================= */
ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('check-updates', async () => {
  try {
    logLine('UPDATER', 'manual: checkForUpdatesAndNotify()');
    const res = await autoUpdater.checkForUpdatesAndNotify();
    logLine('UPDATER', `manual: result ${res ? JSON.stringify(res.updateInfo) : 'no update'}`);
    return res?.updateInfo ?? null;
  } catch (err) {
    logLine('UPDATER', `manual: error ${err?.stack || err}`);
    throw err;
  }
});

function setupAutoUpdates() {
  // Force the GitHub feed so a missing app-update.yml can’t break things.
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'muphy09',
    repo: '3s-PokeMMO-Tool',
  });

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => logLine('UPDATER', 'checking-for-update'));
  autoUpdater.on('update-available', (info) => logLine('UPDATER', `update-available ${info?.version}`));
  autoUpdater.on('update-not-available', () => logLine('UPDATER', 'update-not-available'));
  autoUpdater.on('error', (err) => logLine('UPDATER', `error ${err?.stack || err}`));
  autoUpdater.on('download-progress', (p) =>
    logLine('UPDATER', `progress ${Math.round(p?.percent || 0)}%`)
  );
  autoUpdater.on('update-downloaded', (info) =>
    logLine('UPDATER', `update-downloaded ${info?.version}`)
  );

  // initial check
  setTimeout(() => {
    logLine('UPDATER', 'startup: checkForUpdatesAndNotify()');
    autoUpdater.checkForUpdatesAndNotify().catch((e) => logLine('UPDATER', `startup error: ${e}`));
  }, 3000);

  // periodic checks (6h)
  setInterval(() => {
    logLine('UPDATER', 'interval: checkForUpdates()');
    autoUpdater.checkForUpdates().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}

/* =========================
   IPC for OCR (optional UI)
   ========================= */
ipcMain.handle('start-ocr', async () => {
  startLiveRouteOCR();
  return true;
});

/* =========================
   App lifecycle
   ========================= */
app.whenReady().then(() => {
  createWindow();
  // Auto-start OCR on app launch (like before)
  startLiveRouteOCR();
  setupAutoUpdates();
});

app.on('before-quit', () => {
  stopLiveRouteOCR();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
