import React, { useState, useRef, useEffect } from 'react';

export default function OptionsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const item = (label, onClick) => (
    <button
      key={label}
      className="px-3 py-2 w-full text-left hover:bg-zinc-800"
      onClick={() => { setOpen(false); onClick(); }}
    >
      {label}
    </button>
  );

  const actions = [
    item('Check for updates', () => window.app?.checkUpdates?.()),
    item('Reload OCR',        () => window.app?.reloadOCR?.()),
    item('Refresh app',       () => window.app?.refreshApp?.()),
  ];

  return (
    <div ref={ref} style={{ position: 'fixed', top: 8, right: 12, zIndex: 9999 }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
        title="Options"
      >
        Options ▾
      </button>
      {open && (
        <div className="mt-2 rounded border border-zinc-700 bg-zinc-900 shadow-xl"
             style={{ minWidth: 200 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
