// electron/preload.js
/* eslint-disable no-undef */
const { contextBridge, ipcRenderer, shell } = require('electron');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

/**
 * COMPLETE PRELOAD BRIDGE
 * - Stable paths shared with the OCR helper (LocalAppData\PokemmoLive)
 * - App bridges: version, updates, reload, refresh, start
 * - Live OCR Setup bridges: listWindows/getOcrSetup/saveOcrSetup/getDebugImages
 * - File helpers (read/write/exists/list/delete) for UI flows that persist JSON or export assets
 * - Event forwarders: force-live-reconnect, open-live-setup
 * - First-run: ensures settings.json exists with sane defaults
 *
 * All invoke() calls are wrapped by invokeSafe to avoid renderer crashes when an IPC handler
 * is not present; we fall back to local behavior so the UI keeps working in dev.
 */

// ---------- Stable paths (Windows; cross-platform fallback for dev) ----------
const localAppData = process.env.LOCALAPPDATA
  || (process.platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Local')
      : path.join(os.homedir(), '.local', 'share'));

const pokeLiveDir   = path.join(localAppData, 'PokemmoLive');
const settingsPath  = path.join(pokeLiveDir, 'settings.json');
const lastCapPath   = path.join(pokeLiveDir, 'last-capture.png');
const lastPrePath   = path.join(pokeLiveDir, 'last-pre.png');
const tessdataDir   = path.join(pokeLiveDir, 'tessdata'); // stable copy location used by helper

// ---------- Helpers ----------
function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, obj) {
  try {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(obj ?? {}, null, 2), 'utf8');
    return true;
  } catch { return false; }
}
function fileToDataUrl(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const b64 = fs.readFileSync(filePath).toString('base64');
    return 'data:image/png;base64,' + b64;
  } catch { return null; }
}
async function invokeSafe(channel, payload, fallback) {
  try { return await ipcRenderer.invoke(channel, payload); }
  catch { return (typeof fallback === 'function') ? fallback() : fallback; }
}
function clampZoom(v, def = 1.5) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(1.0, Math.min(2.0, n));
}

// ---------- Local defaults if settings.json is missing ----------
function getLocalSetupDefaults() {
  ensureDir(pokeLiveDir);
  const s = readJSON(settingsPath, {});
  return {
    targetPid: (typeof s.targetPid === 'number') ? s.targetPid : null,
    captureZoom: clampZoom(s.captureZoom ?? 1.5),
    ocrAggressiveness: typeof s.ocrAggressiveness === 'string' ? s.ocrAggressiveness : 'balanced',
  };
}

// ---------- File helper API (used by various UI panes) ----------
const fileApi = {
  exists: (p) => {
    try { return fs.existsSync(p); } catch { return false; }
  },
  readText: (p, fallback = '') => {
    try { return fs.readFileSync(p, 'utf8'); } catch { return fallback; }
  },
  writeText: (p, text) => {
    try { ensureDir(path.dirname(p)); fs.writeFileSync(p, text ?? '', 'utf8'); return true; } catch { return false; }
  },
  readJSON: (p, fallback = null) => readJSON(p, fallback),
  writeJSON: (p, obj) => writeJSON(p, obj),
  listDir: (dir) => {
    try { return fs.readdirSync(dir).map(name => ({ name, path: path.join(dir, name) })); } catch { return []; }
  },
  deleteFile: (p) => {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); return true; } catch { return false; }
  },
  makeDir: (dir) => { try { ensureDir(dir); return true; } catch { return false; } },
  join: (...p) => path.join(...p),
  resolve: (...p) => path.resolve(...p),
  basename: (p) => path.basename(p),
  dirname: (p) => path.dirname(p),
};

// ---------- Exposed API ----------
contextBridge.exposeInMainWorld('paths', {
  localAppData,
  pokeLiveDir,
  settingsPath,
  lastCapPath,
  lastPrePath,
  tessdataDir,
});

contextBridge.exposeInMainWorld('files', fileApi);

