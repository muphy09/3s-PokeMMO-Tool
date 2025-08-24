// tools/audit-locations.cjs (CommonJS version)
// Audits public/data/pokemmo_locations.json vs src/pokedex.json
// Reports empties, dupes, suspicious text, bad regions/fields.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const POKEDEX = path.join(ROOT, 'src', 'pokedex.json');
const LOCS = path.join(ROOT, 'public', 'data', 'pokemmo_locations.json');

const KNOWN_REGIONS = new Set(['kanto','johto','hoenn','sinnoh','unova']);

const SUSPICIOUS_PATTERNS = [
  /credit/i,
  /thanks/i,
  /discord/i,
  /http[s]?:\/\//i,
  /@[\w-]+/i,
  /[🧡💙💚💛💜🖤🤍✨⭐️🔥🐟🐛🐞🐾🎣🎯🎲🎁♻️]/ // common emojis that sneak in
];

function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`Failed to read ${p}:`, e.message);
    process.exit(1);
  }
}

function speciesKey(name) { return String(name || '').trim().toLowerCase(); }

function looksSuspicious(text) {
  const s = String(text || '');
  return SUSPICIOUS_PATTERNS.some(re => re.test(s));
}

function hasBadFields(loc) {
  // Minimal viable fields we want shown in UI
  const required = ['region','map','method'];
  for (const k of required) {
    if (!loc[k] || String(loc[k]).trim() === '') return true;
  }
  if (!KNOWN_REGIONS.has(String(loc.region || '').toLowerCase())) return true;
  return false;
}

(function main() {
  if (!fs.existsSync(POKEDEX)) {
    console.error('Missing src/pokedex.json');
    process.exit(1);
  }
  if (!fs.existsSync(LOCS)) {
    console.error('Missing public/data/pokemmo_locations.json');
    process.exit(1);
  }

  const pokedex = readJSON(POKEDEX); // { "bulbasaur": {...}, ...}
  const roster = Object.keys(pokedex);
  const locDb = readJSON(LOCS);      // { "bulbasaur": { locations: [...], catchRates: {} }, ...}

  const seenKeys = new Map(); // lower -> original variants
  const dupKeys = new Map();

  Object.keys(locDb).forEach(k => {
    const low = k.toLowerCase();
    if (!seenKeys.has(low)) seenKeys.set(low, new Set());
    const set = seenKeys.get(low); set.add(k);
    if (set.size > 1) dupKeys.set(low, Array.from(set));
  });

  const missing = [];
  const suspicious = [];
  const badRows = [];
  const emptyAfterClean = [];

  for (const sp of roster) {
    const entry =
      locDb[sp] ??
      locDb[speciesKey(sp)];

    if (!entry) {
      missing.push(sp);
      continue;
    }

    const list = Array.isArray(entry.locations) ? entry.locations : [];
    if (list.length === 0) {
      missing.push(sp);
      continue;
    }

    // Inspect rows
    let validCount = 0;
    let sus = 0;
    let bad = 0;

    for (const row of list) {
      const fields = Object.values(row || {}).join(' ');
      if (looksSuspicious(fields)) sus++;
      if (hasBadFields(row)) bad++;
      else validCount++;
    }

    if (sus > 0) suspicious.push({ species: sp, suspiciousRows: sus, total: list.length });
    if (bad > 0) badRows.push({ species: sp, badRows: bad, total: list.length });

    if (validCount === 0) emptyAfterClean.push(sp);
  }

  // Report
  console.log('--- Location Audit Report ---\n');

  if (dupKeys.size) {
    console.log('Duplicate species keys (case/variant):');
    for (const [low, variants] of dupKeys.entries()) {
      console.log(`  ${low}: ${variants.join(', ')}`);
    }
    console.log('');
  }

  if (missing.length) {
    console.log(`Species with NO locations (${missing.length}):`);
    console.log('  ' + missing.join(', '));
    console.log('');
  }

  if (suspicious.length) {
    console.log('Species with suspicious text in location entries:');
    suspicious.forEach(r => {
      console.log(`  ${r.species}: ${r.suspiciousRows}/${r.total} rows look suspicious`);
    });
    console.log('');
  }

  if (badRows.length) {
    console.log('Species with missing/invalid fields or unknown region:');
    badRows.forEach(r => {
      console.log(`  ${r.species}: ${r.badRows}/${r.total} rows invalid`);
    });
    console.log('');
  }

  if (emptyAfterClean.length) {
    console.log('Species that would be EMPTY after removing bad/suspicious rows:');
    console.log('  ' + emptyAfterClean.join(', '));
    console.log('');
  }

  console.log('Done.');
})();
