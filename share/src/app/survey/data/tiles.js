/* The survey circles on the home strip — ONE CIRCLE PER SURVEY sent to the
 * person (Ring Nav's tile contract: src/design-system/components/RingNav.jsx),
 * built from survey_my_list (SURVEYS_CONTEXT.md §4). Nobody gets a circle
 * for a survey they were not sent; no survey, no circle.
 *
 *   shown      up to and including the due date (`today` against due_date,
 *              as daysLeft counts it); from the day after, no circle,
 *              whatever its state. A closed survey (missed — closed before
 *              or on its due date) has none either. No due date: shown.
 *              The /survey/<campaign> page still opens by link.
 *
 *   label      the title's first words (shape.shortName); the full title is
 *              in ariaLabel
 *   badge      left to send: a Pre-tag survey's pending rows; a Self-tag one
 *              with nothing added yet counts as 1
 *   caption    the due date — green while on time, "Today" / "Late" in red
 *              when due today or overdue (the tile uppercases it); "Sent" in
 *              green once everything is sent; "Missed" in red for a closed one
 *   ring       the standard Elbrit colours (as the entry and approval
 *              circles): sent in green, left in red, the count in red; all
 *              green once everything is sent; red for a missed survey — no
 *              grey
 *   order      due today / overdue first, then the nearest due date; done
 *              and missed last
 *
 * LATER, ON THE ERP: elbrit_ring_nav.py (the "Elbrit Ring Nav" server
 * script, src/app/ring-nav/server/) should send these same tiles for the
 * caller, by these rules over their Survey Responses, in this order, each
 * linking /survey/<campaign>. Until then the app builds them here. */

import { daysLeft, distinctNames, shortDate, shortName, surveysFromMyList } from './shape';

export const SURVEY_TILE_PREFIX = 'survey-';

/* What a survey still owes: its pending rows, or 1 for an open Self-tag
   survey nobody has been added to yet. */
function owed(s) {
  if (s.state !== 'todo') return 0;
  return s.selfTag && s.total === 0 ? 1 : s.left;
}

/* Sort key: open work first, the most urgent soonest; then done; then missed. */
function rank(s, today) {
  const group = { todo: 0, done: 1, missed: 2 }[s.state] ?? 3;
  const days = daysLeft(today, s.due_date) ?? 9999;
  return [group, s.state === 'todo' && days <= 0 ? 0 : 1, days, s.title];
}
function byRank(today) {
  return (a, b) => {
    const x = rank(a, today);
    const y = rank(b, today);
    for (let i = 0; i < x.length; i += 1) {
      if (x[i] < y[i]) return -1;
      if (x[i] > y[i]) return 1;
    }
    return 0;
  };
}

export function surveyTile(s, today, { hrefBase = '/survey' } = {}) {
  const base = {
    id: `${SURVEY_TILE_PREFIX}${s.campaign}`,
    label: shortName(s.title),
    href: `${hrefBase}/${encodeURIComponent(s.campaign)}`,
    icon: s.kind === 'announcement' ? 'megaphone' : 'comments',
    statusIcon: 'pencil',
  };
  if (s.state === 'missed') {
    return {
      ...base,
      iconTone: 'danger',
      caption: 'Missed',
      captionTone: 'danger',
      statusTone: 'danger',
      segments: [{ key: 'missed', value: 1, tone: 'danger', label: 'Missed' }],
      ariaLabel: `${s.title}, missed — closed ${shortDate(s.due_date)}`,
    };
  }
  const left = owed(s);
  if (left === 0) {
    return {
      ...base,
      iconTone: 'success',
      caption: 'Sent',
      captionTone: 'success',
      statusIcon: 'check-square',
      statusTone: 'success',
      segments: [{ key: 'done', value: 1, tone: 'success', label: 'All sent' }],
      ariaLabel: `${s.title}, all sent`,
    };
  }
  const days = daysLeft(today, s.due_date);
  const late = days != null && days < 0;
  const dueToday = days === 0;
  const urgent = late || dueToday;
  const when = s.due_date ? (late ? 'overdue' : dueToday ? 'due today' : `due ${shortDate(s.due_date)}`) : null;
  return {
    ...base,
    caption: s.due_date ? (late ? 'Late' : dueToday ? 'Today' : shortDate(s.due_date)) : undefined,
    captionTone: urgent ? 'danger' : 'success',
    count: left,
    countTone: 'danger',
    segments: [
      { key: 'sent', value: s.done, tone: 'success', label: 'Submitted' },
      { key: 'left', value: left, tone: 'danger', label: 'Left' },
    ],
    ariaLabel: [s.title, s.selfTag && s.total === 0 ? 'nothing added yet' : `${left} left of ${s.total}`, when].filter(Boolean).join(', '),
  };
}

/* Has a circle today: not closed, and not past its due date. */
export function onStrip(s, today) {
  if (s.state === 'missed') return false;
  const days = daysLeft(today, s.due_date);
  return days == null || days >= 0;
}

/* survey_my_list → the circles, in order. Empty for someone with no survey. */
export function surveyTiles(list, today, options) {
  const shown = surveysFromMyList(list)
    .filter((s) => onStrip(s, today))
    .sort(byRank(today));
  const names = distinctNames(shown.map((s) => s.title)); // 26 Nov 2026: two circles never share a name
  return shown.map((s, i) => ({ ...surveyTile(s, today, options), label: names[i] }));
}

/* The strip with the survey circles in their place: right after the entry
   tiles (Secondary, Support, Expense — on screen without scrolling on a
   390px phone), before the approvals. Any generic "survey" tile goes. */
export function withSurveyTiles(tiles, surveyItems) {
  const list = (tiles ?? []).filter((t) => t.id !== 'survey');
  const lastEntry = list.reduce((at, t, i) => (/-entry$/.test(t.id) ? i : at), -1);
  return [...list.slice(0, lastEntry + 1), ...surveyItems, ...list.slice(lastEntry + 1)];
}
