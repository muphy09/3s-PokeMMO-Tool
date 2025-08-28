import React, { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import changelog from '../../CHANGELOG.md?raw';

export function openPatchNotes() {
  window.dispatchEvent(new Event('patchnotes:open'));
}

export default function PatchNotesButton() {
  const [open, setOpen] = useState(false);
  const html = useMemo(() => marked.parse(changelog), []);
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('patchnotes:open', handler);
    return () => window.removeEventListener('patchnotes:open', handler);
  }, []);

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

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  };

  const modalStyle = {
    background: 'var(--surface)',
    color: 'var(--text)',
    padding: 20,
    width: '80%',
    maxWidth: 800,
    maxHeight: '80%',
    overflowY: 'auto',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-2)'
  };

  const closeStyle = {
    marginTop: 16,
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid #2a2a2a',
    background: 'linear-gradient(180deg,#2b2b2b,#1b1b1b)',
    color: '#eaeaea',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,.3)',
    float: 'right'
  };

  return (
    <>
      <button style={btnStyle} onClick={openPatchNotes} title="Patch Notes">
        Patch Notes
      </button>
      {open && (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div dangerouslySetInnerHTML={{ __html: html }} />
            <button style={closeStyle} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
