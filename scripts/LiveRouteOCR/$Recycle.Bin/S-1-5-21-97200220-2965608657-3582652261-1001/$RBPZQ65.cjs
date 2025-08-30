// tools/ingest_locations_from_region_txt.cjs
// Ingest forum-style region TXT files (per-location encounter lists) -> per-Pokémon locations JSON
// Adds explicit horde flags: horde, hordeFromEntry, hordeOnly, groupSize.
//
// Input dir: tools/data/regions/*.txt (Kanto/Sinnoh/etc.)
// Roster:     public/data/gen1to5_full_list.json
// Output:     public/data/pokemmo_locations.json
//
// Run:
//   node tools/ingest_locations_from_region_txt.cjs
//
// Options:
//   --in <dir>     default tools/data/regions
//   --roster <f>   default public/data/gen1to5_full_list.json
//   --out <f>      default public/data/pokemmo_locations.json

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
function argVal(flag, def){ const i=argv.indexOf(flag); return i>=0 ? argv[i+1] : def; }

const IN_DIR = path.resolve(argVal('--in', 'tools/data/regions'));
const ROSTER_FILE = path.resolve(argVal('--roster', 'public/data/gen1to5_full_list.json'));
const OUT_FILE = path.resolve(argVal('--out', 'public/data/pokemmo_locations.json'));

const norm = (s)=> (s==null?'':String(s)).replace(/\r/g,'').trim();
const low  = (s)=> norm(s).toLowerCase();
const title = (s)=> norm(s).replace(/\s+/g,' ')
  .toLowerCase()
  .replace(/\b\w/g, m=>m.toUpperCase());

// Normalize Pokémon names for keys; add aliases as needed
const NAME_ALIASES = new Map([
  ['nidoran♂','nidoran-m'], ['nidoran male','nidoran-m'], ['nidoran-male','nidoran-m'],
  ['nidoran♀','nidoran-f'], ['nidoran female','nidoran-f'], ['nidoran-female','nidoran-f'],
  ['farfetch’d','farfetchd'], ['farfetch’d.','farfetchd'], ["farfetch'd",'farfetchd'],
  ['mr. mime','mr-mime'], ['mr mime','mr-mime'],
  ['mime jr.','mime-jr'], ['mime jr','mime-jr'],
  ['ho-oh','ho-oh'], ['porygon-z','porygon-z'],
]);

