// src/WeaknessChart.jsx
import React from "react";

const TYPE_COLORS = {
  Normal: "#A8A77A",
  Fire: "#EE8130",
  Water: "#6390F0",
  Electric: "#F7D02C",
  Grass: "#7AC74C",
  Ice: "#96D9D6",
  Fighting: "#C22E28",
  Poison: "#A33EA1",
  Ground: "#E2BF65",
  Flying: "#A98FF3",
  Psychic: "#F95587",
  Bug: "#A6B91A",
  Rock: "#B6A136",
  Ghost: "#735797",
  Dragon: "#6F35FC",
  Dark: "#705746",
  Steel: "#B7B7CE",
  Fairy: "#D685AD",
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function TypeChip({ t }) {
  const bg = TYPE_COLORS[cap(t)] || "#777";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.35rem 0.75rem",
        borderRadius: 999,
        fontWeight: 700,
        fontSize: "0.9rem",
        lineHeight: 1,
        background: bg,        // full, solid background
        color: "#fff",         // bright white text for maximum contrast
        boxShadow: "0 2px 6px rgba(0,0,0,.3)", // subtle depth
      }}
    >
      {cap(t)}
    </span>
  );
}

function Panel({ title, children, highlight = false }) {
  return (
    <div
      style={{
        background: highlight ? "rgba(255, 255, 255, 0.08)" : "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        padding: "14px 16px",
        minHeight: 86,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: "1rem",
          fontWeight: 800,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          color: "#FFFFFF",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  );
}

export default function WeaknessChart({ buckets }) {
  const { x4 = [], x2 = [], x1 = [], x05 = [], x0 = [] } = buckets || {};

  const section = (title, arr, opts = {}) => (
    <Panel title={title} highlight={opts.highlight}>
      {arr.length ? (
        arr.map((t) => <TypeChip key={t} t={t} />)
      ) : (
        <span style={{ color: "rgba(255,255,255,0.6)" }}>—</span>
      )}
    </Panel>
  );

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
      }}
    >
      {section("4× WEAK", x4, { highlight: true })}
      {section("2× WEAK", x2, { highlight: true })}
      {section("1× NEUTRAL", x1)}
      {section("½× RESIST", x05)}
      {section("0× IMMUNE", x0)}
    </div>
  );
}
