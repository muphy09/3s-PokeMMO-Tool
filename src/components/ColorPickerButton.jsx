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
  const sectionStyle = { marginBottom:20 };
  const rowStyle = { display:'flex', alignItems:'center', gap:12, marginBottom:8 };
  const labelStyle = { width:140, fontWeight:600 };

  const onSave = () => {
    setMethodColors(mColors);
    setRarityColors(rColors);
    try {
      localStorage.setItem('methodColors', JSON.stringify(mColors));
      localStorage.setItem('rarityColors', JSON.stringify(rColors));
    } catch {}
    setOpen(false);
  };
  const onDefault = () => {
    setMColors(DEFAULT_METHOD_COLORS);
    setRColors(DEFAULT_RARITY_COLORS);
  };

  const renderInputs = (colors, setter) => (
    Object.entries(colors).map(([key,val]) => (
      <div key={key} style={rowStyle}>
        <span style={labelStyle}>{key}</span>
        <input type="color" value={stripAlpha(val)} onChange={e=> setter(prev=>({ ...prev, [key]: e.target.value + 'ff' }))} />
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