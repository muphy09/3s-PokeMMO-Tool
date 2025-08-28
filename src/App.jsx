import React, { useEffect, useMemo, useState } from 'react';
import './index.css';
import dexRaw from '../UpdatedDex.json';
import VersionBadge from "./components/VersionBadge.jsx";
import OptionsMenu from './components/OptionsMenu.jsx';
import PatchNotesButton, { openPatchNotes } from './components/PatchNotesButton.jsx';

const LOCATIONS_URL = `${import.meta.env.BASE_URL}data/pokemmo_locations.json`;
const AREAS_URL     = `${import.meta.env.BASE_URL}data/areas_index.json`;
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
  monRow: { display:'flex', gap:10, alignItems:'center', border:'1px solid #262626', borderRadius:10, padding:'8px 10px', background:'#141414' },
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
    forms: m.forms || [],
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
const DEX_LIST = dexRaw.map(toLegacyShape);
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
  if (mon.sprite) arr.push(mon.sprite);
  if (mon.sprites?.front_default) arr.push(mon.sprites.front_default);
  if (mon.image) arr.push(mon.image);
  if (mon.icon) arr.push(mon.icon);
  arr.push(...localSpriteCandidates(mon));
  // PokeAPI fallbacks
  arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${mon.id}.png`);
  arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${mon.id}.png`);
  return [...new Set(arr)].filter(Boolean);
}
function Sprite({ mon, size=42, alt='' }){
  const srcs = React.useMemo(()=> spriteSources(mon), [mon]);
  const [idx, setIdx] = useState(0);
  const src = srcs[idx] || TRANSPARENT_PNG;
  return (
    <img
      src={src}
      alt={alt || mon?.name || ''}
      style={{ width:size, height:size, objectFit:'contain', imageRendering:'pixelated' }}
      onError={() => {
        if (idx < srcs.length - 1) setIdx(idx + 1);
      }}
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
const METHOD_COLORS = {
  grass:'#ECEFF1', 'dark grass':'#B0BEC5', cave:'#7E57C2', water:'#4C7CF0',
  fishing:'#2BB673','old rod':'#239B63','good rod':'#1E8756','super rod':'#176A44',
  horde:'#E056FD', rocks:'#616161','rock smash':'#616161', headbutt:'#FF7F50',
  tree:'#C2A83E','swampy grass':'#16A085','npc interaction':'#8E9AAF', interaction:'#8E9AAF',
  building:'#5C7AEA', inside:'#5C7AEA', outside:'#43BCCD', special:'#F4B400', lure:'#FFB84D'
};
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
  if (!method) return null;
  const label = cleanMethodLabel(method);
  const m = methodKey(label);
  const base = m.startsWith('lure') ? 'lure' : (METHOD_COLORS[m] ? m : m.replace(/\s*\(.*\)$/,''));
  const bg = METHOD_COLORS[base] || '#7f8c8d';
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
const RARITY_COLORS = {
  'very common':'#8B5A2B','common':'#FFFFFF','uncommon':'#2ECC71','rare':'#E74C3C','very rare':'#F1C40F'
};
function rarityKey(r=''){ return String(r).toLowerCase().trim(); }
function RarityPill({ rarity }){
  if (!rarity) return null;
  const k = rarityKey(rarity);
  const isPercent = /^\d+%$/.test(k);
  const bg = isPercent ? '#13B5A6' : (RARITY_COLORS[k] || '#BDC3C7');
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
  const [index, setIndex] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      try{
        const res = await fetch(LOCATIONS_URL, { cache:'no-store' });
        const json = await res.json();
        const idx = {};
        for (const [k,v] of Object.entries(json)) {
          // Drop any bogus location entries with only dashes for a map name
          const locations = (v?.locations || []).filter(l => !/^-+$/.test(l.map || ""));
          idx[normalizeKey(k)] = { ...v, locations };
        }
        if (alive) setIndex(idx);
      }catch(e){ console.error('load locations failed', e); }
    })();
    return () => { alive = false; };
  }, []);
  return index;
}

