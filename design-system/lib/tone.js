/* The ONE tone vocabulary, shared by every component that colours something by
   meaning — StatusPill, ProgressBar, StackedBar, LegendChip, Metric.
 *
 * TWO NAMES FOR EACH TONE, ON PURPOSE, RESOLVED HERE.
 * StatusPill shipped first and speaks document states: approved / pending /
 * rejected / draft / info. The quantitative primitives speak outcomes:
 * success / warning / danger / neutral / brand. Neither set reads naturally in
 * the other's context — "a draft progress bar" and "an approved bar segment"
 * are both nonsense — so both are kept and both resolve to the same pair of
 * tokens. What is NOT kept is two maps: a second private copy inside one
 * component is exactly how a green drifts from a green.
 *
 * TWO TOKENS PER TONE, NOT ONE. The palette's saturated status colours are
 * FILLS: green measures 2.28:1 on white and amber 1.93:1, so a bar segment can
 * be `--status-approved` but the label beside it cannot. `toneFill` is what a
 * bar, a dot or a wash gets; `toneText` is what a word gets.
 *
 * `neutral` is the right default for a value with no judgement attached. Do
 * not reach for success/danger to mean "big"/"small". */

const CANONICAL = {
  brand: 'brand',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: 'neutral',
  /* StatusPill's vocabulary, aliased. Without these a caller passing
     `tone="approved"` fell through to neutral in silence — a grey bar where a
     green one was asked for, with nothing to debug. */
  info: 'brand',
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
  draft: 'neutral',
};

const FILL = {
  brand: 'var(--brand-primary)',
  success: 'var(--status-approved)',
  warning: 'var(--status-pending)',
  danger: 'var(--status-rejected)',
  neutral: 'var(--status-draft)',
};

const TEXT = {
  brand: 'var(--brand-text)',
  success: 'var(--status-approved-text)',
  warning: 'var(--status-pending-text)',
  danger: 'var(--status-rejected-text)',
  neutral: 'var(--status-draft-text)',
};

/* The outcome names only — the aliases are accepted, not advertised. */
export const TONES = ['brand', 'success', 'warning', 'danger', 'neutral'];

export function resolveTone(tone) {
  return CANONICAL[tone] ?? 'neutral';
}

export function toneFill(tone) {
  return FILL[resolveTone(tone)];
}

export function toneText(tone) {
  return TEXT[resolveTone(tone)];
}
