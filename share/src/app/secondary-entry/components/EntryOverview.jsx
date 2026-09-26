'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Card, ChipRow, Eyebrow, Icon, LegendChip, SectionLabel, StackedBar, StatusPill, cx, toneFill } from '@/design-system';
import { STATUS_LABEL, STATUS_TONE } from '../data/shape';
import { formatMoney, formatQty } from '../data/format';
import { ACCEPT_ATTR } from '../data/sheetFile';
import { canSubmit } from '../data/selectors';
import { partyCount, useTask } from '../data/task';
import { StockistCard } from './StockistCard';
import { PinnedBar, PinnedBarSpacer } from './PinnedBar';

/* The list screen, built the way /visit is: a shadowed headline card whose
 * fraction is the only bold thing, a stacked bar with a legend that is also
 * the filter, a second card for the money, and the stockists as hairline
 * cards — a strip of shadowed cards is noise where a hairline stays quiet
 * (HqCard's rule). Presentation only; every number arrives computed. */

/* Bar order is the order work moves: done, with approvers, sent back, owed. */
const BAR_ORDER = ['approved', 'pending', 'revisit', 'rejected', 'draft'];
const LEGEND = ['draft', 'pending', 'approved'];

function Dot({ tone }) {
  return <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: toneFill(tone) }} />;
}

/* "How far along am I", as one number, one bar and three chips. The chips
   are the list's filter, so the figure and the rows behind it are one tap
   apart — AttendanceCard's pattern. */
function ProgressCard({ counts, entered, onDrill, partial = false }) {
  const task = useTask();
  return (
    <Card className="flex h-full flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow as="h2">{task.Parties} entered</Eyebrow>
        <span className="shrink-0 tabular-nums">
          <span className="text-20 font-semibold text-heading">{entered}</span>
          <span className="text-12 text-ds-muted">/{counts.all}{partial ? '+' : ''}</span>
        </span>
      </div>
      {/* Under server paging these are the LOADED stockists; saying so beats
          a "6/25" that quietly means "of the first 25". */}
      {partial ? <p className="-mt-1 text-10 text-ds-muted">Of the {counts.all} loaded so far — more load as you scroll.</p> : null}
      <StackedBar
        size="lg"
        label={BAR_ORDER.map((s) => `${STATUS_LABEL[s]}: ${counts[s]}`).join(', ')}
        segments={BAR_ORDER.map((s) => ({ key: s, value: counts[s], tone: STATUS_TONE[s], label: STATUS_LABEL[s] }))}
      />
      <div className="ds-legend-row">
        <div className="ds-legend-row__inner">
          {LEGEND.map((s) => (
            <LegendChip key={s} label={STATUS_LABEL[s]} value={counts[s]} tone={STATUS_TONE[s]} onClick={() => onDrill(s)} />
          ))}
          {['revisit', 'rejected'].map((s) =>
            counts[s] ? <LegendChip key={s} label={STATUS_LABEL[s]} value={counts[s]} tone={STATUS_TONE[s]} onClick={() => onDrill(s)} /> : null,
          )}
        </div>
      </div>
    </Card>
  );
}

const MATRIX_COLUMNS = ['draft', 'pending', 'approved'];

/* Sales and closing split by where they are in approval. Quantity leads —
   it is what the seat keys in and checks against the stockist's books — and
   the rupee value sits under it, small. An empty cell drops to muted rather
   than disappearing, so the columns never shift. */
