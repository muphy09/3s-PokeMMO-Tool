// ===== Core requires =====

const { app, BrowserWindow, ipcMain, Menu, shell, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');


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
let ocrImageDebugEnabled = false;
let downloadedUpdate = null;
let downloadingVersion = null;
let chatLogWatcher = null;
let autoCatchEnabled = true;

const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

function safeGetAppPath() {
  try { return app.getAppPath(); } catch { return null; }
}

function applyTelemetryDefaultsFromConfig() {
  const seen = new Set();
  const candidates = [];

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'telemetry.config.json'));
  }

  const appPath = safeGetAppPath();
  if (appPath) {
    candidates.push(path.join(appPath, 'resources', 'telemetry.config.json'));
    candidates.push(path.join(appPath, 'telemetry.config.json'));
  }

  candidates.push(path.join(__dirname, '..', 'resources', 'telemetry.config.json'));

  for (const file of candidates) {
    if (!file || seen.has(file)) continue;
    seen.add(file);

    let stats;
    try {
      stats = fs.statSync(file);
    } catch {
      continue;
    }
    if (!stats?.isFile()) continue;

    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      log('failed to read telemetry config', file, err?.message || err);
      continue;
    }
    if (!raw || !raw.trim()) continue;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      log('failed to parse telemetry config', file, err?.message || err);
      continue;
    }

    const appliedKeys = [];
    let changed = false;
    for (const [key, value] of Object.entries(parsed || {})) {
      if (!key.startsWith('POKEMMO_TOOL_TELEMETRY_')) continue;
      if (process.env[key]) continue;
      if (typeof value !== 'string') continue;
      const normalized = value.trim();
      if (!normalized) continue;
      process.env[key] = normalized;
      appliedKeys.push(key);
      changed = true;
    }

    if (changed) {
      log('loaded telemetry defaults from config', file, 'keys:', appliedKeys.join(', '));
      break;
    }
  }
}

applyTelemetryDefaultsFromConfig();

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

function installMetaPath() {
  try {
    return path.join(app.getPath('userData'), 'install-meta.json');
  } catch (err) {
    log('installMetaPath error', err?.message || err);
    return null;
  }
}

function readInstallMeta() {
  const file = installMetaPath();
  if (!file) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    return raw;
  } catch {
    return null;
  }
}

function writeInstallMeta(meta) {
  const file = installMetaPath();
  if (!file) return false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(meta || {}, null, 2), 'utf8');
    return true;
  } catch (err) {
    log('writeInstallMeta error', err?.message || err);
    return false;
  }
}

function ensureInstallMeta() {
  const existing = readInstallMeta() || {};
  let changed = false;
  if (!existing.installId) {
    existing.installId = crypto.randomUUID();
    changed = true;
  }
  if (!existing.firstSeen) {
    existing.firstSeen = new Date().toISOString();
    changed = true;
  }
  if (!existing.reports || typeof existing.reports !== 'object') {
    existing.reports = {};
    changed = true;
  }
  if (changed) writeInstallMeta(existing);
  return existing;
}

async function reportInstallIfNeeded() {
  const endpoint = process.env.POKEMMO_TOOL_TELEMETRY_URL;
  if (!endpoint) {
    log('telemetry endpoint not configured; skipping install report');
    return;
  }

  if (typeof fetch !== 'function') {
    log('fetch API unavailable; skipping install report');
    return;
  }

  const meta = ensureInstallMeta();
  if (!meta?.installId) {
    log('unable to load install metadata; skipping install report');
    return;
  }

  const version = normalizeVersion(app.getVersion());
  if (!version) {
    log('unable to determine app version for telemetry');
    return;
  }

  const reportKey = `${process.platform}:${process.arch}:${version}`;
  // Check if we already reported this exact version recently (within 24 hours)
  // This prevents duplicate reports on app restarts while allowing version updates
  const lastReportTime = meta?.reports?.[reportKey];
  if (lastReportTime) {
    const hoursSinceLastReport = (Date.now() - new Date(lastReportTime).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastReport < 24) {
      log('telemetry already reported for this version within 24h; skipping');
      return;
    }
  }

  const now = new Date().toISOString();
  const payload = {
    userId: meta.installId,
    appVersion: version,
    os: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    electron: process.versions?.electron,
    node: process.versions?.node,
    firstSeen: meta.firstSeen,
    lastSeen: now,
  };

  const headers = { 'Content-Type': 'application/json' };
  const authToken = process.env.POKEMMO_TOOL_TELEMETRY_KEY || process.env.POKEMMO_TOOL_TELEMETRY_TOKEN;
  if (authToken) {
    headers.Authorization = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
  }

  const controller = (typeof AbortController === 'function') ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => {
    try { controller.abort(); } catch {}
  }, 10000) : null;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
    }
    meta.reports[reportKey] = now;
    meta.lastReported = { version, platform: process.platform, arch: process.arch, at: now };
    writeInstallMeta(meta);
    log('reported install telemetry', version, process.platform, process.arch);
  } catch (err) {
    log('reportInstallIfNeeded failed', err?.message || err);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}


