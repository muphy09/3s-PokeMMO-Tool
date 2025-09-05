import React, { useEffect, useRef, useState } from "react";

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
  function broadcastOcrEnabledChange(next) {
    try { window.dispatchEvent(new CustomEvent('ocr-enabled-changed', { detail: { enabled: next } })); } catch {}
  }
  async function onToggleOCR(next) {
    try {
      setOcrEnabled(next);
      try { localStorage.setItem('ocrEnabled', JSON.stringify(next)); } catch {}
      // Persist in main settings and relaunch app to apply
      show(next ? 'Enabling OCR… restarting' : 'Disabling OCR… restarting', 'info');
      await window.app?.setOcrEnabled?.(next);
      // App will relaunch; close menu immediately
    } catch (err) {
      console.error('[OptionsMenu] toggle OCR error:', err);
      show('Failed to apply OCR setting', 'error');
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
          {isWindows && (
            <>
              <Divider />
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
