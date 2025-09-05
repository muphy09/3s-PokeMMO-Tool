// ===== Core requires =====

const { app, BrowserWindow, ipcMain, Menu, shell, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');


// ===== App identity (Win) =====
if (process.platform === 'win32') {
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
let downloadedUpdate = null;
let downloadingVersion = null;

// ===== Helpers =====
function normalizeVersion(ver) {
  return String(ver || '').replace(/^v/i, '');
}
function isNewerVersion(a, b) {
  function parse(ver) {
    return normalizeVersion(ver)
      .split('.')
      .map(n => parseInt(n, 10) || 0);
  }
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false; // equal
}
function liveAppDataDir() {
  return path.join(LOCAL_APPDATA, 'PokemmoLive');
}

function settingsPath() {
  return path.join(liveAppDataDir(), 'settings.json');
}


// Enumerate visible top-level windows with PIDs and titles
async function enumerateWindows() {
  // Try simple PS: Get-Process with MainWindowTitle
  async function psSimple() {
    return new Promise((resolve) => {
      const ps = spawn('powershell.exe', [
        '-NoProfile','-NonInteractive','-Command',
        "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json -Depth 2"
      ], { windowsHide: true });
      const chunks = [];
      ps.stdout.on('data', d => chunks.push(Buffer.from(d)));
      ps.on('close', () => {
        try {
          const buf = Buffer.concat(chunks);
          let txt = buf.toString('utf8').trim();
          if (!txt || txt.includes('\u0000')) txt = buf.toString('utf16le').trim();
          if (!txt) return resolve([]);
          const json = JSON.parse(txt);
          const arr = Array.isArray(json) ? json : [json];
          resolve(arr.map(x => ({ pid: x.Id, processName: x.ProcessName || '', title: x.MainWindowTitle || '' })));
        } catch { resolve([]); }
      });
      ps.on('error', () => resolve([]));
    });
  }

  // Robust fallback: Win32 EnumWindows via Add-Type (works even when elevated mismatch)
  async function psEnumWin32() {
    const code = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @" 
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinEnum {
  [DllImport("user32.dll")] static extern bool EnumWindows(Func<IntPtr, IntPtr, bool> lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  public static System.Collections.Generic.List<object> List() {
    var res = new System.Collections.Generic.List<object>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, sb.Capacity);
      var title = sb.ToString();
      if (string.IsNullOrWhiteSpace(title)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      string proc = "";
      try { proc = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
      res.Add(new { Id = pid, ProcessName = proc, MainWindowTitle = title });
      return true;
    }, IntPtr.Zero);
    return res;
  }
}
"@ | Out-Null
[WinEnum]::List() | ConvertTo-Json -Depth 4
`.trim();

    return new Promise((resolve) => {
      const ps = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-Command', code], { windowsHide: true });
      const chunks = [];
      ps.stdout.on('data', d => chunks.push(Buffer.from(d)));
      ps.on('close', () => {
        try {
          const buf = Buffer.concat(chunks);
          let txt = buf.toString('utf8').trim();
          if (!txt || txt.includes('\u0000')) txt = buf.toString('utf16le').trim();
          if (!txt) return resolve([]);
          const json = JSON.parse(txt);
          const arr = Array.isArray(json) ? json : [json];
          resolve(arr.map(x => ({ pid: x.Id, processName: x.ProcessName || '', title: x.MainWindowTitle || '' })));
        } catch { resolve([]); }
      });
      ps.on('error', () => resolve([]));
    });
    }

  let list = await psSimple();
  if (!list.length) list = await psEnumWin32();

  // de-dup + prefer PokeMMO entries first
  const uniq = new Map();
  for (const w of list) {
        if (!w) continue;
    const key = w.pid ? `p${w.pid}` : (w.id ? `i${w.id}` : null);
    if (!key || uniq.has(key)) continue;
    uniq.set(key, w);
  }
  return [...uniq.values()].sort((a, b) => {
    const aP = (a.processName || '').toLowerCase().includes('pokemmo') ? -1 : 0;
    const bP = (b.processName || '').toLowerCase().includes('pokemmo') ? -1 : 0;
    if (aP !== bP) return aP - bP;
    return (a.title || '').localeCompare(b.title || '');
  });
}

function log(...args) {
  try {
    const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
    const logFile = path.join(app.getPath('userData'), 'pokemmo-tool.log');
    fs.appendFileSync(logFile, line);
  } catch {}
  console.log('[main]', ...args);
}

function rsrc(...p) {
  return path.join(process.resourcesPath || process.cwd(), ...p);
}

function notifyWin(title, body) {
  if (process.platform !== 'win32') return;
  try {
    new Notification({ title, body }).show();
  } catch (e) {
    log('notifyWin error', e?.message || e);
  }
}

// ===== Settings storage (for OCR Setup) =====
const LOCAL_APPDATA = (() => {
  try { return app.getPath('localAppData'); } catch {}
  return process.env.LOCALAPPDATA || app.getPath('userData');
})(); // prefer real LocalAppData
const POKELIVE_DIR = path.join(LOCAL_APPDATA, 'PokemmoLive');
try { fs.mkdirSync(POKELIVE_DIR, { recursive: true }); } catch {}
const SETTINGS_PATH = path.join(POKELIVE_DIR, 'settings.json');

function readOcrSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch { return {}; }
}
function writeOcrSettings(obj) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(obj || {}, null, 2), 'utf8');
    return true;
  } catch (e) { log('writeOcrSettings error', e?.message || e); return false; }
}

async function relaunchApp({ ocrDisabledFlag = false } = {}) {
  try { await stopLiveRouteOCR(); } catch {}
  try {
    const args = process.argv.slice(1).filter(a => a !== '--ocr-disabled');
    if (ocrDisabledFlag) args.push('--ocr-disabled');
    notifyWin('Restarting', ocrDisabledFlag ? 'Reopening without Live OCR' : 'Reopening with Live OCR');
    app.relaunch({ args });
  } catch (e) {
    log('relaunch error', e?.message || e);
  }
  try { app.quit(); } catch {}
  // hard fallback in dev
  setTimeout(() => { try { process.exit(0); } catch {} }, 1500);
}

// ===== Updater wiring =====
function setupAutoUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => log('autoUpdater error:', err?.message || err));
  autoUpdater.on('checking-for-update', () => {
    log('checking-for-update');
    notifyWin('Checking for updates…', '');
    try { mainWindow?.webContents?.send('checking-for-update'); } catch {}
  });
  autoUpdater.on('update-not-available', () => {
    downloadingVersion = null;
    log('update-not-available');
    notifyWin('Up to date', 'You have the latest version.');
    try { mainWindow?.webContents?.send('update-not-available'); } catch {}
  });
  autoUpdater.on('update-available', (info) => {
    downloadingVersion = info?.version ? normalizeVersion(info.version) : downloadingVersion;
    log('update-available', downloadingVersion || '');
    notifyWin('Update available', `Downloading update v${downloadingVersion}…`);
    try { mainWindow?.webContents?.send('update-available', downloadingVersion); } catch {}
  });
  autoUpdater.on('update-downloaded', (info) => {
    downloadedUpdate = info?.version ? normalizeVersion(info.version) : downloadedUpdate;
    downloadingVersion = null;
    log('update-downloaded', info?.version || '');
    notifyWin('Update ready', `Update v${downloadedUpdate} downloaded. Restart App to apply.`);
    try { mainWindow?.webContents?.send('update-downloaded', downloadedUpdate); } catch {}
  });

   // Explicitly set the GitHub feed. In some earlier builds the generated
  // app-update.yml was missing, causing update checks to throw with a
  // "Cannot find update info" error.  Setting the feed URL here ensures the
  // updater can always locate the repository even if that file is absent.
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'muphy09',
      repo: '3s-PokeMMO-Tool',
    });
  } catch (e) {
    log('setFeedURL failed', e?.message || e);
  }
  
  setTimeout(() => {
    try { autoUpdater.checkForUpdates(); } catch (e) { log('checkForUpdates at boot failed', e); }
  }, 3000);
}

// ===== LiveRouteOCR paths/spawn =====
const OCR_FOLDER_NAME = 'LiveRouteOCR';
const OCR_EXE_NAME = 'LiveRouteOCR.exe';

function ocrUserDir() { return path.join(app.getPath('userData'), OCR_FOLDER_NAME); }
function ocrResourcesExe() { return path.join(rsrc(OCR_FOLDER_NAME), OCR_EXE_NAME); }
function ocrUserExe() { return path.join(ocrUserDir(), OCR_EXE_NAME); }
function ocrZipPath() { return path.join(process.resourcesPath || process.cwd(), `${OCR_FOLDER_NAME}.zip`); }
function ocrDevExe() { return path.join(__dirname, '..', OCR_FOLDER_NAME, OCR_EXE_NAME); }

async function extractZipToUserDir(zipFile, destDir) {
  try {
    const extract = require('extract-zip');
    await extract(zipFile, { dir: destDir });
    return true;
  } catch (e) {
    log('extract-zip failed, trying PowerShell Expand-Archive…', e?.message || e);
  }

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
  if (!app.isPackaged && fs.existsSync(ocrDevExe())) return ocrDevExe();
  if (fs.existsSync(ocrResourcesExe())) return ocrResourcesExe();
  if (fs.existsSync(ocrUserExe())) return ocrUserExe();

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
    if (ocrProc) { try { ocrProc.kill(); } catch {} ocrProc = null; }
    if (process.platform !== 'win32') { log('LiveRouteOCR supported on Windows only; skipping'); return; }

    const exe = await ensureOCRExeExists();
    if (!exe) {
      const msg = `LiveRouteOCR not found.\nSearched:\n - ${ocrDevExe()}\n - ${ocrResourcesExe()}\n - ${ocrUserExe()}\nZip:\n - ${ocrZipPath()}`;
      log(msg);
      dialog.showMessageBox({ type: 'warning', message: 'LiveRouteOCR Missing', detail: msg });
      return;
    }

    const cwd = path.dirname(exe);
    const s = readOcrSettings();
    const env = {
      ...process.env,
      TARGET_PID: s?.targetPid ? String(s.targetPid) : '',
      CAPTURE_ZOOM: s?.captureZoom ? String(s.captureZoom) : '',
      OCR_AGGRESSIVENESS: s?.ocrAggressiveness || 'balanced',
      // hint for tessdata (helper also auto-detects)
      POKEMMO_TESSDATA_DIR: path.join(cwd, 'tessdata'),
    };
    ocrProc = spawn(exe, [], {
      cwd,
      windowsHide: true,
      stdio: 'ignore',
      env,
    });

    log('LiveRouteOCR env', { TARGET_PID: env.TARGET_PID, CAPTURE_ZOOM: env.CAPTURE_ZOOM, OCR_AGGRESSIVENESS: env.OCR_AGGRESSIVENESS });

    ocrProc.on('exit', (code, sig) => { log('LiveRouteOCR exited', code, sig); ocrProc = null; });
    ocrProc.on('error', (err) => { log('LiveRouteOCR spawn error:', err?.message || err); ocrProc = null; });

    log('LiveRouteOCR started at', exe);
  } catch (e) {
    log('startLiveRouteOCR exception:', e?.message || e);
  }
}
async function stopLiveRouteOCR() {
  try {
    const pid = ocrProc?.pid || null;
    if (process.platform === 'win32') {
      // Attempt to kill by PID and entire tree; then also kill by image name to catch strays
      if (pid) {
        await new Promise((resolve) => {
          const k = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
          k.on('exit', () => resolve());
          k.on('error', () => resolve());
          setTimeout(resolve, 1500);
        });
      }
      await new Promise((resolve) => {
        const k2 = spawn('taskkill', ['/IM', 'LiveRouteOCR.exe', '/T', '/F'], { windowsHide: true });
        k2.on('exit', () => resolve());
        k2.on('error', () => resolve());
        setTimeout(resolve, 1500);
      });
      // Also attempt to stop any sibling processes and name variants via PowerShell as a fallback
      await new Promise((resolve) => {
        const psCode = `
          $ErrorActionPreference = 'SilentlyContinue';
          Get-Process -Name 'LiveRouteOCR','LiveBattleOCR' | Stop-Process -Force;
        `.Trim();
        const ps = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-Command', psCode], { windowsHide: true });
        ps.on('exit', () => resolve());
        ps.on('error', () => resolve());
        setTimeout(resolve, 1500);
      });
      log('LiveRouteOCR stop issued (taskkill + Stop-Process)');
    } else {
      try { if (ocrProc && !ocrProc.killed) { ocrProc.kill('SIGTERM'); } } catch {}
    }
  } catch (e) {
    log('stopLiveRouteOCR failed', e?.message || e);
  } finally {
    ocrProc = null;
  }
}

const preloadCandidates = [
  path.join(__dirname, 'preload.js'),
  ];

const preloadPath = preloadCandidates.find(p => fs.existsSync(p));
console.log('[MAIN] Preload candidates:\n' + preloadCandidates.map(p =>
  `  - ${p}  ${fs.existsSync(p) ? '(exists)' : '(missing)'}`
).join('\n'));

if (!preloadPath) {
  dialog.showErrorBox('FATAL', 'No preload.js found in any known location.\nSee console for searched paths.');
  app.quit(); process.exit(1);
}

// ===== Window =====
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
    backgroundColor: '#0b0f1a',
    // Defer showing until content is ready to avoid a long blank window
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  Menu.setApplicationMenu(null);

  // dev/prod loader — load dev server when env URL provided
 // default to bundled index.html when no explicit dev URL is set
  const devURL =
    process.env.VITE_DEV_SERVER_URL ||
    process.env.ELECTRON_START_URL ||
    '';

  const indexFile = path.join(__dirname, '..', 'dist', 'index.html');

  if (devURL) {
    mainWindow.webContents.once('did-fail-load', (_e, code, desc) => {
      log('devURL failed to load; falling back to index.html', code, desc);
      mainWindow.loadFile(indexFile);
    });
    mainWindow.loadURL(devURL);
    // Open devtools only when explicitly requested by env var
    if (String(process.env.OPEN_DEVTOOLS || '').trim() === '1') {
      try { mainWindow.webContents.openDevTools({ mode: 'detach' }); } catch {}
    }
  } else {
    mainWindow.loadFile(indexFile);
  }

  // Show when content is ready; keep a failsafe so it never stays hidden
  mainWindow.on('ready-to-show', () => { try { if (!mainWindow.isVisible()) mainWindow.show(); } catch {} });
  mainWindow.webContents.once('did-finish-load', () => { try { if (!mainWindow.isVisible()) mainWindow.show(); } catch {} });
  setTimeout(() => { try { if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show(); } catch {} }, 15000);

  // In dist-watch dev mode, auto-reload renderer on file changes and relaunch on main changes
  if (String(process.env.ELECTRON_DIST_WATCH || '') === '1') {
    try {
      const debounce = (fn, ms=200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
      const reload = debounce(() => {
        try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache(); } catch {}
      }, 250);
      const distDir = path.join(__dirname, '..', 'dist');
      try {
        fs.watch(distDir, { recursive: true }, (evt, fname) => {
          // Ignore sourcemaps if any
          if (fname && /\.map$/.test(fname)) return;
          reload();
        });
      } catch {}
      // Watch main process sources; relaunch app when they change
      const electronDir = __dirname;
      try {
        fs.watch(electronDir, { recursive: false }, debounce(() => {
          try { app.relaunch(); app.exit(0); } catch {}
        }, 400));
      } catch {}
    } catch {}
  }
  // Guard against scenarios where the window failed to initialize
  // to prevent startup crashes like "Cannot read properties of undefined"
  mainWindow.webContents?.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ===== IPC =====
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('check-for-updates', async () => {
  try {
    const current = app.getVersion();
    if (downloadedUpdate && isNewerVersion(downloadedUpdate, current)) {
      return { status: 'downloaded', version: downloadedUpdate, current };
    }
    if (downloadingVersion && isNewerVersion(downloadingVersion, current)) {
      return { status: 'downloading', version: downloadingVersion, current };
    }
    const result = await autoUpdater.checkForUpdates();
    const latest = normalizeVersion(result?.updateInfo?.version);
    if (!latest) return { status: 'uptodate', current };
    if (isNewerVersion(latest, current)) {
      downloadingVersion = latest;
      try { await autoUpdater.downloadUpdate(); } catch (e) { log('downloadUpdate failed', e); }
      return { status: 'available', version: latest, current };
    }
    return { status: 'uptodate', current };
  } catch (err) {
    log('check-for-updates failed', err?.message || err);
    return { status: 'error', message: err?.message || String(err) };
  }
});

ipcMain.handle('reload-ocr', async () => { await stopLiveRouteOCR(); await startLiveRouteOCR(); return true; });
ipcMain.handle('ocr:set-enabled', async (_evt, payload = {}) => {
  const enabled = !!payload?.enabled;
  const s = readOcrSettings();
  const next = { ...s, ocrEnabled: enabled };
  writeOcrSettings(next);
  await relaunchApp({ ocrDisabledFlag: !enabled });
  return true;
});
ipcMain.handle('stop-ocr', async () => { await stopLiveRouteOCR(); return true; });
ipcMain.handle('refresh-app', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache(); return true; });

// --- OCR Setup IPC ---
ipcMain.handle('app:listWindows', async () => {
  return await enumerateWindows();
});

ipcMain.handle('app:getOcrSetup', async () => {
  const s = readOcrSettings();
  return { targetPid: s?.targetPid ?? null, captureZoom: s?.captureZoom ?? 1.5, ocrAggressiveness: s?.ocrAggressiveness ?? 'balanced' };
});

ipcMain.handle('app:saveOcrSetup', async (_evt, payload = {}) => {
  const s = readOcrSettings();
  const next = {
    ...s,
    targetPid: payload?.targetPid ? Number(payload.targetPid) : null,
    captureZoom: payload?.captureZoom ? Number(payload.captureZoom) : 1.5,
    ocrAggressiveness: payload?.ocrAggressiveness || s?.ocrAggressiveness || 'balanced',
  };
  writeOcrSettings(next);
  if (next?.ocrEnabled !== false) { await stopLiveRouteOCR(); await startLiveRouteOCR(); }
  try { mainWindow?.webContents?.send('force-live-reconnect', { reset: true }); } catch {}
  return true;
});

ipcMain.handle('app:getDebugImages', async () => readPreviewImages());

// --- Compatibility IPC aliases for preload.js ---
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('check-updates', async () => {
  try {
    const current = app.getVersion();
    if (downloadedUpdate && isNewerVersion(downloadedUpdate, current)) {
      return { status: 'downloaded', version: downloadedUpdate, current };
    }
    if (downloadingVersion && isNewerVersion(downloadingVersion, current)) {
      return { status: 'downloading', version: downloadingVersion, current };
    }
    const result = await autoUpdater.checkForUpdates();
    const latest = normalizeVersion(result?.updateInfo?.version);
    if (!latest) return { status: 'uptodate', current };
    if (isNewerVersion(latest, current)) {
      downloadingVersion = latest;
      try { await autoUpdater.downloadUpdate(); } catch (e) { log('downloadUpdate failed', e); }
      return { status: 'downloading', version: latest, current };
    }
    return { status: 'uptodate', current };
  } catch (err) {
    log('check-updates failed', err?.message || err);
    return { status: 'error', message: err?.message || String(err) };
  }
});
ipcMain.handle('start-ocr', async () => { await startLiveRouteOCR(); return true; });

// ===== Lifecycle =====
app.whenReady().then(async () => {
  createMainWindow();
  setupAutoUpdates();
  // Start OCR only if enabled in settings
  setTimeout(() => {
    try {
      const s = readOcrSettings();
      const enabled = (s?.ocrEnabled !== false);
      if (enabled) startLiveRouteOCR().catch(() => {});
      else log('LiveRouteOCR disabled by settings; not starting');
    } catch {}
  }, 800);
});
app.on('before-quit', () => { stopLiveRouteOCR(); });
app.on('window-all-closed', () => { stopLiveRouteOCR(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });

ipcMain.handle('live:list-windows', async () => {
  try {
    return await enumerateWindows();
  } catch (e) {
    const msg = e?.message || String(e);
    log('enumerateWindows error', msg);
    return { error: msg };
  }
});

ipcMain.handle('app:list-windows', async () => {
  try {
    return await enumerateWindows();
  } catch (e) {
    const msg = e?.message || String(e);
    log('enumerateWindows error', msg);
    return { error: msg };
  }
});

function readPreviewImages() {
  const localDir = path.join(process.env.LOCALAPPDATA || app.getPath('localAppData'), 'PokemmoLive');
  const roamingDir = path.join(process.env.APPDATA || app.getPath('appData'), 'PokemmoLive');
  const dirs = [localDir];
  if (roamingDir !== localDir) dirs.push(roamingDir);

  function readFirst(names, folders = ['']) {
    const nameArr = Array.isArray(names) ? names : [names];
    for (const d of dirs) {
       for (const folder of folders) {
        for (const n of nameArr) {
          const p = path.join(d, folder, n);
          try {
            const buf = fs.readFileSync(p);
            return { data: 'data:image/png;base64,' + buf.toString('base64'), dir: d };
          } catch {}
        }
      }
    }
    return { data: null, dir: null };
  }

  const folders = ['', 'debug'];
  const routeCap = readFirst(['last-route-capture.png', 'last-route-capture.jpg', 'last-route-capture.bmp'], folders);
  const routePre = readFirst(['last-route-pre.png', 'last-route-pre.jpg', 'last-route-pre.bmp', 'last-route-preprocessed.png', 'last-route-preview.png'], folders);
  const battleCap = readFirst(['last-battle-capture.png', 'last-battle-capture.jpg', 'last-battle-capture.bmp'], folders);
  const battlePre = readFirst(['last-battle-pre.png', 'last-battle-pre.jpg', 'last-battle-pre.bmp', 'last-battle-preprocessed.png', 'last-battle-preview.png'], folders);

  const res = {
    capture: routeCap.data,
    preprocessed: routePre.data,
    routeCapture: routeCap.data,
    routePreprocessed: routePre.data,
    battleCapture: battleCap.data,
    battlePreprocessed: battlePre.data,
    dir: routeCap.dir || routePre.dir || battleCap.dir || battlePre.dir || localDir,

  };
  if (!routeCap.data || !routePre.data || !battleCap.data || !battlePre.data) {
    const errors = [];
    if (!routeCap.data || !routePre.data) errors.push('route capture/pre missing');
    if (!battleCap.data || !battlePre.data) errors.push('battle capture/pre missing');
    if (errors.length) res.error = errors.join('; ');
    }
  return res;
}

ipcMain.handle('live:read-preview', async () => readPreviewImages());
ipcMain.handle('live:get-debug-images', async () => readPreviewImages());

ipcMain.handle('live:save-settings', async (_evt, payload) => {
  const dir = liveAppDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = settingsPath();

  // Merge existing values to avoid nuking anything user already has
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const merged = {
    ...prev,
    ...(payload && typeof payload === 'object' ? payload : {})
  };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf8');
   // restart OCR helper so new settings take effect (only if enabled)
  try { const s = readOcrSettings(); if (s?.ocrEnabled !== false) { await stopLiveRouteOCR(); await startLiveRouteOCR(); } } catch {}
  try { mainWindow?.webContents?.send('force-live-reconnect', { reset: true }); } catch {}
  return { ok: true, path: file, saved: merged };
});
