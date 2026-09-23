'use client';

import { Avatar, cx } from '@/design-system';
import { hqLabel } from '../data/format';
import { Chevron, PinIcon } from './icons';

/* The doctor, as a card: initials, name, code, territory.
 *
 * ADAPTED TO THE DESIGN SYSTEM, NOT PASTED. The reference markup was written
 * against stock Tailwind — `bg-white`, `border-gray-100`, `text-indigo-600`,
 * `bg-emerald-100`, `text-[15px]`, `text-[#1e2a5a]`. None of those compile
 * here: `tailwind-strict.css` deletes the stock palette and the off-scale
 * steps on purpose, so a non-token utility emits NO RULE AT ALL rather than
 * failing loudly (the same silent failure `text-disabled` once had). Pasted
 * verbatim this card would have rendered as unstyled text on no background.
 *
 * The mapping, kept here so the next person does not have to re-derive it:
 *
 *   bg-white / border-gray-100   -> bg-surface / border-line-subtle
 *   text-[#1e2a5a] (navy)        -> text-heading
 *   text-gray-500 / -400         -> text-ds-secondary / text-ds-muted
 *   text-[15px] / text-[11px]    -> text-14 / text-11   (nearest DS steps)
 *   rounded-2xl                  -> rounded-lg
 *   shadow-sm -> shadow-lg       -> shadow-card -> shadow-pop
 *   ring-indigo-200              -> the DS focus ring
 *   hover:border-indigo-200      -> border-brand
 *   bg-emerald-100 avatar        -> Avatar's own categorical ramp
 *
 * THE AVATAR TINT IS NOT GREEN. The reference used emerald, and this screen
 * spends its whole vocabulary on green = geo-verified, red = force visit. A
 * green circle beside a doctor's name would read as a status they do not
 * have. DS Avatar derives its colour from the name off the CATEGORICAL ramp
 * for exactly this reason — "a person is not a state".
 *
 * The division chip ("CND Trichy") is dropped, as asked. The CP badge and the
 * sub-locality line from the reference are not rendered either: a VisitRow
 * carries doctorId, doctorName and hq, and nothing on this screen knows a
 * doctor's category or town. Inventing a placeholder for them would be worse
 * than leaving the space clean — see `note` for the slot that IS filled.
 *
 * NO INTERACTIVE CHILDREN. This renders inside DisclosureRow's header, which
 * IS a <button>; a copy button nested in it would be a button inside a
 * button, which browsers resolve by silently dropping one. Anything
 * pressable belongs in DisclosureRow's `action` slot instead. */

/* "Dr Sabesan" -> "Sabesan", so the avatar reads S and not DS. Avatar takes
   first + last initial, which is right for a person and wrong for a name that
   carries a title: every doctor on this screen would start with D. Stripped
   only for the INITIALS -- the visible name keeps its salutation. */
function withoutSalutation(name) {
  return String(name ?? '').replace(/^\s*(dr|prof|mr|mrs|ms)\.?\s+/i, '');
}

/* WHO WENT AND HOW IT WENT, in one control. One segment per attendee,
 * labelled with their rung and tinted by their own geo outcome:
 *
 *     [ BE | ABM ]      green BE, red ABM  =  the rep was at the clinic,
 *                                             the manager logged from the road
 *
 * This replaced "2 attended · 1 forced", which needed two counts to say less:
 * it told you a call was mixed but not WHICH of the two people was the
 * problem, and that is the only thing anyone opens a joint call to find out.
 *
 * Segments share one border and one radius so the group reads as a single
 * object — a row of separate chips would read as tags on the doctor, not as
 * a breakdown of one call.
 *
 * Roles repeat when two people share a rung (two BEs on one call is real),
 * which is honest: the segment count is the attendee count. */
const ROLE_TONE = {
  success: 'bg-success-wash text-success',
  danger: 'bg-danger-wash text-danger',
  neutral: 'bg-sunken text-ds-muted',
};

