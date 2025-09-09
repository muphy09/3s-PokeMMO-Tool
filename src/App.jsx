import React, { useEffect, useMemo, useState, useRef } from 'react';
import './index.css';
import dexRaw from '../UpdatedDex.json';
import itemsRaw from '../itemdata.json';
import catchRates from '../data/catch-rates.json';
import VersionBadge from "./components/VersionBadge.jsx";
import OptionsMenu from './components/OptionsMenu.jsx';
import PatchNotesButton, { openPatchNotes } from './components/PatchNotesButton.jsx';
import ColorPickerButton from './components/ColorPickerButton.jsx';
import CaughtListButton from './components/CaughtListButton.jsx';
import ThemeButton from './components/ThemeButton.jsx';
import SearchFilter from './components/SearchFilter.jsx';
import HomeScreen from './components/HomeScreen.jsx';
import { ColorContext, DEFAULT_METHOD_COLORS, DEFAULT_RARITY_COLORS } from './colorConfig.js';
import { CaughtContext } from './caughtContext.js';
import BreedingSimulator from './components/BreedingSimulator.jsx';
import TeamBuilder from './components/TeamBuilder.jsx';

const TM_URL        = `${import.meta.env.BASE_URL}data/tm_locations.json`;
const APP_TITLE = "3's PokeMMO Tool";

const DEBUG_LIVE = true; // set false to silence console logs

/** Optional overrides in .env / .env.production:
 *  VITE_SPRITES_BASE=/sprites/pokeapi/
 *  VITE_SPRITES_EXT=.png
 *  VITE_SHOW_CONFIDENCE=1  // set to 0 to hide confidence
 */
const SPRITES_BASE = (import.meta.env.VITE_SPRITES_BASE || `${import.meta.env.BASE_URL}sprites/`).replace(/\/+$/, '/');
const SPRITES_EXT  = import.meta.env.VITE_SPRITES_EXT || '.png';
const ITEM_ICON_BASE = 'https://raw.githubusercontent.com/PokeMMO-Tools/pokemmo-data/main/assets/itemicons/';
const ITEM_PLACEHOLDER = `${import.meta.env.BASE_URL}no-item.svg`;

const SHOW_CONFIDENCE = (import.meta?.env?.VITE_SHOW_CONFIDENCE ?? '1') === '1';
function isOcrEnabled() {
  try { return JSON.parse(localStorage.getItem('ocrEnabled') ?? 'true'); }
  catch { return true; }
}
function formatConfidence(c){
  if (c == null || isNaN(c)) return null;
  const num = Number(c);
  const pct = num <= 1 ? Math.round(num * 100) : Math.round(num);
  // Bound 0..100
  return Math.max(0, Math.min(100, pct));
}

const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

  const ENCOUNTER_TYPES = (() => {
    const set = new Set();
    for (const mon of dexRaw) {
      for (const loc of mon.locations || []) {
        if (loc.type) set.add(cleanMethodLabel(loc.type));
        if (loc.rarity && /lure/i.test(loc.rarity)) set.add('Lure');
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  })();

/* ---------- small style helpers ---------- */
const styles = {
  segWrap: { display:'inline-flex', border:'1px solid var(--divider)', background:'var(--surface)', borderRadius:999, padding:4, gap:4 },
  segBtn(active){ return {
    appearance:'none', border:0, padding:'8px 14px', borderRadius:999, fontWeight:700, cursor:'pointer',
    transition:'all .15s ease', background: active?'var(--card)':'transparent',
    color: active?'var(--text)':'var(--muted)', boxShadow: active?'inset 0 0 0 1px var(--divider), 0 4px 18px rgba(0,0,0,.35)':'none'
  };},
  card: { padding:16, borderRadius:12, border:'1px solid var(--divider)', background:'var(--surface)' },
  areaCard: { padding:12, borderRadius:12, border:'1px solid var(--divider)', background:'var(--surface)' },
  gridCols: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:10 },
  monCard: { position:'relative', display:'flex', flexDirection:'column', alignItems:'center', gap:8, border:'1px solid var(--divider)', borderRadius:10, padding:'10px', background:'var(--surface)', textAlign:'center' },
  encWrap: {
    display:'flex',
    gap:8,
    marginTop:8,
    width:'100%',
    overflowX:'auto',
    scrollBehavior:'smooth'
  },
  encCol: { display:'flex', flexDirection:'column', alignItems:'center', gap:4 }
};

/* ---------- utils ---------- */
function titleCase(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s(-])([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
}
function normalizeKey(s=''){
  return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim();
}
function normalizeType(t){ return String(t||'').toLowerCase().trim(); }
function normalizeRegion(r=''){ return String(r||'').toLowerCase().replace(/\s+/g,'').trim(); }
const keyName = (s = "") => s.trim().toLowerCase().replace(/\s+/g, " ");

function calcCatchChance(rate, hpRatio = 1, statusMult = 1) {
  if (!rate || rate <= 0) return 0;
  const a = Math.floor((3 - 2 * hpRatio) * rate / 3);
  const aStatus = Math.floor(a * statusMult);
  const capped = Math.max(1, Math.min(255, aStatus));
  if (capped >= 255) return 1;
  const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / capped));
  return Math.pow(b / 65535, 4);
}

/* ---------- pokedex adapter ---------- */
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
        // Skip the base form (form_id 0 or identical name) and egg placeholders
        .filter(f => f.form_id !== 0 && f.name !== m.name && f.name?.toLowerCase() !== 'egg')
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
const getMon = (s) => DEX_BY_NAME.get(normalizeKey(s)) || null;

// Precompile regular expressions that can locate Pokemon names inside a block
// of text.  One regex matches names with spaces/hyphens preserved, while the
// other works against a "compacted" string with all non-alphanumeric
// characters removed.  Sorting by length ensures longer names are tested first
// which prevents partial matches (e.g. "Mr Mime" before "Mr").
const buildNameRegex = (transform) => {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = Array.from(DEX_BY_NAME.keys())
    .map(transform)
    .sort((a, b) => b.length - a.length)
    .map(escape)
    // Allow hyphens in Pokemon names to optionally appear as spaces in OCR text
    .map(n => n.replace(/\\-/g, "[\\s-]?"));
  return new RegExp(`(${names.join("|")})`, "gi");
};
const POKE_NAME_REGEX = buildNameRegex((k) => k);
const POKE_NAME_COMPACT_REGEX = buildNameRegex((k) => k.replace(/[^a-z0-9]+/g, ""));
const DEX_BY_ID = (() => {
  const map = new Map();
  for (const m of DEX_LIST) map.set(m.id, m);
  return map;
})();
const getMonByDex = (id) => DEX_BY_ID.get(Number(id)) || null;

const ITEM_LIST = (() => {
  const src = Array.isArray(itemsRaw) ? itemsRaw : [];
  const seen = new Set();
  const list = [];
  for (const item of src) {
    if (item?.id === 0) continue; // skip placeholder entry
    if (!item?.name || item.name.includes('?')) continue; // skip unknown items
    const key = normalizeKey(item.name);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(item);
  }
  return list;
})();

const ITEM_INDEX = (() => {
  const byId = new Map();
  const byName = new Map();
  for (const item of ITEM_LIST) {
    if (item.id != null) byId.set(item.id, item);
    byName.set(normalizeKey(item.name), item);
  }
  return { byId, byName };
})();

const EVO_PARENTS = (() => {
  const map = new Map();
  for (const mon of DEX_LIST) {
    for (const evo of mon.evolutions || []) {
      if (!map.has(evo.id)) map.set(evo.id, []);
      map.get(evo.id).push(mon.id);
    }
  }
  return map;
})();

function normalizeEggGroup(g=''){
  return String(g).toLowerCase().replace('warer','water').replace('hmanoid','humanoid').trim();
}

const MOVE_METHODS = [
  { key:'start', label:'Start' },
  { key:'lv', label:'Level' },
  { key:'tutor', label:'Tutor' },
  { key:'tmhm', label:'TM/HM' },
  { key:'egg', label:'Egg' }
];

function groupMoves(list = []){
  const out = { start: [], lv: [], tutor: [], tmhm: [], egg: [] };
  for (const mv of list){
    switch(mv.type){
      case 'level':
        if (mv.level <= 1) out.start.push(mv.name);
        else out.lv.push({ level: mv.level, move: mv.name });
        break;
      case 'move_tutor':
        out.tutor.push(mv.name);
        break;
      case 'move_learner_tools':
        out.tmhm.push(mv.name);
        break;
      case 'egg_moves':
        out.egg.push(mv.name);
        break;
      default:
        break;
    }
  }
  out.lv.sort((a,b) => a.level - b.level);
  return out;
}

/* ---------- sprite source helpers & component ---------- */
function localSpriteCandidates(mon){
  const id = String(mon?.id||'').trim();
  const key = normalizeKey(mon?.name||'');
  const bases = [SPRITES_BASE, `${import.meta.env.BASE_URL}sprites/`, `${import.meta.env.BASE_URL}sprites/pokeapi/`, `${import.meta.env.BASE_URL}sprites/national/`];
  const exts = [SPRITES_EXT, '.png', '.gif', '.webp'];
  const out = [];
  for (const b of bases){ for (const e of exts){ if (id) out.push(`${b}${id}${e}`); if (key) out.push(`${b}${key}${e}`); } }
  return [...new Set(out)];
}
  function spriteSources(mon){
  if (!mon) return [];
  const arr = [];

  // Prefer higher-resolution PokeAPI sprites first when we have a canonical dex number
  if (mon.dex != null) {
    arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${mon.id}.png`);
    arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${mon.id}.png`);
    }

  // Fallbacks to any provided or local sprites
  if (mon.sprite) arr.push(mon.sprite);
  if (mon.sprites?.front_default) arr.push(mon.sprites.front_default);
  if (mon.image) arr.push(mon.image);
  if (mon.icon) arr.push(mon.icon);
  arr.push(...localSpriteCandidates(mon));

  return [...new Set(arr)].filter(Boolean);
}
  // Build best-guess PokeAPI slugs for alternate forms
  function buildPokeApiSlugCandidates(mon){
    const out = [];
    const norm = (s='') => String(s).toLowerCase().normalize('NFKD')
      .replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim();
    const add = (s) => { if (s && !out.includes(s)) out.push(s); };

    if (!mon) return out;
    add(mon.slug);
    add(norm(mon.name));

    const m = String(mon.name||'').match(/^(.*?)\s*\((.+)\)\s*$/);
    if (m) {
      const base = norm(m[1]);
      const rawLabel = norm(m[2]);
      // direct join
      add(`${base}-${rawLabel}`);
      // strip common suffix words like "form/forme/style/mode/trim"
      let label = rawLabel
        .replace(/\bforms?\b/g,'')
        .replace(/\bformes?\b/g,'')
        .replace(/\bmode\b/g,'')
        .replace(/\bstyle\b/g,'')
        .replace(/\bpattern\b/g,'')
        .replace(/\bcoat\b/g,'')
        .replace(/\bcloak\b/g,'')
        .replace(/\btrim\b/g,'')
        .replace(/\bsize\b/g,'')
        .replace(/\bstandard-?mode\b/g,'standard')
        .replace(/--+/g,'-').replace(/^-|-$/g,'');
      if (label) add(`${base}-${label}`);
      // regional adjective normalization
      let label2 = label
        .replace(/\balolan\b/,'alola')
        .replace(/\bgalarian\b/,'galar')
        .replace(/\bhisuian\b/,'hisui')
        .replace(/\bpaldean\b/,'paldea')
        .replace(/\beast-sea\b/,'east')
        .replace(/\bwest-sea\b/,'west')
        .replace(/--+/g,'-').replace(/^-|-$/g,'');
      if (label2 && label2 !== label) add(`${base}-${label2}`);
      // try also slug-without -form/forme suffix
      if (mon.slug) {
        const s1 = mon.slug.replace(/-forms?\b/,'').replace(/-formes?\b/,'');
        add(s1);
      }
    }
    return out.filter(Boolean);
  }

  async function resolvePokeapiSprite(mon){
    const candidates = buildPokeApiSlugCandidates(mon);
    // Try pokemon endpoint first
    for (const slug of candidates){
      try {
        const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`);
        if (!r.ok) continue;
        const d = await r.json();
        const s = d?.sprites?.front_default || d?.sprites?.other?.["official-artwork"]?.front_default;
        if (s) return s;
      } catch {}
    }
    // Try pokemon-form endpoint as a fallback for forms that only exist there
    for (const slug of candidates){
      try {
        const r = await fetch(`https://pokeapi.co/api/v2/pokemon-form/${slug}`);
        if (!r.ok) continue;
        const d = await r.json();
        const s = d?.sprites?.front_default;
        if (s) return s;
      } catch {}
    }
    return null;
  }

  function Sprite({ mon, size=42, alt='' }){
    const srcs = React.useMemo(()=> spriteSources(mon), [mon]);
    const [idx, setIdx] = useState(0);
    const [pokeSrc, setPokeSrc] = useState(null);
    const [triedPokeApi, setTriedPokeApi] = useState(false);
    useEffect(()=>{
      setIdx(0); setPokeSrc(null); setTriedPokeApi(false);
      // Proactively resolve sprites for entries without a canonical dex/id (alt forms)
      const noDex = mon && (mon.dex == null && mon.id == null);
      if (noDex) {
        setTriedPokeApi(true);
        resolvePokeapiSprite(mon).then((s) => { if (s) setPokeSrc(s); }).catch(()=>{});
      }
    }, [mon]);
    const src = pokeSrc || srcs[idx] || TRANSPARENT_PNG;

    const handleError = () => {
      if (idx < srcs.length - 1) {
        setIdx(idx + 1);
      } else if (!triedPokeApi && mon) {
        setTriedPokeApi(true);
        resolvePokeapiSprite(mon).then((s) => { if (s) setPokeSrc(s); }).catch(()=>{});
      }
    };

  return (
    <img
      src={src}
      alt={alt || mon?.name || ''}
      style={{ width:size, height:size, objectFit:'contain', imageRendering:'pixelated' }}
      onError={handleError}
    />
  );
  }

/* ---------- Type colors (Gen 1â€“5) ---------- */
const TYPE_COLORS = {
  normal:'#A8A77A', fire:'#EE8130', water:'#6390F0', electric:'#F7D02C',
  grass:'#7AC74C', ice:'#96D9D6', fighting:'#C22E28', poison:'#A33EA1',
  ground:'#E2BF65', flying:'#A98FF3', psychic:'#F95587', bug:'#A6B91A',
  rock:'#B6A136', ghost:'#735797', dragon:'#6F35FC', dark:'#705746',
  steel:'#B7B7CE'
};
function TypePill({ t, compact=false, large=false, onClick }){
  const key = normalizeType(t);
  if (!key) return null;
  const bg = TYPE_COLORS[key] || '#555';
  const pad = compact ? '2px 8px' : large ? '6px 12px' : '4px 10px';
  const fontSize = compact ? 12 : large ? 15 : 13;
  return (
    <span
      onClick={onClick}
      title={onClick ? 'Filter by Type' : titleCase(key)}
      style={{
        display:'inline-block', padding:pad, fontSize, lineHeight:1,
        borderRadius:999, fontWeight:800, color:'#111', background:bg, border:'1px solid #00000022', textShadow:'0 1px 0 #ffffff55',
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none'
      }}
    >{titleCase(key)}</span>
  );
}

const EGG_GROUP_COLORS = {
  monster:'#A8A77A', plant:'#7AC74C', dragon:'#6F35FC', bug:'#A6B91A',
  flying:'#A98FF3', field:'#E2BF65', fairy:'#F95587', 'water a':'#6390F0',
  'water b':'#4C7CF0', 'water c':'#1D7BF4', chaos:'#705746', humanoid:'#C22E28',
  hmanoid:'#C22E28', ditto:'#F7D02C', mineral:'#B7B7CE', 'cannot breed':'#616161',
  genderless:'#616161'
};
function EggGroupPill({ group, onClick }){
  const key = normalizeEggGroup(group);
  if (!key) return null;
  const bg = EGG_GROUP_COLORS[key] || '#555';
  return (
    <span
      onClick={onClick}
      title={onClick ? 'Filter by Egg Group' : undefined}
      style={{
        display:'inline-block', padding:'4px 10px', fontSize:13, lineHeight:1,
        borderRadius:999, fontWeight:800, color:'#111', background:bg,
        border:'1px solid #00000022', cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none'
      }}
    >{titleCase(key)}</span>
  );
}

const abilityCache = new Map();
function useAbilityDesc(name){
  const slug = normalizeKey(name);
  const [desc, setDesc] = useState(abilityCache.get(slug) || '');
  useEffect(() => {
    if (!slug || abilityCache.has(slug)) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`https://pokeapi.co/api/v2/ability/${slug}`);
        const json = await res.json();
        const entry = (json.effect_entries || []).find(e => e.language?.name === 'en');
        const d = entry?.short_effect || entry?.effect || '';
        abilityCache.set(slug, d);
        if (alive) setDesc(d);
      } catch (e) {
        if (alive) setDesc('');
      }
    })();
    return () => { alive = false; };
  }, [slug]);
  return desc;
}

function AbilityPill({ label, name, compact = false }){
  if (!name) return null;
  const desc = useAbilityDesc(name);
  // Unified ability text size; overflow handled with ellipsis
  const fontPx = 13;
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:6,
      padding: compact ? '2px 6px' : '4px 8px',
      borderRadius:8,
      background:'var(--surface)',
      border:'1px solid var(--divider)',
      minWidth: 0
    }}>
      <span className="label-muted" style={{ fontSize: compact ? 11 : 12 }}>{label}</span>
      <span
        style={{
          fontWeight:600,
          color:'var(--accent)',
          whiteSpace:'nowrap',
          overflow:'hidden',
          textOverflow:'ellipsis',
          display:'inline-block',
          minWidth: 0,
          maxWidth: '100%',
          fontSize: fontPx
        }}
        title={desc || titleCase(name)}
      >{titleCase(name)}</span>
    </div>
  );
}

// ---------- Nature data (PokeAPI) ----------
const NATURE_CACHE_KEY = 'nature-list-v1';
const STATIC_NATURES = [
  { name: 'Hardy' },
  { name: 'Lonely', inc: 'attack', dec: 'defense' },
  { name: 'Brave', inc: 'attack', dec: 'speed' },
  { name: 'Adamant', inc: 'attack', dec: 'special-attack' },
  { name: 'Naughty', inc: 'attack', dec: 'special-defense' },
  { name: 'Bold', inc: 'defense', dec: 'attack' },
  { name: 'Docile' },
  { name: 'Relaxed', inc: 'defense', dec: 'speed' },
  { name: 'Impish', inc: 'defense', dec: 'special-attack' },
  { name: 'Lax', inc: 'defense', dec: 'special-defense' },
  { name: 'Timid', inc: 'speed', dec: 'attack' },
  { name: 'Hasty', inc: 'speed', dec: 'defense' },
  { name: 'Serious' },
  { name: 'Jolly', inc: 'speed', dec: 'special-attack' },
  { name: 'Naive', inc: 'speed', dec: 'special-defense' },
  { name: 'Modest', inc: 'special-attack', dec: 'attack' },
  { name: 'Mild', inc: 'special-attack', dec: 'defense' },
  { name: 'Quiet', inc: 'special-attack', dec: 'speed' },
  { name: 'Bashful' },
  { name: 'Rash', inc: 'special-attack', dec: 'special-defense' },
  { name: 'Calm', inc: 'special-defense', dec: 'attack' },
  { name: 'Gentle', inc: 'special-defense', dec: 'defense' },
  { name: 'Sassy', inc: 'special-defense', dec: 'speed' },
  { name: 'Careful', inc: 'special-defense', dec: 'special-attack' },
  { name: 'Quirky' }
];
const STAT_KEY_MAP = {
  'attack': 'attack',
  'defense': 'defense',
  'special-attack': 'special_attack',
  'special-defense': 'special_defense',
  'speed': 'speed'
};
const STAT_ABBR = {
  attack: 'Atk',
  defense: 'Def',
  special_attack: 'SpA',
  special_defense: 'SpD',
  speed: 'Spe'
};

function normalizeNatureRecord(n) {
  const inc = n.inc ? STAT_KEY_MAP[n.inc] : null;
  const dec = n.dec ? STAT_KEY_MAP[n.dec] : null;
  const mods = { attack:1.0, defense:1.0, special_attack:1.0, special_defense:1.0, speed:1.0 };
  if (inc && inc !== dec) mods[inc] = 1.1;
  if (dec && inc !== dec) mods[dec] = 0.9;
  return { name: n.name, inc: inc || null, dec: dec || null, mods };
}

function labelNature(n) {
  if (!n) return '';
  const name = titleCase(n.name || '');
  if (!n.inc && !n.dec) return `${name} (+/-)`;
  const plus = n.inc ? `+${STAT_ABBR[n.inc]}` : '';
  const minus = n.dec ? `-${STAT_ABBR[n.dec]}` : '';
  let body = plus && minus ? `${plus}, ${minus}` : (plus || minus);
  return `${name} (${body})`;
}

