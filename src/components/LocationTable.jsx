// src/components/LocationTable.jsx
import React, { useMemo } from "react";

function Badge({ children, title, className = "" }) {
  return (
    <span
      title={title || String(children)}
      className={
        "inline-flex items-center px-2 py-0.5 text-xs rounded-full border " +
        className
      }
    >
      {children}
    </span>
  );
}

function ItemsList({ items }) {
  if (!items || !items.length) return null;
  return (
    <div className="flex gap-1 flex-wrap">
      {items.map((it, i) => (
        <Badge key={i} title={it} className="border-slate-300 bg-slate-50">
          {it}
        </Badge>
      ))}
    </div>
  );
}

function RarityBadge({ rarity }) {
  if (!rarity) return null;
  const tone =
    /very rare/i.test(rarity)
      ? "border-pink-300 bg-pink-50"
      : /rare/i.test(rarity)
      ? "border-amber-300 bg-amber-50"
      : /uncommon/i.test(rarity)
      ? "border-sky-300 bg-sky-50"
      : "border-emerald-300 bg-emerald-50";
  return (
    <Badge className={tone} title={`Rarity: ${rarity}`}>
      {rarity}
    </Badge>
  );
}

function HordeFlags({ row }) {
  const bits = [];
  if (row.horde || row.hordeFromEntry) bits.push("Horde");
  if (row.hordeOnly) bits.push("Horde Only");
  if (row.groupSize) bits.push(`x${row.groupSize}`);
  if (!bits.length) return null;
  return (
    <div className="flex gap-1 flex-wrap">
      {bits.map((b, i) => (
        <Badge key={i} className="border-violet-300 bg-violet-50">
          {b}
        </Badge>
      ))}
    </div>
  );
}

export default function LocationTable({ allLocations, region }) {
  // Filter by region (or show all)
  const rows = useMemo(() => {
    const src = Array.isArray(allLocations) ? allLocations : [];
    const filtered = region && region !== "All"
      ? src.filter((r) => (r.region || "").toLowerCase() === region.toLowerCase())
      : src.slice();

    // stable sort: Region > Map > Method
    filtered.sort((a, b) =>
      (a.region || "").localeCompare(b.region || "") ||
      (a.map || "").localeCompare(b.map || "") ||
      (a.method || "").localeCompare(b.method || "")
    );
    return filtered;
  }, [allLocations, region]);

  if (!rows.length) {
    return (
      <div className="text-sm text-slate-500">
        No known locations for this Pokémon in {region || "All regions"}.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-700">
          <tr>
            <th className="text-left px-3 py-2 whitespace-nowrap">Region</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Map / Area</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Method</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Rarity</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Level</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Items</th>
            <th className="text-left px-3 py-2 whitespace-nowrap">Flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? "bg-white" : "bg-slate-50/30"}>
              <td className="px-3 py-2 align-top whitespace-nowrap">{r.region || "-"}</td>
              <td className="px-3 py-2 align-top">{r.map || "-"}</td>
              <td className="px-3 py-2 align-top whitespace-nowrap">{r.method || r.type || "-"}</td>
              <td className="px-3 py-2 align-top"><RarityBadge rarity={r.rarity} /></td>
              <td className="px-3 py-2 align-top whitespace-nowrap">{r.level || "-"}</td>
              <td className="px-3 py-2 align-top"><ItemsList items={r.items} /></td>
              <td className="px-3 py-2 align-top"><HordeFlags row={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
