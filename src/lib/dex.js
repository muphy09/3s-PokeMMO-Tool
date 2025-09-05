// Shared Pokédex builder used by Pokémon Search and Team Builder
// Mirrors the adapter logic in src/App.jsx to keep shapes identical.

import dexRaw from '../../UpdatedDex.json';

function normalizeKey(s=''){
  return String(s).toLowerCase().normalize('NFKD')
    .replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim();
}
function normalizeType(t){ return String(t||'').toLowerCase().trim(); }

// Build lookups to help resolve form data and skip standalone form entries
const RAW_DEX_BY_ID = new Map(dexRaw.map(m => [m.id, m]));
const FORM_IDS = new Set();
for (const mon of dexRaw) {
  if (!Array.isArray(mon.forms)) continue;
  for (const f of mon.forms) {
    if (typeof f.id === 'number' && f.id !== mon.id) {
      FORM_IDS.add(f.id);
    }
  }
}

function toLegacyShape(m){
  const types = Array.isArray(m.types) ? [...new Set(m.types.map(normalizeType))] : [];
  return {
    id: m.id,
    name: m.name,
    slug: m.slug || normalizeKey(m.name),
    types,
    expType: m.exp_type,
    obtainable: m.obtainable,
    genderRatio: m.gender_ratio,
    height: m.height,
    weight: m.weight,
    eggGroups: m.egg_groups || [],
    abilities: m.abilities || [],
    forms: [],
    evolutions: m.evolutions || [],
    moves: m.moves || [],
    stats: m.stats || {},
    yields: m.yields || {},
    heldItems: m.held_items || [],
    locations: m.locations || [],
    sprite: m.sprite ?? null,
    sprites: m.sprites ?? null,
    image: m.image ?? null,
    icon: m.icon ?? null
  };
}

const DEX_LIST = dexRaw
  .filter(m => !FORM_IDS.has(m.id))
  .map(m => {
    const base = toLegacyShape(m);
    if (Array.isArray(m.forms)) {
      base.forms = m.forms
        // Skip the base form (form_id 0 or identical name)
        .filter(f => f.form_id !== 0 && f.name !== m.name)
        .map(f => {
          const formBase = {
            ...(f.id != null ? RAW_DEX_BY_ID.get(f.id) : {}),
            ...f,
          };
          const raw = formBase.name || '';
          const bracket = raw.match(/\[(.+)\]/);
          let label = bracket ? bracket[1] : raw;
          label = label.replace(new RegExp(`\\b${m.name}\\b`, 'i'), '').trim();
          if (!label) return null;
          const name = `${m.name} (${label})`;
          const shaped = toLegacyShape({ ...formBase, name, forms: [] });
          shaped.id = null;
          return shaped;
        })
        .filter(Boolean);
    }
    return base;
  });

const DEX_BY_NAME = (() => {
  const map = new Map();
  for (const m of DEX_LIST) {
    map.set(normalizeKey(m.name), m);
    for (const f of m.forms || []) map.set(normalizeKey(f.name), f);
  }
  return map;
})();

const DEX_BY_ID = (() => {
  const map = new Map();
  for (const m of DEX_LIST) map.set(m.id, m);
  return map;
})();

function getMon(name){
  return DEX_BY_NAME.get(normalizeKey(name)) || null;
}
function getMonByDex(id){
  return DEX_BY_ID.get(Number(id)) || null;
}
function getAll(){ return DEX_LIST; }
function getByName(name){ return getMon(name); }

export { DEX_LIST, DEX_BY_NAME, DEX_BY_ID, getMon, getMonByDex, getAll, getByName };