function useNatures() {
  const [list, setList] = useState(() => {
    try {
      const cached = sessionStorage.getItem(NATURE_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch {}
    const statics = STATIC_NATURES
      .map(n => normalizeNatureRecord({ name: n.name, inc: n.inc || null, dec: n.dec || null }))
      .sort((a,b)=> a.name.localeCompare(b.name));
    return statics;
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('https://pokeapi.co/api/v2/nature?limit=1000');
        if (!r.ok) return;
        const d = await r.json();
        const entries = Array.isArray(d.results) ? d.results : [];
        const all = await Promise.all(entries.map(async e => {
          try {
            const rr = await fetch(e.url);
            if (!rr.ok) return null;
            const jj = await rr.json();
            const inc = jj.increased_stat?.name || null;
            const dec = jj.decreased_stat?.name || null;
            return normalizeNatureRecord({ name: e.name, inc, dec });
          } catch { return null; }
        }));
        const clean = all.filter(Boolean).sort((a,b)=> a.name.localeCompare(b.name));
        if (clean.length && alive) {
          setList(clean);
          try { sessionStorage.setItem(NATURE_CACHE_KEY, JSON.stringify(clean)); } catch{}
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const byName = useMemo(() => {
    const m = new Map();
    for (const n of list) m.set(normalizeKey(n.name), n);
    return m;
  }, [list]);

  return { list, byName };
}

// ---------- Stat computation ----------
const STAT_KEYS = ['hp','attack','defense','special_attack','special_defense','speed'];
function clamp(n, lo, hi){
  const x = Number(n);
  if (isNaN(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}
function getBaseStatsFrom(mon = {}){
  const s = mon?.stats || {};
  return {
    hp: Number(s.base_hp ?? s.hp ?? s.HP ?? 0) || 0,
    attack: Number(s.base_attack ?? s.attack ?? s.att ?? 0) || 0,
    defense: Number(s.base_defense ?? s.defense ?? s.def ?? 0) || 0,
    special_attack: Number(s.base_special_attack ?? s.special_attack ?? s.s_att ?? s.sp_attack ?? 0) || 0,
    special_defense: Number(s.base_special_defense ?? s.special_defense ?? s.s_def ?? s.sp_defense ?? 0) || 0,
    speed: Number(s.base_speed ?? s.speed ?? s.spd ?? 0) || 0,
  };
}
function getDisplayStatsFrom(mon = {}){
  const s = mon?.stats || {};
  return {
    hp: Number(s.hp ?? s.HP ?? s.base_hp ?? 0) || 0,
    attack: Number(s.attack ?? s.att ?? s.base_attack ?? 0) || 0,
    defense: Number(s.defense ?? s.def ?? s.base_defense ?? 0) || 0,
    special_attack: Number(s.special_attack ?? s.s_att ?? s.sp_attack ?? s.base_special_attack ?? 0) || 0,
    special_defense: Number(s.special_defense ?? s.s_def ?? s.sp_defense ?? s.base_special_defense ?? 0) || 0,
    speed: Number(s.speed ?? s.spd ?? s.base_speed ?? 0) || 0,
  };
}
function computeFinalStats(base, ivs, evs, level, natureMods){
  const L = clamp(level, 1, 100);
  const IV = Object.fromEntries(STAT_KEYS.map(k => [k, clamp(ivs?.[k] ?? 0, 0, 31)]));
  const EVraw = Object.fromEntries(STAT_KEYS.map(k => [k, clamp(evs?.[k] ?? 0, 0, 252)]));
  let total = STAT_KEYS.reduce((sum,k)=> sum + (EVraw[k]||0), 0);
  const EV = { ...EVraw };
  if (total > 510) {
    let excess = total - 510;
    const order = [...STAT_KEYS].sort((a,b) => (EV[b]||0) - (EV[a]||0));
    for (const k of order){
      if (excess <= 0) break;
      const take = Math.min(excess, EV[k]);
      EV[k] -= take;
      excess -= take;
    }
  }
  const EVq = Object.fromEntries(STAT_KEYS.map(k => [k, Math.floor((EV[k]||0) / 4)]));
  const Nat = natureMods || { attack:1, defense:1, special_attack:1, special_defense:1, speed:1 };

  const out = {};
  out.hp = Math.floor(((2*base.hp + IV.hp + EVq.hp) * L) / 100) + L + 10;
  for (const k of ['attack','defense','special_attack','special_defense','speed']){
    const raw = Math.floor(((2*base[k] + IV[k] + EVq[k]) * L) / 100) + 5;
    const mod = Nat[k] ?? 1.0;
    out[k] = Math.floor(raw * mod);
  }
  return out;
}
function sumStats(map){ return ['hp','attack','defense','special_attack','special_defense','speed'].reduce((s,k)=> s + ((map?.[k]||0) | 0), 0); }

function mkInitialBuild(){
  return {
    level: '',
    nature: '',
    iv: { hp:'', attack:'', defense:'', special_attack:'', special_defense:'', speed:'' },
    ev: { hp:'', attack:'', defense:'', special_attack:'', special_defense:'', speed:'' },
  };
}

function isDirty(b){
  if (!b) return false;
  if (b.level !== '' && b.level != null) return true;
  if (b.nature && normalizeKey(b.nature) !== '') return true;
  for (const k of ['hp','attack','defense','special_attack','special_defense','speed']){ if (b.iv?.[k] !== '' && (b.iv?.[k] ?? 0) !== 0) return true; }
  for (const k of ['hp','attack','defense','special_attack','special_defense','speed']){ if (b.ev?.[k] !== '' && (b.ev?.[k] ?? 0) !== 0) return true; }
  return false;
}

function coerceBuild(b){
  const rawL = b?.level;
  const level = (rawL === '' || rawL == null)
    ? 50
    : clamp(parseInt(rawL, 10) || 1, 1, 100);
  return {
    level,
    nature: b?.nature || '',
    iv: { hp: b?.iv?.hp === '' ? 0 : (b?.iv?.hp ?? 0), attack: b?.iv?.attack === '' ? 0 : (b?.iv?.attack ?? 0), defense: b?.iv?.defense === '' ? 0 : (b?.iv?.defense ?? 0), special_attack: b?.iv?.special_attack === '' ? 0 : (b?.iv?.special_attack ?? 0), special_defense: b?.iv?.special_defense === '' ? 0 : (b?.iv?.special_defense ?? 0), speed: b?.iv?.speed === '' ? 0 : (b?.iv?.speed ?? 0) },
    ev: { hp: b?.ev?.hp === '' ? 0 : (b?.ev?.hp ?? 0), attack: b?.ev?.attack === '' ? 0 : (b?.ev?.attack ?? 0), defense: b?.ev?.defense === '' ? 0 : (b?.ev?.defense ?? 0), special_attack: b?.ev?.special_attack === '' ? 0 : (b?.ev?.special_attack ?? 0), special_defense: b?.ev?.special_defense === '' ? 0 : (b?.ev?.special_defense ?? 0), speed: b?.ev?.speed === '' ? 0 : (b?.ev?.speed ?? 0) },
  };
}

function underlineFrom(override, baseline){
  const set = new Set();
  if (!override || !baseline) return set;
  for (const k of ['hp','attack','defense','special_attack','special_defense','speed']){ if ((override[k]||0) !== (baseline[k]||0)) set.add(k); }
  if (sumStats(override) !== sumStats(baseline)) set.add('total');
  return set;
}

function NatureSelect({ value, onChange, natureList }){
  return (
    <select
      className="input"
      value={value || ''}
      onChange={(e)=> onChange?.(e.target.value)}
      style={{ height: 20, padding: '0 32px 0 14px', minWidth: 140 }}
      title="Nature"
    >
      <option value="">Nature</option>
      {natureList.map((n) => (
        <option key={n.name} value={n.name}>{labelNature(n)}</option>
      ))}
    </select>
  );
}

function LabeledPillBox({ label, value, title }){
  if (value == null || value === '') return null;
  return (
    <div
      title={title || ''}
      style={{
        display:'flex', alignItems:'center', gap:6,
        padding:'4px 8px',
        borderRadius:8,
        background:'var(--surface)',
        border:'1px solid var(--divider)'
      }}
    >
      <span className="label-muted" style={{ fontSize:12 }}>{label}</span>
      <span style={{ fontWeight:700 }}>{value}</span>
    </div>
  );
}

// Delayed tooltip wrapper for hover content (e.g., item descriptions)
function DelayedTooltip({ content, delay = 1000, children }){
  const [visible, setVisible] = React.useState(false);
  const timerRef = React.useRef(null);
  const onEnter = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };
  const onLeave = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };
  return (
    <span style={{ position:'relative', display:'inline-flex', alignItems:'center' }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {children}
      {visible && content && (
        <span
          style={{
            position:'absolute',
            bottom:'calc(100% + 8px)', left:'50%', transform:'translateX(-50%)',
            maxWidth:280,
            background:'var(--surface)', color:'var(--text)',
            border:'1px solid var(--divider)', borderRadius:8,
            padding:'8px 10px', fontSize:12, boxShadow:'0 6px 20px rgba(0,0,0,.35)',
            zIndex:50, whiteSpace:'normal'
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}

function InfoPill({ label, value, large=false }){
  if (value == null || value === '') return null;
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:4,
      padding: large ? '4px 10px' : '2px 8px',
      borderRadius:8,
      background:'var(--surface)',
      border:'1px solid var(--divider)',
      fontSize: large ? 14 : undefined
    }}>
      <span className="label-muted" style={{ fontSize:large ? 13 : 12 }}>{label}:</span>
      <span style={{ fontWeight:600 }}>{value}</span>
    </div>
  );
}

/* ---------- Compare View ---------- */
function StatBox({ label, value, diff, underline=false }){
  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center',
      padding:'6px 8px', border:'1px solid var(--divider)', borderRadius:8,
      background:'var(--surface)', minWidth:0
    }}>
      <div className="label-muted" style={{ fontSize:11 }}>{label}</div>
      <div style={{ fontWeight:900, fontSize:16, textDecoration: underline ? 'underline' : 'none' }}>{value ?? '-'}</div>
      {typeof diff === 'number' && diff !== 0 && (
        <div style={{ fontSize:15, fontWeight:800, marginTop:2, color: diff > 0 ? '#22c55e' : '#ef4444' }}>
          {diff > 0 ? `+${diff}` : `${diff}`}
        </div>
      )}
    </div>
  );
}

function StatInputBox({ label, value, min, max, onChange }){
  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center',
      padding:'4px 6px', border:'1px solid var(--divider)', borderRadius:8,
      background:'var(--surface)', minWidth:0
    }}>
      <div className="label-muted" style={{ fontSize:11 }}>{label}</div>
      <input
        className="input"
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        style={{ width:'100%', textAlign:'center', marginTop:2, padding:'4px 6px', fontSize:'14px' }}
      />
    </div>
  );
}

function StatsRow({ mon, other=null, override=null, otherOverride=null, underlineKeys=new Set(), build, onSetIV, onSetEV, onSetLevel }){
  // Use base stats for display
  const baseStats = getBaseStatsFrom(mon || {});
  const otherBaseStats = other ? getBaseStatsFrom(other) : null;
  const keys = [
    ['HP','hp'], ['Att','attack'], ['Def','defense'], ['Sp. Atk','special_attack'], ['Sp. Def','special_defense'], ['Spd','speed']
  ];
  const map = Object.fromEntries(keys.map(([L,k]) => [L, (override && override[k] != null) ? override[k] : (Number(baseStats[k]) || 0)]));
  const otherMap = other ? Object.fromEntries(keys.map(([L,k]) => [L, (otherOverride && otherOverride[k] != null) ? otherOverride[k] : (Number(otherBaseStats?.[k]) || 0)])) : null;
  const total = keys.reduce((sum, [L]) => sum + (Number(map[L]) || 0), 0);
  const totalOther = other ? keys.reduce((sum, [L]) => sum + (Number(otherMap[L]) || 0), 0) : null;

  // Compute EV total for display in the 7th slot
  const evTotal = ['hp','attack','defense','special_attack','special_defense','speed']
    .reduce((s,k)=> s + (Number(build?.ev?.[k] || 0) || 0), 0);

  const [showExtras, setShowExtras] = useState(false);
  const toggleExtras = () => {
    if (showExtras) {
      // Clearing values when collapsing
      for (const [,k] of keys) {
        onSetEV && onSetEV(k, '');
        onSetIV && onSetIV(k, '');
      }
      onSetLevel && onSetLevel('');
    }
    setShowExtras(prev => !prev);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:6 }}>
        {keys.map(([kLabel, kKey]) => (
          <StatBox key={kLabel} label={kLabel} value={map[kLabel]} diff={other ? ((Number(map[kLabel])||0) - (Number(otherMap?.[kLabel])||0)) : undefined} underline={underlineKeys?.has(kKey)} />
        ))}
        <StatBox label="Total" value={total || '-'} diff={other && totalOther!=null ? (total - totalOther) : undefined} underline={underlineKeys?.has('total')} />
      </div>

      <div
        onClick={toggleExtras}
        style={{
          marginTop:6,
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          gap:6,
          cursor:'pointer'
        }}
      >
        <span className="label-muted" style={{ fontWeight:700 }}>Include IVs and EVs</span>
        <span style={{ display:'inline-block', transform: showExtras ? 'rotate(90deg)' : 'rotate(0deg)', transition:'transform 0.2s' }}>▶</span>
      </div>

      {showExtras && (
        <div style={{ marginTop:6, display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:6 }}>
          {keys.map(([kLabel, kKey]) => (
            <StatInputBox
              key={`ev-${kKey}`}
              label={`${kLabel} EV`}
              value={build?.ev?.[kKey] ?? ''}
              min={0}
              max={252}
              onChange={(e) => {
                const raw = e.target.value;
                let val = raw === '' ? '' : clamp(parseInt(raw, 10) || 0, 0, 252);
                onSetEV && onSetEV(kKey, val);
              }}
            />
          ))}
          <StatBox label="EV Total" value={evTotal || 0} />

          {keys.map(([kLabel, kKey]) => (
            <StatInputBox
              key={`iv-${kKey}`}
              label={`${kLabel} IV`}
              value={build?.iv?.[kKey] ?? ''}
              min={0}
              max={31}
              onChange={(e) => {
                const raw = e.target.value;
                const v = raw === '' ? '' : clamp(parseInt(raw, 10) || 0, 0, 31);
                onSetIV && onSetIV(kKey, v);
              }}
            />
          ))}
          <StatInputBox
            label="Level"
            value={build?.level ?? ''}
            min={1}
            max={100}
            onChange={(e) => {
              const raw = e.target.value;
              const v = raw === '' ? '' : clamp(parseInt(raw, 10) || 1, 1, 100);
              onSetLevel && onSetLevel(v);
            }}
          />
        </div>
      )}
    </div>
  );
}
function AbilityInline({ idx, name }){
  const desc = useAbilityDesc(name);
  const label = idx === 2 ? 'H.' : `${idx + 1}.`;
  return (
    <span title={desc} style={{ marginRight:10 }}>
      <span className="label-muted" style={{ fontWeight:700 }}>{label}</span>{' '}
      <span style={{ fontWeight:700 }}>{titleCase(name)}</span>
    </span>
  );
}

function WeakResLine({ types, kind='weak' }){
  const w = computeWeakness(types);
  const entries = [];
  if (kind==='weak') {
    for (const t of w.x4) entries.push({ t, pct: '400%' });
    for (const t of w.x2) entries.push({ t, pct: '200%' });
  } else {
    for (const t of w.x0_5) entries.push({ t, pct: '50%' });
    for (const t of w.x0_25) entries.push({ t, pct: '25%' });
    for (const t of w.x0) entries.push({ t, pct: '0%' });
  }
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
      {entries.length === 0 && <span className="label-muted">None</span>}
      {entries.map(({t,pct}) => (
        <span key={`${kind}-${t}`} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
          <TypePill t={t} compact />
          <span className="label-muted" style={{ fontSize:12 }}>{pct}</span>
        </span>
      ))}
    </div>
  );
}

function CompareBlock({ mon, other, onClear, onReplace, onReplaceFromTeam, build, onSetIV, onSetEV, onSetLevel, natureEl, override=null, otherOverride=null, underlineKeys=new Set() }){
  const hasMon = !!mon;
  const types = (mon?.types || []).map(normalizeType);
  const abilities = (mon?.abilities || []).map(a => a?.name).filter(Boolean);
  // If any ability names are long, use a more compact presentation.
  const useCompactAbilities = abilities.some(a => (a || '').length > 12) || abilities.join('').length > 28;

  const teamSelect = (() => {
    let teamNames = [];
    try {
      const saved = JSON.parse(sessionStorage.getItem('teamBuilderCurrent') || '[]');
      if (Array.isArray(saved)) teamNames = saved;
      else if (saved && typeof saved === 'object' && Array.isArray(saved.mons)) teamNames = saved.mons;
    } catch {}
    const options = (teamNames || []).map(s => String(s || '').trim()).filter(Boolean);
    const hasAny = options.length > 0;
    const handleSelect = (e) => {
      const name = e.target.value;
      if (!name) return;
      try {
        const picked = getMon(name);
        if (picked && onReplaceFromTeam) onReplaceFromTeam(picked);
      } catch {}
      e.target.selectedIndex = 0;
    };
    return (
      <select
        title="Replace From Active Team"
        onChange={handleSelect}
        className="input"
        style={{ position:'absolute', top:44, left:8, height:28, borderRadius:8, width:'auto', maxWidth:220 }}
      >
        <option value="">Replace From Active Team</option>
        {hasAny ? (
          options.map((n, i) => <option key={`${n}-${i}`} value={n}>{titleCase(n)}</option>)
        ) : (
          <option value="" disabled>No Active Pokemon</option>
        )}
      </select>
    );
  })();

  if (!hasMon) {
    return (
      <div className="faint-grid" style={{ padding:12, position:'relative', minHeight:360, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <button
          type="button"
          className="region-btn"
          title="Replace From Live Battle"
          onClick={() => onReplace && onReplace()}
          style={{ position:'absolute', top:8, left:8 }}
        >
          Replace From Live Battle
        </button>
        {teamSelect}
        <div className="label-muted" style={{ fontWeight:700 }}>No Pokemon Selected</div>
      </div>
    );
  }

  // Helpers for two-row chip layout
  const twoRowSplit = (arr = []) => {
    const a = [...arr];
    const mid = Math.ceil(a.length / 2);
    return [a.slice(0, mid), a.slice(mid)];
  };
  const w = computeWeakness(types);
  const weaknessEntries = [
    ...w.x4.map(t => ({ t, pct: '400%' })),
    ...w.x2.map(t => ({ t, pct: '200%' })),
  ];
  const resistEntries = [
    ...w.x0_5.map(t => ({ t, pct: '50%' })),
    ...w.x0_25.map(t => ({ t, pct: '25%' })),
    ...w.x0.map(t => ({ t, pct: '0%' })),
  ];
  const [weakRow1, weakRow2] = twoRowSplit(weaknessEntries);
  const [resRow1, resRow2] = twoRowSplit(resistEntries);

  // Stat diffs vs other (when present)
  const statKeys = [
    ['HP','hp'], ['Att','attack'], ['Def','defense'],
    ['Sp. Atk','special_attack'], ['Sp. Def','special_defense'], ['Spd','speed']
  ];
  // Use display stats to correctly resolve special stats
  const sA = getDisplayStatsFrom(mon || {});
  const sB = other ? getDisplayStatsFrom(other) : {};
  const statDiffs = statKeys.map(([lab, key]) => {
    const a = Number(sA[key]) || 0;
    const b = Number(sB[key]) || 0;
    const diff = a - b;
    return { lab, diff };
  });
  const totalA = statKeys.reduce((sum, [,k]) => sum + (Number(sA[k]) || 0), 0);
  const totalB = statKeys.reduce((sum, [,k]) => sum + (Number(sB[k]) || 0), 0);
  const totalDiff = totalA - totalB;

  const rowWrapStyle = { borderTop:'1px solid var(--divider)', paddingTop:8, marginTop:8 };

  return (
    <div className="faint-grid" style={{ padding:12, position:'relative' }}>
      <button
        type="button"
        className="region-btn"
        title="Replace From Live Battle"
        onClick={() => onReplace && onReplace()}
        style={{ position:'absolute', top:8, left:8 }}
      >
        Replace From Live Battle
      </button>
      {teamSelect}
      <button
        type="button"
        className="region-btn"
        title="Swap"
        onClick={onClear}
        style={{ position:'absolute', top:8, right:8 }}
      >
        Swap
      </button>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
        <Sprite mon={mon} size={120} alt={mon.name} />
        <div style={{ fontSize:20, fontWeight:900 }}>{titleCase(mon.name)}</div>
        {mon.id != null && (
          <div className="label-muted">Dex #{mon.id}</div>
        )}
      </div>
      <div style={{ marginTop:10, display:'grid', gap:8 }}>
        {abilities.length > 0 && (
          <div style={rowWrapStyle}>
            <div style={{ display:'grid', gridTemplateColumns:'110px 1fr', gap:8, alignItems:'center' }}>
              <div className="label-muted" style={{ fontWeight:700 }}>Abilities</div>
              <div
                style={{
                  display:'grid',
                  gridTemplateColumns: `repeat(${abilities.length}, minmax(0, 1fr))`,
                  gap:8,
                  alignItems:'center',
                  // Consistent one-line row across both compare blocks
                  minHeight: 36
                }}
              >
                {abilities.map((a,i) => (
                  <AbilityPill
                    key={`${a}-${i}`}
                    label={i===2? 'Hidden' : `${i+1}`}
                    name={a}
                    compact={useCompactAbilities}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={rowWrapStyle}>
          <div style={{ display:'grid', gridTemplateColumns:'110px 1fr', gap:8, alignItems:'center' }}>
            <div className="label-muted" style={{ fontWeight:700 }}>Type</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {(types || []).map(tp => <TypePill key={tp} t={tp} />)}
            </div>
          </div>
        </div>

        <div style={rowWrapStyle}>
          <div style={{ display:'grid', gridTemplateColumns:'110px 1fr', gap:8 }}>
            <div className="label-muted" style={{ fontWeight:700, alignSelf:'center' }}>Weakness</div>
            <div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', minHeight:28 }}>
                {weakRow1.length ? weakRow1.map(({t,pct},i) => (
                  <span key={`w1-${t}-${i}`} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                    <TypePill t={t} />
                    <span className="label-muted" style={{ fontSize:12 }}>{pct}</span>
                  </span>
                )) : <span className="label-muted">None</span>}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginTop:6, minHeight:28 }}>
                {weakRow2.length ? weakRow2.map(({t,pct},i) => (
                  <span key={`w2-${t}-${i}`} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                    <TypePill t={t} />
                    <span className="label-muted" style={{ fontSize:12 }}>{pct}</span>
                  </span>
                )) : <span style={{ visibility:'hidden' }}>.</span>}
              </div>
            </div>
          </div>
        </div>

        <div style={rowWrapStyle}>
          <div style={{ display:'grid', gridTemplateColumns:'110px 1fr', gap:8 }}>
            <div className="label-muted" style={{ fontWeight:700, alignSelf:'center' }}>Resistance</div>
            <div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', minHeight:28 }}>
                {resRow1.length ? resRow1.map(({t,pct},i) => (
                  <span key={`r1-${t}-${i}`} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                    <TypePill t={t} />
                    <span className="label-muted" style={{ fontSize:12 }}>{pct}</span>
                  </span>
                )) : <span className="label-muted">None</span>}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginTop:6, minHeight:28 }}>
                {resRow2.length ? resRow2.map(({t,pct},i) => (
                  <span key={`r2-${t}-${i}`} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                    <TypePill t={t} />
                    <span className="label-muted" style={{ fontSize:12 }}>{pct}</span>
                  </span>
                )) : <span style={{ visibility:'hidden' }}>.</span>}
              </div>
            </div>
          </div>
        </div>

        {(mon.stats && Object.keys(mon.stats).length > 0) && (
          <div style={rowWrapStyle}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', alignItems:'end', marginBottom:6 }}>
              <div className="label-muted" style={{ fontWeight:700, gridColumn:'1 / 7' }}>Base Stats</div>
              <div style={{ gridColumn:'7 / 8', justifySelf:'end' }}>
                {natureEl}
              </div>
            </div>
            <StatsRow
              mon={mon}
              other={other}
              override={override}
              otherOverride={otherOverride}
              underlineKeys={underlineKeys}
              build={build}
              onSetIV={onSetIV}
              onSetEV={onSetEV}
              onSetLevel={onSetLevel}
            />
          </div>
        )}
      </div>
    </div>
  );
}



function CompareView({ left, right, onClearLeft, onClearRight, onReplaceLeft, onReplaceRight, onReplaceLeftFromTeam, onReplaceRightFromTeam }){
  const { list: natureList, byName: naturesByName } = useNatures();

  const [leftBuild, setLeftBuild] = useState(() => mkInitialBuild());
  const [rightBuild, setRightBuild] = useState(() => mkInitialBuild());

  const leftDirty = isDirty(leftBuild);
  const rightDirty = isDirty(rightBuild);

  const leftBase = useMemo(() => left ? getBaseStatsFrom(left) : null, [left]);
  const rightBase = useMemo(() => right ? getBaseStatsFrom(right) : null, [right]);

  const natureModsOf = (name) => {
    const n = naturesByName.get(normalizeKey(name || ''));
    return n?.mods || { attack:1, defense:1, special_attack:1, special_defense:1, speed:1 };
  };

  const leftOverride = useMemo(() => {
    if (!left || !leftBase) return null;
    if (!leftDirty) return null;
    const b = coerceBuild(leftBuild);
    return computeFinalStats(leftBase, b.iv, b.ev, b.level, natureModsOf(b.nature));
  }, [left, leftBase, leftBuild, leftDirty]);
  const rightOverride = useMemo(() => {
    if (!right || !rightBase) return null;
    if (!rightDirty) return null;
    const b = coerceBuild(rightBuild);
    return computeFinalStats(rightBase, b.iv, b.ev, b.level, natureModsOf(b.nature));
  }, [right, rightBase, rightBuild, rightDirty]);

  const leftUnderline = useMemo(() => underlineFrom(leftOverride, leftBase), [leftOverride, leftBase]);
  const rightUnderline = useMemo(() => underlineFrom(rightOverride, rightBase), [rightOverride, rightBase]);

  function makeSetters(side) {
    const setBuild = side === 'left' ? setLeftBuild : setRightBuild;
    return {
      onSetIV: (key, val) => setBuild((prev) => ({ ...prev, iv: { ...prev.iv, [key]: val } })),
      onSetEV: (key, val) => setBuild((prev) => {
        const next = { ...prev, ev: { ...prev.ev, [key]: val } };
        const sum = ['hp','attack','defense','special_attack','special_defense','speed'].reduce((s,k)=> s + (Number(next.ev[k] || 0) || 0), 0);
        if (sum <= 510) return next;
        const others = sum - (Number(next.ev[key] || 0) || 0);
        const allowed = Math.max(0, 510 - others);
        return { ...prev, ev: { ...prev.ev, [key]: Math.min(allowed, Number(val)||0) } };
      }),
      onSetLevel: (val) => setBuild((prev) => ({ ...prev, level: val }))
    };
  }
  const leftSetters = makeSetters('left');
  const rightSetters = makeSetters('right');

  return (
    <div style={{ marginTop:12 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <CompareBlock
          mon={left}
          other={right}
          onClear={onClearLeft}
          onReplace={onReplaceLeft}
          onReplaceFromTeam={onReplaceLeftFromTeam}
          build={leftBuild}
          onSetIV={leftSetters.onSetIV}
          onSetEV={leftSetters.onSetEV}
          onSetLevel={leftSetters.onSetLevel}
          natureEl={<NatureSelect natureList={natureList} value={leftBuild.nature} onChange={(v)=> setLeftBuild(prev=> ({...prev, nature:v}))} />}
          override={leftOverride}
          otherOverride={rightOverride}
          underlineKeys={leftUnderline}
        />
        <CompareBlock
          mon={right}
          other={left}
          onClear={onClearRight}
          onReplace={onReplaceRight}
          onReplaceFromTeam={onReplaceRightFromTeam}
          build={rightBuild}
          onSetIV={rightSetters.onSetIV}
          onSetEV={rightSetters.onSetEV}
          onSetLevel={rightSetters.onSetLevel}
          natureEl={<NatureSelect natureList={natureList} value={rightBuild.nature} onChange={(v)=> setRightBuild(prev=> ({...prev, nature:v}))} />}
          override={rightOverride}
          otherOverride={leftOverride}
          underlineKeys={rightUnderline}
        />
      </div>
    </div>
  );
}

function formatHeight(h){ return h==null? '--' : `${(h/10).toFixed(1)} m`; }
function formatWeight(w){ return w==null? '--' : `${(w/10).toFixed(1)} kg`; }
function formatGenderRatio(r){
  if (r == null) return "--";
  const female = Math.round((r/255)*100);
  const male = 100 - female;
  return `${male}% M / ${female}% F`;
}
/* ---------- Method & Rarity palettes ---------- */
function methodKey(m=''){ return String(m).toLowerCase().trim(); }

function normalizeTimeTag(tag=''){
  const parts = String(tag).toLowerCase().split(/[\/]/).map(s=>s.trim()).filter(Boolean);
  if (!parts.length) return '';
  const order = ['morning','day','night'];
  const times = order.filter(t => parts.includes(t)).map(titleCase);
  // Ignore season tags entirely since seasonal encounters are now uniform
  const others = parts.filter(p => !order.includes(p) && !/^season\d+$/.test(p)).map(titleCase);
  const result = [...times, ...others];
  return result.join('/') || '';
}

// Balance methods like "Lure (Water" -> "Lure (Water)"
function cleanMethodLabel(method=''){
  let m = String(method || '').trim();
  // Drop stray trailing ')' (bad source data)
  m = m.replace(/\)+$/,'');
  // Balance parentheses if needed
  const open = (m.match(/\(/g) || []).length;
  const close = (m.match(/\)/g) || []).length;
  if (open > close) m = m + ')';
  // Normalize Horde casing
  if (/^hordes?\b/i.test(m)) m = 'Horde';
  // Normalize time/season tags
  m = m.replace(/\(([^)]+)\)/g, (_, t) => {
    const norm = normalizeTimeTag(t);
    return norm ? `(${norm})` : '';
  });
  return m.trim();
}

function MethodPill({ method, compact=false }){
  const { methodColors } = React.useContext(ColorContext);
  if (!method) return null;
  const label = cleanMethodLabel(method);
  const m = methodKey(label);
  const raw = m.replace(/[^a-z]+/g, ' ');
  const base = /\blure\b/.test(raw)
    ? 'lure'
    : /\bhorde\b/.test(raw)
    ? 'horde'
    : (methodColors[m] ? m : m.replace(/\s*\(.*\)$/,''));
  const bg = methodColors[base] || '#7f8c8d';
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', fontSize:compact?11:12, borderRadius:999,
      color:'#111', background:bg, fontWeight:800, border:'1px solid #00000022'
    }}>
      {label}
    </span>
  );
}

