import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getRecommendedMovesets } from '../services/smogonService.js';

const TYPE_COLORS = {
  normal: '#A8A77A',
  fire: '#EE8130',
  water: '#6390F0',
  electric: '#F7D02C',
  grass: '#7AC74C',
  ice: '#96D9D6',
  fighting: '#C22E28',
  poison: '#A33EA1',
  ground: '#E2BF65',
  flying: '#A98FF3',
  psychic: '#F95587',
  bug: '#A6B91A',
  rock: '#B6A136',
  ghost: '#735797',
  dragon: '#6F35FC',
  dark: '#705746',
  steel: '#B7B7CE',
  fairy: '#D685AD'
};

const ITEM_ICON_BASE = 'https://raw.githubusercontent.com/PokeMMO-Tools/pokemmo-data/main/assets/itemicons/';
const ITEM_PLACEHOLDER = `${import.meta.env.BASE_URL}no-item.svg`;

function LabelText({ children }) {
  return (
    <span className="label-muted" style={{ fontSize:12, fontWeight:600, textTransform:'uppercase' }}>
      {children}
    </span>
  );
}

function TypeBadge({ type }) {
  if (!type) {
    return <span className="label-muted">Unknown</span>;
  }
  const key = String(type).toLowerCase();
  const background = TYPE_COLORS[key] || '#555';
  return (
    <span
      style={{
        display:'inline-flex',
        alignItems:'center',
        justifyContent:'center',
        padding:'2px 8px',
        borderRadius:999,
        fontSize:11,
        fontWeight:700,
        letterSpacing:0.4,
        color:'#fff',
        background
      }}
    >
      {type}
    </span>
  );
}

function formatMoveCategory(category) {
  if (!category) return '\u2014';
  return category;
}

function formatMovePower(power) {
  if (power == null || power === 0) return '\u2014';
  return String(power);
}

function formatMoveAccuracy(accuracy) {
  if (accuracy === true) return 'Always hits';
  if (accuracy == null) return '\u2014';
  if (typeof accuracy === 'number') return `${accuracy}%`;
  return String(accuracy);
}

function TooltipContent({ tooltip }) {
  if (!tooltip) return null;
  if (tooltip.kind === 'move') {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <div style={{ fontWeight:700 }}>{tooltip.name}</div>
        <div style={{ lineHeight:1.4 }}>{tooltip.description || 'No additional information.'}</div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span className="label-muted" style={{ fontSize:11, fontWeight:600 }}>Type</span>
          <TypeBadge type={tooltip.type} />
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
            <span className="label-muted" style={{ fontSize:11, fontWeight:600 }}>Category</span>
            <span style={{ fontWeight:600 }}>{formatMoveCategory(tooltip.category)}</span>
          </div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
            <span className="label-muted" style={{ fontSize:11, fontWeight:600 }}>Power</span>
            <span style={{ fontWeight:600 }}>{formatMovePower(tooltip.power)}</span>
          </div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
            <span className="label-muted" style={{ fontSize:11, fontWeight:600 }}>Accuracy</span>
            <span style={{ fontWeight:600 }}>{formatMoveAccuracy(tooltip.accuracy)}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ fontWeight:700 }}>{tooltip.name}</div>
      <div style={{ lineHeight:1.4 }}>{tooltip.description || 'No additional information.'}</div>
    </div>
  );
}

function HoverTooltip({ content, delay = 500, children }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  };

  const schedule = () => {
    cancel();
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  };

  return (
    <span
      style={{ position:'relative', display:'inline-flex', alignItems:'center' }}
      onMouseEnter={schedule}
      onMouseLeave={cancel}
      onFocus={schedule}
      onBlur={cancel}
    >
      {children}
      {visible && content && (
        <div
          style={{
            position:'absolute',
            top:'calc(100% + 6px)',
            left:'50%',
            transform:'translateX(-50%)',
            background:'var(--card)',
            color:'var(--text)',
            border:'1px solid var(--divider)',
            borderRadius:10,
            padding:'10px 12px',
            minWidth:220,
            maxWidth:320,
            zIndex:20,
            boxShadow:'0 12px 28px rgba(0,0,0,0.35)'
          }}
        >
          {content}
        </div>
      )}
    </span>
  );
}

