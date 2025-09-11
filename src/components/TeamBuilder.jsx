import React from 'react';
import { getAll, getByName } from '../lib/dex.js';
import itemsRaw from '../../itemdata.json';

const MON_LIST = getAll();
const EMPTY_TEAM = Array(6).fill('');
const EMPTY_ITEMS = Array(6).fill('');

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

const ALL_TYPES = Object.keys(TYPE_CHART).map(t => t.charAt(0).toUpperCase() + t.slice(1));

const TYPE_COLORS = {
  Normal:'#A8A77A', Fire:'#EE8130', Water:'#6390F0', Electric:'#F7D02C', Grass:'#7AC74C',
  Ice:'#96D9D6', Fighting:'#C22E28', Poison:'#A33EA1', Ground:'#E2BF65', Flying:'#A98FF3',
  Psychic:'#F95587', Bug:'#A6B91A', Rock:'#B6A136', Ghost:'#735797', Dragon:'#6F35FC',
  Dark:'#705746', Steel:'#B7B7CE'
};

const SPRITES_BASE = (import.meta.env.VITE_SPRITES_BASE || `${import.meta.env.BASE_URL}sprites/`).replace(/\/+$/, '/');
const SPRITES_EXT  = import.meta.env.VITE_SPRITES_EXT || '.png';

// Item assets (reuse same source as Items tab)
const ITEM_ICON_BASE = 'https://raw.githubusercontent.com/PokeMMO-Tools/pokemmo-data/main/assets/itemicons/';
const ITEM_PLACEHOLDER = `${import.meta.env.BASE_URL}no-item.svg`;

function normalizeKey(s=''){
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/♀/g,'-f')
    .replace(/♂/g,'-m')
    .replace(/[^\w\s-]/g,'')
    .replace(/\s+/g,'-')
    .replace(/-+/g,'-')
    .trim();
}

function cleanItemDescription(desc) {
  if (!desc) return '';
  let s = String(desc).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  // Remove the prefix "An item to be held by a Pokémon" (handle Pokemon/Pokémon + optional punctuation)
  s = s.replace(/^\s*An item to be held by a Pok[eé]mon\.?\s*/i, '');
  return s.trim();
}

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

function TypeChip({ t, dim=false }){
  const lc = String(t).toLowerCase();
  const name = lc.charAt(0).toUpperCase() + lc.slice(1);
  const bg = TYPE_COLORS[name] || '#777';
  return (
    <span style={{
      display:'inline-flex',
      flex:'0 0 auto',
      justifyContent:'center',
      alignItems:'center',
      width:80,
      padding:'4px 0',
      borderRadius:999,
      fontWeight:700,
      fontSize:13,
      lineHeight:1,
      background:bg,
      color:'#fff',
      whiteSpace:'nowrap',
      opacity:dim?0.3:1
    }}>{name}</span>
  );
}

function computeMultipliers(types = []) {
  const tlist = (Array.isArray(types) ? types : []).map(t => t.toLowerCase());
  const mult = {};
  for (const atk of Object.keys(TYPE_CHART)) mult[atk] = 1;
  for (const def of tlist) {
    const d = TYPE_CHART[def];
    if (!d) continue;
    d.weak.forEach(t => { mult[t] *= 2; });
    d.res.forEach(t => { mult[t] *= 0.5; });
    d.imm.forEach(t => { mult[t] *= 0; });
  }
  return mult;
}

function bucketsFromMultipliers(mult = {}) {
  const buckets = { x4: [], x2: [], x1: [], x05: [], x0: [] };
  for (const [t, m] of Object.entries(mult)) {
    const name = t.charAt(0).toUpperCase() + t.slice(1);
    if (m === 4) buckets.x4.push(name);
    else if (m === 2) buckets.x2.push(name);
    else if (m === 1) buckets.x1.push(name);
    else if (m === 0.5 || m === 0.25) buckets.x05.push(name);
    else if (m === 0) buckets.x0.push(name);
  }
  return buckets;
}

