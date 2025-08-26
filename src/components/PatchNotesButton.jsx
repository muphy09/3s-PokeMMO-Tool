import React from 'react';

export function openPatchNotes() {
  const url = new URL('patchnotes.html', window.location.href);
  window.open(url.toString(), 'patch-notes', 'width=900,height=600');
}

export default function PatchNotesButton() {
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
    <button style={btnStyle} onClick={openPatchNotes} title="Patch Notes">
      Patch Notes
    </button>
  );
}