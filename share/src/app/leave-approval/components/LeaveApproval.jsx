'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Field, Icon, SegmentedControl, Sheet, StatusPill, cx } from '@/design-system';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';
import { PinnedBar, PinnedBarSpacer } from '@/app/secondary-entry/components/PinnedBar';
import { daysOff, groupWaiting, rangeLabel, shapeLeaves } from '../data/shape';
import { createErpLeaveSource } from '../data/erp';
import { LeaveCard, WeekStrip } from './LeaveCard';

/* Leave approvals — every leave waiting on the signed-in approver, in one
 * place, decided like the other approvals: a card per request, Approve /
 * Reject on it, or tick several and decide them from the pinned bar.
 *
 * WHAT A CARD ANSWERS, so the approver need not open anything: who, which
 * leave and when, how soon it starts and how long it has waited, the reason
 * and any note attached. Most urgent first: started or starting
 * today, then the next few days, then later. A strip of the next seven days
 * shows how thin the team is on each.
 *
 * WHO DECIDES IS THE ERP'S: listed are Open leaves whose leave_approver — or
 * escalation approver, the level above — is the user. The decision goes
 * through the "Leave Approval" workflow as the user (data/erp.js).
 *
 * Data: `rows` (Leave Application rows, as the mock passes) or — the usual
 * case — read from the ERP with gqlToken. `writer` replaces how decisions
 * are sent (the harness's dry run, the mock). */

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const QUICK_REASONS = ['Team is short that day', 'Clashes with a review / meeting', 'Please apply as a different leave type', 'Apply earlier next time'];

function RejectSheet({ open, leaves, busy, error, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const ok = reason.trim().length > 0;
  const one = leaves.length === 1 ? leaves[0] : null;
  return (
    <Sheet.Root open={open} onOpenChange={(next) => !next && !busy && onClose()} desktop="dialog">
      <Sheet.Popup surface="app">
        <Sheet.Header>
          <Sheet.Title>{one ? `Reject ${one.employeeName}'s leave?` : `Reject ${leaves.length} leaves?`}</Sheet.Title>
          <Sheet.Description>
            {one ? `${one.leaveType} · ${rangeLabel(one.from, one.to)}. ` : ''}They see your reason with the decision.
          </Sheet.Description>
          <Sheet.Close disabled={busy} />
        </Sheet.Header>
        <Sheet.Body>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (ok && !busy) onConfirm(reason.trim());
            }}
          >
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cx(
                    'rounded-full border px-2.5 py-1 text-11 transition-colors',
                    reason === r ? 'border-brand bg-brand-tint-weak text-brand-text' : 'border-line text-ds-secondary',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Field size="app" label="Reason" placeholder="Why it cannot be approved…" value={reason} onChange={setReason} disabled={busy} />
            {error ? (
              <p role="alert" className="text-12 text-danger-text">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="default" size="app" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="primary" size="app" danger htmlType="submit" loading={busy} disabled={!ok}>
                Reject
              </Button>
            </div>
          </form>
        </Sheet.Body>
      </Sheet.Popup>
    </Sheet.Root>
  );
}

function SectionTitle({ children }) {
  return <h2 className="px-1 pt-1 text-13 font-semibold text-heading">{children}</h2>;
}

function GroupTitle({ group: g }) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <span className={cx('text-11 font-semibold uppercase tracking-wide', g.tone === 'danger' ? 'text-danger-text' : g.tone === 'warning' ? 'text-pending-text' : 'text-ds-muted')}>
        {g.title}
      </span>
      <span className="text-11 text-ds-muted">{g.items.length}</span>
    </div>
  );
}

