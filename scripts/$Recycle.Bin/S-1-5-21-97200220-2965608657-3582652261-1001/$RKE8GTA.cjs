// tools/strip-to-gen1to5.cjs
// Filters the app's data to Gen 1–5 only and removes 'fairy' type globally.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DEX_CAP = 649;
const OUT_INDENT = 2;

const POKEDEX = path.join(ROOT, 'src', 'pokedex.json');
const LOCS    = path.join(ROOT, 'public', 'data', 'pokemmo_locations.json');

const REGIONS_ALLOWED = new Set(['kanto', 'johto', 'hoenn', 'sinnoh', 'unova']);

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, OUT_INDENT));
}

(function main () {
  if (!fs.existsSync(POKEDEX)) {
    console.error('ERROR: Missing', POKEDEX); process.exit(1);
  }
  if (!fs.existsSync(LOCS)) {
    console.error('ERROR: Missing', LOCS); process.exit(1);
  }

  const pokedex = readJSON(POKEDEX); // { bulbasaur: { name, dex, types, ... }, ... }
  const outDex  = {};
  const keepSet = new Set();

  // 1) Keep only dex <= 649 and strip 'fairy' from types
  for (const [key, mon] of Object.entries(pokedex)) {
    const dex = Number(mon.dex || 0);
    if (!Number.isFinite(dex) || dex <= 0) continue;
    if (dex > DEX_CAP) continue;

    const cleanTypes = (Array.isArray(mon.types) ? mon.types : [])
      .filter(t => String(t).toLowerCase() !== 'fairy');

    outDex[key] = { ...mon, types: cleanTypes };
    keepSet.add(key.toLowerCase());
  }

  // 2) Filter locations to the kept species and trim rows by region
  const locDb = readJSON(LOCS); // { speciesKey: { locations:[...], catchRates:{} }, ... }
  const outLoc = {};
  for (const [k, v] of Object.entries(locDb)) {
    if (!keepSet.has(String(k).toLowerCase())) continue;

    const filteredRows = (v.locations || []).filter(row => {
      const r = String(row.region || '').toLowerCase();
      return REGIONS_ALLOWED.has(r);
    });

    outLoc[k] = {
      ...v,
      locations: filteredRows,
      // keep catchRates if present; Fairy removal doesn’t affect ball math
    };
  }

  writeJSON(POKEDEX, outDex);
  writeJSON(LOCS, outLoc);

  console.log('Done:');
  console.log(' - Wrote filtered pokedex ->', POKEDEX, `(kept ${Object.keys(outDex).length} species)`);
  console.log(' - Wrote filtered locations ->', LOCS, `(kept ${Object.keys(outLoc).length} species)`);
})();