function canonicalName(s){
  let x = low(s)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'') // accents
    .replace(/[’‘“”'`]/g,'')  // quotes
    .replace(/\./g,'')        // dots
    .replace(/\s+/g,' ')      // collapse spaces
    .trim();
  if (NAME_ALIASES.has(x)) return NAME_ALIASES.get(x);
  return x.replace(/[:]/g,'-').replace(/\s/g,'-'); // unify separators
}

// Remove forum cruft/emojis/image fragments/credits from a line
function cleanLine(line){
  let s = norm(line);

  // toss whole-line credits / thanks / sources
  if (/^\s*(credit|credits|thanks?|source)\b/i.test(s)) return '';

  // strip leftover image names or emoji pngs
  s = s.replace(/\b[\w-]+\.(png|jpg|jpeg|gif)\b/ig, '');
  // strip :emoji: tokens and basic emoji ranges
  s = s.replace(/:[a-z0-9_+\-]+:/ig, '');
  s = s.replace(/[\u2600-\u27BF]/g, '');
  s = s.replace(/[\u{1F300}-\u{1FAFF}]/ug, '');

  // collapse extra spaces / empty brackets
  s = s.replace(/\s{2,}/g,' ').replace(/\[\s*\]/g,'').trim();
  return s;
}

// Heuristics: identify a location header line (e.g., "Route 201", "Lake Verity")
function isLocationHeader(line){
  if (!line || line.includes(':')) return false; // method lines have ':'
  if (/^\s*(info|notes?|tip)\b/i.test(line)) return false;
  return /\b(route|city|town|forest|cave|lake|tower|island|road|mount|mt\.?|desert|ruins|bridge|plains|safari|park|national|power|mansion|dept|gym|sea|bay|beach|victory|league|e4|pokemon league)\b/i.test(line)
      || /^[A-Z][a-z].+/.test(line);
}

// normalize a method string and detect horde-ness from the method label itself
function normalizeMethodAndHorde(s){
  const raw = s || '';
  const x = low(raw).replace(/\s+/g,' ').trim();

  let isHorde = /\bhorde\b/.test(x); // "Horde", "Horde in Grass", etc.
  let method = raw;

  if (x.includes('lure') && x.includes('grass')) method = 'Lure';
  else if (x.includes('grass')) method = 'Grass';
  else if (x.includes('surf') || x.includes('water')) method = 'Water';
  else if (x.includes('cave')) method = 'Cave';
  else if (x.includes('rock smash') || x === 'rocks') method = 'Rock Smash';
  else if (x.includes('old rod')) method = 'Old Rod';
  else if (x.includes('good rod')) method = 'Good Rod';
  else if (x.includes('super rod')) method = 'Super Rod';
  else if (x.includes('fishing')) method = 'Fishing';
  else if (x.includes('honey')) method = 'Honey';
  else if (x.includes('swarm')) method = 'Swarm';
  else method = title(raw);

  return { method, isHordeFromMethod: isHorde };
}

// rarity normalization (light)
function normalizeRarity(s){
  const x = low(s);
  if (/very\s*rare|1%/.test(x)) return 'Very Rare';
  if (/rare|5%/.test(x)) return 'Rare';
  if (/uncommon|10%|15%/.test(x)) return 'Uncommon';
  if (/common|20%|30%|40%|50%/.test(x)) return 'Common';
  return s.trim();
}

// Parse one Pokémon item from a method list piece
function parsePokemonEntry(raw){
  // Example: "Starly (Very Common, (Horde) Morning) [Item: Yache Berry] x5"
  //          "Zubat (Horde Only, Common) ×5"
  let s = cleanLine(raw);
  if (!s) return null;

  // Extract [Item: ...] blocks (can be multiple)
  const items = [];
  s = s.replace(/\[ *item: *([^\]]+)\]/ig, (_,p1)=>{
    const val = p1.split(',').map(t=>t.trim()).filter(Boolean);
    items.push(...val);
    return '';
  });

  // Horde group size hints: "x5", "5x", "×5"
  let groupSize = null;
  const gs = s.match(/(?:^|\s)(?:x|×)\s*([2-6])\b|(?:^|\s)([2-6])\s*(?:x|×)\b/i);
  if (gs){
    groupSize = parseInt(gs[1] || gs[2], 10);
    s = s.replace(gs[0], '').trim();
  }

  // Name + optional parentheses
  const m = s.match(/^\s*([^\(]+?)(?:\(([^)]+)\))?\s*$/);
  const nameOnly = s.replace(/[,;]+$/,'').trim();
  if (!m){
    if (!nameOnly) return null;
    return { name: nameOnly, rarity: '', items, hordeFromEntry:false, hordeOnly:false, groupSize };
  }
  const name = m[1].replace(/[,;]+$/,'').trim();
  const info = (m[2]||'').trim();

  // From the parentheses, detect horde flags and rarity words
  let hordeFromEntry = false;
  let hordeOnly = false;
  let rarityText = info;

  if (info){
    // flags
    if (/\bhorde only\b/i.test(info)) { hordeFromEntry = true; hordeOnly = true; }
    else if (/\bhorde\b/i.test(info)) { hordeFromEntry = true; }
    // remove explicit "horde" tokens from rarity chunk
    rarityText = info.replace(/\b(?:horde only|horde)\b/ig, '').replace(/\s{2,}/g,' ').trim().replace(/^[,;]\s*/,'').replace(/[,;]\s*$/,'');
  }

  const rarity = rarityText ? normalizeRarity(rarityText) : '';

  return { name, rarity, items, hordeFromEntry, hordeOnly, groupSize };
}

