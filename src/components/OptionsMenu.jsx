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
 *  - Reload OCR (Windows only) → restarts helper AND signals Live tab to reconnect/clear
 *  - Refresh app       → full renderer refresh
 */
export default function OptionsMenu({ style = {}, isWindows = false }) {
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
  const [ocrCaptureZoom, setOcrCaptureZoom] = useState(0.5);
  const [ocrSetupLoaded, setOcrSetupLoaded] = useState(() => !isWindows);
  const [activeCategory, setActiveCategory] = useState('general');
  const [ocrImageDebug, setOcrImageDebug] = useState(false);
  const [settingImageDebug, setSettingImageDebug] = useState(false);
  const [previewImages, setPreviewImages] = useState({ routeCapture: null, battleCapture: null });

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
    if (!isWindows) return;
    let cancelled = false;
    (async () => {
      try {
        const setup = await window.app?.getOcrSetup?.();
        if (!setup || cancelled) return;
        setOcrAggressiveness(normalizeAggValue(setup.ocrAggressiveness));
        setOcrCaptureZoom(clampOcrZoomValue(setup.captureZoom, 0.5));
      } catch (err) {
        console.error('[OptionsMenu] load OCR setup error:', err);
      } finally {
        if (!cancelled) setOcrSetupLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isWindows]);

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
    if (!isWindows && activeCategory === 'ocr') {
      setActiveCategory('general');
    }
  }, [isWindows, activeCategory]);

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
          setPreviewImages({
            routeCapture: res.routeCapture || res.capture || null,
            battleCapture: res.battleCapture || null,
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
      setPreviewImages({ routeCapture: null, battleCapture: null });
    }
  }, [ocrImageDebug]);

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
  async function onCaptureZoomChange(nextValue) {
    const normalized = clampOcrZoomValue(nextValue, ocrCaptureZoom);
    const prev = ocrCaptureZoom;
    if (normalized === prev) return;
    setOcrCaptureZoom(normalized);
    try {
      await saveOcrSetupStrict({ captureZoom: normalized }, { restart: ocrEnabled });
      show('OCR capture zoom updated.', 'success');
    } catch (err) {
      setOcrCaptureZoom(prev);
      console.error('[OptionsMenu] set OCR zoom error:', err);
      show('Failed to update OCR capture zoom', 'error');
    }
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

  const categories = isWindows ? OPTION_CATEGORIES : OPTION_CATEGORIES.filter((cat) => cat.id !== 'ocr');
  const activeCategoryMeta = categories.find((cat) => cat.id === activeCategory) || categories[0] || OPTION_CATEGORIES[0];

  const renderCategoryContent = () => {
    if (activeCategory === 'general') {
      return (
        <div style={sectionStyle}>
          <ActionButton label="Check for Updates" onClick={onCheckUpdates} />
          <Divider style={{ margin: '18px 0' }} />
          <ToggleButton label="Shiny Sprites" value={!!shinyEnabled} onToggle={onToggleShiny} />
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
      if (!isWindows) {
        return (
          <div style={sectionStyle}>
            <span style={{ color: 'var(--muted)' }}>Live OCR settings are available on Windows only.</span>
          </div>
        );
      }
      const zoomOptions = OCR_ZOOM_CHOICES.map((z) => {
        const value = z.toFixed(1);
        const display = (1 - z).toFixed(1);
        return { value, label: `${display}x` };
      });
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={ocrRowStyle}>
            <ToggleButton
              label="OCR Process"
              value={!!ocrEnabled}
              onToggle={onToggleOCR}
              disabled={!ocrSetupLoaded}
            />
            <SelectField
              label="OCR Aggressiveness"
              value={ocrAggressiveness}
              onChange={(e) => onAggressivenessChange(e.target.value)}
              disabled={!ocrSetupLoaded}
              options={OCR_AGGRESSIVENESS_OPTIONS}
              selectStyle={selectStyle}
            />
            <SelectField
              label="Route OCR Zoom"
              value={ocrCaptureZoom.toFixed(1)}
              onChange={(e) => onCaptureZoomChange(e.target.value)}
              disabled={!ocrSetupLoaded}
              options={zoomOptions}
              selectStyle={selectStyle}
            />
            <ToggleButton
              label="OCR Image Debug"
              value={ocrImageDebug}
              onToggle={onToggleOcrImageDebug}
              disabled={settingImageDebug}
              busy={settingImageDebug}
            />
          </div>
          <Divider style={{ margin: '4px 0' }} />
          <div style={previewContainerStyle}>
            <div style={previewPanelStyle}>
              <span style={previewTitleStyle}>Live Route Preview</span>
              <div style={previewFrameStyle}>
                {ocrImageDebug ? (
                  previewImages.routeCapture ? (
                    <img src={previewImages.routeCapture} alt="Route capture preview" style={previewImageStyle} />
                  ) : (
                    <span style={previewPlaceholderStyle}>Waiting for capture…</span>
                  )
                ) : (
                  <span style={previewPlaceholderStyle}>Enable OCR Image Debug for Preview</span>
                )}
              </div>
            </div>
            <div style={{ width: 2, background: 'var(--divider)', borderRadius: 999 }} />
            <div style={previewPanelStyle}>
              <span style={previewTitleStyle}>Live Battle Preview</span>
              <div style={previewFrameStyle}>
                {ocrImageDebug ? (
                  previewImages.battleCapture ? (
                    <img src={previewImages.battleCapture} alt="Battle capture preview" style={previewImageStyle} />
                  ) : (
                    <span style={previewPlaceholderStyle}>Waiting for capture…</span>
                  )
                ) : (
                  <span style={previewPlaceholderStyle}>Enable OCR Image Debug for Preview</span>
                )}
              </div>
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

function ToggleButton({ label, value, onToggle, disabled = false, busy = false }) {
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
