'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, ChipRow, Icon, Sheet, StatusPill, cx } from '@/design-system';
import { TableOperationsContext } from '@/app/datatable/contexts/TableOperationsContext';
import { SECONDARY, TaskProvider } from '@/app/secondary-entry/data/task';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';
import { useUnsavedGuard } from '@/app/secondary-entry/components/useUnsavedGuard';
import { PinnedBarSpacer } from '@/app/secondary-entry/components/PinnedBar';
import { bucketOfState, monthLabel, normalizeSlices } from '../data/shape';
import { doneCount, scopeSubmissions } from '../data/selectors';
import { createDecisionWriter } from '../data/writes';
import { useServerApprovals } from '../data/useServerApprovals';
import { SubmissionCard, SubmissionStrip } from './SubmissionCard';
import { RevisitSheet } from './RevisitSheet';
import { DecisionBar } from './DecisionBar';

/* Secondary approvals — an approver's month of submissions to decide, and
 * the BE's own view of where theirs stands. Drop it inside an Elbrit
 * DataView under an Elbrit DataProvider (Views) bound to the
 * `SecondaryApproval` query (see ../README.md); it reads the Operational
 * Tracker rows from the provider's context. `rows` overrides that for use
 * outside a provider.
 *
 * ONE PERSON AT A TIME: a chip per person who raised figures, and their
 * month as one card — who, the four figures that size it, and the
 * stockists on Secondary Entry's StockistCard — with the decision pinned
 * to the bottom of the screen. Decide the whole submission at once, or stockist
 * by stockist on the lines themselves; either way it is one call.
 *
 * THE ERP DECIDES, NOT THIS SCREEN. What is listed is every tracker the
 * query returns — the ERP's permission rules say which. What may be done
 * on each is the ERP's workflow's answer for this user (writer.actions,
 * frappe's get_transitions), asked for the submission on screen: Approve
 * where it offers "Approve to Verification", Revisit where it offers
 * "Revisit". Who is looking is the token's user — the server script's
 * `user`, or the ERP's answer for the token — and only labels their own
 * submission "Self".
 *
 * Decisions go through Frappe's standard workflow actions as the signed-in
 * user (`gqlToken`) — see data/writes.js. */

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function useProviderSlot() {
  const ctx = useContext(TableOperationsContext);
  if (!ctx || typeof ctx !== 'object') return null;
  return ctx.rawData !== undefined ? ctx : (ctx.main ?? null);
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading approvals">
      <div className="h-1.5 rounded-full bg-sunken" />
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-sunken" />
        ))}
      </div>
      <Card className="h-80" />
    </div>
  );
}

