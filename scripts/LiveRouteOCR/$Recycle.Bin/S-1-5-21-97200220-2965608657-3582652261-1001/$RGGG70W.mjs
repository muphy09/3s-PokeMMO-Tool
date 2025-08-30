#!/usr/bin/env node
/**
 * Reports Pokémon that are missing location data.
 * - Compares src/data/pokedex.json with public/data/pokemmo_locations.json
 * - Uses the same normalize rule as the app (normalizeKey + the "and-<name>" fallback)
 * - Outputs a console summary + writes JSON and CSV reports to ./reports/
 *
 * Usage:
 *   node scripts/report-missing-locations.mjs
 *
 * Requirements:
 *   - Node 18+ (for ESM + fetch/file APIs) or run with: node --experimental-modules
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const POKEDEX_PATH   = path.join(projectRoot, "src", "data", "pokedex.json");
const LOCATIONS_PATH = path.join(projectRoot, "public", "data", "pokemmo_locations.json");
const REPORT_DIR     = path.join(projectRoot, "reports");

/* ---------- helpers (match App.jsx) ---------- */
function normalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}
function titleCase(s) {
  if (!s) return "";
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
function toLegacyShape(mon) {
  // Accept {dex} or {id}, match current app’s expectations
  const id =
    typeof mon?.dex === "number"
      ? mon.dex
      : typeof mon?.id === "number"
      ? mon.id
      : null;
  return {
    id,
    name: mon?.name ?? "",
    types: Array.isArray(mon?.types) ? mon.types : [],
  };
}

/* ---------- IO ---------- */
function readJson(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`File not found: ${p}`);
  }
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function writeFile(p, data) {
  fs.writeFileSync(p, data);
}

/* ---------- main ---------- */
function loadDex() {
  const raw = readJson(POKEDEX_PATH);
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map(toLegacyShape)
    .filter((e) => e?.id != null && e?.name); // keep only valid entries
}

function loadLocationsIndex() {
  const raw = readJson(LOCATIONS_PATH);
  const idx = {};
  for (const [k, v] of Object.entries(raw || {})) {
    idx[normalizeKey(k)] = v;
  }
  return idx;
}

function getLocationEntryForName(name, locIndex) {
  const norm = normalizeKey(name);
  // Same fallback behavior as the app:
  return (
    locIndex[norm] ||
    locIndex[`and-${norm}`] ||
    locIndex[norm.replace(/^and-/, "")]
  );
}

function run() {
  console.log("🔍 Checking missing location data...");
  console.log(`   Pokédex:   ${POKEDEX_PATH}`);
  console.log(`   Locations: ${LOCATIONS_PATH}`);

  let dex = [];
  let locIndex = {};
  try {
    dex = loadDex();
  } catch (e) {
    console.error(`❌ Failed to read pokedex: ${e.message}`);
    process.exit(1);
  }
  try {
    locIndex = loadLocationsIndex();
  } catch (e) {
    console.error(`❌ Failed to read locations: ${e.message}`);
    process.exit(1);
  }

  const missing = [];
  const empty = [];
  const malformed = [];

  for (const mon of dex) {
    const entry = getLocationEntryForName(mon.name, locIndex);
    if (!entry) {
      missing.push(mon);
      continue;
    }
    // Expect { locations: [...] }
    if (!("locations" in entry)) {
      malformed.push({ mon, reason: "no 'locations' key" });
      continue;
    }
    if (!Array.isArray(entry.locations)) {
      malformed.push({ mon, reason: "'locations' is not an array" });
      continue;
    }
    if (entry.locations.length === 0) {
      empty.push(mon);
      continue;
    }
    // otherwise it has data ✅
  }

  // Summary
  const total = dex.length;
  const ok = total - missing.length - empty.length - malformed.length;

  console.log("\n===== Location Coverage Report =====");
  console.log(`Total Pokémon (from pokedex.json): ${total}`);
  console.log(`With locations:                    ${ok}`);
  console.log(`Missing (no entry found):          ${missing.length}`);
  console.log(`Present but EMPTY locations:       ${empty.length}`);
  console.log(`Present but MALFORMED:             ${malformed.length}`);
  console.log("===================================\n");

  // Pretty-print samples
  const show = (arr, label, max = 15) => {
    if (!arr.length) return;
    console.log(`${label} (${arr.length}):`);
    for (const e of arr.slice(0, max)) {
      const mon = e.mon || e; // support both shapes
      const name = titleCase(mon.name);
      console.log(`  - #${String(mon.id).padStart(3, "0")} ${name}`);
    }
    if (arr.length > max) {
      console.log(`  …and ${arr.length - max} more`);
    }
    console.log();
  };

  show(missing,  "Missing entries");
  show(empty,    "Empty 'locations' arrays");
  if (malformed.length) {
    console.log(`Malformed entries (${malformed.length}):`);
    for (const e of malformed.slice(0, 15)) {
      const name = titleCase(e.mon.name);
      console.log(`  - #${String(e.mon.id).padStart(3, "0")} ${name} — ${e.reason}`);
    }
    if (malformed.length > 15) {
      console.log(`  …and ${malformed.length - 15} more`);
    }
    console.log();
  }

  // Write reports
  ensureDir(REPORT_DIR);

  const reportJson = {
    generatedAt: new Date().toISOString(),
    totals: { total, ok, missing: missing.length, empty: empty.length, malformed: malformed.length },
    missing,
    empty,
    malformed,
  };
  writeFile(path.join(REPORT_DIR, "missing_locations.json"), JSON.stringify(reportJson, null, 2));

  const toCsvRow = (status, mon, extra = "") =>
    `"${mon.id}","${mon.name.replace(/"/g, '""')}","${(mon.types||[]).join("/")}","${status}","${extra.replace(/"/g, '""')}"`;

  const csvHeader = `id,name,types,status,notes`;
  const csvLines = [
    csvHeader,
    ...missing.map((m) => toCsvRow("MISSING_ENTRY", m)),
    ...empty.map((m) => toCsvRow("EMPTY_LOCATIONS", m)),
    ...malformed.map((e) => toCsvRow("MALFORMED", e.mon, e.reason)),
  ];
  writeFile(path.join(REPORT_DIR, "missing_locations.csv"), csvLines.join("\n"));

  console.log("📄 Wrote:");
  console.log(`  - ${path.relative(projectRoot, path.join(REPORT_DIR, "missing_locations.json"))}`);
  console.log(`  - ${path.relative(projectRoot, path.join(REPORT_DIR, "missing_locations.csv"))}`);
  console.log("\n✅ Done.");
}

run();
