// ===== Core requires =====
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
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

// ===== Helpers =====
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
function liveAppDataDir() {
  return path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'PokemmoLive');
}

function settingsPath() {
  return path.join(liveAppDataDir(), 'settings.json');
}

// PowerShell one‑liner: list visible top‑level windows with PIDs and titles
function listWindowsPS() {
  const ps = spawn('powershell.exe', ['-NoProfile', '-Command', `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@;

$results = New-Object System.Collections.Generic.List[Object]
$null = [Win32]::EnumWindows({ param($h,$l)
  if (-not [Win32]::IsWindowVisible($h)) { return $true }
  $sb = New-Object System.Text.StringBuilder 512
  [void][Win32]::GetWindowText($h, $sb, $sb.Capacity)
  $title = $sb.ToString()
  if ([string]::IsNullOrWhiteSpace($title)) { return $true }
  [uint32]$pid = 0
  [void][Win32]::GetWindowThreadProcessId($h, [ref]$pid)
  # Emit as CSV-safe string (pid,title)
  $obj = [PSCustomObject]@{ pid = $pid; title = $title }
  $results.Add($obj) | Out-Null
  return $true
}, [IntPtr]::Zero)

# Prefer things that look like PokeMMO/GLFW but return all so user can pick
$results | Sort-Object {
  if ($_.title -match 'pok' -or $_.title -match 'glfw') { 0 } else { 1 }
}, {$_.title} | ConvertTo-Json -Compress
`], { windowsHide: true });

  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { ps.kill(); } catch {}
      reject(new Error('timeout'));
    }, 4000);
    ps.stdout.on('data', d => (out += d.toString()));
    ps.stderr.on('data', d => (err += d.toString()));
    ps.on('error', e => { clearTimeout(timer); reject(e); });
    ps.on('close', code => {
      clearTimeout(timer);
      if (code === 0) {
        try { resolve(JSON.parse(out)); }
        catch (e) { reject(e); }
      } else {
        reject(new Error(err || ('powershell exited ' + code)));
      }
    });
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

// ===== Settings storage (for OCR Setup) =====
const LOCAL_APPDATA = process.env.LOCALAPPDATA || app.getPath('userData'); // prefer real LocalAppData
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

// ===== Updater wiring =====
function setupAutoUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => log('autoUpdater error:', err?.message || err));
  autoUpdater.on('update-downloaded', (info) => {
    log('update-downloaded', info?.version || '');
  });

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
      const msg = `LiveRouteOCR not found.\nSearched:\n - ${ocrResourcesExe()}\n - ${ocrUserExe()}\nZip:\n - ${ocrZipPath()}`;
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
function stopLiveRouteOCR() {
  try { if (ocrProc && !ocrProc.killed) { ocrProc.kill(); log('LiveRouteOCR killed'); } }
  catch (e) { log('stopLiveRouteOCR failed', e?.message || e); }
  finally { ocrProc = null; }
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

  Menu.setApplicationMenu(null);

  // dev/prod loader — load dev server when env URL provided
 const devURL =
  process.env.VITE_DEV_SERVER_URL ||
  process.env.ELECTRON_START_URL ||
  "http://localhost:5173";

  if (devURL && devURL.startsWith("http")) {
    mainWindow.loadURL(devURL);
  } else {
    const indexFile = path.join(__dirname, "..", "dist", "index.html");
    mainWindow.loadFile(indexFile);
  }

  mainWindow.on('ready-to-show', () => { mainWindow?.show(); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ===== IPC =====
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('check-for-updates', async () => {
  try {
    const current = app.getVersion();
    const result = await autoUpdater.checkForUpdates();
    const latest = result?.updateInfo?.version;
    if (!latest) return { status: 'uptodate', current };
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

ipcMain.handle('reload-ocr', async () => { stopLiveRouteOCR(); await startLiveRouteOCR(); return true; });
ipcMain.handle('refresh-app', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache(); return true; });

// --- OCR Setup IPC ---
ipcMain.handle('app:listWindows', async () => {
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
          const txt = Buffer.concat(chunks).toString('utf8').trim();
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
          const txt = Buffer.concat(chunks).toString('utf8').trim();
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
    if (!w || !w.pid) continue;
    if (!uniq.has(w.pid)) uniq.set(w.pid, w);
  }
  const arr = [...uniq.values()].sort((a, b) => {
    const aP = (a.processName || '').toLowerCase().includes('pokemmo') ? -1 : 0;
    const bP = (b.processName || '').toLowerCase().includes('pokemmo') ? -1 : 0;
    if (aP !== bP) return aP - bP;
    return (a.title || '').localeCompare(b.title || '');
  });

  return arr;
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
  stopLiveRouteOCR(); await startLiveRouteOCR();
  try { mainWindow?.webContents?.send('force-live-reconnect', { reset: true }); } catch {}
  return true;
});

ipcMain.handle('app:getDebugImages', async () => {
  // primary: %LOCALAPPDATA%\PokemmoLive
  const primary = POKELIVE_DIR;
  // backup: %APPDATA%\YourApp\PokemmoLive (paranoia)
  const backup = path.join(app.getPath('userData'), 'PokemmoLive');

  const candidates = [
    path.join(primary, 'last-capture.png'),
    path.join(backup,  'last-capture.png'),
  ];
  const candidatesPre = [
    path.join(primary, 'last-pre.png'),
    path.join(backup,  'last-pre.png'),
  ];
  const toDataUrl = (pList) => {
    for (const p of pList) {
      try { if (fs.existsSync(p)) return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'); } catch {}
    }
    return null;
  };
  return { capture: toDataUrl(candidates), pre: toDataUrl(candidatesPre) };
});

// --- Compatibility IPC aliases for preload.js ---
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('check-updates', async () => {
  try {
    const current = app.getVersion();
    const result = await autoUpdater.checkForUpdates();
    const latest = result?.updateInfo?.version;
    if (!latest) return { status: 'uptodate', current };
    if (isNewerVersion(latest, current)) {
      try { await autoUpdater.downloadUpdate(); } catch (e) { log('downloadUpdate failed', e); }
      return { status: 'available', version: latest, current };
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
  setTimeout(() => { startLiveRouteOCR().catch(() => {}); }, 800);
});
app.on('before-quit', () => { stopLiveRouteOCR(); });
app.on('window-all-closed', () => { stopLiveRouteOCR(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });

ipcMain.handle('live:list-windows', async () => {
  try {
    return await listWindowsPS();
  } catch (e) {
   log('listWindowsPS error', e?.message || e);
    return null;
  }
});

ipcMain.handle('live:read-preview', async () => {
  const dir = liveAppDataDir();
  const cap = path.join(dir, 'last-capture.png');
  const pre = path.join(dir, 'last-pre.png');
  function tryRead(p) {
    try {
      const buf = fs.readFileSync(p);
      return 'data:image/png;base64,' + buf.toString('base64');
    } catch {
      return null;
    }
  }
  return {
    capture: tryRead(cap),
    preprocessed: tryRead(pre),
    dir
  };
});

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
   // restart OCR helper so new settings take effect
  try { stopLiveRouteOCR(); await startLiveRouteOCR(); } catch {}
  try { mainWindow?.webContents?.send('force-live-reconnect', { reset: true }); } catch {}
  return { ok: true, path: file, saved: merged };
});