/* ---- Rarity palette ---- */
function rarityKey(r=''){ return String(r).toLowerCase().trim(); }
const RARITY_ORDER = ['very common','common','uncommon','rare','very rare'];

function selectRarest(rarities = []) {
  const unique = [...new Set(rarities)];
  const known = unique.filter(r => RARITY_ORDER.includes(rarityKey(r)));
  if (known.length > 1) {
    const rarest = known.reduce((a, b) =>
      RARITY_ORDER.indexOf(rarityKey(b)) > RARITY_ORDER.indexOf(rarityKey(a)) ? b : a
    );
    const others = unique.filter(r => !known.includes(r));
    return [rarest, ...others];
    }
  return unique;
}
function RarityPill({ rarity, compact=false }){
  const { rarityColors } = React.useContext(ColorContext);
  if (!rarity) return null;
  const k = rarityKey(rarity);
  const isPercent = /^\d+%$/.test(k);
  const bg = isPercent ? '#13B5A6' : (rarityColors[k] || '#BDC3C7');
  const color = '#111';
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', fontSize:compact?11:12, borderRadius:999,
      color, background:bg, fontWeight:800, border:'1px solid #00000022'
    }}>
      {rarity}
    </span>
  );
}

function LevelPill({ min, max, compact=false }){
  const hasMin = min != null;
  const hasMax = max != null;
  if (!hasMin && !hasMax) return null;
  const label = hasMin && hasMax
    ? (min === max ? `Lv. ${min}` : `Lv. ${min}-${max}`)
    : `Lv. ${hasMin ? min : max}`;
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', fontSize:compact?11:12, borderRadius:999,
      color:'#111', background:'#9e50aaff', fontWeight:800, border:'1px solid #00000022'
    }}>
      {label}
    </span>
  );
}

function ItemPill({ item, compact=false }){
  if (!item) return null;
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', fontSize:compact?11:12, borderRadius:999,
      color:'#111', background:'#F8E473', fontWeight:800, border:'1px solid #00000022'
    }}>
      {item}
    </span>
  );
}

