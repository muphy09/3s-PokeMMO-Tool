// tools/strip-to-gen1to5_v2.cjs
// Safe, non-destructive filter to Gen 1–5 and remove Fairy.
// Writes new files with *.gen1to5.json and prints a report.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DEX_CAP = 649;
const OUT_INDENT = 2;

// input files
const POKEDEX = path.join(ROOT, 'src', 'pokedex.json');
const LOCS    = path.join(ROOT, 'public', 'data', 'pokemmo_locations.json');

// output files (do NOT overwrite originals)
const OUT_POKEDEX = path.join(ROOT, 'src', 'pokedex.gen1to5.json');
const OUT_LOCS    = path.join(ROOT, 'public', 'data', 'pokemmo_locations.gen1to5.json');

// Only these regions exist in PokeMMO
const REGIONS_ALLOWED = new Set(['kanto','johto','hoenn','sinnoh','unova']);

// ---------- helpers ----------
const readJSON  = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJSON = (p,obj) => fs.writeFileSync(p, JSON.stringify(obj, null, OUT_INDENT));

function normKey(s) {
  // Normalize keys for fuzzy matching (remove punctuation/whitespace, lower-case)
  return String(s || '')
    .toLowerCase()
    .replace(/^and[-_\s]+/, '')        // drop leading "and-" or "and "
    .replace(/[^a-z0-9]/g, '');        // keep only a–z,0–9
}

function stripFairy(types = []) {
  return types.filter(t => String(t).toLowerCase() !== 'fairy');
}

// ---------- main ----------
(function main() {
  if (!fs.existsSync(POKEDEX)) {
    console.error('ERROR: Missing', POKEDEX); process.exit(1);
  }
  if (!fs.existsSync(LOCS)) {
    console.error('ERROR: Missing', LOCS); process.exit(1);
  }

  const pokedex = readJSON(POKEDEX); // { bulbasaur: { name, dex, types, ... }, ... }

  // Build alias map: normalized -> primaryKey
  const aliasToKey = new Map();
  const keyInfo = new Map(); // primaryKey -> mon object

  for (const [key, mon] of Object.entries(pokedex)) {
    const dex = Number(mon.dex || 0);
    const primary = key.toLowerCase();

    keyInfo.set(primary, mon);

    // Prepare aliases: key, display name, slimmed forms
    const aliases = new Set([
      primary,
      normKey(primary),
      normKey(mon.name || primary)
    ]);

    // record in the map
    for (const a of aliases) {
      if (!a) continue;
      if (!aliasToKey.has(a)) aliasToKey.set(a, primary);
    }
  }

  // 1) Filter pokedex to Gen 1–5 and strip fairy
  const outDex = {};
  let keptDex = 0, droppedDex = 0;

  for (const [key, mon] of Object.entries(pokedex)) {
    const dex = Number(mon.dex || 0);
    if (!Number.isFinite(dex) || dex <= 0 || dex > DEX_CAP) { droppedDex++; continue; }

    outDex[key] = { ...mon, types: stripFairy(mon.types || []) };
    keptDex++;
  }

  // 2) Filter locations to only kept species & allowed regions
  const locDb = readJSON(LOCS); // { speciesKey: { locations:[...], catchRates:{} }, ... }
  const outLoc = {};

  let totalSpecies = 0, keptSpecies = 0, unmatched = 0;
  let totalRows = 0, keptRows = 0, droppedByRegion = 0;

  const unmatchedSamples = [];

  for (const [rawKey, payload] of Object.entries(locDb)) {
    totalSpecies++;
    const nk = normKey(rawKey);
    const primaryKey = aliasToKey.get(nk);

    if (!primaryKey) {
      unmatched++;
      if (unmatchedSamples.length < 20) unmatchedSamples.push(rawKey);
      continue;
    }

    // Check if this species is within Gen 1–5 (by dex in outDex)
    const mon = outDex[primaryKey];
    if (!mon) {
      // species exists but beyond dex cap or filtered -> skip
      continue;
    }

    const rows = Array.isArray(payload.locations) ? payload.locations : [];
    totalRows += rows.length;

    const filteredRows = rows.filter(r => {
      const region = String(r.region || '').toLowerCase().trim();
      if (!region) return true; // keep if region missing
      if (REGIONS_ALLOWED.has(region)) return true;
      droppedByRegion++;
      return false;
    });

    outLoc[primaryKey] = {
      ...payload,
      locations: filteredRows
    };

    keptRows += filteredRows.length;
    keptSpecies++;
  }

  writeJSON(OUT_POKEDEX, outDex);
  writeJSON(OUT_LOCS, outLoc);

  console.log('=== strip-to-gen1to5 (safe) ===');
  console.log('Pokedex: kept', keptDex, 'dropped', droppedDex, '->', OUT_POKEDEX);
  console.log('Locations species: kept', keptSpecies, 'of', totalSpecies, '| unmatched', unmatched, '->', OUT_LOCS);
  console.log('Location rows: kept', keptRows, 'of', totalRows, '| dropped by region', droppedByRegion);
  if (unmatchedSamples.length) {
    console.log('Unmatched sample keys:', unmatchedSamples.join(', '));
  }

  console.log('\nNext steps:');
  console.log('- Verify the new files look correct.');
  console.log('- Swap them in by renaming:');
  console.log(`  mv ${OUT_POKEDEX} src/pokedex.json`);
  console.log(`  mv ${OUT_LOCS} public/data/pokemmo_locations.json`);
})();
