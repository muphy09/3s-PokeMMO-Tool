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
 * - File helpers (read/write/exists/list/delete)
 * - Event forwarders: force-live-reconnect, open-live-setup
 * - First-run: ensures settings.json exists with sane defaults
 */

// ---------- Paths ----------
const isWin = process.platform === 'win32';
const localAppData =
  (isWin && process.env.LOCALAPPDATA)
    ? process.env.LOCALAPPDATA
    : path.join(os.homedir(), isWin ? 'AppData\\Local' : '.config');

const pokeLiveDir   = path.join(localAppData, 'PokemmoLive');
const settingsPath  = path.join(pokeLiveDir, 'settings.json');
const lastCapPath   = path.join(pokeLiveDir, 'last-capture.png');
const lastPrePath   = path.join(pokeLiveDir, 'last-preview.png');
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
    targetPid: null,
    targetId: null,
    targetTitle: '',
    captureZoom: 1.5,
    ocrAggressiveness: 'auto', // 'fast' | 'balanced' | 'max' | 'auto'
  };
}

// ---------- Local file API ----------
const fileApi = {
  exists: (p) => { try { return fs.existsSync(p); } catch { return false; } },
  readFile: (p, enc = 'utf8') => { try { return fs.readFileSync(p, enc); } catch { return null; } },
  writeFile: (p, data, enc = 'utf8') => { try { ensureDir(path.dirname(p)); fs.writeFileSync(p, data ?? '', enc); return true; } catch { return false; } },
  readText: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } },
  writeText: (p, text) => { try { ensureDir(path.dirname(p)); fs.writeFileSync(p, text ?? '', 'utf8'); return true; } catch { return false; } },
  readJSON: (p, fallback = null) => readJSON(p, fallback),
  writeJSON: (p, obj) => writeJSON(p, obj),
  listDir: (dir) => { try { return fs.readdirSync(dir).map(name => ({ name, path: path.join(dir, name) })); } catch { return []; } },
  deleteFile: (p) => { try { if (fs.existsSync(p)) fs.unlinkSync(p); return true; } catch { return false; } },
  makeDir: (dir) => { try { ensureDir(dir); return true; } catch { return false; } },
  join: (...p) => path.join(...p),
  resolve: (...p) => path.resolve(...p),
  basename: (p) => path.basename(p),
  dirname: (p) => path.dirname(p),
};

// ---------- Exposed constants ----------
contextBridge.exposeInMainWorld('paths', {
  localAppData,
  pokeLiveDir,
  settingsPath,
  lastCapPath,
  lastPrePath,
  tessdataDir,
});
contextBridge.exposeInMainWorld('files', fileApi);

// ---------- App bridges ----------
contextBridge.exposeInMainWorld('app', {
  getVersion:    () => invokeSafe('get-version', undefined, null),
  checkUpdates:  () => invokeSafe('check-updates', undefined, { status: 'error', message: 'IPC unavailable' }),
  reloadOCR:     (options) => invokeSafe('reload-ocr', options, true),
  refreshApp:    () => invokeSafe('refresh-app', undefined, (location.reload(), true)),

  startOCR:      (cfg) => invokeSafe('start-ocr', cfg, { ok: false, message: 'IPC unavailable' }),
  stopOCR:       () => invokeSafe('stop-ocr', undefined, true),

  getOcrSetup:    () => invokeSafe('live:get-setup', undefined, null),
  saveOcrSetup:   (setup) => invokeSafe('live:save-setup', setup, false),
  getDebugImages: () => invokeSafe('live:get-debug-images', undefined, []),

  revealInFolder: (p) => { try { shell.showItemInFolder(p); } catch {} },
  openExternal:   (url) => { try { shell.openExternal(url); } catch {} },

  forceLiveReconnect: () => { try { ipcRenderer.send('live:force-reconnect'); } catch {} },
  openLiveSetup:      () => { try { ipcRenderer.send('menu:open-live-setup'); } catch {} },
});