export function LeaveApproval({
  rows: rowsProp,
  gqlEnvironment = 'ERP',
  gqlToken,
  today: todayProp,
  title = 'Leave approvals',
  bottomGap,
  writer: writerProp,
  onBack,
  onDecided,
  className,
}) {
  const today = todayProp ?? localToday();

  /* The ERP source, when reading live: who is asking, their leaves, decisions. */
  const [erp, setErp] = useState(null);
  useEffect(() => {
    if (rowsProp != null || !gqlToken?.trim()) return undefined;
    let stale = false;
    getEndpointConfigFromUrlKeyAsync(gqlEnvironment).then(({ endpointUrl }) => {
      if (!stale && endpointUrl) setErp(createErpLeaveSource({ endpointUrl, token: gqlToken }));
    });
    return () => {
      stale = true;
    };
  }, [rowsProp, gqlEnvironment, gqlToken]);
  const writer = writerProp ?? erp;

  const [loaded, setLoaded] = useState({ rows: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (rowsProp != null || !erp) return undefined;
    let stale = false;
    erp
      .load({ today })
      .then((rows) => !stale && setLoaded({ rows, error: null }))
      .catch((error) => !stale && setLoaded((p) => ({ rows: p.rows, error })));
    return () => {
      stale = true;
    };
  }, [rowsProp, erp, today, attempt]);
  const sourceRows = rowsProp ?? loaded.rows;

  const [viewer, setViewer] = useState(null);
  useEffect(() => {
    if (!writer?.whoAmI) return undefined;
    let stale = false;
    writer.whoAmI().then((u) => !stale && setViewer(String(u ?? '').toLowerCase() || null)).catch(() => {});
    return () => {
      stale = true;
    };
  }, [writer]);

  /* Decided here, until the next read brings them back as decided. */
  const [done, setDone] = useState(() => new Map());
  useEffect(() => setDone(new Map()), [sourceRows]);
  const rows = useMemo(
    () => (sourceRows ?? []).map((r) => (done.has(r.name) ? { ...r, status: done.get(r.name), modified: `${today} 00:00:00`, modified_by__name: viewer } : r)),
    [sourceRows, done, today, viewer],
  );
  const { waiting, others, decided, everyone } = useMemo(() => shapeLeaves(rows, { viewer, today }), [rows, viewer, today]);
  const groups = useMemo(() => groupWaiting(waiting), [waiting]);
  const otherGroups = useMemo(() => groupWaiting(others), [others]);
  const week = useMemo(() => daysOff(everyone, today), [everyone, today]);

  const [tab, setTab] = useState('waiting');
  const [selected, setSelected] = useState(() => new Set());
  useEffect(() => {
    const live = new Set(waiting.map((l) => l.name));
    setSelected((s) => new Set([...s].filter((n) => live.has(n))));
  }, [waiting]);
  const toggle = (name) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [rejecting, setRejecting] = useState(null); // names
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const canDecide = Boolean(writer?.decide);
  const decide = useCallback(
    async (names, action, reason) => {
      if (!writer?.decide || !names.length) return;
      setBusy(names.length === 1 ? names[0] : action);
      setError(null);
      try {
        const results = await writer.decide(names.map((name) => ({ name, action, reason })));
        const okd = results.filter((r) => r.ok);
        setDone((m) => new Map([...m, ...okd.map((r) => [r.name, r.status])]));
        const failed = results.filter((r) => !r.ok);
        if (failed.length) setError(`${failed.length} not ${action === 'approve' ? 'approved' : 'rejected'}: ${failed[0].error}`);
        if (okd.length) {
          const who = okd.length === 1 ? waiting.find((l) => l.name === okd[0].name)?.employeeName : null;
          setNotice(`${action === 'approve' ? 'Approved' : 'Rejected'} ${who ? `${who}'s leave` : `${okd.length} leaves`}`);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setNotice(null), 3500);
        }
        setSelected(new Set());
        onDecided?.({ action, names, results });
        return failed.length === 0;
      } catch (e) {
        setError(e.message || 'The ERP did not answer.');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [writer, waiting, onDecided],
  );

  const rootRef = useRef(null);
  const [barHeight, setBarHeight] = useState(0);
  const barGap = bottomGap ?? 'var(--space-12)';
  const loading = sourceRows == null && !loaded.error;
  const sel = [...selected];
  const showBar = canDecide && tab === 'waiting' && waiting.length > 0 && !rejecting;
  const rejectLeaves = (rejecting ?? []).map((n) => waiting.find((l) => l.name === n)).filter(Boolean);

  return (
    <section ref={rootRef} className={cx('flex w-full flex-col gap-3', className)}>
      <header className="flex items-center gap-2">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Back" className="flex shrink-0 items-center text-heading">
            <Icon name="chevron-left" />
          </button>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-16 font-semibold text-heading">{title}</h1>
        {waiting.length ? (
          <StatusPill status={groups[0]?.id === 'started' ? 'rejected' : 'pending'} className="shrink-0">
            {waiting.length} waiting
          </StatusPill>
        ) : !loading ? (
          <StatusPill status="approved" className="shrink-0">All done</StatusPill>
        ) : null}
      </header>

      {loaded.error && !sourceRows ? (
        <Card className="flex flex-col gap-2 bg-danger-wash">
          <span className="text-13 font-semibold text-danger-text">Could not load leaves</span>
          <span className="text-12 text-ds-secondary">{loaded.error.message}</span>
          <Button type="default" size="sm" className="self-start" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </Card>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading leaves">
          <div className="h-16 rounded-lg bg-sunken" />
          <Card className="h-56" />
          <Card className="h-56" />
        </div>
      ) : null}

      {!loading && sourceRows ? (
        <>
          <WeekStrip days={week} />

          <SegmentedControl
            block
            ariaLabel="Leaves"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'waiting', label: `Waiting${waiting.length + others.length ? ` · ${waiting.length + others.length}` : ''}` },
              { id: 'decided', label: 'Decided' },
            ]}
          />

          {notice ? (
            <p role="status" className="flex items-center gap-2 rounded-lg bg-success-wash px-3 py-2 text-12 text-approved-text">
              <Icon name="check-circle" size="sm" />
              {notice}
            </p>
          ) : null}

          {tab === 'waiting' ? (
            <>
              {waiting.length ? (
                <>
                  {others.length ? <SectionTitle>Waiting on you · {waiting.length}</SectionTitle> : null}
                  {groups.map((g) => (
                    <div key={g.id} className="flex flex-col gap-2">
                      <GroupTitle group={g} />
                      {g.items.map((l) => (
                        <LeaveCard
                          key={l.name}
                          leave={l}
                          canDecide={canDecide}
                          selected={selected.has(l.name)}
                          onToggle={() => toggle(l.name)}
                          busy={busy}
                          onApprove={() => decide([l.name], 'approve')}
                          onReject={() => setRejecting([l.name])}
                        />
                      ))}
                    </div>
                  ))}
                </>
              ) : (
                <Card className="flex flex-col items-center gap-2 py-8 text-center">
                  <Icon name="check-circle" size="xl" className="text-success" />
                  <span className="text-14 font-semibold text-heading">No leave waiting on you</span>
                  <span className="text-12 text-ds-secondary">New requests from your team show up here and on the strip.</span>
                </Card>
              )}
              {others.length ? (
                <>
                  <SectionTitle>Waiting on others · {others.length}</SectionTitle>
                  {otherGroups.map((g) => (
                    <div key={g.id} className="flex flex-col gap-2">
                      <GroupTitle group={g} />
                      {g.items.map((l) => (
                        <LeaveCard key={l.name} leave={l} viewer={viewer} />
                      ))}
                    </div>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            decided.length ? (
              decided.map((l) => <LeaveCard key={l.name} leave={l} viewer={viewer} />)
            ) : (
              <Card className="py-6 text-center text-12 text-ds-secondary">Nothing decided in the last 30 days.</Card>
            )
          )}

          {!canDecide ? <p className="text-11 text-ds-muted">Read-only: bind gqlToken (the signed-in user&apos;s ERP token) to decide.</p> : null}
        </>
      ) : null}

      {showBar ? (
        <>
          <PinnedBarSpacer height={barHeight} bottomGap={barGap} />
          <PinnedBar anchorRef={rootRef} bottomGap={barGap} onHeight={setBarHeight}>
            <Card className="flex flex-col gap-2.5 shadow-pop" role="region" aria-label="Decide leaves">
              {error ? (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-wash px-3 py-2 text-11 text-danger-text">
                  <Icon name="exclamation-circle" size="sm" className="mt-px shrink-0" />
                  <span>{error}</span>
                </p>
              ) : null}
              {sel.length ? (
                <>
                  <div className="flex items-baseline justify-between gap-3 text-12">
                    <span className="text-heading">
                      <span className="font-semibold">{sel.length}</span> selected
                    </span>
                    <Button type="link" size="sm" onClick={() => setSelected(new Set())} disabled={Boolean(busy)}>
                      Clear
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="default" size="lg" danger block disabled={Boolean(busy)} onClick={() => setRejecting(sel)}>
                      Reject {sel.length}
                    </Button>
                    <Button type="primary" size="lg" block loading={busy === 'approve'} disabled={Boolean(busy)} onClick={() => decide(sel, 'approve')}>
                      Approve {sel.length}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Button type="primary" size="lg" block loading={busy === 'approve'} disabled={Boolean(busy)} onClick={() => decide(waiting.map((l) => l.name), 'approve')}>
                    Approve all {waiting.length}
                  </Button>
                  <p className="text-10 text-ds-muted">Or tick leaves to decide a few together. Rejecting always asks for a reason.</p>
                </>
              )}
            </Card>
          </PinnedBar>
        </>
      ) : null}

      <RejectSheet
        open={Boolean(rejecting)}
        leaves={rejectLeaves}
        busy={busy === 'reject' || (rejectLeaves.length === 1 && busy === rejectLeaves[0]?.name)}
        error={rejecting ? error : null}
        onClose={() => {
          setRejecting(null);
          setError(null);
        }}
        onConfirm={async (reason) => {
          const ok = await decide(rejecting, 'reject', reason);
          if (ok) setRejecting(null);
        }}
      />
    </section>
  );
}

export default LeaveApproval;