/** Cleaning helpers for Areas */
function cleanSpeciesName(name=''){
  let s = String(name)
    .replace(/^[\s*•\-–—]+/g,'')
    .replace(/\)+$/,'')
    .replace(/\b(?:and|or)\b/gi,'')
    .replace(/\b(?:hordes?|horde)\b/gi,'')
    .replace(/\s{2,}/g,' ')
    .trim();
  return s;
}
/** NOTE: now balances missing ')' */
function cleanAreaMethod(method=''){
  return cleanMethodLabel(method);
}

/** Sanitize Areas index once at load */
function useAreasDbCleaned(){
  const [index, setIndex] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      try{
        const res = await fetch(AREAS_URL, { cache:'no-store' });
        const raw = await res.json();
        const out = {};
        for (const [region, maps] of Object.entries(raw || {})) {
          for (const [mapName, entries] of Object.entries(maps || {})) {
            // Ignore placeholder maps made entirely of dashes
            if (/^-+$/.test(mapName)) continue;
            const cleaned = [];
            let last = null;
            for (const e of entries || []) {
              const method = cleanAreaMethod(e.method || '');
              let rarity = e.rarity || '';
              const speciesRaw = cleanSpeciesName(e.pokemon || '');
              if (!speciesRaw) continue;

              const mon = getMon(speciesRaw) || getMon(titleCase(speciesRaw));
              if (!mon) {
                const k = rarityKey(speciesRaw);
                const isPercent = /^\d+%$/.test(k);
                if ((k && (RARITY_COLORS[k] || isPercent)) && last && !last.rarity) {
                  last.rarity = titleCase(speciesRaw);
                }
                continue; // drop broken / unmatched
              }
              const entry = {
                monId: mon.id,
                monName: mon.name,   // canonical
                method,
                rarity
              };
              cleaned.push(entry);
              last = entry;
            }
            if (cleaned.length) {
              if (!out[region]) out[region] = {};
              out[region][mapName] = cleaned;
            }
          }
        }
        if (alive) setIndex(out);
      }catch(e){ console.error('load areas index failed', e); setIndex({}); }
    })();
    return () => { alive = false; };
  }, []);
  return index;
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
        methods: new Set(),
        rarities: new Set()
      });
    }
    const g = byId.get(e.monId);
    if (e.method) g.methods.add(e.method);
    if (e.rarity) g.rarities.add(e.rarity);
  }
  return [...byId.values()].map(g => ({
    monId: g.monId,
    monName: g.monName,
    methods: [...g.methods].sort(),
    rarities: [...g.rarities].sort()
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

function lookupRarity(monName, region, map, locIndex){
  const entry = locIndex[normalizeKey(monName)];
  if (!entry) return '';
  const regNorm = normalizeRegion(region);
  const mapNorm = normalizeMapForGrouping(region, map);
  for (const loc of entry.locations || []) {
    if (normalizeRegion(loc.region) === regNorm &&
        normalizeMapForGrouping(loc.region, loc.map) === mapNorm &&
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
  const needleKey = aliasKey(hudText);
  let best = null, bestScore = -1;
  for (const [region, maps] of Object.entries(areasIndex || {})) {
    for (const [mapName] of Object.entries(maps || {})) {
      const candidateKey = aliasKey(mapName);
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
      if (norm === displayMap) { out.push(region); break; }
    }
  }
  return [...new Set(out)];
}
function buildGroupedEntries(areasIndex, displayMap, regionFilter){
  const merged = [];
  for (const [reg, maps] of Object.entries(areasIndex || {})) {
    if (regionFilter && reg !== regionFilter) continue;
    for (const [mapName, list] of Object.entries(maps || {})) {
      const norm = normalizeMapForGrouping(reg, mapName);
      if (norm === displayMap) merged.push(...(list||[]));
    }
  }
  return groupEntriesByMon(merged);
}

/* ======================= LIVE ROUTE: WS client + Panel ======================= */

const STALE_AFTER_MS = 6000;

function normalizeHudText(s=''){
  let t = String(s).trim();
  t = t.replace(/\s+Ch\.?\s*\d+\b/i, '');
  t = t.replace(/\s{2,}/g,' ').trim();
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

function LiveRoutePanel({ areasIndex, onViewMon }){
  const [rawText, setRawText] = useState('');
  const [confidence, setConfidence] = useState(null);
  const [displayMap, setDisplayMap] = useState(null);
  const [region, setRegion] = useState(null);
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [regionChoices, setRegionChoices] = useState([]);

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
      setEntries(buildGroupedEntries(areasIndex, targetName, chosen));
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
  }, [areasIndex, rawText]);

  const statusPill = (() => {
    if (!connected) return <span className="px-2 py-1 rounded-xl bg-red-600/20 text-red-300 text-xs">Disconnected</span>;
    if (isStale)   return <span className="px-2 py-1 rounded-xl bg-yellow-600/20 text-yellow-300 text-xs">Stale</span>;
    return <span className="px-2 py-1 rounded-xl bg-green-600/20 text-green-300 text-xs">Live</span>;
  })();

  const confPct = formatConfidence(confidence);

  // When user changes region via segmented buttons
  const handleRegionChange = (r) => {
    setRegion(r);
    if (displayMap) {
      const prefKey = `regionPref:${displayMap}`;
      localStorage.setItem(prefKey, r || '');
      setEntries(buildGroupedEntries(areasIndex, displayMap, r));
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
        <div className="label-muted">{statusPill}</div>
      </div>

      {!rawText && (
        <div className="label-muted">
          <b>LiveRouteOCR</b> is attempting to find Route Data. Click Into your PokeMMO window. Move around a bit or adjust your UI scaling if it still can't find the route.
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
            {/* Segmented buttons on the RIGHT */}
            <RegionPicker regions={regionChoices} value={region} onChange={handleRegionChange} />
          </div>

          {entries.length === 0 ? (
            <div className="label-muted" style={{ marginTop:8 }}>No encounter data found for this area.</div>
          ) : (
            <div style={{ ...styles.gridCols, marginTop:10 }}>
              {entries.map((g, idx) => {
                const mon = getMon(g.monName);
                return (
                  <div key={idx} style={styles.monRow}>
                    <Sprite mon={mon} size={36} alt={g.monName} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700 }}>{g.monName}</div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
                        {g.methods.map(m => <MethodPill key={`m-${idx}-${m}`} method={m} />)}
                        {g.rarities.map(r => <RarityPill key={`r-${idx}-${r}`} rarity={r} />)}
                      </div>
                    </div>
                    {mon && (
                      <button
                        className="btn"
                        style={styles.viewBtn}
                        onClick={() => onViewMon && onViewMon(mon)}
                        title="Open Pokémon"
                      >View</button>
                    )}
                  </div>
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
          methods: g.methods || [],
          rarities: g.rarities || []
        });
      }
    }
  }
  return rev;
}

/* ======================= APP ======================= */
function App(){
  const [query, setQuery]       = useState('');
  const [areaRegion, setAreaRegion] = useState('All');
  const [showRegionMenu, setShowRegionMenu] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode]         = useState('pokemon'); // 'pokemon' | 'areas' | 'tm' | 'live'
  const [showMoveset, setShowMoveset] = useState(false);

  const locIndex   = useLocationsDb();
  const areasClean = useAreasDbCleaned();
  const tmIndex    = useTmLocations();
  const areasRevByMon = useMemo(() => buildReverseAreasIndex(areasClean), [areasClean]); // NEW


  const [headerSprite] = useState(() => {
    const withSprite = DEX_LIST.filter(d => spriteSources(d).length > 0);
    return withSprite.length ? spriteSources(withSprite[Math.floor(Math.random()*withSprite.length)])[0] : null;
  });
  useEffect(() => { document.title = APP_TITLE; }, []);
  const headerSrc = headerSprite || TRANSPARENT_PNG;

  useEffect(() => {
    setShowRegionMenu(false);
    if (mode !== 'pokemon') setSelected(null);
  }, [mode]);
  useEffect(() => { setShowMoveset(false); }, [selected]);
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
    const q = query.trim().toLowerCase();
    if (!q || mode!=='pokemon') return [];
    return DEX_LIST.filter(p => p.name.toLowerCase().includes(q) || String(p.id) === q).slice(0, 24);
  }, [query, mode]);

  // Search by Area (cleaned + grouped) with Sinnoh Victory Road unified
  const areaHits = React.useMemo(() => {
    if (mode!=='areas') return [];
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const buckets = new Map();
    const regionKey = normalizeRegion(areaRegion);
    for (const [region, maps] of Object.entries(areasClean)) {
      const regionNorm = normalizeRegion(region);
      if (regionKey !== 'all' && regionNorm !== regionKey) continue;
      for (const [mapName, entries] of Object.entries(maps)) {
        const displayMap = normalizeMapForGrouping(region, mapName);
        if (!displayMap.toLowerCase().includes(q)) continue;
        const key = `${region}|||${displayMap}`;
        if (!buckets.has(key)) buckets.set(key, { region, map: displayMap, entries: [] });
        buckets.get(key).entries.push(...entries);
      }
    }
    const hits = [];
    for (const { region, map, entries } of buckets.values()) {
      const regionNorm = normalizeRegion(region);
      if (regionKey !== 'all' && regionNorm !== regionKey) continue;
      const grouped = groupEntriesByMon(entries).map(g => {
        if (!g.rarities.length) {
          const r = lookupRarity(g.monName, region, map, locIndex);
          if (r) g.rarities.push(r);
        }
        return g;
      });
      if (grouped.length) hits.push({ region, map, count: grouped.length, entries: grouped });
    }
    hits.sort((a,b)=> a.region.localeCompare(b.region) || a.map.localeCompare(b.map));
    return hits.slice(0, 30);
 }, [query, areasClean, locIndex, mode, areaRegion]);

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
    }));

    // Extra from Areas reverse index
    const extraLocs = (areasRevByMon.get(selected.id) || []).map(e => ({
      region: titleCase(e.region),
      map: e.map,
      method: (e.methods || []).filter(Boolean),
      rarity: (e.rarities || []).filter(Boolean),
    }));


    // Locations from dex data
    const dexLocs = (selected.locations || []).map(l => ({
      region: titleCase(l.region_name || 'Unknown'),
      map: l.location,
      method: [l.type].filter(Boolean),
      rarity: [l.rarity].filter(Boolean),
      min: l.min_level,
      max: l.max_level,
    }));

    // Merge & dedupe by region+map; union methods/rarities
    const byKey = new Map();
    for (const src of [...baseLocs, ...extraLocs, ...dexLocs]) {
      if (!src.map) continue;
      const key = `${src.region}|${src.map}`;
      const prev = byKey.get(key) || { region: src.region, map: src.map, method: [], rarity: [], min: src.min, max: src.max };
      prev.method.push(...(src.method || []));
      prev.rarity.push(...(src.rarity || []));
      prev.min = Math.min(prev.min ?? Infinity, src.min ?? Infinity);
      prev.max = Math.max(prev.max ?? 0, src.max ?? 0);
      byKey.set(key, prev);
    }

    const mergedLocs = [...byKey.values()].map(l => ({
      ...l,
      method: [...new Set(l.method)],
      rarity: [...new Set(l.rarity)],
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
    <>
      {/* App-wide overlay controls (top-right) */}
      <div style={{ position:'fixed', top:10, right:12, zIndex:9999, display:'flex', gap:8 }}>
        <PatchNotesButton />
        <OptionsMenu />
      </div>

      <div className="container">
        {/* Header */}
        <div className="header" style={{ alignItems:'center' }}>
          <img src={headerSrc} alt="" style={{ width:44, height:44, objectFit:'contain', imageRendering:'pixelated' }} />
          <h1 style={{ marginLeft:8 }}>3&apos;s PokeMMO Tool</h1>
        </div>

        {/* Search / Mode Card */}
        <div style={{ ...styles.card, marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={styles.segWrap}>
              <button style={styles.segBtn(mode==='pokemon')} onClick={()=>setMode('pokemon')}>Pokémon Search</button>
              <button style={styles.segBtn(mode==='areas')} onClick={()=>setMode('areas')}>Area Search</button>
              <button style={styles.segBtn(mode==='tm')} onClick={()=>setMode('tm')}>TM Locations</button>
              <button style={styles.segBtn(mode==='live')}    onClick={()=>setMode('live')}>Live</button>
            </div>
          </div>

          {/* Context label + search input (hidden for Live) */}
          {mode!=='live' && (
            <>
               <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div className="label-muted">
                  {mode==='pokemon' ? 'Search by name or Dex #' : mode==='areas' ? 'Search by route/area name' : 'Search by TM name'}
                </div>
                {(mode==='areas' || mode==='tm') && (
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
                        {['All','Kanto','Johto','Hoenn','Sinnoh','Unova'].map(r => (
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
                  : 'e.g. Giga Drain, Payback'}
                className="input"
                style={{ height:44, borderRadius:10, fontSize:16 }}
              />
            </>
          )}

          {/* Live route panel */}
          {mode==='live' && (
            <div style={{ marginTop:4 }}>
              <LiveRoutePanel
                areasIndex={areasClean}
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
                      return (
                        <div key={idx} style={styles.monRow}>
                          <Sprite mon={mon} size={36} alt={g.monName} />
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700 }}>{g.monName}</div>
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
                              {g.methods.map(m => <MethodPill key={`m-${m}`} method={m} />)}
                              {g.rarities.map(r => <RarityPill key={`r-${r}`} rarity={r} />)}
                            </div>
                          </div>
                          {mon && (
                            <button
                              className="btn"
                              style={styles.viewBtn}
                              onClick={() => {
                                setSelected(mon);
                                setMode('pokemon');
                                setQuery('');
                              }}
                              title="Open Pokémon"
                            >View</button>
                          )}
                        </div>
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
        </div>

        {/* Detail Panel (Pokémon) */}
        {mode==='pokemon' && resolved && (
          <div className="grid">
            {/* Left: Pokémon card */}
            <div style={styles.card}>
              <div style={{ display:'flex', gap:12 }}>
                <Sprite mon={selected} size={120} alt={resolved.name} />
                <div>
                  <div style={{ fontSize:22, fontWeight:900 }}>
                    {titleCase(resolved.name)} <span className="label-muted">#{resolved.id}</span>
                  </div>
                  <div style={{ display:'flex', gap:12, marginTop:6, flexWrap:'wrap', alignItems:'center' }}>
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <span className="label-muted" style={{ fontWeight:700 }}>Type:</span>
                      {(resolved.types || []).map(tp => <TypePill key={tp} t={tp} />)}
                    </div>
                    {resolved.eggGroups?.length > 0 && (
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        <span className="label-muted" style={{ fontWeight:700 }}>Egg Group:</span>
                        {resolved.eggGroups.map(g => <EggGroupPill key={g} group={g} />)}
                      </div>
                    )}
                    {resolved.abilities?.length > 0 && (
                      <div style={{ display:'flex', gap:6, alignItems:'center', marginLeft:'auto' }}>
                        <span className="label-muted" style={{ fontWeight:700 }}>Abilities:</span>
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          {resolved.abilities.map((a, i) => (
                            <AbilityPill key={`${a.name}-${i}`} label={`${i+1}`} name={a.name} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                    <InfoPill label="Exp" value={titleCase((resolved.expType||'').replace(/_/g,' '))} />
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
                  {resolved.evolutions?.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:8 }}>
                      <span className="label-muted" style={{ fontWeight:700 }}>Evolutions:</span>
                      {resolved.evolutions.map((e,i)=>(
                        <span key={i}>{`${e.name} (${titleCase(e.type.toLowerCase())}${e.val?`: ${e.val}`:''})`}</span>
                      ))}
                    </div>
                  )}
                  {resolved.heldItems?.length > 0 && (
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8, alignItems:'center' }}>
                      <span className="label-muted" style={{ fontWeight:700 }}>Held Items:</span>
                      {resolved.heldItems.map((h,i)=> <span key={i}>{h.name || h}</span>)}
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

              <EvolutionChain mon={resolved} onSelect={(m)=>{ setSelected(m); setShowMoveset(false); }} />
              {MOVE_METHODS.some(m => (resolved.moves?.[m.key] || []).length) && (
                <div style={{ margin:'16px 0 6px' }}>
                  <div
                    className="label-muted"
                    style={{ fontWeight:700, cursor:'pointer' }}
                    onClick={() => setShowMoveset(v => !v)}
                  >
                    {showMoveset ? '▾' : '▸'} Moveset
                  </div>
                  {showMoveset && (
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:6 }}>
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
            </div>

            {/* Right: Locations */}
            <div style={styles.card}>
              <div className="label-muted" style={{ fontWeight:700, marginBottom:6 }}>Locations</div>
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
            </div>
          </div>
        )}
      </div>

      {/* Fixed version badge */}
      <VersionBadge />
    </>
  );
}

export default App;
