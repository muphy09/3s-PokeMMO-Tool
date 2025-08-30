import React, { useEffect, useMemo, useState, useRef } from 'react';
import './index.css';
import dexRaw from '../UpdatedDex.json';
import itemsRaw from '../itemdata.json';
import VersionBadge from "./components/VersionBadge.jsx";
import OptionsMenu from './components/OptionsMenu.jsx';
import PatchNotesButton, { openPatchNotes } from './components/PatchNotesButton.jsx';
import ColorPickerButton from './components/ColorPickerButton.jsx';
import CaughtListButton from './components/CaughtListButton.jsx';
import MoveFilter from './components/MoveFilter.jsx';
import { ColorContext, DEFAULT_METHOD_COLORS, DEFAULT_RARITY_COLORS } from './colorConfig.js';
import { CaughtContext } from './caughtContext.js';

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
function formatConfidence(c){
  if (c == null || isNaN(c)) return null;
  const num = Number(c);
  const pct = num <= 1 ? Math.round(num * 100) : Math.round(num);
  // Bound 0..100
  return Math.max(0, Math.min(100, pct));
}

const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

/* ---------- small style helpers ---------- */
const styles = {
  segWrap: { display:'inline-flex', border:'1px solid #2f2f2f', background:'#171717', borderRadius:999, padding:4, gap:4 },
  segBtn(active){ return {
    appearance:'none', border:0, padding:'8px 14px', borderRadius:999, fontWeight:700, cursor:'pointer',
    transition:'all .15s ease', background: active?'linear-gradient(180deg,#2f2f2f,#1f1f1f)':'transparent',
    color: active?'#fff':'#cfcfcf', boxShadow: active?'inset 0 0 0 1px #3a3a3a, 0 4px 18px rgba(0,0,0,.35)':'none'
  };},
  card: { padding:16, borderRadius:12, border:'1px solid #262626', background:'#111' },
  areaCard: { padding:12, borderRadius:12, border:'1px solid #262626', background:'#0f0f0f' },
  gridCols: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:10 },
  monCard: { position:'relative', display:'flex', flexDirection:'column', alignItems:'center', gap:8, border:'1px solid #262626', borderRadius:10, padding:'10px', background:'#141414', textAlign:'center' },
  encWrap: { display:'flex', justifyContent:'center', gap:8, flexWrap:'wrap', marginTop:8 },
  encCol: { display:'flex', flexDirection:'column', alignItems:'center', gap:4 },
  viewBtn: {
    padding:'6px 10px',
    border:'1px solid var(--accent)',
    borderRadius:8,
    background:'var(--accent)',
    color:'#111',
    fontWeight:700,
    cursor:'pointer'
  }
};

/* ---------- utils ---------- */
function titleCase(s=''){ return String(s).split(' ').map(w => (w? w[0].toUpperCase()+w.slice(1).toLowerCase():w)).join(' '); }
function normalizeKey(s=''){
  return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim();
}
function normalizeType(t){ return String(t||'').toLowerCase().trim(); }
function normalizeRegion(r=''){ return String(r||'').toLowerCase().replace(/\s+/g,'').trim(); }
const keyName = (s = "") => s.trim().toLowerCase().replace(/\s+/g, " ");

/* ---------- pokedex adapter ---------- */
// Build lookups to help resolve form data and skip standalone form entries
const RAW_DEX_BY_ID = new Map(dexRaw.map(m => [m.id, m]));
const FORM_IDS = new Set();
for (const mon of dexRaw) {
  if (Array.isArray(mon.forms)) {
    for (const f of mon.forms) {
      if (typeof f.id === 'number' && f.id !== mon.id) {
        FORM_IDS.add(f.id);
      }
    }
  }
}

