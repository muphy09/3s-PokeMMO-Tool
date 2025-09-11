#!/usr/bin/env node
/**
 * PokéMMO forum regions → locations + areas index
 * Version: 1.3.3-area-search
 *
 * - Keeps all parsing fixes from 1.3.2 (hordes/viridian/etc).
 * - NEW: Extracts rarity tokens ("Very Common", "Common", "Uncommon", "Rare", "Very Rare", "%") from parentheses.
 * - NEW: Emits public/data/areas_index.json for fast area/route lookups.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, "..");

const POKEDEX_PATH = path.join(ROOT, "src", "data", "pokedex.json");
const REGIONS_DIR  = path.join(ROOT, "data", "forum_regions");
const REGION_FILES = { Kanto:"kanto.txt", Johto:"johto.txt", Hoenn:"hoenn.txt", Sinnoh:"sinnoh.txt", Unova:"unova.txt" };

const OUT_JSON_POKE   = path.join(ROOT, "public", "data", "pokemmo_locations.json");
const OUT_JSON_AREAS  = path.join(ROOT, "public", "data", "areas_index.json");
const REPORT_DIR      = path.join(ROOT, "reports");
const DRY_RUN         = process.argv.includes("--dry");

// ---------------- helpers ----------------
const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
const readText  = (p) => fs.readFileSync(p, "utf8");
const readJson  = (p, fb = {}) => (fs.existsSync(p) ? JSON.parse(readText(p)) : fb);

function normalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}
function titleCase(s) {
  return String(s || "")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}
function preClean(line) {
  if (!line) return "";
  line = line.replace(/[’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");
  line = line.replace(/\b[A-Za-z0-9_-]{6,}\.(?:png|jpg|jpeg|gif|webp)\b/gi, " ");
  line = line.replace(/\b[A-Za-z0-9_-]{6,}\.(?:png|jpg|jpeg|gif|webp)([A-Za-z])/gi, " $1");
  line = line.replace(/\s{2,}/g, " ").trim();
  return line;
}

const NAME_ALIASES = new Map(
  Object.entries({
    "nidoran f":"Nidoran♀","nidoran-f":"Nidoran♀","nidoran♀":"Nidoran♀",
    "nidoran m":"Nidoran♂","nidoran-m":"Nidoran♂","nidoran♂":"Nidoran♂",
    "mr mime":"Mr. Mime","mime jr":"Mime Jr.","farfetchd":"Farfetch’d",
    "ho oh":"Ho-Oh","porygon z":"Porygon-Z","hippootas":"Hippopotas"
  }).map(([k,v])=>[normalizeKey(k),v])
);
function canonicalSpecies(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^[*•-]+/, "").trim();
  s = s.replace(/[;,.\s]+$/, "");
  s = s.split("[")[0].split("(")[0].trim();
  s = s.replace(/\bMr\.?\s*Mime\b/i, "Mr. Mime");
  s = s.replace(/\s*-\s*Red-Striped Form$/i, "");
  s = s.replace(/\s*-\s*Blue-Striped Form$/i, "");
  s = s.replace(/\s*\((East|West)\s*Sea\)$/i, "");
  s = s.replace(/\s{2,}/g, " ");
  let display = titleCase(s).replace("Mr. Mime", "Mr. Mime");
  const alias = NAME_ALIASES.get(normalizeKey(display));
  if (alias) display = alias;
  return display;
}

const DEX = readJson(POKEDEX_PATH, []);
const DEX_NAMES = new Set(DEX.map((e) => titleCase(e?.name || "")));

const CATEGORY_BASES = [
  "Grass","Dark Grass","Cave","Water","Rocks","Rock Smash",
  "Fishing","Old Rod","Good Rod","Super Rod","Building",
  "Inside","Outside","Headbutt","Tree","Swampy Grass",
  "Interaction","NPC Interaction","Special"
];

const RX_LOCATION_HEADER = /^(?<loc>[^:]+?)(?:\s*[–-]\s*Credit.*|\s+\(no encounters\))?\s*$/i;
const RX_SECTION = new RegExp(
  `^(?:(?<base>${CATEGORY_BASES.map(s=>s.replace(/\s/g,"\\s")).join("|")})(?:\\s*\\((?<detail>[^)]+)\\))?)\\s*[:=]\\s*(?<body>.*)$`,
  "i"
);
const RX_LURE    = /^Lure\s+in\s+(?<where>[^:=]+)\s*[:=]\s*(?<body>.*)$/i;
const RX_ONLYONE = /^Only\s+One(?:\s*\([^)]*\))?\s*:\s*(?<body>.+)$/i;
const RX_HORDE   = /^\*\s*(?<names>[^*]+?)\s+Hordes?\b.*$/i;
const RX_SPLIT   = /\s*,\s*|\s+and\s+|\s+or\s+/i;

// rarity map
const RARITY_MAP = new Map(Object.entries({
  "very common":"Very Common",
  "common":"Common",
  "uncommon":"Uncommon",
  "rare":"Rare",
  "very rare":"Very Rare"
}));

function methodLabel(base, detail) {
  const canon = CATEGORY_BASES.find(b => b.toLowerCase() === String(base||"").toLowerCase());
  if (canon) return detail ? `${canon} (${detail})` : canon;
  return detail ? `${titleCase(base)} (${detail})` : titleCase(base);
}

function parseSpeciesFromBodyWithRarity(body) {
  const out = [];
  if (!body) return out;

  // protect commas inside [items]
  const protectedBody = body.replace(/\[[^\]]+\]/g, (m) => m.replace(/,/g, "•"));
  const parts = protectedBody.split(RX_SPLIT).map((p) => p.replace(/•/g, ",").trim()).filter(Boolean);

  for (let part of parts) {
    const full = part; // keep for rarity parse
    let core = part.split("[")[0].split("(")[0].trim();
    core = core.replace(/^[*•-]+/, "").trim();
    if (!/[A-Za-z]/.test(core)) continue;

    const species = canonicalSpecies(core);
    if (!species) continue;

    // grab rarity from any (...) tokens
    let rarity;
    const parens = full.match(/\(([^)]+)\)/g) || [];
    for (const p of parens) {
      const tokens = p.slice(1, -1).split(/\s*,\s*/);
      for (const t of tokens) {
        const k = t.trim().toLowerCase();
        if (RARITY_MAP.has(k)) rarity = RARITY_MAP.get(k);
        else if (/^\d+%$/.test(k)) rarity = t.trim(); // keep raw percent
      }
    }
    out.push({ species, rarity });
  }
  return out;
}

