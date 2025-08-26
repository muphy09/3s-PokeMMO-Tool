import React, { useEffect, useState } from 'react';
import { marked } from 'marked';

export default function PatchNotesModal({ open, onClose }) {
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!open) return;
    let canceled = false;
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}CHANGELOG.md`);
        const txt = await res.text();
        if (!canceled) setContent(marked.parse(txt));
      } catch (err) {
        console.error('Failed to load changelog', err);
        if (!canceled) setContent('<p>Failed to load changelog.</p>');
      }
    }
    load();
    return () => { canceled = true; };
  }, [open]);

  if (!open) return null;

  const overlay = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0,0,0,0.6)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  const card = {
    position: 'relative',
    width: '80vw',
    maxWidth: 900,
    maxHeight: '80vh',
    overflowY: 'auto',
    background: '#0f172a',
    color: '#f7fafc',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
    padding: 20
  };

  const closeBtn = {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: '4px 8px',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    background: 'linear-gradient(180deg,#2b2b2b,#1b1b1b)',
    color: '#eaeaea',
    fontWeight: 700,
    cursor: 'pointer'
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <button style={closeBtn} onClick={onClose} aria-label="Close patch notes">Close</button>
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    </div>
  );
}