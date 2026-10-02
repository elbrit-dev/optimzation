'use client';

import { useState } from 'react';
import { Avatar, Button, Card, Field, Icon, Sheet, StatusPill, cx, toneFill } from '@/design-system';
import { StockistCard } from '@/app/secondary-entry/components/StockistCard';
import { ProductCard } from '@/app/secondary-entry/components/ProductCard';
import { formatMoney, formatQty } from '@/app/secondary-entry/data/format';
import { coveringLabel } from '@/app/secondary-entry/data/shape';
import { STATUS_TONE, monthLabel } from '../data/shape';
import { partyCount, useTask } from '@/app/secondary-entry/data/task';

/* The submission — everything one person raised for one month — as ONE
 * card: what it is and where it is (title, pill), WHO raised it (with the
 * three figures that size it), and the stockists on Secondary Entry's
 * StockistCard. The decision itself is the
 * screen's pinned DecisionBar. Presentation only; every number
 * arrives computed. */

/* The workflow's own words — "ABM Approval Waiting", "ABM Approved and
   Waiting for Verification" — not a paraphrase, so the pill reads exactly
   what the ERP and its notifications say. A person's stockists can sit in
   different states; then the pill names the most common one and counts the
   rest ("+2"), and `title` lists every state with its count. */
export function submissionStates(g) {
  const byState = new Map();
  for (const s of g.slices) {
    const k = s.state || 'Unknown';
    byState.set(k, (byState.get(k) ?? 0) + 1);
  }
  const ranked = [...byState.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [top] = ranked[0] ?? ['Unknown', 0];
  const others = g.slices.length - (ranked[0]?.[1] ?? 0);
  return {
    text: others ? `${top} · +${others}` : top,
    title: ranked.map(([k, n]) => `${k}: ${n}`).join('\n'),
  };
}

function firstName(name) {
  return String(name ?? '').trim().split(/\s+/)[0] || name;
}

/* ---- the strip: one segment per submission, then one chip per person ---- */

const SEGMENT_CLASS = {
  approved: 'bg-success',
  rejected: 'bg-danger',
  partial: 'bg-warning',
  /* Not done yet: the wash of the colour it will be if it stays undone. */
  pending: 'bg-danger-wash',
};

/* The month at a glance: a segment per person, in their status's colour. On
   its own, so the page can set the People / Team switch under it. */
export function SubmissionBar({ submissions }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {submissions.map((g) => (
        <span key={g.key} className={cx('h-1.5 flex-1 rounded-full', SEGMENT_CLASS[g.status])} />
      ))}
    </div>
  );
}

export function SubmissionStrip({ submissions, value, onChange, bar = true }) {
  return (
    <div className="flex flex-col gap-3">
      {bar ? <SubmissionBar submissions={submissions} /> : null}
      {/* One chip per person, the chosen one in the heading navy. The number
          is the chip's place in the queue; the dot is its status. */}
      <div role="tablist" aria-label="Submissions" className="ds-scroll-x -mx-1 flex gap-1.5 px-1 py-0.5">
        {submissions.map((g, i) => {
          const active = g.key === value;
          return (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(g.key)}
              className={cx(
                'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-11 font-medium transition-colors',
                active ? 'bg-heading text-on-brand' : 'border border-line bg-surface text-ds-secondary hover:border-line-strong',
              )}
            >
              <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: toneFill(STATUS_TONE[g.status]) }} />
              <span className="whitespace-nowrap">
                {i + 1} · {g.isSelf ? 'Self' : firstName(g.raiserName)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---- rows ---- */

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line-subtle py-2 text-12">
      <span className="text-ds-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-heading">{children}</span>
    </div>
  );
}

/* A decision button on a stockist line: outlined until pressed, then filled
   with the button fill (the deeper twin, so white text stays readable). */
function Choice({ pressed, tone, onClick, children, disabled }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border text-12 font-semibold transition-colors disabled:opacity-60',
        pressed
          ? tone === 'danger'
            ? 'border-danger-fill bg-danger-fill text-on-brand'
            : 'border-brand-fill bg-brand-fill text-on-brand'
          : tone === 'danger'
            ? 'border-line bg-surface text-danger-text hover:border-danger'
            : 'border-line bg-surface text-brand-text hover:border-brand',
      )}
    >
      {pressed ? <Icon name="check" size="var(--fs-10)" /> : null}
      {children}
    </button>
  );
}

