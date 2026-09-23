'use client';

import { Card, Eyebrow, LegendChip, StackedBar } from '@/design-system';
import { ATTENDANCE, ATTENDANCE_LABEL, ATTENDANCE_TONE } from '../data/shape';

/* Who is in the field, as one bar and four chips.
 *
 * The bar and the chips read the SAME counts object — they cannot disagree.
 * That sounds obvious and is the specific thing the reference dashboard gets
 * wrong by hardcoding both.
 *
 * The headline denominator excludes vacancies (see attendance() in
 * selectors.js), while the bar includes them as a grey tail. Both are correct
 * for different questions: "how many of my people turned up" versus "how much
 * of my territory is covered at all".
 *
 * Every chip is tappable even at zero. A category that disappears when it is
 * empty makes "Not reporting" look like a state that only exists on bad days,
 * and moves the other three chips under the reader's thumb. */

export function AttendanceCard({ counts, working, inScope, overlapping = false, period, onDrill }) {
  /* ATTENDANCE FOLLOWS THE PERIOD now, so the heading no longer has to
     disown the figures beside it. It used to read "Who is working today"
     over a month's KPIs, because the counts underneath were today's — two
     true numbers that read as a contradiction. Over a range these are the
     people who reported at some point in it, and the header above the card
     already names which range. */
  const heading = period === 'month' ? 'Who has reported' : 'Who has reported today';

  return (
    /* `h-full` so this card FILLS the summary band rather than setting its
       height. Its content came to 106px against the KPI cards' 99, which made
       the band read as one big card beside four small ones. The gaps below
       bring it under theirs and the stretch does the last pixel — so the five
       stay level even if a KPI card grows a line later. */
    <Card className="h-full">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow as="h3">{heading}</Eyebrow>
        <span className="shrink-0 text-13 font-semibold tabular-nums text-heading">
          {working} of {inScope} reported
        </span>
      </div>

      {/* WHAT THE BAR MEANS DEPENDS ON THE PERIOD, and the one thing it is
          not allowed to do is disappear — a card that drops its picture when
          the reader switches to a month reads as broken, which is exactly how
          it was reported.

          On a single day the four states partition the roster, so the bar is
          a true parts-of-a-whole: each segment is its share of the team.

          Over a range they no longer do. The states are day based, so a rep
          who worked twelve days and went silent on six is counted under
          Reported AND under Not reported, and the four counts sum to more
          than the headcount. The bar then shows the states' RELATIVE SIZES —
          "mostly reported, a sliver absent" — which is still the shape worth
          seeing, and the chips beneath carry the exact figures either way.
          The distortion is bounded by the overlap, which in practice is
          small; `overlapping` is passed down so the caption can say so rather
          than leaving the reader to assume the segments add to 100%.

          mt-2, and the legend row takes no margin at all: the chips already
          carry 8px of their own block padding for the tap target (see
          LegendChip), so a margin under the bar reads as 12px of air on top
          of that and was most of what made this card the odd one out. */}
      <div className="mt-2">
        <StackedBar
          size="lg"
          label={ATTENDANCE.map((k) => `${ATTENDANCE_LABEL[k]}: ${counts[k]}`).join(', ')}
          segments={ATTENDANCE.map((k) => ({
            key: k,
            value: counts[k],
            tone: ATTENDANCE_TONE[k],
            label: ATTENDANCE_LABEL[k],
          }))}
        />
      </div>

      <div className="ds-legend-row">
        <div className="ds-legend-row__inner">
          {ATTENDANCE.map((k) => (
            <LegendChip
              key={k}
              label={ATTENDANCE_LABEL[k]}
              value={counts[k]}
              tone={ATTENDANCE_TONE[k]}
              onClick={onDrill ? () => onDrill(k) : undefined}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
