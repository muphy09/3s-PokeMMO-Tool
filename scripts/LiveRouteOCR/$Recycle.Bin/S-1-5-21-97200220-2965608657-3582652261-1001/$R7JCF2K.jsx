import React, { useEffect, useMemo, useState } from 'react';
import './index.css';
import rawDex from './pokedex.json';

const LOCATIONS_URL = `${import.meta.env.BASE_URL}data/pokemmo_locations.json`;
const AREAS_URL     = `${import.meta.env.BASE_URL}data/areas_index.json`;
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
  monRow: { display:'flex', gap:10, alignItems:'center', border:'1px solid #262626', borderRadius:10, padding:'8px 10px', background:'#141414' }
};

/* ---------- utils ---------- */
function titleCase(s=''){ return String(s).split(' ').map(w => (w? w[0].toUpperCase()+w.slice(1).toLowerCase():w)).join(' '); }
function normalizeKey(s=''){
  return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim();
}
function normalizeType(t){ return String(t||'').toLowerCase().trim(); }
const keyName = (s = "") => s.trim().toLowerCase().replace(/\s+/g, " ");

/* ---------- pokedex adapter ---------- */
function toLegacyShape(m){
  const types = Array.isArray(m.types) ? m.types.map(normalizeType) : [];
  return {
    id: m.dex,
    name: m.name,
    types,
    sprite: m.sprite ?? null,
    sprites: m.sprites ?? null,
    image: m.image ?? null,
    icon: m.icon ?? null
  };
}
const DEX_LIST = rawDex.map(toLegacyShape);
const DEX_BY_NAME = (() => {
  const map = new Map();
  for (const m of DEX_LIST) map.set(normalizeKey(m.name), m);
  return map;
})();
const getMon = (s) => DEX_BY_NAME.get(normalizeKey(s)) || null;

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
        for (const [k,v] of Object.entries(json)) idx[normalizeKey(k)] = v;
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
            const cleaned = [];
            for (const e of entries || []) {
              const method = cleanAreaMethod(e.method || '');
              const rarity = e.rarity || '';
              const speciesRaw = cleanSpeciesName(e.pokemon || '');
              if (!speciesRaw) continue;

              const mon = getMon(speciesRaw) || getMon(titleCase(speciesRaw));
              if (!mon) continue; // drop broken / unmatched
              cleaned.push({
                monId: mon.id,
                monName: mon.name,   // canonical
                method,
                rarity
              });
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
  return t;
}

