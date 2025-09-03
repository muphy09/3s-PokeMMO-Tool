import React from 'react';
import WeaknessChart from './WeaknessChart.jsx';
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
      const saved = JSON.parse(localStorage.getItem('teamBuilderTeam') || '[]');
      if (Array.isArray(saved)) {
        return EMPTY_TEAM.map((_, i) => saved[i] || '');
      }
    } catch {}
    return [...EMPTY_TEAM];
  });

  React.useEffect(() => {
    try { localStorage.setItem('teamBuilderTeam', JSON.stringify(team)); } catch {}
  }, [team]);

  const mons = team.map(name => getByName(name));

  const mergedBuckets = React.useMemo(() => {
    const mult = {};
    mons.forEach(mon => {
      if (!mon) return;
      const m = computeMultipliers(mon.types);
      for (const [t, val] of Object.entries(m)) {
        mult[t] = Math.max(mult[t] || 1, val);
      }
    });
    return bucketsFromMultipliers(mult);
  }, [mons]);

  const updateSlot = (idx, value) => {
    setTeam(prev => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  return (
    <div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
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
      <datalist id="team-mons">
        {MON_LIST.map(m => (
          <option key={m.name} value={m.name} />
        ))}
      </datalist>
      <div style={{ marginTop:16 }}>
        <WeaknessChart buckets={mergedBuckets} />
      </div>
    </div>
  );
}