export function SecondaryApproval({
  rows: rowsProp,
  gqlEnvironment = 'ERP',
  gqlToken,
  today: todayProp,
  /* Which task this screen is for (secondary-entry/data/task.js) —
     Secondary by default; DoctorSupportApproval passes Doctor Support. */
  task = SECONDARY,
  title,
  onBack,
  onDecided,
  /* Gap under the pinned decision bar; e.g. calc(4rem + var(--space-12))
     to clear an app's bottom navigation. */
  bottomGap,
  writer: writerProp,
  className,
}) {
  const slot = useProviderSlot();
  /* WHERE THE ROWS COME FROM: `rows`, else the Elbrit DataProvider it sits
     in, else — the usual case — the "Elbrit Secondary Approval" server script
     as the signed-in user (data/useServerApprovals.js): ONE month at a time,
     no cap, each tracker with only its own seat's lines, and a light list of
     every month for the switcher. */
  const [pinnedMonth, setPinnedMonth] = useState(null);
  const serverMode = rowsProp == null && !slot && Boolean(gqlToken?.trim());
  const server = useServerApprovals({ enabled: serverMode, gqlEnvironment, gqlToken, month: pinnedMonth ?? undefined, method: task.approvalMethod });
  const sourceRows = rowsProp ?? slot?.rawData ?? server.data?.trackers;
  const baseSlices = useMemo(() => normalizeSlices(sourceRows), [sourceRows]);

  /* Decisions laid over the provider's rows until its next fetch brings them
     back — so a decided card turns at once instead of after a refetch. */
  const [patches, setPatches] = useState(() => new Map());
  useEffect(() => setPatches(new Map()), [sourceRows]);
  /* WHO IS LOOKING comes from the token, not a prop: the server script says
     (its `user`); with rows from elsewhere the ERP is asked who the token
     is, once (writer.whoAmI, below). It only labels their own submission
     "Self" and a just-decided stockist's decider until the refetch. */
  const [askedViewer, setAskedViewer] = useState(null);
  const viewer = String((serverMode ? server.data?.user : askedViewer) ?? '').toLowerCase() || null;
  /* tracker → { approve, revisit }, from the ERP (see writer.actions). */
  const [allowed, setAllowed] = useState(() => new Map());
  const slices = useMemo(
    () =>
      patches.size
        ? baseSlices.map((s) => {
            const p = patches.get(s.name);
            if (!p) return s;
            /* A revisit restarts the approval at "<ROLE> Approval Waiting",
               routed back to the viewer, with the reason as its note. */
            if (p.action === 'revisit') {
              return {
                ...s,
                state: p.state,
                status: 'pending',
                atRole: p.state.replace(/ Approval Waiting$/, ''),
                decidedRole: null,
                nextApprover: viewer,
                modifiedBy: viewer,
                reason: `Revisit (from ${s.state}): ${p.reason}`,
                revisitNote: p.reason,
              };
            }
            return {
              ...s,
              state: p.state,
              status: bucketOfState(p.state),
              atRole: null,
              decidedRole: s.atRole,
              nextApprover: null,
              modifiedBy: viewer,
              revisitNote: null,
            };
          })
        : baseSlices,
    [baseSlices, patches, viewer],
  );

  const today = todayProp || localToday();
  const scoped = useMemo(
    () => scopeSubmissions(slices, viewer, { today, month: pinnedMonth, allowed }),
    [slices, viewer, today, pinnedMonth, allowed],
  );
  const { submissions: ranked } = scoped;
  /* From the server script the rows are already ONE month, and the months
     with work waiting come in its summary. */
  const period = serverMode ? (server.data?.month ?? scoped.period) : scoped.period;
  const workMonths = serverMode ? (server.data?.months ?? []).filter((m) => m.waiting > 0) : scoped.workMonths;
  /* The chips keep the order they first appeared in: ranked (waiting first)
     on arrival, but a decision must not reshuffle the strip under the
     reader's thumb. New submissions join at the end. */
  const orderRef = useRef(new Map());
  const submissions = useMemo(() => {
    const order = orderRef.current;
    for (const g of ranked) if (!order.has(g.key)) order.set(g.key, order.size);
    return [...ranked].sort((a, b) => order.get(a.key) - order.get(b.key));
  }, [ranked]);
  const progress = doneCount(submissions);

  const [selectedKey, setSelectedKey] = useState(null);
  const current = submissions.find((g) => g.key === selectedKey) ?? submissions[0] ?? null;
  /* Pin what is on screen, so a decision that changes the order (or a
     refetch) does not swap the card out from under the reader. */
  useEffect(() => {
    if (current && current.key !== selectedKey) setSelectedKey(current.key);
  }, [current, selectedKey]);

  const writerRef = useRef(null);
  const getWriter = useCallback(async () => {
    if (writerProp) return writerProp;
    if (writerRef.current?.token === gqlToken && writerRef.current?.env === gqlEnvironment) return writerRef.current.writer;
    const { endpointUrl } = await getEndpointConfigFromUrlKeyAsync(gqlEnvironment);
    const writer = createDecisionWriter({ endpointUrl, gqlToken });
    writerRef.current = { writer, token: gqlToken, env: gqlEnvironment };
    return writer;
  }, [writerProp, gqlToken, gqlEnvironment]);
  const canDecide = Boolean(writerProp) || Boolean(gqlToken?.trim());

  /* Not from the server script: ask the ERP who the token is. */
  useEffect(() => {
    setAskedViewer(null);
    if (serverMode || !canDecide) return undefined;
    let stale = false;
    (async () => {
      try {
        const writer = await getWriter();
        const who = await writer.whoAmI?.();
        if (!stale) setAskedViewer(who ?? null);
      } catch {
        /* Unknown: nothing is labelled Self. */
      }
    })();
    return () => {
      stale = true;
    };
  }, [serverMode, canDecide, getWriter]);

  /* Ask the ERP what this user may do on the stockists on screen — only
     those not asked yet; a decision forgets its trackers, so they are asked
     again in their new state. */
  const askNames = useMemo(
    () => (canDecide && current ? current.slices.map((s) => s.name).filter((n) => !allowed.has(n)) : []),
    [canDecide, current, allowed],
  );
  const askKey = askNames.join('|');
  useEffect(() => {
    if (!askKey) return undefined;
    let stale = false;
    (async () => {
      try {
        const writer = await getWriter();
        const answers = await writer.actions(askKey.split('|'));
        if (!stale) setAllowed((prev) => new Map([...prev, ...answers]));
      } catch {
        /* No answer: no buttons — the ERP did not say they may. */
      }
    })();
    return () => {
      stale = true;
    };
  }, [askKey, getWriter]);
  useEffect(() => setAllowed(new Map()), [sourceRows, gqlToken, gqlEnvironment, writerProp]);

  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const flash = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [current?.key]);

  /* ---- line-by-line choices: tracker → { action, reason } ----
     Kept here, not in the card, so moving between people keeps them. Only
     ever trackers the viewer may act on; any that stop being so drop out. */
  const [choices, setChoices] = useState(() => new Map());
  /* A pick only survives where its action is still possible: an approve on
     a stockist still waiting on the viewer, a revisit on one they may
     revisit. (Found on UAT: an approve that failed because someone else had
     approved first stayed picked on a now-approved stockist — "1 to approve"
     that could only fail again, hiding the Approve-all bar.) */
  const waitingNow = useMemo(() => new Set([...allowed].filter(([, a]) => a.approve).map(([n]) => n)), [allowed]);
  const revisitableNow = useMemo(() => new Set([...allowed].filter(([, a]) => a.revisit).map(([n]) => n)), [allowed]);
  useEffect(() => {
    const valid = ([n, c]) => (c.action === 'approve' ? waitingNow.has(n) : revisitableNow.has(n));
    if ([...choices].some((e) => !valid(e))) setChoices((prev) => new Map([...prev].filter(valid)));
  }, [waitingNow, revisitableNow, choices]);
  const onChoose = (name, action) =>
    setChoices((prev) => {
      const next = new Map(prev);
      if (!action) next.delete(name);
      else next.set(name, { action, reason: prev.get(name)?.reason ?? '' });
      return next;
    });
  const onReason = (name, reason) => setChoices((prev) => new Map(prev).set(name, { ...prev.get(name), reason }));
  const dropChoices = (names) => setChoices((prev) => new Map([...prev].filter(([n]) => !names.includes(n))));

  /* The writer answers per tracker, so a partial failure keeps the
     failures waiting (and named) while the rest turn. */
  const decide = useCallback(
    async (decisions, kind) => {
      if (!decisions.length) return false;
      setBusy(kind);
      setError(null);
      try {
        const writer = await getWriter();
        const results = await writer.decide(decisions);
        const byName = new Map(results.map((r) => [r.name, r]));
        const asked = new Map(decisions.map((d) => [d.name, d]));
        const ok = results.filter((r) => r.ok && r.state);
        if (ok.length) {
          setPatches((prev) => {
            const next = new Map(prev);
            for (const r of ok) next.set(r.name, { state: r.state, action: asked.get(r.name)?.action, reason: asked.get(r.name)?.reason });
            return next;
          });
        }
        const failed = decisions.filter((d) => !byName.get(d.name)?.ok);
        /* What went through leaves the picks; failures stay picked for a
           retry. (A revisited stockist is still the viewer's, so it cannot
           be left to fall out on its own.) */
        const done = new Set(ok.map((r) => r.name));
        if (done.size) setChoices((prev) => new Map([...prev].filter(([n]) => !done.has(n))));
        /* Their state moved on: ask the ERP again what may be done now. */
        if (done.size) setAllowed((prev) => new Map([...prev].filter(([n]) => !done.has(n))));
        const stockistOf = new Map(slices.map((s) => [s.name, s.stockist]));
        onDecided?.({ decisions, results, live: writer.live !== false });
        if (ok.length && writer.live !== false) {
          if (slot) slot.handleSync?.();
          else if (serverMode) server.reload();
        }
        if (failed.length) {
          setError(
            [
              `${ok.length} of ${decisions.length} went through.`,
              ...failed.slice(0, 3).map((d) => `${stockistOf.get(d.name) ?? d.name}: ${byName.get(d.name)?.error ?? 'no answer from ERP'}`),
            ].join(' '),
          );
          return false;
        }
        const approved = decisions.filter((d) => d.action === 'approve').length;
        const revisited = decisions.length - approved;
        flash([approved ? `${approved} approved` : null, revisited ? `${revisited} sent back for revisit` : null].filter(Boolean).join(' · ') + '.');
        return true;
      } catch (e) {
        setError(e?.message || 'Could not reach ERP.');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [getWriter, slices, onDecided, slot, flash, serverMode, server],
  );

  const [revisitOpen, setRevisitOpen] = useState(false);
  const approveCard = () => current && decide(current.mine.map((name) => ({ name, action: 'approve' })), 'approve');
  const revisitCard = async (reason) => {
    if (!current) return;
    const done = await decide(current.mine.map((name) => ({ name, action: 'revisit', reason })), 'revisit');
    if (done) setRevisitOpen(false);
  };
  const sendChoices = async () => {
    if (!current) return;
    const names = current.revisitable.filter((n) => choices.has(n));
    await decide(
      names.map((name) => ({ name, action: choices.get(name).action, reason: choices.get(name).reason?.trim() || undefined })),
      'choices',
    );
  };

  /* Choices not yet sent are unsaved work: leaving the screen asks first —
     Secondary Entry's guard, Navigation's mechanism. */
  const guard = useUnsavedGuard({ dirty: choices.size > 0, onBack: onBack ?? (() => {}) });
  const onHeaderBack = onBack ? () => guard.request(onBack) : null;

  const loading = (slot?.isLoading && !baseSlices.length) || (serverMode && !server.data && !server.error);
  const loadError = serverMode && !server.data && server.error ? server.error.message || 'ERP did not answer.' : null;
  const rootRef = useRef(null);
  const [barHeight, setBarHeight] = useState(0);
  const barGap = bottomGap ?? 'var(--space-12)';
  /* Something waiting on the viewer, or a revisit picked on one they
     already approved — otherwise the bar would be two disabled buttons. */
  const showBar = Boolean(current && canDecide && !loading && (current.mine.length || current.revisitable.some((n) => choices.has(n))));
  const pillTone = !progress.total ? null : progress.done === progress.total ? 'success' : progress.done ? 'warning' : 'danger';

  const readOnlyNote = !canDecide ? "Read-only: bind gqlToken (the signed-in user's ERP token) to decide." : null;

  return (
    <TaskProvider value={task}>
    <section ref={rootRef} className={cx('@container/approval flex w-full scroll-mt-3 flex-col gap-3', className)}>
      <header className="flex items-center gap-2">
        {onHeaderBack ? (
          <button
            type="button"
            onClick={onHeaderBack}
            aria-label="Back"
            className="flex shrink-0 items-center text-heading transition-colors hover:text-brand-hover active:text-brand"
          >
            <Icon name="chevron-left" />
          </button>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-16 font-semibold text-heading">{title ?? task.approvalTitle}</h1>
        {pillTone ? (
          <StatusPill status={pillTone} showDot={false} className="shrink-0">
            {progress.percent}% · {progress.done} of {progress.total} done
          </StatusPill>
        ) : null}
      </header>

      {loading ? (
        <Skeleton />
      ) : loadError ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-xl bg-danger-wash px-4 py-4">
          <span className="flex items-center gap-2 text-13 font-semibold text-danger-text">
            <Icon name="exclamation-triangle" size="sm" />
            Something went wrong
          </span>
          <p className="text-12 text-ds-secondary">Could not load the approvals from ERP: {loadError}</p>
          <Button type="default" size="app" onClick={server.reload}>
            Try again
          </Button>
        </div>
      ) : !current ? (
        <p className="py-10 text-center text-12 text-ds-muted">Nothing to approve.</p>
      ) : (
        <>
          {/* More than one month with work waiting — a late month, or a
              future-dated one the ERP should not have — gets a switcher;
              the usual single month gets nothing. */}
          {workMonths.length > 1 || (workMonths.length === 1 && workMonths[0].month !== period) ? (
            <ChipRow
              ariaLabel="Month"
              value={period}
              onChange={setPinnedMonth}
              items={[...new Set([period, ...workMonths.map((w) => w.month)])]
                .sort()
                .reverse()
                .map((m) => ({
                  key: m,
                  label: `${monthLabel(m)}${m.slice(0, 4) !== today.slice(0, 4) ? ` '${m.slice(2, 4)}` : ''}`,
                  count: workMonths.find((w) => w.month === m)?.waiting ?? 0,
                }))}
            />
          ) : null}
          <SubmissionStrip submissions={submissions} value={current.key} onChange={setSelectedKey} />
          {notice ? (
            <div role="status" className="flex items-center gap-2 rounded-lg bg-success-wash px-3 py-2 text-12 font-medium text-success">
              <Icon name="check-circle" size="sm" />
              {notice}
            </div>
          ) : null}
          <SubmissionCard
            submission={current}
            canDecide={canDecide}
            busy={busy}
            choices={choices}
            onChoose={onChoose}
            onReason={onReason}
          />
          {readOnlyNote && submissions.some((g) => !g.isSelf) ? <p className="px-1 text-11 text-ds-muted">{readOnlyNote}</p> : null}
        </>
      )}

      {showBar ? (
        <>
          <PinnedBarSpacer height={barHeight} bottomGap={barGap} />
          <DecisionBar
            submission={current}
            choices={choices}
            busy={revisitOpen ? null : busy}
            error={revisitOpen ? null : error}
            anchorRef={rootRef}
            bottomGap={barGap}
            onHeight={setBarHeight}
            onApprove={approveCard}
            onRevisit={() => {
              setError(null);
              setRevisitOpen(true);
            }}
            onApproveRest={() =>
              setChoices((prev) => {
                const next = new Map(prev);
                for (const n of current.mine) if (!next.has(n)) next.set(n, { action: 'approve', reason: '' });
                return next;
              })
            }
            onClearChoices={() => dropChoices(current.revisitable)}
            onSendChoices={sendChoices}
          />
        </>
      ) : null}

      <RevisitSheet
        open={revisitOpen}
        onClose={() => setRevisitOpen(false)}
        onConfirm={revisitCard}
        count={current?.mine.length ?? 0}
        raiserName={current?.raiserName}
        busy={busy === 'revisit'}
        error={revisitOpen ? error : null}
      />

      <Sheet open={guard.confirmOpen} onClose={guard.cancel} title="Discard decisions?" surface="app">
        <p className="text-sm text-ds-secondary">The approvals and revisits you picked are not sent yet. Leave without sending them?</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="default" size="app" onClick={guard.cancel}>
            Keep deciding
          </Button>
          <Button type="primary" size="app" danger onClick={guard.confirm}>
            Discard
          </Button>
        </div>
      </Sheet>
    </section>
    </TaskProvider>
  );
}

export default SecondaryApproval;
