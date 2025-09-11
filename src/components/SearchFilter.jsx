import React, { useState, useRef, useEffect } from 'react';

// Allow an empty options array by default so the component can render even if
// the caller forgets to supply one. This prevents runtime errors that would
// otherwise hide the input entirely.
export default function SearchFilter({
  value,
  onChange,
  options = [],
  placeholder = '',
  style = {},
  minChars = 0
}) {
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

  const filtered = query.length >= minChars
    ? options.filter(opt => opt.toLowerCase().includes(query.toLowerCase()))
    : [];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => {
          const val = e.target.value;
          setQuery(val);
          onChange(val);
          setOpen(val.length >= minChars);
        }}
        className="input"
        style={{ height:44, borderRadius:10, width:160, ...style }}
        placeholder={placeholder}
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
            border: '1px solid var(--divider)',
            background: 'var(--surface)',
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