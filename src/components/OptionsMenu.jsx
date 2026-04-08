import React, { useEffect, useRef, useState } from "react";

const OCR_AGGRESSIVENESS_OPTIONS = [
  { value: 'fast', label: 'Fast' },
  { value: 'normal', label: 'Normal' },
  { value: 'efficient', label: 'Efficient' },
];
const OCR_ZOOM_CHOICES = Array.from({ length: 9 }, (_, i) => Number((0.1 * (i + 1)).toFixed(1)));
const OPTION_CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'ui', label: 'UI' },
  { id: 'ocr', label: 'OCR' },
];
const OCR_CAPTURE_OFFSET_STEP = 0.01;
const OCR_ROUTE_DEFAULT_OFFSET = Object.freeze({ x: 0, y: 0 });
const OCR_BATTLE_DEFAULT_OFFSET = Object.freeze({ x: 0, y: 0 });
function clampCaptureOffset(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.max(-0.5, Math.min(0.5, num));
  return Math.round(clamped * 1000) / 1000;
}
function offsetsMatch(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) < 0.0005 && Math.abs(a.y - b.y) < 0.0005;
}
function normalizeAggValue(value) {
  if (typeof value !== 'string') return 'fast';
  const v = value.trim().toLowerCase();
  return OCR_AGGRESSIVENESS_OPTIONS.some((opt) => opt.value === v) ? v : 'fast';
}
function clampOcrZoomValue(value, fallback = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const normalized = (num > 1 && num <= 2.5) ? (num - 1) : num;
  const clamped = Math.max(0.1, Math.min(0.9, normalized));
  return Math.round(clamped * 10) / 10;
}

/**
 * Options dropdown with toasts:
 *  - Check for updates → "Checking…", "Up to date (vX)!", "Downloading update vY…", or "Update vY downloaded — restart to apply."
 *  - Reload OCR (Windows & Linux) → restarts helper AND signals Live tab to reconnect/clear
 *  - Refresh app       → full renderer refresh
 */
