import React, { useEffect, useRef, useState } from "react";

const OCR_AGGRESSIVENESS_OPTIONS = [
  { value: 'fast', label: 'Fast' },
  { value: 'normal', label: 'Normal' },
  { value: 'efficient', label: 'Efficient' },
];
const OCR_ZOOM_CHOICES = Array.from({ length: 9 }, (_, i) => Number((0.1 * (i + 1)).toFixed(1)));
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

  const scaleWrapRef = useRef(null);
  const startScaleRef = useRef(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    // Map slider range [0,100] to visual scale [0.5,1.5]
    // so 50% appears as the normal 100% size.
    document.body.style.zoom = 0.5 + scale / 100;
    localStorage.setItem("uiScaleV2", String(scale));
  }, [scale]);

  // close when clicking outside
  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

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
    } finally {
      setOpen(false);
    }
  }

  async function onReloadOCR() {
    try {
      show("Restarting OCR…", "info");
      await window.app?.reloadOCR?.();
      // ask Live tab to reconnect & clear current state
      window.dispatchEvent(new CustomEvent("force-live-reconnect", { detail: { reset: true } }));
      show("OCR restarted.", "success");
    } catch (err) {
      show("Failed to restart OCR.", "error");
      console.error("[OptionsMenu] reloadOCR error:", err);
    } finally {
      setOpen(false);
    }
  }
  async function onAggressivenessChange(nextValue) {
    const normalized = normalizeAggValue(nextValue);
    const prev = ocrAggressiveness;
    if (normalized === prev) return;
    setOcrAggressiveness(normalized);
    try {
      const res = await window.app?.saveOcrSetup?.({ ocrAggressiveness: normalized });
      if (res === false || (res && res.ok === false)) throw new Error('saveOcrSetup unavailable');
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
      const res = await window.app?.saveOcrSetup?.({ captureZoom: normalized });
      if (res === false || (res && res.ok === false)) throw new Error('saveOcrSetup unavailable');
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
      const res = await window.app?.setOcrEnabled?.(next);
      if (res === false || (res && res.ok === false)) throw new Error('setOcrEnabled unavailable');
      broadcastOcrEnabledChange(next);
      show(next ? 'OCR enabled.' : 'OCR disabled.', 'success');
    } catch (err) {
      console.error('[OptionsMenu] toggle OCR error:', err);
      show('Failed to apply OCR setting', 'error');
      setOcrEnabled(prev);
      try { localStorage.setItem('ocrEnabled', JSON.stringify(prev)); } catch {}
    } finally {
      setOpen(false);
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
  const menuStyle = {
    position: "absolute",
    right: 0,
    top: "calc(100% + 6px)",
    minWidth: 220,
    background: "var(--surface)",
    border: "1px solid var(--divider)",
    borderRadius: 12,
    boxShadow: "var(--shadow-2)",
    overflow: "hidden",
  };
  const selectStyle = {
    background: 'transparent',
    color: 'var(--text)',
    border: '1px solid var(--divider)',
    borderRadius: 6,
    padding: '6px 8px',
    fontWeight: 600,
    cursor: 'pointer',
  };

  return (
    <div ref={menuRef} style={{ position: "relative", ...style }}>
      <button
        style={btnStyle}
        onClick={() => setOpen((v) => !v)}
        title="Options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Options ▾
      </button>

      {open && (
        <div style={menuStyle} role="menu" aria-label="Options menu">
          <div ref={scaleWrapRef} style={{ padding:"10px 12px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <span style={{ color:'var(--text)', fontWeight:600 }}>Element Scale</span>
              <div style={{ display:"flex", alignItems:"center", color:'var(--muted)', fontSize:12 }}>
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
                    width: 40,
                    textAlign: "right",
                    background: "transparent",
                    border: "1px solid var(--divider)",
                    borderRadius: 4,
                    color: "var(--text)",
                    fontSize: 12,
                    marginRight: 2,
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
                  scaleWrapRef.current.style.transformOrigin = "0 0";
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
              style={{ width:"100%" }}
            />
          </div>
          <Divider />
          <MenuItem label="Check for updates" onClick={onCheckUpdates} />
          <Divider />
          <MenuItem label="Choose Colors" onClick={() => { try { window.dispatchEvent(new Event('open-color-picker')); } catch {} setOpen(false); }} />
          <Divider />
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px' }}>
            <span style={{ color:'var(--text)', fontWeight:600 }}>Shiny Sprites</span>
            <label style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
              <input type="checkbox" checked={!!shinyEnabled} onChange={(e)=> onToggleShiny(e.target.checked)} />
              <span className="label-muted" style={{ fontSize:12 }}>{shinyEnabled ? 'On' : 'Off'}</span>
            </label>
          </div>
          {isWindows && (
            <>
              <Divider />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', gap:12 }}>
                <span style={{ color:'var(--text)', fontWeight:600 }}>OCR Aggressiveness</span>
                <select
                  value={ocrAggressiveness}
                  onChange={(e) => onAggressivenessChange(e.target.value)}
                  disabled={!ocrSetupLoaded}
                  style={{ ...selectStyle, minWidth: 120 }}
                >
                  {OCR_AGGRESSIVENESS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', gap:12 }}>
                <span style={{ color:'var(--text)', fontWeight:600 }}>OCR Capture Zoom</span>
                <select
                  value={ocrCaptureZoom.toFixed(1)}
                  onChange={(e) => onCaptureZoomChange(e.target.value)}
                  disabled={!ocrSetupLoaded}
                  style={{ ...selectStyle, minWidth: 120 }}
                >
                  {OCR_ZOOM_CHOICES.map((z) => {
                    const text = z.toFixed(1);
                    return <option key={text} value={text}>{`${text}x`}</option>;
                  })}
                </select>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px' }}>
                <span style={{ color:'var(--text)', fontWeight:600 }}>OCR On/Off</span>
                <label style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                  <input type="checkbox" checked={!!ocrEnabled} onChange={(e)=> onToggleOCR(e.target.checked)} />
                  <span className="label-muted" style={{ fontSize:12 }}>{ocrEnabled ? 'On' : 'Off'}</span>
                </label>
              </div>
              <Divider />
              {ocrEnabled && (<MenuItem label="Reload OCR" onClick={onReloadOCR} />)}
            </>
          )}
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 54px)",
            padding: "8px 12px",
            background:
              toast.kind === "error"
                ? "var(--toast-error)"
                : toast.kind === "success"
                ? "var(--toast-success)"
                : "var(--toast-info)",
            color: "var(--text)",
            borderRadius: 10,
            border: "1px solid var(--divider)",
            boxShadow: "0 8px 28px rgba(0,0,0,.45)",
            maxWidth: 360,
            pointerEvents: "none",
            fontWeight: 700,
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onClick }) {
  const [hover, setHover] = useState(false);
  const itemStyle = {
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    color: "var(--text)",
    background: "transparent",
    border: 0,
    cursor: "pointer",
    fontWeight: 600,
  };
  const itemHover = { background: "var(--menu-hover-bg)" };
  return (
    <button
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...itemStyle, ...(hover ? itemHover : null) }}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--divider)" }} />;
}
