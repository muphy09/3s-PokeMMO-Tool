// tools/strip-to-gen1to5_fixed.cjs
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const POKEDEX_PATH = path.join(ROOT, 'src', 'pokedex.json');
const LOCATIONS_PATH = path.join(ROOT, 'public', 'data', 'pokemmo_locations.json');

const OUT_POKEDEX = path.join(ROOT, 'src', 'pokedex.gen1to5.json');
const OUT_LOCATIONS = path.join(ROOT, 'public', 'data', 'pokemmo_locations.gen1to5.json');

const DEX_CAP = 649;

function readJson(fp) {
  if (!fs.existsSync(fp)) {
    throw new Error(`Missing file: ${fp}`);
  }
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function writeJson(fp, obj) {
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function toSlug(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function getDexNumber(p) {
  // tolerate different shapes: id | dex | nationalDex
  if (typeof p.id === 'number') return p.id;
  if (typeof p.dex === 'number') return p.dex;
  if (typeof p.nationalDex === 'number') return p.nationalDex;
  return undefined;
}

function isGen1to5(p) {
  // Prefer natdex cap; fallback to explicit gen field if present
  const n = getDexNumber(p);
  if (typeof n === 'number') return n >= 1 && n <= DEX_CAP;
  if (typeof p.gen === 'number') return p.gen >= 1 && p.gen <= 5;
  // default: exclude if we can't determine
  return false;
}

function stripFairy(types) {
  if (!Array.isArray(types)) return types;
  return types.filter(t => String(t).toLowerCase() !== 'fairy');
}

function main() {
  console.log('=== strip-to-gen1to5 (SAFE) ===');

  // 1) Pokedex
  const pokedex = readJson(POKEDEX_PATH);
  if (!Array.isArray(pokedex)) {
    throw new Error(`Expected array in ${POKEDEX_PATH}`);
  }

  const keptDex = [];
  const keptBySlug = new Map();

  const filteredDex = pokedex
    .filter(isGen1to5)
    .map(p => {
      const copy = { ...p };
      if (copy.types) copy.types = stripFairy(copy.types);
      // normalize slug if needed
      const slug = copy.slug ? toSlug(copy.slug) : toSlug(copy.name || copy.species);
      copy.slug = slug;
      keptDex.push(slug);
      keptBySlug.set(slug, true);
      return copy;
    });

  console.log(`Pokedex: kept ${filteredDex.length} of ${pokedex.length}`);

  // 2) Locations
  const locDb = readJson(LOCATIONS_PATH);
  if (Array.isArray(locDb)) {
    throw new Error(
      `Expected per-species map in ${LOCATIONS_PATH}, but found an array.\n` +
      `Please ensure you're using the cleaned file (keys are species slugs, values have { locations: [...] }).`
    );
  }
  if (typeof locDb !== 'object' || !locDb) {
    throw new Error(`Expected object in ${LOCATIONS_PATH}`);
  }

  const outLoc = {};
  let keptSpecies = 0;
  let droppedSpecies = 0;

  for (const [key, val] of Object.entries(locDb)) {
    const slug = toSlug(key);
    if (keptBySlug.has(slug)) {
      // keep species; pass through locations as-is (already cleaned)
      const safe = {
        ...val,
        locations: Array.isArray(val.locations) ? val.locations : [],
        catchRates: typeof val.catchRates === 'object' && val.catchRates !== null ? val.catchRates : {},
      };
      outLoc[slug] = safe;
      keptSpecies++;
    } else {
      droppedSpecies++;
    }
  }

  console.log(`Locations species kept: ${keptSpecies} | dropped: ${droppedSpecies}`);

  // 3) Write new files (and backups)
  const dexBak = POKEDEX_PATH + '.bak_before_gen1to5';
  const locBak = LOCATIONS_PATH + '.bak_before_gen1to5';
  if (!fs.existsSync(dexBak)) fs.copyFileSync(POKEDEX_PATH, dexBak);
  if (!fs.existsSync(locBak)) fs.copyFileSync(LOCATIONS_PATH, locBak);

  writeJson(OUT_POKEDEX, filteredDex);
  writeJson(OUT_LOCATIONS, outLoc);

  console.log('\nNext steps:');
  console.log(`  mv "${OUT_POKEDEX}" "${POKEDEX_PATH}"`);
  console.log(`  mv "${OUT_LOCATIONS}" "${LOCATIONS_PATH}"`);
  console.log('\nDone.');
}

try {
  main();
} catch (e) {
  console.error('\nERROR:', e.message);
  process.exit(1);
}
