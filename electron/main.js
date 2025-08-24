// ===== Core requires =====
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  dialog,
  shell,
} = require('electron');
const { autoUpdater } = require('electron-updater');

// ===== App identity (Win) =====
if (process.platform === 'win32') {
  // Use your publisher / app id here if you have a custom one
  app.setAppUserModelId('com.pokemmo.tool');
}

// ===== Single instance =====
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) {
    if (w.isMinimized()) w.restore();
    w.focus();
  }
});

// ===== Globals =====
let mainWindow = null;
let ocrProc = null;

// ===== Helpers =====

// Compare "a.b.c" like 1.6.10 > 1.6.7
function isNewerVersion(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false; // equal
}

function log(...args) {
  try {
    const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
    const logFile = path.join(app.getPath('userData'), 'pokemmo-tool.log');
    fs.appendFileSync(logFile, line);
  } catch {}
  console.log('[main]', ...args);
}

// Safer path join for packaged/unpacked
function rsrc(...p) {
  return path.join(process.resourcesPath || process.cwd(), ...p);
}

// ===== Updater wiring =====
function setupAutoUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => log('autoUpdater error:', err?.message || err));
  autoUpdater.on('update-downloaded', (info) => {
    // Quiet flow: install on app quit. Renderer toasts inform the user.
    log('update-downloaded', info?.version || '');
  });

  // Silent background check a few seconds after boot.
  setTimeout(() => {
    try { autoUpdater.checkForUpdates(); } catch (e) { log('checkForUpdates at boot failed', e); }
  }, 3000);
}

// ===== LiveRouteOCR: locating/extracting/spawning =====
const OCR_FOLDER_NAME = 'LiveRouteOCR';
const OCR_EXE_NAME = 'LiveRouteOCR.exe';

// Where we prefer to run OCR from when extraction is needed
function ocrUserDir() {
  return path.join(app.getPath('userData'), OCR_FOLDER_NAME);
}

function ocrResourcesExe() {
  return path.join(rsrc(OCR_FOLDER_NAME), OCR_EXE_NAME);
}
function ocrUserExe() {
  return path.join(ocrUserDir(), OCR_EXE_NAME);
}
function ocrZipPath() {
  return path.join(process.resourcesPath || process.cwd(), `${OCR_FOLDER_NAME}.zip`);
}

async function extractZipToUserDir(zipFile, destDir) {
  // Try extract-zip first if bundled
  try {
    const extract = require('extract-zip');
    await extract(zipFile, { dir: destDir });
    return true;
  } catch (e) {
    log('extract-zip not available or failed, trying PowerShell Expand-Archive…', e?.message || e);
  }

  // Windows fallback via PowerShell
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const ps = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        'Expand-Archive', '-Path', `"${zipFile}"`, '-DestinationPath', `"${destDir}"`, '-Force',
      ], { windowsHide: true, shell: true });

      ps.on('exit', () => resolve());
      ps.on('error', () => resolve());
    });
    return fs.existsSync(destDir) && fs.existsSync(path.join(destDir, OCR_EXE_NAME));
  }

  return false;
}

async function ensureOCRExeExists() {
  // 1) Directly in resources
  if (fs.existsSync(ocrResourcesExe())) return ocrResourcesExe();

  // 2) Extracted into userData
  if (fs.existsSync(ocrUserExe())) return ocrUserExe();

  // 3) Zip present? extract it to userData
  const zip = ocrZipPath();
  if (fs.existsSync(zip)) {
    try {
      fs.mkdirSync(ocrUserDir(), { recursive: true });
      const ok = await extractZipToUserDir(zip, ocrUserDir());
      if (ok && fs.existsSync(ocrUserExe())) return ocrUserExe();
    } catch (e) {
      log('Failed to extract OCR zip', e);
    }
  }

  return null;
}

async function startLiveRouteOCR() {
  try {
    if (ocrProc) {
      try { ocrProc.kill(); } catch {}
      ocrProc = null;
    }

    if (process.platform !== 'win32') {
      log('LiveRouteOCR currently supported on Windows only; skipping spawn.');
      return;
    }

    const exe = await ensureOCRExeExists();
    if (!exe) {
      const msg = `LiveRouteOCR not found.\nSearched:\n - ${ocrResourcesExe()}\n - ${ocrUserExe()}\nZip (for extraction):\n - ${ocrZipPath()}`;
      log(msg);
      // non-blocking toast via dialog; comment this out if you don't want a modal
      dialog.showMessageBox({ type: 'warning', message: 'LiveRouteOCR Missing', detail: msg });
      return;
    }

    const cwd = path.dirname(exe);
    ocrProc = spawn(exe, [], {
      cwd,
      windowsHide: true,
      stdio: 'ignore', // change to ['ignore','pipe','pipe'] for verbose logs
    });

    ocrProc.on('exit', (code, sig) => {
      log('LiveRouteOCR exited', code, sig);
      ocrProc = null;
      // Do NOT auto-restart immediately; renderer has a "Reload OCR" option.
    });

    ocrProc.on('error', (err) => {
      log('LiveRouteOCR spawn error:', err?.message || err);
      ocrProc = null;
    });

    log('LiveRouteOCR started at', exe);
  } catch (e) {
    log('startLiveRouteOCR exception:', e?.message || e);
  }
}

function stopLiveRouteOCR() {
  try {
    if (ocrProc && !ocrProc.killed) {
      ocrProc.kill();
      log('LiveRouteOCR killed');
    }
  } catch (e) {
    log('stopLiveRouteOCR failed', e?.message || e);
  } finally {
    ocrProc = null;
  }
}

// ===== Window =====
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
    backgroundColor: '#0b0f1a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Remove default app menu globally
  Menu.setApplicationMenu(null);

  // Load Vite dev server or packaged index
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexFile = path.join(__dirname, 'dist', 'index.html');
    mainWindow.loadFile(indexFile);
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ===== IPC =====
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('check-for-updates', async () => {
  try {
    const current = app.getVersion();
    const result = await autoUpdater.checkForUpdates();
    const latest = result?.updateInfo?.version;

    if (!latest) {
      return { status: 'uptodate', current };
    }
    if (isNewerVersion(latest, current)) {
      try { await autoUpdater.downloadUpdate(); } catch (e) { log('downloadUpdate failed', e); }
      return { status: 'available', version: latest, current };
    }
    return { status: 'uptodate', current };
  } catch (err) {
    log('check-for-updates failed', err?.message || err);
    return { status: 'error', message: err?.message || String(err) };
  }
});

ipcMain.handle('reload-ocr', async () => {
  stopLiveRouteOCR();
  await startLiveRouteOCR();
  return true;
});

ipcMain.handle('refresh-app', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reloadIgnoringCache();
  }
  return true;
});

// ===== Lifecycle =====
app.whenReady().then(async () => {
  createMainWindow();
  setupAutoUpdates();

  // Start OCR shortly after boot (let window spin up first)
  setTimeout(() => {
    startLiveRouteOCR().catch(() => {});
  }, 800);
});

app.on('before-quit', () => {
  stopLiveRouteOCR();
});

app.on('window-all-closed', () => {
  stopLiveRouteOCR();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
