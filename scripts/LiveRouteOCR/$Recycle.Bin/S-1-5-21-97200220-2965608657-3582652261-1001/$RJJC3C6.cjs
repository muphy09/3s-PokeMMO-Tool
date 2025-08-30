/**
 * Enrich src/pokedex.json (Gen 1–5) by adding missing slug + types from PokeAPI.
 * Safe, resumable (uses .cache/pokeapi/{dex}.json).
 * Usage:
 *   node tools/enrich-pokedex-from-pokeapi.cjs            # defaults 1..649
 *   node tools/enrich-pokedex-from-pokeapi.cjs --from=1 --to=649
 */

const fs = require('fs');
const path = require('path');
const { setTimeout: sleep } = require('timers/promises');

const POKEDEX_PATH = path.resolve(__dirname, '../src/pokedex.json');
const BACKUP_PATH  = path.resolve(__dirname, '../src/pokedex.bak.json');
const CACHE_DIR    = path.resolve(__dirname, '../.cache/pokeapi');

const ARGV = Object.fromEntries(process.argv.slice(2).map(kv => {
  const m = kv.match(/^--([^=]+)=(.+)$/);
  return m ? [m[1], m[2]] : [kv.replace(/^--/,''), true];
}));

const FROM = Number(ARGV.from ?? 1);
const TO   = Number(ARGV.to ?? 649);

// TitleCase map for types (PokeAPI gives lowercase)
function prettyType(t) {
  const m = {
    normal:'Normal', fire:'Fire', water:'Water', electric:'Electric', grass:'Grass', ice:'Ice',
    fighting:'Fighting', poison:'Poison', ground:'Ground', flying:'Flying', psychic:'Psychic',
    bug:'Bug', rock:'Rock', ghost:'Ghost', dragon:'Dragon', dark:'Dark', steel:'Steel',
    fairy:'Fairy'
  };
  return m[t] ?? (t.charAt(0).toUpperCase() + t.slice(1));
}

function toSlug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

async function getPokemonDex(dex) {
  const f = path.join(CACHE_DIR, `${dex}.json`);
  if (fs.existsSync(f)) {
    return JSON.parse(fs.readFileSync(f,'utf8'));
  }
  const url = `https://pokeapi.co/api/v2/pokemon/${dex}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'pokemmo-tool/1.0' }});
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  const json = await res.json();
  fs.writeFileSync(f, JSON.stringify(json), 'utf8');
  await sleep(150); // gentle rate-limit
  return json;
}

function backupOnce() {
  if (!fs.existsSync(BACKUP_PATH)) {
    fs.copyFileSync(POKEDEX_PATH, BACKUP_PATH);
    console.log(`Backup written -> ${path.relative(process.cwd(), BACKUP_PATH)}`);
  }
}

(async () => {
  if (!fs.existsSync(POKEDEX_PATH)) {
    console.error('ERROR: src/pokedex.json not found');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(POKEDEX_PATH,'utf8'));
  if (!Array.isArray(raw)) {
    console.error('ERROR: pokedex.json expected to be an array of {dex,name,...}');
    process.exit(1);
  }

  ensureDir(CACHE_DIR);
  backupOnce();

  // Index by dex
  const byDex = new Map();
  raw.forEach(p => {
    const dex = Number(p.dex ?? p.id ?? p.number ?? 0);
    if (dex >= FROM && dex <= TO && dex > 0) {
      byDex.set(dex, p);
    }
  });

  console.log(`Enriching ${byDex.size} entries (dex ${FROM}..${TO})`);

  let updated = 0;
  for (const dex of [...byDex.keys()].sort((a,b)=>a-b)) {
    const entry = byDex.get(dex);
    const name  = entry.name ?? '';
    try {
      const poke = await getPokemonDex(dex);
      const types = poke.types
        .sort((a,b)=>a.slot-b.slot)
        .map(t => prettyType(t.type.name));

      const slug = entry.slug ?? (name ? toSlug(name) : null);
      const next = {
        dex,
        name,
        slug,
        types
      };

      // Merge back into the original array element
      const idx = raw.findIndex(p => Number(p.dex ?? p.id ?? p.number ?? 0) === dex);
      raw[idx] = next;
      updated++;
      if (updated % 25 === 0) {
        console.log(`..${updated} updated (latest dex ${dex})`);
        fs.writeFileSync(POKEDEX_PATH, JSON.stringify(raw, null, 2) + '\n', 'utf8');
      }
    } catch (err) {
      console.warn(`WARN dex ${dex} (${name}): ${err.message}`);
    }
  }

  // Final write
  raw.sort((a,b)=>Number(a.dex)-Number(b.dex));
  fs.writeFileSync(POKEDEX_PATH, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  console.log(`Done. Updated ${updated} entries -> ${path.relative(process.cwd(), POKEDEX_PATH)}`);
})();