function parseRegionFile(text, regionName){
  const lines = norm(text).split('\n').map(cleanLine).filter(Boolean);

  const results = []; // {pokemon, region, map, method, rarity, items[], horde flags}
  let currentMap = null;

  for (let i=0; i<lines.length; i++){
    const line = lines[i];

    // LOCATION HEADER?
    if (isLocationHeader(line)) {
      currentMap = title(line);
      continue;
    }

    // METHOD LINE? (e.g., "Grass: Pidgey (Common), Rattata (Horde Only)")
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && currentMap){
      const left = title(line.slice(0, colonIdx));
      const { method, isHordeFromMethod } = normalizeMethodAndHorde(left);
      const right = line.slice(colonIdx+1).trim();

      // split right side by commas BUT keep ( ... ) groups intact
      const parts = [];
      let buf = '', depth=0;
      for (const ch of right){
        if (ch === '(') depth++;
        if (ch === ')') depth = Math.max(0, depth-1);
        if (ch === ',' && depth===0){ parts.push(buf); buf=''; }
        else { buf += ch; }
      }
      if (buf.trim()) parts.push(buf);

      for (let raw of parts){
        raw = raw.trim().replace(/^[-–•\*]+\s*/,''); // drop bullets
        if (!raw) continue;

        const e = parsePokemonEntry(raw);
        if (!e) continue;

        results.push({
          pokemonName: e.name.trim(),
          region: title(regionName),
          map: currentMap,
          method,                             // canonical method
          rarity: e.rarity,
          items: e.items,
          horde: !!isHordeFromMethod,         // from the method label
          hordeFromEntry: !!e.hordeFromEntry, // from the entry parentheses
          hordeOnly: !!e.hordeOnly,
          groupSize: e.groupSize || (isHordeFromMethod ? 5 : null) // default 5 if method implies hordes
        });
      }
      continue;
    }

    // otherwise ignore
  }

  return results;
}

function loadRoster(){
  const arr = JSON.parse(fs.readFileSync(ROSTER_FILE,'utf8'));
  const byCanon = new Map();
  for (const r of arr){
    byCanon.set(canonicalName(r.name), { name: r.name, dex: r.dex });
  }
  return byCanon;
}

(async function main(){
  if (!fs.existsSync(IN_DIR)) {
    console.error(`[ERR] Input dir not found: ${IN_DIR}`);
    process.exit(1);
  }
  if (!fs.existsSync(ROSTER_FILE)) {
    console.error(`[ERR] Roster file not found: ${ROSTER_FILE}`);
    process.exit(1);
  }

  const roster = loadRoster();
  const files = fs.readdirSync(IN_DIR).filter(f=>/\.txt$/i.test(f));
  if (!files.length){
    console.warn(`[WARN] No .txt files in ${IN_DIR}`);
    process.exit(0);
  }

  const merged = {}; // key -> { locations:[], catchRates:{} }
  let totalRows = 0;

  for (const fname of files){
    const fpath = path.join(IN_DIR, fname);
    const regionName = title(path.basename(fname, path.extname(fname))); // Kanto/Sinnoh/etc.
    const text = fs.readFileSync(fpath,'utf8');

    const rows = parseRegionFile(text, regionName);
    totalRows += rows.length;

    for (const r of rows){
      const canonKey = canonicalName(r.pokemonName);
      const rosterHit = roster.get(canonKey);
      const key = rosterHit ? canonicalName(rosterHit.name) : canonKey;

      if (!merged[key]) merged[key] = { locations: [], catchRates: {} };

      const loc = {
        region: r.region,
        map: r.map,
        method: r.method,
        rarity: r.rarity,
        type: r.method,          // keep a copy in "type" for app schema
        level: ''
      };

      // Optional extras (only include if present/true)
      if (r.items && r.items.length) loc.items = r.items;
      if (r.horde) loc.horde = true;
      if (r.hordeFromEntry) loc.hordeFromEntry = true;
      if (r.hordeOnly) loc.hordeOnly = true;
      if (r.groupSize) loc.groupSize = r.groupSize;

      merged[key].locations.push(loc);
    }

    console.log(`[ok] ${fname} -> ${rows.length} entries`);
  }

  // Ensure EVERY Gen 1–5 Pokémon is present (empty if no locations)
  for (const [canon, info] of roster.entries()){
    const key = canonicalName(info.name);
    if (!merged[key]) merged[key] = { locations: [], catchRates: {} };
  }

  // Sort locations per mon for determinism
  for (const k of Object.keys(merged)){
    merged[k].locations.sort((a,b)=>
      (a.region||'').localeCompare(b.region||'')
      || (a.map||'').localeCompare(b.map||'')
      || (a.method||'').localeCompare(b.method||'')
    );
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(merged, null, 2));
  console.log(`[DONE] wrote ${Object.keys(merged).length} Pokémon to ${OUT_FILE} (rows parsed=${totalRows})`);
})();
