'use client';

import { useState } from 'react';
import { Avatar, Card, Field, Icon, StatusPill, cx, toneFill } from '@/design-system';
import { StockistCard } from '@/app/secondary-entry/components/StockistCard';
import { ProductCard } from '@/app/secondary-entry/components/ProductCard';
import { formatMoney, formatQty } from '@/app/secondary-entry/data/format';
import { STATUS_TONE, monthLabel } from '../data/shape';

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

export function SubmissionStrip({ submissions, value, onChange }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1" aria-hidden="true">
        {submissions.map((g) => (
          <span key={g.key} className={cx('h-1.5 flex-1 rounded-full', SEGMENT_CLASS[g.status])} />
        ))}
      </div>
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

/* One stockist — Secondary Entry's own StockistCard, so an approver sees the
 * stockist exactly as the BE did: avatar, name, EBS chip, HQ, the tracker's
 * status, and Sales / Closing / Products. Tapping it opens in place (the
 * pill's chevron turns) to its products, each on the entry page's
 * ProductCard in its compact form: the brand with the variant as a chip, and
 * Sales / Closing in the grey tray the catalogue shows prices in.
 *
 * LINE BY LINE, IN PLACE. When the stockist waits on the viewer the card
 * carries its own Revisit / Approve underneath; one the viewer approved that
 * verification has not taken yet carries Revisit alone. A revisit asks for
 * its reason right there — the BE reads it against this stockist. Picking
 * does not send: the pinned bar sends every choice at once.
 *
 * A stockist sent back and still waiting on the BE's correction shows the
 * reason, and "Revisit" in its pill — it is waiting, but not on a decision. */
export function StockistLine({ slice, mine = false, revisitable = false, choice, onChoose, onReason, busy = false }) {
  const [open, setOpen] = useState(false);
  const rejectedNote = slice.status === 'rejected' && slice.reason;
  const revisitNote = slice.revisitNote;
  return (
    <StockistCard
      entry={{
        name: slice.name,
        stockist: slice.stockist,
        ebsCode: slice.ebsCode,
        otherEbsCodes: [],
        hq: slice.hq,
        status: revisitNote ? 'revisit' : slice.status,
        statusText: slice.state,
        salesQty: slice.salesQty,
        salesValue: slice.value,
        closingQty: slice.closingQty,
        closingValue: slice.closingValue,
        lines: slice.lines,
      }}
      onOpen={() => setOpen((o) => !o)}
      expanded={open}
    >
      {open || rejectedNote || revisitNote || mine || revisitable ? (
        <>
          {open ? (
            slice.lines.length ? (
              <ul className="flex flex-col gap-1.5 border-t border-line-subtle pt-2.5">
                {slice.lines.map((l) => (
                  <li key={l.item}>
                    <ProductCard
                      data={{ item_name: l.item }}
                      brand={l.brand || undefined}
                      singleProduct
                      variantChip={Boolean(l.brand)}
                      compact
                      clickable={false}
                      showPrices={false}
                      tray={[
                        { label: 'Sales', value: formatQty(l.salesQty), caption: formatMoney(l.salesValue) },
                        { label: 'Closing', value: formatQty(l.closingQty), caption: formatMoney(l.closingValue) },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-line-subtle pt-2.5 text-11 text-ds-muted">No product lines.</p>
            )
          ) : null}
          {rejectedNote ? <p className="text-11 text-danger-text">Reason: {slice.reason}</p> : null}
          {revisitNote ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-danger-wash px-2.5 py-1.5 text-11 text-danger-text">
              <Icon name="replay" size="var(--fs-10)" className="mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold">Sent back for revisit: </span>
                {revisitNote}
              </span>
            </p>
          ) : null}
          {mine || revisitable ? (
            <div className="flex flex-col gap-2 border-t border-line-subtle pt-2.5">
              <div className="flex gap-2" role="group" aria-label={`Decision for ${slice.stockist}`}>
                {revisitable ? (
                  <Choice tone="danger" pressed={choice?.action === 'revisit'} disabled={busy} onClick={() => onChoose(choice?.action === 'revisit' ? null : 'revisit')}>
                    Revisit
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
                  label="Reason for revisit"
                  placeholder="What should be corrected…"
                  value={choice.reason ?? ''}
                  onChange={onReason}
                  disabled={busy}
                  error={choice.reason?.trim() ? undefined : 'Required to send back.'}
                />
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </StockistCard>
  );
}


/* ---- who raised it, and what it adds up to ---- */

/* One figure in the tray: ProductCard's price-tray type — a small uppercase
   label, the number in bold, and a muted caption that says what it counts. */
function Stat({ label, value, caption }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
      <span className="truncate text-10 font-semibold uppercase tracking-wide text-ds-muted">{label}</span>
      <span className="truncate text-16 font-bold tabular-nums text-heading">{value}</span>
      <span className="truncate text-10 text-ds-muted">{caption}</span>
    </div>
  );
}

/* Who raised it — avatar and name — and under it the three figures that size
   the submission, side by side in one grey tray. */
export function RaiserCard({ submission: g }) {
  const mon = monthLabel(g.month);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line-subtle p-3">
      {/* Just who: the avatar and the name. Role and HQ are left off — the
          stockist cards below carry the HQ, and here they were a second line
          saying nothing the reader needed to decide. */}
      <span className="flex min-w-0 items-center gap-2.5">
        <Avatar name={g.raiserName} size="sm" aria-hidden="true" />
        <span className="min-w-0 truncate text-13 font-semibold text-heading">{g.isSelf ? `You · ${g.raiserName}` : g.raiserName}</span>
      </span>
      <div className="grid grid-cols-3 rounded-xl bg-sunken">
        <Stat label="Stockists" value={g.stockists} caption="this month" />
        <Stat label="Total qty" value={formatQty(g.salesQty)} caption="units billed" />
        <Stat label="Value" value={formatMoney(g.value)} caption={`${mon} secondary`} />
      </div>
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
  const actionable = canDecide && g.mine.length > 0;
  const reasons = [...new Set(g.slices.filter((s) => s.status === 'rejected' && s.reason).map((s) => s.reason))];

  return (
    <Card className="flex flex-col gap-3">
      {/* No stockists · units line under the title: the person card's tray
          right below says both, with what they count. */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="shrink-0 text-14 font-semibold text-heading">Secondary sales — {monthLabel(g.month)}</h2>
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

      <RaiserCard submission={g} />

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
              {g.slices.length} {g.slices.length === 1 ? 'stockist' : 'stockists'} ·{' '}
            </span>
            <span className="text-12 font-bold text-heading">{formatMoney(g.value)}</span>
          </span>
        </div>
      </div>

    </Card>
  );
}
