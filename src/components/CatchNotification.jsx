import React, { useEffect, useState } from 'react';

export default function CatchNotification({ pokemonName, isAlpha, spriteUrl, onComplete }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onComplete) {
        setTimeout(onComplete, 300); // Wait for fade out animation
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  const containerStyle = {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 40000,
    background: 'linear-gradient(135deg, var(--surface) 0%, var(--card) 100%)',
    border: '2px solid var(--accent)',
    borderRadius: '16px',
    padding: '16px 20px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(var(--accent-rgb, 120, 120, 255), 0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    minWidth: '280px',
    animation: visible ? 'slideInRight 0.3s ease-out' : 'slideOutRight 0.3s ease-out',
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateX(0)' : 'translateX(100%)',
    transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
  };

  const spriteContainerStyle = {
    position: 'relative',
    width: '64px',
    height: '64px',
    flexShrink: 0,
  };

  const spriteStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    imageRendering: 'pixelated',
  };

  const ballIndicatorStyle = {
    position: 'absolute',
    bottom: '-4px',
    right: '-4px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)',
    border: '2px solid var(--surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 800,
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  };

  const textContainerStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  };

  const titleStyle = {
    fontSize: '16px',
    fontWeight: 800,
    color: 'var(--text)',
    lineHeight: 1.2,
  };

  const subtitleStyle = {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--muted)',
  };

  const alphaLabelStyle = {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'linear-gradient(135deg, #8b00ff 0%, #6600cc 100%)',
    color: 'white',
    fontSize: '10px',
    fontWeight: 800,
    textTransform: 'uppercase',
    marginLeft: '6px',
    boxShadow: '0 2px 4px rgba(139,0,255,0.3)',
  };

  return (
    <>
      <style>
        {`
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          @keyframes slideOutRight {
            from {
              transform: translateX(0);
              opacity: 1;
            }
            to {
              transform: translateX(100%);
              opacity: 0;
            }
          }
        `}
      </style>
      <div style={containerStyle}>
        <div style={spriteContainerStyle}>
          <img
            src={spriteUrl}
            alt={pokemonName}
            style={spriteStyle}
            onError={(e) => {
              e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="55" font-size="40" text-anchor="middle" fill="%23888">?</text></svg>';
            }}
          />
          <div style={ballIndicatorStyle}>
            ✓
          </div>
        </div>
        <div style={textContainerStyle}>
          <div style={titleStyle}>
            {pokemonName}
            {isAlpha && <span style={alphaLabelStyle}>Alpha</span>}
          </div>
          <div style={subtitleStyle}>
            has been caught!
          </div>
        </div>
      </div>
    </>
  );
}
