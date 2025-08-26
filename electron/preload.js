/* eslint-disable no-undef */
const { contextBridge, ipcRenderer, shell, desktopCapturer } = require('electron');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

/** =========================================================================
 *  PRELOAD — COMPLETE BRIDGE (with robust window listing + preview fallback)
 *  - Keeps your existing surface: paths, files, app, liveSetup (+ compat alias)
 *  - listWindows(): IPC-first, then desktopCapturer fallback; normalizes shape
 *  - readPreview(): IPC-first, then last-preview.png / last-capture.png fallback
 *  - Includes a fingerprint so you can verify this exact file is running
 * ========================================================================= */
console.log('[PRELOAD ACTIVE]', __filename);

/* ---------- Paths ---------- */
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

/* ---------- Helpers ---------- */
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

/* ---------- Files API (for your UI flows) ---------- */
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

/* ---------- Expose constants + file helpers ---------- */
contextBridge.exposeInMainWorld('paths', {
  localAppData, pokeLiveDir, settingsPath, lastCapPath, lastPrePath, tessdataDir,
});
contextBridge.exposeInMainWorld('files', fileApi);

/* ---------- App-level bridges you already use ---------- */
contextBridge.exposeInMainWorld('app', {
  // App meta / updates
  getVersion:    () => invokeSafe('get-version', undefined, null),
  checkUpdates:  () => invokeSafe('check-updates', undefined, { status: 'error', message: 'IPC unavailable' }),

  // Control
  reloadOCR:     (options) => invokeSafe('reload-ocr', options, true),
  refreshApp:    () => invokeSafe('refresh-app', undefined, (location.reload(), true)),
  startOCR:      (cfg) => invokeSafe('start-ocr', cfg, { ok: false, message: 'IPC unavailable' }),
  stopOCR:       () => invokeSafe('stop-ocr', undefined, true),

  // Saved setup + debug
  getOcrSetup:    () => invokeSafe('live:get-setup', undefined, null),
  saveOcrSetup:   (setup) => invokeSafe('live:save-setup', setup, false),
  getDebugImages: () => invokeSafe('live:get-debug-images', undefined, []),

  // Shell helpers
  revealInFolder: (p) => { try { shell.showItemInFolder(p); } catch {} },
  openExternal:   (url) => { try { shell.openExternal(url); } catch {} },

  // Misc events
  forceLiveReconnect: () => { try { ipcRenderer.send('live:force-reconnect'); } catch {} },
  openLiveSetup:      () => { try { ipcRenderer.send('menu:open-live-setup'); } catch {} },
});

/* ---------- Live Setup: windows, preview, settings ---------- */
// 1) IPC fetchers (support multiple channel names across versions)
async function listWindowsViaIPC() {
  const tryChannels = [
    'live:list-windows',
    'app:list-windows',
    'live:listWindows',
    'app:listWindows',
  ];
  for (const ch of tryChannels) {
    // eslint-disable-next-line no-await-in-loop
    const res = await invokeSafe(ch, undefined, null);
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object' && res.error) throw new Error(res.error);
  }
  return null;
}

// 2) Fallback using desktopCapturer from preload (no main wiring required)
async function listWindowsViaDesktopCapturer() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    return sources.map(src => ({
      id: src.id ?? null,
      title: src.name ?? '',
      pid: null, // capturer doesn't expose PID
    })).filter(w => (w.id || w.pid) && w.title);
  } catch (e) {
    console.warn('desktopCapturer.getSources failed', e);
    return [];
  }
}

// 3) Normalize shapes so UI filters stop throwing entries away
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

// 4) Robust aggregator
async function listWindowsRobust() {
  try {
    const viaIPC = await listWindowsViaIPC();
    if (Array.isArray(viaIPC) && viaIPC.length) return normalizeWindows(viaIPC);
  } catch (e) {
    console.warn('listWindowsViaIPC error', e?.message || e);
  }
  const viaCap = await listWindowsViaDesktopCapturer();
  if (viaCap.length) return normalizeWindows(viaCap);
  return [];
}

// Expose the modern API
contextBridge.exposeInMainWorld('liveSetup', {
  listWindows: async () => {
    try { return await listWindowsRobust(); }
    catch (e) { return { error: e?.message || String(e) }; }
  },

  // Prefer IPC; if nothing, expose a simple local fallback for your UI
  readPreview: async () => {
    const r = await invokeSafe('live:read-preview', undefined, null);
    if (r && r.file && fs.existsSync(r.file)) {
      return { ...r, dataUrl: fileToDataUrl(r.file) };
    }
    if (fs.existsSync(lastPrePath)) {
      return { file: lastPrePath, dir: pokeLiveDir, dataUrl: fileToDataUrl(lastPrePath) };
    }
    if (fs.existsSync(lastCapPath)) {
      return { file: lastCapPath, dir: pokeLiveDir, dataUrl: fileToDataUrl(lastCapPath) };
    }
    return null;
  },

  saveSettings: async (settings) => {
    const toSave = { ...settings, captureZoom: clampZoom(settings?.captureZoom) };
    return await invokeSafe('live:save-settings', toSave, false);
  },

  appDataDir: async () => {
    const r = await invokeSafe('live:read-preview', undefined, null);
    return r?.dir || pokeLiveDir;
  },
});

/* ---------- Back-compat alias (older UI expects window.livesetup.getWindows) ---------- */
try {
  const compat = {
    listWindows: (...args) => window.liveSetup.listWindows(...args),
    getWindows:  (...args) => window.liveSetup.listWindows(...args),
    readPreview: (...args) => window.liveSetup.readPreview(...args),
    saveSettings: (...args) => window.liveSetup.saveSettings(...args),
    appDataDir:  (...args) => window.liveSetup.appDataDir(...args),
    openLiveSetup: (...args) => window.app?.openLiveSetup?.(...args),
  };
  contextBridge.exposeInMainWorld('livesetup', compat);
} catch {}

/* ---------- Inbound events from main ---------- */
ipcRenderer.on('open-live-setup', () => {
  try { window.dispatchEvent(new Event('open-live-setup')); } catch {}
});

/* ---------- First-run guard (ensure folders + settings.json) ---------- */
(function ensureSettingsFile() {
  try {
    ensureDir(pokeLiveDir);
    ensureDir(tessdataDir);
    if (!fs.existsSync(settingsPath)) {
      writeJSON(settingsPath, getLocalSetupDefaults());
    }
  } catch {}
})();

/* ---------- Optional tiny debug surface ---------- */
contextBridge.exposeInMainWorld('debugPreload', {
  ping: () => 'pong:' + __filename,
  file: () => __filename,
  electron: () => process.versions.electron,
});
