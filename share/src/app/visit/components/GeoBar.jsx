'use client';

import { LegendChip, StackedBar } from '@/design-system';
import { VISIT_STATUS_LABEL } from '../data/shape';

/* A plan, taken apart: how much was verified, how much forced, how much is
 * still pending — and, in the legend, how much of each was a JOINT call.
 *
 * ONE COMPONENT, because this is the screen's core picture and it appears on
 * three different rows — an HQ card, a tree node, a rep in the attendance
 * sheet. Three copies of "which segment is which colour, in which order,
 * under what words" is how the same plan ends up reading two ways depending
 * on where the reader found it.
 *
 * ONE TRACK, THREE SEGMENTS:
 *
 *   [========verified========|==force==|=pending=]
 *   ● Geo verified 10 Joint / 100   ● Force visit 3   ● Pending 7
 *
 * JOINT IS A FOOTNOTE, NOT A SERIES. It went through a second full-width bar
 * and, before that, six segments in one — and both failed for the same
 * reason: a bar answers "how big is this next to that", and solo-versus-joint
 * is not that question. It is a qualifier on a figure the reader has already
 * taken in, so it belongs in the figure. A 4px track cannot carry six
 * segments either; at that size a washed colour is indistinguishable from its
 * solid, and the three blocks stop being three blocks.
 *
 * IT IS STILL WORTH SAYING. A joint call is a manager's day as much as a
 * rep's, and 21% of the plan is joint (see shape.js) — a territory whose
 * verified column is mostly joint is a territory being carried, and the
 * totals alone cannot say that.
 *
 * DRAWN ONLY WHEN THERE IS SOMETHING TO DRAW. An empty track under three
 * zeros is furniture: it says "no data" in the visual language of "all
 * pending", which is a different fact.
 *
 * `pending` is derived here rather than passed, so the three states always
 * sum to the plan. A caller computing its own remainder is a caller that can
 * get it wrong. */

const STATES = [
  ['verified', 'success'],
  ['force', 'danger'],
  ['pending', 'neutral'],
];

export function GeoBar({
  planned,
  happened,
  verified,
  force,
  jointVerified = 0,
  jointForce = 0,
  jointPending = 0,
  size = 'sm',
}) {
  const pending = Math.max(planned - happened, 0);
  if (planned === 0 && happened === 0) return null;

  const total = { verified, force, pending };
  /* Clamped because the totals and the joint counts come from the same pass
     but `pending` is derived from planned - happened. A plan edited after the
     fact can leave those out of step, and "12 Joint / 7" is a subset larger
     than the set it belongs to. */
  const joint = {
    verified: Math.min(jointVerified, verified),
    force: Math.min(jointForce, force),
    pending: Math.min(jointPending, pending),
  };

  return (
    <>
      <StackedBar
        size={size}
        label={`${verified} geo verified, ${force} force visit, ${pending} pending`}
        segments={STATES.map(([key, tone]) => ({
          key,
          value: total[key],
          tone,
          label: VISIT_STATUS_LABEL[key],
        }))}
      />

      {/* SCROLLS WHEN IT HAS TO. "10 Joint / 100" is three times the width of
          "100", and three of those do not fit across a tree row at depth
          three — where the chips previously shrank into each other and the
          counts ran together. `.ds-scroll-x` is the DS's own horizontal strip:
          the bar is hidden, because a scrollbar under 15px chips reads as a
          rendering fault, and the cut-off last chip is the signal instead.

          `justify-between` still spreads them when they DO fit, which is the
          common case; it simply has no effect once the row overflows. The
          chips never shrink — a compressed legend is unreadable in a way a
          scrolled one is not.

          `aria-hidden` because the bar above already says all of it in words:
          without it a screen reader hears every count twice. */}
      <div className="ds-scroll-x flex items-center justify-between gap-3" aria-hidden="true">
        {STATES.map(([key, tone]) => (
          <LegendChip
            key={key}
            size="sm"
            tone={tone}
            className="shrink-0"
            label={VISIT_STATUS_LABEL[key]}
            /* THE JOINT COUNT RIDES IN THE VALUE — "10 Joint / 100" — rather
               than in a second bar under the first.
             *
               A bar answers "how big is this next to that", and joint-vs-solo
               is not that question: it is a footnote on a figure the reader
               has already taken in. Given its own track it doubled the card's
               height, and every attempt to distinguish the two halves inside
               ONE track failed the same way — a 4px bar cannot carry six
               segments, and a washed colour at that size is indistinguishable
               from its solid.

               Only when there are any. "0 Joint / 100" is three extra words
               to say nothing happened, on the common case. */
            value={joint[key] > 0 ? `${joint[key]} Joint / ${total[key]}` : total[key]}
          />
        ))}
      </div>
    </>
  );
}