// ---------- Live setup (windows, preview, settings) ----------
async function listWindowsViaIPC() {
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
  if (!res) return null;
  if (Array.isArray(res)) return res;
  if (res && res.error) throw new Error(res.error);
  return null;
}

async function listWindowsViaDesktopCapturer() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      // Small thumbnails; you can raise sizes if you show icons in the dropdown
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    // Normalize to a simple structure
    return sources.map(src => ({
      id: src.id ?? null,
      // Electron returns the OS window title as `name`
      title: src.name ?? '',
      pid: null, // desktopCapturer doesn't give PID; keep null
    })).filter(w => w.title && (w.id || w.pid));
  } catch (e) {
    console.warn('desktopCapturer.getSources failed', e);
    return [];
  }
}

function normalizeWindows(arr) {
  return (arr || []).map(w => {
    if (!w) return null;
    const pid   = w.pid ?? w.processId ?? null;
    const id    = w.id ?? w.sourceId ?? null;
    const title = w.title ?? w.name ?? w.windowTitle ?? w.processName ?? '';
    if ((!pid && !id) || !title) return null;
    return { pid, id, title };
  }).filter(Boolean);
}

async function listWindowsRobust() {
  // 1) Try IPC (if main wired it)
  try {
    const viaIPC = await listWindowsViaIPC();
    if (Array.isArray(viaIPC) && viaIPC.length) {
      return normalizeWindows(viaIPC);
    }
  } catch (e) {
    console.warn('listWindowsViaIPC error', e?.message || e);
  }

  // 2) Fallback to desktopCapturer directly from preload
  const viaCapturer = await listWindowsViaDesktopCapturer();
  if (viaCapturer.length) return normalizeWindows(viaCapturer);

  // 3) Nothing found; return empty list (UI can keep "autodetect")
  return [];
}

contextBridge.exposeInMainWorld('liveSetup', {
  listWindows: async () => {
    try { return await listWindowsRobust(); }
    catch (e) { return { error: e?.message || String(e) }; }
  },

  readPreview: async () => {
    // expected to return { file: string|null, dir: string }
    const r = await invokeSafe('live:read-preview', undefined, null);
    if (r && r.file && fs.existsSync(r.file)) {
      return { ...r, dataUrl: fileToDataUrl(r.file) };
    }
    return r;
  },

  saveSettings: async (settings) => {
    const toSave = {
      ...settings,
      captureZoom: clampZoom(settings?.captureZoom),
    };
    return await invokeSafe('live:save-settings', toSave, false);
  },

  appDataDir: async () => {
    const r = await invokeSafe('live:read-preview', undefined, null);
    return r?.dir || pokeLiveDir;
  },
});

// ---------- Back‑compat aliases (old UI calls window.livesetup.getWindows()) ----------
try {
  const compat = {
    listWindows: (...args) => window.liveSetup.listWindows(...args),
    getWindows:  (...args) => window.liveSetup.listWindows(...args),
    readPreview: (...args) => window.liveSetup.readPreview(...args),
    saveSettings: (...args) => window.liveSetup.saveSettings(...args),
    appDataDir:  (...args) => window.liveSetup.appDataDir(...args),
    openLiveSetup: (...args) => window.app?.openLiveSetup?.(...args),
  };
  contextBridge.exposeInMainWorld('livesetup', compat); // note lowercase 's'
} catch {}

// ---------- Inbound events from main ----------
ipcRenderer.on('open-live-setup', () => {
  try { window.dispatchEvent(new Event('open-live-setup')); } catch {}
});

// ---------- First‑run guard ----------
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

// ---------- Optional dev helpers ----------
contextBridge.exposeInMainWorld('debugPreload', {
  ping: () => 'pong',
  hasSettings: () => fs.existsSync(settingsPath),
  peekSettings: () => readJSON(settingsPath, {}),
  peekImages: () => ({
    captureExists: fs.existsSync(lastCapPath),
    preExists: fs.existsSync(lastPrePath),
  }),
});