export default function OptionsMenu({ style = {}, ocrSupported = false }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null); // { text, kind } | null
  const menuRef = useRef(null);
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const [shinyEnabled, setShinyEnabled] = useState(() => {
    try { return JSON.parse(localStorage.getItem('shinySprites') ?? 'false'); }
    catch { return false; }
  });
  const [scale, setScale] = useState(() => {
    const saved = parseInt(localStorage.getItem("uiScaleV2"), 10);
    if (Number.isFinite(saved)) return clamp(saved);
    const legacy = parseInt(localStorage.getItem("uiScale"), 10);
    const initial = Number.isFinite(legacy) ? clamp(Math.round(legacy / 2)) : 50;
    localStorage.setItem("uiScaleV2", String(initial));
    localStorage.removeItem("uiScale");
    return initial;
  });
  const [ocrEnabled, setOcrEnabled] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ocrEnabled') ?? 'true'); }
    catch { return true; }
  });
  const [ocrAggressiveness, setOcrAggressiveness] = useState('fast');
  const [ocrRouteZoom, setOcrRouteZoom] = useState(0.5);
  const [ocrBattleZoom, setOcrBattleZoom] = useState(0.5);
  const [ocrRouteOffset, setOcrRouteOffset] = useState({ x: 0, y: 0 });
  const [ocrBattleOffset, setOcrBattleOffset] = useState({ x: 0, y: 0 });
  const [ocrSetupLoaded, setOcrSetupLoaded] = useState(() => !ocrSupported);
  const [activeCategory, setActiveCategory] = useState('general');
  const [ocrImageDebug, setOcrImageDebug] = useState(false);
  const [settingImageDebug, setSettingImageDebug] = useState(false);
  const [savingRouteOffset, setSavingRouteOffset] = useState(false);
  const [savingBattleOffset, setSavingBattleOffset] = useState(false);
  const [autoCatchEnabled, setAutoCatchEnabled] = useState(true);
  const [chatLogAvailable, setChatLogAvailable] = useState(true);
  const [previewData, setPreviewData] = useState({
    routeCapture: null,
    battleCapture: null,
    routeDetected: 'No Route',
    battleDetected: 'No Pokemon',
  });

  const scaleWrapRef = useRef(null);
  const startScaleRef = useRef(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    // Map slider range [0,100] to visual scale [0.5,1.5]
    // so 50% appears as the normal 100% size.
    document.body.style.zoom = 0.5 + scale / 100;
    localStorage.setItem("uiScaleV2", String(scale));
  }, [scale]);

  // auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        if (scaleWrapRef.current) {
          scaleWrapRef.current.style.transform = "";
          scaleWrapRef.current.style.transformOrigin = "";
        }
      }
    };
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  useEffect(() => {
    if (!ocrSupported) return;
    let cancelled = false;
    (async () => {
      try {
        const setup = await window.app?.getOcrSetup?.();
        if (!setup || cancelled) return;
        setOcrAggressiveness(normalizeAggValue(setup.ocrAggressiveness));
        const routeZoom = clampOcrZoomValue(setup.captureZoom, 0.5);
        const battleZoom = clampOcrZoomValue(
          Object.prototype.hasOwnProperty.call(setup, 'battleCaptureZoom')
            ? setup.battleCaptureZoom
            : setup.captureZoom,
          routeZoom,
        );
        setOcrRouteZoom(routeZoom);
        setOcrBattleZoom(battleZoom);
        setOcrRouteOffset({
          x: clampCaptureOffset(setup.routeCaptureOffsetX, 0),
          y: clampCaptureOffset(setup.routeCaptureOffsetY, 0),
        });
        setOcrBattleOffset({
          x: clampCaptureOffset(setup.battleCaptureOffsetX, 0),
          y: clampCaptureOffset(setup.battleCaptureOffsetY, 0),
        });
      } catch (err) {
        console.error('[OptionsMenu] load OCR setup error:', err);
      } finally {
        if (!cancelled) setOcrSetupLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [ocrSupported]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.app?.getOcrImageDebug?.();
        if (!cancelled && res && typeof res === 'object') {
          setOcrImageDebug(!!res.enabled);
        }
      } catch (err) {
        console.error('[OptionsMenu] load OCR image debug error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (open) {
      setActiveCategory('general');
    }
  }, [open]);

  useEffect(() => {
    if (!ocrSupported && activeCategory === 'ocr') {
      setActiveCategory('general');
    }
  }, [ocrSupported, activeCategory]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open || activeCategory !== 'ocr' || !ocrImageDebug) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await window.app?.getDebugImages?.();
        if (!cancelled && res && typeof res === 'object') {
          setPreviewData({
            routeCapture: res.routeCapture || res.capture || null,
            battleCapture: res.battleCapture || null,
            routeDetected: res.routeDetected || 'No Route',
            battleDetected: res.battleDetected || 'No Pokemon',
          });
        }
      } catch (err) {
        console.error('[OptionsMenu] load OCR previews error:', err);
      }
    };
    load();
    const id = setInterval(load, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, activeCategory, ocrImageDebug]);

  useEffect(() => {
    if (!ocrImageDebug) {
      setPreviewData({
        routeCapture: null,
        battleCapture: null,
        routeDetected: 'No Route',
        battleDetected: 'No Pokemon',
      });
    }
  }, [ocrImageDebug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const enabled = await window.app?.getAutoCatchEnabled?.();
        if (!cancelled && typeof enabled === 'boolean') {
          setAutoCatchEnabled(enabled);
        }
      } catch (err) {
        console.error('[OptionsMenu] load auto catch enabled error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open || activeCategory !== 'general') return;
    let cancelled = false;
    const check = async () => {
      try {
        const status = await window.app?.checkChatLogStatus?.();
        if (!cancelled && status) {
          setChatLogAvailable(status.available);
        }
      } catch (err) {
        console.error('[OptionsMenu] check chat log status error:', err);
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, activeCategory]);

  const show = (text, kind = "info") => setToast({ text, kind });

  const fmtVer = (v) => (v ? `v${v}` : "");
  
  // Disable in-app update toasts; rely on Windows notifications/prompts instead.
  useEffect(() => {
    const offDl = window.app?.onUpdateDownloaded?.(() => {});
    const offAvail = window.app?.onUpdateAvailable?.(() => {});
    const offNA = window.app?.onUpdateNotAvailable?.(() => {});
    return () => {
      try { offDl?.(); } catch {}
      try { offAvail?.(); } catch {}
      try { offNA?.(); } catch {}
    };
  }, []);

  // Suppress initial update status toast; Windows handles any prompts.
  useEffect(() => { /* no-op */ }, []);
  
  async function onCheckUpdates() {
    try {
      // Trigger update check silently; Windows will handle notifications/prompts.
      await window.app?.checkUpdates?.();
    } catch (err) {
      // Keep errors in console for troubleshooting, but no UI toast.
      console.error("[OptionsMenu] checkUpdates error:", err);
    }
  }

  const getAppBridge = () => (typeof window !== 'undefined' && window.app ? window.app : null);
  const getLegacySetup = () => (typeof window !== 'undefined' && window.liveSetup ? window.liveSetup : null);

  async function stopOcrCompat({ required = false } = {}) {
    const appBridge = getAppBridge();
    const stopFn = appBridge && (appBridge.stopOCR || appBridge.stopOcr);
    if (typeof stopFn !== 'function') {
      if (required) throw new Error('stopOCR bridge unavailable');
      return false;
    }
    const res = await stopFn();
    if (res === false || (res && res.ok === false)) {
      if (required) throw new Error('stopOCR bridge rejected');
      return false;
    }
    return true;
  }

  async function startOcrCompat({ required = false } = {}) {
    const appBridge = getAppBridge();
    const startFn = appBridge && (appBridge.startOCR || appBridge.startOcr);
    if (typeof startFn !== 'function') {
      if (required) throw new Error('startOCR bridge unavailable');
      return false;
    }
    const res = await startFn();
    if (res === false || (res && res.ok === false)) {
      if (required) throw new Error('startOCR bridge rejected');
      return false;
    }
    return true;
  }

  async function restartOcrCompat() {
    const appBridge = getAppBridge();
    if (appBridge && typeof appBridge.reloadOCR === 'function') {
      const res = await appBridge.reloadOCR();
      if (res === false || (res && res.ok === false)) throw new Error('reloadOCR bridge rejected');
      try { window.dispatchEvent(new CustomEvent('force-live-reconnect', { detail: { reset: true } })); } catch {}
      return;
    }
    const stopped = await stopOcrCompat({ required: false });
    const started = await startOcrCompat({ required: false });
    if (!stopped && !started) throw new Error('reloadOCR bridge unavailable');
    try { window.dispatchEvent(new CustomEvent('force-live-reconnect', { detail: { reset: true } })); } catch {}
  }

  async function legacySaveOcrSetup(patch, { restart = true } = {}) {
    const legacy = getLegacySetup();
    const saveLegacy = legacy && (legacy.saveSettings || legacy.saveSetup);
    if (typeof saveLegacy !== 'function') throw new Error('legacy OCR setup bridge unavailable');
    const res = await saveLegacy({ ...patch });
    if (res === false || (res && res.ok === false)) throw new Error('legacy OCR setup rejected');
    if (restart) await restartOcrCompat();
    return res;
  }

  async function saveOcrSetupStrict(patch, { restart = true } = {}) {
    const appBridge = getAppBridge();
    if (appBridge && typeof appBridge.saveOcrSetup === 'function') {
      const res = await appBridge.saveOcrSetup(patch);
      if (res === false || (res && res.ok === false)) throw new Error('saveOcrSetup bridge rejected');
      return res;
    }
    return legacySaveOcrSetup(patch, { restart });
  }

  async function setOcrEnabledStrict(nextEnabled) {
    const appBridge = getAppBridge();
    if (appBridge && typeof appBridge.setOcrEnabled === 'function') {
      const res = await appBridge.setOcrEnabled(nextEnabled);
      if (res === false || (res && res.ok === false)) throw new Error('setOcrEnabled bridge rejected');
      return res;
    }
    await legacySaveOcrSetup({ ocrEnabled: nextEnabled }, { restart: false });
    if (nextEnabled) {
      await stopOcrCompat({ required: false });
      await startOcrCompat({ required: true });
    } else {
      await stopOcrCompat({ required: true });
    }
    try { window.dispatchEvent(new CustomEvent('force-live-reconnect', { detail: { reset: true } })); } catch {}
    return { ok: true };
  }

  async function onAggressivenessChange(nextValue) {
    const normalized = normalizeAggValue(nextValue);
    const prev = ocrAggressiveness;
    if (normalized === prev) return;
    setOcrAggressiveness(normalized);
    try {
      await saveOcrSetupStrict({ ocrAggressiveness: normalized }, { restart: ocrEnabled });
      show('OCR aggressiveness updated.', 'success');
    } catch (err) {
      setOcrAggressiveness(prev);
      console.error('[OptionsMenu] set OCR aggressiveness error:', err);
      show('Failed to update OCR aggressiveness', 'error');
    }
  }
  async function onRouteZoomChange(nextValue) {
    const normalized = clampOcrZoomValue(nextValue, ocrRouteZoom);
    const prev = ocrRouteZoom;
    if (normalized === prev) return;
    setOcrRouteZoom(normalized);
    try {
      await saveOcrSetupStrict({ captureZoom: normalized }, { restart: ocrEnabled });
      show('Route OCR zoom updated.', 'success');
    } catch (err) {
      setOcrRouteZoom(prev);
      console.error('[OptionsMenu] set Route OCR zoom error:', err);
      show('Failed to update Route OCR zoom', 'error');
    }
  }
  async function onBattleZoomChange(nextValue) {
    const normalized = clampOcrZoomValue(nextValue, ocrBattleZoom);
    const prev = ocrBattleZoom;
    if (normalized === prev) return;
    setOcrBattleZoom(normalized);
    try {
      await saveOcrSetupStrict({ battleCaptureZoom: normalized }, { restart: ocrEnabled });
      show('Battle OCR zoom updated.', 'success');
    } catch (err) {
      setOcrBattleZoom(prev);
      console.error('[OptionsMenu] set Battle OCR zoom error:', err);
      show('Failed to update Battle OCR zoom', 'error');
    }
  }

  async function applyRouteOffset(next) {
    const prev = ocrRouteOffset;
    if (next.x === prev.x && next.y === prev.y) return;
    setOcrRouteOffset(next);
    setSavingRouteOffset(true);
    try {
      await saveOcrSetupStrict(
        { routeCaptureOffsetX: next.x, routeCaptureOffsetY: next.y },
        { restart: ocrEnabled },
      );
      show('Route OCR position updated.', 'success');
    } catch (err) {
      console.error('[OptionsMenu] update Route OCR offset error:', err);
      setOcrRouteOffset(prev);
      show('Failed to update Route OCR position', 'error');
    } finally {
      setSavingRouteOffset(false);
    }
  }

  async function applyBattleOffset(next) {
    const prev = ocrBattleOffset;
    if (next.x === prev.x && next.y === prev.y) return;
    setOcrBattleOffset(next);
    setSavingBattleOffset(true);
    try {
      await saveOcrSetupStrict(
        { battleCaptureOffsetX: next.x, battleCaptureOffsetY: next.y },
        { restart: ocrEnabled },
      );
      show('Battle OCR position updated.', 'success');
    } catch (err) {
      console.error('[OptionsMenu] update Battle OCR offset error:', err);
      setOcrBattleOffset(prev);
      show('Failed to update Battle OCR position', 'error');
    } finally {
      setSavingBattleOffset(false);
    }
  }

  function onRouteOffsetNudge(dx, dy) {
    if (!ocrSetupLoaded || savingRouteOffset) return;
    const next = {
      x: clampCaptureOffset(ocrRouteOffset.x + dx, ocrRouteOffset.x),
      y: clampCaptureOffset(ocrRouteOffset.y + dy, ocrRouteOffset.y),
    };
    applyRouteOffset(next);
  }

  function onBattleOffsetNudge(dx, dy) {
    if (!ocrSetupLoaded || savingBattleOffset) return;
    const next = {
      x: clampCaptureOffset(ocrBattleOffset.x + dx, ocrBattleOffset.x),
      y: clampCaptureOffset(ocrBattleOffset.y + dy, ocrBattleOffset.y),
    };
    applyBattleOffset(next);
  }
  function onRouteOffsetReset() {
    if (!ocrSetupLoaded || savingRouteOffset) return;
    applyRouteOffset({ x: OCR_ROUTE_DEFAULT_OFFSET.x, y: OCR_ROUTE_DEFAULT_OFFSET.y });
  }
  function onBattleOffsetReset() {
    if (!ocrSetupLoaded || savingBattleOffset) return;
    applyBattleOffset({ x: OCR_BATTLE_DEFAULT_OFFSET.x, y: OCR_BATTLE_DEFAULT_OFFSET.y });
  }
  function onToggleShiny(next){
    try {
      setShinyEnabled(next);
      try { localStorage.setItem('shinySprites', JSON.stringify(next)); } catch {}
      try { window.dispatchEvent(new CustomEvent('shiny-global-changed', { detail: { enabled: next } })); } catch {}
    } finally {
      // keep menu open
    }
  }
  function broadcastOcrEnabledChange(next) {
    try { window.dispatchEvent(new CustomEvent('ocr-enabled-changed', { detail: { enabled: next } })); } catch {}
  }
  async function onToggleOCR(next) {
    const prev = ocrEnabled;
    try {
      setOcrEnabled(next);
      try { localStorage.setItem('ocrEnabled', JSON.stringify(next)); } catch {}
      show(next ? 'Enabling OCR…' : 'Disabling OCR…', 'info');
      await setOcrEnabledStrict(next);
      broadcastOcrEnabledChange(next);
      show(next ? 'OCR enabled.' : 'OCR disabled.', 'success');
    } catch (err) {
      console.error('[OptionsMenu] toggle OCR error:', err);
      show('Failed to apply OCR setting', 'error');
      setOcrEnabled(prev);
      try { localStorage.setItem('ocrEnabled', JSON.stringify(prev)); } catch {}
    }
  }
  async function onToggleOcrImageDebug(next) {
    if (settingImageDebug) return;
    const prev = ocrImageDebug;
    setOcrImageDebug(next);
    setSettingImageDebug(true);
    try {
      show(next ? 'Enabling OCR image debug…' : 'Disabling OCR image debug…', 'info');
      const res = await window.app?.setOcrImageDebug?.(next);
      if (!res || res.ok === false) throw new Error(res?.error || 'IPC unavailable');
      show(next ? 'OCR image debug enabled.' : 'OCR image debug disabled.', 'success');
    } catch (err) {
      console.error('[OptionsMenu] toggle OCR image debug error:', err);
      setOcrImageDebug(prev);
      show('Failed to update OCR image debug', 'error');
    } finally {
      setSettingImageDebug(false);
    }
  }

  function onOpenColorPicker() {
    try { window.dispatchEvent(new Event('open-color-picker')); } catch {}
    setOpen(false);
  }

  async function onToggleAutoCatch(next) {
    const prev = autoCatchEnabled;
    try {
      setAutoCatchEnabled(next);
      const res = await window.app?.setAutoCatchEnabled?.(next);
      if (!res || res.ok === false) throw new Error('Failed to apply auto catch setting');
      show(next ? 'Auto catch enabled.' : 'Auto catch disabled.', 'success');
    } catch (err) {
      console.error('[OptionsMenu] toggle auto catch error:', err);
      show('Failed to apply auto catch setting', 'error');
      setAutoCatchEnabled(prev);
    }
  }

  // Styles
  const btnStyle = {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid var(--divider)",
    background: "linear-gradient(180deg,var(--surface),var(--card))",
    color: "var(--text)",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "var(--shadow-1)",
  };
  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.72)',
    zIndex: 20000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  };
  const modalStyle = {
    position: 'relative',
    display: 'flex',
    width: 'min(1080px, 90vw)',
    height: 'min(720px, 85vh)',
    maxHeight: '85vh',
    background: 'var(--surface)',
    color: 'var(--text)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-2)',
    overflow: 'hidden',
  };
  const navStyle = {
    flex: '0 0 25%',
    minWidth: 200,
    borderRight: '1px solid var(--divider)',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(0,0,0,0.15)',
    padding: '24px 0',
    gap: 4,
  };
  const contentStyle = {
    flex: '1 1 auto',
    padding: '32px 36px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    overflowY: 'auto',
  };
  const headingStyle = {
    fontSize: 24,
    fontWeight: 800,
    margin: 0,
  };
  const sectionStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  };
  const selectStyle = {
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--divider)',
    borderRadius: 10,
    padding: '10px 12px',
    fontWeight: 600,
    boxShadow: 'var(--shadow-1)',
  };
  const ocrRowStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'stretch',
  };
  const ocrToggleRowStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
  };
  const ocrTopToggleStyle = {
    flex: '0 1 260px',
    minWidth: 200,
    maxWidth: 260,
  };
  const previewContainerStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 8px 1fr',
    gap: 16,
    alignItems: 'stretch',
  };
  const previewPanelStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    background: 'var(--card)',
    border: '1px solid var(--divider)',
    borderRadius: 14,
    padding: 16,
    minHeight: 240,
    boxShadow: 'var(--shadow-1)',
  };
  const previewTitleStyle = {
    fontWeight: 800,
    fontSize: 16,
  };
  const previewFrameStyle = {
    flex: '1 1 auto',
    border: '1px solid var(--divider)',
    borderRadius: 10,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 8,
  };
  const previewImageStyle = {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  };
  const previewPlaceholderStyle = {
    color: 'var(--muted)',
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'center',
    lineHeight: 1.4,
  };
  const previewDetailStyle = {
    marginTop: 6,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--muted)',
  };
  const previewDetailLabel = {
    fontWeight: 800,
    color: 'var(--text)',
  };
  const dpadWrapperStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  };
  const dpadControlsStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  };
  const dpadRowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  };
  const dpadButtonStyle = {
    width: 34,
    height: 34,
    borderRadius: 8,
    border: '1px solid var(--divider)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontWeight: 700,
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'var(--shadow-1)',
    cursor: 'pointer',
    transition: 'transform 0.08s ease',
  };
  const dpadButtonDisabledStyle = {
    opacity: 0.6,
    cursor: 'not-allowed',
    boxShadow: 'none',
  };
  const resetButtonStyle = {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--divider)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontWeight: 700,
    fontSize: 12,
    boxShadow: 'var(--shadow-1)',
    cursor: 'pointer',
  };
  const resetButtonDisabledStyle = {
    opacity: 0.6,
    cursor: 'not-allowed',
    boxShadow: 'none',
  };
  const closeButtonStyle = {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 999,
    border: '1px solid var(--divider)',
    background: 'var(--surface)',
    color: 'var(--text)',
    boxShadow: 'var(--shadow-1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    cursor: 'pointer',
  };
  const toastBaseStyle = {
    position: 'fixed',
    right: 24,
    bottom: 24,
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid var(--divider)',
    boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
    color: 'var(--text)',
    fontWeight: 700,
    zIndex: 30000,
    maxWidth: 420,
  };

  const categories = ocrSupported ? OPTION_CATEGORIES : OPTION_CATEGORIES.filter((cat) => cat.id !== 'ocr');
  const activeCategoryMeta = categories.find((cat) => cat.id === activeCategory) || categories[0] || OPTION_CATEGORIES[0];

  const renderCategoryContent = () => {
    if (activeCategory === 'general') {
      return (
        <div style={sectionStyle}>
          <ActionButton label="Check for Updates" onClick={onCheckUpdates} />
          <Divider style={{ margin: '18px 0' }} />
          <ToggleButton label="Shiny Sprites" value={!!shinyEnabled} onToggle={onToggleShiny} />
          <Divider style={{ margin: '18px 0' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ToggleButton label="Automatically mark as Caught" value={!!autoCatchEnabled} onToggle={onToggleAutoCatch} />
            <span style={{ fontSize: 12, color: 'var(--muted)', paddingLeft: 18, lineHeight: 1.4 }}>
              For this feature to work - Enable 'Log Chat to Disk' in PokeMMO; Settings→Chat→Log Chat to Disk
            </span>
            {!chatLogAvailable && (
              <span style={{ fontSize: 12, color: '#ff4444', fontWeight: 700, paddingLeft: 18 }}>
                Log Chat not Enabled
              </span>
            )}
          </div>
          <Divider style={{ margin: '18px 0' }} />
          <ActionButton label="Choose Colors" onClick={onOpenColorPicker} />
        </div>
      );
    }

    if (activeCategory === 'ui') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div ref={scaleWrapRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text)', fontWeight: 700 }}>Element Scale</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12 }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scale}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setScale(Number.isFinite(v) ? clamp(v) : 0);
                  }}
                  style={{
                    width: 50,
                    textAlign: 'right',
                    background: 'transparent',
                    border: '1px solid var(--divider)',
                    borderRadius: 6,
                    color: 'var(--text)',
                    fontSize: 12,
                    padding: '4px 6px',
                  }}
                />
                %
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={scale}
              onChange={(e) => {
                const v = clamp(parseInt(e.target.value, 10));
                setScale(v);
                if (draggingRef.current && scaleWrapRef.current) {
                  const prev = 0.5 + startScaleRef.current / 100;
                  const curr = 0.5 + v / 100;
                  scaleWrapRef.current.style.transform = `scale(${prev / curr})`;
                  scaleWrapRef.current.style.transformOrigin = '0 0';
                }
              }}
              onMouseDown={() => {
                draggingRef.current = true;
                startScaleRef.current = scale;
              }}
              onTouchStart={() => {
                draggingRef.current = true;
                startScaleRef.current = scale;
              }}
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Adjust the interface scale to suit your display.</span>
          </div>
        </div>
      );
    }

    if (activeCategory === 'ocr') {
      if (!ocrSupported) {
        return (
          <div style={sectionStyle}>
            <span style={{ color: 'var(--muted)' }}>Live OCR settings are available on Windows and Linux.</span>
          </div>
        );
      }
      const zoomOptions = OCR_ZOOM_CHOICES.map((z) => {
        const value = z.toFixed(1);
        const display = (1 - z).toFixed(1);
        return { value, label: `${display}x` };
      });
      const zoomSelectStyle = { ...selectStyle, padding: '8px 10px' };
      const zoomFieldStyle = { flex: '1 1 160px', minWidth: 150 };
      const routeResetDisabled =
        savingRouteOffset || !ocrSetupLoaded || offsetsMatch(ocrRouteOffset, OCR_ROUTE_DEFAULT_OFFSET);
      const battleResetDisabled =
        savingBattleOffset || !ocrSetupLoaded || offsetsMatch(ocrBattleOffset, OCR_BATTLE_DEFAULT_OFFSET);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={ocrToggleRowStyle}>
            <ToggleButton
              label="OCR Process"
              value={!!ocrEnabled}
              onToggle={onToggleOCR}
              disabled={!ocrSetupLoaded}
              style={ocrTopToggleStyle}
            />
            <ToggleButton
              label="OCR Image Debug"
              value={ocrImageDebug}
              onToggle={onToggleOcrImageDebug}
              disabled={settingImageDebug}
              busy={settingImageDebug}
              style={ocrTopToggleStyle}
            />
          </div>
          <div style={ocrRowStyle}>
            <SelectField
              label="OCR Aggressiveness"
              value={ocrAggressiveness}
              onChange={(e) => onAggressivenessChange(e.target.value)}
              disabled={!ocrSetupLoaded}
              options={OCR_AGGRESSIVENESS_OPTIONS}
              selectStyle={selectStyle}
              style={{ flex: '1 1 220px', minWidth: 200 }}
            />
            <SelectField
              label="Route OCR Zoom"
              value={ocrRouteZoom.toFixed(1)}
              onChange={(e) => onRouteZoomChange(e.target.value)}
              disabled={!ocrSetupLoaded}
              options={zoomOptions}
              selectStyle={zoomSelectStyle}
              style={zoomFieldStyle}
            />
            <SelectField
              label="Battle OCR Zoom"
              value={ocrBattleZoom.toFixed(1)}
              onChange={(e) => onBattleZoomChange(e.target.value)}
              disabled={!ocrSetupLoaded}
              options={zoomOptions}
              selectStyle={zoomSelectStyle}
              style={zoomFieldStyle}
            />
          </div>
          <Divider style={{ margin: '4px 0' }} />
          <div style={previewContainerStyle}>
            <div style={previewPanelStyle}>
              <span style={previewTitleStyle}>Live Route Preview</span>
              <div style={previewFrameStyle}>
                {ocrImageDebug ? (
                  previewData.routeCapture ? (
                    <img src={previewData.routeCapture} alt="Route capture preview" style={previewImageStyle} />
                  ) : (
                    <span style={previewPlaceholderStyle}>Waiting for capture…</span>
                  )
                ) : (
                  <span style={previewPlaceholderStyle}>Enable OCR Image Debug for Preview</span>
                )}
              </div>
              <div style={dpadWrapperStyle}>
                <div style={dpadControlsStyle}>
                  <button
                    type="button"
                    onClick={() => onRouteOffsetNudge(0, -OCR_CAPTURE_OFFSET_STEP)}
                    style={{
                      ...dpadButtonStyle,
                      ...(savingRouteOffset || !ocrSetupLoaded ? dpadButtonDisabledStyle : {}),
                    }}
                    disabled={savingRouteOffset || !ocrSetupLoaded}
                    title="Move capture up"
                  >
                    ↑
                  </button>
                  <div style={dpadRowStyle}>
                    <button
                      type="button"
                      onClick={() => onRouteOffsetNudge(-OCR_CAPTURE_OFFSET_STEP, 0)}
                      style={{
                        ...dpadButtonStyle,
                        ...(savingRouteOffset || !ocrSetupLoaded ? dpadButtonDisabledStyle : {}),
                      }}
                      disabled={savingRouteOffset || !ocrSetupLoaded}
                      title="Move capture left"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => onRouteOffsetNudge(OCR_CAPTURE_OFFSET_STEP, 0)}
                      style={{
                        ...dpadButtonStyle,
                        ...(savingRouteOffset || !ocrSetupLoaded ? dpadButtonDisabledStyle : {}),
                      }}
                      disabled={savingRouteOffset || !ocrSetupLoaded}
                      title="Move capture right"
                    >
                      →
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRouteOffsetNudge(0, OCR_CAPTURE_OFFSET_STEP)}
                    style={{
                      ...dpadButtonStyle,
                      ...(savingRouteOffset || !ocrSetupLoaded ? dpadButtonDisabledStyle : {}),
                    }}
                    disabled={savingRouteOffset || !ocrSetupLoaded}
                    title="Move capture down"
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onRouteOffsetReset}
                  style={{
                    ...resetButtonStyle,
                    ...(routeResetDisabled ? resetButtonDisabledStyle : {}),
                  }}
                  disabled={routeResetDisabled}
                >
                  Reset Location
                </button>
              </div>
              <span style={previewDetailStyle}>
                <span style={previewDetailLabel}>Detected Route:</span>{' '}
                {ocrImageDebug ? (previewData.routeDetected || 'No Route') : 'Enable OCR Image Debug for details'}
              </span>
            </div>
            <div style={{ width: 2, background: 'var(--divider)', borderRadius: 999 }} />
            <div style={previewPanelStyle}>
              <span style={previewTitleStyle}>Live Battle Preview</span>
              <div style={previewFrameStyle}>
                {ocrImageDebug ? (
                  previewData.battleCapture ? (
                    <img src={previewData.battleCapture} alt="Battle capture preview" style={previewImageStyle} />
                  ) : (
                    <span style={previewPlaceholderStyle}>Waiting for capture…</span>
                  )
                ) : (
                  <span style={previewPlaceholderStyle}>Enable OCR Image Debug for Preview</span>
                )}
              </div>
              <div style={dpadWrapperStyle}>
                <div style={dpadControlsStyle}>
                  <button
                    type="button"
                    onClick={() => onBattleOffsetNudge(0, -OCR_CAPTURE_OFFSET_STEP)}
                    style={{
                      ...dpadButtonStyle,
                      ...(savingBattleOffset || !ocrSetupLoaded ? dpadButtonDisabledStyle : {}),
                    }}
                    disabled={savingBattleOffset || !ocrSetupLoaded}
                    title="Move capture up"
                  >
                    ↑
                  </button>
                  <div style={dpadRowStyle}>
                    <button
                      type="button"
                      onClick={() => onBattleOffsetNudge(-OCR_CAPTURE_OFFSET_STEP, 0)}
                      style={{
                        ...dpadButtonStyle,
                        ...(savingBattleOffset || !ocrSetupLoaded ? dpadButtonDisabledStyle : {}),
                      }}
                      disabled={savingBattleOffset || !ocrSetupLoaded}
                      title="Move capture left"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => onBattleOffsetNudge(OCR_CAPTURE_OFFSET_STEP, 0)}
                      style={{
                        ...dpadButtonStyle,
                        ...(savingBattleOffset || !ocrSetupLoaded ? dpadButtonDisabledStyle : {}),
                      }}
                      disabled={savingBattleOffset || !ocrSetupLoaded}
                      title="Move capture right"
                    >
                      →
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onBattleOffsetNudge(0, OCR_CAPTURE_OFFSET_STEP)}
                    style={{
                      ...dpadButtonStyle,
                      ...(savingBattleOffset || !ocrSetupLoaded ? dpadButtonDisabledStyle : {}),
                    }}
                    disabled={savingBattleOffset || !ocrSetupLoaded}
                    title="Move capture down"
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onBattleOffsetReset}
                  style={{
                    ...resetButtonStyle,
                    ...(battleResetDisabled ? resetButtonDisabledStyle : {}),
                  }}
                  disabled={battleResetDisabled}
                >
                  Reset Location
                </button>
              </div>
              <span style={previewDetailStyle}>
                <span style={previewDetailLabel}>Detected Pokemon:</span>{' '}
                {ocrImageDebug ? (previewData.battleDetected || 'No Pokemon') : 'Enable OCR Image Debug for details'}
              </span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', ...style }}>
      <button
        style={btnStyle}
        onClick={() => setOpen((v) => !v)}
        title="Options"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Options ▾
      </button>

      {open && (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <div
            style={modalStyle}
            role="dialog"
            aria-modal="true"
            aria-label="Options"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              style={closeButtonStyle}
              onClick={() => setOpen(false)}
              aria-label="Close options"
            >
              ✕
            </button>
            <div style={navStyle}>
              {categories.map((cat) => (
                <NavButton
                  key={cat.id}
                  label={cat.label}
                  active={activeCategory === cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                />
              ))}
            </div>
            <div style={contentStyle}>
              <div>
                <h2 style={headingStyle}>{activeCategoryMeta.label}</h2>
              </div>
              {renderCategoryContent()}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...toastBaseStyle,
            background:
              toast.kind === 'error'
                ? 'var(--toast-error)'
                : toast.kind === 'success'
                ? 'var(--toast-success)'
                : 'var(--toast-info)',
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Divider({ style = {} }) {
  return <div style={{ width: '100%', height: 1, background: 'var(--divider)', ...style }} />;
}

function NavButton({ label, active = false, onClick }) {
  const [hover, setHover] = useState(false);
  const baseStyle = {
    position: 'relative',
    border: 'none',
    background: active ? 'rgba(255,255,255,0.12)' : hover ? 'rgba(255,255,255,0.06)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text)',
    fontWeight: 800,
    fontSize: 16,
    padding: '12px 24px 12px 32px',
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background 160ms ease, color 160ms ease',
  };
  const indicatorStyle = {
    position: 'absolute',
    left: 0,
    top: '20%',
    bottom: '20%',
    width: 4,
    borderRadius: 999,
    background: 'var(--accent)',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={baseStyle}
      aria-current={active ? 'page' : undefined}
    >
      {active && <span style={indicatorStyle} />}
      <span style={{ position: 'relative' }}>{label}</span>
    </button>
  );
}

function BaseOptionButton({ children, onClick, disabled = false, role, ariaChecked, ariaPressed, style = {} }) {
  const [hover, setHover] = useState(false);
  const baseStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '14px 18px',
    borderRadius: 12,
    border: '1px solid var(--divider)',
    background: hover ? 'rgba(255,255,255,0.08)' : 'linear-gradient(180deg,var(--surface),var(--card))',
    color: 'var(--text)',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    transition: 'background 160ms ease, opacity 160ms ease',
    boxShadow: 'var(--shadow-1)',
    textAlign: 'left',
  };
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...baseStyle, ...style }}
      role={role}
      aria-checked={ariaChecked}
      aria-pressed={ariaPressed}
    >
      {children}
    </button>
  );
}

