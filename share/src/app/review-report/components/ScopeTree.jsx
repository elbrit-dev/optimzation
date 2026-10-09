'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon, cx } from '@/design-system';
import { chainOf, deptShort, scopeOf, scopeRow } from '../data/selectors';
import { pct, rupees } from '../data/format';

/* The scope picker AND the team at a glance: the seat tree as folders, each
 * row carrying the open tab's headline (achievement, doctor ₹ change,
 * overstocked stockists), siblings worst first. Picking a row changes every
 * number on the page, which is why it sits before the page — left on a wide
 * screen, on top on a phone.
 *
 * The selected seat's chain is always open, so a drill from the attention
 * list or a breadcrumb lands somewhere visible. Headlines are worked out
 * only for the rows on screen. In the department lens it lists departments. */

const hqName = (h) => String(h ?? '').replace(/^HQ-/, '');

export function headline(r, tab) {
  const sc = r.scorecard;
  if (tab === 'doctors') {
    if (!r.doctors) return { value: '—', sub: 'no support', rank: 0 };
    const d = r.doctors.down.delta + r.doctors.dropped.delta + r.doctors.up.delta + r.doctors.new.delta;
    return { value: rupees(d, { sign: true }), sub: `${r.doctors.down.count + r.doctors.dropped.count} down`, rank: d, tone: d < 0 ? 'danger' : 'ok' };
  }
  if (tab === 'stockists') {
    if (!r.stock) return { value: '—', sub: 'no secondary', rank: 0 };
    return { value: `${r.stock.over}/${r.stock.stockists}`, sub: `${rupees(r.stock.excess)} > 2×`, rank: -r.stock.excess, tone: r.stock.chronic ? 'danger' : 'ok' };
  }
  if (!sc.hasSales) {
    return { value: rupees(sc.secondary), sub: r.shared ? 'shared HQ' : 'secondary', rank: 9 };
  }
  return {
    value: pct(sc.ach),
    sub: sc.allocated ? `${rupees(sc.primary)} · alloc.` : rupees(sc.primary),
    rank: sc.ach ?? 9,
    tone: sc.ach == null ? 'ok' : sc.ach < 0.9 ? 'danger' : sc.ach < 1 ? 'warn' : 'good',
  };
}

const TONE = {
  danger: 'text-danger-text',
  warn: 'text-[var(--status-pending-text)]',
  good: 'text-[var(--status-approved-text)]',
  ok: 'text-heading',
};

function Row({ depth, name, sub, h, selected, hasKids, expanded, onToggle, onPick, muted }) {
  return (
    <div
      className={cx(
        'flex items-center gap-1 pr-3',
        selected ? 'bg-brand-tint-weak' : '[@media(hover:hover)]:hover:bg-sunken',
      )}
      style={{ paddingLeft: `calc(${depth} * 0.875rem + 0.25rem)` }}
    >
      {hasKids ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
          aria-expanded={expanded}
          className="flex h-9 w-7 shrink-0 items-center justify-center rounded text-ds-muted [@media(hover:hover)]:hover:text-heading"
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size="sm" />
        </button>
      ) : (
        <span className="w-7 shrink-0" />
      )}
      <button
        type="button"
        onClick={onPick}
        aria-current={selected ? 'true' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate text-13', selected ? 'font-semibold text-brand-text' : muted ? 'text-ds-muted' : 'font-medium text-heading')}>
            {name}
          </span>
          <span className="block truncate text-11 text-ds-muted">{sub}</span>
        </span>
        {h ? (
          <span className="shrink-0 text-right tabular-nums">
            <span className={cx('block text-12 font-semibold', TONE[h.tone ?? 'ok'])}>{h.value}</span>
            <span className="block text-10 text-ds-muted">{h.sub}</span>
          </span>
        ) : null}
      </button>
    </div>
  );
}

export function ScopeTree({ ix, mi, tab, lens, seat, dept, onSeat, onDept }) {
  const [expanded, setExpanded] = useState(() => new Set());

  /* Keep the selected seat's chain open. */
  useEffect(() => {
    if (!seat) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const c of chainOf(ix, seat)) next.add(c.id);
      return next;
    });
  }, [ix, seat]);

  /* The rows on screen, depth-first, siblings worst first for this tab. */
  const visible = useMemo(() => {
    if (lens === 'dept') {
      return ix.depts.map((d) => {
        const r = scopeRow(ix, scopeOf(ix, { kind: 'dept', id: d }), mi);
        return { key: d, depth: 0, kind: 'dept', name: deptShort(d), sub: `${r.scorecard.be} BEs`, h: headline(r, tab) };
      });
    }
    const out = [];
    const rows = new Map();
    const rowOf = (i) => {
      if (!rows.has(i)) rows.set(i, scopeRow(ix, scopeOf(ix, { kind: 'seat', id: ix.tree[i].id }), mi));
      return rows.get(i);
    };
    const walk = (i, depth) => {
      const t = ix.tree[i];
      const r = rowOf(i);
      const kids = ix.kids.get(i) ?? [];
      out.push({
        key: t.id,
        depth,
        kind: 'seat',
        name: t.vacant ? `Vacant · ${t.id}` : t.name,
        sub: [t.tier, hqName(t.hq), r.gap ? 'entry gap' : null, kids.length ? `${kids.length} under` : null].filter(Boolean).join(' · '),
        h: headline(r, tab),
        hasKids: kids.length > 0,
        muted: Boolean(t.vacant),
      });
      if (!expanded.has(t.id)) return;
      const ranked = kids
        .map((k) => ({ k, rank: headline(rowOf(k), tab).rank }))
        .sort((a, b) => a.rank - b.rank);
      for (const { k } of ranked) walk(k, depth + 1);
    };
    if (ix.tree.length) walk(0, 0);
    return out;
  }, [ix, mi, tab, lens, expanded]);

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div role="tree" aria-label={lens === 'dept' ? 'Departments' : 'Team'} className="py-1">
      {visible.map((v) => (
        <Row
          key={v.key}
          depth={v.depth}
          name={v.name}
          sub={v.sub}
          h={v.h}
          muted={v.muted}
          hasKids={v.hasKids}
          expanded={expanded.has(v.key)}
          selected={v.kind === 'dept' ? dept === v.key : seat === v.key}
          onToggle={() => toggle(v.key)}
          onPick={() => (v.kind === 'dept' ? onDept(v.key) : onSeat(v.key))}
        />
      ))}
    </div>
  );
}
