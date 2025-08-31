import React, { useState } from 'react';
import breedingTable from '../data/breedingTable.json';
import ivData from '../data/ivs.json';

const STAT_OPTIONS = ivData.IV_STATS.filter(s => s.id !== 'nat');
const IV_COLORS = ivData.IV_COLORS;

const BREEDING_FORM_VALUES = {
  nature: {
    iv: {
      5: [2, 11, 10, 6, 2],
      4: [6, 5, 3, 1, 0],
      3: [4, 2, 1, 0, 0],
      2: [2, 1, 0, 0, 0],
      1: [1, 0, 0, 0, 0]
    }
  },
  random: {
    iv: {
      5: [2, 5, 5, 3, 1],
      4: [2, 3, 2, 1, 0],
      3: [2, 1, 1, 0, 0],
      2: [1, 1, 0, 0, 0]
    }
  }
};

const COSTS_TABLE = {
  nature: { 2: 75000, 3: 170000, 4: 355000, 5: 715000 },
  random: { 2: 20000, 3: 65000, 4: 155000, 5: 340000 }
};

const styles = {
  card: { padding:16, borderRadius:12, border:'1px solid #262626', background:'#111' },
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

export default function BreedingSimulator(){
  const [ivsCount, setIvsCount] = useState(2);
  const [nature, setNature] = useState(false);
  const [ivs, setIvs] = useState({1:'hp',2:'atk',3:'def',4:'spdef',5:'spe'});
  const [showTree, setShowTree] = useState(false);
  const [breds, setBreds] = useState(new Set());

  const counts = (nature ? BREEDING_FORM_VALUES.nature.iv : BREEDING_FORM_VALUES.random.iv)[ivsCount] || [];
  const breedingData = nature ? breedingTable.nature[`iv${ivsCount}`] : breedingTable.random[`iv${ivsCount}`];
  const totalPokemonReq = counts.reduce((t,c)=>t+c,0);
  const expectedPrice = (nature ? COSTS_TABLE.nature : COSTS_TABLE.random)[ivsCount] || 0;

  const toggleBred = key => {
    setBreds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleStart = () => { setShowTree(true); setBreds(new Set()); };
  const handleClear = () => { setShowTree(false); setBreds(new Set()); };

  return (
    <div>
      <div style={{...styles.card, marginBottom:16}}>
        <div style={{display:'flex', gap:16, flexWrap:'wrap', marginBottom:8}}>
          <div>
            <div className="label-muted">How many IVs?</div>
            <select
              value={ivsCount}
              onChange={e=>{setIvsCount(Number(e.target.value)); setShowTree(false);}}
              className="input"
              style={{height:32}}
            >
              {[2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{display:'flex', flexDirection:'column', justifyContent:'flex-end'}}>
            <label style={{color:'#cfcfcf'}}>
              <input
                type="checkbox"
                checked={nature}
                onChange={e=>{setNature(e.target.checked); setShowTree(false);}}
                style={{marginRight:4}}
              />
              Include nature
            </label>
          </div>
        </div>
        <div style={{display:'flex', flexWrap:'wrap', gap:12}}>
          {counts.map((count,i)=> count>0 && (
            <div key={i} style={{display:'flex', flexDirection:'column', gap:4}}>
              <div className="label-muted" style={{fontWeight:700}}>{count}×31 IV in...</div>
              <select
                value={ivs[i+1]}
                onChange={e=>setIvs({...ivs,[i+1]:e.target.value})}
                className="input"
                style={{height:32}}
              >
                {STAT_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{marginTop:12, display:'flex', gap:8}}>
          <button onClick={handleStart} style={styles.viewBtn}>Start</button>
          <button onClick={handleClear} style={styles.viewBtn}>Clear</button>
        </div>
        <div style={{marginTop:12}} className="label-muted">
          Expected cost: <strong>{expectedPrice}$</strong> — Total breeders: <strong>{totalPokemonReq}</strong>
        </div>
      </div>
      {showTree && breedingData && (
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:16}}>
          {Object.keys(breedingData).map((rowKey, rowIndex) => (
            <div key={rowKey} style={{display:'flex', gap:8, justifyContent:'center'}}>
              {breedingData[rowKey].map((arr, index) => {
                const colors = arr.map(n => {
                  const stat = n === 0 ? 'nat' : ivs[n];
                  return IV_COLORS[stat];
                });
                const key = `${rowKey}-${index}`;
                const size = 20 + rowIndex * 10;
                const isBred = breds.has(key);
                return (
                  <div
                    key={key}
                    onClick={()=>toggleBred(key)}
                    title={arr.map(n => n===0 ? 'Nature' : ivs[n]).join(' ')}
                    style={{
                      cursor:'pointer',
                      borderRadius:'50%',
                      overflow:'hidden',
                      border:isBred ? '3px solid #a2f79f' : '1px solid #333',
                      width:size,
                      height:size,
                      display:'flex'
                    }}
                  >
                    {colors.map((c,i)=>(<div key={i} style={{flex:1, background:c}} />))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}