function HoverableText({ option }) {
  if (!option) return null;
  const interactive = Boolean(option.tooltip);
  const hasItemIcon = option.itemId != null;
  const labelContent = (
    <span
      style={{
        display:'inline-flex',
        alignItems:'center',
        gap:6,
        color: interactive ? 'var(--accent)' : 'inherit',
        cursor: interactive ? 'help' : 'default',
        fontWeight: interactive ? 600 : 400
      }}
    >
      {hasItemIcon && (
        <img
          src={`${ITEM_ICON_BASE}${option.itemId}.png`}
          alt={option.label}
          width={20}
          height={20}
          loading='lazy'
          style={{ objectFit:'contain' }}
          onError={event => {
            const img = event?.currentTarget;
            if (!img || img.dataset.fallbackApplied) return;
            img.dataset.fallbackApplied = '1';
            img.src = ITEM_PLACEHOLDER;
          }}
        />
      )}
      <span>{option.label}</span>
    </span>
  );

  if (!interactive) {
    return labelContent;
  }

  return (
    <HoverTooltip content={<TooltipContent tooltip={option.tooltip} />}>
      {labelContent}
    </HoverTooltip>
  );
}

function MovesList({ moves }) {
  if (!moves?.length) return null;
  return (
    <ul style={{ margin:0, padding:'0 0 0 18px', display:'flex', flexDirection:'column', gap:4 }}>
      {moves.map((slot, idx) => (
        <li key={`move-slot-${idx}`} style={{ lineHeight:1.5 }}>
          <span className="label-muted" style={{ fontWeight:600, marginRight:6 }}>Move {idx + 1}:</span>
          {slot.map((option, optionIdx) => (
            <React.Fragment key={`move-${idx}-${optionIdx}-${option.label}`}>
              {optionIdx > 0 && <span style={{ color:'var(--muted)', margin:'0 4px' }}>/</span>}
              <HoverableText option={option} />
            </React.Fragment>
          ))}
        </li>
      ))}
    </ul>
  );
}

