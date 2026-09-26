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
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: 'var(--space-2)' }}>
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
  padding: 'var(--space-6) var(--space-16)',
  border: 'none',
  borderBottom: '2px solid transparent',
  background: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontSize: 'var(--fs-14)',
  color: 'var(--ds-text-secondary)',
  transition: 'color 0.15s',
  flexShrink: 0,
};

const activeTabStyle = {
  ...tabStyle,
  fontWeight: 600,
  color: 'var(--ds-text-body)',
  borderBottom: '2px solid var(--ds-text-body)',
};

const arrowStyle = {
  padding: '0 var(--space-10)',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 'var(--fs-20)',
  lineHeight: 1,
  color: 'var(--ds-text-secondary)',
  flexShrink: 0,
};
