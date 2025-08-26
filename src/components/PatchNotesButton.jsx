import React from 'react';

export default function PatchNotesButton({ onOpen }) {
  const btnStyle = {
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid #2a2a2a',
    background: 'linear-gradient(180deg,#2b2b2b,#1b1b1b)',
    color: '#eaeaea',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,.3)'
  };

  return (
    <button style={btnStyle} onClick={onOpen} title="Patch Notes">
      Patch Notes
    </button>
  );
}