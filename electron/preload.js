// electron/preload.js
/* eslint-disable no-undef */
const { contextBridge, ipcRenderer, shell, desktopCapturer } = require('electron');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

/**
 * COMPLETE PRELOAD BRIDGE
 * - Stable paths shared with the OCR helper (LocalAppData\PokemmoLive)
 * - App bridges: version, updates, reload, refresh, start/stop OCR
 * - Live OCR Setup bridges: listWindows/readPreview/saveSettings/getDebugImages
 * - File helpers (read/write/exists/list/delete) for UI flows that persist JSON or export assets
 * - Event forwarders: force-live-reconnect
 * - First-run: ensures settings.json exists with sane defaults
 */

// ---------- Paths ----------
const isWin = process.platform === 'win32';
const localAppData = (() => {
  if (isWin && process.env.LOCALAPPDATA) return process.env.LOCALAPPDATA;
  // Cross‑platform fallback: ~/.config/PokemmoLive
  return path.join(os.homedir(), '.config');
})();

const pokeLiveDir   = path.join(localAppData, 'PokemmoLive');
const settingsPath  = path.join(pokeLiveDir, 'settings.json');
const lastCapPath   = path.join(pokeLiveDir, 'last-capture.png');
const lastPrePath   = path.join(pokeLiveDir, 'last-preview.png');
const lastPreAlt    = path.join(pokeLiveDir, 'last-pre.png');
const tessdataDir   = path.join(pokeLiveDir, 'tessdata');

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
function getLocalSetupDefaults() {
  return {
    // live window target + capture settings
    targetPid: null,
    targetId: null,
    targetTitle: '',
    captureZoom: 1.5,
    ocrAggressiveness: 'auto', // 'fast' | 'balanced' | 'max' | 'auto'
  };
}