contextBridge.exposeInMainWorld('app', {
  /* ===== App base bridges ===== */
  getVersion:    () => invokeSafe('get-version', undefined, null),
  checkUpdates:  () => invokeSafe('check-updates', undefined, { status: 'error', message: 'IPC unavailable' }),
  reloadOCR:     (options) => invokeSafe('reload-ocr', options, true),
  refreshApp:    () => invokeSafe('refresh-app', undefined, (location.reload(), true)),
  startOCR:      () => invokeSafe('start-ocr', undefined, true),

  /* ===== Live OCR Setup bridges ===== */

  /** Returns [{ pid, processName, title }] */
  listWindows:   () => invokeSafe('app:listWindows', undefined, []),

  /** Load persisted setup (IPC → main; fallback to local file) */
  getOcrSetup:   () => invokeSafe('app:getOcrSetup', undefined, getLocalSetupDefaults()),

  /**
   * Save current setup (targetPid, captureZoom, ocrAggressiveness) and restart helper.
   * If IPC fails, we still persist locally and try to poke the helper via reload-ocr.
   */
  saveOcrSetup:  async (payload = {}) => {
    const next = {
      targetPid: (payload.targetPid === null || payload.targetPid === undefined)
        ? null : Number(payload.targetPid),
      captureZoom: clampZoom(payload.captureZoom ?? 1.5),
      ocrAggressiveness: payload.ocrAggressiveness || 'balanced',
    };
    const ok = await invokeSafe('app:saveOcrSetup', next, false);
    if (ok === false) {
      const local = getLocalSetupDefaults();
      const merged = { ...local, ...next };
      writeJSON(settingsPath, merged);
      try { await invokeSafe('reload-ocr', undefined, true); } catch {}
      return true;
    }
    return true;
  },

  /** Returns { capture: dataURL|null, pre: dataURL|null } */
  getDebugImages: () => invokeSafe('app:getDebugImages', undefined, {
    capture: fileToDataUrl(lastCapPath),
    pre: fileToDataUrl(lastPrePath),
  }),

  /** Convenience: open a URL or file externally */
  openExternal: (urlOrPath) => { try { shell.openExternal(urlOrPath); } catch {} return true; },

  /** Optional: request main to open setup panel (if you wired a Menu item/IPC) */
  openLiveSetup: () => { try { ipcRenderer.send('menu:open-live-setup'); } catch {} },
});

// ---------- Event forwarders to the DOM (React listens for these) ----------
ipcRenderer.on('force-live-reconnect', (_e, detail) => {
  try { window.dispatchEvent(new CustomEvent('force-live-reconnect', { detail })); } catch {}
});
ipcRenderer.on('open-live-setup', () => {
  try { window.dispatchEvent(new Event('open-live-setup')); } catch {}
});

// ---------- First-run guard: ensure settings.json exists ----------
(function ensureSettingsFile() {
  try {
    ensureDir(pokeLiveDir);
    if (!fs.existsSync(settingsPath)) {
      const def = getLocalSetupDefaults(); // fills defaults
      writeJSON(settingsPath, def);
    }
  } catch {}
})();

// ---------- Optional dev visibility helpers ----------
contextBridge.exposeInMainWorld('debugPreload', {
  ping: () => 'pong',
  hasSettings: () => fs.existsSync(settingsPath),
  peekSettings: () => readJSON(settingsPath, {}),
  peekImages: () => ({
    captureExists: fs.existsSync(lastCapPath),
    preExists: fs.existsSync(lastPrePath),
  }),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('liveSetup', {
  listWindows: async () => {
    const res = await ipcRenderer.invoke('live:list-windows');
    // normalize to [{pid, title}]
    if (Array.isArray(res)) return res.filter(w => w && w.pid && w.title);
    console.warn('live:list-windows error', res);
    return [];
  },
  readPreview: async () => {
    return await ipcRenderer.invoke('live:read-preview');
  },
  saveSettings: async (settings) => {
    // expected fields: { targetPid: number|null, captureZoom: number, ocrAggressiveness?: 'fast'|'balanced'|'max'|'auto' }
    return await ipcRenderer.invoke('live:save-settings', settings);
  },
  appDataDir: async () => {
    const r = await ipcRenderer.invoke('live:read-preview');
    return r?.dir;
  }
});