import React from 'react';
import { getAll, getMon, getMonByDex } from '../lib/dex.js';

const SPRITES_BASE = (import.meta.env.VITE_SPRITES_BASE || `${import.meta.env.BASE_URL}sprites/`).replace(/\/+$/, '/');
const SPRITES_EXT = import.meta.env.VITE_SPRITES_EXT || '.png';

const TYPE_COLORS = {
  normal:'#A8A77A', fire:'#EE8130', water:'#6390F0', electric:'#F7D02C', grass:'#7AC74C',
  ice:'#96D9D6', fighting:'#C22E28', poison:'#A33EA1', ground:'#E2BF65', flying:'#A98FF3',
  psychic:'#F95587', bug:'#A6B91A', rock:'#B6A136', ghost:'#735797', dragon:'#6F35FC',
  dark:'#705746', steel:'#B7B7CE', fairy:'#D685AD'
};

const DAYCARE_LOCATIONS = [
  {
    key: 'kanto-cerulean',
    title: 'Kanto (Below Cerulean) Daycare',
    short: 'Kanto (Below Cerulean)',
    slots: 1,
    summary: 'Single-slot daycare located just south of Cerulean City.'
  },
  {
    key: 'kanto-island4',
    title: 'Kanto (Island 4) Daycare',
    short: 'Kanto (Island 4)',
    slots: 2,
    summary: 'Two-slot daycare found on Sevii Island 4.'
  },
  {
    key: 'johto-route34',
    title: 'Johto (Route 34) Daycare',
    short: 'Johto (Route 34)',
    slots: 2,
    summary: 'Found on Route 34 between Goldenrod City and Azalea Town.'
  },
  {
    key: 'hoenn-mauville',
    title: 'Hoenn (Left of Mauville) Daycare',
    short: 'Hoenn (Left of Mauville)',
    slots: 2,
    summary: 'Located on Route 117, just west of Mauville City.'
  },
  {
    key: 'sinnoh-solaceon',
    title: 'Sinnoh (Solaceon Town) Daycare',
    short: 'Sinnoh (Solaceon Town)',
    slots: 2,
    summary: 'Located in Solaceon Town with two daycare slots available.'
  },
  {
    key: 'unova-striaton',
    title: 'Unova (Left of Striaton) Daycare',
    short: 'Unova (Left of Striaton)',
    slots: 2,
    summary: 'Situated on Route 3, west of Striaton City.'
  }
];

const DAYCARE_MAP = Object.fromEntries(DAYCARE_LOCATIONS.map((d) => [d.key, d]));
const STORAGE_KEY = 'daycareAssignmentsV1';
const DISPLAY_SLOTS = 2;

const ALL_MONS = (() => {
  const base = getAll();
  const list = [];
  for (const mon of base) {
    list.push(mon);
    if (Array.isArray(mon.forms)) {
      for (const form of mon.forms) {
        if (form) list.push(form);
      }
    }
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
})();

function normalizeKey(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/♀/g, '-f')
    .replace(/♂/g, '-m')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function createDefaultAssignments() {
  const out = {};
  for (const loc of DAYCARE_LOCATIONS) {
    out[loc.key] = Array(loc.slots).fill(null);
  }
  return out;
}

function loadAssignments() {
  if (typeof window === 'undefined') return createDefaultAssignments();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const base = createDefaultAssignments();
    for (const loc of DAYCARE_LOCATIONS) {
      const saved = Array.isArray(raw?.[loc.key]) ? raw[loc.key] : [];
      const arr = [];
      for (let i = 0; i < loc.slots; i += 1) {
        const entry = saved[i];
        if (entry && entry.name) {
          arr.push({
            name: entry.name,
            id: entry.id ?? null,
            slug: entry.slug ?? normalizeKey(entry.name)
          });
        } else {
          arr.push(null);
        }
      }
      base[loc.key] = arr;
    }
    return base;
  } catch (err) {
    console.warn('[DaycareManager] Failed to read saved daycare assignments', err);
    return createDefaultAssignments();
  }
}

function resolveMon(entry) {
  if (!entry) return null;
  let mon = null;
  if (entry.id != null) mon = getMonByDex(entry.id);
  if (!mon && entry.slug) mon = getMon(entry.slug);
  if (!mon && entry.name) mon = getMon(entry.name);
  return mon;
}

