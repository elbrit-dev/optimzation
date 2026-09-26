'use client';

import { Button, Card, Icon } from '@/design-system';
import { PinnedBar } from '@/app/secondary-entry/components/PinnedBar';

/* The submission's decision, pinned to the bottom of the screen on
 * Secondary Entry's PinnedBar (fixed and portalled — see there for why not
 * sticky), so it stays in reach however long the stockist list runs.
 *
 * TWO STATES. Nothing picked on the stockist cards: decide the whole
 * submission in one go. Anything picked: say what will go, offer the rest as
 * approvals, and send exactly those choices. */
export function DecisionBar({
  submission: g,
  choices,
  busy,
  error,
  anchorRef,
  bottomGap,
  onHeight,
  onApprove,
  onRevisit,
  onApproveRest,
  onClearChoices,
  onSendChoices,
}) {
  const partlyMine = g.mine.length < g.counts.pending;
  /* Picks on this person's stockists — approvals are only ever on waiting
     ones, revisits also on ones already approved. */
  const picked = g.revisitable.filter((n) => choices.has(n));
  const toApprove = picked.filter((n) => choices.get(n).action === 'approve').length;
  const toRevisit = picked.length - toApprove;
  const missingReason = picked.some((n) => choices.get(n).action === 'revisit' && !choices.get(n).reason?.trim());
  const undecided = g.mine.filter((n) => !choices.has(n)).length;

  return (
    <PinnedBar anchorRef={anchorRef} bottomGap={bottomGap} onHeight={onHeight}>
      <Card className="flex flex-col gap-2.5 shadow-pop" role="region" aria-label="Decide this submission">
        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-wash px-3 py-2 text-11 text-danger-text">
            <Icon name="exclamation-circle" size="sm" className="mt-px shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
        {picked.length ? (
          <>
            <div className="flex items-baseline justify-between gap-3 text-12">
              <span className="text-heading">
                <span className="font-semibold">{toApprove}</span> to approve · <span className="font-semibold">{toRevisit}</span> to revisit
              </span>
              <span className="flex items-center gap-3">
                {undecided ? (
                  <Button type="link" size="sm" onClick={onApproveRest} disabled={Boolean(busy)}>
                    Approve other {undecided}
                  </Button>
                ) : null}
                <Button type="link" size="sm" onClick={onClearChoices} disabled={Boolean(busy)}>
                  Clear
                </Button>
              </span>
            </div>
            <Button type="primary" size="lg" block loading={busy === 'choices'} disabled={missingReason || Boolean(busy)} onClick={onSendChoices}>
              {missingReason ? 'Add a reason to each revisit' : `Send ${picked.length} decision${picked.length === 1 ? '' : 's'}`}
            </Button>
            {undecided ? <p className="text-10 text-ds-muted">{undecided} not decided yet — they stay pending.</p> : null}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button type="default" size="lg" danger block loading={busy === 'revisit'} disabled={Boolean(busy) || !g.mine.length} onClick={onRevisit}>
                Revisit all{partlyMine ? ` ${g.mine.length}` : ''}
              </Button>
              <Button type="primary" size="lg" block loading={busy === 'approve'} disabled={Boolean(busy) || !g.mine.length} onClick={onApprove}>
                Approve all{partlyMine ? ` ${g.mine.length}` : ''}
              </Button>
            </div>
            {partlyMine ? (
              <p className="text-10 text-ds-muted">
                {g.counts.pending - g.mine.length} wait on someone else and are left as they are.
              </p>
            ) : null}
          </>
        )}
      </Card>
    </PinnedBar>
  );
}