function RoleGroup({ roles }) {
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-chip border border-line-subtle">
      {roles.map((r, i) => (
        <span
          key={`${r.label}-${i}`}
          /* Hairline BETWEEN segments only, so the group keeps one outline. */
          className={cx(
            'px-1.5 py-0.5 text-10 font-semibold uppercase leading-none',
            i > 0 && 'border-l border-line-subtle',
            ROLE_TONE[r.tone] ?? ROLE_TONE.neutral,
          )}
          /* The colour is the whole message, so it needs words too — a
             red/green distinction is invisible to a screen reader and to
             about one man in twelve. */
          title={`${r.label}: ${r.status}`}
        >
          <span className="ds-visually-hidden">{`${r.label} ${r.status}. `}</span>
          <span aria-hidden="true">{r.label}</span>
        </span>
      ))}
    </span>
  );
}

/* The expand affordance. A chevron that ROTATES rather than swapping glyph,
   so the open and closed states are the same shape at two angles and the
   transition carries the eye between them — a ▸/▾ swap is two symbols the
   reader has to learn.

   It sits ON the attendee count, not in a column of its own: "3 attended ⌄"
   says what opening will show, which a caret parked at the far left of the
   card does not. That also gives the card back the ~24px DisclosureRow's own
   marker column was taking (see .ds-card-row in components.css). */
/* A location pin, inline rather than an icon dependency: this is the only
   glyph the card needs and the DS ships no icon set. `aria-hidden` because
   the territory it sits beside already says what it means. */