function buildSpriteCandidates(mon, entry) {
  if (!mon && !entry) return [];
  const candidates = [];
  const add = (url) => {
    if (url && !candidates.includes(url)) candidates.push(url);
  };
  const target = mon || null;
  const dex = target?.id ?? entry?.id ?? null;
  if (dex != null) {
    add(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`);
    add(`${SPRITES_BASE}${dex}${SPRITES_EXT}`);
  }
  if (target) {
    add(target.sprite);
    add(target.sprites?.front_default);
    add(target.image);
    add(target.icon);
    if (target.slug) add(`${SPRITES_BASE}${target.slug}${SPRITES_EXT}`);
    add(`${SPRITES_BASE}${normalizeKey(target.name)}${SPRITES_EXT}`);
  } else if (entry?.name) {
    add(`${SPRITES_BASE}${normalizeKey(entry.name)}${SPRITES_EXT}`);
  }
  return candidates.filter(Boolean);
}

function PokemonSprite({ mon, entry, size = 72 }) {
  const candidates = React.useMemo(() => buildSpriteCandidates(mon, entry), [mon, entry]);
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    setIdx(0);
  }, [candidates]);

  if (!candidates.length) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'var(--surface)',
          border: '1px solid var(--divider)'
        }}
      />
    );
  }

  const handleError = () => {
    setIdx((prev) => {
      if (prev + 1 < candidates.length) return prev + 1;
      return prev;
    });
  };

  return (
    <img
      src={candidates[idx]}
      alt={mon?.name || entry?.name || ''}
      style={{ width: size, height: size, objectFit: 'contain', imageRendering: 'pixelated', display: 'block' }}
      onError={handleError}
    />
  );
}

function TypeChip({ type }) {
  if (!type) return null;
  const key = String(type).toLowerCase();
  const name = key.charAt(0).toUpperCase() + key.slice(1);
  const background = TYPE_COLORS[key] || '#6B7280';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 12,
        lineHeight: 1,
        color: '#fff',
        background
      }}
    >
      {name}
    </span>
  );
}

function InfoSection({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      <div className="label-muted" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

export default function DaycareManager() {
  const [active, setActive] = React.useState(DAYCARE_LOCATIONS[0].key);
  const [assignments, setAssignments] = React.useState(() => loadAssignments());
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchSlot, setSearchSlot] = React.useState(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const searchInputRef = React.useRef(null);

  React.useEffect(() => {
    if (!searchOpen) {
      setSearchSlot(null);
      setSearchQuery('');
    }
  }, [searchOpen]);

  React.useEffect(() => {
    if (!searchOpen) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen]);

  React.useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [searchOpen]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const save = () => {
      const payload = {};
      for (const loc of DAYCARE_LOCATIONS) {
        const arr = Array.isArray(assignments?.[loc.key]) ? assignments[loc.key] : [];
        const trimmed = [];
        for (let i = 0; i < loc.slots; i += 1) {
          const entry = arr[i];
          if (entry && entry.name) {
            trimmed.push({
              name: entry.name,
              id: entry.id ?? null,
              slug: entry.slug ?? normalizeKey(entry.name)
            });
          } else {
            trimmed.push(null);
          }
        }
        payload[loc.key] = trimmed;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (err) {
        console.warn('[DaycareManager] Failed to persist daycare assignments', err);
      }
    };
    save();
    return undefined;
  }, [assignments]);

  const activeLocation = DAYCARE_MAP[active] || DAYCARE_LOCATIONS[0];
  const activeSlots = React.useMemo(() => {
    const arr = Array.isArray(assignments?.[activeLocation.key]) ? assignments[activeLocation.key] : [];
    const normalized = [];
    for (let i = 0; i < activeLocation.slots; i += 1) {
      normalized.push(arr[i] || null);
    }
    return normalized;
  }, [activeLocation, assignments]);

  const openSearch = (locationKey, slotIndex) => {
    const location = DAYCARE_MAP[locationKey];
    if (!location) return;
    if (slotIndex >= location.slots) return;
    setSearchSlot({ locationKey, slotIndex });
    setSearchOpen(true);
  };

  const setMonForSlot = (locationKey, slotIndex, mon) => {
    const location = DAYCARE_MAP[locationKey];
    if (!location) return;
    if (slotIndex >= location.slots) return;
    setAssignments((prev) => {
      const next = { ...prev };
      const arr = Array.isArray(prev?.[locationKey]) ? [...prev[locationKey]] : [];
      while (arr.length < location.slots) arr.push(null);
      arr[slotIndex] = mon
        ? {
            name: mon.name,
            id: mon.id ?? null,
            slug: mon.slug ?? normalizeKey(mon.name)
          }
        : null;
      next[locationKey] = arr;
      return next;
    });
  };

  const clearSlot = (locationKey, slotIndex) => {
    setMonForSlot(locationKey, slotIndex, null);
  };

  const filteredMons = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ALL_MONS;
    const num = Number(q);
    return ALL_MONS.filter((mon) => {
      if (mon.name.toLowerCase().includes(q)) return true;
      if (!Number.isNaN(num) && mon.id != null && Number(mon.id) === num) return true;
      return false;
    });
  }, [searchQuery]);

  const renderSlotCard = (slotIndex) => {
    const isRealSlot = slotIndex < activeLocation.slots;
    const entry = isRealSlot ? activeSlots[slotIndex] : null;
    const mon = resolveMon(entry);
    const types = mon?.types ? Array.from(new Set(mon.types)).map((t) => t.toLowerCase()) : [];

    return (
      <div
        key={`${activeLocation.key}-slot-${slotIndex}`}
        style={{
          padding: 16,
          borderRadius: 12,
          border: '1px solid var(--divider)',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700 }}>Slot {slotIndex + 1}</div>
        </div>
        {!isRealSlot && (
          <div className="label-muted">This daycare only supports a single Pokémon slot.</div>
        )}
        {isRealSlot && !entry && (
          <button
            type="button"
            onClick={() => openSearch(activeLocation.key, slotIndex)}
            style={{
              padding: '12px 16px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(59,130,246,0.35), rgba(59,130,246,0.15))',
              border: '1px solid rgba(59,130,246,0.45)',
              color: '#e0ecff',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              textAlign: 'center'
            }}
          >
            Select Pokémon
          </button>
        )}
        {isRealSlot && entry && (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 14,
                  background: 'var(--card)',
                  border: '1px solid var(--divider)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <PokemonSprite mon={mon} entry={entry} size={72} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{entry.name}</div>
                {mon?.id != null && (
                  <div className="label-muted" style={{ fontSize: 13 }}>Dex #{mon.id}</div>
                )}
                {types.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {types.map((t) => (
                      <TypeChip key={t} type={t} />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => openSearch(activeLocation.key, slotIndex)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Change Pokémon
              </button>
              <button
                type="button"
                onClick={() => clearSlot(activeLocation.key, slotIndex)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(248,113,113,0.6)',
                  background: 'rgba(248,113,113,0.08)',
                  color: '#fca5a5',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Remove
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Daycare Manager</div>
        <div className="label-muted">Track which Pokemon are in each regional daycare.</div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {DAYCARE_LOCATIONS.map((loc) => {
          const isActive = loc.key === activeLocation.key;
          return (
            <button
              type="button"
              key={loc.key}
              onClick={() => setActive(loc.key)}
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                border: isActive ? '1px solid rgba(59,130,246,0.6)' : '1px solid var(--divider)',
                background: isActive ? 'rgba(59,130,246,0.15)' : 'var(--surface)',
                color: 'var(--text)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              {loc.short}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}>
        <div style={{ ...getCardStyle(), display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{activeLocation.title}</div>
            <div className="label-muted" style={{ marginTop: 4 }}>{activeLocation.summary}</div>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {Array.from({ length: DISPLAY_SLOTS }).map((_, idx) => renderSlotCard(idx))}
          </div>
        </div>

        <div style={{ ...getCardStyle(), display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Daycare Information</div>
          <InfoSection title="EXP Mechanics">
            <span>• Each Pokemon receives 60% of the EXP obtained in the region.</span>
            <span>• Whether 1 or 2 Pokemon are placed, each receives 60% of the total EXP (no split).</span>
            <span>• EXP is only given for EXP obtained while in the same region the Pokemon was placed.</span>
          </InfoSection>
          <InfoSection title="Cost">
            <span>• Daycare cost - 1,000 per level up.</span>
          </InfoSection>
          <InfoSection title="EV & Evolution">
            <span>• Pokemon do not gain EVs while in the Daycare.</span>
            <span>• Pokemon cannot evolve while in the Daycare</span>
          </InfoSection>
          <InfoSection title="Moves">
            <span>The Top-Most move will be replaced everytime the Pokemon is ready to learn a new move.</span>
          </InfoSection>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {DAYCARE_LOCATIONS.map((loc) => {
          const isActive = loc.key === activeLocation.key;
          const entries = Array.isArray(assignments?.[loc.key]) ? assignments[loc.key] : [];
          const slotMons = entries.map((entry) => resolveMon(entry));
          const assignedSlots = entries
            .map((entry, idx) => ({ entry, mon: slotMons[idx], idx }))
            .filter(({ entry, mon }) => entry || mon);
          const hasMon = assignedSlots.length > 0;
          return (
            <button
              type="button"
              key={`summary-${loc.key}`}
              onClick={() => setActive(loc.key)}
              style={{
                padding: 10,
                borderRadius: 12,
                border: isActive ? '1px solid rgba(59,130,246,0.65)' : '1px solid var(--divider)',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(59,130,246,0.35), rgba(59,130,246,0.12))'
                  : 'var(--surface)',
                color: 'var(--text)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 8,
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontWeight: 700 }}>{loc.short}</div>
              <div
                style={{
                  minHeight: 48,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: hasMon ? 'flex-start' : 'center',
                  gap: hasMon ? 6 : 0,
                  padding: hasMon ? '2px 0' : '4px 0'
                }}
              >
                {hasMon ? (
                  assignedSlots.map(({ entry, mon, idx }) => (
                    <div
                      key={`${loc.key}-mon-${idx}`}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'var(--card)',
                        border: '1px solid var(--divider)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <PokemonSprite mon={mon} entry={entry} size={34} />
                    </div>
                  ))
                ) : (
                  <span className="label-muted">No Pokémon</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {searchOpen && (
        <div
          onClick={() => setSearchOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15,23,42,0.85)',
            backdropFilter: 'blur(4px)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(640px, 90vw)',
              maxHeight: '80vh',
              background: 'var(--surface)',
              borderRadius: 16,
              border: '1px solid var(--divider)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Select Pokémon</div>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontSize: 24,
                  lineHeight: 1,
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--divider)' }}>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search Pokémon"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--divider)',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontSize: 15
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredMons.length === 0 && (
                <div className="label-muted" style={{ textAlign: 'center', padding: '24px 0' }}>
                  No Pokémon found. Try a different search term.
                </div>
              )}
              {filteredMons.map((mon) => {
                const types = mon?.types ? Array.from(new Set(mon.types)).map((t) => t.toLowerCase()) : [];
                return (
                  <button
                    key={mon.name}
                    type="button"
                    onClick={() => {
                      if (searchSlot) {
                        setMonForSlot(searchSlot.locationKey, searchSlot.slotIndex, mon);
                      }
                      setSearchOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid transparent',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(96,165,250,0.45)';
                      e.currentTarget.style.background = 'rgba(96,165,250,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.background = 'var(--surface)';
                    }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        background: 'var(--card)',
                        border: '1px solid var(--divider)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <PokemonSprite mon={mon} entry={{ name: mon.name, id: mon.id ?? null, slug: mon.slug ?? normalizeKey(mon.name) }} size={56} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontWeight: 700 }}>{mon.name}</div>
                      {mon?.id != null && (
                        <div className="label-muted" style={{ fontSize: 12 }}>Dex #{mon.id}</div>
                      )}
                      {types.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {types.map((t) => (
                            <TypeChip key={`${mon.name}-${t}`} type={t} />
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getCardStyle() {
  return {
    padding: 20,
    borderRadius: 16,
    border: '1px solid var(--divider)',
    background: 'var(--surface)'
  };
}
