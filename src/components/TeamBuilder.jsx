import React from 'react';
import { getAll, getByName } from '../lib/pokedexIndex.js';

const MON_LIST = getAll();
const EMPTY_TEAM = Array(6).fill('');

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

export default function TeamBuilder() {
  const [team, setTeam] = React.useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('teamBuilderCurrent') || '[]');
      if (Array.isArray(saved)) {
        return EMPTY_TEAM.map((_, i) => saved[i] || '');
      }
    } catch {}
    return [...EMPTY_TEAM];
  });

  React.useEffect(() => {
    try { sessionStorage.setItem('teamBuilderCurrent', JSON.stringify(team)); } catch {}
  }, [team]);

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
      const next = { ...prev, [name]: team };
      try { localStorage.setItem('teamBuilderSavedTeams', JSON.stringify(next)); } catch {}
      return next;
    });
    setSaveName('');
    setSelectedSave(name);
  };

  const handleLoad = (name) => {
    const t = savedTeams[name];
    if (t) {
      setTeam(EMPTY_TEAM.map((_, i) => t[i] || ''));
    }
  };

  const handleClear = () => {
    setTeam([...EMPTY_TEAM]);
    try { sessionStorage.removeItem('teamBuilderCurrent'); } catch {}
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
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
          {team.map((name, idx) => (
            <input
              key={idx}
              list="team-mons"
              value={name}
              onChange={e => updateSlot(idx, e.target.value)}
              placeholder={`Slot ${idx + 1}`}
              className="input"
              style={{ height:32, borderRadius:8 }}
            />
          ))}
        </div>
        <div style={{ width:140, flexShrink:0 }}>
          <div style={{ fontWeight:600, textAlign:'center', marginBottom:4 }}>{teamLabel}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:8 }}>
            {team.map((_, idx) => {
              const mon = mons[idx];
              const dex = mon?.dex ?? mon?.id;
              const img = dex != null ? `${SPRITES_BASE}${dex}${SPRITES_EXT}` : null;
              return (
                <div key={idx} style={{
                  width:56,
                  height:56,
                  borderRadius:'50%',
                  background:'var(--surface)',
                  border:'1px solid var(--divider)',
                  display:'flex',
                  justifyContent:'center',
                  alignItems:'center'
                }}>
                  {img && <img src={img} alt={mon.name} style={{ width:48, height:48 }} />}
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
              const b = buckets[idx] || {};
              const weak = [...(b.x4||[]), ...(b.x2||[])];
              const res = [...(b.x05||[]), ...(b.x0||[])];
              return (
                <tr key={idx}>
                  <td style={cellStyle}>{mon ? mon.name.charAt(0).toUpperCase() + mon.name.slice(1) : ''}</td>
                  <td style={cellStyle}>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {mon ? mon.types.map(t => <TypeChip key={t} t={t} />) : null}
                    </div>
                  </td>
                  <td style={cellStyle}>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {weak.map(t => <TypeChip key={t} t={t} />)}
                    </div>
                  </td>
                  <td style={cellStyle}>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {res.map(t => <TypeChip key={t} t={t} />)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
    </div>
  );
}