function ValueCard({ matrix }) {
  const task = useTask();
  /* Closing only where the task keys it (Secondary); Doctor Support is qty. */
  const rows = task.closing
    ? [
        { key: 'sales', label: task.qtyLabel },
        { key: 'closing', label: 'Closing' },
      ]
    : [{ key: 'sales', label: task.qtyLabel }];
  return (
    <Card className="flex h-full flex-col gap-3">
      <Eyebrow as="h2">Quantity by status</Eyebrow>
      <div className="grid grid-cols-[3.75rem_repeat(3,minmax(0,1fr))] items-baseline gap-x-2 gap-y-3">
        <span />
        {MATRIX_COLUMNS.map((s) => (
          <span key={s} className="flex items-center justify-end gap-1.5 text-10 text-ds-secondary">
            <Dot tone={STATUS_TONE[s]} />
            {STATUS_LABEL[s]}
          </span>
        ))}
        {rows.map((r) => (
          <div key={r.key} className="contents">
            <span className="text-12 text-ds-secondary">{r.label}</span>
            {MATRIX_COLUMNS.map((s) => {
              const cell = matrix[s][r.key];
              const empty = cell.qty === 0 && cell.value === 0;
              return (
                <span key={s} className="flex min-w-0 flex-col items-end">
                  <span className={cx('truncate text-14 font-semibold tabular-nums', empty ? 'text-ds-muted' : 'text-heading')}>
                    {formatQty(cell.qty)}
                  </span>
                  <span className="truncate text-10 tabular-nums text-ds-muted">{formatMoney(cell.value)}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* One step of the bulk flow: marker, what the step is and what it produces,
   and its button. Every step has the same shape, so the two line up exactly.
   The CURRENT step gets the primary button: the card always says which one
   to press next. `connector` draws the line down to the next marker.
 *
 * TWO WIDTHS, one grid. From @sm (384px of container) the button sits at the
 * row's end; below it — a 320px phone — it drops under the text at full width,
 * because a fixed button beside the text left the title "Download sh…".
 * The marker is pinned to the step's TOP in both, which is what lets the
 * connector be one formula for either layout. */
function Step({ number, done, current, title, caption, action, connector = false }) {
  return (
    <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 @sm/entry:grid-cols-[auto_minmax(0,1fr)_auto] @sm/entry:items-center">
      {connector ? (
        /* From 4px under this marker to 4px over the next: the 28px marker
           sits at the top, so the line starts at 28 + 4 = 32px; steps are
           12px apart, so its length is the step − 32 + 12 − 4. */
        <span
          aria-hidden="true"
          className={cx(
            'absolute left-3.5 top-8 h-[calc(100%-var(--space-24))] w-0.5 -translate-x-1/2 rounded-full',
            done ? 'bg-success' : 'bg-line',
          )}
        />
      ) : null}
      <span
        className={cx(
          'relative flex size-7 shrink-0 items-center justify-center rounded-full text-12 font-semibold',
          /* A step not reached yet is an outlined white disc: it sits on the
             sunken tray, where a sunken fill would vanish into it. */
          done ? 'bg-success text-on-brand' : current ? 'bg-brand text-on-brand' : 'border border-line bg-surface text-ds-secondary',
        )}
        aria-hidden="true"
      >
        {done ? <Icon name="check" size="var(--fs-12)" /> : number}
      </span>
      <div className="min-w-0 self-center">
        <p className={cx('truncate text-12 font-semibold', current || done ? 'text-heading' : 'text-ds-secondary')}>{title}</p>
        <p className="truncate text-11 text-ds-muted">{caption}</p>
      </div>
      <div className="col-start-2 @sm/entry:col-start-auto @sm/entry:w-26">{action}</div>
    </div>
  );
}

/* Fill every pending stockist in one spreadsheet instead of one page each.
 *
 * A vertical stepper: two rows joined by a line between their markers, so
 * "download, then upload" reads top to bottom without the words, and fits a
 * phone at full width. Before the download step 1 is current (primary
 * button); after it, step 1 shows a tick and the primary button moves down.
 * The result of an upload lands below, as a status rather than as a toast,
 * so it is still there when the reader looks back. */
function BulkEntryCard({ pendingCount, sheetRows, downloaded, onDownload, onUpload, busy, message }) {
  const task = useTask();
  const inputRef = useRef(null);
  const nothingPending = pendingCount === 0;
  const disabled = nothingPending || busy;

  return (
    <Card className="flex flex-col gap-4">
      {/* Icon, title and count on ONE centre line; the explanation under the
          title only, so the icon tile and the pill sit level with the title
          rather than floating between two lines. */}
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint-weak text-brand-text" aria-hidden="true">
          <Icon name="file-excel" size="md" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-14 font-semibold leading-snug text-heading">Bulk entry via Excel</h2>
          <p className="text-11 leading-snug text-ds-muted">
            {nothingPending ? `Every ${task.party} has figures.` : `All pending ${task.parties}, one sheet.`}
          </p>
        </div>
        <StatusPill status={nothingPending ? 'success' : 'info'} showDot={false} className="shrink-0">
          {nothingPending ? 'All filled' : `${pendingCount} pending`}
        </StatusPill>
      </div>

      <div className="flex flex-col gap-3 rounded-lg bg-sunken p-3">
        <Step
          number="1"
          done={downloaded}
          current={!downloaded}
          connector
          title="Download sheet"
          /* What the sheet holds, in the reader's words: whose figures and
             how many lines to fill (one per stockist × product). */
          caption={`${partyCount(task, pendingCount)} · ${sheetRows} item${sheetRows === 1 ? '' : 's'}`}
          action={
            <Button
              type={downloaded ? 'default' : 'primary'}
              size="default"
              block
              disabled={disabled}
              icon={<Icon name="download" size="sm" />}
              onClick={onDownload}
            >
              {downloaded ? 'Again' : 'Download'}
            </Button>
          }
        />
        <Step
          number="2"
          current={downloaded}
          title="Upload filled sheet"
          caption="Saves as drafts to review"
          action={
            <Button
              type={downloaded ? 'primary' : 'default'}
              size="default"
              block
              loading={busy}
              disabled={disabled}
              icon={<Icon name="upload" size="sm" />}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? 'Saving…' : 'Upload'}
            </Button>
          }
        />
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUpload(file);
          }}
        />
      </div>

      {message ? (
        <p
          role="status"
          className={cx(
            'flex items-start gap-2 rounded-lg px-3 py-2 text-11',
            message.tone === 'danger' ? 'bg-danger-wash text-danger-text' : 'bg-sunken text-ds-secondary',
          )}
        >
          <Icon name={message.tone === 'danger' ? 'exclamation-circle' : 'info-circle'} size="sm" className="mt-px shrink-0" />
          <span>{message.text}</span>
        </p>
      ) : null}
    </Card>
  );
}

export function EntryOverview({
  counts,
  entered,
  matrix,
  entries,
  filter,
  onFilterChange,
  onOpen,
  bulk,
  notice,
  /* Bulk send: { selected: Set, busy, error, onCancel, onToggle(name),
     onSelect(names, 'add' | 'remove'), onSend } — see SecondaryEntry. Null
     when the screen is read-only, which also hides every checkbox. */
  selection,
  /* Gap under the pinned send bar — raise it above an app bottom nav. */
  selectionBarGap,
  /* Server paging: { hasMore, loading, loaded, onReachEnd } — null when the
     whole month is in hand. */
  infinite,
}) {
  const task = useTask();
  const chips = [
    { key: 'draft', label: <span className="inline-flex items-center gap-1.5"><Dot tone="danger" />Draft</span>, count: counts.draft },
    { key: 'pending', label: <span className="inline-flex items-center gap-1.5"><Dot tone="warning" />Pending</span>, count: counts.pending },
    { key: 'approved', label: <span className="inline-flex items-center gap-1.5"><Dot tone="success" />Approved</span>, count: counts.approved },
    ...(counts.revisit
      ? [{ key: 'revisit', label: <span className="inline-flex items-center gap-1.5"><Dot tone="danger" />Revisit</span>, count: counts.revisit }]
      : []),
    ...(counts.rejected
      ? [{ key: 'rejected', label: <span className="inline-flex items-center gap-1.5"><Dot tone="danger" />Rejected</span>, count: counts.rejected }]
      : []),
    { key: 'all', label: 'All', count: counts.all },
  ];

  const listRef = useRef(null);
  const rootRef = useRef(null);
  const [barHeight, setBarHeight] = useState(0);
  const barGap = selectionBarGap ?? 'var(--space-12)';
  const showBar = Boolean(selection && (selection.selected.size > 0 || selection.busy || selection.error));
  const pickedCount = selection?.selected.size ?? 0;
  const visibleEligible = entries.filter(canSubmit);
  const allVisiblePicked = visibleEligible.length > 0 && visibleEligible.every((e) => selection?.selected.has(e.name));
  const drill = (status) => {
    onFilterChange(status);
    listRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-3 @2xl/entry:gap-4">
      {notice ? (
        <div role="status" className="flex items-center gap-2 rounded-lg bg-success-wash px-3 py-2 text-12 font-medium text-success">
          <Icon name="check-circle" size="sm" />
          {notice}
        </div>
      ) : null}

      {/* Two up from @2xl, like /visit's summary band; items-start so the
          shorter card does not stretch half empty. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 @2xl/entry:grid-cols-[repeat(2,minmax(0,1fr))] @2xl/entry:items-start @2xl/entry:gap-4">
        <ProgressCard counts={counts} entered={entered} onDrill={drill} partial={Boolean(infinite?.hasMore)} />
        <ValueCard matrix={matrix} />
      </div>

      {bulk}

      <section ref={listRef} className="flex scroll-mt-4 flex-col gap-2">
        {/* The selection's controls live HERE, at the head of the list they
            act on — the count, Select all for what is in view, Clear. The
            pinned bar underneath keeps only the send. */}
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>{task.Parties}</SectionLabel>
          <span className="flex min-w-0 items-center gap-3 text-11">
            {pickedCount ? (
              <span className="shrink-0 font-semibold text-heading">{pickedCount} selected</span>
            ) : (
              <span className="shrink-0 text-ds-muted">{entries.length} shown</span>
            )}
            {selection && visibleEligible.length && !allVisiblePicked ? (
              <Button type="link" size="sm" onClick={() => selection.onSelect(visibleEligible.map((e) => e.name), 'add')}>
                Select all {visibleEligible.length}
              </Button>
            ) : null}
            {pickedCount ? (
              <Button type="link" size="sm" disabled={selection.busy} onClick={selection.onCancel}>
                Clear
              </Button>
            ) : null}
          </span>
        </div>
        <ChipRow items={chips} value={filter} onChange={onFilterChange} ariaLabel={`Filter ${task.parties} by status`} />
        {entries.length ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 @2xl/entry:grid-cols-[repeat(2,minmax(0,1fr))]">
            {entries.map((e) => (
              <StockistCard
                key={e.name}
                entry={e}
                onOpen={onOpen}
                /* Every card shows the box while the list can send; only what
                   can be sent gets it enabled. */
                showCheckbox={Boolean(selection)}
                selectable={canSubmit(e)}
                selected={Boolean(selection?.selected.has(e.name))}
                onToggle={selection?.onToggle}
              />
            ))}
          </div>
        ) : infinite?.hasMore ? null : (
          <Card variant="hairline" className="py-6 text-center text-12 text-ds-muted">
            Nothing {filter === 'all' ? 'here' : `in ${STATUS_LABEL[filter] ?? filter}`} yet.
          </Card>
        )}
        {infinite ? <ListEnd infinite={infinite} /> : null}
      </section>

      {/* The bar is the selection's own UI: it exists while anything is
          picked (or a send is still reporting back), and not otherwise. */}
      {showBar ? (
        <>
          {/* Room at the end of the list for the pinned bar, so the last card
              can always be scrolled clear of it. */}
          <PinnedBarSpacer height={barHeight} bottomGap={barGap} />
          <SelectionBar
            selection={selection}
            anchorRef={rootRef}
            bottomGap={barGap}
            onHeight={setBarHeight}
          />
        </>
      ) : null}
    </div>
  );
}

/* The end of a server-paged list: a sentinel that asks for the next page as
 * it nears the screen, and a line that says what is happening.
 *
 * `rootMargin` asks BEFORE the sentinel is visible, so the next page is on its
 * way while there is still a screen to scroll. The observer is rebuilt when
 * `loaded` changes, deliberately (useIncrementalList's note): it fires on a
 * CHANGE of intersection, so when a page does not fill the screen the
 * sentinel stays visible, never changes, and loading would stall half a
 * screen short. Nothing is asked while a load is in flight — each load
 * re-queries rows 1..N, so a second one would only repeat the first.
 *
 * The filter chips narrow what is SHOWN, not what is fetched, so the sentinel
 * keeps loading under a filter too: a Draft view of 25 loaded rows can hold
 * none, and only more pages can fill it. */
function ListEnd({ infinite }) {
  const task = useTask();
  const { hasMore, loading, loaded, onReachEnd } = infinite;
  const ref = useRef(null);
  const askRef = useRef(onReachEnd);
  askRef.current = onReachEnd;

  useEffect(() => {
    const node = ref.current;
    if (!node || !hasMore || loading) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (items) => {
        if (items.some((i) => i.isIntersecting)) askRef.current?.();
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loading, loaded]);

  return (
    <div ref={ref} className="flex items-center justify-center gap-2 py-3 text-11 text-ds-muted" aria-live="polite">
      {/* Words, not a spinner: the system ships no looping animation. */}
      {loading ? (
        <span>Loading more {task.parties}…</span>
      ) : hasMore ? (
        /* Reachable without scrolling too: a tap works where the observer
           does not exist, and for anyone who would rather ask. */
        <Button type="link" size="sm" onClick={onReachEnd}>
          Load more
        </Button>
      ) : (
        <span>All {partyCount(task, loaded)} loaded</span>
      )}
    </div>
  );
}

/* The bulk-send bar, pinned to the bottom of the SCREEN while anything is
 * picked. It holds only the send — which asks once, inline, before it
 * writes, since a submission leaves the seat's hands. The count, Select all
 * and Clear are at the head of the list.
 *
 * Pinned to the screen over the list — see PinnedBar for why fixed and
 * portalled rather than sticky. */
function SelectionBar({ selection, anchorRef, bottomGap, onHeight }) {
  const task = useTask();
  const [confirming, setConfirming] = useState(false);
  const count = selection.selected.size;
  useEffect(() => {
    if (!count) setConfirming(false);
  }, [count]);

  return (
    <PinnedBar anchorRef={anchorRef} bottomGap={bottomGap} onHeight={onHeight}>
    <Card className="flex flex-col gap-3 shadow-pop" role="region" aria-label="Send selected for approval">
      {selection.error ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-wash px-3 py-2 text-11 text-danger-text">
          <Icon name="exclamation-circle" size="sm" className="mt-px shrink-0" />
          <span>{selection.error} The ones that failed are still selected — send again to retry.</span>
        </p>
      ) : null}
      {confirming ? (
        <>
          <p className="text-12 text-body">
            Send <span className="font-semibold">{partyCount(task, count)}</span> for approval? They move to
            the approvers and can no longer be edited.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="default" size="lg" block disabled={selection.busy} onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button type="primary" size="lg" block loading={selection.busy} disabled={!count || selection.busy} onClick={selection.onSend}>
              {selection.busy ? 'Sending…' : `Send ${count}`}
            </Button>
          </div>
        </>
      ) : (
        /* Just the send: the count, Select all and Clear sit at the head of
           the list. */
        <Button type="primary" size="lg" block disabled={!count || selection.busy} onClick={() => setConfirming(true)}>
          Send {count} for approval
        </Button>
      )}
    </Card>
    </PinnedBar>
  );
}

EntryOverview.BulkEntryCard = BulkEntryCard;

/* Static placeholders in the final layout's shapes — no pulse, the system
   ships no looping animation. Keeps the page from jumping when rows land. */
export function EntryOverviewSkeleton() {
  const block = 'rounded-md bg-sunken';
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading entries">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 @2xl/entry:grid-cols-[repeat(2,minmax(0,1fr))]">
        {[0, 1].map((i) => (
          <Card key={i} className="flex flex-col gap-3">
            <div className={cx(block, 'h-3 w-24')} />
            <div className={cx(block, 'h-2.5 w-full')} />
            <div className={cx(block, 'h-3 w-2/3')} />
          </Card>
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} variant="hairline" className="flex flex-col gap-2">
          <div className={cx(block, 'h-3 w-40')} />
          <div className={cx(block, 'h-2.5 w-28')} />
        </Card>
      ))}
    </div>
  );
}