export function DoctorCard({
  name,
  code,
  hq,
  city,
  specialty,
  categories = [],
  note,
  roles = [],
  trailing,
  expandable = false,
  expanded = false,
  className,
}) {
  /* The town is usually the territory's town, so printing both gives
     "Coimbatore / Coimbatore" on most cards — a stutter that reads as a
     rendering fault. Shown only when it actually adds a place: a doctor in
     Gobi under HQ-Erode, which is the case the line is FOR. */
  const territory = hqLabel(hq);
  const showCity = Boolean(city) && city.trim().toLowerCase() !== territory.trim().toLowerCase();

  return (
    <span className={cx('flex w-full flex-col gap-1.5', className)}>
      {/* ROW 1 — WHO. Avatar, name, practice, grades on the left; the facts
          that identify the doctor on the right. */}
      <span className="flex w-full items-start gap-3">
      {/* DECORATIVE HERE. Avatar carries its own visually-hidden label so it
          can stand alone elsewhere; beside the name it depicts that makes a
          screen reader announce "Dr One Dr One". The initials add nothing a
          reader cannot already see, so the whole thing is hidden from the
          accessibility tree and the heading below is the name. */}
      <Avatar name={withoutSalutation(name)} size="md" aria-hidden="true" />

      <span className="flex min-w-0 flex-1 items-start justify-between gap-3">
        {/* ONE STACK, ONE GAP. This column was a pile of mt-1 / mt-0.5
            margins, which is why the badge sat further from the name than the
            grades sat from the badge — the rhythm changed line by line. */}
        <span className="flex min-w-0 flex-col items-start gap-1">
          <span className="block w-full truncate text-14 font-semibold text-heading">{name}</span>

          {/* PRACTICE AND GRADES SHARE A LINE. They are both answers to "what
              kind of doctor is this", so stacking them spent two of the
              card's four lines on one question and pushed the call's own
              facts further from the name.

              THE BADGE DOES NOT SHRINK, the grades do. A specialty is a whole
              word and "NEPH…" is not a specialty; the grades are a list that
              degrades honestly by dropping its tail. `min-w-0` on the row is
              what lets that truncation engage at all — without it the grades
              keep their intrinsic width and push the card wide, which is the
              same trap the right rail fell into. */}
          {specialty || categories.length ? (
            <span className="flex w-full min-w-0 items-center gap-2">
              {/* THE SPECIALTY IS THE BADGE — what the doctor practises
                  (CARDIO, ORTHO, CP). The reference design's "CP" is a
                  Specialty record, which is what settled this against the
                  commercial category.

                  BRAND TINT, NOT GREEN: the reference used emerald, and on
                  this screen green already means geo-verified — a green badge
                  beside a doctor's name would read as a status they do not
                  have.

                  NEVER TRUNCATED. A specialty is a whole word and "GASTRO
                  SURG…" is not one — the reader is scanning for CARDIO or
                  ORTHO, and a clipped one is worse than none. The grades
                  beside it give way instead: they are a list, and a list
                  degrades honestly by dropping its tail. */}
              {specialty ? (
                <span className="shrink-0 whitespace-nowrap rounded-chip bg-brand-tint-weak px-2 py-0.5 text-10 font-semibold uppercase tracking-wide text-brand-text">
                  {specialty}
                </span>
              ) : null}

              {/* The commercial grades, joined — "C · LILR · EC10". FOUR
                  separate ERPNext fields on four different scales (grade,
                  value/reach band, focus bucket, campaign), which is why they
                  read as one tag rather than four chips: they are not
                  alternatives to choose between, they are one classification
                  spelled across four columns.

                  Quieter than the specialty on purpose. A rep looking down
                  this list is finding a doctor, and the practice identifies
                  them; the grades are why the call is worth making, which is
                  the second question. Not uppercased — these are already
                  codes, and "A&P FOCUS 20" is not improved by shouting. */}
              {categories.length ? (
                <span className="min-w-0 truncate rounded-chip bg-sunken px-2 py-0.5 text-10 tabular-nums text-ds-secondary">
                  {categories.join(' · ')}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>

        {/* Right rail: what identifies the DOCTOR, coarse to fine — code,
            then territory, then town. The call's own facts stay on the left
            under the name, so the two never interleave.

            `min-w-0`, NOT `shrink-0`. Pinned to its content width the rail
            pushed the card wider than the sheet and the codes were clipped
            against the frame — "DR-79419" arriving as "DR-9". It may now
            shrink and truncate like the name does; `max-w-[45%]` stops it
            doing so before the name has given up any width of its own.

            EVERY CHILD CARRIES `w-full`, AND THE COLUMN DOES NOT SET
            `items-end`. That pair is the actual fix for the clipped codes,
            and it is not obvious: `items-end` makes each child shrink-to-fit
            its own text, and a shrink-to-fit box with `white-space: nowrap`
            has nothing to truncate AGAINST — so `truncate` silently did
            nothing and "DR-79419" kept its full width however narrow the
            sheet got. `min-w-0` let the RAIL shrink but never its children,
            so the text overflowed the card and was clipped by the sheet's
            own `overflow: hidden`. Alignment comes from `text-right` on the
            column instead, which right-aligns text inside a full-width box
            rather than shrinking the box around the text.

            The status pill is NOT in this rail for the same family of
            reason: a pill cannot truncate at all, so it held the column
            open at its own width. It lives on the row below, which is also
            where it belongs — it is a fact about the CALL, not the doctor. */}
        <span className="flex min-w-0 max-w-[45%] flex-col gap-0.5 text-right">
          {code ? (
            <span className="block w-full truncate text-11 tabular-nums text-ds-secondary">{code}</span>
          ) : null}
          {/* ONE LINE, ONE PIN: "Erode · Gobi". The town is the same fact at
              finer grain, so stacking it cost the card a whole line to repeat
              a place the reader had just read — and a second line under the
              pin looked like a second location rather than a narrowing of the
              first. Dropped entirely when it only echoes the territory. */}
          {territory ? (
            <span className="flex w-full min-w-0 items-center justify-end gap-1 text-11 text-ds-muted">
              <PinIcon />
              <span className="min-w-0 truncate">
                {showCity ? `${territory} · ${city}` : territory}
              </span>
            </span>
          ) : null}
          </span>
        </span>
      </span>

      {/* ROW 2 — WHAT HAPPENED. The call's own facts and its status, on one
          baseline across the full width.

          The status pill sits HERE rather than in the identity rail above for
          two reasons, and the second one is a bug: it is a fact about the
          call and not about the doctor, and a pill cannot truncate, so in a
          column with a max-width it simply overflowed and took the card past
          the edge of the sheet with it.

          Indented to clear the avatar so the two rows read as one block
          rather than as a card with a caption bolted underneath. */}
      {note || roles.length || trailing ? (
        <span className="flex w-full items-center justify-between gap-3 pl-[calc(var(--ds-avatar-md)+var(--space-12))]">
          <span className="flex min-w-0 items-center gap-2 text-11 text-ds-muted">
            <span className="min-w-0 truncate">{note}</span>
            {roles.length ? <RoleGroup roles={roles} /> : null}
            {expandable ? <Chevron open={expanded} /> : null}
          </span>
          {/* shrink-0 is safe now: it is the last thing on a row of its own,
              and the text beside it is what gives way. */}
          {trailing ? <span className="shrink-0">{trailing}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
