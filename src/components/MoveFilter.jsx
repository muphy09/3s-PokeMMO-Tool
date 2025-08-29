import React, { useState, useRef, useEffect } from 'react';

export default function MoveFilter({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const ref = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (!ref.current || ref.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter(opt =>
    opt.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        className="input"
        style={{ height:44, borderRadius:10, width:160 }}
        placeholder="Move"
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: 200,
            overflowY: 'auto',
            zIndex: 1000,
            border: '1px solid #2b2b2b',
            background: '#141414',
            borderRadius: 8
          }}
        >
          {filtered.map(m => (
            <div
              key={m}
              onMouseDown={() => {
                onChange(m);
                setQuery(m);
                setOpen(false);
              }}
              style={{ padding: '4px 8px', cursor: 'pointer' }}
            >
              {m}
            </div>
          ))}
          {!filtered.length && (
            <div className="label-muted" style={{ padding: '4px 8px' }}>
              No results
            </div>
          )}
        </div>
      )}
    </div>
  );
}