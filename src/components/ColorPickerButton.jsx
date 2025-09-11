import React, { useContext, useEffect, useState } from 'react';
import { ColorContext, DEFAULT_METHOD_COLORS, DEFAULT_RARITY_COLORS } from '../colorConfig.js';

export default function ColorPickerButton(){
  const { methodColors, rarityColors, setMethodColors, setRarityColors } = useContext(ColorContext);
  const [open, setOpen] = useState(false);
  const [mColors, setMColors] = useState(methodColors);
  const [rColors, setRColors] = useState(rarityColors);

  useEffect(()=>{ setMColors(methodColors); }, [methodColors]);
  useEffect(()=>{ setRColors(rarityColors); }, [rarityColors]);

  const btnStyle = {
    padding:'6px 10px', borderRadius:10, border:'1px solid var(--divider)',
    background:'linear-gradient(180deg,var(--surface),var(--card))', color:'var(--text)',
    fontWeight:700, cursor:'pointer', boxShadow:'var(--shadow-1)'
  };
  const overlayStyle = {
    position:'fixed', top:0, left:0, width:'100vw', height:'100vh',
    background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center',
    justifyContent:'center', zIndex:1000
  };
  const modalStyle = {
    background:'var(--surface)', color:'var(--text)', padding:20,
    width:'fit-content', maxHeight:'80%', overflowY:'auto',
    borderRadius:'var(--radius-lg)', boxShadow:'var(--shadow-2)'
  };
  const sectionStyle = { marginBottom:20 };
  const rowStyle = { display:'flex', alignItems:'center', gap:12, marginBottom:8 };
  const labelStyle = { width:140, fontWeight:600, textTransform:'capitalize' };

  const onSave = () => {
    const m = { ...mColors };
    const r = { ...rColors };
    setMethodColors(m);
    setRarityColors(r);
    try {
      localStorage.setItem('methodColors', JSON.stringify(m));
      localStorage.setItem('rarityColors', JSON.stringify(r));
    } catch {}
    setOpen(false);
  };
  const onDefault = () => {
    setMColors({ ...DEFAULT_METHOD_COLORS });
    setRColors({ ...DEFAULT_RARITY_COLORS });
  };

  const renderInputs = (colors, setter) => (
    Object.entries(colors).map(([key,val]) => (
      <div key={key} style={rowStyle}>
        <span style={labelStyle}>{key}</span>
        <input
          type="color"
          value={stripAlpha(val)}
          onChange={e => setter(prev => ({ ...prev, [key]: e.target.value + 'ff' }))}
        />
      </div>
    ))
  );

  return (
    <>
      <button style={btnStyle} onClick={()=>setOpen(true)} title="Choose Colors">Choose Colors</button>
      {open && (
        <div style={overlayStyle} onClick={()=>setOpen(false)}>
          <div style={modalStyle} onClick={e=>e.stopPropagation()}>
            <div style={sectionStyle}>
              <div style={{ fontWeight:800, marginBottom:8 }}>Method Colors</div>
              {renderInputs(mColors, setMColors)}
            </div>
            <div style={sectionStyle}>
              <div style={{ fontWeight:800, marginBottom:8 }}>Rarity Colors</div>
              {renderInputs(rColors, setRColors)}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 }}>
              <button style={btnStyle} onClick={onDefault}>Default</button>
              <button style={btnStyle} onClick={onSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function stripAlpha(hex){
  if (typeof hex !== 'string') return '#000000';
  return hex.length === 9 ? hex.slice(0,7) : hex;
}