function toLegacyShape(m){
  const types = Array.isArray(m.types) ? [...new Set(m.types.map(normalizeType))] : [];
  return {
    id: m.id,
    name: m.name,
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
        .filter(f => f.id !== m.id)
        .map(f => {
          const formBase = RAW_DEX_BY_ID.get(f.id) || {};
          const raw = f.name || '';
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
  for (const m of DEX_LIST) map.set(normalizeKey(m.name), m);
  return map;
})();
const getMon = (s) => DEX_BY_NAME.get(normalizeKey(s)) || null;
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
function Sprite({ mon, size=42, alt='' }){
  const srcs = React.useMemo(()=> spriteSources(mon), [mon]);
  const [idx, setIdx] = useState(0);
  const [pokeSrc, setPokeSrc] = useState(null);
  useEffect(()=>{ setIdx(0); setPokeSrc(null); }, [mon]);
  const src = pokeSrc || srcs[idx] || TRANSPARENT_PNG;

  const handleError = () => {
    if (idx < srcs.length - 1) {
      setIdx(idx + 1);
    } else if (!pokeSrc && mon?.slug) {
      fetch(`https://pokeapi.co/api/v2/pokemon/${mon.slug}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          const s = d?.sprites?.front_default || d?.sprites?.other?.["official-artwork"]?.front_default;
          if (s) setPokeSrc(s);
        })
        .catch(()=>{});
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

/* ---------- Type colors (Gen 1–5) ---------- */
const TYPE_COLORS = {
  normal:'#A8A77A', fire:'#EE8130', water:'#6390F0', electric:'#F7D02C',
  grass:'#7AC74C', ice:'#96D9D6', fighting:'#C22E28', poison:'#A33EA1',
  ground:'#E2BF65', flying:'#A98FF3', psychic:'#F95587', bug:'#A6B91A',
  rock:'#B6A136', ghost:'#735797', dragon:'#6F35FC', dark:'#705746',
  steel:'#B7B7CE'
};
function TypePill({ t, compact=false }){
  const key = normalizeType(t);
  if (!key) return null;
  const bg = TYPE_COLORS[key] || '#555';
  return (
    <span title={titleCase(key)} style={{
      display:'inline-block', padding:compact?'2px 8px':'4px 10px', fontSize:compact?12:13, lineHeight:1,
      borderRadius:999, fontWeight:800, color:'#111', background:bg, border:'1px solid #00000022', textShadow:'0 1px 0 #ffffff55'
    }}>{titleCase(key)}</span>
  );
}

const EGG_GROUP_COLORS = {
  monster:'#A8A77A', plant:'#7AC74C', dragon:'#6F35FC', bug:'#A6B91A',
  flying:'#A98FF3', field:'#E2BF65', fairy:'#F95587', 'water a':'#6390F0',
  'water b':'#4C7CF0', 'water c':'#1D7BF4', chaos:'#705746', humanoid:'#C22E28',
  hmanoid:'#C22E28', ditto:'#F7D02C', mineral:'#B7B7CE', 'cannot breed':'#616161',
  genderless:'#616161'
};
function EggGroupPill({ group }){
  const key = normalizeEggGroup(group);
  if (!key) return null;
  const bg = EGG_GROUP_COLORS[key] || '#555';
  return (
    <span style={{
      display:'inline-block', padding:'4px 10px', fontSize:13, lineHeight:1,
      borderRadius:999, fontWeight:800, color:'#111', background:bg,
      border:'1px solid #00000022'
    }}>{titleCase(key)}</span>
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

function AbilityPill({ label, name }){
  if (!name) return null;
  const desc = useAbilityDesc(name);
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:6,
      padding:'4px 8px',
      borderRadius:8,
      background:'var(--surface)',
      border:'1px solid var(--divider)'
    }}>
      <span className="label-muted" style={{ fontSize:12 }}>{label}</span>
      <span style={{ fontWeight:600, color:'var(--accent)' }} title={desc}>{titleCase(name)}</span>
    </div>
  );
}

function InfoPill({ label, value }){
  if (value == null || value === '') return null;
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:4,
      padding:'2px 8px',
      borderRadius:8,
      background:'var(--surface)',
      border:'1px solid var(--divider)'
    }}>
      <span className="label-muted" style={{ fontSize:12 }}>{label}:</span>
      <span style={{ fontWeight:600 }}>{value}</span>
    </div>
  );
}

function formatHeight(h){ return h==null? '--' : `${(h/10).toFixed(1)} m`; }
function formatWeight(w){ return w==null? '--' : `${(w/10).toFixed(1)} kg`; }
function formatGenderRatio(r){
  if (r == null) return '--';
  const female = Math.round((r/255)*100);
  const male = 100 - female;
  return `${male}% ♂ / ${female}% ♀`;
}
/* ---------- Method & Rarity palettes ---------- */
function methodKey(m=''){ return String(m).toLowerCase().trim(); }

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
  return m;
}

function MethodPill({ method }){
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
      display:'inline-block', padding:'2px 8px', fontSize:12, borderRadius:999,
      color:'#111', background:bg, fontWeight:800, border:'1px solid #00000022'
    }}>
      {label}
    </span>
  );
}

/* ---- Rarity palette ---- */
function rarityKey(r=''){ return String(r).toLowerCase().trim(); }
function RarityPill({ rarity }){
  const { rarityColors } = React.useContext(ColorContext);
  if (!rarity) return null;
  const k = rarityKey(rarity);
  const isPercent = /^\d+%$/.test(k);
  const bg = isPercent ? '#13B5A6' : (rarityColors[k] || '#BDC3C7');
  const color = '#111';
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', fontSize:12, borderRadius:999,
      color, background:bg, fontWeight:800, border:'1px solid #00000022'
    }}>
      {rarity}
    </span>
  );
}

function LevelPill({ min, max }){
  const hasMin = min != null;
  const hasMax = max != null;
  if (!hasMin && !hasMax) return null;
  const label = hasMin && hasMax
    ? (min === max ? `Lv. ${min}` : `Lv. ${min}-${max}`)
    : `Lv. ${hasMin ? min : max}`;
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', fontSize:12, borderRadius:999,
      color:'#111', background:'#9e50aaff', fontWeight:800, border:'1px solid #00000022'
    }}>
      {label}
    </span>
  );
}

function ItemPill({ item }){
  if (!item) return null;
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', fontSize:12, borderRadius:999,
      color:'#111', background:'#F8E473', fontWeight:800, border:'1px solid #00000022'
    }}>
      {item}
    </span>
  );
}

function PokeballIcon({ filled=false, size=16 }){
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

function AreaMonCard({ mon, monName, encounters, onView, caught=false, onToggleCaught, showCaught=true }){
  const cardStyle = {
    ...styles.monCard,
    opacity: showCaught ? (caught ? 0.4 : 1) : 1
  };
  return (
    <div style={cardStyle}>
      {showCaught && (
        <button
          onClick={onToggleCaught}
          title={caught ? 'Mark as uncaught' : 'Mark as caught'}
          style={{ position:'absolute', top:6, right:6, background:'transparent', border:'none', cursor:'pointer', padding:0 }}
        >
          <PokeballIcon filled={caught} />
        </button>
      )}
      <div style={{ fontWeight:700 }}>{monName}</div>
      <Sprite mon={mon} size={80} alt={monName} />
      <div style={styles.encWrap}>
        {encounters.map((enc, idx) => (
          <div key={idx} style={styles.encCol}>
            {enc.method && <MethodPill method={enc.method} />}
            {enc.rarities.map(r => <RarityPill key={`r-${idx}-${r}`} rarity={r} />)}
            <LevelPill min={enc.min} max={enc.max} />
            {enc.items.map(i => <ItemPill key={`i-${idx}-${i}`} item={i} />)}
          </div>
        ))}
      </div>
      {mon && (
        <button
          className="btn"
          style={{ ...styles.viewBtn, marginTop:8 }}
          onClick={() => onView && onView(mon)}
          title="Open Pokémon"
        >View</button>
      )}
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
  const [data,setData] = useState(MOVE_CACHE.get(slug));
  useEffect(() => {
    let alive = true;
    if(!slug || MOVE_CACHE.has(slug)) return;
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
  return data || MOVE_CACHE.get(slug) || null;
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
        {data?.type ? <TypePill t={data.type} compact /> : '—'}
      </td>
      <td style={{ ...moveCell, textAlign:'center' }}>
        {data?.category ? <CategoryPill cat={data.category} /> : '—'}
      </td>
      <td style={{ ...moveCell, textAlign:'center' }}>{data?.power ?? '—'}</td>
      <td style={{ ...moveCell, textAlign:'center' }}>{data?.accuracy ?? '—'}</td>
    </tr>
  );
}

function MovesTable({ title, moves=[], showLevel=false }){
  return (
    <div style={{ border:'1px solid #262626', borderRadius:8, padding:'8px 10px', background:'#141414' }}>
      <div style={{ fontWeight:700, marginBottom:4 }}>{title}</div>
      {moves.length ? (
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, tableLayout:'fixed' }}>
          <colgroup>
            {showLevel && <col style={{ width:'40px' }} />}
            <col />
            <col style={{ width:'80px' }} />
            <col style={{ width:'80px' }} />
            <col style={{ width:'50px' }} />
            <col style={{ width:'50px' }} />
          </colgroup>
          <thead>
            <tr>
              {showLevel && (
                <th style={{ ...moveCell, textAlign:'center' }}>Lv</th>
              )}
              <th style={{ ...moveCell, textAlign:'left' }}>Move</th>
              <th style={{ ...moveCell, textAlign:'center' }}>Type</th>
              <th style={{ ...moveCell, textAlign:'center' }}>Cat</th>
              <th style={{ ...moveCell, textAlign:'center' }}>Pwr</th>
              <th style={{ ...moveCell, textAlign:'center' }}>Acc</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((mv, idx) => <MoveRow key={idx} mv={mv} showLevel={showLevel} />)}
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
    return (
      <div style={{ display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ textAlign:'center' }}>
          <Sprite mon={m} size={72} alt={m.name} />
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
        {m.evolutions?.map((evo) => {
          const child = getMonByDex(evo.id);
          return (
            <div key={evo.id} style={{ display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ textAlign:'center', fontSize:12 }}>
                <div style={{ fontSize:24 }}>→</div>
                <div className="label-muted">{`${titleCase(evo.type.toLowerCase())}${evo.val ? `: ${evo.val}` : ''}`}</div>
              </div>
              {renderMon(child)}
            </div>
          );
        })}
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
        // Promote those to a proper method so filters like "Lure Only" work.
        if (rarity && /lure/i.test(rarity)) {
          method = `Lure${method ? ` (${method})` : ''}`;
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

/** Group same Pokémon (per map) into one entry with multiple methods/rarities */
function groupEntriesByMon(entries){
  const byId = new Map();
  for (const e of entries){
    if (!byId.has(e.monId)){
      byId.set(e.monId, {
        monId: e.monId,
        monName: e.monName,
        encounters: new Map()
      });
    }
    const g = byId.get(e.monId);
    const mKey = e.method || '';
    if (!g.encounters.has(mKey)){
      g.encounters.set(mKey, {
        method: e.method,
        rarities: new Set(),
        min: e.min,
        max: e.max,
        items: new Set(e.items || [])
      });
    }
    const enc = g.encounters.get(mKey);
    if (e.rarity) enc.rarities.add(e.rarity);
    if (e.min != null) enc.min = Math.min(enc.min ?? e.min, e.min);
    if (e.max != null) enc.max = Math.max(enc.max ?? e.max, e.max);
    if (Array.isArray(e.items)) e.items.forEach(i => enc.items.add(i));
  }
  return [...byId.values()].map(g => ({
    monId: g.monId,
    monName: g.monName,
    encounters: [...g.encounters.values()].map(enc => ({
      method: enc.method,
      rarities: [...enc.rarities].sort(),
      min: enc.min,
      max: enc.max,
      items: [...enc.items]
    }))
  }));
}

/* Normalize map names for grouping (Sinnoh Victory Road unification & split routes) */
function normalizeMapForGrouping(region, mapName){
  const r = String(region).toLowerCase().trim();
  let m = String(mapName).trim();

  // Merge halves like "Route 212 (North)" / "(South)" → "Route 212"
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
  const m = String(name).match(/\((Morning|Day|Night)\)\s*$/i);
  return m ? m[1] : '';
}

// Remove trailing time-of-day tag from map name
function stripTimeTag(name=''){
  return String(name).replace(/\s*\((Morning|Day|Night)\)\s*$/i, '').trim();
}

// Determine if two map names should be considered a match.
// - Queries starting with "Route <number>" only match the exact same route number
// - Partial queries like "r", "ro", "route" etc. never match anything
// - Bare "Route" queries (with or without trailing spaces) never match anything
// - Otherwise fall back to a simple substring check (case-insensitive)
function mapNameMatches(candidate, needle){
  const cand   = stripTimeTag(candidate).toLowerCase();
  const search = stripTimeTag(needle).toLowerCase();

  // If the search is a prefix of "route", do not match yet
  if ('route'.startsWith(search)) return false;

  const routeMatch = search.match(/^route\s*(\d+)\b/);
  if (routeMatch){
    const candRoute = cand.match(/^route\s*(\d+)\b/);
    return !!candRoute && candRoute[1] === routeMatch[1];
  }

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

/** Known alias fixes (expand as needed) — keys and values are compared after simplifyName(). */
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
        return { region, displayMap: normalizeMapForGrouping(region, mapName), rawMap: mapName };
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
function buildGroupedEntries(areasIndex, displayMap, regionFilter, locIndex, lureOnly = false){
  const merged = [];
  for (const [reg, maps] of Object.entries(areasIndex || {})) {
    if (regionFilter && reg !== regionFilter) continue;
    for (const [mapName, list] of Object.entries(maps || {})) {
      const norm = normalizeMapForGrouping(reg, mapName);
      if (mapNameMatches(norm, displayMap)) {
        const time = extractTimeTag(norm);
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
  if (lureOnly) {
    grouped = grouped
      .map(g => ({
        ...g,
        encounters: g.encounters.filter(enc =>
          (enc.method || '').toLowerCase().includes('lure') ||
          (enc.rarities || []).some(r => r.toLowerCase().includes('lure'))
        )
      }))
      .filter(g => g.encounters.length);
  }
  return grouped;
}

/* ======================= LIVE ROUTE: WS client + Panel ======================= */

const STALE_AFTER_MS = 6000;

function normalizeHudText(s=''){
  let t = String(s).replace(/\r/g,'').trim();
  const lines = t.split(/\n+/).map((line) => {
    let l = line.replace(/\s+Ch\.?\s*\d+\b/i, '');
    l = l.replace(/\s{2,}/g,' ').trim();
    return l;
  }).filter(Boolean);
  t = lines.join('\n');
  // Treat OCR results that are just dashes as empty/no data
  if (/^-+$/.test(t)) return '';
  return t;
}

class LiveRouteClient {
  constructor(){
    this.ws = null;
    this.listeners = new Set();
    this.reconnectTimer = null;
    this.pathToggle = false;
    this.lastMsgTs = 0;
    this.lastPayload = null; // cache last message
  }
  connect(){
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
        this.scheduleReconnect();
      };
      this.ws.onclose = onClose;
      this.ws.onerror = onClose;
    }catch{
      this.scheduleReconnect();
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
    this.pathToggle = !this.pathToggle;
    setTimeout(()=> this.connect(), 100);
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
  }
  connect(){
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
        this.scheduleReconnect();
      };
      this.ws.onclose = onClose;
      this.ws.onerror = onClose;
    }catch{
      this.scheduleReconnect();
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
    setTimeout(()=> this.connect(), 100);
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

/* ---------- RegionPicker (segmented buttons, right-aligned) ---------- */
function RegionPicker({ regions, value, onChange }) {
  if (!regions || regions.length < 2) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400 text-sm">Region</span>
      <div className="inline-flex rounded-xl bg-slate-700/60 p-0.5">
        {regions.map((r) => {
          const active = value === r;
          return (
            <button
              key={r}
              onClick={() => onChange(r)}
              className={
                "px-2.5 py-1 text-sm rounded-lg transition-colors " +
                (active
                  ? "bg-emerald-600 text-white"
                  : "text-slate-200 hover:bg-slate-600/60")
              }
              title={`Show ${r}`}
            >
              {titleCase(r)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ======================= LIVE ROUTE PANEL ======================= */

function LiveRoutePanel({ areasIndex, locIndex, onViewMon }){
  const [rawText, setRawText] = useState('');
  const [confidence, setConfidence] = useState(null);
  const [displayMap, setDisplayMap] = useState(null);
  const [region, setRegion] = useState(null);
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [regionChoices, setRegionChoices] = useState([]);
  const [lureOnly, setLureOnly] = useState(false);
  const [showCaught, setShowCaught] = useState(true);

  const { caught, toggleCaught } = React.useContext(CaughtContext);

  // Handle messages
  useEffect(() => {
    const off = liveRouteClient.on((msg) => {
      const coerced = coerceIncoming(msg);
      if (!coerced) return;

      let cleaned = normalizeHudText(coerced.routeText);
      if (DEBUG_LIVE) console.log('[LIVE] OCR raw:', coerced.routeText, '→ cleaned:', cleaned);

      const { cleaned: trimmed, best } = findBestMapInText(cleaned, areasIndex);
      if (!best) return; // ignore noisy frames
      cleaned = trimmed;

      setRawText(cleaned);
      setConfidence(coerced.confidence ?? null);

      const targetName = best.displayMap;

        const choices = listRegionCandidates(areasIndex, targetName);
        setRegionChoices(choices);

        // choose region: saved pref → best → first choice
      const prefKey = `regionPref:${targetName}`;
      let picked = localStorage.getItem(prefKey);
      if (picked && !choices.includes(picked)) picked = null;
      const chosen = picked || best.region || choices[0] || null;

      setRegion(chosen);
      setDisplayMap(targetName);
      setEntries(buildGroupedEntries(areasIndex, targetName, chosen, locIndex, lureOnly));
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
      liveRouteClient.forceReconnect();
    };
    window.addEventListener('force-live-reconnect', onForce);

    // Reconnect when tab becomes visible again (tab-away fix)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        const stale = Date.now() - (liveRouteClient.lastMsgTs || 0) > STALE_AFTER_MS;
        if (!liveRouteClient.isOpen() || stale) {
          liveRouteClient.forceReconnect();
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    // Also reconnect on window focus (covers some browsers)
    const onFocus = () => {
      const stale = Date.now() - (liveRouteClient.lastMsgTs || 0) > STALE_AFTER_MS;
      if (!liveRouteClient.isOpen() || stale) {
        liveRouteClient.forceReconnect();
      }
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
  }, [areasIndex, locIndex, rawText, lureOnly]);

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
      setEntries(buildGroupedEntries(areasIndex, displayMap, r, locIndex, lureOnly));
    }
  };

  return (
    <div className="p-3" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div className="label-muted">
          Live Location: <span style={{ fontWeight:800 }}>{rawText || '—'}</span>
          {SHOW_CONFIDENCE && (confPct !== null) && (
            <span className="text-slate-400 ml-2">({confPct}% Confidence)</span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
            <input
              type="checkbox"
              checked={lureOnly}
              onChange={e=>setLureOnly(e.target.checked)}
            />
            Lure Only
          </label>
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

      {!rawText && (
        <div className="label-muted">
          <b>LiveRouteOCR</b> is attempting to find Route Data.. be patient. Click Into your PokeMMO window. Try clicking the Live tab without PokeMMO minimized. Move around a bit if it still can't find the route.
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
              <div className="label-muted">{entries.length} Pokémon</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <RegionPicker regions={regionChoices} value={region} onChange={handleRegionChange} />
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
function LiveBattlePanel({ onViewMon }){
  const [rawText, setRawText] = useState('');
  const [confidence, setConfidence] = useState(null);
  const [mons, setMons] = useState([]);
  const [connected, setConnected] = useState(false);
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    const off = liveBattleClient.on((msg) => {
      const coerced = coerceBattleIncoming(msg);
      if (!coerced) return;
      const cleaned = normalizeHudText(coerced.monText);
      const compacted = cleaned.replace(/\s+/g, '');
      // When OCR returns nothing, clear state fully
      if (!compacted) {
        setRawText('');
        setConfidence(coerced.confidence ?? null);
        setMons([]);
        return;
      }
      let fragments = [];
      const nameRegex = /([A-Za-z][A-Za-z0-9.'-]*(?:\s+(?!Lv\.?\b)[A-Za-z][A-Za-z0-9.'-]*)*)\s+Lv\.?\s*\d+/gi;
      let match;
      while ((match = nameRegex.exec(cleaned)) !== null) {
        const n = match[1].trim();
        if (n) fragments.push(n);
      }
      if (fragments.length === 0) {
        fragments = cleaned
          .split(/\n+/)
          .map(s => s.replace(/\bLv\.?\s*\d+.*$/i, '').trim())
          .filter(s => /[A-Za-z]/.test(s));
      }
      // Keyword search each fragment for any known Pokémon name. This allows us
      // to match names even when extra characters precede or follow the actual
      // Pokémon name in the OCR result.
      let names = [];
      for (const frag of fragments) {
        const lowerFrag = frag.toLowerCase();
        const compactFrag = lowerFrag.replace(/[^a-z0-9]+/g, '');
        for (const [key, mon] of DEX_BY_NAME.entries()) {
          const compactKey = key.replace(/[^a-z0-9]+/g, '');
          if (lowerFrag.includes(key) || (compactKey && compactFrag.includes(compactKey))) {
            names.push(mon.name);
            break;
          }
        }
      }
      // Attempt to detect known Pokémon names within the full text. OCR artifacts
      // can cause names to merge together or drop whitespace entirely. First, try
      // to find "clean" names with word boundaries, then fall back to scanning a
      // compacted string with all non-alphanumeric characters removed.
      const lower = cleaned.toLowerCase();
      const compact = lower.replace(/[^a-z0-9]+/g, '');
      const found = [];
      for (const [key, mon] of DEX_BY_NAME.entries()) {
        // Normal match allowing optional spaces or hyphens
        const pattern = new RegExp(`\\b${key.replace(/[-]/g,'[\\s-]?')}\\b`, 'i');
        if (pattern.test(lower)) {
          found.push(mon.name);
          continue;
        }
        // Fallback: check for concatenated names without delimiters
        const compactKey = key.replace(/[^a-z0-9]+/g, '');
        if (compactKey && compact.includes(compactKey)) {
          found.push(mon.name);
        }
      }
      // Combine any discovered names with ones parsed via fragment scanning
      names = [...new Set([...names, ...found])];
      // Ignore very short/noisy OCR results that would wipe previously detected names
      if (names.length === 0 && compacted.length <= 2) {
        if (DEBUG_LIVE) console.log('[LIVE] Ignoring short OCR:', cleaned);
        return;
      }
      setRawText(cleaned);
      setConfidence(coerced.confidence ?? null);
      setMons(names.map(n => getMon(n)).filter(Boolean));
    });

    liveBattleClient.connect();

    const pulse = setInterval(() => {
      setConnected(liveBattleClient.isOpen());
      const last = liveBattleClient.lastMsgTs || 0;
      setIsStale(!!rawText && Date.now() - last > STALE_AFTER_MS);
    }, 1000);

    const onForce = () => {
      setRawText('');
      setConfidence(null);
      setMons([]);
      liveBattleClient.forceReconnect();
    };
    window.addEventListener('force-live-reconnect', onForce);

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        const stale = Date.now() - (liveBattleClient.lastMsgTs || 0) > STALE_AFTER_MS;
        if (!liveBattleClient.isOpen() || stale) {
          liveBattleClient.forceReconnect();
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    const onFocus = () => {
      const stale = Date.now() - (liveBattleClient.lastMsgTs || 0) > STALE_AFTER_MS;
      if (!liveBattleClient.isOpen() || stale) {
        liveBattleClient.forceReconnect();
      }
    };
    window.addEventListener('focus', onFocus);

    return () => {
      off();
      clearInterval(pulse);
      window.removeEventListener('force-live-reconnect', onForce);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [rawText]);

  const statusPill = (() => {
    if (!connected) return <span className="px-2 py-1 rounded-xl bg-red-600/20 text-red-300 text-xs">Disconnected</span>;
    if (isStale)   return <span className="px-2 py-1 rounded-xl bg-yellow-600/20 text-yellow-300 text-xs">Stale</span>;
    return <span className="px-2 py-1 rounded-xl bg-green-600/20 text-green-300 text-xs"></span>;
  })();

  const confPct = formatConfidence(confidence);

  return (
    <div className="p-3" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div className="label-muted">
          Live Battle: <span style={{ fontWeight:800, whiteSpace:'pre-line' }}>{rawText || '—'}</span>
          {SHOW_CONFIDENCE && (confPct !== null) && (
            <span className="text-slate-400 ml-2">({confPct}% Confidence)</span>
          )}
        </div>
        <div className="label-muted">{statusPill}</div>
      </div>

      {!rawText && (
        <div className="label-muted">
          <b>LiveRouteOCR</b> is attempting to find Battle Data.. be patient. Click into your PokeMMO window.
        </div>
      )}

      {rawText && mons.length === 0 && (
        <div className="label-muted">No matching Pokémon found.</div>
      )}

      {mons.map(mon => (
        <div key={mon.id} style={styles.areaCard}>
          <button onClick={() => onViewMon?.(mon)} style={{ display:'flex', gap:12, width:'100%', textAlign:'left' }}>
            <Sprite mon={mon} size={80} alt={mon.name} />
            <div>
              <div style={{ fontWeight:800, fontSize:16 }}>{titleCase(mon.name)}</div>
              <div className="label-muted">#{mon.id}</div>
            </div>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ======================= REVERSE AREAS → MON INDEX ======================= */
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
  const [areaRegion, setAreaRegion] = useState('All');
  const [showRegionMenu, setShowRegionMenu] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode]         = useState('pokemon'); // 'pokemon' | 'areas' | 'tm' | 'items' | 'live' | 'battle'
  const [showMoveset, setShowMoveset] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  const [lureOnly, setLureOnly] = useState(false);
  const [showCaught, setShowCaught] = useState(true);

  const detailRef = useRef(null);

  const [showUpToDate, setShowUpToDate] = useState(false);

  useEffect(() => {
    if (!isWindows && mode === 'live') setMode('pokemon');
  }, [isWindows, mode]);

  useEffect(() => {
    let t;
    const show = () => {
      setShowUpToDate(true);
      t = setTimeout(() => setShowUpToDate(false), 3000);
    };
    const offNA = window.app?.onUpdateNotAvailable?.(() => show());
    (async () => {
      try {
        const res = await window.app?.checkUpdates?.();
        if (res?.status === 'uptodate') show();
      } catch {}
    })();
    return () => { if (t) clearTimeout(t); try { offNA?.(); } catch {}; };
  }, []);

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
  const [eggFilter, setEggFilter] = useState('');
  const [abilityFilter, setAbilityFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [moveFilter, setMoveFilter] = useState('');
  const [moveLevelOnly, setMoveLevelOnly] = useState(false);
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
  const pokemonRegionOptions = useMemo(() => {
    const set = new Set();
    for (const m of DEX_LIST) for (const l of m.locations || []) if (l.region_name) set.add(l.region_name);
    return [...set].sort((a,b)=>a.localeCompare(b));
  }, []);

  useEffect(() => { if (!moveFilter) setMoveLevelOnly(false); }, [moveFilter]);

  const hasFilters = Boolean(typeFilter || eggFilter || abilityFilter || regionFilter || moveFilter);


  const [headerSprite] = useState(() => {
    const withSprite = DEX_LIST.filter(d => spriteSources(d).length > 0);
    return withSprite.length ? spriteSources(withSprite[Math.floor(Math.random()*withSprite.length)])[0] : null;
  });
  useEffect(() => { document.title = APP_TITLE; }, []);
  const headerSrc = headerSprite || TRANSPARENT_PNG;

  useEffect(() => {
    setShowRegionMenu(false);
    if (mode !== 'pokemon') setSelected(null);
    setQuery('');
    setTypeFilter('');
    setEggFilter('');
    setAbilityFilter('');
    setRegionFilter('');
  }, [mode]);
  useEffect(() => { setShowMoveset(false); setShowLocations(false); }, [selected]);
  useEffect(() => {
    if (selected && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selected]);
  useEffect(() => {
    if (!selected || selected.catchRate != null) return;
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

  // Search by Pokémon
  const results = React.useMemo(() => {
    if (mode !== 'pokemon') return [];
    const q = query.trim().toLowerCase();
    if (!hasFilters && !q) return [];
    let list = DEX_LIST.filter(mon => {
      if (typeFilter) {
        const types = (mon.types || []).map(normalizeType);
        if (!types.includes(normalizeType(typeFilter))) return false;
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
      if (regionFilter) {
        const regions = (mon.locations || []).map(l => normalizeRegion(l.region_name));
        if (!regions.includes(normalizeRegion(regionFilter))) return false;
      }
      if (q && !(mon.name.toLowerCase().includes(q) || String(mon.id) === q)) return false;
      return true;
    });
    if (!hasFilters && q) list = list.slice(0, 24);
    return list;
  }, [mode, query, hasFilters, typeFilter, eggFilter, abilityFilter, regionFilter, moveFilter, moveLevelOnly]);

  // Search by Area (cleaned + grouped) with Sinnoh Victory Road unified
  const areaHits = React.useMemo(() => {
    if (mode!=='areas') return [];
    const q = query.trim().toLowerCase();
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
        const key = `${region}|||${displayMap}`;
        if (!buckets.has(key)) buckets.set(key, { region, map: displayMap, entries: [] });
        buckets.get(key).entries.push(...entries);
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
      if (lureOnly) {
        grouped = grouped
          .map(g => ({
            ...g,
            encounters: g.encounters.filter(enc =>
              (enc.method || '').toLowerCase().includes('lure') ||
              (enc.rarities || []).some(r => r.toLowerCase().includes('lure'))
            )
          }))
          .filter(g => g.encounters.length);
      }
      if (grouped.length) hits.push({ region, map, count: grouped.length, entries: grouped });
    }
    hits.sort((a,b)=> a.region.localeCompare(b.region) || a.map.localeCompare(b.map));
    return hits.slice(0, 30);
 }, [query, areasClean, locIndex, mode, areaRegion, lureOnly]);

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

  // Selected Pokémon details (MERGED sources)
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
    const dexLocs = (selected.locations || []).map(l => ({
      region: titleCase(l.region_name || 'Unknown'),
      map: l.location,
      method: [l.type].filter(Boolean),
      rarity: [l.rarity].filter(Boolean),
      min: l.min_level,
      max: l.max_level,
      items: (selected.heldItems || []).map(h => h.name),
    }));

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

    const mergedLocs = [...byKey.values()].map(l => ({
      ...l,
      method: [...new Set(l.method)],
      rarity: [...new Set(l.rarity)],
      items: [...new Set(l.items)],
    }));

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
            background:'#1b4a1b',
            color:'#eee',
            borderRadius:10,
            border:'1px solid #333',
            boxShadow:'0 8px 28px rgba(0,0,0,.45)',
            fontWeight:700,
            pointerEvents:'none'
          }}
        >
          Up to date
        </div>
      )}

      <div className="container">
        {/* Header */}
        <div className="header" style={{ alignItems:'center' }}>
          <img src={headerSrc} alt="" style={{ width:56, height:56, objectFit:'contain', imageRendering:'pixelated' }} />
          <h1 style={{ marginLeft:8 }}>3&apos;s PokeMMO Tool</h1>
        </div>

        {/* Search / Mode Card */}
        <div style={{ ...styles.card, marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={styles.segWrap}>
              <button style={styles.segBtn(mode==='pokemon')} onClick={()=>setMode('pokemon')}>Pokémon Search</button>
              <button style={styles.segBtn(mode==='areas')} onClick={()=>setMode('areas')}>Area Search</button>
              <button style={styles.segBtn(mode==='tm')} onClick={()=>setMode('tm')}>TM Locations</button>
              <button style={styles.segBtn(mode==='items')} onClick={()=>setMode('items')}>Items</button>
              {isWindows && (
                <>
                  <button style={styles.segBtn(mode==='live')} onClick={()=>setMode('live')}>Live Route</button>
                  <button style={styles.segBtn(mode==='battle')} onClick={()=>setMode('battle')}>Live Battle</button>
                </>
              )}
            </div>
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
              <MoveFilter
                value={moveFilter}
                onChange={setMoveFilter}
                options={moveOptions}
              />
              {moveFilter && (
                <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input
                    type="checkbox"
                    checked={moveLevelOnly}
                    onChange={e=>setMoveLevelOnly(e.target.checked)}
                  />
                  Level-Up Only
                </label>
              )}
            </div>
          )}

          {/* Context label + search input (hidden for Live) */}
          {mode!=='live' && mode!=='battle' && (
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
                {mode==='areas' && (
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <input
                        type="checkbox"
                        checked={showCaught}
                        onChange={e=>setShowCaught(e.target.checked)}
                      />
                      Toggle Caught
                    </label>
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
                value={query}
                onChange={(e)=> setQuery(e.target.value)}
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
              {mode==='areas' && (
                <label className="label-muted" style={{ display:'flex', alignItems:'center', gap:4, marginTop:8 }}>
                  <input
                    type="checkbox"
                    checked={lureOnly}
                    onChange={e=>setLureOnly(e.target.checked)}
                  />
                  Lure Only
                </label>
              )}
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
              />
            </div>
          )}

          {/* Pokémon results */}
          {mode==='pokemon' && !!results.length && (
            <div className="result-grid" style={{ marginTop:12 }}>
              {results.map(p => {
                const mon = p;
                const t = [...new Set((p.types || []).map(normalizeType))];
                return (
                  <button
                    key={`${p.id}-${p.name}`}
                    onClick={()=>{ setSelected(p); setQuery(''); }}
                    className="result-tile"
                    style={{ alignItems:'center', padding:10, borderRadius:12, border:'1px solid #262626', background:'#141414' }}
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

          {/* Area results */}
          {mode==='areas' && !!areaHits.length && (
            <div style={{ marginTop:12, display:'grid', gap:12 }}>
              {areaHits.map(hit => (
                <div key={`${hit.region}-${hit.map}`} style={styles.areaCard}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                    <div style={{ fontWeight:800, fontSize:16 }}>
                      {hit.map} <span className="label-muted">({hit.region})</span>
                    </div>
                    <div className="label-muted">{hit.count} Pokémon</div>
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
                            setQuery('');
                          }}
                          caught={isCaught}
                          showCaught={showCaught}
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
        </div>

        {/* Detail Panel (Pokémon) */}
          {mode==='pokemon' && resolved && (
             <>
            <div ref={detailRef} className="grid">
            {/* Left: Pokémon card */}
            <div style={styles.card}>
              <div style={{ display:'flex', gap:12 }}>
                <Sprite mon={selected} size={120} alt={resolved.name} />
                <div>
                  <div style={{ fontSize:22, fontWeight:900 }}>
                    {titleCase(resolved.name)} <span className="label-muted">#{resolved.id}</span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gap: 12,
                      marginTop: 6,
                      alignItems: 'center',
                      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))'
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="label-muted" style={{ fontWeight: 700 }}>Type:</span>
                      {(resolved.types || []).map(tp => <TypePill key={tp} t={tp} />)}
                    </div>
                    {resolved.eggGroups?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="label-muted" style={{ fontWeight: 700 }}>Egg Group:</span>
                        {resolved.eggGroups.map(g => <EggGroupPill key={g} group={g} />)}
                      </div>
                    )}
                    {resolved.abilities?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="label-muted" style={{ fontWeight: 700 }}>Abilities:</span>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {resolved.abilities.map((a, i) => (
                            <AbilityPill
                              key={`${a.name}-${i}`}
                              label={i === 2 ? 'Hidden' : `${i + 1}`}
                              name={a.name}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {resolved.catchRate != null && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="label-muted" style={{ fontWeight: 700 }}>Catch Rate:</span>
                        <span>{resolved.catchRate}</span>
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gap: 6,
                      marginTop: 8,
                      gridTemplateColumns: 'repeat(5, minmax(0, 1fr))'
                    }}
                  >
                    <InfoPill label="Exp" value={titleCase((resolved.expType || '').replace(/_/g, ' '))} />
                    <InfoPill label="Gender" value={formatGenderRatio(resolved.genderRatio)} />
                    <InfoPill label="Height" value={formatHeight(resolved.height)} />
                    <InfoPill label="Weight" value={formatWeight(resolved.weight)} />
                    <InfoPill label="Obtainable" value={resolved.obtainable ? 'Yes' : 'No'} />
                  </div>
                  {resolved.forms?.length > 1 && (
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                      <span className="label-muted" style={{ fontWeight:700 }}>Forms:</span>
                      {resolved.forms.map(f => <span key={f.form_id || f.id}>{f.name}</span>)}
                    </div>
                  )}
                </div>
              </div>
              {Object.keys(resolved.stats || {}).length > 0 && (
                <>
                  <div className="label-muted" style={{ fontWeight:700, margin:'16px 0 6px' }}>Base Stats</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(100px, 1fr))', gap:6 }}>
                    {Object.entries(resolved.stats).map(([k,v]) => (
                      <InfoPill key={k} label={titleCase(k.replace('_',' '))} value={v} />
                    ))}
                  </div>
                </>
              )}
              {Object.entries(resolved.yields || {}).some(([k,v]) => k.startsWith('ev_') && v) && (
                <>
                  <div className="label-muted" style={{ fontWeight:700, margin:'16px 0 6px' }}>EV Yields</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:8 }}>
                    {Object.entries(resolved.yields).filter(([k,v]) => k.startsWith('ev_') && v).map(([k,v]) => (
                      <InfoPill key={k} label={titleCase(k.replace('ev_','').replace('_',' '))} value={v} />
                    ))}
                  </div>
                </>
              )}
              {/* Weakness table */}
              <div style={{ marginTop:16 }}>
                <div className="label-muted" style={{ fontWeight:700, marginBottom:8 }}>Type Matchups</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:8 }}>
                  <div style={{ border:'1px solid #2b2b2b', borderRadius:8, padding:'8px 10px', background:'#141414' }}>
                    <div style={{ fontWeight:800, marginBottom:6 }}>4× Weak</div>
                    {resolved.weakness.x4.length ? (
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {resolved.weakness.x4.map(t => <TypePill key={`x4-${t}`} t={t} compact />)}
                      </div>
                    ) : <div className="label-muted">None</div>}
                  </div>
                  <div style={{ border:'1px solid #2b2b2b', borderRadius:8, padding:'8px 10px', background:'#141414' }}>
                    <div style={{ fontWeight:800, marginBottom:6 }}>2× Weak</div>
                    {resolved.weakness.x2.length ? (
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {resolved.weakness.x2.map(t => <TypePill key={`x2-${t}`} t={t} compact />)}
                      </div>
                    ) : <div className="label-muted">None</div>}
                  </div>
                  <div style={{ border:'1px solid #2b2b2b', borderRadius:8, padding:'8px 10px', background:'#141414' }}>
                    <div style={{ fontWeight:800, marginBottom:6 }}>½× Resist</div>
                    {resolved.weakness.x0_5.length ? (
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {resolved.weakness.x0_5.map(t => <TypePill key={`x05-${t}`} t={t} compact />)}
                      </div>
                    ) : <div className="label-muted">None</div>}
                  </div>
                  <div style={{ border:'1px solid #2b2b2b', borderRadius:8, padding:'8px 10px', background:'#141414' }}>
                    <div style={{ fontWeight:800, marginBottom:6 }}>¼× Resist</div>
                    {resolved.weakness.x0_25.length ? (
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {resolved.weakness.x0_25.map(t => <TypePill key={`x025-${t}`} t={t} compact />)}
                      </div>
                    ) : <div className="label-muted">None</div>}
                  </div>
                  <div style={{ border:'1px solid #2b2b2b', borderRadius:8, padding:'8px 10px', background:'#141414' }}>
                    <div style={{ fontWeight:800, marginBottom:6 }}>0× Immune</div>
                    {resolved.weakness.x0.length ? (
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {resolved.weakness.x0.map(t => <TypePill key={`x0-${t}`} t={t} compact />)}
                      </div>
                    ) : <div className="label-muted">None</div>}
                  </div>
                </div>
              </div>

              {resolved.heldItems?.length > 0 && (
                <div style={{ marginTop:16 }}>
                  <div className="label-muted" style={{ fontWeight:700, marginBottom:8 }}>Held Items</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:8 }}>
                    {resolved.heldItems.map((h,i) => {
                      const item = ITEM_INDEX.byId.get(h.id) || ITEM_INDEX.byName.get(normalizeKey(h.name || h));
                      return (
                        <div
                          key={h.id || h.name || i}
                          style={{ display:'flex', alignItems:'center', gap:6 }}
                          title={item?.description || ''}
                        >
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
                          <span style={{ fontWeight:600, color:'var(--accent)' }}>{h.name || h}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <EvolutionChain mon={resolved} onSelect={(m)=>{ setSelected(m); setShowMoveset(false); }} />
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
                          <div key={i} style={{ border:'1px solid #262626', borderRadius:10, padding:'8px 10px', background:'#141414' }}>
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
                              {(Array.isArray(loc.rarity) ? loc.rarity : [loc.rarity])
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

      {/* Fixed version badge */}
      <VersionBadge />
    </>
    </ColorContext.Provider>
    </CaughtContext.Provider>
  );
}

export default App;
