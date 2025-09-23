import { useEffect, useRef, useState } from 'react';

const LINKS = [
  { label: 'Github Sponsor', url: 'https://github.com/sponsors/muphy09' },
  { label: 'Paypal', url: 'https://www.paypal.com/paypalme/muphy09' }
];

export default function SponsorButton() {
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

  const windowStyle = {
    position: 'absolute',
    left: 0,
    bottom: 'calc(100% + 8px)',
    width: 'min(35vw, 640px)',
    minWidth: '280px',
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--divider)',
    borderRadius: 10,
    padding: 16,
    boxShadow: 'var(--shadow-2)',
    zIndex: 10001,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    lineHeight: 1.4
  };

  const linkButtonStyle = {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--divider)',
    background: 'var(--card)',
    color: 'var(--text)',
    fontWeight: 700,
    width: '100%',
    cursor: 'pointer'
  };

  return (
    <div ref={ref} style={wrapperStyle}>
      <button style={btnStyle} type="button" onClick={() => setOpen(v => !v)}>Sponsor</button>
      {open && (
        <div style={windowStyle}>
          <div>
            You're showing support just by using this tool! If you feel like showing a little extra love, consider a donation - it helps me keep working on this in my spare time.
          </div>
          {LINKS.map(link => (
            <button
              key={link.label}
              style={linkButtonStyle}
              onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
              type="button"
            >
              {link.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

