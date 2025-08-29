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
  
  useEffect(() => {
    const offDl = window.app?.onUpdateDownloaded?.((ver) => {
      show(`Update ${ver} downloaded — restart to apply.`, "info");
    });
    const offAvail = window.app?.onUpdateAvailable?.((ver) => {
      show(`Downloading update ${ver}…`, "info");
    });
    return () => {
      try { offDl?.(); } catch {}
      try { offAvail?.(); } catch {}
    };
  }, []);

  // On mount, ask the main process for any pending update status so we
  // don't miss a quick "update downloaded" event fired before listeners
  // attach. Only surface messages when an update is in progress or ready.
  useEffect(() => {
    async function checkInitial() {
      try {
        const res = await window.app?.checkUpdates?.();
        if (res?.status === "downloaded" && res?.version) {
          show(`Update ${res.version} downloaded — restart to apply.`, "info");
        } else if ((res?.status === "downloading" || res?.status === "available") && res?.version) {
          show(`Downloading update ${res.version}…`, "info");
        }
      } catch {}
    }
    checkInitial();
  }, []);
  
  async function onCheckUpdates() {
    try {
      show("Checking for updates…", "info");

      // Ask main for current version and an update check result
      const current = await window.app?.getVersion?.().catch(() => null);
      const res = await window.app?.checkUpdates?.();

      const status = res?.status || "uptodate";

      if (status === "downloaded" && res?.version) {
        show(`Update ${res.version} downloaded — restart to apply.`, "success");
      } else if ((status === "downloading" || status === "available") && res?.version) {
        show(`Downloading update ${res.version}…`, "info");
      } else if (status === "uptodate") {
        show(`Up to date${current ? ` (v${current})` : ""}!`, "success");
      } else if (status === "error") {
        show("Update check failed.", "error");
        console.error("[OptionsMenu] checkUpdates error:", res?.message);
      } else {
        show("Up to date!", "success");
      }
    } catch (err) {
      show("Update check failed.", "error");
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

  async function onRefresh() {
    try {
      await window.app?.refreshApp?.();
    } finally {
      setOpen(false);
    }
  }

  // Styles
  const btnStyle = {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid #2a2a2a",
    background: "linear-gradient(180deg,#2b2b2b,#1b1b1b)",
    color: "#eaeaea",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(0,0,0,.3)",
  };
  const menuStyle = {
    position: "absolute",
    right: 0,
    top: "calc(100% + 6px)",
    minWidth: 220,
    background: "#0e0e0e",
    border: "1px solid #282828",
    borderRadius: 12,
    boxShadow: "0 16px 40px rgba(0,0,0,.45)",
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
              <span style={{ color:"#ddd", fontWeight:600 }}>Element Scale</span>
              <div style={{ display:"flex", alignItems:"center", color:"#aaa", fontSize:12 }}>
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
                    border: "1px solid #444",
                    borderRadius: 4,
                    color: "#aaa",
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
              <MenuItem label="Reload OCR" onClick={onReloadOCR} />
            </>
          )}
          <MenuItem label="Refresh app" onClick={onRefresh} />
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
                ? "#5a1a1a"
                : toast.kind === "success"
                ? "#1b4a1b"
                : "#1a1a3a",
            color: "#eee",
            borderRadius: 10,
            border: "1px solid #333",
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
    color: "#ddd",
    background: "transparent",
    border: 0,
    cursor: "pointer",
    fontWeight: 600,
  };
  const itemHover = { background: "#1b1b1b" };
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
  return <div style={{ height: 1, background: "#262626" }} />;
}
