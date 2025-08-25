// === Main process (merged, robust) ===
// Keeps your existing behavior and fixes blank-window & tessdata issues.
// - Loads index.html from multiple common locations
// - Logs failures to %LOCALAPPDATA%/PokemmoLive/main.log
// - Spawns LiveRouteOCR helper and restarts on demand
// - Exposes IPC used by Options menu (check updates, reload OCR, refresh)
// - Ensures tessdata/eng.traineddata exists alongside the app

const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');

const APP_NAME = 'pokemmo-tool';
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isDev = !!process.env.ELECTRON_START_URL || !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development';

// ---------- Logging ----------
const logDir = path.join(os.homedir(), 'AppData', 'Local', 'PokemmoLive');
fs.mkdirSync(logDir, { recursive: true });
const mainLog = path.join(logDir, 'main.log');
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
  try { fs.appendFileSync(mainLog, line + '\n'); } catch {}
  console.log(line);
}

// ---------- App User Model ID (Win) ----------
if (isWin) {
  try { app.setAppUserModelId(APP_NAME); } catch {}
}

// ---------- Single-instance lock ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ---------- Globals ----------
let mainWindow = null;
let ocrProc = null;
let quitting = false;

// ---------- Helpers ----------
function resolvePreload() {
  const candidates = [
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, '../preload.js'),
    path.join(__dirname, 'dist/preload.js'),
    path.join(__dirname, '../dist/preload.js'),
    path.join(process.resourcesPath || __dirname, 'preload.js')
  ];
  for (const p of candidates) { if (fs.existsSync(p)) return p; }
  return path.join(__dirname, 'preload.js');
}

function resolveIndexUrl() {
  const dev = process.env.ELECTRON_START_URL || process.env.VITE_DEV_SERVER_URL;
  if (dev) return dev;
  const candidates = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, '../index.html'),
    path.join(__dirname, 'dist/index.html'),
    path.join(__dirname, '../dist/index.html'),
    path.join(process.resourcesPath || __dirname, 'index.html'),
    path.join(process.resourcesPath || __dirname, 'dist/index.html'),
    path.join(process.resourcesPath || __dirname, 'app/dist/index.html')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return 'file://' + p.replace(/\\/g, '/');
  }
  return null;
}

function ensureTessdata() {
  const installRoot = process.resourcesPath || path.dirname(app.getPath('exe'));
  const destDir = path.join(installRoot, 'tessdata');
  fs.mkdirSync(destDir, { recursive: true });

  const sources = [
    path.join(installRoot, 'resources', 'tessdata', 'eng.traineddata'),
    path.join(installRoot, 'tessdata', 'eng.traineddata')
  ];
  const dest = path.join(destDir, 'eng.traineddata');
  if (!fs.existsSync(dest)) {
    for (const s of sources) {
      if (fs.existsSync(s)) {
        try { fs.copyFileSync(s, dest); log('Copied eng.traineddata from', s); break; } catch (e) { log('Copy tessdata error:', e.message); }
      }
    }
  }
  process.env.POKEMMO_TESSDATA_DIR = destDir;
  return destDir;
}

function startLiveRouteOCR() {
  try {
    const installRoot = process.resourcesPath || path.dirname(app.getPath('exe'));
    const helperDir = path.join(installRoot, 'live-helper');
    const exe = path.join(helperDir, 'LiveRouteOCR.exe');
    const exists = fs.existsSync(exe);
    if (!exists) { log('LiveRouteOCR not found at', exe); return; }

    const env = { ...process.env, POKEMMO_TESSDATA_DIR: ensureTessdata() };
    const args = []; // you can push ROI args here if needed
    ocrProc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
    ocrProc.stdout.on('data', d => log('[OCR]', String(d).trim()));
    ocrProc.stderr.on('data', d => log('[OCR:ERR]', String(d).trim()));
    ocrProc.on('exit', (code, sig) => { log('LiveRouteOCR exited', code, sig); ocrProc = null; if (!quitting) setTimeout(startLiveRouteOCR, 1500); });
    log('LiveRouteOCR started');
  } catch (e) {
    log('Failed to start LiveRouteOCR:', e.message);
  }
}

function stopLiveRouteOCR() {
  try {
    if (ocrProc && !ocrProc.killed) {
      const pid = ocrProc.pid;
      ocrProc.kill();
      log('Killed LiveRouteOCR pid', pid);
    }
  } catch {}
  ocrProc = null;
}

// ---------- Window ----------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0f0f10',
    title: APP_NAME,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: resolvePreload(),
      sandbox: false
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('did-fail-load', code, desc, url || '');
    dialog.showErrorBox('Failed to load UI', `${desc}\n\nURL: ${url || '(none)'}\nSee log: ${mainLog}`);
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log('renderer crashed', details && JSON.stringify(details));
  });

  const url = resolveIndexUrl();
  if (url) {
    log('Loading', url);
    mainWindow.loadURL(url);
  } else {
    log('No index.html found in expected locations.');
    dialog.showErrorBox('Startup error', 'Could not find index.html. See main.log for details.');
  }

  if (isDev || process.env.SHOW_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ---------- IPC used by Options menu ----------
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:refresh', async () => { if (mainWindow) mainWindow.reload(); return true; });
ipcMain.handle('app:reloadOCR', async () => { stopLiveRouteOCR(); setTimeout(startLiveRouteOCR, 350); return true; });
ipcMain.handle('app:checkUpdates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    const info = result && result.updateInfo;
    if (info && info.version && info.version !== app.getVersion()) {
      return { status: 'available', version: info.version };
    }
    return { status: 'uptodate', version: app.getVersion() };
  } catch (err) {
    log('checkUpdates error', err && err.message);
    return { status: 'error', message: String(err) };
  }
});

// ---------- App lifecycle ----------
app.whenReady().then(() => {
  ensureTessdata();
  createMainWindow();
  startLiveRouteOCR();

  // Minimal menu to avoid default File/Edit/etc on Windows if you hid it before
  Menu.setApplicationMenu(null);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  quitting = true;
  stopLiveRouteOCR();
});

app.on('window-all-closed', () => {
  stopLiveRouteOCR();
  if (!isMac) app.quit();
});