function PokeballIcon({ filled=false, size=20 }){
  const stroke = filled ? '#000' : '#bbb';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="15" fill={filled ? '#fff' : 'none'} stroke={stroke} strokeWidth="2" />
      {filled && <path d="M16 1a15 15 0 0 1 15 15H1A15 15 0 0 1 16 1z" fill="#e53e3e" />}
      <path d="M1 16h30" stroke={stroke} strokeWidth="2" />
      <circle cx="16" cy="16" r="5" fill={filled ? '#fff' : 'none'} stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

function AreaMonCard({
  mon,
  monName,
  encounters,
  onView,
  caught=false,
  onToggleCaught,
  showCaught=true,
  showEv=true,
  showCatchRate=true,
  showCatchPercent=true,
  showHeldItem=true,
  showLevel=true
}){
  const cardStyle = {
    ...styles.monCard,
    opacity: showCaught ? (caught ? 0.4 : 1) : 1,
    cursor: mon && onView ? 'pointer' : 'default'
  };
  const compact = encounters.length > 1;
  const scrollRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const wrapStyle = {
    ...styles.encWrap,
    justifyContent: hasOverflow ? 'flex-start' : 'center'
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setShowLeftArrow(el.scrollLeft > 0);
      setShowRightArrow(el.scrollLeft + el.clientWidth < el.scrollWidth);
      setHasOverflow(el.scrollWidth > el.clientWidth);
    };
    update();
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [encounters]);
  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior:'smooth' });
  };
  const handleClick = () => {
    if (mon && onView) onView(mon);
  };
  const evLabel = (() => {
    if (!mon || !showEv) return null;
    const evMap = {
      ev_hp: 'HP',
      ev_attack: 'Atk',
      ev_defense: 'Def',
      ev_sp_attack: 'SpA',
      ev_sp_defense: 'SpD',
      ev_speed: 'Spe'
    };
    const yields = mon.yields || {};
    const parts = Object.entries(evMap)
      .filter(([k]) => (yields[k] || 0) > 0)
      .map(([k, label]) => `${yields[k]} ${label}`);
    if (!parts.length) return null;
    if (parts.length > 1) {
      return `EV- ${parts[0]}\n${parts.slice(1).join('\n')}`;
    }
    return `EV- ${parts[0]}`;
  })();
  const catchRate = mon?.catchRate ?? catchRates[mon?.id];
  const catchRateLabel = (catchRate != null && showCatchRate)
    ? `CR- ${catchRate}`
    : null;
  const catchPercentLabel = (catchRate != null && showCatchPercent)
    ? `%- ${(calcCatchChance(catchRate) * 100).toFixed(1)}`
    : null;
  const infoChips = [evLabel, catchRateLabel, catchPercentLabel].filter(Boolean);
  return (
    <div style={cardStyle} onClick={handleClick}>
      {infoChips.length > 0 && (
        <div
          style={{
            position:'absolute', top:6, left:6,
            display:'flex', flexDirection:'column', gap:4,
            alignItems:'flex-start'
          }}
        >
          {infoChips.map((txt, i) => (
            <span
              key={i}
              style={{
                display:'inline-block', padding:'2px 8px', fontSize:11,
                borderRadius:999, color:'var(--text)', background:'var(--surface)',
                border:'1px solid var(--divider)', fontWeight:700,
                whiteSpace:'pre-line'
              }}
            >
              {txt}
            </span>
          ))}
        </div>
      )}
      {showCaught && (
        <button
          onClick={e => { e.stopPropagation(); onToggleCaught && onToggleCaught(); }}
          title={caught ? 'Mark as uncaught' : 'Mark as caught'}
          style={{ position:'absolute', top:6, right:6, background:'transparent', border:'none', cursor:'pointer', padding:0, fontSize:0 }}
        >
          <PokeballIcon filled={caught} size={30} />
        </button>
      )}
      <div style={{ fontWeight:700 }}>{monName}</div>
      <Sprite mon={mon} size={80} alt={monName} />
      <div style={{ position:'relative', width:'100%', overflow:'hidden' }}>
        <div ref={scrollRef} className="encounter-scroll" style={wrapStyle}>
          {encounters.map((enc, idx) => (
            <div key={idx} style={styles.encCol}>
              {enc.method && <MethodPill method={enc.method} compact={compact} />}
              {!/lure/i.test(enc.method || '') &&
                enc.rarities.map(r => (
                  <RarityPill key={`r-${idx}-${r}`} rarity={r} compact={compact} />
                ))}
              {showLevel && <LevelPill min={enc.min} max={enc.max} compact={compact} />}
              {showHeldItem && enc.items.map(i => <ItemPill key={`i-${idx}-${i}`} item={i} compact={compact} />)}
            </div>
          ))}
        </div>
        {showLeftArrow && (
          <button
            onClick={e => { e.stopPropagation(); scroll(-1); }}
            style={{
              position:'absolute',
              top:'50%',
              left:0,
              transform:'translateY(-50%)',
              background:'var(--card)',
              border:'1px solid var(--divider)',
              color:'var(--text)',
              cursor:'pointer',
              borderRadius:'50%',
              width:24,
              height:24,
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              boxShadow:'0 0 4px rgba(0,0,0,0.5)'
            }}
            aria-label="Scroll left"
          >
            ◀
          </button>
        )}
        {showRightArrow && (
          <button
            onClick={e => { e.stopPropagation(); scroll(1); }}
            style={{
              position:'absolute',
              top:'50%',
              right:0,
              transform:'translateY(-50%)',
              background:'var(--card)',
              border:'1px solid var(--divider)',
              color:'var(--text)',
              cursor:'pointer',
              borderRadius:'50%',
              width:24,
              height:24,
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              boxShadow:'0 0 4px rgba(0,0,0,0.5)'
            }}
            aria-label="Scroll right"
          >
            ▶
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Move data & tables ---------- */

const CATEGORY_COLORS = {
  physical:'#C92112',
  special:'#1976D2',
  status:'#A0A0A0'
};
function CategoryPill({ cat }){
  const key = String(cat || '').toLowerCase();
  if(!key) return null;
  const bg = CATEGORY_COLORS[key] || '#555';
  return (
    <span style={{display:'inline-block', padding:'2px 8px', fontSize:12, borderRadius:999,
      fontWeight:800, color:'#fff', background:bg, textTransform:'capitalize'}}>{key}</span>
  );
}

const MOVE_CACHE = new Map();
function moveSlug(name=''){
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}
function useMoveData(name){
  const slug = moveSlug(name);
  const [data,setData] = useState(() => MOVE_CACHE.get(slug));
  useEffect(() => {
    let alive = true;
    if(!slug) return;
    const cached = MOVE_CACHE.get(slug);
    if(cached){
      setData(cached);
      return;
    }
    (async () => {
      try{
        const res = await fetch(`https://pokeapi.co/api/v2/move/${slug}`);
        const json = await res.json();
        const info = {
          type: json?.type?.name,
          category: json?.damage_class?.name,
          power: json?.power,
          accuracy: json?.accuracy
        };
        MOVE_CACHE.set(slug, info);
        if(alive) setData(info);
      }catch(e){
        if(alive) setData(null);
      }
    })();
    return () => { alive = false; };
  }, [slug]);
  return data || null;
}

const moveCell = { padding:'2px 4px', border:'1px solid var(--divider)' };

function MoveRow({ mv, showLevel=false }){
  const name = typeof mv === 'string' ? mv : mv.move;
  const level = typeof mv === 'string' ? null : mv.level;
  const data = useMoveData(name);
  return (
    <tr>
      {showLevel && (
        <td style={{ ...moveCell, textAlign:'center' }}>{level ?? '-'}</td>
      )}
      <td style={{ ...moveCell, textAlign:'left' }}>{name}</td>
      <td style={{ ...moveCell, textAlign:'center' }}>
        {data?.type ? <TypePill t={data.type} compact /> : '\u2014'}
      </td>
      <td style={{ ...moveCell, textAlign:'center' }}>
        {data?.category ? <CategoryPill cat={data.category} /> : '\u2014'}
      </td>
      <td style={{ ...moveCell, textAlign:'center' }}>{data?.power ?? '\u2014'}</td>
      <td style={{ ...moveCell, textAlign:'center' }}>{data?.accuracy ?? '\u2014'}</td>
    </tr>
  );
}

function MovesTable({ title, moves = [], showLevel = false }) {
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [refresh, setRefresh] = useState(0);

  // Reset sort when the move list changes
  useEffect(() => {
    setSort({ key: null, dir: 1 });
  }, [moves]);

  // Preload move data so sorting by type/power/etc. works immediately
  useEffect(() => {
    let alive = true;
    const names = Array.from(new Set(moves.map(m => (typeof m === 'string' ? m : m.move))));
    (async () => {
      for (const name of names) {
        const slug = moveSlug(name);
        if (!slug || MOVE_CACHE.has(slug)) continue;
        try {
          const res = await fetch(`https://pokeapi.co/api/v2/move/${slug}`);
          const json = await res.json();
          MOVE_CACHE.set(slug, {
            type: json?.type?.name,
            category: json?.damage_class?.name,
            power: json?.power,
            accuracy: json?.accuracy,
          });
        } catch (e) {}
      }
      if (alive) setRefresh(r => r + 1);
    })();
    return () => {
      alive = false;
    };
  }, [moves]);

  const sorted = useMemo(() => {
    const arr = [...moves];
    if (!sort.key) return arr;
    const dir = sort.dir;
    const getName = mv => (typeof mv === 'string' ? mv : mv.move);
    const getLevel = mv => (typeof mv === 'string' ? null : mv.level);
    const getData = mv => MOVE_CACHE.get(moveSlug(getName(mv))) || {};
    return arr.sort((a, b) => {
      const nameA = getName(a);
      const nameB = getName(b);
      const dataA = getData(a);
      const dataB = getData(b);
      switch (sort.key) {
        case 'name':
          return nameA.localeCompare(nameB) * dir;
        case 'type': {
          const t = (dataA.type || '').localeCompare(dataB.type || '');
          return t ? t * dir : nameA.localeCompare(nameB);
        }
        case 'cat': {
          const c = (dataA.category || '').localeCompare(dataB.category || '');
          return c ? c * dir : nameA.localeCompare(nameB);
        }
        case 'power': {
          const pa = dataA.power;
          const pb = dataB.power;
          const psa = pa ?? (dir === -1 ? -Infinity : Infinity);
          const psb = pb ?? (dir === -1 ? -Infinity : Infinity);
          const diff = psa - psb;
          return diff ? diff * dir : nameA.localeCompare(nameB);
        }
        case 'acc': {
          const aa = dataA.accuracy;
          const ab = dataB.accuracy;
          const asa = aa ?? (dir === -1 ? -Infinity : Infinity);
          const asb = ab ?? (dir === -1 ? -Infinity : Infinity);
          const diff = asa - asb;
          return diff ? diff * dir : nameA.localeCompare(nameB);
        }
        case 'lv': {
          const la = getLevel(a) ?? (dir === 1 ? Infinity : -Infinity);
          const lb = getLevel(b) ?? (dir === 1 ? Infinity : -Infinity);
          const diff = la - lb;
          return diff ? diff * dir : nameA.localeCompare(nameB);
        }
        default:
          return 0;
      }
    });
  }, [moves, sort, refresh]);

  const handleSort = key => {
    setSort(prev => {
      if (prev.key === key) {
        return { key, dir: -prev.dir };
      }
      const dir = key === 'power' || key === 'acc' ? -1 : 1;
      return { key, dir };
    });
  };

  // Use proper Unicode arrows for sort indicators (up/down)
  const sortArrow = key => (sort.key === key ? (sort.dir === 1 ? '\u25B2' : '\u25BC') : '');

  return (
    <div style={{ border: '1px solid var(--divider)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      {sorted.length ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
          <colgroup>
            {showLevel && <col style={{ width: '40px' }} />}
            <col />
            <col style={{ width: '80px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '50px' }} />
            <col style={{ width: '50px' }} />
          </colgroup>
          <thead>
            <tr>
              {showLevel && (
                <th
                  style={{ ...moveCell, textAlign: 'center', cursor: 'pointer' }}
                  onClick={() => handleSort('lv')}
                >
                  Lv {sortArrow('lv')}
                </th>
              )}
              <th
                style={{ ...moveCell, textAlign: 'left', cursor: 'pointer' }}
                onClick={() => handleSort('name')}
              >
                Move {sortArrow('name')}
              </th>
              <th
                style={{ ...moveCell, textAlign: 'center', cursor: 'pointer' }}
                onClick={() => handleSort('type')}
              >
                Type {sortArrow('type')}
              </th>
              <th
                style={{ ...moveCell, textAlign: 'center', cursor: 'pointer' }}
                onClick={() => handleSort('cat')}
              >
                Cat {sortArrow('cat')}
              </th>
              <th
                style={{ ...moveCell, textAlign: 'center', cursor: 'pointer' }}
                onClick={() => handleSort('power')}
              >
                Pwr {sortArrow('power')}
              </th>
              <th
                style={{ ...moveCell, textAlign: 'center', cursor: 'pointer' }}
                onClick={() => handleSort('acc')}
              >
                Acc {sortArrow('acc')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((mv) => {
              const baseKey = typeof mv === 'string'
                ? moveSlug(mv)
                : `${moveSlug(mv.move)}-${mv.level ?? ''}`;
              const key = `${baseKey}-${moves.indexOf(mv)}`;
              return <MoveRow key={key} mv={mv} showLevel={showLevel} />;
            })}
          </tbody>
        </table>
      ) : (
        <div className="label-muted">None</div>
      )}
    </div>
  );
}

function EvolutionChain({ mon, onSelect }) {
  const base = React.useMemo(() => {
    if (!mon) return null;
    let cur = mon;
    while (EVO_PARENTS.get(cur.id)?.length) {
      const parentId = EVO_PARENTS.get(cur.id)[0];
      const parent = getMonByDex(parentId);
      if (!parent) break;
      cur = parent;
    }
    return cur;
  }, [mon]);

  const renderMon = (m) => {
    if (!m) return null;
    const isSelected = !!(mon && m && m.id === mon.id);
    return (
      <div style={{ display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ display:'inline-block', padding:2, border: isSelected ? '2px solid var(--accent)' : '2px solid transparent' }}>
            <Sprite mon={m} size={72} alt={m.name} />
          </div>
          <div className="label-muted">#{String(m.id).padStart(3,'0')}</div>
          <button
            className="link-btn"
            style={{ background:'none', border:0, padding:0, color:'var(--accent)', fontWeight:700, cursor:'pointer' }}
            onClick={() => onSelect && onSelect(m)}
          >
            {titleCase(m.name)}
          </button>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center', marginTop:4 }}>
            {(m.types || []).map(t => <TypePill key={t} t={t} compact />)}
          </div>
        </div>
        {Array.isArray(m.evolutions) && m.evolutions.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {m.evolutions.map((evo) => {
              const child = getMonByDex(evo.id);

              const rawType = String(evo.type || '').toLowerCase();
              const locationMap = {
                level_location_1: 'Lv. Up Near A Special Magnetic Field',
                level_location_2: 'Lv. Up Near A Moss Rock',
                level_location_3: 'Lv. Up Near An Ice Rock',
              };
              const isLevelLocation = Object.prototype.hasOwnProperty.call(locationMap, rawType);
              const typeLabel = rawType.replace(/_/g, ' ');
              let label = isLevelLocation ? locationMap[rawType] : titleCase(typeLabel);

              const needsItem = rawType.includes('item');
              const isTrade = rawType.startsWith('trade');
              let val = null;
              let itemId = null;
              if (!isLevelLocation) {
                if (evo.item_name) {
                  val = evo.item_name;
                  const found = ITEM_INDEX.byName.get(normalizeKey(evo.item_name));
                  if (found?.id != null) itemId = found.id;
                } else if (needsItem && typeof evo.val === 'number' && ITEM_INDEX.byId.has(evo.val)) {
                  val = ITEM_INDEX.byId.get(evo.val)?.name;
                  itemId = evo.val;
                } else if (evo.val != null) {
                  val = evo.val;
                }
              }

              if (
                rawType === 'happiness' ||
                rawType === 'happiness_day' ||
                rawType === 'happiness_night'
              ) {
                label = 'Evolve with Happiness';
                if (rawType === 'happiness_day') label += ': Day';
                if (rawType === 'happiness_night') label += ': Night';
                val = null;
              }

              // Clean up bogus trade values like "0:" so it renders as plain "Trade"
              if (isTrade) {
                const sval = String(val ?? '').trim();
                if (!sval || /^0:?$/.test(sval)) {
                  val = null;
                }
              }

              if (val != null) {
                    if (/with item$/i.test(label) && (evo.item_name || (needsItem && ITEM_INDEX.byId.has(evo.val)))) {
                      label = `${label.replace(/ item$/i, '')} ${val}`;
                   } else {
                      label = `${label}: ${val}`;
                   }
                 }

          return (
                <div key={evo.id} style={{ display:'flex', alignItems:'center', gap:16 }}>
                  <div style={{ textAlign:'center', fontSize:12, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                    {itemId != null && (
                      <img
                        src={`${ITEM_ICON_BASE}${itemId}.png`}
                        alt={String(val || 'Item')}
                        style={{ width:22, height:22, imageRendering:'pixelated' }}
                        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = ITEM_PLACEHOLDER; e.currentTarget.style.imageRendering = 'auto'; }}
                      />
                    )}
                    <div style={{ fontSize:24 }}>{"\u2192"}</div>
                    <div className="label-muted">{label}</div>
                  </div>
                  {renderMon(child)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (!base) return null;
  const hasChain = base.id !== mon.id || (base.evolutions || []).length > 0;
  if (!hasChain) return null;

  return (
    <div style={{ margin:'16px 0 6px' }}>
      <div className="label-muted" style={{ fontWeight:700, marginBottom:8 }}>Evolution</div>
      {renderMon(base)}
    </div>
  );
}

/* ---------- Defense chart ---------- */
const TYPE_CHART = {
  normal:{ weak:['fighting'], res:[], imm:['ghost'] },
  fire:{ weak:['water','ground','rock'], res:['fire','grass','ice','bug','steel'], imm:[] },
  water:{ weak:['electric','grass'], res:['fire','water','ice','steel'], imm:[] },
  electric:{ weak:['ground'], res:['electric','flying','steel'], imm:[] },
  grass:{ weak:['fire','ice','poison','flying','bug'], res:['water','electric','grass','ground'], imm:[] },
  ice:{ weak:['fire','fighting','rock','steel'], res:['ice'], imm:[] },
  fighting:{ weak:['flying','psychic'], res:['bug','rock','dark'], imm:[] },
  poison:{ weak:['ground','psychic'], res:['grass','fighting','poison','bug'], imm:[] },
  ground:{ weak:['water','grass','ice'], res:['poison','rock'], imm:['electric'] },
  flying:{ weak:['electric','ice','rock'], res:['grass','fighting','bug'], imm:['ground'] },
  psychic:{ weak:['bug','ghost','dark'], res:['fighting','psychic'], imm:[] },
  bug:{ weak:['fire','flying','rock'], res:['grass','fighting','ground'], imm:[] },
  rock:{ weak:['water','grass','fighting','ground','steel'], res:['normal','fire','poison','flying'], imm:[] },
  ghost:{ weak:['ghost','dark'], res:['poison','bug'], imm:['normal','fighting'] },
  dragon:{ weak:['ice','dragon'], res:['fire','water','electric','grass'], imm:[] },
  dark:{ weak:['fighting','bug'], res:['ghost','dark'], imm:['psychic'] },
  steel:{ weak:['fire','fighting','ground'], res:['normal','grass','ice','flying','psychic','bug','rock','dragon','steel'], imm:['poison'] }
};
function computeWeakness(types = []){
  const tlist = (Array.isArray(types) ? types : []).map(normalizeType).filter(Boolean);
  const mult = {};
  for (const atk of Object.keys(TYPE_CHART)) mult[atk] = 1;
  for (const def of tlist){
    const d = TYPE_CHART[def]; if (!d) continue;
    d.weak.forEach(t => { mult[t] *= 2; });
    d.res.forEach(t => { mult[t] *= 0.5; });
    d.imm.forEach(t => { mult[t] *= 0; });
  }
  const asType = (n) => Object.entries(mult).filter(([,m]) => m===n).map(([t]) => titleCase(t));
  return { x4: asType(4), x2: asType(2), x0_5: asType(0.5), x0_25: asType(0.25), x0: asType(0) };
}

/* ---------- Loaders ---------- */
function useLocationsDb(){
  return useMemo(() => {
    const idx = {};
    for (const mon of DEX_LIST) {
      const key = normalizeKey(mon.name);
      const locations = (mon.locations || []).map(l => {
        let method = l.type;
        let rarity = l.rarity;
        // Some "Lure" encounters are stored as a rarity rather than a method.
        // Promote those to a proper method so encounter-type filters work.
        if (rarity && /lure/i.test(rarity)) {
          method = `Lure${method ? ` (${method})` : ''}`;
          rarity = '';
        }
        // Any encounter whose method is Lure should have no rarity
        if (method && /lure/i.test(method)) {
          rarity = '';
        }
        return {
          region: l.region_name,
          map: l.location,
          method,
          rarity,
          min_level: l.min_level,
          max_level: l.max_level,
          items: (mon.heldItems || []).map(h => h.name)
        };
      });
      idx[key] = { locations };
    }
    return idx;
  }, []);
}

/** Cleaning helpers for Areas */
/** NOTE: now balances missing ')' */
function cleanAreaMethod(method=''){
  return cleanMethodLabel(method);
}

/** Sanitize Areas index once at load */
function useAreasDbCleaned(){
  return useMemo(() => {
    const out = {};
    for (const mon of DEX_LIST) {
      const items = (mon.heldItems || []).map(h => h.name);
      for (const loc of mon.locations || []) {
        const region = loc.region_name || 'Unknown';
        const mapName = loc.location;
        if (!mapName) continue;
        let method = cleanAreaMethod(loc.type || '');
        let rarity = loc.rarity || '';
        // Handle lure encounters represented as rarities in source data
        if (rarity && /lure/i.test(rarity)) {
          method = cleanAreaMethod(`Lure${method ? ` (${method})` : ''}`);
          rarity = '';
        }
        // Any encounter whose method is Lure should have no rarity
        if (method && /lure/i.test(method)) {
          rarity = '';
        }
        const entry = {
          monId: mon.id,
          monName: mon.name,
          method,
          rarity,
          min: loc.min_level,
          max: loc.max_level,
          items,
        };
        if (!out[region]) out[region] = {};
        if (!out[region][mapName]) out[region][mapName] = [];
        out[region][mapName].push(entry);
      }
    }
    return out;
  }, []);
}

function useTmLocations(){
  const [index, setIndex] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(TM_URL, { cache:'no-store' });
        const json = await res.json();
        if (alive) setIndex(json || {});
      } catch (e) {
        console.error('load tm locations failed', e);
        if (alive) setIndex({});
      }
    })();
    return () => { alive = false; };
  }, []);
  return index;
}

/** Group same Pokemon (per map) into one entry with multiple methods/rarities */
function groupEntriesByMon(entries){
  const byId = new Map();

  const splitMethod = (m='') => {
    const clean = cleanMethodLabel(m);
    const match = clean.match(/^(.*?)(?:\s*\(([^()]+)\))?$/);
    const base = match ? match[1].trim() : clean;
    const time = match && match[2] ? normalizeTimeTag(match[2]) : '';
    return { base, time };
  };

  const mergeEnc = (into, from) => {
    from.rarities.forEach(r => into.rarities.add(r));
    if (from.min != null) into.min = into.min==null ? from.min : Math.min(into.min, from.min);
    if (from.max != null) into.max = into.max==null ? from.max : Math.max(into.max, from.max);
    from.items.forEach(i => into.items.add(i));
  };

  for (const e of entries){
    if (!byId.has(e.monId)){
      byId.set(e.monId, { monId:e.monId, monName:e.monName, methods:new Map() });
    }
    const g = byId.get(e.monId);
    const { base, time } = splitMethod(e.method);
    const key = base.toLowerCase();
    if (!g.methods.has(key)) g.methods.set(key, new Map());
    const timeMap = g.methods.get(key);
    const tKey = time || '';
    if (!timeMap.has(tKey)){
      timeMap.set(tKey, { method: base, time, rarities:new Set(), min:e.min, max:e.max, items:new Set(e.items || []) });
    }
    const enc = timeMap.get(tKey);
    if (e.rarity) enc.rarities.add(e.rarity);
    if (e.min != null) enc.min = enc.min==null ? e.min : Math.min(enc.min, e.min);
    if (e.max != null) enc.max = enc.max==null ? e.max : Math.max(enc.max, e.max);
    if (Array.isArray(e.items)) e.items.forEach(i => enc.items.add(i));
  }

  return [...byId.values()].map(g => {
    const encounters = [];
    for (const timeMap of g.methods.values()) {
      const baseEnc = timeMap.get('');
      if (baseEnc && timeMap.size > 1) {
        for (const [tKey, enc] of timeMap) {
          if (tKey === '') continue;
          mergeEnc(enc, baseEnc);
        }
        timeMap.delete('');
      }
      const encs = [...timeMap.values()];
      if (encs.length > 1) {
        const combo = { method: encs[0].method, timeSet: new Set(), rarities: new Set(), min:null, max:null, items:new Set() };
        for (const enc of encs) {
          if (enc.time) combo.timeSet.add(enc.time);
          mergeEnc(combo, enc);
        }
        const label = `${combo.method} (${[...combo.timeSet].join('/')})`;
        encounters.push({
          method: label,
          rarities: selectRarest([...combo.rarities]),
          min: combo.min,
          max: combo.max,
          items: [...combo.items]
        });
      } else {
        for (const enc of encs) {
          const label = enc.time ? `${enc.method} (${enc.time})` : enc.method;
          encounters.push({
            method: label,
            rarities: selectRarest([...enc.rarities]),
            min: enc.min,
            max: enc.max,
            items: [...enc.items]
          });
        }
      }
    }
    return { monId:g.monId, monName:g.monName, encounters };
  });
}

/* Normalize map names for grouping (Sinnoh Victory Road unification & split routes) */
function normalizeMapForGrouping(region, mapName){
  const r = String(region).toLowerCase().trim();
  let m = String(mapName).trim();

  // Merge halves like "Route 212 (North)" / "(South)" -> "Route 212"
  if (/^route\s*\d+\b/i.test(m)) {
    m = m.replace(/\s*\((north|south|east|west)\)\s*/i, '').trim();
  }

  if (r === 'sinnoh' && /victory\s*road/i.test(m)) {
    return 'Victory Road';
  }
  return m;
}

// Extract trailing time-of-day tag like "(Night)" from map name
function extractTimeTag(name=''){
  const m = String(name).match(/\(((?:Morning|Day|Night|Season\d+)(?:\/(?:Morning|Day|Night|Season\d+))*)\)\s*$/i);
  return m ? m[1] : '';
}

// Remove trailing time-of-day/season tag from map name
function stripTimeTag(name=''){
  return String(name).replace(/\s*\(((?:Morning|Day|Night|Season\d+)(?:\/(?:Morning|Day|Night|Season\d+))*)\)\s*$/i, '').trim();
}

// Determine if two map names should be considered a match.
// - Queries like "Route <number>" or "<number>" only match the exact same route number
// - Partial queries like "r", "ro", "route" etc. never match anything
// - Bare "Route" queries (with or without trailing spaces) never match anything
// - Otherwise fall back to a simple substring check (case-insensitive)
function mapNameMatches(candidate, needle){
  const cand   = stripTimeTag(candidate).toLowerCase();
  const search = stripTimeTag(needle).toLowerCase();

  // If the search is a prefix of "route", do not match yet
  if ('route'.startsWith(search)) return false;

  // If the query starts with "<number>" or "route <number>", require that exact
  // route number regardless of any trailing OCR noise.
  const routeMatch = search.match(/^(?:route\s*)?(\d+)\b/);
  if (routeMatch) {
    const candRoute = cand.match(/^route\s*(\d+)\b/);
    return !!candRoute && Number(candRoute[1]) === Number(routeMatch[1]);
  }
// Avoid extremely short non-route queries from matching multiple maps
  if (search.length < 3) return false;

  if (search.startsWith('route')) return false;
  return cand.includes(search);
}

function lookupRarity(monName, region, map, locIndex){
  const entry = locIndex[normalizeKey(monName)];
  if (!entry) return '';
  const regNorm = normalizeRegion(region);
  const mapNorm = stripTimeTag(normalizeMapForGrouping(region, map));
  for (const loc of entry.locations || []) {
    if (normalizeRegion(loc.region) === regNorm &&
        stripTimeTag(normalizeMapForGrouping(loc.region, loc.map)) === mapNorm &&
        loc.rarity) {
      return loc.rarity;
    }
  }
  return '';
}

/* ======================= LIVE ROUTE MATCHING ======================= */

/** Known alias fixes (expand as needed) â€” keys and values are compared after simplifyName(). */
const LIVE_ALIASES = {
  "oreburghcity": "oreburghcity",
  "jubilifecity": "jubilifecity",
  "mtcoronet": "mountcoronet",
  "mtcoronet4f": "mountcoronet",
  "victoryroad": "victoryroad",
};

/** Turn a name into a minimal comparable key */
function simplifyName(s='') {
  return String(s)
    .replace(/\s+Ch\.?\s*\d+\b/ig, '')
    .replace(/\$[\d,\.]+/g, '')
    .replace(/\b(Sun|Mon|Tue|Tues|Wed|Thu|Thur|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/ig, '')
    .replace(/\b\d{1,2}:\d{2}\b/g, '')
    .replace(/\bmt\.?\b/ig, 'mount')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\b(?:b\d+f|\d+f)\b/ig, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(city|town|forest|cave|road|gate|outside|inside|entrance|exit)\b/g, '')
    .replace(/\s+/g, '');
}

function aliasKey(s='') {
  const key = simplifyName(s);
  if (LIVE_ALIASES[key]) return LIVE_ALIASES[key];
  return key;
}

/** Score similarity using token overlap & contains/startsWith bonuses */
function scoreNames(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;

  const routeA = a.match(/(?:^|\b)route\s*(\d+)/);
  const routeB = b.match(/(?:^|\b)route\s*(\d+)/);
  if (routeA && routeB && routeA[1] !== routeB[1]) return 0;

  let score = 0;
  if (a.startsWith(b) || b.startsWith(a)) score += 25;
  if (a.includes(b) || b.includes(a))   score += 20;
  const numsA = (a.match(/\d+/g) || []).join(',');
  const numsB = (b.match(/\d+/g) || []).join(',');
  if (numsA && numsA === numsB) score += 30;
  const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  score += Math.round(lenRatio * 15);
  return score;
}

/** Find best map match across regions; returns { region, displayMap } or null. */
function findBestMapName(hudText, areasIndex){
  if (!hudText) return null;
  const raw = String(hudText).trim();
  // Avoid treating "Route" with no number as a fuzzy search
  if (/^route\b(?!\s*\d)/i.test(raw)) return null;
  const isRoute = /^route\s*\d+/i.test(raw) || /^\d+$/.test(raw);
  // Require a minimum of three alphanumeric characters for non-route searches
  if (!isRoute && raw.replace(/[^a-z0-9]+/ig, '').length < 3) return null;
  if (!isRoute) {
    const words = raw.split(/\s+/);
    if (/^mt\.?$/i.test(words[0])) {
      const next = words[1] || '';
      if (next.replace(/[^a-z]/ig, '').length < 3) return null;
    }
  }
  const needleKey = isRoute ? raw.toLowerCase() : aliasKey(raw);
  const routeNeedle = isRoute
    ? needleKey.match(/^(?:route\s*)?(\d+)\b/)
    : needleKey.match(/(?:^|\b)route(\d+)\b/);
  let best = null, bestScore = -1;
  for (const [region, maps] of Object.entries(areasIndex || {})) {
    for (const [mapName] of Object.entries(maps || {})) {
      if (isRoute) {
        if (!mapNameMatches(mapName, raw)) continue;
        return { region, displayMap: normalizeMapForGrouping(region, mapName), rawMap: mapName };
      }
      const candidateKey = aliasKey(mapName);
      if (routeNeedle) {
        const routeCand = candidateKey.match(/(?:^|\b)route(\d+)\b/);
        if (!routeCand || routeCand[1] !== routeNeedle[1]) continue;
      }
      if (candidateKey === needleKey) {
        const s = 100;
        if (
          s > bestScore ||
          (s === bestScore && mapName.length < (best?.rawMap.length || Infinity))
        ) {
          bestScore = s;
          best = {
            region,
            displayMap: normalizeMapForGrouping(region, mapName),
            rawMap: mapName,
            score: s,
          };
        }
        continue;
      }
      const s = scoreNames(candidateKey, needleKey);
      if (s > bestScore) {
        bestScore = s;
        best = { region, displayMap: normalizeMapForGrouping(region, mapName), rawMap: mapName, score: s };
      }
    }
  }
  if (best && best.score >= 35) return best;
  return null;
}

/**
 * Given raw HUD text, strip any leading garbage and try to locate a
 * known map name.  Returns { cleaned, best } where `cleaned` is the
 * matched substring and `best` is the map match (or null).
 */
function findBestMapInText(text, areasIndex){
  const words = String(text).split(/\s+/);
  let bestMatch = null;
  let bestClean = text;
  let bestScore = -1;
  for (let i = 0; i < words.length; i++) {
    const candidate = words.slice(i).join(' ');
    const match = findBestMapName(candidate, areasIndex);
    if (match) {
      const s = scoreNames(aliasKey(match.rawMap), aliasKey(candidate));
      if (s > bestScore) { bestScore = s; bestMatch = match; bestClean = candidate; }
    }
  }
  return { cleaned: bestClean, best: bestMatch };
}

/* ---------- Region candidates + helpers ---------- */
function listRegionCandidates(areasIndex, displayMap){
  const out = [];
  for (const [region, maps] of Object.entries(areasIndex || {})) {
    for (const [mapName] of Object.entries(maps || {})) {
      const norm = normalizeMapForGrouping(region, mapName);
      if (mapNameMatches(norm, displayMap)) { out.push(region); break; }
    }
  }
  return [...new Set(out)];
}
function buildGroupedEntries(areasIndex, displayMap, regionFilter, locIndex, methodFilters = new Set()){
  const merged = [];
  for (const [reg, maps] of Object.entries(areasIndex || {})) {
    if (regionFilter && reg !== regionFilter) continue;
    for (const [mapName, list] of Object.entries(maps || {})) {
      const norm = normalizeMapForGrouping(reg, mapName);
      if (mapNameMatches(norm, displayMap)) {
        const time = extractTimeTag(norm).toLowerCase();
        const adjusted = time
          ? (list || []).map(e => ({ ...e, method: e.method ? `${e.method} (${time})` : `(${time})` }))
          : (list || []);
        merged.push(...adjusted);
      }
    }
  }
  let grouped = groupEntriesByMon(merged).map(g => {
    const fallback = regionFilter
      ? lookupRarity(g.monName, regionFilter, stripTimeTag(displayMap), locIndex)
      : null;
    g.encounters.forEach(enc => {
      if (!enc.rarities.length && fallback) enc.rarities.push(fallback);
    });
    return g;
  });
  if (methodFilters && methodFilters.size) {
    grouped = grouped
      .map(g => ({
        ...g,
        encounters: g.encounters.filter(enc => {
          const method = (enc.method || '').toLowerCase();
          const rarities = (enc.rarities || []).map(r => r.toLowerCase());
          const filters = Array.from(methodFilters).map(f => String(f).toLowerCase());
          // Lure encounters should only appear when the 'Lure' filter is active,
          // even if the method string contains additional tags like '(Water)'.
          if (/lure/.test(method) || rarities.some(r => /lure/.test(r))) {
            return filters.includes('lure');
          }
          return filters.some(fL => method.includes(fL) || rarities.some(r => r.includes(fL)));
        })
      }))
      .filter(g => g.encounters.length);
  }
  return grouped;
}

/* ======================= LIVE ROUTE: WS client + Panel ======================= */

const STALE_AFTER_MS = 6000;
// Live battle requires more aggressive reconnects to stay in sync with the
// in-game action. Reconnect if no updates arrive within this window.
const BATTLE_STALE_AFTER_MS = 2000;

function normalizeHudText(s=''){
  let t = String(s).replace(/\r/g,'').trim();
  const lines = t.split(/\n+/).map((line) => {
    // Strip channel numbers like "Ch3" (or stray "Ch") that sometimes trail the route name
    let l = line.replace(/\bCh(?:\.|:)?\s*\d*\b/gi, '');
    l = l.replace(/\s{2,}/g,' ').trim();
    return l;
  }).filter(Boolean);
  t = lines.join('');
  // Treat OCR results that are just dashes as empty/no data
  if (/^-+$/.test(t)) return '';
  return t;
}

function similarity(a='', b=''){
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  const len1 = s1.length;
  const len2 = s2.length;
  const dp = Array.from({ length: len2 + 1 }, () => Array(len1 + 1).fill(0));
  for (let i = 0; i <= len2; i++) dp[i][0] = i;
  for (let j = 0; j <= len1; j++) dp[0][j] = j;
  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (s1[j - 1] === s2[i - 1] ? 0 : 1)
      );
    }
  }
  const dist = dp[len2][len1];
  return (len1 === 0 && len2 === 0) ? 1 : 1 - dist / Math.max(len1, len2);
}

class LiveRouteClient {
  constructor(){
    this.ws = null;
    this.listeners = new Set();
    this.reconnectTimer = null;
    this.pathToggle = false;
    this.lastMsgTs = 0;
    this.lastPayload = null; // cache last message
    this.disabled = !isOcrEnabled();
  }
  connect(){
    if (this.disabled || !isOcrEnabled()) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    try{
      const url = this.pathToggle ? 'ws://127.0.0.1:8765/live/' : 'ws://127.0.0.1:8765/live';
      this.ws = new WebSocket(url);

      this.ws.onmessage = (ev) => {
        this.lastMsgTs = Date.now();
        let payload = ev.data;
        try { payload = JSON.parse(ev.data); } catch {}
        this.lastPayload = payload; // cache
        this.listeners.forEach(fn => fn(payload));
      };
      const onClose = () => {
        this.pathToggle = !this.pathToggle;
        if (!this.disabled && isOcrEnabled()) this.scheduleReconnect();
      };
      this.ws.onclose = onClose;
      this.ws.onerror = onClose;
    }catch{
      if (!this.disabled && isOcrEnabled()) this.scheduleReconnect();
    }
  }
  on(fn){
    this.listeners.add(fn);
    // Immediately replay last message so the tab shows data when you return
    if (this.lastPayload !== null) {
      try { fn(this.lastPayload); } catch {}
    }
    return () => this.listeners.delete(fn);
  }
  scheduleReconnect(){
    if (this.disabled || !isOcrEnabled()) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(()=> {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }
  isOpen(){
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }
  forceReconnect(){
    try { if (this.ws) this.ws.close(); } catch {}
    this.ws = null;
    this.lastPayload = null;          // <-- clear cached message so UI resets
    // Clear any pending reconnect to avoid residual timers after a manual restart
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.disabled && isOcrEnabled()) setTimeout(()=> this.connect(), 100);
  }
  setEnabled(enabled){
    this.disabled = !enabled;
    if (this.disabled) {
      try { if (this.ws) this.ws.close(); } catch {}
      this.ws = null;
      this.lastPayload = null;
    } else {
      this.connect();
    }
  }
}
const liveRouteClient = new LiveRouteClient();

class LiveBattleClient {
  constructor(){
    this.ws = null;
    this.listeners = new Set();
    this.reconnectTimer = null;
    this.pathToggle = false;
    this.lastMsgTs = 0;
    this.lastPayload = null;
    this.disabled = !isOcrEnabled();
  }
  connect(){
    if (this.disabled || !isOcrEnabled()) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    try{
      const url = this.pathToggle ? 'ws://127.0.0.1:8765/battle/' : 'ws://127.0.0.1:8765/battle';
      this.ws = new WebSocket(url);
      this.ws.onmessage = (ev) => {
        this.lastMsgTs = Date.now();
        let payload = ev.data;
        try { payload = JSON.parse(ev.data); } catch {}
        this.lastPayload = payload;
        this.listeners.forEach(fn => fn(payload));
      };
      const onClose = () => {
        this.pathToggle = !this.pathToggle;
        if (!this.disabled && isOcrEnabled()) this.scheduleReconnect();
      };
      this.ws.onclose = onClose;
      this.ws.onerror = onClose;
    }catch{
      if (!this.disabled && isOcrEnabled()) this.scheduleReconnect();
    }
  }
  on(fn){
    this.listeners.add(fn);
    if (this.lastPayload !== null) {
      try { fn(this.lastPayload); } catch {}
    }
    return () => this.listeners.delete(fn);
  }
  scheduleReconnect(){
    if (this.disabled || !isOcrEnabled()) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(()=> {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }
  isOpen(){
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }
  forceReconnect(){
    try { if (this.ws) this.ws.close(); } catch {}
    this.ws = null;
    this.lastPayload = null;
    this.pathToggle = !this.pathToggle;
    if (!this.disabled && isOcrEnabled()) setTimeout(()=> this.connect(), 100);
  }
  setEnabled(enabled){
    this.disabled = !enabled;
    if (this.disabled) {
      try { if (this.ws) this.ws.close(); } catch {}
      this.ws = null;
      this.lastPayload = null;
    } else {
      this.connect();
    }
  }
}
const liveBattleClient = new LiveBattleClient();

function coerceIncoming(msg){
  if (!msg) return null;
  if (typeof msg === 'string') {
    // Plain route or tagged variants
    const mTagged = msg.match(/^(?:ROUTE\|route:)?\s*(.+)$/i);
    if (mTagged) return { routeText: mTagged[1], confidence: null };
    // GUESS: "..."
    const m = msg.match(/GUESS:\s*"?([^"]+?)"?\s*$/i);
    if (m) return { routeText: m[1], confidence: null };
    if (msg.trim() === 'NO_ROUTE') return { routeText: '', confidence: 0 };
    return null;
  }
  const src = msg.payload || msg.data || msg;
  let t = src.text ?? src.route ?? src.name ?? src.guess ?? null;
  if (!t && typeof src.type === 'string' && src.type === 'no_route') t = '';
  if (!t && typeof src.line === 'string') {
    const m = src.line.match(/GUESS:\s*"?([^"]+?)"?\s*$/i);
    if (m) t = m[1];
  }
  if (!t && typeof src.message === 'string') {
    const m = src.message.match(/GUESS:\s*"?([^"]+?)"?\s*$/i);
    if (m) t = m[1];
  }
  let c = src.confidence ?? src.conf ?? src.c
  if (typeof c === 'string') { const f = parseFloat(c); if (!Number.isNaN(f)) c = f; }
  return (t !== null) ? { routeText: t, confidence: c } : null;
}

function coerceBattleIncoming(msg){
  if (!msg) return null;
  if (typeof msg === 'string') {
    if (msg.trim() === 'NO_MON') return { monText: '', confidence: 0 };
    const mTagged = msg.match(/^(?:MON\|mon:)?\s*(.+)$/i);
    if (mTagged) return { monText: mTagged[1], confidence: null };
    return { monText: msg, confidence: null };
  }
  const src = msg.payload || msg.data || msg;
  let t = src.text ?? src.mon ?? src.name ?? null;
  if (!t && typeof src.line === 'string') t = src.line;
  if (!t && typeof src.message === 'string') t = src.message;
  let c = src.confidence ?? src.conf ?? src.c;
  if (typeof c === 'string') { const f = parseFloat(c); if (!Number.isNaN(f)) c = f; }
  return (t !== null) ? { monText: t, confidence: c } : null;
}

/* ======================= LIVE ROUTE PANEL ======================= */

function LiveRoutePanel({ areasIndex, locIndex, onViewMon }){
  const [ocrEnabled, setOcrEnabled] = useState(isOcrEnabled());
  // Restore last confirmed route so it persists between tab switches
  const LAST_KEY = 'liveRouteLast';
  const lastRoute = (() => {
    try { return JSON.parse(localStorage.getItem(LAST_KEY) || '{}'); }
    catch { return {}; }
  })();

  const [rawText, setRawText] = useState(lastRoute.rawText || '');
  const [confidence, setConfidence] = useState(lastRoute.confidence ?? null);
  const [displayMap, setDisplayMap] = useState(lastRoute.displayMap || null);
  const [region, setRegion] = useState(lastRoute.region || null);
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [regionChoices, setRegionChoices] = useState(() =>
    displayMap ? listRegionCandidates(areasIndex, displayMap) : []
  );
  const [methodFilters, setMethodFilters] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('liveMethodFilters') || '[]');
      const valid = Array.isArray(saved) ? saved.filter(t => ENCOUNTER_TYPES.includes(t)) : [];
      return new Set(valid.length ? valid : ENCOUNTER_TYPES);
    } catch {
      return new Set(ENCOUNTER_TYPES);
    }
  });
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showInfoMenu, setShowInfoMenu] = useState(false);
  const [showCaught, setShowCaught] = useState(() => {
    try { return JSON.parse(localStorage.getItem('liveShowCaught') ?? 'true'); }
    catch { return true; }
  });
  const [showEvYield, setShowEvYield] = useState(() => {
    try { return JSON.parse(localStorage.getItem('liveShowEvYield') ?? 'true'); }
    catch { return true; }
  });
  const [showCatchRate, setShowCatchRate] = useState(() => {
    try { return JSON.parse(localStorage.getItem('liveShowCatchRate') ?? 'true'); }
    catch { return true; }
  });
  const [showCatchPercent, setShowCatchPercent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('liveShowCatchPercent') ?? 'true'); }
    catch { return true; }
  });
  const [showHeldItem, setShowHeldItem] = useState(() => {
    try { return JSON.parse(localStorage.getItem('liveShowHeldItem') ?? 'true'); }
    catch { return true; }
  });
  const [showLevel, setShowLevel] = useState(() => {
    try { return JSON.parse(localStorage.getItem('liveShowLevel') ?? 'true'); }
    catch { return true; }
  });
  const [showRegionMenu, setShowRegionMenu] = useState(false);
  const filterRef = useRef(null);
  const infoRef = useRef(null);
  const methodFiltersRef = useRef(methodFilters);
  const displayMapRef = useRef(displayMap);

  const { caught, toggleCaught } = React.useContext(CaughtContext);

  useEffect(() => {
    methodFiltersRef.current = methodFilters;
    try { localStorage.setItem('liveMethodFilters', JSON.stringify([...methodFilters])); } catch {}
  }, [methodFilters]);

  useEffect(() => { displayMapRef.current = displayMap; }, [displayMap]);

  useEffect(() => { setShowRegionMenu(false); }, [regionChoices, displayMap]);

  useEffect(() => {
    const onDoc = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilterMenu(false);
      if (infoRef.current && !infoRef.current.contains(e.target)) setShowInfoMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('liveShowCaught', JSON.stringify(showCaught)); } catch {}
  }, [showCaught]);
  useEffect(() => {
    try { localStorage.setItem('liveShowEvYield', JSON.stringify(showEvYield)); } catch {}
  }, [showEvYield]);
  useEffect(() => {
    try { localStorage.setItem('liveShowCatchRate', JSON.stringify(showCatchRate)); } catch {}
  }, [showCatchRate]);
  useEffect(() => {
    try { localStorage.setItem('liveShowCatchPercent', JSON.stringify(showCatchPercent)); } catch {}
  }, [showCatchPercent]);
  useEffect(() => {
    try { localStorage.setItem('liveShowHeldItem', JSON.stringify(showHeldItem)); } catch {}
  }, [showHeldItem]);
  useEffect(() => {
    try { localStorage.setItem('liveShowLevel', JSON.stringify(showLevel)); } catch {}
  }, [showLevel]);

  const toggleFilter = (m) => {
    setMethodFilters(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  useEffect(() => {
    if (displayMap) {
      setEntries(buildGroupedEntries(areasIndex, displayMap, region, locIndex, methodFilters));
    }
  }, [methodFilters, areasIndex, displayMap, region, locIndex]);

  // Update available region choices whenever map changes
  useEffect(() => {
    if (displayMap) {
      setRegionChoices(listRegionCandidates(areasIndex, displayMap));
    } else {
      setRegionChoices([]);
    }
  }, [areasIndex, displayMap]);

  // Handle messages
  // React to OCR enabled/disabled changes
  useEffect(() => {
    const onChange = (e) => {
      const en = !!(e?.detail?.enabled ?? isOcrEnabled());
      setOcrEnabled(en);
      try { liveRouteClient.setEnabled(en); } catch {}
      if (!en) {
        setConnected(false);
        setIsStale(false);
      }
    };
    window.addEventListener('ocr-enabled-changed', onChange);
    return () => window.removeEventListener('ocr-enabled-changed', onChange);
  }, []);

  useEffect(() => {
    if (!ocrEnabled) {
      try { liveRouteClient.setEnabled(false); } catch {}
      return; // Don't connect or listen when disabled
    }
    const off = liveRouteClient.on((msg) => {
      const coerced = coerceIncoming(msg);
      if (!coerced) return;

      let cleaned = normalizeHudText(coerced.routeText);
      if (DEBUG_LIVE) console.log('[LIVE] OCR raw:', coerced.routeText, '-> cleaned:', cleaned);

      const { cleaned: trimmed, best } = findBestMapInText(cleaned, areasIndex);
      if (!best) return; // ignore noisy frames
      // Re-normalize after map extraction in case channel text slipped through
      cleaned = normalizeHudText(trimmed);

      const targetName = best.displayMap;
      const choices = listRegionCandidates(areasIndex, targetName);
      setRegionChoices(choices);
      setConfidence(coerced.confidence ?? null);
      if (targetName === displayMapRef.current) return;

      // choose region: saved pref -> best -> first choice
      const prefKey = `regionPref:${targetName}`;
      let picked = localStorage.getItem(prefKey);
      if (picked && !choices.includes(picked)) picked = null;
      const chosen = picked || best.region || choices[0] || null;

      setRawText(targetName);
      setRegion(chosen);
      setDisplayMap(targetName);
      setEntries(buildGroupedEntries(areasIndex, targetName, chosen, locIndex, methodFiltersRef.current));
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({
          rawText: targetName,
          confidence: coerced.confidence ?? null,
          displayMap: targetName,
          region: chosen,
        }));
      } catch {}
    });

    liveRouteClient.connect();

    // heartbeat watcher for stale/connected pill
    const pulse = setInterval(() => {
      setConnected(liveRouteClient.isOpen());
      const last = liveRouteClient.lastMsgTs || 0;
      setIsStale(!!rawText && Date.now() - last > STALE_AFTER_MS);
    }, 1000);

    // NEW: respond to "Reload OCR" signal (clear panel + reconnect)
    const onForce = () => {
      setRawText('');
      setConfidence(null);
      setDisplayMap(null);
      setRegion(null);
      setEntries([]);
      setRegionChoices([]);
      try { localStorage.removeItem(LAST_KEY); } catch {}
      liveRouteClient.forceReconnect();
    };
    window.addEventListener('force-live-reconnect', onForce);

    // Reconnect when tab becomes visible again (tab-away fix)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        liveRouteClient.forceReconnect();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    // Also reconnect on window focus (covers some browsers)
    const onFocus = () => {
      liveRouteClient.forceReconnect();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      off();
      clearInterval(pulse);
      window.removeEventListener('force-live-reconnect', onForce);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areasIndex, locIndex, rawText, ocrEnabled]);

  const statusPill = (() => {
    if (!connected) return <span className="px-2 py-1 rounded-xl bg-red-600/20 text-red-300 text-xs">Disconnected</span>;
    if (isStale)   return <span className="px-2 py-1 rounded-xl bg-yellow-600/20 text-yellow-300 text-xs">Stale</span>;
    return <span className="px-2 py-1 rounded-xl bg-green-600/20 text-green-300 text-xs"></span>;
  })();

  const confPct = formatConfidence(confidence);
  // When user changes region via segmented buttons
  const handleRegionChange = (r) => {
    setRegion(r);
    if (displayMap) {
      const prefKey = `regionPref:${displayMap}`;
      localStorage.setItem(prefKey, r || '');
      setEntries(buildGroupedEntries(areasIndex, displayMap, r, locIndex, methodFilters));
      try {
        const prev = JSON.parse(localStorage.getItem(LAST_KEY) || '{}');
        localStorage.setItem(LAST_KEY, JSON.stringify({ ...prev, region: r }));
      } catch {}
    }
  };

  if (!ocrEnabled) {
    return (
      <div className="p-3" style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div className="label-muted">OCR disabled in settings</div>
      </div>
    );
  }

  return (
    <div className="p-3" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div className="label-muted">
          Live Location: <span style={{ fontWeight:800 }}>{rawText || 'â€”'}</span>
          {SHOW_CONFIDENCE && (confPct !== null) && (
            <span className="text-slate-400 ml-2">({confPct}% Confidence)</span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div ref={infoRef} style={{ position:'relative' }}>
            <button
              className="region-btn"
              onClick={() => setShowInfoMenu(v => !v)}
            >
              Encounter Info ▾
            </button>
            {showInfoMenu && (
              <div
                style={{ position:'absolute', right:0, top:'100%', marginTop:4, padding:8, background:'var(--surface)', border:'1px solid var(--divider)', borderRadius:8, zIndex:20, display:'flex', flexDirection:'column', gap:4 }}
              >
                <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input
                    type="checkbox"
                    checked={showCaught}
                    onChange={e=>setShowCaught(e.target.checked)}
                  />
                  Toggle Caught
                </label>
                <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input
                    type="checkbox"
                    checked={showEvYield}
                    onChange={e=>setShowEvYield(e.target.checked)}
                  />
                  EV Yield
                </label>
                <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input
                    type="checkbox"
                    checked={showCatchRate}
                    onChange={e=>setShowCatchRate(e.target.checked)}
                  />
                  Catch Rate
                </label>
                <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input
                    type="checkbox"
                    checked={showCatchPercent}
                    onChange={e=>setShowCatchPercent(e.target.checked)}
                  />
                  Catch %
                </label>
                <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input
                    type="checkbox"
                    checked={showHeldItem}
                    onChange={e=>setShowHeldItem(e.target.checked)}
                  />
                  Held Item
                </label>
                <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input
                    type="checkbox"
                    checked={showLevel}
                    onChange={e=>setShowLevel(e.target.checked)}
                  />
                  Level
                </label>
              </div>
            )}
          </div>
          <div ref={filterRef} style={{ position:'relative' }}>
            <button
              className="region-btn"
              onClick={() => setShowFilterMenu(v => !v)}
            >
              Encounter Type ▾
            </button>
            {showFilterMenu && (
              <div
                style={{ position:'absolute', right:0, top:'100%', marginTop:4, padding:8, background:'var(--surface)', border:'1px solid var(--divider)', borderRadius:8, zIndex:20, display:'flex', flexDirection:'column', gap:4 }}
              >
                {ENCOUNTER_TYPES.map(t => (
                  <label key={t} className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <input
                      type="checkbox"
                      checked={methodFilters.has(t)}
                      onChange={() => toggleFilter(t)}
                    />
                    {t}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="label-muted">{statusPill}</div>
        </div>
      </div>

      {!rawText && (
        <div className="label-muted">
          <b>LiveRouteOCR</b> is attempting to find Route Data... be patient. Ensure you are in a place with Pokemon available. Move around a bit if it still can't find the route.
        </div>
      )}

      {rawText && !displayMap && (
        <div className="label-muted">No usable route information found. Move around a bit or make sure the route is displayed on screen.</div>
      )}

      {displayMap && (
        <div style={styles.areaCard}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontWeight:800, fontSize:16 }}>
                {displayMap} {region ? <span className="label-muted">({titleCase(region)})</span> : null}
              </div>
              <div className="label-muted">{entries.length} Pokemon</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {regionChoices.length > 1 && (
                <div style={{ position:'relative' }}>
                  <button
                    type="button"
                    onClick={()=> setShowRegionMenu(v => !v)}
                    className="region-btn"
                  >
                    {region ? titleCase(region) : 'Region'}
                  </button>
                  {showRegionMenu && (
                    <div className="region-menu">
                      {regionChoices.map(r => (
                        <button
                          type="button"
                          key={r}
                          onClick={()=> { handleRegionChange(r); setShowRegionMenu(false); }}
                          className={r===region ? 'active' : undefined}
                        >
                          {titleCase(r)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="label-muted" style={{ marginTop:8 }}>No encounter data found for this area.</div>
          ) : (
            <div style={{ ...styles.gridCols, marginTop:10 }}>
              {entries.map((g, idx) => {
                const mon = getMon(g.monName);
                const isCaught = mon ? caught.has(mon.id) : false;
                return (
                  <AreaMonCard
                    key={idx}
                    mon={mon}
                    monName={g.monName}
                    encounters={g.encounters}
                    onView={onViewMon}
                    caught={isCaught}
                    showCaught={showCaught}
                    showEv={showEvYield}
                    showCatchRate={showCatchRate}
                    showCatchPercent={showCatchPercent}
                    showHeldItem={showHeldItem}
                    showLevel={showLevel}
                    onToggleCaught={() => mon && toggleCaught(mon.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {DEBUG_LIVE && rawText && (
        <div className="label-muted" style={{ fontSize:12, opacity:.6 }}>
          Debug key: <code>{aliasKey(rawText)}</code>
        </div>
      )}
    </div>
  );
}

/* ======================= LIVE BATTLE PANEL ======================= */
function LiveBattlePanel({ onViewMon, onCompare }){
  const [ocrEnabled, setOcrEnabled] = useState(isOcrEnabled());
  const [rawText, setRawText] = useState('');
  const [confidence, setConfidence] = useState(null);
  const [mons, setMons] = useState([]);
  const [connected, setConnected] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [showCaught, setShowCaught] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('liveBattleShowCaught') ?? 'true');
    } catch {
      return true;
    }
  });
  const { caught, toggleCaught } = React.useContext(CaughtContext);

  useEffect(() => {
    try { localStorage.setItem('liveBattleShowCaught', JSON.stringify(showCaught)); } catch {}
  }, [showCaught]);
  
  // React to OCR enabled/disabled changes
  useEffect(() => {
    const onChange = (e) => {
      const en = !!(e?.detail?.enabled ?? isOcrEnabled());
      setOcrEnabled(en);
      try { liveBattleClient.setEnabled(en); } catch {}
      if (!en) {
        setConnected(false);
        setIsStale(false);
      }
    };
    window.addEventListener('ocr-enabled-changed', onChange);
    return () => window.removeEventListener('ocr-enabled-changed', onChange);
  }, []);

  useEffect(() => {
    if (!ocrEnabled) {
      try { liveBattleClient.setEnabled(false); } catch {}
      return; // Skip binding when disabled
    }
    const off = liveBattleClient.on((msg) => {
      const coerced = coerceBattleIncoming(msg);
      if (!coerced) return;
      let cleaned = normalizeHudText(coerced.monText);
      cleaned = cleaned
        .replace(/([A-Za-z])([Ll][Vv])/g, '$1 $2')
        .replace(/([A-Za-z])([Hh][Pp])/g, '$1 $2')
        .replace(/([A-Za-z])([Pp][Cc])/g, '$1 $2')
        // Break up fused names like "GloomGloom" that sometimes occur when
        // multiple health bars overlap in horde battles. Also ensure digits and
        // letters don't run together.
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/(\\d)([A-Za-z])/g, '$1 $2')
        .replace(/\b(?:HP|pc)\s*\d+\/\d+\b/gi, '')
        .replace(/\s*\s*/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      const compacted = cleaned.replace(/\s+/g, '');
      // If OCR returns nothing, reset the OCR state so the next detection
      // starts fresh, but keep showing the last detected Pokemon to avoid UI flicker
      if (!compacted) {
        setRawText('');
        setConfidence(null);
        return;
      }
      const lower = cleaned.toLowerCase();
      const compact = lower.replace(/[^a-z0-9]+/g, '');
      const matches = lower.match(POKE_NAME_REGEX) || [];
      const compactMatches = compact.match(POKE_NAME_COMPACT_REGEX) || [];
      let names = Array.from(new Set([...matches, ...compactMatches].map(normalizeKey)))
        .map(n => getMon(n)?.name)
        .filter(Boolean);

        if (names.length === 0) {
        const candLines = cleaned.split(/\n+/).map(s => s.trim()).filter(Boolean);
        const fuzzySet = new Set();
        for (const line of candLines) {
          const key = normalizeKey(line);
          let mon = getMon(key);
          if (!mon) {
            let best = null;
            let bestScore = 0;
            for (const m of DEX_LIST) {
              const score = similarity(key, normalizeKey(m.name));
              if (score > bestScore) { best = m; bestScore = score; }
            }
            if (best && bestScore >= 0.8) mon = best;
          }
          if (mon) fuzzySet.add(mon.name);
        }
        names = [...fuzzySet];
      }
      
      // If no Pokemon names are detected, reset OCR state but keep the last
      // displayed Pokemon until a different one is identified
      if (names.length === 0) {
        if (DEBUG_LIVE) console.log('[LIVE] No Pokemon names detected:', cleaned);
        setRawText('');
        setConfidence(null);
        return;
      }
      if (cleaned !== rawText) setRawText(cleaned);
      setConfidence(coerced.confidence ?? null);
      const prev = mons.map(m => m.name).sort().join('|');
      const next = names.slice().sort().join('|');
      if (prev !== next) {
        setMons(
          names
            .map(n => {
              const m = getMon(n);
              return m ? { ...m } : null;
            })
            .filter(Boolean)
        );
      }
    });

    const pulse = setInterval(() => {
      setConnected(liveBattleClient.isOpen());
      const last = liveBattleClient.lastMsgTs || 0;
      const stale = Date.now() - last > BATTLE_STALE_AFTER_MS;
      setIsStale(!!rawText && stale);
      if (stale && liveBattleClient.isOpen()) {
        // Force a reconnect to prompt fresh OCR data when the feed goes stale.
        liveBattleClient.forceReconnect();
      }
    }, 1000);

    const onForce = () => {
      setRawText('');
      setConfidence(null);
      setMons([]);
    };
    window.addEventListener('force-live-reconnect', onForce);

    return () => {
      off();
      clearInterval(pulse);
      window.removeEventListener('force-live-reconnect', onForce);
    };
  }, [rawText, ocrEnabled]);

  const statusPill = (() => {
    if (!connected) return <span className="px-2 py-1 rounded-xl bg-red-600/20 text-red-300 text-xs">Disconnected</span>;
    if (isStale)   return <span className="px-2 py-1 rounded-xl bg-yellow-600/20 text-yellow-300 text-xs">Stale</span>;
    return <span className="px-2 py-1 rounded-xl bg-green-600/20 text-green-300 text-xs"></span>;
  })();

  const confPct = formatConfidence(confidence);
  const nameText = mons.length > 0 ? mons.map(m => m.name).join(' | ') : 'No Pokemon';
  useEffect(() => {
    try { window.liveBattleLastMons = mons; } catch {}
  }, [mons]);

  useEffect(() => {
    mons.forEach(mon => {
      if (mon.catchRate != null) return;
      const localRate = catchRates[mon.id];
      if (localRate != null) {
        setMons(prev =>
          prev.map(m => (m.id === mon.id ? { ...m, catchRate: localRate } : m))
        );
        return;
      }
      fetch(`https://pokeapi.co/api/v2/pokemon-species/${mon.id}/`)
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (!data) return;
          setMons(prev =>
            prev.map(m => (m.id === mon.id ? { ...m, catchRate: data.capture_rate } : m))
          );
        })
        .catch(() => {});
    });
  }, [mons]);

  if (!ocrEnabled) {
    return (
      <div className="p-3" style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div className="label-muted">OCR disabled in settings</div>
      </div>
    );
  }

  return (
    <div className="p-3" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div className="label-muted">
          Live Battle: <span style={{ fontWeight:800, whiteSpace:'pre-line' }}>{nameText}</span>
          {SHOW_CONFIDENCE && (confPct !== null) && (
            <span className="text-slate-400 ml-2">({confPct}% Confidence)</span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
            <input
              type="checkbox"
              checked={showCaught}
              onChange={e=>setShowCaught(e.target.checked)}
            />
            Toggle Caught
          </label>
          <div className="label-muted">{statusPill}</div>
        </div>
      </div>

      {!rawText && mons.length === 0 && (
        <div className="label-muted">
          <b>LiveBattleOCR</b> is attempting to find Battle Data... be patient. Ensure you are in a battle
        </div>
      )}

      {rawText && mons.length === 0 && (
        <div className="label-muted">No matching Pokemon found.</div>
      )}

      {mons.length > 0 && (
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: mons.length === 1 ? '1fr' : '1fr 1fr'
          }}
        >
          {mons.map(mon => {
            const isSolo = mons.length === 1;
            const isCaught = caught.has(mon.id);
            const weakness = computeWeakness(mon.types);
            const wList = [
              ...weakness.x4.map(t => ({ t, mult: 400 })),
              ...weakness.x2.map(t => ({ t, mult: 200 })),
              ...weakness.x0.map(t => ({ t, mult: 0 }))
            ];
            const evMap = {
              ev_hp: 'HP',
              ev_attack: 'Atk',
              ev_defense: 'Def',
              ev_sp_attack: 'SpA',
              ev_sp_defense: 'SpD',
              ev_speed: 'Spe'
            };
            const evs = Object.entries(evMap)
              .filter(([k]) => (mon.yields || {})[k] > 0)
              .map(([k, label]) => `${(mon.yields || {})[k]} ${label}`);
            const held = (mon.heldItems || []).map(h => h.name).join(', ') || 'None';
            const statMap = {
              hp: 'HP',
              attack: 'Atk',
              defense: 'Def',
              sp_attack: 'SpA',
              sp_defense: 'SpD',
              speed: 'Spe'
            };
            const catchPercent = mon.catchRate != null
              ? (calcCatchChance(mon.catchRate) * 100).toFixed(1)
              : null;
            return (
              <div
                key={mon.id}
                style={{
                  ...styles.areaCard,
                  display: 'flex',
                  justifyContent: 'center',
                  padding: isSolo ? 24 : 12,
                  position: 'relative',
                  opacity: showCaught ? (isCaught ? 0.4 : 1) : 1
                }}
              >
                {onCompare && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCompare(mon); }}
                    title="Compare"
                    className="region-btn"
                    style={{ position: 'absolute', top: 6, right: 36 }}
                  >
                    Compare
                  </button>
                )}
                <button
                  onClick={() => onViewMon?.(mon)}
                  style={{
                    appearance: 'none',
                    background: 'transparent',
                    border: 0,
                    padding: 0,
                    margin: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: isSolo ? 12 : 8,
                    width: '100%',
                    textAlign: 'center',
                    color: 'inherit'
                  }}
                >
                  <Sprite
                    mon={mon}
                    size={isSolo ? 140 : 80}
                    alt={mon.name}
                  />
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: isSolo ? 24 : 16
                    }}
                  >
                    {titleCase(mon.name)}
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: isSolo ? 16 : 14
                    }}
                  >
                    #{mon.id}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginTop: 6
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: isSolo ? 18 : 16 }}>Type:</span>
                    {(mon.types || []).map(t => (
                      <TypePill key={t} t={t} large />
                    ))}
                  </div>
                  <div style={{ marginTop: 6, width: '100%' }}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: isSolo ? 18 : 16 }}>Weakness:</span>
                      {wList.length
                        ? wList.map(w => (
                            <div
                              key={`${w.t}-${w.mult}`}
                              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <TypePill t={w.t} large />
                              <span style={{ fontWeight: 600, fontSize: isSolo ? 16 : 14 }}>
                                {w.mult === 0 ? 'Immune' : `${w.mult}%`}
                              </span>
                            </div>
                          ))
                        : <div className="label-muted">None</div>}
                    </div>
                  </div>
                  <div style={{ marginTop: 8, width: '100%', textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: isSolo ? 18 : 16, marginBottom: 4 }}>Details</div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 6,
                        fontSize: isSolo ? 16 : 15
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, alignItems:'flex-start' }}>
                        <div style={{ fontWeight: 600, whiteSpace:'nowrap' }}>EV Yield:</div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
                          {evs.length ? evs.map((e,i) => (
                            <div key={i} style={{ lineHeight:1.2 }}>{e}</div>
                          )) : 'None'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                        <div style={{ fontWeight: 600 }}>Held Items:</div>
                        <div>{held}</div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                        <div style={{ fontWeight: 600 }}>Catch Rate:</div>
                        <div>
                          {mon.catchRate != null
                            ? `${mon.catchRate} | ${catchPercent}%`
                            : 'â€”'}
                        </div>
                      </div>
                      <div style={{ fontWeight: 600 }}>Base Stats:</div>
                      <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 6 }}>
                        {Object.entries(statMap).map(([k, label]) => (
                          <InfoPill key={k} label={label} value={(mon.stats || {})[k] ?? '-'} large />
                        ))}
                        {(() => {
                          const s = mon.stats || {};
                          const total = ['hp','attack','defense','sp_attack','sp_defense','speed']
                            .map(k => Number(s[k]) || 0)
                            .reduce((a,b)=>a+b, 0);
                          return <InfoPill label="Total" value={total || '-'} large />;
                        })()}
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCaught(mon.id); }}
                  title={isCaught ? 'Mark as uncaught' : 'Mark as caught'}
                  style={{ position: 'absolute', top: 6, right: 6, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <PokeballIcon filled={isCaught} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ======================= REVERSE AREAS -> MON INDEX ======================= */
function buildReverseAreasIndex(areasClean) {
  const rev = new Map();
  for (const [region, maps] of Object.entries(areasClean || {})) {
    for (const [mapName, entries] of Object.entries(maps || {})) {
      const grouped = groupEntriesByMon(entries);
      for (const g of grouped) {
        if (!rev.has(g.monId)) rev.set(g.monId, []);
        rev.get(g.monId).push({
          region,
          map: normalizeMapForGrouping(region, mapName),
          encounters: g.encounters || []
        });
      }
    }
  }
  return rev;
}

/* ======================= APP ======================= */
function App(){
  const platform = React.useMemo(() => {
    const p = window.app?.platform || navigator?.userAgent || '';
    const ua = String(p).toLowerCase();
    if (ua.includes('win')) return 'win32';
    if (ua.includes('linux')) return 'linux';
    return 'other';
  }, []);
  const isWindows = platform === 'win32';
  const isLinux = platform === 'linux';

  const [caught, setCaught] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('caughtPokemon') || '[]');
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set();
    }
  });
  const toggleCaught = (id) => {
    setCaught(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('caughtPokemon', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const [query, setQuery]       = useState('');
  const [areaQuery, setAreaQuery] = useState('');
  const [areaRegion, setAreaRegion] = useState('All');
  const [showRegionMenu, setShowRegionMenu] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode]         = useState('pokemon'); // 'pokemon' | 'areas' | 'tm' | 'items' | 'breeding' | 'team' | 'live' | 'battle' | 'market'

  // Compare mode state for Pokemon Search
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState(null);
  const [compareB, setCompareB] = useState(null);
  const { list: natureList, byName: naturesByName } = useNatures();
  // Always disable compare when leaving the Pokemon Search tab
  useEffect(() => {
    if (mode !== 'pokemon') {
      setCompareMode(false);
      setCompareA(null);
      setCompareB(null);
    }
  }, [mode]);


  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'classic');
  useEffect(() => {
    document.body.classList.remove('theme-classic','theme-white','theme-black','theme-pearl','theme-diamond','theme-red','theme-blue','theme-gold','theme-silver','theme-emerald','theme-neo');
    document.body.classList.add(`theme-${theme}`);
    try { localStorage.setItem('theme', theme); } catch {}
  }, [theme]);
  const [showMoveset, setShowMoveset] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  const [isAsleep, setIsAsleep] = useState(false);
  const [isOneHp, setIsOneHp] = useState(false);
  const [showAllHeld, setShowAllHeld] = useState(false);
  // Session-based recent Pokemon selections for quick history in Pokemon Search
  const [recentMons, setRecentMons] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('recentMons') || '[]'); }
    catch { return []; }
  });
  const [methodFilters, setMethodFilters] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('areaMethodFilters') || '[]');
      const valid = Array.isArray(saved) ? saved.filter(t => ENCOUNTER_TYPES.includes(t)) : [];
      return new Set(valid.length ? valid : ENCOUNTER_TYPES);
    } catch {
      return new Set(ENCOUNTER_TYPES);
    }
  });
  const [showMethodMenu, setShowMethodMenu] = useState(false);
  const [showInfoMenu, setShowInfoMenu] = useState(false);
  const methodFilterRef = useRef(null);
  const infoRef = useRef(null);
  const [showCaught, setShowCaught] = useState(() => {
    try { return JSON.parse(localStorage.getItem('areaShowCaught') ?? 'true'); }
    catch { return true; }
  });
  const [showEvYield, setShowEvYield] = useState(() => {
    try { return JSON.parse(localStorage.getItem('areaShowEvYield') ?? 'true'); }
    catch { return true; }
  });
  const [showCatchRate, setShowCatchRate] = useState(() => {
    try { return JSON.parse(localStorage.getItem('areaShowCatchRate') ?? 'true'); }
    catch { return true; }
  });
  const [showCatchPercent, setShowCatchPercent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('areaShowCatchPercent') ?? 'true'); }
    catch { return true; }
  });
  const [showHeldItem, setShowHeldItem] = useState(() => {
    try { return JSON.parse(localStorage.getItem('areaShowHeldItem') ?? 'true'); }
    catch { return true; }
  });
  const [showLevel, setShowLevel] = useState(() => {
    try { return JSON.parse(localStorage.getItem('areaShowLevel') ?? 'true'); }
    catch { return true; }
  });
  const [marketData, setMarketData] = useState([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState(null);
  const [marketSelected, setMarketSelected] = useState(null);

  const toggleMethodFilter = (m) => {
    setMethodFilters(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  useEffect(() => {
    const onDoc = (e) => {
      if (methodFilterRef.current && !methodFilterRef.current.contains(e.target)) {
        setShowMethodMenu(false);
      }
      if (infoRef.current && !infoRef.current.contains(e.target)) {
        setShowInfoMenu(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('areaMethodFilters', JSON.stringify([...methodFilters])); } catch {}
  }, [methodFilters]);

  useEffect(() => { try { localStorage.setItem('areaShowCaught', JSON.stringify(showCaught)); } catch {} }, [showCaught]);
  useEffect(() => { try { localStorage.setItem('areaShowEvYield', JSON.stringify(showEvYield)); } catch {} }, [showEvYield]);
  useEffect(() => { try { localStorage.setItem('areaShowCatchRate', JSON.stringify(showCatchRate)); } catch {} }, [showCatchRate]);
  useEffect(() => { try { localStorage.setItem('areaShowCatchPercent', JSON.stringify(showCatchPercent)); } catch {} }, [showCatchPercent]);
  useEffect(() => { try { localStorage.setItem('areaShowHeldItem', JSON.stringify(showHeldItem)); } catch {} }, [showHeldItem]);
  useEffect(() => { try { localStorage.setItem('areaShowLevel', JSON.stringify(showLevel)); } catch {} }, [showLevel]);

  const detailRef = useRef(null);

  const [showUpToDate, setShowUpToDate] = useState(false);

  useEffect(() => {
    if (!isWindows && mode === 'live') setMode('pokemon');
  }, [isWindows, mode]);

  useEffect(() => {
    liveBattleClient.connect();
    const onForce = () => { liveBattleClient.forceReconnect(); };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        liveBattleClient.forceReconnect();
      }
    };
    const onFocus = () => { liveBattleClient.forceReconnect(); };
    window.addEventListener('force-live-reconnect', onForce);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('force-live-reconnect', onForce);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Suppress the in-app "Up to date" banner; Windows handles update UX.
  useEffect(() => { /* no-op */ }, []);

  useEffect(() => {
    if (mode !== 'market') return;
    let cancelled = false;
    setMarketLoading(true);
    setMarketError(null);
    const extractList = (d) => {
      if (Array.isArray(d)) return d;
      if (Array.isArray(d?.results)) return d.results;
      if (Array.isArray(d?.data?.results)) return d.data.results;
      if (Array.isArray(d?.data?.items)) return d.data.items;
      if (Array.isArray(d?.data)) return d.data;
      if (Array.isArray(d?.items)) return d.items;
      return [];
    };
    const gtlEndpoint = import.meta.env.VITE_GTL_ITEMS_URL;
    if (!gtlEndpoint) {
      setMarketData(ITEM_LIST);
      setMarketLoading(false);
      return;
    }
    const headers = {
      'Accept': 'application/json'
    };
    if (import.meta.env.VITE_GTL_AUTH) headers['Authorization'] = import.meta.env.VITE_GTL_AUTH;
    if (import.meta.env.VITE_GTL_ORIGIN) headers['Origin'] = import.meta.env.VITE_GTL_ORIGIN;
    fetch(gtlEndpoint, { headers })
      .then(async r => {
        if (!r.ok) {
          let msg = `Request failed: ${r.status}`;
          const text = await r.text().catch(() => '');
          if (text) msg += ` - ${text}`;
          throw new Error(msg);
        }
        return r.json();
      })
      .then(d => {
        if (cancelled) return;
        setMarketData(extractList(d));
      })
      .catch(err => {
        if (!cancelled) {
          console.error('GTL fetch error', err);
          setMarketError(err?.message || 'Failed to fetch data');
        }
      })
      .finally(() => { if (!cancelled) setMarketLoading(false); });
    return () => { cancelled = true; };
  }, [mode]);

  const [methodColors, setMethodColors] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('methodColors') || '{}');
      return { ...DEFAULT_METHOD_COLORS, ...saved };
    } catch {
      return DEFAULT_METHOD_COLORS;
    }
  });
  const [rarityColors, setRarityColors] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('rarityColors') || '{}');
      return { ...DEFAULT_RARITY_COLORS, ...saved };
    } catch {
      return DEFAULT_RARITY_COLORS;
    }
  });

  const locIndex   = useLocationsDb();
  const areasClean = useAreasDbCleaned();
  const tmIndex    = useTmLocations();
  const areasRevByMon = useMemo(() => buildReverseAreasIndex(areasClean), [areasClean]); // NEW
  const regionOptions = useMemo(() => ['All', ...Object.keys(areasClean).sort((a,b)=>a.localeCompare(b))], [areasClean]);


  const [typeFilter, setTypeFilter] = useState('');
  const [typeFilter2, setTypeFilter2] = useState('');
  const [eggFilter, setEggFilter] = useState('');
  const [abilityFilter, setAbilityFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [moveFilter, setMoveFilter] = useState('');
  const [moveLevelOnly, setMoveLevelOnly] = useState(false);
  const [itemFilter, setItemFilter] = useState('');

  // Close the Pokemon profile when any filter is selected/changed
  useEffect(() => {
    if (!selected) return;
    const anyFilter = Boolean(
      typeFilter || typeFilter2 || eggFilter || abilityFilter || regionFilter || moveFilter || itemFilter || (moveFilter && moveLevelOnly)
    );
    if (anyFilter) setSelected(null);
  }, [typeFilter, typeFilter2, eggFilter, abilityFilter, regionFilter, moveFilter, moveLevelOnly, itemFilter]);
  const typeOptions = useMemo(() => {
    const set = new Set();
    for (const m of DEX_LIST) for (const t of m.types || []) set.add(normalizeType(t));
    return [...set].sort((a,b)=>a.localeCompare(b));
  }, []);
  const eggGroupOptions = useMemo(() => {
    const set = new Set();
    for (const m of DEX_LIST) for (const g of m.eggGroups || []) set.add(normalizeEggGroup(g));
    return [...set].sort((a,b)=>a.localeCompare(b));
  }, []);
  const abilityOptions = useMemo(() => {
    const set = new Set();
    for (const m of DEX_LIST) for (const a of m.abilities || []) if (a?.name && a.name !== '--') set.add(a.name);
    return [...set].sort((a,b)=>a.localeCompare(b));
  }, []);
  const moveOptions = useMemo(() => {
    const set = new Set();
    for (const m of DEX_LIST) for (const mv of m.moves || []) if (mv?.name) set.add(mv.name);
    return [...set].sort((a,b)=>a.localeCompare(b));
  }, []);
  const itemOptions = useMemo(() => {
    const set = new Set();
    for (const m of DEX_LIST) for (const h of m.heldItems || []) if (h?.name) set.add(h.name);
    // If no held items are found in the dex data, fall back to the full item list
    // so the Held Item filter still offers suggestions.
    if (set.size === 0) for (const item of ITEM_LIST) if (item?.name) set.add(item.name);
    return [...set].sort((a,b)=>a.localeCompare(b));
  }, []);
  const pokemonRegionOptions = useMemo(() => {
    const set = new Set();
    for (const m of DEX_LIST) for (const l of m.locations || []) if (l.region_name) set.add(l.region_name);
    return [...set].sort((a,b)=>a.localeCompare(b));
  }, []);

  useEffect(() => { if (!moveFilter) setMoveLevelOnly(false); }, [moveFilter]);

  const hasFilters = Boolean(typeFilter || typeFilter2 || eggFilter || abilityFilter || regionFilter || moveFilter || itemFilter);

const headerSprite = useMemo(() => {
    if (theme === 'red') return spriteSources(getMon('Charizard'))[0] || null;
    if (theme === 'blue') return spriteSources(getMon('Blastoise'))[0] || null;
    if (theme === 'gold') return spriteSources(getMon('Ho-Oh'))[0] || null;
    if (theme === 'silver') return spriteSources(getMon('Lugia'))[0] || null;
    if (theme === 'emerald') return spriteSources(getMon('Rayquaza'))[0] || null;
    if (theme === 'black') return spriteSources(getMon('Reshiram'))[0] || null;
    if (theme === 'white') return spriteSources(getMon('Zekrom'))[0] || null;
    if (theme === 'diamond') return spriteSources(getMon('Dialga'))[0] || null;
    if (theme === 'pearl') return spriteSources(getMon('Palkia'))[0] || null;
    const withSprite = DEX_LIST.filter(d => spriteSources(d).length > 0);
    return withSprite.length ? spriteSources(withSprite[Math.floor(Math.random()*withSprite.length)])[0] : null;
  }, [theme]);
  useEffect(() => { document.title = APP_TITLE; }, []);
  const headerSrc = headerSprite || TRANSPARENT_PNG;

  useEffect(() => {
    setShowRegionMenu(false);
    if (mode !== 'pokemon') setSelected(null);
    setTypeFilter('');
    setTypeFilter2('');
    setEggFilter('');
    setAbilityFilter('');
    setRegionFilter('');
    setMoveFilter('');
    setMoveLevelOnly(false);
    setItemFilter('');
  }, [mode]);
  // Ensure the second Type filter only applies when the first is set
  useEffect(() => {
    if (!typeFilter) setTypeFilter2('');
  }, [typeFilter]);
  useEffect(() => {
    setShowMoveset(false);
    setShowLocations(false);
    setIsAsleep(false);
    setIsOneHp(false);
  }, [selected]);
  useEffect(() => {
    if (selected && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selected]);
  useEffect(() => {
    if (!selected || selected.catchRate != null) return;
    const localRate = catchRates[selected.id];
    if (localRate != null) {
      setSelected((s) => (s && s.id === selected.id ? { ...s, catchRate: localRate } : s));
      return;
    }
    (async () => {
      try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${selected.id}/`);
        if (!res.ok) return;
        const data = await res.json();
        setSelected((s) => (s && s.id === selected.id ? { ...s, catchRate: data.capture_rate } : s));
      } catch (e) {
        console.error('fetch catch rate failed', e);
      }
    })();
  }, [selected]);
  useEffect(() => {
    (async () => {
      try {
        const current = await window.app?.getVersion?.().catch(() => null);
        if (current) {
          const last = localStorage.getItem('last-version');
          if (last !== current) {
            openPatchNotes();
            localStorage.setItem('last-version', current);
          }
        }
      } catch (err) {
        console.error('Version check failed', err);
      }
    })();
  }, []);

// (Removed: legacy OCR setup auto-open)

  // Search by Pokemon
  const results = React.useMemo(() => {
    if (mode !== 'pokemon') return [];
    const q = query.trim().toLowerCase();
    if (!hasFilters && !q) return [];

    const matchesFilters = (mon) => {
      if (typeFilter) {
        const types = (mon.types || []).map(normalizeType);
        if (!types.includes(normalizeType(typeFilter))) return false;
        if (typeFilter2) {
          if (!types.includes(normalizeType(typeFilter2))) return false;
        }
      }
      if (eggFilter) {
        const eggs = (mon.eggGroups || []).map(normalizeEggGroup);
        if (!eggs.includes(normalizeEggGroup(eggFilter))) return false;
      }
      if (abilityFilter) {
        const abilities = (mon.abilities || []).map(a => keyName(a.name));
        if (!abilities.includes(keyName(abilityFilter))) return false;
      }
      if (moveFilter) {
        const moves = mon.moves || [];
        if (moveLevelOnly) {
          const has = moves.some(mv => keyName(mv.name) === keyName(moveFilter) && mv.type === 'level');
          if (!has) return false;
        } else {
          const names = moves.map(mv => keyName(mv.name));
          if (!names.includes(keyName(moveFilter))) return false;
        }
      }
      if (itemFilter) {
        const items = (mon.heldItems || []).map(h => keyName(h.name));
        if (!items.includes(keyName(itemFilter))) return false;
      }
      if (regionFilter) {
        const regions = (mon.locations || []).map(l => normalizeRegion(l.region_name));
        if (!regions.includes(normalizeRegion(regionFilter))) return false;
      }
      return true;
    };

    const matchesQuery = (mon) => {
      if (!q) return true;
      return mon.name.toLowerCase().includes(q) || String(mon.id) === q;
    };

    let list = [];
    for (const mon of DEX_LIST) {
      if (matchesFilters(mon) && matchesQuery(mon)) list.push(mon);
      for (const form of mon.forms || []) {
        if (matchesFilters(form) && matchesQuery(form)) list.push(form);
      }
    }
    if (!hasFilters && q) list = list.slice(0, 24);
    return list;
  }, [mode, query, hasFilters, typeFilter, typeFilter2, eggFilter, abilityFilter, regionFilter, moveFilter, moveLevelOnly, itemFilter]);

  // Helper to compare mons (accounts for forms without numeric id)
  const sameMon = (a, b) => {
    if (!a || !b) return false;
    if (a.id != null && b.id != null) return Number(a.id) === Number(b.id);
    return normalizeKey(a.name) === normalizeKey(b.name);
  };

  // Results with pinned first selection in compare mode
  const combinedResults = React.useMemo(() => {
    if (mode !== 'pokemon') return results;
    if (!(compareMode && compareA && !compareB)) return results;
    const rest = results.filter(r => !sameMon(r, compareA));
    return [compareA, ...rest];
  }, [results, compareMode, compareA, compareB, mode]);

  // Filter recent list based on compare state
  const recentFiltered = React.useMemo(() => {
    if (mode !== 'pokemon') return recentMons;
    if (compareMode && compareA && compareB) return [];
    if (compareMode && compareA && !compareB) {
      if (!Array.isArray(recentMons)) return [];
      return recentMons.filter(r => {
        const m = getMonByDex(r?.id);
        if (m) return !sameMon(m, compareA);
        if (r?.name) return normalizeKey(r.name) !== normalizeKey(compareA.name);
        return true;
      });
    }
    return recentMons;
  }, [recentMons, mode, compareMode, compareA, compareB]);

  // Track recents when selection changes
  useEffect(() => {
    if (!selected || selected.id == null) return;
    setRecentMons(prev => {
      const base = Array.isArray(prev) ? prev : [];
      const without = base.filter(m => m && m.id !== selected.id);
      const next = [{ id: selected.id, name: selected.name }, ...without].slice(0, 8);
      try { sessionStorage.setItem('recentMons', JSON.stringify(next)); } catch {}
      return next;
    });
  }, [selected?.id]);

  // No additional reset needed; recents show whenever the query is empty.

  // Search by Area (cleaned + grouped) with Sinnoh Victory Road unified
  const areaHits = React.useMemo(() => {
    if (mode!=='areas') return [];
    const q = areaQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    // Suppress results while user is typing the word "route"
    if ('route'.startsWith(q)) return [];
    // If query begins with "route" but lacks a number, avoid suggesting routes yet
    if (q.startsWith('route') && !/^route\s*\d+/.test(q)) return [];
    const buckets = new Map();
    const regionKey = normalizeRegion(areaRegion);
    for (const [region, maps] of Object.entries(areasClean)) {
      const regionNorm = normalizeRegion(region);
      if (regionKey !== 'all' && regionNorm !== regionKey) continue;
      for (const [mapName, entries] of Object.entries(maps)) {
        const displayMap = normalizeMapForGrouping(region, mapName);
        if (!mapNameMatches(displayMap, q)) continue;
        const time = extractTimeTag(displayMap).toLowerCase();
        const baseMap = stripTimeTag(displayMap);
        const key = `${region}|||${baseMap}`;
        if (!buckets.has(key)) buckets.set(key, { region, map: baseMap, entries: [] });
        const adjusted = time
          ? entries.map(e => ({ ...e, method: e.method ? `${e.method} (${time})` : `(${time})` }))
          : entries;
        buckets.get(key).entries.push(...adjusted);
      }
    }
    const hits = [];
    for (const { region, map, entries } of buckets.values()) {
      const regionNorm = normalizeRegion(region);
      if (regionKey !== 'all' && regionNorm !== regionKey) continue;
      let grouped = groupEntriesByMon(entries).map(g => {
        const fallback = lookupRarity(g.monName, region, map, locIndex);
        g.encounters.forEach(enc => {
          if (!enc.rarities.length && fallback) enc.rarities.push(fallback);
        });
        return g;
      });
      if (methodFilters && methodFilters.size) {
        grouped = grouped
          .map(g => ({
            ...g,
            encounters: g.encounters.filter(enc => {
              const method = (enc.method || '').toLowerCase();
              const rarities = (enc.rarities || []).map(r => r.toLowerCase());
              const filters = Array.from(methodFilters).map(f => String(f).toLowerCase());
              // Only show lure encounters when the 'Lure' filter is enabled.
              if (/lure/.test(method) || rarities.some(r => /lure/.test(r))) {
                return filters.includes('lure');
              }
              return filters.some(fL => method.includes(fL) || rarities.some(r => r.includes(fL)));
            })
          }))
          .filter(g => g.encounters.length);
      }
      if (grouped.length) hits.push({ region, map, count: grouped.length, entries: grouped });
    }
    hits.sort((a,b)=> a.region.localeCompare(b.region) || a.map.localeCompare(b.map));
    return hits.slice(0, 30);
 }, [areaQuery, areasClean, locIndex, mode, areaRegion, methodFilters]);

  const tmHits = React.useMemo(() => {
    if (mode !== 'tm') return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const regionKey = normalizeRegion(areaRegion);
    const hits = [];
    for (const [region, entries] of Object.entries(tmIndex)) {
      const regionNorm = normalizeRegion(region);
      if (regionKey !== 'all' && regionNorm !== regionKey) continue;
      for (const entry of entries || []) {
        if (entry.tm.toLowerCase().includes(q)) {
          hits.push({ ...entry, region });
        }
      }
    }
    hits.sort((a,b)=> a.region.localeCompare(b.region) || a.tm.localeCompare(b.tm));
    return hits;
  }, [query, tmIndex, mode, areaRegion]);

  const itemHits = React.useMemo(() => {
    if (mode !== 'items') return [];
    const q = normalizeKey(query);
    if (!q) return [];
    return ITEM_LIST.filter(i => normalizeKey(i.name).includes(q)).slice(0, 30);
  }, [query, mode]);

const marketResults = React.useMemo(() => {
    if (mode !== 'market') return [];
    const q = query.trim().toLowerCase();
    return marketData
      .map((item, idx) => {
        const id = item?.id ?? item?.item_id;
        const name = item?.name || item?.item_name || ITEM_INDEX.byId.get(id)?.name || `Item ${id ?? idx}`;
        const price = item?.price ?? item?.min_price;
        return { ...item, id, name, price };
      })
      .filter(i => i.name && !i.name.includes('?'))
      .filter(i => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [mode, query, marketData]);

  const openMarketItem = (item) => {
    setMarketSelected(item);
  };

  // Selected Pokemon details (MERGED sources)
  const resolved = React.useMemo(() => {
    if (!selected) return null;

    const norm = normalizeKey(selected.name);
    const baseLocsRaw = (() => {
      const locEntry = locIndex[norm] || locIndex[`and-${norm}`] || locIndex[norm.replace(/^and-/, '')];
      return Array.isArray(locEntry?.locations) ? locEntry.locations : [];
    })();

    // Normalize base locations to array-of-arrays form
    const baseLocs = baseLocsRaw.map(l => ({
      region: titleCase(l.region || 'Unknown'),
      map: normalizeMapForGrouping(l.region || 'Unknown', l.map || ''),
      method: Array.isArray(l.method) ? l.method.filter(Boolean) : (l.method ? [l.method] : []),
      rarity: Array.isArray(l.rarity) ? l.rarity.filter(Boolean) : (l.rarity ? [l.rarity] : []),
      min: l.min_level ?? l.min,
      max: l.max_level ?? l.max,
      items: Array.isArray(l.items) ? l.items.filter(Boolean) : [],
    }));

    // Extra from Areas reverse index
    const extraLocs = (areasRevByMon.get(selected.id) || []).flatMap(e =>
      (e.encounters || []).map(enc => ({
        region: titleCase(e.region),
        map: e.map,
        method: [enc.method].filter(Boolean),
        rarity: (enc.rarities || []).filter(Boolean),
        min: enc.min,
        max: enc.max,
        items: (enc.items || []).filter(Boolean),
      }))
    );


    // Locations from dex data
    const dexLocs = (selected.locations || []).map(l => {
      let method = l.type;
      let rarity = l.rarity;
      if (rarity && /lure/i.test(rarity)) {
        method = `Lure${method ? ` (${method})` : ''}`;
        rarity = '';
      }
      if (method && /lure/i.test(method)) {
        rarity = '';
      }
      return {
        region: titleCase(l.region_name || 'Unknown'),
        map: l.location,
        method: [method].filter(Boolean),
        rarity: [rarity].filter(Boolean),
        min: l.min_level,
        max: l.max_level,
        items: (selected.heldItems || []).map(h => h.name),
      };
    });

    // Merge & dedupe by region+map; union methods/rarities
    const byKey = new Map();
    for (const src of [...baseLocs, ...extraLocs, ...dexLocs]) {
      if (!src.map) continue;
      const key = `${src.region}|${src.map}`;
      const prev = byKey.get(key) || { region: src.region, map: src.map, method: [], rarity: [], items: [], min: src.min, max: src.max };
      prev.method.push(...(src.method || []));
      prev.rarity.push(...(src.rarity || []));
      prev.items.push(...(src.items || []));
      prev.min = Math.min(prev.min ?? src.min ?? Infinity, src.min ?? Infinity);
      prev.max = Math.max(prev.max ?? src.max ?? 0, src.max ?? 0);
      byKey.set(key, prev);
    }

    const mergedLocs = [...byKey.values()].map(l => {
      const methods = [...new Set(l.method)];
      let rarities = [...new Set(l.rarity)];
      if (methods.length === 1) {
        rarities = selectRarest(rarities);
      }
      return {
        ...l,
        method: methods,
        rarity: rarities,
        items: [...new Set(l.items)],
      };
    });

    const types = [...new Set((selected.types || []).map(normalizeType))];
    const moves = groupMoves(selected.moves || []);
    return {
      ...selected,
      types,
      moves,
      weakness: computeWeakness(types),
      locations: mergedLocs,
      eggGroups: selected.eggGroups || []
    };
  }, [selected, locIndex, areasRevByMon]);

  // Group locations by region
  const byRegion = React.useMemo(() => {
    if (!resolved?.locations?.length) return [];
    const groups = new Map();
    for (const L of resolved.locations) {
      const reg = titleCase(L.region || 'Unknown');
      if (!groups.has(reg)) groups.set(reg, []);
      groups.get(reg).push(L);
    }
    const order = ['Kanto','Johto','Hoenn','Sinnoh','Unova','Unknown'];
    return [...groups.entries()].sort((a,b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [resolved]);

  const catchPercent = React.useMemo(() => {
    if (!resolved?.catchRate) return null;
    const chance = calcCatchChance(
      resolved.catchRate,
      isOneHp ? 0.01 : 1,
      isAsleep ? 2 : 1
    );
    return chance * 100;
  }, [resolved, isAsleep, isOneHp]);

  const [singleBuild, setSingleBuild] = useState(() => mkInitialBuild());
  const singleDirty = isDirty(singleBuild);
  const singleBaseStats = useMemo(() => resolved ? getBaseStatsFrom(resolved) : null, [resolved]);
  const natureModsOf = (name) => {
    const n = naturesByName.get(normalizeKey(name || ''));
    return n?.mods || { attack:1, defense:1, special_attack:1, special_defense:1, speed:1 };
  };
  const singleOverride = useMemo(() => {
    if (!singleBaseStats || !singleDirty) return null;
    const b = coerceBuild(singleBuild);
    return computeFinalStats(singleBaseStats, b.iv, b.ev, b.level, natureModsOf(b.nature));
  }, [singleBaseStats, singleBuild, singleDirty]);
  const singleUnderline = useMemo(() => underlineFrom(singleOverride, singleBaseStats), [singleOverride, singleBaseStats]);
  const singleSetters = {
    onSetIV: (key, val) => setSingleBuild((prev) => ({ ...prev, iv: { ...prev.iv, [key]: val } })),
    onSetEV: (key, val) => setSingleBuild((prev) => {
      const next = { ...prev, ev: { ...prev.ev, [key]: val } };
      const sum = ['hp','attack','defense','special_attack','special_defense','speed'].reduce((s,k)=> s + (Number(next.ev[k] || 0) || 0), 0);
      if (sum <= 510) return next;
      const others = sum - (Number(next.ev[key] || 0) || 0);
      const allowed = Math.max(0, 510 - others);
      return { ...prev, ev: { ...prev.ev, [key]: Math.min(allowed, Number(val)||0) } };
    }),
    onSetLevel: (val) => setSingleBuild((prev) => ({ ...prev, level: val }))
  };
  useEffect(() => { setSingleBuild(mkInitialBuild()); }, [resolved]);
  useEffect(() => { setShowAllHeld(false); }, [resolved]);

  const getLatestLiveBattleMon = () => {
    const fromPayload = (payload) => {
      const coerced = coerceBattleIncoming(payload);
      if (!coerced) return [];
      let cleaned = normalizeHudText(coerced.monText);
      cleaned = cleaned
        .replace(/([A-Za-z])([Ll][Vv])/g, '$1 $2')
        .replace(/([A-Za-z])([Hh][Pp])/g, '$1 $2')
        .replace(/([A-Za-z])([Pp][Cc])/g, '$1 $2')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/(\d)([A-Za-z])/g, '$1 $2')
        .replace(/\b(?:HP|pc)\s*\d+\/\d+\b/gi, '')
        .replace(/\s*\s*/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      const lower = cleaned.toLowerCase();
      const compact = lower.replace(/[^a-z0-9]+/g, '');
      const matches = lower.match(POKE_NAME_REGEX) || [];
      const compactMatches = compact.match(POKE_NAME_COMPACT_REGEX) || [];
      let names = Array.from(new Set([...matches, ...compactMatches].map(normalizeKey)))
        .map(n => getMon(n)?.name)
        .filter(Boolean);
      if (names.length === 0) {
        const candLines = cleaned.split(/\n+/).map(s => s.trim()).filter(Boolean);
        const fuzzySet = new Set();
        for (const line of candLines) {
          const key = normalizeKey(line);
          let mon = getMon(key);
          if (!mon) {
            let best = null;
            let bestScore = 0;
            for (const m of DEX_LIST) {
              const score = similarity(key, normalizeKey(m.name));
              if (score > bestScore) { best = m; bestScore = score; }
            }
            if (best && bestScore >= 0.8) mon = best;
          }
          if (mon) fuzzySet.add(mon.name);
        }
        names = [...fuzzySet];
      }
      return names
        .map(n => {
          const m = getMon(n);
          return m ? { ...m } : null;
        })
        .filter(Boolean);
    };

    let mons = fromPayload(liveBattleClient.lastPayload);
    if (!mons.length) {
      const fallback = window.liveBattleLastMons || [];
      mons = Array.isArray(fallback) ? fallback : [];
    }
    return (Array.isArray(mons) && mons.length) ? mons[0] : null;
  };

  return (
    <CaughtContext.Provider value={{ caught, toggleCaught }}>
    <ColorContext.Provider value={{ methodColors, rarityColors, setMethodColors, setRarityColors }}>
      <>
      {/* App-wide overlay controls (top-right) */}
      <div style={{ position:'fixed', top:10, right:12, zIndex:9999, display:'flex', gap:8 }}>
        <PatchNotesButton />
        <CaughtListButton />
        <ColorPickerButton />
        <OptionsMenu isWindows={isWindows} />
      </div>

{showUpToDate && (
        <div
          style={{
            position:'fixed',
            top:10,
            left:'50%',
            transform:'translateX(-50%)',
            zIndex:9999,
            padding:'8px 12px',
            background:'var(--surface)',
            color:'var(--text)',
            borderRadius:10,
            border:'1px solid var(--divider)',
            boxShadow:'0 8px 28px rgba(0,0,0,.45)',
            fontWeight:700,
            pointerEvents:'none'
          }}
        >
          Up to date
        </div>
      )}

{mode === 'home' ? (
        <HomeScreen setMode={setMode} isWindows={isWindows} />
      ) : (
      <div className="container">
        {/* Header */}
        <div className="header" style={{ alignItems:'center', cursor:'pointer' }} onClick={()=>setMode('home')}>
          <img src={headerSrc} alt="" style={{ width:56, height:56, objectFit:'contain', imageRendering:'pixelated' }} />
          <h1 style={{ marginLeft:8 }}>3&apos;s PokeMMO Tool</h1>
        </div>

        {/* Search / Mode Card */}
        <div style={{ ...styles.card, marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={styles.segWrap}>
              <button style={styles.segBtn(mode==='pokemon')} onClick={()=>setMode('pokemon')}>Pokemon Search</button>
              <button style={styles.segBtn(mode==='areas')} onClick={()=>setMode('areas')}>Area Search</button>
              <button style={styles.segBtn(mode==='tm')} onClick={()=>setMode('tm')}>TM Locations</button>
              <button style={styles.segBtn(mode==='items')} onClick={()=>setMode('items')}>Items</button>
              <button style={styles.segBtn(mode==='breeding')} onClick={()=>setMode('breeding')}>Breeding</button>
              <button style={styles.segBtn(mode==='team')} onClick={()=>setMode('team')}>Team Builder</button>
              <button style={styles.segBtn(mode==='market')} onClick={()=>setMode('market')}>Market</button>
            </div>
            {isWindows && (
              <div style={{ ...styles.segWrap, marginLeft:'auto' }}>
                <button style={styles.segBtn(mode==='live')} onClick={()=>setMode('live')}>Live Route</button>
                <button style={styles.segBtn(mode==='battle')} onClick={()=>setMode('battle')}>Live Battle</button>
              </div>
            )}
          </div>
          {isLinux && (
            <div className="label-muted" style={{ marginBottom:8 }}>
              Live route tracking is unavailable on Linux.
            </div>
          )}

          {mode==='pokemon' && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:8 }}>
              <select
                value={typeFilter}
                onChange={e=>setTypeFilter(e.target.value)}
                className="input"
                style={{ height:44, borderRadius:10, width:'auto' }}
              >
                <option value="">Type</option>
                {typeOptions.map(t => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
              {Boolean(typeFilter) && (
                <select
                  value={typeFilter2}
                  onChange={e=>setTypeFilter2(e.target.value)}
                  className="input"
                  style={{ height:44, borderRadius:10, width:'auto' }}
                >
                  <option value="">Type</option>
                  {typeOptions.map(t => <option key={`t2-${t}`} value={t}>{titleCase(t)}</option>)}
                </select>
              )}
              <select
                value={eggFilter}
                onChange={e=>setEggFilter(e.target.value)}
                className="input"
                style={{ height:44, borderRadius:10, width:'auto' }}
              >
                <option value="">Egg Group</option>
                {eggGroupOptions.map(g => <option key={g} value={g}>{titleCase(g)}</option>)}
              </select>
              <select
                value={abilityFilter}
                onChange={e=>setAbilityFilter(e.target.value)}
                className="input"
                style={{ height:44, borderRadius:10, width:'auto' }}
              >
                <option value="">Ability</option>
                {abilityOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select
                value={regionFilter}
                onChange={e=>setRegionFilter(e.target.value)}
                className="input"
                style={{ height:44, borderRadius:10, width:'auto' }}
              >
                <option value="">Region</option>
                {pokemonRegionOptions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <SearchFilter
                value={moveFilter}
                onChange={setMoveFilter}
                options={moveOptions}
                placeholder="Move"
              />
              <SearchFilter
                value={itemFilter}
                onChange={setItemFilter}
                options={itemOptions}
                placeholder="Held Item"
              />
              <button
                type="button"
                className={`region-btn${compareMode ? ' compare-active' : ''}`}
                aria-pressed={compareMode}
                onClick={() => {
                  setMode('pokemon');
                  if (compareMode) {
                    setCompareMode(false);
                    setCompareA(null);
                    setCompareB(null);
                    setSelected(null);
                    setQuery('');
                  } else {
                    setCompareMode(true);
                  }
                }}
                title="Compare"
              >
                Compare
              </button>
              {(hasFilters || compareMode) && (
                <button
                  type="button"
                  className="region-btn"
                  onClick={() => {
                    // Reset all Pokemon filters and deactivate Compare
                    setTypeFilter('');
                    setTypeFilter2('');
                    setEggFilter('');
                    setAbilityFilter('');
                    setRegionFilter('');
                    setMoveFilter('');
                    setMoveLevelOnly(false);
                    setItemFilter('');
                    if (compareMode) {
                      setCompareMode(false);
                      setCompareA(null);
                      setCompareB(null);
                    }
                  }}
                  title="Clear Filters"
                >
                  Clear Filters
                </button>
              )}
              {/* Compare toggle moved to top menu and profile header */}
            </div>
          )}

          {/* Context label + search input (hidden for Live) */}
          {mode!=='live' && mode!=='battle' && mode!=='breeding' && mode!=='team' && (
            <>
               <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div className="label-muted">
                  {mode==='pokemon'
                    ? 'Search by name or Dex #'
                    : mode==='areas'
                    ? 'Search by route/area name'
                    : mode==='tm'
                    ? 'Search by TM name'
                    : 'Search by item name'}
                </div>
                {mode==='pokemon' && moveFilter && (
                  <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
                    <input
                      type="checkbox"
                      checked={moveLevelOnly}
                      onChange={e=>setMoveLevelOnly(e.target.checked)}
                    />
                    Level-up only
                  </label>
                )}
                {mode==='areas' && (
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div ref={infoRef} style={{ position:'relative' }}>
                      <button
                        className="region-btn"
                        onClick={() => setShowInfoMenu(v => !v)}
                      >
                        Encounter Info ▾
                      </button>
                      {showInfoMenu && (
                        <div
                          style={{ position:'absolute', right:0, top:'100%', marginTop:4, padding:8, background:'var(--surface)', border:'1px solid var(--divider)', borderRadius:8, zIndex:20, display:'flex', flexDirection:'column', gap:4 }}
                        >
                          <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <input
                              type="checkbox"
                              checked={showCaught}
                              onChange={e=>setShowCaught(e.target.checked)}
                            />
                            Toggle Caught
                          </label>
                          <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <input
                              type="checkbox"
                              checked={showEvYield}
                              onChange={e=>setShowEvYield(e.target.checked)}
                            />
                            EV Yield
                          </label>
                          <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <input
                              type="checkbox"
                              checked={showCatchRate}
                              onChange={e=>setShowCatchRate(e.target.checked)}
                            />
                            Catch Rate
                          </label>
                          <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <input
                              type="checkbox"
                              checked={showCatchPercent}
                              onChange={e=>setShowCatchPercent(e.target.checked)}
                            />
                            Catch %
                          </label>
                          <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <input
                              type="checkbox"
                              checked={showHeldItem}
                              onChange={e=>setShowHeldItem(e.target.checked)}
                            />
                            Held Item
                          </label>
                          <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <input
                              type="checkbox"
                              checked={showLevel}
                              onChange={e=>setShowLevel(e.target.checked)}
                            />
                            Level
                          </label>
                        </div>
                      )}
                    </div>
                    <div ref={methodFilterRef} style={{ position:'relative' }}>
                      <button
                        className="region-btn"
                        style={{ display:'flex', alignItems:'center', gap:4 }}
                        onClick={() => setShowMethodMenu(v => !v)}
                      >
                        Encounter Type ▾
                      </button>
                      {showMethodMenu && (
                        <div
                          style={{ position:'absolute', right:0, top:'100%', marginTop:4, padding:8, background:'var(--surface)', border:'1px solid var(--divider)', borderRadius:8, zIndex:20, display:'flex', flexDirection:'column', gap:4 }}
                        >
                          {ENCOUNTER_TYPES.map(t => (
                            <label key={t} className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                              <input
                                type="checkbox"
                                checked={methodFilters.has(t)}
                                onChange={() => toggleMethodFilter(t)}
                              />
                              {t}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ position:'relative' }}>
                      <button
                        type="button"
                        onClick={()=> setShowRegionMenu(v => !v)}
                        className="region-btn"
                      >
                        {areaRegion === 'All' ? 'Region' : areaRegion}
                      </button>
                      {showRegionMenu && (
                        <div className="region-menu">
                          {regionOptions.map(r => (
                            <button
                              type="button"
                              key={r}
                              onClick={()=> { setAreaRegion(r); setShowRegionMenu(false); }}
                              className={r===areaRegion ? 'active' : undefined}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {mode==='tm' && (
                  <div style={{ position:'relative' }}>
                    <button
                      type="button"
                      onClick={()=> setShowRegionMenu(v => !v)}
                      className="region-btn"
                    >
                      {areaRegion === 'All' ? 'Region' : areaRegion}
                    </button>
                    {showRegionMenu && (
                      <div className="region-menu">
                        {regionOptions.map(r => (
                          <button
                            type="button"
                            key={r}
                            onClick={()=> { setAreaRegion(r); setShowRegionMenu(false); }}
                            className={r===areaRegion ? 'active' : undefined}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <input
                value={mode==='areas' ? areaQuery : query}
                onChange={(e)=> {
                  if (mode==='areas') setAreaQuery(e.target.value);
                  else setQuery(e.target.value);
                }}
                onFocus={() => {
                  if (mode==='areas') setAreaQuery('');
                  else setQuery('');
                }}
                placeholder={mode==='pokemon'
                  ? 'e.g. Garchomp or 445'
                  : mode==='areas'
                  ? 'e.g. Victory Road, Viridian Forest, Route 10'
                  : mode==='tm'
                  ? 'e.g. Giga Drain, Payback'
                  : 'e.g. Master Ball, Shiny Charm'}
                className="input"
                style={{ height:44, borderRadius:10, fontSize:16 }}
              />
            </>
          )}

          {/* Live route panel */}
          {mode==='live' && isWindows && (
            <div style={{ marginTop:4 }}>
              <LiveRoutePanel
                areasIndex={areasClean}
                locIndex={locIndex}
                onViewMon={(mon) => { setSelected(mon); setMode('pokemon'); }}
              />
            </div>
          )}

          {/* Live battle panel */}
          {mode==='battle' && isWindows && (
            <div style={{ marginTop:4 }}>
              <LiveBattlePanel
                onViewMon={(mon) => { setSelected(mon); setMode('pokemon'); }}
                onCompare={(mon) => {
                  setCompareMode(true);
                  setCompareA(mon);
                  setCompareB(null);
                  setMode('pokemon');
                  setQuery('');
                }}
              />
            </div>
          )}

          {/* Breeding simulator */}
          {mode==='breeding' && (
            <div style={{ marginTop:4 }}>
              <BreedingSimulator />
            </div>
          )}

          {/* Team builder */}
          {mode==='team' && (
            <div style={{ marginTop:4 }}>
              <TeamBuilder
                onViewMon={(val) => {
                  let target = null;
                  if (val && typeof val === 'object') {
                    target = getMon(val.name) || getMonByDex(val.id);
                  } else if (val) {
                    target = getMon(String(val));
                  }
                  if (target) {
                    setSelected(target);
                    setMode('pokemon');
                  }
                }}
              />
            </div>
          )}

          {/* Recent selections (session) shown when Pokemon search is blank and no filters are active */}
          {mode==='pokemon' && !query.trim() && !hasFilters && recentFiltered.length > 0 && !(compareMode && compareA && compareB) && (
            <div style={{ marginTop:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <div className="label-muted" style={{ fontWeight:700 }}>Recent</div>
                <button
                  type="button"
                  className="link-btn"
                  style={{ background:'none', border:0, padding:0, color:'var(--accent)', fontWeight:700, cursor:'pointer' }}
                  onClick={() => {
                    setRecentMons([]);
                    try { sessionStorage.removeItem('recentMons'); } catch {}
                  }}
                >
                  Clear Recents
                </button>
              </div>
              <div className="result-grid">
                {recentFiltered.map((r) => {
                  const mon = getMonByDex(r.id);
                  if (!mon) return null;
                  const t = [...new Set((mon.types || []).map(normalizeType))];
                  return (
                    <button
                      key={`recent-${r.id}`}
                      onClick={()=>{
                        if (compareMode) {
                          if (!compareA || (compareA && compareB)) {
                            setCompareA(mon);
                            setCompareB(null);
                            setSelected(null);
                            setQuery('');
                          } else if (compareA && !compareB) {
                            if (!sameMon(compareA, mon)) {
                              setCompareB(mon);
                              setQuery('');
                              setSelected(null);
                            }
                          }
                        } else {
                          setSelected(mon);
                          setQuery('');
                        }
                      }}
                      className="result-tile"
                      style={{ alignItems:'center', padding:10, borderRadius:12, border:'1px solid var(--divider)', background:'var(--surface)' }}
                    >
                      <Sprite mon={mon} size={42} alt={mon.name} />
                      <div style={{ textAlign:'left' }}>
                        <div style={{ fontWeight:800 }}>{titleCase(mon.name)}</div>
                        <div className="label-muted">Dex #{mon.id}</div>
                        <div style={{ display:'flex', gap:6, marginTop:6 }}>
                          {t.map(tp => <TypePill key={`r-${r.id}-${tp}`} t={tp} compact />)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pokemon results */}
          {mode==='pokemon' && !(compareMode && compareA && compareB) && !!combinedResults.length && (
            <div className="result-grid" style={{ marginTop:12 }}>
              {combinedResults.map(p => {
                const mon = p;
                const t = [...new Set((p.types || []).map(normalizeType))];
                return (
                  <button
                    key={`${p.id}-${p.name}`}
                    onClick={()=>{
                      if (compareMode) {
                        if (!compareA || (compareA && compareB)) {
                          setCompareA(p);
                          setCompareB(null);
                          setQuery('');
                        } else if (compareA && !compareB) {
                          if (!sameMon(compareA, p)) {
                            setCompareB(p);
                            setQuery('');
                          }
                        }
                      } else {
                        setSelected(p);
                        setQuery('');
                      }
                    }}
                    className={`result-tile${compareMode && compareA && sameMon(p, compareA) ? ' compare-selected' : ''}`}
                      style={{ alignItems:'center', padding:10, borderRadius:12, border:'1px solid var(--divider)', background:'var(--surface)' }}
                  >
                    <Sprite mon={mon} size={42} alt={p.name} />
                    <div style={{ textAlign:'left' }}>
                      <div style={{ fontWeight:800 }}>{titleCase(p.name)}</div>
                      <div className="label-muted">Dex #{p.id}</div>
                      <div style={{ display:'flex', gap:6, marginTop:6 }}>
                        {t.map(tp => <TypePill key={tp} t={tp} compact />)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {mode==='pokemon' && compareMode && (
            <CompareView
              left={compareA}
              right={compareB}
              onClearLeft={() => { setCompareA(compareB); setCompareB(null); setSelected(null); setQuery(''); }}
              onClearRight={() => { setCompareB(null); setSelected(null); setQuery(''); }}
              onReplaceLeft={() => {
                const mon = getLatestLiveBattleMon();
                if (!mon) return; // No notifications
                if (!compareA || normalizeKey(compareA.name) !== normalizeKey(mon.name)) {
                  setCompareA(mon);
                }
              }}
              onReplaceRight={() => {
                const mon = getLatestLiveBattleMon();
                if (!mon) return; // No notifications
                if (!compareB || normalizeKey(compareB.name) !== normalizeKey(mon.name)) {
                  setCompareB(mon);
                }
              }}
              onReplaceLeftFromTeam={(picked) => {
                if (!picked) return;
                if (!compareA || normalizeKey(compareA.name) !== normalizeKey(picked.name)) {
                  setCompareA(picked);
                }
              }}
              onReplaceRightFromTeam={(picked) => {
                if (!picked) return;
                if (!compareB || normalizeKey(compareB.name) !== normalizeKey(picked.name)) {
                  setCompareB(picked);
                }
              }}
            />
          )}

          {/* Area results */}
          {mode==='areas' && !!areaHits.length && (
            <div style={{ marginTop:12, display:'grid', gap:12 }}>
              {areaHits.map(hit => (
                <div key={`${hit.region}-${hit.map}`} style={styles.areaCard}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                    <div style={{ fontWeight:800, fontSize:16 }}>
                      {hit.map} <span className="label-muted">({hit.region})</span>
                    </div>
                    <div className="label-muted">{hit.count} Pokemon</div>
                  </div>

                  <div style={{ ...styles.gridCols, marginTop:10 }}>
                    {hit.entries.map((g, idx) => {
                      const mon = getMon(g.monName);
                      const isCaught = mon ? caught.has(mon.id) : false;
                      return (
                        <AreaMonCard
                          key={idx}
                          mon={mon}
                          monName={g.monName}
                          encounters={g.encounters}
                          onView={(m) => {
                            setSelected(m);
                            setMode('pokemon');
                          }}
                          caught={isCaught}
                          showCaught={showCaught}
                          showEv={showEvYield}
                          showCatchRate={showCatchRate}
                          showCatchPercent={showCatchPercent}
                          showHeldItem={showHeldItem}
                          showLevel={showLevel}
                          onToggleCaught={() => mon && toggleCaught(mon.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* TM results */}
          {mode==='tm' && !!tmHits.length && (
            <div style={{ marginTop:12, display:'grid', gap:12 }}>
              {tmHits.map((hit, idx) => (
                <div key={`${hit.region}-${hit.tm}-${idx}`} style={styles.areaCard}>
                  <div style={{ fontWeight:800, fontSize:16 }}>
                    {hit.tm} <span className="label-muted">({hit.region})</span>
                  </div>
                  <div style={{ marginTop:6 }}>{hit.location}</div>
                </div>
              ))}
            </div>
          )}

          {/* Item results */}
          {mode==='items' && !!itemHits.length && (
            <div style={{ marginTop:12, display:'grid', gap:12 }}>
              {itemHits.map(item => (
                <div key={item.id} style={styles.areaCard}>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <img
                      src={`${ITEM_ICON_BASE}${item.id}.png`}
                      alt={item.name}
                      style={{ width:36, height:36, imageRendering:'pixelated' }}
                      onError={e => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = ITEM_PLACEHOLDER;
                        e.currentTarget.style.imageRendering = 'auto';
                      }}
                    />
                    <div>
                      <div style={{ fontWeight:800 }}>{item.name}</div>
                      <div style={{ whiteSpace:'pre-line' }}>{item.description}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Market results */}
          {mode==='market' && (
            <div style={{ marginTop:12 }}>
              {marketLoading && (
                <div className="label-muted">Loading market dataâ€¦</div>
              )}
              {marketError && (
                <div className="label-error">{marketError}</div>
              )}
              {!marketLoading && !marketError && (
                <div style={{ display:'grid', gap:12 }}>
                  {marketResults.map((item, idx) => (
                    <div
                      key={item.id ?? idx}
                      style={{ ...styles.areaCard, cursor:'pointer' }}
                      onClick={() => openMarketItem(item)}
                    >
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                          <img
                            src={`${ITEM_ICON_BASE}${item.id}.png`}
                            alt={item.name}
                            style={{ width:36, height:36, imageRendering:'pixelated' }}
                            onError={e => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = ITEM_PLACEHOLDER;
                              e.currentTarget.style.imageRendering = 'auto';
                            }}
                          />
                          <div style={{ fontWeight:800 }}>
                            {item.name}
                          </div>
                        </div>
                        {item.price != null ? (
                          <div>â‚½ {Number(item.price).toLocaleString()}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {!marketResults.length && (
                    <div className="label-muted">No market data.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail Panel (Pokemon) */}
          {mode==='pokemon' && resolved && !(compareMode && (compareA || compareB)) && (
             <>
            <div ref={detailRef} className="grid">
            {/* Left: Pokemon card */}
            <div style={{ ...styles.card, position:'relative' }}>
              <div style={{ position:'relative' }}>
                <button
                  type="button"
                  onClick={() => toggleCaught(resolved.id)}
                  title={(caught.has(resolved.id) ? 'Mark as uncaught' : 'Mark as caught')}
                  style={{ position:'absolute', top:8, right:8, background:'transparent', border:'none', cursor:'pointer', padding:0 }}
                >
                  <PokeballIcon filled={caught.has(resolved.id)} />
                </button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:12, alignItems:'start' }}>
                <div>
                  <Sprite mon={selected} size={120} alt={resolved.name} />
                </div>
                <div>
                  <div style={{ fontSize:22, fontWeight:900 }}>
                    {titleCase(resolved.name)} <span className="label-muted" style={{ fontSize:'50%' }}>#{resolved.id}</span>
                  </div>
                  <div style={{ position:'relative', marginTop:6 }}>
                    <div
                      style={{
                        display: 'grid',
                        gap: 12,
                        alignItems: 'start',
                        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                        gridAutoRows: 'min-content',
                        position: 'relative',
                        zIndex: 1
                      }}
                    >
                    {/* Column 1: Type — 4 rows (label, type1, type2, blank) */}
                    <div style={{ gridColumn: '1', gridRow:'1', display:'flex', alignItems:'center' }}>
                      <span className="label-muted" style={{ fontWeight:700 }}>Type</span>
                    </div>
                    <div style={{ gridColumn: '1', gridRow:'2' }}>
                      {resolved.types?.[0] ? (
                        <TypePill
                          t={resolved.types[0]}
                          onClick={() => {
                            setMode('pokemon');
                            setSelected(null);
                            setQuery('');
                            setTypeFilter(normalizeType(resolved.types[0]));
                            setTypeFilter2('');
                          }}
                        />
                      ) : (
                        <span className="label-muted">N/A</span>
                      )}
                    </div>
                    <div style={{ gridColumn: '1', gridRow:'3' }}>
                      {resolved.types?.[1] ? (
                        <TypePill
                          t={resolved.types[1]}
                          onClick={() => {
                            setMode('pokemon');
                            setSelected(null);
                            setQuery('');
                            setTypeFilter(normalizeType(resolved.types[1]));
                            setTypeFilter2('');
                          }}
                        />
                      ) : null}
                    </div>
                    <div style={{ gridColumn: '1', gridRow:'4' }} />

                    {/* Column 2: Egg Group — 4 rows (label, group1, group2, blank) */}
                    <div style={{ gridColumn: '2', gridRow:'1', display:'flex', alignItems:'center' }}>
                      <span className="label-muted" style={{ fontWeight:700 }}>Egg Group</span>
                    </div>
                    <div style={{ gridColumn: '2', gridRow:'2' }}>
                      {resolved.eggGroups?.[0] ? (
                        <EggGroupPill
                          group={resolved.eggGroups[0]}
                          onClick={() => {
                            setMode('pokemon');
                            setSelected(null);
                            setQuery('');
                            setEggFilter(normalizeEggGroup(resolved.eggGroups[0]));
                          }}
                        />
                      ) : (
                        <span className="label-muted">N/A</span>
                      )}
                    </div>
                    <div style={{ gridColumn: '2', gridRow:'3' }}>
                      {resolved.eggGroups?.[1] ? (
                        <EggGroupPill
                          group={resolved.eggGroups[1]}
                          onClick={() => {
                            setMode('pokemon');
                            setSelected(null);
                            setQuery('');
                            setEggFilter(normalizeEggGroup(resolved.eggGroups[1]));
                          }}
                        />
                      ) : null}
                    </div>
                    <div style={{ gridColumn: '2', gridRow:'4' }} />

                    {/* Column 3: Abilities — label + rows for 1,2,Hidden */}
                    <div style={{ gridColumn: '3', gridRow:'1', display:'flex', alignItems:'center' }}>
                      <span className="label-muted" style={{ fontWeight:700 }}>Abilities</span>
                    </div>
                    {([0,1,2]).map(i => (
                      <div key={`ab-row-${i}`} style={{ gridColumn: '3', gridRow: String(i+2), display:'flex', gap:6, alignItems:'center' }}>
                        <AbilityPill
                          label={i === 2 ? 'Hidden' : `${i + 1}`}
                          name={resolved.abilities?.[i]?.name}
                        />
                      </div>
                    ))}

                    {/* Column 4: Held Items, EV Yield, Catch Rate, Catch % (+ toggles) */}
                    {(() => {
                      const evMap = {
                        ev_hp: 'HP',
                        ev_attack: 'Atk',
                        ev_defense: 'Def',
                        ev_sp_attack: 'SpA',
                        ev_sp_defense: 'SpD',
                        ev_speed: 'Spe'
                      };
                      const yields = resolved.yields || {};
                      const evParts = Object.entries(evMap)
                        .filter(([k]) => (yields[k] || 0) > 0)
                        .map(([k, label]) => `${yields[k]} ${label}`);
                      const evText = evParts.length ? evParts.join(', ') : 'None';

                      
                        const heldItems = resolved.heldItems || [];
                        const firstHeld = heldItems[0];
                        const hasMoreHeld = heldItems.length > 1;
                        const renderItem = (h, i) => {
                          const item = ITEM_INDEX.byId.get(h.id) || ITEM_INDEX.byName.get(normalizeKey(h.name || h));
                          return (
                            <span key={h.id || h.name || i} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                              <img
                                src={h.id ? `${ITEM_ICON_BASE}${h.id}.png` : ITEM_PLACEHOLDER}
                                alt={h.name || h}
                                style={{ width:24, height:24, imageRendering:'pixelated' }}
                                onError={e => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = ITEM_PLACEHOLDER;
                                  e.currentTarget.style.imageRendering = 'auto';
                                }}
                              />
                              <DelayedTooltip content={item?.description || ''}>
                                <span style={{ fontWeight:600, color:'var(--accent)', cursor:'help' }}>{h.name || h}</span>
                              </DelayedTooltip>
                            </span>
                          );
                        };
                        const heldContent = heldItems.length > 0 ? (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                            {renderItem(firstHeld, 0)}
                            {hasMoreHeld && (
                              <button
                                type="button"
                                onClick={() => setShowAllHeld(v => !v)}
                                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)' }}
                              >
                                {showAllHeld ? '▲' : '▼'}
                              </button>
                            )}
                          </span>
                        ) : 'None';

                        return (
                          <>
                            <div style={{ gridColumn:'4', gridRow:'1', position:'relative' }}>
                              <div
                                style={{
                                  display:'flex',
                                  alignItems:'center',
                                  gap:6,
                                  padding:'4px 8px',
                                  borderRadius:8,
                                  background:'var(--surface)',
                                  border:'1px solid var(--divider)'
                                }}
                              >
                                <span className="label-muted" style={{ fontSize:12 }}>Held Items</span>
                                {heldContent}
                              </div>
                              {hasMoreHeld && showAllHeld && (
                                <div
                                  style={{
                                    position:'absolute',
                                    top:'100%',
                                    left:0,
                                    marginTop:4,
                                    background:'var(--surface)',
                                    border:'1px solid var(--divider)',
                                    borderRadius:8,
                                    padding:'4px 8px',
                                    zIndex:10,
                                    display:'flex',
                                    flexDirection:'column',
                                    gap:4
                                  }}
                                >
                                {heldItems.slice(1).map((h,i) => (
                                  renderItem(h, i+1)
                                ))}
                                </div>
                              )}
                            </div>
                          <div style={{ gridColumn:'4', gridRow:'2' }}>
                            <LabeledPillBox label="EV Yield" value={evText} />
                          </div>
                          <div style={{ gridColumn:'4', gridRow:'3' }}>
                            <LabeledPillBox label="Catch Rate" value={resolved.catchRate ?? 'N/A'} />
                          </div>
                          <div style={{ gridColumn:'4', gridRow:'4', display:'flex', alignItems:'center', gap:6 }}>
                            <LabeledPillBox label="Catch %" value={catchPercent != null ? `${catchPercent.toFixed(1)}%` : 'N/A'} />
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6, marginLeft:'auto' }}>
                              <button
                                type="button"
                                onClick={() => setIsAsleep(v => !v)}
                                title="Toggle Sleep"
                                style={{
                                  opacity: isAsleep ? 1 : 0.5,
                                  background: isAsleep ? 'var(--accent)' : 'var(--chip-bg)',
                                  border: `1px solid ${isAsleep ? 'var(--accent)' : 'var(--chip-br)'}`,
                                  color: isAsleep ? '#111' : 'var(--text)',
                                  borderRadius: 6,
                                  padding: '3px 8px',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                  fontSize: 13
                                }}
                              >
                                zZz
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsOneHp(v => !v)}
                                title="Toggle 1 HP"
                                style={{
                                  opacity: isOneHp ? 1 : 0.5,
                                  background: isOneHp ? '#f87171' : 'var(--chip-bg)',
                                  border: `1px solid ${isOneHp ? '#f87171' : 'var(--chip-br)'}`,
                                  color: isOneHp ? '#111' : 'var(--text)',
                                  borderRadius: 6,
                                  padding: '3px 8px',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                  fontSize: 13
                                }}
                              >
                                1HP
                              </button>
                            </span>
                          </div>
                        </>
                      );
                    })()}
                    </div>
                    <div
                      style={{
                        position:'absolute',
                        inset:0,
                        pointerEvents:'none',
                        display:'grid',
                        gridTemplateColumns:'repeat(4, minmax(0, 1fr))',
                        gap:12,
                        zIndex:0
                      }}
                    >
                      {[0,1,2,3].map(i => (
                        <div
                          key={`colbox-${i}`}
                          style={{
                            border: '1px solid var(--divider)',
                            borderRadius: 8,
                            height: '105%',
                            margin: '0 -6px'
                          }}
                        />
                      ))}
                    </div>
                  </div>

                </div>

                {/* Row 2, Column 1: Compare button centered under sprite */}
                <div style={{ gridColumn:'1', display:'flex', justifyContent:'center', alignItems:'center', gap:8, marginTop:8 }}>
                  <button
                    type="button"
                    className={`region-btn${compareMode ? ' compare-active' : ''}`}
                    aria-pressed={compareMode}
                    onClick={() => {
                      // Always enter compare mode with this mon as slot A,
                      // close the profile, and prep for selecting the next.
                      setCompareMode(true);
                      setCompareA(resolved);
                      setCompareB(null);
                      setSelected(null);
                      setQuery('');
                    }}
                    title="Compare"
                  >
                    Compare
                  </button>
                  {(hasFilters || compareMode) && (
                    <button
                      type="button"
                      className="region-btn"
                      onClick={() => {
                        setTypeFilter('');
                        setTypeFilter2('');
                        setEggFilter('');
                        setAbilityFilter('');
                        setRegionFilter('');
                        setMoveFilter('');
                        setMoveLevelOnly(false);
                        setItemFilter('');
                        if (compareMode) {
                          setCompareMode(false);
                          setCompareA(null);
                          setCompareB(null);
                        }
                      }}
                      title="Clear Filters"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                {/* Row 2, Column 2: Info pills */}
                <div
                  style={{
                    gridColumn:'2',
                    display: 'grid',
                    gap: 6,
                    marginTop: 8,
                    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                    alignItems: 'stretch'
                  }}
                >
                  <InfoPill label="Exp" value={titleCase((resolved.expType || '').replace(/_/g, ' '))} />
                  <InfoPill label="Gender" value={formatGenderRatio(resolved.genderRatio)} />
                  <InfoPill label="Height" value={formatHeight(resolved.height)} />
                  <InfoPill label="Weight" value={formatWeight(resolved.weight)} />
                  <InfoPill label="Obtainable" value={resolved.obtainable ? 'Yes' : 'No'} />
                </div>

                {/* Row 3, Column 2: Forms (if multiple) */}
                {resolved.forms?.length > 1 && (
                  <div style={{ gridColumn:'2', display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                    <span className="label-muted" style={{ fontWeight:700 }}>Forms:</span>
                    {resolved.forms.map(f => <span key={f.form_id || f.id}>{f.name}</span>)}
                  </div>
                )}
              </div>
              {Object.keys(resolved.stats || {}).length > 0 && (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', alignItems:'end', margin:'16px 0 6px' }}>
                    <div className="label-muted" style={{ fontWeight:700, gridColumn:'1 / 7' }}>Base Stats</div>
                    <div style={{ gridColumn:'7 / 8', justifySelf:'end' }}>
                      <NatureSelect natureList={natureList} value={singleBuild.nature} onChange={(v)=> setSingleBuild(prev=> ({...prev, nature:v}))} />
                    </div>
                  </div>
                  <div style={{ display:'flex', justifyContent:'center' }}>
                    <div style={{ width:'100%' }}>
                      <StatsRow
                        mon={resolved}
                        override={singleOverride}
                        underlineKeys={singleUnderline}
                        build={singleBuild}
                        onSetIV={singleSetters.onSetIV}
                        onSetEV={singleSetters.onSetEV}
                        onSetLevel={singleSetters.onSetLevel}
                      />
                    </div>
                  </div>
                </>
              )}
              {/* Weakness table (dynamic/centered) */}
              <div style={{ marginTop:16 }}>
                <div className="label-muted" style={{ fontWeight:700, marginBottom:8 }}>Type Matchups</div>
                {(() => {
                  const blocks = [
                    { title: '4x Weak',     list: resolved.weakness.x4 || [] },
                    { title: '2x Weak',     list: resolved.weakness.x2 || [] },
                    { title: '1/2x Resist', list: resolved.weakness.x0_5 || [] },
                    { title: '1/4x Resist', list: resolved.weakness.x0_25 || [] },
                    { title: '0x Immune',   list: resolved.weakness.x0 || [] },
                  ].filter(b => (b.list?.length || 0) > 0);

                  if (!blocks.length) {
                    return <div className="label-muted">No notable matchups.</div>;
                  }

                  const isCompact = blocks.length === 5;
                  const cols = isCompact ? 5 : 4;
                  const cardPad = isCompact ? '8px 10px' : '12px 14px';
                  const gap = isCompact ? 6 : 10;

                  return (
                    <div style={{
                      display:'grid',
                      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                      gap,
                      alignItems:'stretch'
                    }}>
                      {blocks.map((b, i) => (
                        <div
                          key={`${b.title}-${i}`}
                          style={{
                            border:'1px solid var(--divider)',
                            borderRadius:8,
                            padding: cardPad,
                            background:'var(--surface)'
                          }}
                        >
                          <div style={{ fontWeight:800, marginBottom:isCompact ? 6 : 8, fontSize: isCompact ? 13 : 14 }}>{b.title}</div>
                          <div style={{ display:'flex', gap:isCompact ? 6 : 8, flexWrap:'wrap' }}>
                            {b.list.map(t => (
                              isCompact
                                ? <TypePill key={`${b.title}-${t}`} t={t} compact />
                                : <TypePill key={`${b.title}-${t}`} t={t} large />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>


              <EvolutionChain mon={resolved} onSelect={(m)=>{ setSelected(m); setShowMoveset(false); }} />

              {/* Close button moved to bottom-right of the info block */}
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
                <button
                  type="button"
                  className="region-btn"
                  onClick={() => { setSelected(null); setQuery(''); }}
                  title="Close"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Right: Locations */}
            <div style={{ ...styles.card, marginTop:16 }}>
             <div
                className="label-muted"
                style={{ fontWeight:700, cursor:'pointer', marginBottom: showLocations ? 6 : 0 }}
                onClick={() => setShowLocations(v => !v)}
              >
                {showLocations ? '▾' : '▸'} Locations
              </div>
              {showLocations && (
                <>
                  {byRegion.length === 0 && (<div className="label-muted">No wild locations found.</div>)}
                  {byRegion.map(([reg, list]) => (
                    <div key={reg} style={{ marginBottom:12 }}>
                      <div style={{ fontWeight:800, marginBottom:6 }}>{reg}</div>
                      <div style={{ display:'grid', gap:8 }}>
                        {list.map((loc, i) => (
                          <div key={i} style={{ border:'1px solid var(--divider)', borderRadius:10, padding:'8px 10px', background:'var(--surface)' }}>
                            <div style={{ fontWeight:700 }}>{loc.map}</div>
                            {(loc.min || loc.max) && (
                              <div className="label-muted" style={{ marginTop:4 }}>
                                {loc.min && loc.max ? `Lv ${loc.min}-${loc.max}` : `Lv ${loc.min || loc.max}`}
                              </div>
                            )}
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
                              {(Array.isArray(loc.method) ? loc.method : [loc.method])
                                .filter(Boolean)
                                .map((m, j) => <MethodPill key={`m-${i}-${j}-${m}`} method={m} />)}
                              {!(Array.isArray(loc.method) ? loc.method : [loc.method])
                                .some(m => /lure/i.test(m || '')) &&
                                (Array.isArray(loc.rarity) ? loc.rarity : [loc.rarity])
                                  .filter(Boolean)
                                  .map((r, j) => <RarityPill key={`r-${i}-${j}-${r}`} rarity={r} />)}
                            </div>
                          </div>
                        ))}
                  </div>
                </div>
                  ))}
                </>
              )}
        </div>
          </div>

          {MOVE_METHODS.some(m => (resolved.moves?.[m.key] || []).length) && (
            <div style={{ ...styles.card, marginTop:16 }}>
              <div
                className="label-muted"
                style={{ fontWeight:700, cursor:'pointer', marginBottom: showMoveset ? 6 : 0 }}
                onClick={() => setShowMoveset(v => !v)}
              >
                {showMoveset ? '▾' : '▸'} Moveset
              </div>
              {showMoveset && (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {MOVE_METHODS.map(m => (
                    <MovesTable
                      key={m.key}
                      title={m.label}
                      moves={resolved.moves[m.key] || []}
                      showLevel={m.key === 'lv'}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          </>
        )}
      </div>
      )}
      
      {marketSelected && (
        <div
          onClick={() => setMarketSelected(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '80%',
              height: '80%',
              background: 'var(--surface)',
              border: '1px solid var(--divider)',
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 10px',
                borderBottom: '1px solid var(--divider)'
              }}
            >
              <div style={{ fontWeight: 800 }}>{marketSelected.name}</div>
              <button
                onClick={() => setMarketSelected(null)}
                style={{ cursor: 'pointer' }}
              >
                X
              </button>
            </div>
            <webview
              src={`https://pokemmohub.com/items/${normalizeKey(marketSelected.name)}`}
              style={{ flex: 1 }}
            />
          </div>
        </div>
      )}

      {/* Fixed controls */}
      <ThemeButton theme={theme} setTheme={setTheme} />
      <VersionBadge />
    </>
    </ColorContext.Provider>
    </CaughtContext.Provider>
  );
}

export default App;