class LiveRouteClient {
  constructor(){
    this.ws = null;
    this.listeners = new Set();
    this.reconnectTimer = null;
    this.pathToggle = false;
    this.lastMsgTs = 0;
    this.lastPayload = null; // NEW: cache last message
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
    // NEW: immediately replay last payload so Live tab shows data when you return
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
    if (mTagged) return { routeText: mTagged[1], confidence: 0.5 };
    // GUESS: "..."
    const m = msg.match(/GUESS:\s*"?([^"]+?)"?\s*$/i);
    if (m) return { routeText: m[1], confidence: 0.5 };
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
  let c = src.confidence ?? src.conf ?? src.c ?? 0.5;
  if (typeof c === 'string') { const f = parseFloat(c); if (!Number.isNaN(f)) c = f; }
  return (t!==null) ? { routeText: t, confidence: Number(c) || 0.5 } : null;
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

function LiveRoutePanel({ areasIndex }){
  const [rawText, setRawText] = useState('');
  const [confidence, setConfidence] = useState(0);
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

      const cleaned = normalizeHudText(coerced.routeText);
      if (DEBUG_LIVE) console.log('[LIVE] OCR raw:', coerced.routeText, '→ cleaned:', cleaned);

      setRawText(cleaned);
      setConfidence(Number(coerced.confidence || 0));

      const best = findBestMapName(cleaned, areasIndex);
      if (!best){
        setDisplayMap(null); setRegion(null); setEntries([]); setRegionChoices([]);
      } else {
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
      }
    });

    liveRouteClient.connect();

    // heartbeat watcher for stale/connected pill
    const pulse = setInterval(() => {
      setConnected(liveRouteClient.isOpen());
      const last = liveRouteClient.lastMsgTs || 0;
      setIsStale(!!rawText && Date.now() - last > STALE_AFTER_MS);
    }, 1000);

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

    return () => { off(); clearInterval(pulse); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onFocus); };
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
          Start <b>LiveRouteOCR</b> and focus the PokeMMO window. I’ll auto-detect your current route/area and show encounters here.
        </div>
      )}

      {rawText && !displayMap && (
        <div className="label-muted">No route information found. Move a bit or wait for the HUD to stabilize.</div>
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
  const [selected, setSelected] = useState(null);
  const [mode, setMode]         = useState('pokemon'); // 'pokemon' | 'areas' | 'live'

  const locIndex   = useLocationsDb();
  const areasClean = useAreasDbCleaned();
  const areasRevByMon = useMemo(() => buildReverseAreasIndex(areasClean), [areasClean]); // NEW

  const [headerSprite] = useState(() => {
    const withSprite = DEX_LIST.filter(d => spriteSources(d).length > 0);
    return withSprite.length ? spriteSources(withSprite[Math.floor(Math.random()*withSprite.length)])[0] : null;
  });
  useEffect(() => { document.title = APP_TITLE; }, []);
  const headerSrc = headerSprite || TRANSPARENT_PNG;

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
    for (const [region, maps] of Object.entries(areasClean)) {
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
      const grouped = groupEntriesByMon(entries);
      if (grouped.length) hits.push({ region, map, count: grouped.length, entries: grouped });
    }
    hits.sort((a,b)=> a.region.localeCompare(b.region) || a.map.localeCompare(b.map));
    return hits.slice(0, 30);
  }, [query, areasClean, mode]);

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

    // Merge & dedupe by region+map; union methods/rarities
    const byKey = new Map();
    for (const src of [...baseLocs, ...extraLocs]) {
      if (!src.map) continue;
      const key = `${src.region}|${src.map}`;
      const prev = byKey.get(key) || { region: src.region, map: src.map, method: [], rarity: [] };
      prev.method.push(...(src.method || []));
      prev.rarity.push(...(src.rarity || []));
      byKey.set(key, prev);
    }

    const mergedLocs = [...byKey.values()].map(l => ({
      ...l,
      method: [...new Set(l.method)],
      rarity: [...new Set(l.rarity)],
    }));

    const types = (selected.types || []).map(normalizeType);
    return {
      ...selected,
      types,
      weakness: computeWeakness(types),
      locations: mergedLocs
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
            <button style={styles.segBtn(mode==='pokemon')} onClick={()=>setMode('pokemon')}>Pokémon</button>
            <button style={styles.segBtn(mode==='areas')} onClick={()=>setMode('areas')}>Areas</button>
            <button style={styles.segBtn(mode==='live')}    onClick={()=>setMode('live')}>Live</button>
          </div>
        </div>

        {/* Context label + search input (hidden for Live) */}
        {mode!=='live' && (
          <>
            <div className="label-muted" style={{ marginBottom:8 }}>
              {mode==='pokemon' ? 'Search by name or Dex #' : 'Search by route/area name'}
            </div>
            <input
              value={query}
              onChange={(e)=> setQuery(e.target.value)}
              placeholder={mode==='pokemon' ? 'e.g. Garchomp or 445' : 'e.g. Victory Road, Viridian Forest, Route 10'}
              className="input"
              style={{ height:44, borderRadius:10, fontSize:16 }}
            />
          </>
        )}

        {/* Pokémon results */}
        {mode==='pokemon' && !!results.length && (
          <div className="result-grid" style={{ marginTop:12 }}>
            {results.map(p => {
              const mon = p;
              const t = (p.types || []).map(normalizeType);
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
                            style={{ padding:'6px 10px', border:'1px solid #2b2b2b', borderRadius:8, background:'#1a1a1a', cursor:'pointer' }}
                            onClick={() => setSelected(mon)}
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

        {/* Live route panel */}
        {mode==='live' && (
          <div style={{ marginTop:4 }}>
            <LiveRoutePanel areasIndex={areasClean} />
          </div>
        )}
      </div>

      {/* Detail Panel (Pokémon) */}
      {mode!=='live' && resolved && (
        <div className="grid">
          {/* Left: Pokémon card */}
          <div style={styles.card}>
            <div style={{ display:'flex', gap:12 }}>
              <Sprite mon={selected} size={120} alt={resolved.name} />
              <div>
                <div style={{ fontSize:22, fontWeight:900 }}>
                  {titleCase(resolved.name)} <span className="label-muted">#{resolved.id}</span>
                </div>
                <div style={{ display:'flex', gap:6, marginTop:6 }}>
                  {(resolved.types || []).map(tp => <TypePill key={tp} t={tp} />)}
                </div>
              </div>
            </div>

            {/* Weakness table */}
            <div style={{ marginTop:16 }}>
              <div className="label-muted" style={{ fontWeight:700, marginBottom:8 }}>Type Matchups</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:8 }}>
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
  );
}

export default App;
