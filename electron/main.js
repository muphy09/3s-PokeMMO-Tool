// electron/main.js
const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
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
   LiveRouteOCR: unzip-on-first-run + launcher
   ========================= */
function listOcrExeCandidates() {
  const exe = process.platform === 'win32' ? 'LiveRouteOCR.exe' : 'LiveRouteOCR';
  const L = [];

  // ---- Packaged (resources) common shapes
  L.push(path.join(process.resourcesPath, 'LiveRouteOCR', exe));
  L.push(path.join(process.resourcesPath, 'resources', 'LiveRouteOCR', exe));
  L.push(
    path.join(
      process.resourcesPath,
      'LiveRouteOCR', 'bin', 'Release', 'net6.0-windows', 'win-x64', exe
    )
  );
  L.push(
    path.join(
      process.resourcesPath,
      'resources', 'LiveRouteOCR', 'bin', 'Release', 'net6.0-windows', 'win-x64', exe
    )
  );

  // ---- Dev (vite/electron)
  L.push(path.join(__dirname, '..', 'LiveRouteOCR', exe));
  L.push(path.join(__dirname, '..', 'LiveRouteOCR', 'bin', 'Release', 'net6.0-windows', 'win-x64', exe));
  L.push(path.join(__dirname, 'LiveRouteOCR', exe));
  L.push(path.join(__dirname, 'LiveRouteOCR', 'bin', 'Release', 'net6.0-windows', 'win-x64', exe));

  return L;
}

function listOcrZipCandidates() {
  const Z = [];
  // packaged
  Z.push(path.join(process.resourcesPath, 'LiveRouteOCR.zip'));
  Z.push(path.join(process.resourcesPath, 'resources', 'LiveRouteOCR.zip'));
  Z.push(path.join(process.resourcesPath, 'LiveRouteOCR', 'LiveRouteOCR.zip'));
  Z.push(path.join(process.resourcesPath, 'resources', 'LiveRouteOCR', 'LiveRouteOCR.zip'));
  // dev
  Z.push(path.join(__dirname, '..', 'LiveRouteOCR.zip'));
  Z.push(path.join(__dirname, 'LiveRouteOCR.zip'));
  return Z;
}

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

function extractZipSync(zipPath, destDir) {
  ensureDir(destDir);
  logLine('OCR', `extracting zip: ${zipPath} -> ${destDir}`);

  if (process.platform === 'win32') {
    // Use PowerShell Expand-Archive
    const args = [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command',
      `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
    ];
    const r = spawnSync('powershell.exe', args, { stdio: 'ignore' });
    logLine('OCR', `Expand-Archive exit ${r.status}`);
    return r.status === 0;
  } else {
    // Try 'unzip', then 'tar -xf'
    let r = spawnSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'ignore' });
    if (r.status !== 0) {
      r = spawnSync('tar', ['-xf', zipPath, '-C', destDir], { stdio: 'ignore' });
    }
    logLine('OCR', `unzip/tar exit ${r.status}`);
    return r.status === 0;
  }
}

function findFirstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findLiveRouteExe() {
  const exe = findFirstExisting(listOcrExeCandidates());
  logLine('OCR', exe ? `FOUND exe: ${exe}` : 'exe not found');
  return exe;
}

function maybeUnzipLiveRoute() {
  // If exe already present, skip
  if (findLiveRouteExe()) return true;

  const zip = findFirstExisting(listOcrZipCandidates());
  if (!zip) {
    logLine('OCR', 'no exe and no zip found; cannot start');
    return false;
  }

  // Prefer <resources>/LiveRouteOCR for packaged, repo folder in dev
  const dest = app.isPackaged
    ? path.join(process.resourcesPath, 'LiveRouteOCR')
    : path.join(__dirname, '..', 'LiveRouteOCR');

  const ok = extractZipSync(zip, dest);
  if (!ok) {
    logLine('OCR', 'zip extraction failed');
    return false;
  }

  const exe = findLiveRouteExe();
  if (!exe) {
    logLine('OCR', 'extraction completed but exe still not found – check zip structure');
    return false;
  }
  return true;
}

function startLiveRouteOCR() {
  try {
    if (liveRouteProc) {
      logLine('OCR', 'requested start but process already exists; ignoring');
      return;
    }

    // Ensure unzipped if we only shipped a zip
    maybeUnzipLiveRoute();

    const exe = findLiveRouteExe();
    if (!exe) {
      const detail =
        'LiveRouteOCR not found. If your release packs LiveRouteOCR.zip, it will be auto-extracted on first run.\n' +
        'Ensure electron-builder "extraResources" includes the zip or an extracted folder.';
      logLine('OCR', 'NOT FOUND\n' + detail);
      dialog.showMessageBox({
        type: 'warning',
        message: 'LiveRouteOCR missing',
        detail,
      });
      return;
    }

    const cwd = path.dirname(exe);
    logLine('OCR', `spawning: ${exe} (cwd=${cwd})`);
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
    // hide native menubar completely
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Nuke the app menu so "File/Edit/View/Window/Help" is gone everywhere
  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

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

  setTimeout(() => {
    logLine('UPDATER', 'startup: checkForUpdatesAndNotify()');
    autoUpdater.checkForUpdatesAndNotify().catch((e) => logLine('UPDATER', `startup error: ${e}`));
  }, 3000);

  setInterval(() => {
    logLine('UPDATER', 'interval: checkForUpdates()');
    autoUpdater.checkForUpdates().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}

/* =========================
   IPC for OCR + window actions (for Options menu)
   ========================= */
ipcMain.handle('start-ocr', async () => {
  startLiveRouteOCR();
  return true;
});

ipcMain.handle('reload-ocr', async () => {
  stopLiveRouteOCR();
  startLiveRouteOCR();
  return true;
});

ipcMain.handle('refresh-app', async () => {
  if (mainWindow) {
    mainWindow.webContents.reloadIgnoringCache();
  }
  return true;
});

/* =========================
   App lifecycle
   ========================= */
app.whenReady().then(() => {
  createWindow();
  // Auto-unzip & start OCR on launch
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