// Enumerate visible top-level windows with PIDs and titles
function normalizeWindowList(list = []) {
  const uniq = new Map();
  for (const item of list) {
    if (!item) continue;
    const pidVal = Number.parseInt(String(item.pid ?? item.processId ?? ''), 10);
    const pid = Number.isFinite(pidVal) ? pidVal : null;
    const id = item.id ?? item.handle ?? item.handleHex ?? null;
    const title = String(item.title || item.windowTitle || item.name || '').trim();
    if (!title) continue;
    const processNameRaw = String(item.processName || '').trim();
    const normalized = {
      pid,
      processName: processNameRaw || (title.toLowerCase().includes('pokemmo') ? 'pokemmo' : ''),
      title,
    };
    if (item.handle != null) normalized.handle = item.handle;
    if (item.handleHex) normalized.handleHex = item.handleHex;
    if (id != null) normalized.id = id;
    const key = pid ? `p${pid}` : (id ? `i${id}` : null);
    if (!key || uniq.has(key)) continue;
    uniq.set(key, normalized);
  }
  return [...uniq.values()].sort((a, b) => {
    const aName = `${a.processName || ''} ${a.title || ''}`.toLowerCase();
    const bName = `${b.processName || ''} ${b.title || ''}`.toLowerCase();
    const aScore = aName.includes('pokemmo') ? -1 : 0;
    const bScore = bName.includes('pokemmo') ? -1 : 0;
    if (aScore !== bScore) return aScore - bScore;
    return (a.title || '').localeCompare(b.title || '');
  });
}

