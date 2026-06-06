'use client';

import { useRef, useState, useEffect } from 'react';

export function DrawerTabBar({ tabs, activeId, onSelect }) {
  const scrollRef = useRef(null);
  const [canLeft, setCanLeft]   = useState(false);
  const [canRight, setCanRight] = useState(false);

  const sync = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    sync();
    // Re-check after paint in case layout hasn't settled yet
    const id = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(id);
  }, [tabs]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: 2 }}>
      {canLeft && (
        <button
          type="button"
          onClick={() => scrollRef.current.scrollBy({ left: -150, behavior: 'smooth' })}
          style={arrowStyle}
        >
          ‹
        </button>
      )}

      <div
        ref={scrollRef}
        onScroll={sync}
        style={{ display: 'flex', overflowX: 'hidden', flex: 1, minWidth: 0 }}
      >
        {tabs.map(({ id, config }) => {
          const isActive = id === activeId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              style={isActive ? activeTabStyle : tabStyle}
            >
              {config.name ?? id}
            </button>
          );
        })}
      </div>

      {canRight && (
        <button
          type="button"
          onClick={() => scrollRef.current.scrollBy({ left: 150, behavior: 'smooth' })}
          style={arrowStyle}
        >
          ›
        </button>
      )}
    </div>
  );
}

const tabStyle = {
  padding: '6px 16px',
  border: 'none',
  borderBottom: '2px solid transparent',
  background: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontSize: 14,
  color: '#6b7280',
  transition: 'color 0.15s',
  flexShrink: 0,
};

const activeTabStyle = {
  ...tabStyle,
  fontWeight: 600,
  color: '#111827',
  borderBottom: '2px solid #111827',
};

const arrowStyle = {
  padding: '0 10px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 20,
  lineHeight: 1,
  color: '#6b7280',
  flexShrink: 0,
};
