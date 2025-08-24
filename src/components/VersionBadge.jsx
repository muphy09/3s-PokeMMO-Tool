// src/components/VersionBadge.jsx
import { useEffect, useState } from "react";

export default function VersionBadge() {
  const [ver, setVer] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // Try Electron IPC
        const v = await (window.app?.getVersion?.() ?? Promise.resolve(""));
        if (v) return setVer(v);
      } catch {}
      // Fallback to build-time value
      const baked = import.meta.env.VITE_APP_VERSION;
      if (baked) setVer(baked);
    })();
  }, []);

  if (!ver) return null;

  return (
    <div style={{
      position: "fixed",
      right: 12,
      bottom: 10,
      zIndex: 9999,
      fontSize: 12,
      opacity: 0.8,
      padding: "4px 8px",
      borderRadius: 8,
      background: "rgba(0,0,0,0.55)",
      color: "#fff",
      userSelect: "none",
      pointerEvents: "none",
      boxShadow: "0 2px 10px rgba(0,0,0,0.25)"
    }}>
      v{ver}
    </div>
  );
}