async function enumerateWindowsLinux() {
  const exe = await ensureOCRExeExists();
  if (!exe) return [];
  const cwd = path.dirname(exe);
  const env = {
    ...process.env,
    POKEMMO_LIVE_DATA_DIR: defaultOcrDataDir(),
  };
  return new Promise((resolve) => {
    const proc = spawn(exe, ['--list-windows'], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    proc.stdout.on('data', (d) => chunks.push(Buffer.from(d)));
    proc.on('error', (err) => {
      log('enumerateWindows helper error', err?.message || err);
      resolve([]);
    });
    proc.on('close', () => {
      const txt = Buffer.concat(chunks).toString('utf8').trim();
      if (!txt) return resolve([]);
      try {
        const json = JSON.parse(txt);
        const arr = Array.isArray(json) ? json : [json];
        const mapped = arr.map((item) => ({
          pid: item?.pid ?? item?.processId ?? null,
          processName: item?.processName ?? '',
          title: item?.title ?? item?.windowTitle ?? item?.name ?? '',
          id: item?.handleHex ?? item?.handle ?? item?.id ?? null,
          handle: item?.handle ?? null,
          handleHex: item?.handleHex ?? null,
        }));
        resolve(normalizeWindowList(mapped));
      } catch (err) {
        log('enumerateWindows helper parse error', err?.message || err);
        resolve([]);
      }
    });
  });
}

async function enumerateWindows() {
  if (isLinux) {
    return await enumerateWindowsLinux();
  }
  // Try simple PS: Get-Process with MainWindowTitle
  async function psSimple() {
    return new Promise((resolve) => {
      const ps = spawn('powershell.exe', [
        '-NoProfile','-NonInteractive','-Command',
        "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json -Depth 2"
      ], { windowsHide: true });
      const chunks = [];
      ps.stdout.on('data', (d) => chunks.push(Buffer.from(d)));
      ps.on('close', () => {
        try {
          const buf = Buffer.concat(chunks);
          let txt = buf.toString('utf8').trim();
          if (!txt || txt.includes('\u0000')) txt = buf.toString('utf16le').trim();
          if (!txt) return resolve([]);
          const json = JSON.parse(txt);
          const arr = Array.isArray(json) ? json : [json];
          resolve(arr.map((x) => ({ pid: x.Id, processName: x.ProcessName || '', title: x.MainWindowTitle || '' })));
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
      ps.stdout.on('data', (d) => chunks.push(Buffer.from(d)));
      ps.on('close', () => {
        try {
          const buf = Buffer.concat(chunks);
          let txt = buf.toString('utf8').trim();
          if (!txt || txt.includes('\u0000')) txt = buf.toString('utf16le').trim();
          if (!txt) return resolve([]);
          const json = JSON.parse(txt);
          const arr = Array.isArray(json) ? json : [json];
          resolve(arr.map((x) => ({ pid: x.Id, processName: x.ProcessName || '', title: x.MainWindowTitle || '' })));
        } catch { resolve([]); }
      });
      ps.on('error', () => resolve([]));
    });
  }

  let list = await psSimple();
  if (!list.length) list = await psEnumWin32();

  return normalizeWindowList(list);
}


function log(...args) {
  try {
    const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
    const logFile = path.join(app.getPath('userData'), 'pokemmo-tool.log');
    fs.appendFileSync(logFile, line);
  } catch {}
  console.log('[main]', ...args);
}

let autoUpdaterInstance = null;
let autoUpdaterLoadFailed = false;
function ensureAutoUpdater() {
  if (autoUpdaterInstance || autoUpdaterLoadFailed) return autoUpdaterInstance;
  try {
    autoUpdaterInstance = require('electron-updater').autoUpdater;
  } catch (err) {
    autoUpdaterLoadFailed = true;
    log('autoUpdater load failed', err?.message || err);
    autoUpdaterInstance = null;
  }
  return autoUpdaterInstance;
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
const OCR_SETTINGS_VERSION = 2;

function readOcrSettingsRaw() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch { return {}; }
}
function clampCaptureZoom(value, fallback = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const normalized = (num > 1 && num <= 2.5) ? (num - 1) : num;
  const clamped = Math.max(0.1, Math.min(0.9, normalized));
  return Math.round(clamped * 10) / 10;
}
function clampCaptureOffset(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.max(-0.5, Math.min(0.5, num));
  return Math.round(clamped * 1000) / 1000;
}
function captureZoomToEnv(value) {
  if (value === null || value === undefined) return null;
  const normalized = clampCaptureZoom(value, 0.5);
  if (!Number.isFinite(normalized)) return null;
  return Math.max(0.1, Math.min(0.9, normalized));
}
function normalizeOcrAgg(value, version = 0) {
  const v = (typeof value === 'string' ? value : '').trim().toLowerCase();
  const allowed = ['fast', 'normal', 'efficient'];
  if (version >= OCR_SETTINGS_VERSION) {
    return allowed.includes(v) ? v : 'fast';
  }
  if (v === 'normal' || v === 'efficient') return v;
  if (v === 'fast') return 'efficient';
  if (v === 'balanced' || v === 'max' || v === 'auto') return 'fast';
  return allowed.includes(v) ? v : 'fast';
}
function normalizeOcrSettings(raw = {}) {
  const version = Number(raw?.ocrAggressivenessVersion) || 0;
  const ocrAggressiveness = normalizeOcrAgg(raw?.ocrAggressiveness, version);
  const captureZoom = clampCaptureZoom(raw?.captureZoom ?? 0.5, 0.5);
  const battleCaptureZoom = clampCaptureZoom(
    raw?.battleCaptureZoom ?? raw?.captureZoom ?? 0.5,
    captureZoom,
  );
  const routeCaptureOffsetX = clampCaptureOffset(raw?.routeCaptureOffsetX ?? 0, 0);
  const routeCaptureOffsetY = clampCaptureOffset(raw?.routeCaptureOffsetY ?? 0, 0);
  const battleCaptureOffsetX = clampCaptureOffset(raw?.battleCaptureOffsetX ?? 0, 0);
  const battleCaptureOffsetY = clampCaptureOffset(raw?.battleCaptureOffsetY ?? 0, 0);
  const normalized = {
    ...raw,
    captureZoom,
    battleCaptureZoom,
    ocrAggressiveness,
    ocrAggressivenessVersion: Math.max(version, OCR_SETTINGS_VERSION),
    routeCaptureOffsetX,
    routeCaptureOffsetY,
    battleCaptureOffsetX,
    battleCaptureOffsetY,
  };
  return normalized;
}
function readOcrSettings() {
  return normalizeOcrSettings(readOcrSettingsRaw());
}
function writeOcrSettingsRaw(obj) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(obj || {}, null, 2), 'utf8');
    return true;
  } catch (e) { log('writeOcrSettings error', e?.message || e); return false; }
}
function writeOcrSettings(obj) {
  const normalized = normalizeOcrSettings(obj || {});
  return writeOcrSettingsRaw(normalized);
}
function applyOcrSettingsPatch(patch = {}) {
  const current = readOcrSettingsRaw();
  const merged = { ...current, ...(patch || {}) };
  const normalized = normalizeOcrSettings(merged);
  writeOcrSettingsRaw(normalized);
  return normalized;
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

// ===== Chat Log Watcher for Auto Catch =====
function getPokeMMOLogDir() {
  try {
    const localAppData = process.env.LOCALAPPDATA || app.getPath('localAppData');
    return path.join(localAppData, 'Programs', 'PokeMMO', 'log');
  } catch (err) {
    log('getPokeMMOLogDir error', err?.message || err);
    return null;
  }
}

function getMostRecentChatLog() {
  const logDir = getPokeMMOLogDir();
  if (!logDir || !fs.existsSync(logDir)) {
    return null;
  }

  try {
    const files = fs.readdirSync(logDir)
      .filter(f => f.startsWith('chat_') && f.endsWith('.log'))
      .map(f => {
        const fullPath = path.join(logDir, f);
        try {
          const stats = fs.statSync(fullPath);
          return { path: fullPath, mtime: stats.mtime };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);

    return files.length > 0 ? files[0].path : null;
  } catch (err) {
    log('getMostRecentChatLog error', err?.message || err);
    return null;
  }
}

function parseCatchLine(line) {
  // Match pattern: [MM/DD/YY HH:MM:SS AM/PM] [Battle] Gotcha! [#color_code]Pokemon Name[#] was caught!
  // or [MM/DD/YY HH:MM:SS AM/PM] [Battle] Gotcha! [#color_code]Alpha Pokemon Name[#] was caught!
  // The pattern may span multiple lines, so we normalize it first
  const normalized = line.replace(/\r?\n/g, ' ').trim();

  // Match with optional timestamp prefix
  const catchMatch = normalized.match(/(?:\[[^\]]+\]\s*)?\[Battle\]\s+Gotcha!\s*\[#[^\]]*\](.*?)\[#\]\s+was\s+caught!/i);
  if (!catchMatch) return null;

  let pokemonText = catchMatch[1].trim();
  let isAlpha = false;

  // Check if it starts with "Alpha"
  if (/^Alpha\s+/i.test(pokemonText)) {
    isAlpha = true;
    pokemonText = pokemonText.replace(/^Alpha\s+/i, '').trim();
  }

  return { pokemonName: pokemonText, isAlpha };
}

function startChatLogWatcher() {
  if (!autoCatchEnabled) {
    log('Auto catch disabled; not starting chat log watcher');
    return;
  }

  stopChatLogWatcher();

  const logDir = getPokeMMOLogDir();
  if (!logDir) {
    log('PokeMMO log directory not found; cannot start chat log watcher');
    return;
  }

  if (!fs.existsSync(logDir)) {
    log('PokeMMO log directory does not exist:', logDir);
    return;
  }

  log('Starting chat log watcher for directory:', logDir);

  let lastPosition = 0;
  let currentLogFile = getMostRecentChatLog();

  if (currentLogFile && fs.existsSync(currentLogFile)) {
    try {
      const stats = fs.statSync(currentLogFile);
      lastPosition = stats.size;
      log('Watching chat log file:', currentLogFile, 'starting at position:', lastPosition);
    } catch (err) {
      log('Error getting initial file size:', err?.message || err);
    }
  }

  const checkForNewLines = () => {
    if (!autoCatchEnabled) return;

    const latestLogFile = getMostRecentChatLog();
    if (!latestLogFile || !fs.existsSync(latestLogFile)) {
      log('[AutoCatch] No log file found');
      return;
    }

    // If the log file changed, reset position
    if (latestLogFile !== currentLogFile) {
      log('[AutoCatch] Log file changed from', currentLogFile, 'to', latestLogFile);
      currentLogFile = latestLogFile;
      lastPosition = 0;
    }

    try {
      const stats = fs.statSync(currentLogFile);
      log('[AutoCatch] Checking file - current size:', stats.size, 'last position:', lastPosition);

      if (stats.size > lastPosition) {
        // Read the new content directly instead of using streams
        const newContent = fs.readFileSync(currentLogFile, {
          encoding: 'utf8',
          start: lastPosition,
          end: stats.size
        });

        log('[AutoCatch] New content read, length:', newContent.length);
        log('[AutoCatch] New content (first 500 chars):', newContent.substring(0, 500));

        // Look for catch patterns in the entire new content
        // Pattern: [timestamp] [Battle] Gotcha!\n[#color]PokemonName[#] was caught!
        const catchPattern = /\[([^\]]+)\]\s*\[Battle\]\s*Gotcha!\s*\[#[^\]]*\](.*?)\[#\]\s*was\s*caught!/gi;

        log('[AutoCatch] Testing regex pattern...');
        let match;
        let matchCount = 0;
        while ((match = catchPattern.exec(newContent)) !== null) {
          matchCount++;
          log('[AutoCatch] Match found:', match[0]);
          let pokemonText = match[2].trim();
          let isAlpha = false;

          // Check if it starts with "Alpha"
          if (/^Alpha\s+/i.test(pokemonText)) {
            isAlpha = true;
            pokemonText = pokemonText.replace(/^Alpha\s+/i, '').trim();
          }

          const catchData = { pokemonName: pokemonText, isAlpha };
          log('[AutoCatch] Detected catch:', catchData);

          try {
            mainWindow?.webContents?.send('pokemon-caught', catchData);
            log('[AutoCatch] Event sent successfully');
          } catch (err) {
            log('[AutoCatch] Error sending pokemon-caught event:', err?.message || err);
          }
        }

        log('[AutoCatch] Total matches found:', matchCount);
        lastPosition = stats.size;
      } else {
        log('[AutoCatch] No new content (size <= lastPosition)');
      }
    } catch (err) {
      log('[AutoCatch] Error checking chat log:', err?.message || err);
    }
  };

  // Check for new lines every second
  chatLogWatcher = setInterval(checkForNewLines, 1000);
  log('Chat log watcher started');
}

function stopChatLogWatcher() {
  if (chatLogWatcher) {
    clearInterval(chatLogWatcher);
    chatLogWatcher = null;
    log('Chat log watcher stopped');
  }
}

// ===== Updater wiring =====
function setupAutoUpdates() {
  const updater = ensureAutoUpdater();
  if (!updater) {
    log('autoUpdater unavailable; skipping update checks');
    return;
  }

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on('error', (err) => log('autoUpdater error:', err?.message || err));
  updater.on('checking-for-update', () => {
    log('checking-for-update');
    notifyWin('Checking for updates...', '');
    try { mainWindow?.webContents?.send('checking-for-update'); } catch {}
  });
  updater.on('update-not-available', () => {
    downloadingVersion = null;
    log('update-not-available');
    notifyWin('Up to date', 'You have the latest version.');
    try { mainWindow?.webContents?.send('update-not-available'); } catch {}
  });
  updater.on('update-available', (info) => {
    downloadingVersion = info?.version ? normalizeVersion(info.version) : downloadingVersion;
    log('update-available', downloadingVersion || '');
    notifyWin('Update available', 'Downloading update v' + (downloadingVersion || '') + '...');
    try { mainWindow?.webContents?.send('update-available', downloadingVersion); } catch {}
  });
  updater.on('update-downloaded', (info) => {
    downloadedUpdate = info?.version ? normalizeVersion(info.version) : downloadedUpdate;
    downloadingVersion = null;
    log('update-downloaded', info?.version || '');
    notifyWin('Update ready', 'Update v' + (downloadedUpdate || '') + ' downloaded. Restart App to apply.');
    try { mainWindow?.webContents?.send('update-downloaded', downloadedUpdate); } catch {}
  });

  // Explicitly set the GitHub feed. In some earlier builds the generated
  // app-update.yml was missing, causing update checks to throw with a
  // "Cannot find update info" error. Setting the feed URL here ensures the
  // updater can always locate the repository even if that file is absent.
  try {
    updater.setFeedURL({
      provider: 'github',
      owner: 'muphy09',
      repo: '3s-PokeMMO-Tool',
    });
  } catch (e) {
    log('setFeedURL failed', e?.message || e);
  }

  setTimeout(() => {
    try { updater.checkForUpdates(); } catch (e) { log('checkForUpdates at boot failed', e); }
  }, 3000);
}

// ===== LiveRouteOCR paths/spawn =====
const OCR_FOLDER_NAME = 'LiveRouteOCR';
const OCR_EXE_NAME = isWin ? 'LiveRouteOCR.exe' : 'LiveRouteOCR';
const OCR_PLATFORM_SUBDIR = isWin ? 'win-x64' : (isLinux ? 'linux-x64' : null);

function firstExisting(paths = []) {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function ensureExecutable(file) {
  if (!isLinux) return;
  if (!file) return;
  try { fs.chmodSync(file, 0o755); } catch {}
}

function ocrUserDir() { return path.join(app.getPath('userData'), OCR_FOLDER_NAME); }
function ocrResourcesExe() {
  const candidates = [];
  if (OCR_PLATFORM_SUBDIR) candidates.push(rsrc(OCR_FOLDER_NAME, OCR_PLATFORM_SUBDIR, OCR_EXE_NAME));
  candidates.push(path.join(rsrc(OCR_FOLDER_NAME), OCR_EXE_NAME));
  const exe = firstExisting(candidates);
  if (exe) ensureExecutable(exe);
  return exe;
}
function ocrUserExe() {
  const exe = path.join(ocrUserDir(), OCR_EXE_NAME);
  if (fs.existsSync(exe)) {
    ensureExecutable(exe);
    return exe;
  }
  return null;
}
function ocrZipPath() {
  const base = process.resourcesPath || process.cwd();
  const names = [];
  if (isWin) names.push(OCR_FOLDER_NAME + '.zip');
  if (isLinux) names.push(OCR_FOLDER_NAME + '-linux.zip', OCR_FOLDER_NAME + '.zip');
  return firstExisting(names.map((name) => path.join(base, name)));
}
function ocrDevExe() {
  const base = path.join(__dirname, '..', OCR_FOLDER_NAME);
  const runtime = OCR_PLATFORM_SUBDIR;
  const candidates = [
    path.join(base, OCR_EXE_NAME),
    runtime ? path.join(base, runtime, OCR_EXE_NAME) : null,
    path.join(base, 'publish', runtime || '', OCR_EXE_NAME),
  ].filter(Boolean);
  const exe = firstExisting(candidates);
  if (exe) ensureExecutable(exe);
  return exe;
}

function defaultOcrDataDir() {
  if (process.env.POKEMMO_LIVE_DATA_DIR) return process.env.POKEMMO_LIVE_DATA_DIR;
  try {
    if (isWin) {
      const base = process.env.LOCALAPPDATA || app.getPath('localAppData');
      if (base) return path.join(base, 'PokemmoLive');
    }
  } catch {}
  if (isLinux) {
    const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    return path.join(base, 'PokemmoLive');
  }
  try {
    return path.join(app.getPath('userData'), 'PokemmoLive');
  } catch {}
  return path.join(os.homedir(), 'PokemmoLive');
}


async function extractZipToUserDir(zipFile, destDir) {
  try {
    const extract = require('extract-zip');
    await extract(zipFile, { dir: destDir });
    const exe = path.join(destDir, OCR_EXE_NAME);
    if (fs.existsSync(exe)) ensureExecutable(exe);
    return fs.existsSync(exe);
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
    const exe = path.join(destDir, OCR_EXE_NAME);
    if (fs.existsSync(exe)) ensureExecutable(exe);
    return fs.existsSync(exe);
  }
  return false;
}

async function ensureOCRExeExists() {
  if (!app.isPackaged) {
    const dev = ocrDevExe();
    if (dev) return dev;
  }

  const resourceExe = ocrResourcesExe();
  if (resourceExe) return resourceExe;

  const userExe = ocrUserExe();
  if (userExe) return userExe;

  const zip = ocrZipPath();
  if (zip) {
    try {
      fs.mkdirSync(ocrUserDir(), { recursive: true });
      const ok = await extractZipToUserDir(zip, ocrUserDir());
      if (ok) {
        const exe = ocrUserExe();
        if (exe) return exe;
      }
    } catch (e) {
      log('Failed to extract OCR zip', e);
    }
  }
  return null;
}


async function startLiveRouteOCR() {
  try {
    if (ocrProc) { try { ocrProc.kill(); } catch {} ocrProc = null; }
    if (!isWin && !isLinux) { log('LiveRouteOCR supported on Windows/Linux only; skipping'); return; }

    const settings = readOcrSettings();
    if (settings?.ocrEnabled === false) {
      log('LiveRouteOCR start skipped (disabled in settings)');
      return;
    }

    const exe = await ensureOCRExeExists();
    if (!exe) {
      const msg = ['LiveRouteOCR not found.', 'Searched:', ' - ' + (ocrDevExe() || 'n/a'), ' - ' + (ocrResourcesExe() || 'n/a'), ' - ' + (ocrUserExe() || 'n/a'), 'Zip:', ' - ' + (ocrZipPath() || 'n/a')].join('\n');
      log(msg);
      dialog.showMessageBox({ type: 'warning', message: 'LiveRouteOCR Missing', detail: msg });
      return;
    }

    const cwd = path.dirname(exe);
    const dataDir = defaultOcrDataDir();
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
    const s = settings || {};
    const captureZoomEnv = captureZoomToEnv(s?.captureZoom);
    const battleCaptureZoomEnv = captureZoomToEnv(s?.battleCaptureZoom ?? s?.captureZoom);
    const routeOffsetX = clampCaptureOffset(s?.routeCaptureOffsetX ?? 0, 0);
    const routeOffsetY = clampCaptureOffset(s?.routeCaptureOffsetY ?? 0, 0);
    const battleOffsetX = clampCaptureOffset(s?.battleCaptureOffsetX ?? 0, 0);
    const battleOffsetY = clampCaptureOffset(s?.battleCaptureOffsetY ?? 0, 0);
    const env = {
      ...process.env,
      TARGET_PID: s?.targetPid ? String(s.targetPid) : '',
      CAPTURE_ZOOM: captureZoomEnv != null ? String(captureZoomEnv) : '',
      BATTLE_CAPTURE_ZOOM: battleCaptureZoomEnv != null ? String(battleCaptureZoomEnv) : '',
      ROUTE_CAPTURE_OFFSET_X: routeOffsetX !== 0 ? String(routeOffsetX) : '',
      ROUTE_CAPTURE_OFFSET_Y: routeOffsetY !== 0 ? String(routeOffsetY) : '',
      BATTLE_CAPTURE_OFFSET_X: battleOffsetX !== 0 ? String(battleOffsetX) : '',
      BATTLE_CAPTURE_OFFSET_Y: battleOffsetY !== 0 ? String(battleOffsetY) : '',
      OCR_AGGRESSIVENESS: s?.ocrAggressiveness || 'fast',
      OCR_IMAGE_DEBUG: ocrImageDebugEnabled ? '1' : '0',
      POKEMMO_TESSDATA_DIR: path.join(cwd, 'tessdata'),
      POKEMMO_LIVE_DATA_DIR: dataDir,
    };
    const spawnOpts = {
      cwd,
      stdio: 'ignore',
      env,
    };
    if (isWin) spawnOpts.windowsHide = true;
    ocrProc = spawn(exe, [], spawnOpts);

    log('LiveRouteOCR env', {
      TARGET_PID: env.TARGET_PID,
      CAPTURE_ZOOM: env.CAPTURE_ZOOM,
      CAPTURE_ZOOM_SCALE: captureZoomEnv != null ? Math.round((1 + captureZoomEnv) * 10) / 10 : null,
      BATTLE_CAPTURE_ZOOM: env.BATTLE_CAPTURE_ZOOM,
      BATTLE_CAPTURE_ZOOM_SCALE: battleCaptureZoomEnv != null ? Math.round((1 + battleCaptureZoomEnv) * 10) / 10 : null,
      ROUTE_CAPTURE_OFFSET_X: env.ROUTE_CAPTURE_OFFSET_X,
      ROUTE_CAPTURE_OFFSET_Y: env.ROUTE_CAPTURE_OFFSET_Y,
      BATTLE_CAPTURE_OFFSET_X: env.BATTLE_CAPTURE_OFFSET_X,
      BATTLE_CAPTURE_OFFSET_Y: env.BATTLE_CAPTURE_OFFSET_Y,
      OCR_AGGRESSIVENESS: env.OCR_AGGRESSIVENESS,
      OCR_IMAGE_DEBUG: env.OCR_IMAGE_DEBUG,
      POKEMMO_LIVE_DATA_DIR: dataDir,
    });

    ocrProc.on('exit', (code, sig) => { log('LiveRouteOCR exited', code, sig); ocrProc = null; });
    ocrProc.on('error', (err) => { log('LiveRouteOCR spawn error:', err?.message || err); ocrProc = null; });

    log('LiveRouteOCR started at', exe);
    // After starting (or restarting) the OCR helper, ensure the renderer clears
    // any stale state and attempts a fresh websocket connection. Without this
    // signal the Live Route tab could remain disconnected until manually
    // refreshed, effectively bricking the feature after a "Reload OCR" action
    // or across app restarts.
    try { mainWindow?.webContents?.send('force-live-reconnect', { reset: true }); } catch {}
  } catch (e) {
    log('startLiveRouteOCR exception:', e?.message || e);
  }
}

async function stopLiveRouteOCR() {
  try {
    const pid = ocrProc?.pid || null;
    if (isWin) {
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
      await new Promise((resolve) => {
        const psCode = [
          "ErrorActionPreference = 'SilentlyContinue';",
          "Get-Process -Name 'LiveRouteOCR','LiveBattleOCR' | Stop-Process -Force;"
        ].join('\n');
        const ps = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-Command', psCode], { windowsHide: true });
        ps.on('exit', () => resolve());
        ps.on('error', () => resolve());
        setTimeout(resolve, 1500);
      });
      log('LiveRouteOCR stop issued (taskkill + Stop-Process)');
    } else {
      const proc = ocrProc;
      try { if (proc && !proc.killed) { proc.kill('SIGTERM'); } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 400));
      try { if (proc && !proc.killed) { proc.kill('SIGKILL'); } } catch {}
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
      sandbox: false, // required so preload can require('fs')/'path' to expose window.app bridge
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
    const updater = ensureAutoUpdater();
    if (!updater) {
      return { status: 'error', message: 'Updater unavailable' };
    }
    const current = app.getVersion();
    if (downloadedUpdate && isNewerVersion(downloadedUpdate, current)) {
      return { status: 'downloaded', version: downloadedUpdate, current };
    }
    if (downloadingVersion && isNewerVersion(downloadingVersion, current)) {
      return { status: 'downloading', version: downloadingVersion, current };
    }
    const result = await updater.checkForUpdates();
    const latest = normalizeVersion(result?.updateInfo?.version);
    if (!latest) return { status: 'uptodate', current };
    if (isNewerVersion(latest, current)) {
      downloadingVersion = latest;
      try { await updater.downloadUpdate(); } catch (e) { log('downloadUpdate failed', e); }
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
  const next = applyOcrSettingsPatch({ ocrEnabled: enabled });
  if (!enabled) {
    await stopLiveRouteOCR();
  } else {
    await stopLiveRouteOCR();
    await startLiveRouteOCR();
  }
  try { mainWindow?.webContents?.send('force-live-reconnect', { reset: true }); } catch {}
  return { ok: true, settings: next };
});
ipcMain.handle('ocr:get-image-debug', async () => ({ ok: true, enabled: ocrImageDebugEnabled }));
ipcMain.handle('ocr:set-image-debug', async (_evt, payload = {}) => {
  const enabled = !!payload?.enabled;
  if (enabled === ocrImageDebugEnabled) {
    return { ok: true, enabled };
  }

  ocrImageDebugEnabled = enabled;

  const settings = readOcrSettings();
  const shouldRun = settings?.ocrEnabled !== false;

  try { await stopLiveRouteOCR(); } catch {}
  if (shouldRun) {
    try { await startLiveRouteOCR(); } catch (err) { return { ok: false, error: err?.message || String(err) }; }
  }

  if (shouldRun) {
    try { mainWindow?.webContents?.send('force-live-reconnect', { reset: true }); } catch {}
  }

  return { ok: true, enabled: ocrImageDebugEnabled };
});
ipcMain.handle('stop-ocr', async () => { await stopLiveRouteOCR(); return true; });
ipcMain.handle('refresh-app', async () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache(); return true; });

// --- OCR Setup IPC ---
ipcMain.handle('app:listWindows', async () => {
  return await enumerateWindows();
});

ipcMain.handle('app:getOcrSetup', async () => {
  const s = readOcrSettings();
  return {
    targetPid: s?.targetPid ?? null,
    captureZoom: s?.captureZoom ?? 0.5,
    battleCaptureZoom: s?.battleCaptureZoom ?? s?.captureZoom ?? 0.5,
    ocrAggressiveness: s?.ocrAggressiveness ?? 'fast',
    routeCaptureOffsetX: s?.routeCaptureOffsetX ?? 0,
    routeCaptureOffsetY: s?.routeCaptureOffsetY ?? 0,
    battleCaptureOffsetX: s?.battleCaptureOffsetX ?? 0,
    battleCaptureOffsetY: s?.battleCaptureOffsetY ?? 0,
  };
});

ipcMain.handle('app:saveOcrSetup', async (_evt, payload = {}) => {
  const current = readOcrSettings();
  const patch = {};
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'targetPid')) {
    patch.targetPid = payload?.targetPid ? Number(payload.targetPid) : null;
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'captureZoom')) {
    patch.captureZoom = clampCaptureZoom(payload.captureZoom, current?.captureZoom ?? 0.5);
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'battleCaptureZoom')) {
    const fallback = clampCaptureZoom(current?.battleCaptureZoom ?? current?.captureZoom ?? 0.5, current?.captureZoom ?? 0.5);
    patch.battleCaptureZoom = clampCaptureZoom(payload.battleCaptureZoom, fallback);
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'ocrAggressiveness')) {
    patch.ocrAggressiveness = normalizeOcrAgg(payload.ocrAggressiveness, OCR_SETTINGS_VERSION);
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'routeCaptureOffsetX')) {
    patch.routeCaptureOffsetX = clampCaptureOffset(payload.routeCaptureOffsetX, current?.routeCaptureOffsetX ?? 0);
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'routeCaptureOffsetY')) {
    patch.routeCaptureOffsetY = clampCaptureOffset(payload.routeCaptureOffsetY, current?.routeCaptureOffsetY ?? 0);
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'battleCaptureOffsetX')) {
    patch.battleCaptureOffsetX = clampCaptureOffset(payload.battleCaptureOffsetX, current?.battleCaptureOffsetX ?? 0);
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'battleCaptureOffsetY')) {
    patch.battleCaptureOffsetY = clampCaptureOffset(payload.battleCaptureOffsetY, current?.battleCaptureOffsetY ?? 0);
  }
  patch.ocrAggressivenessVersion = OCR_SETTINGS_VERSION;
  const next = applyOcrSettingsPatch(patch);
  if (next?.ocrEnabled !== false) { await stopLiveRouteOCR(); await startLiveRouteOCR(); }
  try { mainWindow?.webContents?.send('force-live-reconnect', { reset: true }); } catch {}
  return true;
});