function ChoiceRow({ label, choices }) {
  if (!choices || choices.length === 0) return null;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <LabelText>{label}</LabelText>
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
        {choices.map((choice, idx) => (
          <React.Fragment key={`${label}-${choice.label}-${idx}`}>
            {idx > 0 && <span style={{ color:'var(--muted)' }}>/</span>}
            <HoverableText option={choice} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function SimpleRow({ label, text }) {
  if (!text) return null;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <LabelText>{label}</LabelText>
      <span>{text}</span>
    </div>
  );
}

function HtmlDropdown({ label, expanded, onToggle, html }) {
  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          display:'flex',
          alignItems:'center',
          gap:6,
          cursor:'pointer',
          fontWeight:600,
          color:'var(--text)'
        }}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span>{label}</span>
      </div>
      {expanded && (
        <div
          style={{
            marginTop:8,
            border:'1px solid var(--divider)',
            borderRadius:12,
            padding:16,
            background:'var(--surface)',
            lineHeight:1.5
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function TierSetCard({ set }) {
  return (
    <div
      style={{
        border:'1px solid var(--divider)',
        borderRadius:12,
        padding:16,
        background:'var(--surface)',
        display:'flex',
        flexDirection:'column',
        gap:16
      }}
    >
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <div style={{ fontWeight:700, fontSize:16, display:'flex', alignItems:'center', gap:8 }}>
          <span>{set.name}</span>
          {set.outdated && (
            <span style={{ fontSize:11, fontWeight:600, color:'var(--muted)', border:'1px solid var(--divider)', borderRadius:999, padding:'2px 8px' }}>
              Outdated
            </span>
          )}
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div>
          <LabelText>Moves</LabelText>
          <MovesList moves={set.moves} />
        </div>
        <ChoiceRow label="Items" choices={set.items} />
        <ChoiceRow label="Nature" choices={set.nature} />
        <ChoiceRow label="Ability" choices={set.ability} />
        <SimpleRow label="EVs" text={set.evsText} />
        <SimpleRow label="IVs" text={set.ivsText} />
        {set.level != null && <SimpleRow label="Level" text={String(set.level)} />}
      </div>

      {set.descriptionHtml && (
        <div
          style={{
            border:'1px solid var(--divider)',
            borderRadius:12,
            padding:14,
            lineHeight:1.5,
            background:'var(--card)'
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: set.descriptionHtml }} />
        </div>
      )}
    </div>
  );
}

const STATUS = {
  idle: 'idle',
  loading: 'loading',
  ready: 'ready',
  error: 'error'
};

function RecommendedMovesets({ speciesName, expanded, onToggle }) {
  const [status, setStatus] = useState(STATUS.idle);
  const [errorMsg, setErrorMsg] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedTierId, setSelectedTierId] = useState(null);
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  const [showChecks, setShowChecks] = useState(false);

  const tiers = result?.tiers || [];
  const activeTier = useMemo(
    () => tiers.find(tier => tier.id === selectedTierId) || null,
    [tiers, selectedTierId]
  );

  useEffect(() => {
    if (!expanded) return;
    if (!speciesName) return;
    if (result?.species === speciesName) return;

    let cancelled = false;
    setStatus(STATUS.loading);
    setErrorMsg(null);

    getRecommendedMovesets(speciesName)
      .then(payload => {
        if (cancelled) return;
        setResult({ ...payload, species: speciesName });
        setSelectedTierId(payload.defaultTierId || null);
        setShowOtherOptions(false);
        setShowChecks(false);
        setStatus(STATUS.ready);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('[RecommendedMovesets] failed to load data', err);
        setErrorMsg('Failed to load Smogon data. Please try again later.');
        setStatus(STATUS.error);
      });

    return () => {
      cancelled = true;
    };
  }, [expanded, speciesName, result?.species]);

  useEffect(() => {
    if (!expanded) return;
    if (!activeTier) return;
    setShowOtherOptions(false);
    setShowChecks(false);
  }, [expanded, activeTier?.id]);

  useEffect(() => {
    if (!expanded) return;
    if (!tiers.length) {
      setSelectedTierId(null);
    } else if (!selectedTierId) {
      setSelectedTierId(result?.defaultTierId || tiers[0].id);
    }
  }, [expanded, tiers, selectedTierId, result?.defaultTierId]);

  let body = null;

  if (!expanded) {
    body = null;
  } else if (status === STATUS.loading || status === STATUS.idle) {
    body = (
      <div style={{ padding:12, color:'var(--muted)' }}>Loading recommended sets...</div>
    );
  } else if (status === STATUS.error) {
    body = (
      <div style={{ padding:12, color:'var(--danger)', whiteSpace:'pre-wrap' }}>{errorMsg}</div>
    );
  } else if (!tiers.length) {
    body = (
      <div style={{ padding:12, color:'var(--muted)' }}>No Smogon movesets available for this Pokemon.</div>
    );
  } else if (!activeTier) {
    body = (
      <div style={{ padding:12, color:'var(--muted)' }}>Select a tier to view recommended sets.</div>
    );
  } else {
    body = (
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {tiers.map(tier => {
            const isActive = tier.id === activeTier.id;
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => setSelectedTierId(tier.id)}
                style={{
                  border:'1px solid var(--divider)',
                  borderRadius:999,
                  padding:'6px 14px',
                  background: isActive ? 'var(--card)' : 'transparent',
                  color: isActive ? 'var(--text)' : 'var(--muted)',
                  cursor:'pointer',
                  fontWeight:600
                }}
              >
                {tier.label}
                {tier.outdated ? ' *' : ''}
              </button>
            );
          })}
        </div>

        {activeTier.outdated && (
          <div style={{ color:'var(--muted)', fontSize:12 }}>
            This analysis is marked as outdated on Smogon.
          </div>
        )}

        {activeTier.overviewHtml && (
          <div
            style={{
              border:'1px solid var(--divider)',
              borderRadius:12,
              padding:16,
              background:'var(--surface)',
              lineHeight:1.5,
              display:'flex',
              flexDirection:'column',
              gap:8
            }}
          >
            <LabelText>Overview</LabelText>
            <div dangerouslySetInnerHTML={{ __html: activeTier.overviewHtml }} />
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {activeTier.sets.map(set => (
            <TierSetCard key={set.name} set={set} />
          ))}
        </div>

        {activeTier.otherOptionsHtml && (
          <HtmlDropdown
            label="Other Options"
            expanded={showOtherOptions}
            onToggle={() => setShowOtherOptions(v => !v)}
            html={activeTier.otherOptionsHtml}
          />
        )}

        {activeTier.checksHtml && (
          <HtmlDropdown
            label="Checks and Counters"
            expanded={showChecks}
            onToggle={() => setShowChecks(v => !v)}
            html={activeTier.checksHtml}
          />
        )}
      </div>
    );
  }

  const toggleIcon = expanded ? '▾' : '▸';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <div
        className="label-muted"
        style={{ fontWeight:700, cursor:'pointer', marginBottom: expanded ? 6 : 0 }}
        onClick={onToggle}
      >
        {toggleIcon} Recommended Movesets (Smogon)
      </div>
      {expanded && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {body}
        </div>
      )}
    </div>
  );
}

export default RecommendedMovesets;