// ---------- Local file API exposed to UI ----------
const fileApi = {
  exists: (p) => { try { return fs.existsSync(p); } catch { return false; } },
  readFile: (p, enc = 'utf8') => {
    try { return fs.readFileSync(p, enc); } catch { return null; }
  },
  writeFile: (p, data, enc = 'utf8') => {
    try { ensureDir(path.dirname(p)); fs.writeFileSync(p, data ?? '', enc); return true; } catch { return false; }
  },
  readText: (p) => {
    try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
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

// ---------- Expose constants/paths ----------
contextBridge.exposeInMainWorld('paths', {
  localAppData,
  pokeLiveDir,
  settingsPath,
  lastCapPath,
  lastPrePath,
  tessdataDir,
});
contextBridge.exposeInMainWorld('files', fileApi);

// ---------- App‑level bridges ----------
contextBridge.exposeInMainWorld('app', {
  // App base
  getVersion:    () => invokeSafe('get-version', undefined, null),
  checkUpdates:  () => invokeSafe('check-updates', undefined, { status: 'error', message: 'IPC unavailable' }),
  reloadOCR:     (options) => invokeSafe('reload-ocr', options, true),
  refreshApp:    () => invokeSafe('refresh-app', undefined, (location.reload(), true)),

  // OCR control
  startOCR:      (cfg) => invokeSafe('start-ocr', cfg, { ok: false, message: 'IPC unavailable' }),
  stopOCR:       () => invokeSafe('stop-ocr', undefined, true),

  // Persisted setup + debug
  getOcrSetup:    () => invokeSafe('live:get-setup', undefined, null),
  saveOcrSetup:   (setup) => invokeSafe('live:save-setup', setup, false),
  getDebugImages: () => invokeSafe('live:get-debug-images', undefined, []),
  listWindows:    () => invokeSafe('app:list-windows', undefined, []),

  // Misc
  revealInFolder: (p) => { try { shell.showItemInFolder(p); } catch {} },
  openExternal:   (url) => { try { shell.openExternal(url); } catch {} },

  // Events
  forceLiveReconnect: () => { try { ipcRenderer.send('live:force-reconnect'); } catch {} },
});

// ---------- Live setup bridges ----------
/**
 * Robust listWindows:
 *  - Tries multiple IPC channels for compatibility with older/newer main.js versions
 *  - Normalizes different shapes: {id,name}, {pid,title}, {windowTitle,processId}, etc.
 */
async function listWindowsRobust() {
  const tryChannels = [
    'live:list-windows',
    'app:list-windows',
    'live:listWindows',
    'app:listWindows',
  ];

  let res = null;
  for (const ch of tryChannels) {
    // eslint-disable-next-line no-await-in-loop
    res = await invokeSafe(ch, undefined, null);
    if (Array.isArray(res) || (res && typeof res === 'object' && (res.error || res.ok))) break;
  }

  if (Array.isArray(res)) {
    const normalized = res
      .map((w) => {
        if (!w) return null;
        const pid   = w.pid ?? w.processId ?? null;
        const id    = w.id ?? w.sourceId ?? null; // desktopCapturer uses id
        const title = w.title ?? w.name ?? w.windowTitle ?? w.processName ?? '';
        // Keep items if at least one identifier and a label exist
        if ((!pid && !id) || !title) return null;
        return { pid, id, title };
      })
      .filter(Boolean);
    return normalized;
  }

  if (res && typeof res === 'object' && res.error) {
    return { error: res.error };
  }

  return { error: 'Unknown result from list-windows' };
}

async function listDesktopSources() {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window'] });
    return sources.map((src) => {
      const id = src.id || null;
      const title = src.name || '';
      let pid = null;
      if (id) {
        const parts = String(id).split(':');
        if (parts.length >= 2) {
          const maybe = parseInt(parts[1], 10);
          if (!Number.isNaN(maybe)) pid = maybe;
        }
      }
      return { id, pid, title };
    }).filter(w => w.title);
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

// Expose the modern API
contextBridge.exposeInMainWorld('liveSetup', {
  listWindows: async () => {
    try { return await listWindowsRobust(); }
    catch (e) { return { error: e?.message || String(e) }; }
  },

  readPreview: async () => {
    // main returns { capture?, preprocessed?, dir, error? }
    const viaMain = await invokeSafe('live:read-preview', undefined, null);
    if (viaMain && (viaMain.capture || viaMain.preprocessed || viaMain.pre)) return viaMain;

    const capture = fileToDataUrl(lastCapPath);
    const pre = fileToDataUrl(lastPrePath) || fileToDataUrl(lastPreAlt);
    const res = { capture, preprocessed: pre, dir: pokeLiveDir };
    if (!capture || !pre) res.error = 'Preview images not found';
    return res;
  },

  saveSettings: async (settings) => {
    // normalize and clamp
    const toSave = {
      ...settings,
      captureZoom: clampZoom(settings?.captureZoom),
    };
    return await invokeSafe('live:save-settings', toSave, false);
  },

  appDataDir: async () => {
    // Use read-preview response when available to discover where captures live
    const r = await invokeSafe('live:read-preview', undefined, null);
    return r?.dir || pokeLiveDir;
  },
});

contextBridge.exposeInMainWorld('desktop', {
  listWindows: async () => {
    try { return await listDesktopSources(); }
    catch (e) { return { error: e?.message || String(e) }; }
  },
});

// ---------- Back‑compat aliases (old UI calls window.livesetup.getWindows()) ----------
try {
  const compat = {
    listWindows: (...args) => window.liveSetup.listWindows(...args),
    getWindows:  (...args) => window.liveSetup.listWindows(...args), // alias for legacy calls
    readPreview: (...args) => window.liveSetup.readPreview(...args),
    saveSettings: (...args) => window.liveSetup.saveSettings(...args),
    appDataDir:  (...args) => window.liveSetup.appDataDir(...args),
  };
  contextBridge.exposeInMainWorld('livesetup', compat); // note lowercase 's'
} catch {}

// ---------- First‑run guard: ensure settings.json + folders exist ----------
(function ensureSettingsFile() {
  try {
    ensureDir(pokeLiveDir);
    ensureDir(tessdataDir);
    if (!fs.existsSync(settingsPath)) {
      const def = getLocalSetupDefaults();
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
    preExists: fs.existsSync(lastPrePath) || fs.existsSync(lastPreAlt),
  }),
});