function looksLikeSpeciesList(line) {
  const commas = (line.match(/,/g) || []).length;
  const parens = (line.match(/\(/g) || []).length;
  return commas >= 2 && parens >= 1 && /[A-Za-z]/.test(line);
}
function lineHasWaterHints(line) { return /(water|river|sea|surf|rod|fishing)/i.test(line); }
function lineHasCaveHints(line)  { return /\bcave\b/i.test(line); }

// ---------------- main parsing ----------------
function processRegion(regionName, fileName, pokedexIndex, areasIndex, reports) {
  const fp = path.join(REGIONS_DIR, fileName);
  if (!fs.existsSync(fp)) throw new Error(`Missing region file: ${fp}`);
  const rawLines = readText(fp).split(/\r?\n/);

  let currentMap = null;
  let currentCat = null;

  const stats = { region: regionName, total_lines: 0, parsed_lines: 0, maps: 0, sections: 0, entries: 0 };

  for (let i = 0; i < rawLines.length; i++) {
    stats.total_lines++;
    const raw0 = rawLines[i];
    const raw = raw0;
    const line = preClean(raw0);
    if (!line) continue;

    if (/^thank you\b/i.test(line) || /^guide key\b/i.test(line)) continue;

    // HORDE notes
    let hm = RX_HORDE.exec(line);
    if (hm && currentMap) {
      const list = parseSpeciesFromBodyWithRarity(hm.groups?.names || "");
      for (const { species } of list) {
        addEntry(pokedexIndex, areasIndex, species, regionName, currentMap, "Horde", undefined);
        stats.entries++;
        if (!DEX_NAMES.has(species)) reports.unknownNames.push({ region:regionName, map:currentMap, line:i+1, name:species, raw:raw0 });
      }
      stats.parsed_lines++;
      continue;
    }

    if (line.startsWith("*")) {
      reports.unmatched.push({ region: regionName, map: currentMap, line: i+1, text: raw, reason: "note/asterisk line" });
      continue;
    }

    // location header?
    if (!/[=:]$/.test(line)) {
      const locm = /^(?<loc>[^:]+?)(?:\s*[–-]\s*Credit.*|\s+\(no encounters\))?\s*$/i.exec(line);
      if (locm) {
        const loc = locm.groups?.loc?.trim();
        if (loc && !/\bHordes?\b/i.test(loc) && !/^Of Note/i.test(loc)) {
          if (/\(no encounters\)/i.test(raw)) { currentMap = null; currentCat = null; continue; }
          currentMap = loc;
          currentCat = null;
          stats.maps++;
          continue;
        }
      }
    }

    // section
    let sm = RX_SECTION.exec(line);
    if (sm) {
      const base = sm.groups?.base?.trim();
      const detail = sm.groups?.detail?.trim();
      const body = sm.groups?.body?.trim() || "";
      currentCat = methodLabel(base, detail);
      stats.sections++;

      if (/no encounters/i.test(body)) {
        reports.unmatched.push({ region: regionName, map: currentMap, line: i+1, text: raw, reason: "no encounters in section" });
        stats.parsed_lines++;
        continue;
      }
      const list = parseSpeciesFromBodyWithRarity(body);
      if (list.length && currentMap) {
        for (const { species, rarity } of list) {
          addEntry(pokedexIndex, areasIndex, species, regionName, currentMap, currentCat, rarity);
          stats.entries++;
          if (!DEX_NAMES.has(species)) reports.unknownNames.push({ region:regionName, map:currentMap, line:i+1, name:species, raw:raw0 });
        }
      }
      stats.parsed_lines++;
      continue;
    }

    // lure
    let lm = RX_LURE.exec(line);
    if (lm) {
      const where = lm.groups?.where?.trim();
      const body = lm.groups?.body?.trim() || "";
      currentCat = `Lure (${titleCase(where)})`;
      stats.sections++;

      const list = parseSpeciesFromBodyWithRarity(body);
      if (list.length && currentMap) {
        for (const { species, rarity } of list) {
          addEntry(pokedexIndex, areasIndex, species, regionName, currentMap, currentCat, rarity);
          stats.entries++;
          if (!DEX_NAMES.has(species)) reports.unknownNames.push({ region:regionName, map:currentMap, line:i+1, name:species, raw:raw0 });
        }
      }
      stats.parsed_lines++;
      continue;
    }

    // only one
    let om = RX_ONLYONE.exec(line);
    if (om) {
      const list = parseSpeciesFromBodyWithRarity(om.groups?.body?.trim() || "");
      currentCat = "Interaction (Only One)";
      if (list.length && currentMap) {
        for (const { species, rarity } of list) {
          addEntry(pokedexIndex, areasIndex, species, regionName, currentMap, currentCat, rarity);
          stats.entries++;
          if (!DEX_NAMES.has(species)) reports.unknownNames.push({ region:regionName, map:currentMap, line:i+1, name:species, raw:raw0 });
        }
      } else {
        reports.unmatched.push({ region: regionName, map: currentMap, line: i+1, text: raw, reason: "only one with no parse" });
      }
      stats.parsed_lines++;
      continue;
    }

    // continuation under category
    if (currentMap && currentCat) {
      const list = parseSpeciesFromBodyWithRarity(line);
      if (list.length) {
        for (const { species, rarity } of list) {
          addEntry(pokedexIndex, areasIndex, species, regionName, currentMap, currentCat, rarity);
          stats.entries++;
          if (!DEX_NAMES.has(species)) reports.unknownNames.push({ region:regionName, map:currentMap, line:i+1, name:species, raw:raw0 });
        }
        stats.parsed_lines++;
        continue;
      }
    }

    // Viridian Forest: treat list lines as Grass
    if (currentMap === "Viridian Forest" && looksLikeSpeciesList(line)) {
      const list = parseSpeciesFromBodyWithRarity(line);
      if (list.length) {
        for (const { species, rarity } of list) {
          addEntry(pokedexIndex, areasIndex, species, regionName, currentMap, "Grass", rarity);
          stats.entries++;
          if (!DEX_NAMES.has(species)) reports.unknownNames.push({ region:regionName, map:currentMap, line:i+1, name:species, raw:raw0 });
        }
        stats.parsed_lines++;
        continue;
      }
    }

    // heuristic fallback
    if (currentMap && !currentCat && looksLikeSpeciesList(line)) {
      let guessed = "Grass";
      if (lineHasWaterHints(line)) guessed = "Water";
      else if (lineHasCaveHints(line)) guessed = "Cave";

      const list = parseSpeciesFromBodyWithRarity(line);
      if (list.length) {
        reports.unmatched.push({ region: regionName, map: currentMap, line: i+1, text: raw, reason: `fallback_assumed_${guessed.toLowerCase()}` });
        for (const { species, rarity } of list) {
          addEntry(pokedexIndex, areasIndex, species, regionName, currentMap, guessed, rarity);
          stats.entries++;
          if (!DEX_NAMES.has(species)) reports.unknownNames.push({ region:regionName, map:currentMap, line:i+1, name:species, raw:raw0 });
        }
        stats.parsed_lines++;
        continue;
      }
    }

    if (!/Credit to/i.test(line)) {
      reports.unmatched.push({ region: regionName, map: currentMap, line: i+1, text: raw, reason: "no section/header match" });
    }
  }

  return stats;
}

// push both indexes
function addEntry(pokedexIndex, areasIndex, species, region, map, method, rarity) {
  const monKey = normalizeKey(species);
  if (!pokedexIndex[monKey]) pokedexIndex[monKey] = { pokedex: species, locations: [] };
  pokedexIndex[monKey].locations.push(
    Object.fromEntries(Object.entries({ region, map, method, rarity }).filter(([,v]) => v != null && v !== ""))
  );

  if (!areasIndex[region]) areasIndex[region] = {};
  if (!areasIndex[region][map]) areasIndex[region][map] = [];
  areasIndex[region][map].push(
    Object.fromEntries(Object.entries({ pokemon: species, method, rarity }).filter(([,v]) => v != null && v !== ""))
  );
}

// ---------------- run ----------------
(function main() {
  for (const [region, file] of Object.entries(REGION_FILES)) {
    const fp = path.join(REGIONS_DIR, file);
    if (!fs.existsSync(fp)) {
      console.error(`❌ Missing ${region} file: ${fp}`);
      process.exit(1);
    }
  }

  const pokedexIndex = {};
  const areasIndex   = {};
  const reports = { unmatched: [], unknownNames: [] };
  const perRegion = [];

  for (const [region, file] of Object.entries(REGION_FILES)) {
    const stats = processRegion(region, file, pokedexIndex, areasIndex, reports);
    perRegion.push(stats);
  }

  const summary = {
    regions: perRegion,
    totals: {
      pokemonWithLocations: Object.keys(pokedexIndex).length,
      totalLocationEntries: Object.values(pokedexIndex).reduce((a, e) => a + (e.locations?.length || 0), 0),
      areasCount: Object.values(areasIndex).reduce((a, m) => a + Object.keys(m).length, 0),
      unmatchedLines: reports.unmatched.length,
      unknownNames: reports.unknownNames.length
    },
  };

  ensureDir(REPORT_DIR);
  fs.writeFileSync(path.join(REPORT_DIR, "ingest_summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, "ingest_unmatched_lines.json"), JSON.stringify(reports.unmatched, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, "ingest_unknown_names.json"), JSON.stringify(reports.unknownNames, null, 2));

  if (!DRY_RUN) {
    ensureDir(path.dirname(OUT_JSON_POKE));
    fs.writeFileSync(OUT_JSON_POKE, JSON.stringify(pokedexIndex, null, 2));
    fs.writeFileSync(OUT_JSON_AREAS, JSON.stringify(areasIndex, null, 2));
    console.log(`✓ Wrote ${OUT_JSON_POKE}`);
    console.log(`✓ Wrote ${OUT_JSON_AREAS}`);
  } else {
    console.log("DRY RUN — no JSON written.");
  }

  console.log("✓ Wrote reports to", REPORT_DIR);
  console.log("Summary:", JSON.stringify(summary.totals, null, 2));
})();
