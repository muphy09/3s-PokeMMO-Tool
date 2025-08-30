import { useEffect, useState } from "react";

export default function VersionBadge() {
  const [v, setV] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const ver = await window.app?.getVersion?.();
        if (ver) setV(ver);
      } catch {}
    })();
  }, []);

  if (!v) return null;

  return (
    <div style={{
      position: "fixed",
      right: 12,
      bottom: 10,
      zIndex: 9999,
      fontSize: 12,
      opacity: 0.75,
      padding: "4px 8px",
      borderRadius: 8,
      backdropFilter: "blur(4px)",
      background: "rgba(0,0,0,0.5)",
      color: "#fff",
      userSelect: "none",
      pointerEvents: "none",
      boxShadow: "0 2px 10px rgba(0,0,0,0.2)"
    }}>
      v{v}
    </div>
  );
}