export default function TeamBuilder({ onViewMon }) {
  const [team, setTeam] = React.useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('teamBuilderCurrent') || '[]');
      if (Array.isArray(saved)) {
        return EMPTY_TEAM.map((_, i) => saved[i] || '');
      }
      if (saved && typeof saved === 'object' && Array.isArray(saved.mons)) {
        return EMPTY_TEAM.map((_, i) => saved.mons[i] || '');
      }
    } catch {}
    return [...EMPTY_TEAM];
  });

  React.useEffect(() => {
    try {
      const items = JSON.parse(sessionStorage.getItem('teamBuilderHeldItems') || '[]');
      const obj = { mons: team, items: Array.isArray(items) ? items : [...EMPTY_ITEMS] };
      sessionStorage.setItem('teamBuilderCurrent', JSON.stringify(obj));
    } catch {}
  }, [team]);

  // Simple tooltip state
  const [tip, setTip] = React.useState({ visible:false, text:'', x:0, y:0 });
  const tipTimerRef = React.useRef(null);
  const showTooltip = (el, text, delayMs = 0) => {
    if (!el || !text) return;
    const fire = () => {
      const rect = el.getBoundingClientRect();
      setTip({ visible:true, text, x: Math.round(rect.left), y: Math.round(rect.bottom + 8) });
    };
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    if (delayMs > 0) tipTimerRef.current = setTimeout(fire, delayMs);
    else fire();
  };
  const hideTooltip = () => {
    if (tipTimerRef.current) { clearTimeout(tipTimerRef.current); tipTimerRef.current = null; }
    setTip(prev => ({ ...prev, visible:false }));
  };

  const [heldItems, setHeldItems] = React.useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('teamBuilderHeldItems') || '[]');
      if (Array.isArray(saved)) return EMPTY_ITEMS.map((_, i) => saved[i] || '');
      if (saved && typeof saved === 'object' && Array.isArray(saved.items)) return EMPTY_ITEMS.map((_, i) => saved.items[i] || '');
    } catch {}
    return [...EMPTY_ITEMS];
  });

  React.useEffect(() => {
    try {
      sessionStorage.setItem('teamBuilderHeldItems', JSON.stringify(heldItems));
      const mons = JSON.parse(sessionStorage.getItem('teamBuilderCurrent') || '[]');
      const obj = Array.isArray(mons) ? { mons, items: heldItems } : { mons: mons?.mons || EMPTY_TEAM, items: heldItems };
      sessionStorage.setItem('teamBuilderCurrent', JSON.stringify(obj));
    } catch {}
  }, [heldItems]);

  const [savedTeams, setSavedTeams] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem('teamBuilderSavedTeams') || '{}');
    } catch {
      return {};
    }
  });

  const [selectedSave, setSelectedSave] = React.useState('');
  const [saveName, setSaveName] = React.useState('');

  const handleSave = () => {
    const name = saveName.trim() || selectedSave;
    if (!name) return;
    setSavedTeams(prev => {
      const next = { ...prev, [name]: { mons: team, items: heldItems } };
      try { localStorage.setItem('teamBuilderSavedTeams', JSON.stringify(next)); } catch {}
      return next;
    });
    setSaveName('');
    setSelectedSave(name);
  };

  const handleLoad = (name) => {
    const t = savedTeams[name];
    if (t) {
      if (Array.isArray(t)) {
        setTeam(EMPTY_TEAM.map((_, i) => t[i] || ''));
        setHeldItems([...EMPTY_ITEMS]);
      } else if (t && typeof t === 'object') {
        setTeam(EMPTY_TEAM.map((_, i) => t.mons?.[i] || ''));
        setHeldItems(EMPTY_ITEMS.map((_, i) => t.items?.[i] || ''));
      }
    }
  };

  const handleClear = () => {
    setTeam([...EMPTY_TEAM]);
    setHeldItems([...EMPTY_ITEMS]);
    try {
      sessionStorage.removeItem('teamBuilderCurrent');
      sessionStorage.removeItem('teamBuilderHeldItems');
    } catch {}
  };

  const handleDelete = (name) => {
    if (!name) return;
    setSavedTeams(prev => {
      const next = { ...prev };
      delete next[name];
      try { localStorage.setItem('teamBuilderSavedTeams', JSON.stringify(next)); } catch {}
      return next;
    });
    if (selectedSave === name) setSelectedSave('');
  };

  const mons = team.map(name => getByName(name));

  const buckets = React.useMemo(() => (
    mons.map(mon => mon ? bucketsFromMultipliers(computeMultipliers(mon.types)) : null)
  ), [mons]);

  const teamResisted = React.useMemo(() => {
    const res = {};
    buckets.forEach(b => {
      if (!b) return;
      [...(b.x05||[]), ...(b.x0||[])].forEach(t => { res[t.toLowerCase()] = true; });
    });
    return res;
  }, [buckets]);

  const teamTypes = React.useMemo(() => {
    const used = {};
    mons.forEach(mon => {
      if (!mon) return;
      mon.types.forEach(t => { used[t.toLowerCase()] = true; });
    });
    return used;
  }, [mons]);

  const recommendedTypes = React.useMemo(() => {
    const needed = ALL_TYPES.filter(t => !teamResisted[t.toLowerCase()]);
    const rec = {};
    needed.forEach(atk => {
      Object.entries(TYPE_CHART).forEach(([def, info]) => {
        const atkLower = atk.toLowerCase();
        if (info.res.includes(atkLower) || info.imm.includes(atkLower)) {
          const name = def.charAt(0).toUpperCase() + def.slice(1);
          rec[name] = true;
        }
      });
    });
    return Object.keys(rec).filter(t => !teamTypes[t.toLowerCase()]).sort();
  }, [teamResisted, teamTypes]);

  const updateSlot = (idx, value) => {
    setTeam(prev => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const updateItemSlot = (idx, value) => {
    setHeldItems(prev => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const teamLabel = selectedSave.trim() || 'Team';
  const cellStyle = { border:'1px solid var(--divider)', padding:4, verticalAlign:'top' };

  return (
    <div style={{ paddingBottom:24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
        <div style={{ position:'relative', flex:1, minWidth:120 }}>
          <select
            value={selectedSave}
            onChange={e => { const name = e.target.value; setSelectedSave(name); handleLoad(name); }}
            className="input"
            style={{ height:32, borderRadius:8, width:'100%', paddingRight:64 }}
          >
            <option value="">Saved Teams</option>
            {Object.keys(savedTeams).map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {selectedSave && (
            <button
              onClick={() => handleDelete(selectedSave)}
              title="Delete team"
              style={{
                position:'absolute',
                right:32,
                top:4,
                width:24,
                height:24,
                lineHeight:'20px',
                textAlign:'center',
                border:'none',
                background:'transparent',
                color:'var(--text)',
                cursor:'pointer'
              }}
            >
              ×
            </button>
          )}
        </div>
        <input
          type="text"
          placeholder="Team name"
          value={saveName}
          onChange={e => setSaveName(e.target.value)}
          className="input"
          style={{ height:32, borderRadius:8, flex:1, minWidth:120, width:'auto' }}
        />
        <button onClick={handleSave} className="region-btn" style={{ flexShrink:0 }}>Save Team</button>
        <button onClick={handleClear} className="region-btn" style={{ flexShrink:0 }}>Clear</button>
      </div>
      <div style={{ display:'flex', alignItems:'flex-start', gap:24 }}>
        <div style={{ flex:'0 0 66%', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div className="label-muted" style={{ textAlign:'center', fontWeight:700 }}>Pokemon</div>
            {team.map((name, idx) => (
              <input
                key={`mon-${idx}`}
                list="team-mons"
                value={name}
                onChange={e => updateSlot(idx, e.target.value)}
                placeholder={`Slot ${idx + 1}`}
                className="input"
                style={{ height:30, borderRadius:8 }}
              />
            ))}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div className="label-muted" style={{ textAlign:'center', fontWeight:700 }}>Held Item</div>
            {heldItems.map((val, idx) => (
              <input
                key={`item-${idx}`}
                list="team-items"
                value={val}
                onChange={e => updateItemSlot(idx, e.target.value)}
                placeholder={`Item ${idx + 1}`}
                className="input"
                style={{ height:30, borderRadius:8 }}
                onMouseEnter={(e) => {
                  const obj = ITEM_INDEX.byName.get(normalizeKey(val));
                  const text = cleanItemDescription(obj?.description || '');
                  if (text) showTooltip(e.currentTarget, text, 2000);
                }}
                onMouseLeave={hideTooltip}
              />
            ))}
          </div>
        </div>
        <div style={{ flex:'1 0 34%', flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ fontWeight:600, textAlign:'center', marginBottom:4 }}>{teamLabel}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, width:'90%', placeItems:'center' }}>
            {team.map((_, idx) => {
              const mon = mons[idx];
              const dex = mon?.dex ?? mon?.id;
              const img = dex != null ? `${SPRITES_BASE}${dex}${SPRITES_EXT}` : null;
              const itemName = heldItems[idx] || '';
              const itemObj = ITEM_INDEX.byName.get(normalizeKey(itemName));
              const itemIcon = itemObj?.id != null ? `${ITEM_ICON_BASE}${itemObj.id}.png` : (itemName ? ITEM_PLACEHOLDER : null);
              return (
                <div key={idx} style={{
                  width:'100%',
                  maxWidth:96,
                  aspectRatio:'1',
                  borderRadius:'50%',
                  background:'var(--surface)',
                  border:'1px solid var(--divider)',
                  position:'relative',
                  display:'flex',
                  justifyContent:'center',
                  alignItems:'center'
                }}>
                  {img && <img src={img} alt={mon?.name} style={{ width:'80%', height:'80%' }} />}
                  {itemIcon && (
                    <img
                      src={itemIcon}
                      alt={itemName}
                      title={itemName}
                      style={{ position:'absolute', left:2, bottom:2, width:22, height:22, borderRadius:4, background:'var(--surface)', boxShadow:'0 0 0 1px var(--divider)' }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <datalist id="team-mons">
        {MON_LIST.map(m => (
          <option key={m.name} value={m.name} />
        ))}
      </datalist>
      <datalist id="team-items">
        {ITEM_LIST.map(i => (
          <option key={i.id ?? i.name} value={i.name} />
        ))}
      </datalist>

      {mons.some(m => m) && (
        <div style={{ marginTop:24 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <colgroup>
              <col style={{ width:'16%' }} />
              <col style={{ width:'16%' }} />
              <col style={{ width:'34%' }} />
              <col style={{ width:'34%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...cellStyle, background:'var(--surface)', fontWeight:600 }}>Pokemon</th>
                <th style={{ ...cellStyle, background:'var(--surface)', fontWeight:600 }}>Type</th>
                <th style={{ ...cellStyle, background:'var(--surface)', fontWeight:600 }}>Weakness</th>
                <th style={{ ...cellStyle, background:'var(--surface)', fontWeight:600 }}>Resistance</th>
              </tr>
            </thead>
            <tbody>
              {team.map((name, idx) => {
                const mon = mons[idx];
                if (!mon) return null;
                const b = buckets[idx] || {};
                const weak = [...(b.x4||[]), ...(b.x2||[])];
                const res = [...(b.x05||[]), ...(b.x0||[])];
                const types = [...new Set(mon.types)];
                const itemName = heldItems[idx] || '';
                return (
                  <tr key={idx} style={{ height:72 }}>
                    <td style={{ ...cellStyle, textAlign:'center', verticalAlign:'middle' }}>
                      <button
                        type="button"
                        className="tb-mon-link"
                        onClick={() => onViewMon && onViewMon(mon?.name || name)}
                        title="Open in Pokémon Search"
                        style={{
                          background:'transparent',
                          border:'none',
                          padding:0,
                          fontWeight:600,
                          cursor: onViewMon ? 'pointer' : 'default',
                          color: 'var(--text)'
                        }}
                      >
                        {mon.name.charAt(0).toUpperCase() + mon.name.slice(1)}
                      </button>
                      <div
                        className="label-muted"
                        style={{ fontSize:12, marginTop:2 }}
                        onMouseEnter={(e) => {
                          if (!itemName) return;
                          const obj = ITEM_INDEX.byName.get(normalizeKey(itemName));
                          const text = cleanItemDescription(obj?.description || '');
                          if (text) showTooltip(e.currentTarget, text, 0);
                        }}
                        onMouseLeave={hideTooltip}
                        title=""
                      >
                        Held Item: {itemName}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, minHeight:52, height:'100%', alignContent:'center', alignItems:'center', justifyContent:'center' }}>
                        {types.map(t => <TypeChip key={t} t={t} />)}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <div style={{
                        display:'flex',
                        flexWrap:'wrap',
                        gap:6,
                        minHeight:52,
                        height:'100%',
                        alignContent:'center',
                        alignItems:'center',
                        justifyContent:'center'
                      }}>
                        {weak.map(t => <TypeChip key={t} t={t} />)}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, minHeight:52, height:'100%', alignContent:'center', alignItems:'center', justifyContent:'center' }}>
                        {res.map(t => <TypeChip key={t} t={t} />)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop:24 }}>
        <div style={{ fontWeight:600, marginBottom:4 }}>Team Un-Resisted</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {ALL_TYPES.filter(t => !teamResisted[t.toLowerCase()]).map(t => (
            <TypeChip key={t} t={t} />
          ))}
        </div>
      </div>
      <div style={{ marginTop:24 }}>
        <div style={{ fontWeight:600, marginBottom:4 }}>Recommended Pokemon Types</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {recommendedTypes.length ? recommendedTypes.map(t => (
            <TypeChip key={t} t={t} />
          )) : <span>None</span>}
        </div>
      </div>
      {tip.visible && (
        <div style={{
          position:'fixed',
          left: tip.x,
          top: tip.y,
          zIndex: 1000,
          maxWidth: 320,
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid var(--divider)',
          background: 'var(--surface)',
          color: 'var(--text)',
          boxShadow: '0 8px 24px rgba(0,0,0,.25)',
          pointerEvents: 'none'
        }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