ipcMain.handle('app:getDebugImages', async () => readPreviewImages());

// --- Compatibility IPC aliases for preload.js ---
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('check-updates', async () => {
  try {
    const updater = ensureAutoUpdater();
    if (!updater) {
      return { status: 'error', message: 'Updater unavailable' };
    }
    const current = app.getVersion();
    if (downloadedUpdate && isNewerVersion(downloadedUpdate, current)) {
      return { status: 'downloaded', version: downloadedUpdate, current };
    }
    if (downloadingVersion && isNewerVersion(downloadingVersion, current)) {
      return { status: 'downloading', version: downloadingVersion, current };
    }
    const result = await updater.checkForUpdates();
    const latest = normalizeVersion(result?.updateInfo?.version);
    if (!latest) return { status: 'uptodate', current };
    if (isNewerVersion(latest, current)) {
      downloadingVersion = latest;
      try { await updater.downloadUpdate(); } catch (e) { log('downloadUpdate failed', e); }
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
  reportInstallIfNeeded().catch((err) => log('reportInstallIfNeeded error', err?.message || err));
  // Start OCR only if enabled in settings
  setTimeout(() => {
    try {
      const s = readOcrSettings();
      const enabled = (s?.ocrEnabled !== false);
      if (enabled) startLiveRouteOCR().catch(() => {});
      else log('LiveRouteOCR disabled by settings; not starting');
    } catch {}
  }, 800);
  // Start chat log watcher for auto catch
  setTimeout(() => {
    try {
      if (autoCatchEnabled) {
        startChatLogWatcher();
      }
    } catch (err) {
      log('Error starting chat log watcher:', err?.message || err);
    }
  }, 1000);
});
app.on('before-quit', () => {
  stopLiveRouteOCR();
  stopChatLogWatcher();
});
app.on('window-all-closed', () => {
  stopLiveRouteOCR();
  stopChatLogWatcher();
  if (process.platform !== 'darwin') app.quit();
});
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
  const dirs = [];
  try {
    const primary = defaultOcrDataDir();
    if (primary) dirs.push(primary);
  } catch {}
  try {
    const userDataDir = path.join(app.getPath('userData'), 'PokemmoLive');
    if (userDataDir && !dirs.includes(userDataDir)) dirs.push(userDataDir);
  } catch {}
  try {
    const appDataDir = path.join(app.getPath('appData'), 'PokemmoLive');
    if (appDataDir && !dirs.includes(appDataDir)) dirs.push(appDataDir);
  } catch {}
  if (dirs.length === 0) {
    try {
      dirs.push(path.join(app.getPath('userData'), 'PokemmoLive'));
    } catch {}
  }

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

  function readText(names, folders = ['']) {
    const nameArr = Array.isArray(names) ? names : [names];
    for (const d of dirs) {
      for (const folder of folders) {
        for (const n of nameArr) {
          const p = path.join(d, folder, n);
          try {
            const txt = fs.readFileSync(p, 'utf8');
            return { text: txt, dir: d };
          } catch {}
        }
      }
    }
    return { text: null, dir: null };
  }

  function parseDetected(text, { kind, noneLabel }) {
    if (!text || typeof text !== 'string') return noneLabel;
    const lines = text.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (!line) continue;
      if (kind === 'route') {
        if (line.includes('SENT NO_ROUTE')) return 'No Route';
        const m = line.match(/SENT ROUTE:\s*(.+?)(?:\s*\([^)]*\))?$/i);
        if (m && m[1]) return m[1].trim();
      } else if (kind === 'battle') {
        if (line.includes('SENT NO_MON')) return 'No Pokemon';
        const m = line.match(/SENT BATTLE:\s*(.+?)(?:\s*\([^)]*\))?$/i);
        if (m && m[1]) return m[1].trim();
      }
    }
    return noneLabel;
  }

  const folders = ['', 'debug'];
  const routeCap = readFirst(['last-route-capture.png', 'last-route-capture.jpg', 'last-route-capture.bmp'], folders);
  const routePre = readFirst(['last-route-pre.png', 'last-route-pre.jpg', 'last-route-pre.bmp', 'last-route-preprocessed.png', 'last-route-preview.png'], folders);
  const battleCap = readFirst(['last-battle-capture.png', 'last-battle-capture.jpg', 'last-battle-capture.bmp'], folders);
  const battlePre = readFirst(['last-battle-pre.png', 'last-battle-pre.jpg', 'last-battle-pre.bmp', 'last-battle-preprocessed.png', 'last-battle-preview.png'], folders);
  const routeLog = readText(['ocr-route.log']);
  const battleLog = readText(['ocr-battle.log']);

  const res = {
    capture: routeCap.data,
    preprocessed: routePre.data,
    routeCapture: routeCap.data,
    routePreprocessed: routePre.data,
    battleCapture: battleCap.data,
    battlePreprocessed: battlePre.data,
    dir: routeCap.dir || routePre.dir || battleCap.dir || battlePre.dir || localDir,
    routeDetected: parseDetected(routeLog.text, { kind: 'route', noneLabel: 'No Route' }),
    battleDetected: parseDetected(battleLog.text, { kind: 'battle', noneLabel: 'No Pokemon' }),

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
  const patch = (payload && typeof payload === 'object') ? { ...payload } : {};
  const current = readOcrSettings();
  if (Object.prototype.hasOwnProperty.call(patch, 'captureZoom')) {
    patch.captureZoom = clampCaptureZoom(patch.captureZoom, current?.captureZoom ?? 0.5);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'battleCaptureZoom')) {
    const fallback = clampCaptureZoom(current?.battleCaptureZoom ?? current?.captureZoom ?? 0.5, current?.captureZoom ?? 0.5);
    patch.battleCaptureZoom = clampCaptureZoom(patch.battleCaptureZoom, fallback);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'ocrAggressiveness')) {
    patch.ocrAggressiveness = normalizeOcrAgg(patch.ocrAggressiveness, OCR_SETTINGS_VERSION);
  }
  patch.ocrAggressivenessVersion = OCR_SETTINGS_VERSION;
  const saved = applyOcrSettingsPatch(patch);
  try { if (saved?.ocrEnabled !== false) { await stopLiveRouteOCR(); await startLiveRouteOCR(); } } catch {}
  try { mainWindow?.webContents?.send('force-live-reconnect', { reset: true }); } catch {}
  return { ok: true, path: SETTINGS_PATH, saved };
});

// ===== Auto Catch IPC Handlers =====
ipcMain.handle('autocatch:get-enabled', async () => {
  return { enabled: autoCatchEnabled };
});

ipcMain.handle('autocatch:set-enabled', async (_evt, payload = {}) => {
  const enabled = !!payload?.enabled;
  autoCatchEnabled = enabled;

  if (enabled) {
    startChatLogWatcher();
  } else {
    stopChatLogWatcher();
  }

  log('Auto catch', enabled ? 'enabled' : 'disabled');
  return { ok: true, enabled: autoCatchEnabled };
});

ipcMain.handle('autocatch:check-log-status', async () => {
  const logDir = getPokeMMOLogDir();
  if (!logDir) {
    return { available: false, reason: 'Log directory path not found' };
  }

  if (!fs.existsSync(logDir)) {
    return { available: false, reason: 'Log directory does not exist' };
  }

  const chatLog = getMostRecentChatLog();
  if (!chatLog) {
    return { available: false, reason: 'No chat log files found' };
  }

  return { available: true, logFile: chatLog };
});







