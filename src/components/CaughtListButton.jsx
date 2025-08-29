import React, { useContext, useMemo, useState } from 'react';
import { CaughtContext } from '../caughtContext.js';
import dexRaw from '../../UpdatedDex.json';

const SPRITES_BASE = (import.meta.env.VITE_SPRITES_BASE || `${import.meta.env.BASE_URL}sprites/`).replace(/\/+$/, '/');
const SPRITES_EXT  = import.meta.env.VITE_SPRITES_EXT || '.png';
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

function normalizeKey(s=''){ return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim(); }

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
  arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${mon.id}.png`);
  arr.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${mon.id}.png`);
  return [...new Set(arr)].filter(Boolean);
}
function Sprite({ mon, size=32, alt='' }){
  const srcs = useMemo(()=> spriteSources(mon), [mon]);
  const [idx, setIdx] = useState(0);
  const src = srcs[idx] || TRANSPARENT_PNG;
  return (
    <img
      src={src}
      alt={alt || mon?.name || ''}
      style={{ width:size, height:size, objectFit:'contain', imageRendering:'pixelated' }}
      onError={() => { if (idx < srcs.length - 1) setIdx(idx + 1); }}
    />
  );
}

const DEX_LIST = dexRaw.map(m => ({
  id: m.id,
  name: m.name,
  sprite: m.sprite,
  sprites: m.sprites,
  image: m.image,
  icon: m.icon
}));

function titleCase(s=''){ return String(s).split(' ').map(w => (w? w[0].toUpperCase()+w.slice(1).toLowerCase():w)).join(' '); }

export default function CaughtListButton(){
  const { caught, toggleCaught } = useContext(CaughtContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const btnStyle = {
    padding:'6px 10px', borderRadius:10, border:'1px solid #2a2a2a',
    background:'linear-gradient(180deg,#2b2b2b,#1b1b1b)', color:'#eaeaea',
    fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(0,0,0,.3)'
  };
  const overlayStyle = {
    position:'fixed', top:0, left:0, width:'100vw', height:'100vh',
    background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center',
    justifyContent:'center', zIndex:1000
  };
  const modalStyle = {
    background:'var(--surface)', color:'var(--text)', padding:20,
    width:'90%', maxWidth:600, maxHeight:'80%', overflowY:'auto',
    borderRadius:'var(--radius-lg)', boxShadow:'var(--shadow-2)'
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEX_LIST;
    return DEX_LIST.filter(m => String(m.id).includes(q) || m.name.toLowerCase().includes(q));
  }, [query]);

  return (
    <>
      <button style={btnStyle} onClick={()=>setOpen(true)} title="Caught List">Caught List</button>
      {open && (
        <div style={overlayStyle} onClick={()=>setOpen(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <input
              className="input"
              placeholder="Search"
              value={query}
              onChange={e=>setQuery(e.target.value)}
              style={{ width:'100%', marginBottom:12, borderRadius:8, padding:8 }}
            />
            <div style={{ maxHeight:'60vh', overflowY:'auto' }}>
              {list.map(mon => (
                <label key={mon.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0' }}>
                  <input type="checkbox" checked={caught.has(mon.id)} onChange={()=>toggleCaught(mon.id)} />
                  <Sprite mon={mon} size={32} alt={mon.name} />
                  <span style={{ flex:1 }}>{titleCase(mon.name)}</span>
                  <span className="label-muted">#{mon.id}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}