/* One stockist (or doctor) — Secondary Entry's own StockistCard, so an
 * approver sees it exactly as the BE did: avatar, name, code chip, HQ, the
 * tracker's status, and the figures. Tapping it opens a BOTTOM SHEET with its
 * products, each on the entry page's ProductCard in its compact form, and —
 * when it waits on the viewer — Rework / Approve (one they approved that
 * verification has not taken yet: Rework alone). Rework asks for its reason
 * there, which the BE reads against this line. Picking does not send: the
 * pinned bar sends every choice at once, and the card shows what was picked.
 *
 * "Rework" is the ERP workflow's Revisit: the approval stays open and the BE
 * corrects and resubmits. One sent back and still waiting on the BE shows the
 * reason, and "Rework" in its pill. */
export function StockistLine({ slice, mine = false, revisitable = false, choice, onChoose, onReason, busy = false }) {
  const task = useTask();
  const [open, setOpen] = useState(false);
  const rejectedNote = slice.status === 'rejected' && slice.reason;
  const revisitNote = slice.revisitNote;
  const decides = mine || revisitable;
  const notes = (
    <>
      {rejectedNote ? <p className="text-11 text-danger-text">Reason: {slice.reason}</p> : null}
      {revisitNote ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-danger-wash px-2.5 py-1.5 text-11 text-danger-text">
          <Icon name="replay" size="var(--fs-10)" className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">Sent back for rework: </span>
            {revisitNote}
          </span>
        </p>
      ) : null}
    </>
  );
  return (
    <>
      <StockistCard
        entry={{
          name: slice.name,
          stockist: slice.stockist,
          ebsCode: slice.ebsCode,
          otherEbsCodes: [],
          note: slice.note,
          hq: slice.hq,
          status: revisitNote ? 'revisit' : slice.status,
          statusText: slice.state,
          salesQty: slice.salesQty,
          salesValue: slice.value,
          closingQty: slice.closingQty,
          closingValue: slice.closingValue,
          lines: slice.lines,
        }}
        onOpen={() => setOpen(true)}
      >
        {rejectedNote || revisitNote || choice?.action ? (
          <>
            {notes}
            {/* What was picked for this line, until the pinned bar sends it. */}
            {choice?.action ? (
              <p className={cx('flex items-center gap-1.5 text-11 font-semibold', choice.action === 'revisit' ? 'text-danger-text' : 'text-brand-text')}>
                <Icon name="check" size="var(--fs-10)" />
                {choice.action === 'revisit' ? `Rework${choice.reason?.trim() ? `: ${choice.reason.trim()}` : ' — add a reason'}` : 'Approve'}
              </p>
            ) : null}
          </>
        ) : null}
      </StockistCard>

      <Sheet open={open} onClose={() => setOpen(false)} title={slice.stockist} subtitle={[slice.ebsCode, slice.hq].filter(Boolean).join(' · ') || undefined} surface="app">
        <div className="flex flex-col gap-3">
          {slice.lines.length ? (
            <ul className="flex flex-col gap-1.5">
              {slice.lines.map((l, i) => (
                <li key={`${l.covering?.seat ?? ''}|${l.item}`} className="flex flex-col gap-1.5">
                  {/* Lines entered for a vacant seat the raiser covers, under
                      the seat they are for. */}
                  {l.covering && l.covering.seat !== slice.lines[i - 1]?.covering?.seat ? (
                    <p className="px-1 pt-1 text-10 font-semibold text-warning-text">{coveringLabel(l.covering)}</p>
                  ) : null}
                  <ProductCard
                    data={{ item_name: l.item }}
                    brand={l.brand || undefined}
                    singleProduct
                    variantChip={Boolean(l.brand)}
                    compact
                    clickable={false}
                    showPrices={false}
                    tray={[
                      { label: task.qtyLabel, value: formatQty(l.salesQty), caption: formatMoney(l.salesValue) },
                      ...(task.closing ? [{ label: 'Closing', value: formatQty(l.closingQty), caption: formatMoney(l.closingValue) }] : []),
                    ]}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-11 text-ds-muted">No product lines.</p>
          )}
          <div className="flex items-baseline justify-between gap-3 px-1">
            <span className="text-11 font-semibold text-heading">Total</span>
            <span className="text-12 font-bold tabular-nums text-heading">
              {task.closing ? `${formatQty(slice.salesQty)} sales · ${formatQty(slice.closingQty)} closing · ` : `${formatQty(slice.salesQty)} qty · `}
              {formatMoney(slice.value)}
            </span>
          </div>
          {notes}
          {decides ? (
            <div className="flex flex-col gap-2 border-t border-line-subtle pt-3">
              <div className="flex gap-2" role="group" aria-label={`Decision for ${slice.stockist}`}>
                {revisitable ? (
                  <Choice tone="danger" pressed={choice?.action === 'revisit'} disabled={busy} onClick={() => onChoose(choice?.action === 'revisit' ? null : 'revisit')}>
                    Rework
                  </Choice>
                ) : null}
                {mine ? (
                  <Choice pressed={choice?.action === 'approve'} disabled={busy} onClick={() => onChoose(choice?.action === 'approve' ? null : 'approve')}>
                    Approve
                  </Choice>
                ) : null}
              </div>
              {choice?.action === 'revisit' ? (
                <Field
                  size="app"
                  label="Reason for rework"
                  placeholder="What should be corrected…"
                  value={choice.reason ?? ''}
                  onChange={onReason}
                  disabled={busy}
                  error={choice.reason?.trim() ? undefined : 'Required to send back.'}
                />
              ) : null}
              <p className="text-10 text-ds-muted">Picked decisions are sent together from the bar at the bottom.</p>
            </div>
          ) : null}
          <Button type="default" size="lg" block onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </Sheet>
    </>
  );
}


/* ---- what it adds up to ---- */

/* One metric: a small uppercase label, the number in bold, and a muted
   caption saying what it counts — the price tray's type, as its own card. */
function MetricCard({ label, value, caption }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-line-subtle bg-surface px-3 py-2.5">
      <span className="truncate text-10 font-semibold uppercase tracking-wide text-ds-muted">{label}</span>
      <span className="truncate text-16 font-bold tabular-nums text-heading">{value}</span>
      <span className="truncate text-10 text-ds-muted">{caption}</span>
    </div>
  );
}

/* What the submission adds up to — one card per figure. Who raised it is the
   chip above, so it is not repeated here. Closing only where the task keys it. */
export function SubmissionMetrics({ submission: g }) {
  const task = useTask();
  const mon = monthLabel(g.month);
  const figures = [
    { label: task.Parties, value: String(g.stockists), caption: 'this month' },
    { label: task.closing ? 'Sales qty' : 'Total qty', value: formatQty(g.salesQty), caption: task.qtyCaption },
    ...(task.closing ? [{ label: 'Closing qty', value: formatQty(g.closingQty), caption: 'in stock' }] : []),
    { label: 'Value', value: formatMoney(g.value), caption: `${mon} ${task.valueNoun}` },
  ];
  return (
    <div className={cx('grid gap-2', figures.length === 4 ? 'grid-cols-2' : 'grid-cols-3')}>
      {figures.map((f) => (
        <MetricCard key={f.label} {...f} />
      ))}
    </div>
  );
}

/* ---- the card ---- */

export function SubmissionCard({
  submission: g,
  canDecide,
  busy,
  choices,
  onChoose,
  onReason,
}) {
  const task = useTask();
  const actionable = canDecide && g.mine.length > 0;
  const reasons = [...new Set(g.slices.filter((s) => s.status === 'rejected' && s.reason).map((s) => s.reason))];

  return (
    <Card className="flex flex-col gap-3">
      {/* No stockists · units line under the title: the person card's tray
          right below says both, with what they count. */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="shrink-0 text-14 font-semibold text-heading">{task.cardTitle} — {monthLabel(g.month)}</h2>
        {/* The title never gives way; a long workflow state truncates inside
            the pill, and its title attribute has the whole of it. The pill is
            `flex: 0 0 auto` by design, so the wrapper is what shrinks and the
            pill is capped at the wrapper's width. */}
        <span className="flex min-w-0 justify-end">
          <StatusPill status={STATUS_TONE[g.status]} showDot={false} className="max-w-full" title={submissionStates(g).title}>
            <span className="min-w-0 truncate">{submissionStates(g).text}</span>
          </StatusPill>
        </span>
      </div>

      <SubmissionMetrics submission={g} />

      {reasons.length ? (
        <div>
          <Row label="Reason">{reasons.join(' · ')}</Row>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {g.slices.map((s) => (
          <StockistLine
            key={s.name}
            slice={s}
            mine={actionable && g.mine.includes(s.name)}
            revisitable={canDecide && g.revisitable.includes(s.name)}
            choice={choices?.get(s.name)}
            onChoose={(action) => onChoose(s.name, action)}
            onReason={(reason) => onReason(s.name, reason)}
            busy={Boolean(busy)}
          />
        ))}
        <div className="flex items-baseline justify-between gap-3 px-1 pt-0.5">
          <span className="text-11 font-semibold text-heading">Total</span>
          <span className="tabular-nums">
            <span className="text-10 text-ds-muted">
              {partyCount(task, g.slices.length)} ·{' '}
            </span>
            <span className="text-12 font-bold text-heading">{formatMoney(g.value)}</span>
          </span>
        </div>
      </div>

    </Card>
  );
}
