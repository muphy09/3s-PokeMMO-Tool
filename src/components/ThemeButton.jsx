import { useEffect, useRef, useState } from 'react';

const THEMES = [
  { key: 'classic', label: 'Classic' },
  { key: 'neo', label: 'Neo' },
  { key: 'red', label: 'Red' },
  { key: 'blue', label: 'Blue' },
  { key: 'gold', label: 'Gold' },
  { key: 'silver', label: 'Silver' },
  { key: 'emerald', label: 'Emerald' },
  { key: 'diamond', label: 'Diamond' },
  { key: 'pearl', label: 'Pearl' },
  { key: 'black', label: 'Black' },
  { key: 'white', label: 'White' }
];

export default function ThemeButton({ theme, setTheme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const wrapperStyle = {
    position: 'relative',
    display: 'inline-block',
    zIndex: 10000
  };

  const btnStyle = {
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid var(--divider)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: 'var(--shadow-1)'
  };

  const menuStyle = {
    position: 'absolute',
    left: 0,
    bottom: 'calc(100% + 8px)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--surface)',
    border: '1px solid var(--divider)',
    borderRadius: 10,
    boxShadow: 'var(--shadow-2)',
    overflow: 'hidden',
    zIndex: 10001
  };

  const itemStyle = {
    padding: '8px 12px',
    textAlign: 'left',
    background: 'transparent',
    border: 0,
    color: 'var(--text)',
    cursor: 'pointer',
    fontWeight: 600
  };

  return (
    <div ref={ref} style={wrapperStyle}>
      <button style={btnStyle} onClick={() => setOpen(v => !v)}>Theme</button>
      {open && (
        <div style={menuStyle} role="menu">
          {THEMES.map(t => (
            <button
              key={t.key}
              style={{ ...itemStyle, fontWeight: t.key === theme ? 800 : 600 }}
              onClick={() => {
                setTheme(t.key);
                setOpen(false);
              }}
              role="menuitem"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
