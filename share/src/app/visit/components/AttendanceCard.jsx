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

export function AttendanceCard({ counts, working, inScope, period, onDrill }) {
  /* Attendance is a TODAY fact even inside the month view — it reads
     the roster and the leave calendar as they stand right now, not as they
     were averaged over five days. The label says so rather than letting
     "Who is working today" sit above month figures and imply otherwise. */
  const heading = period === 'month' ? 'Who is working right now' : 'Who is working today';

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
          {working} of {inScope} in field
        </span>
      </div>

      {/* mt-2, and the legend row takes no margin at all: the chips already
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
