// tools/merge-dump.js
// Usage: node tools/merge-dump.js tools/data/pokemmohub_dump.json
import fs from 'fs';
import path from 'path';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node tools/merge-dump.js <path-to-pokemmohub_dump.json>');
  process.exit(1);
}

const OUT = path.join(process.cwd(), 'public', 'data', 'pokemmo_locations.json');
await fs.promises.mkdir(path.dirname(OUT), { recursive: true });

const take = p => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf8')) : {};
const base = take(OUT);
const dump = take(src);

function mergeEntry(cur, add) {
  const out = cur || { locations: [], catchRates: {} };

  const seen = new Set(out.locations.map(l => JSON.stringify(l)));
  for (const l of (add.locations || [])) {
    const s = JSON.stringify(l);
    if (!seen.has(s)) { out.locations.push(l); seen.add(s); }
  }
  out.catchRates = { ...out.catchRates, ...(add.catchRates || {}) };
  return out;
}

const result = { ...base };
for (const [name, data] of Object.entries(dump)) {
  const key = name.toLowerCase();
  result[key] = mergeEntry(result[key], data);
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`[merge] wrote -> ${OUT}  keys: ${Object.keys(result).length}`);
