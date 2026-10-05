'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Icon, Sheet, cx } from '@/design-system';
import { partyCount, useTask } from '../data/task';

/* "+ Add doctor" — the seat's own doctors that are not on its list this
 * month (the entry script's `addable`), in a Sheet over the list.
 *
 * CHOOSE, THEN CREATE. Each row is a toggle; nothing reaches ERP until
 * "Create N", which puts every product of the seat on each chosen doctor at
 * 0 (task.addMethod). At most `limit` per go: once that many are chosen, the
 * rest are disabled and the subtitle says why. Discard, the ×, Escape or the
 * scrim drop the choice — but not while a create is running.
 *
 * Search lives in the Sheet's `toolbar`, as in ProductPickerSheet. */

export function AddPartySheet({ open, onClose, parties, limit, busy = false, error = null, onCreate }) {
  const task = useTask();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(() => new Set());

  useEffect(() => {
    if (open) {
      setChosen(new Set());
      setQuery('');
    }
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter((p) => [p.name, p.customer_name, p.note].some((s) => String(s ?? '').toLowerCase().includes(q)));
  }, [parties, query]);

  const count = chosen.size;
  const full = Boolean(limit) && count >= limit;
  const toggle = (name) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else if (!limit || next.size < limit) next.add(name);
      return next;
    });

  const discard = () => {
    if (busy) return;
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={discard}
      surface="app"
      title={`Add ${task.party}`}
      subtitle={
        full
          ? `${limit} chosen — the most per go. Create these, then add more.`
          : `${partyCount(task, parties.length)} of yours not on your list${limit ? ` · up to ${limit} at a time` : ''}`
      }
      toolbar={
        <Field
          size="lg"
          type="search"
          placeholder={`Search ${task.party} name or code…`}
          value={query}
          onChange={setQuery}
          aria-label={`Search ${task.parties}`}
          prefix={<Icon name="search" size="sm" />}
        />
      }
    >
      {shown.length ? (
        <ul className="flex flex-col pt-1">
          {shown.map((p) => {
            const on = chosen.has(p.name);
            const blocked = !on && full;
            return (
              <li key={p.name}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={blocked || busy}
                  onClick={() => toggle(p.name)}
                  className="flex w-full items-center gap-3 border-b border-line-subtle py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                      on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface text-transparent',
                    )}
                  >
                    <Icon name="check" size="var(--fs-10)" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-13 font-semibold text-heading">{p.customer_name || p.name}</span>
                    <span className="truncate text-11 text-ds-muted">{[p.name, p.note].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-10 text-center text-12 text-ds-muted">
          {query
            ? `No ${task.party} matches "${query}".`
            : `Every one of your ${task.parties} is already on your list.`}
        </p>
      )}

      <div className="sticky -bottom-4 z-1 -mx-4 -mb-4 mt-3 flex flex-col gap-2 border-t border-line-subtle bg-surface px-4 pb-4 pt-3">
        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-wash px-3 py-2 text-11 text-danger-text">
            <Icon name="exclamation-circle" size="sm" className="mt-px shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button type="default" size="lg" block disabled={busy} onClick={discard}>
            Discard
          </Button>
          <Button type="primary" size="lg" block loading={busy} disabled={!count || busy} onClick={() => onCreate([...chosen])}>
            {busy ? 'Creating…' : count ? `Create ${count}` : 'Create'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
