const fs = require('fs');
const path = require('path');

function normalizeKey(s='') {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim();
}
function titleCase(s='') {
  return String(s).split(' ').map(w => (w? w[0].toUpperCase()+w.slice(1).toLowerCase():w)).join(' ');
}

const root = path.resolve(__dirname, '..');
const movesetPath = path.join(root, 'pokemon_moveset_data.json');
const locationsPath = path.join(root, 'public', 'data', 'pokemmo_locations.json');
const dexListPath = path.join(root, 'public', 'data', 'gen1to5_full_list.json');

const movesetData = JSON.parse(fs.readFileSync(movesetPath, 'utf8'));
const locData = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
const dexList = JSON.parse(fs.readFileSync(dexListPath, 'utf8'));

const dexByName = {};
for (const { dex, name } of dexList) {
  dexByName[normalizeKey(name)] = dex;
}

const keyByName = {};
for (const key of Object.keys(movesetData)) {
  const m = key.match(/^(\d+)\s+([^()]+)/);
  if (!m) continue;
  const name = m[2].trim();
  keyByName[normalizeKey(name)] = key;
}

for (const [slug, info] of Object.entries(locData)) {
  const name = info.pokedex || slug;
  const norm = normalizeKey(name);
  let key = keyByName[norm];
  if (!key) {
    const dex = dexByName[norm];
    if (dex == null) continue; // skip if dex unknown
    key = `${dex}  ${name} (Unknown)`;
    movesetData[key] = { start: [], lv: [], tutor: [], "tm/hm": [], egg: [], whereToFind: {} };
    keyByName[norm] = key;
  }
  const where = movesetData[key].whereToFind || {};
  for (const loc of info.locations || []) {
    const region = titleCase(loc.region || 'Unknown');
    if (!where[region]) where[region] = [];
    const entry = {};
    if (loc.method) entry.Type = loc.method;
    if (loc.map) entry.Location = loc.map;
    if (loc.rarity) entry.Rarity = loc.rarity;
    const list = where[region];
    const exists = list.some(e => e.Type === entry.Type && e.Location === entry.Location && e.Rarity === entry.Rarity);
    if (!exists) list.push(entry);
  }
  movesetData[key].whereToFind = where;
}

fs.writeFileSync(movesetPath, JSON.stringify(movesetData, null, 4));