function ActionButton({ label, onClick, disabled = false }) {
  return (
    <BaseOptionButton onClick={onClick} disabled={disabled}>
      <span>{label}</span>
      <span style={{ fontSize: 18, color: 'var(--muted)' }}>›</span>
    </BaseOptionButton>
  );
}

function ToggleButton({ label, value, onToggle, disabled = false, busy = false, style = {} }) {
  const active = !!value;
  const handleClick = () => {
    if (disabled || busy) return;
    onToggle(!active);
  };
  const trackBackground = disabled
    ? 'rgba(255,255,255,0.05)'
    : active
    ? 'var(--accent)'
    : 'rgba(255,255,255,0.12)';
  const thumbLeft = active ? 22 : 2;
  const thumbColor = disabled ? 'var(--muted)' : active ? 'var(--surface)' : 'var(--muted)';
  const trackStyle = {
    position: 'relative',
    width: 44,
    height: 22,
    borderRadius: 999,
    border: '1px solid var(--divider)',
    background: trackBackground,
    transition: 'background 160ms ease',
  };
  const thumbStyle = {
    position: 'absolute',
    top: 2,
    left: thumbLeft,
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: thumbColor,
    transition: 'left 160ms ease, background 160ms ease',
    boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
  };
  return (
    <BaseOptionButton
      onClick={handleClick}
      disabled={disabled || busy}
      role="switch"
      ariaChecked={active}
      ariaPressed={active}
      style={style}
    >
      <span>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={trackStyle}>
          <span style={thumbStyle} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--muted)' }}>
          {busy ? 'Working…' : active ? 'On' : 'Off'}
        </span>
      </span>
    </BaseOptionButton>
  );
}

function SelectField({ label, value, onChange, options = [], disabled = false, selectStyle, style = {} }) {
  const fieldStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 220,
    fontWeight: 700,
    color: 'var(--text)',
    ...style,
  };
  const baseSelectStyle = selectStyle || {
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--divider)',
    borderRadius: 10,
    padding: '10px 12px',
    fontWeight: 600,
    boxShadow: 'var(--shadow-1)',
  };
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        style={{ ...baseSelectStyle, width: '100%' }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
