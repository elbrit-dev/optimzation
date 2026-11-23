'use client';

import { Card, cx } from '@/design-system';
import { viewHtml } from '../data/view';

/* The survey's VIEW above the questions — why the survey is, and the
 * record it is about, with this row's values (data/view.js cleans the HTML
 * and escapes every value). Kept small: it scrolls inside its card past a
 * few lines, so the questions stay in sight. Nothing when there is no View. */
export function SurveyView({ survey, row, className }) {
  const html = viewHtml(survey, row);
  if (!html) return null;
  return (
    <Card variant="hairline" className={cx('py-3', className)} aria-label="About this survey">
      <div
        className={cx(
          /* whitespace-normal: the page around it keeps line breaks (pre-wrap), which turned the breaks inside
             the View's HTML into blank lines between every line */
          'max-h-40 overflow-y-auto whitespace-normal break-words text-13 leading-normal text-ds-secondary',
          '[&_.vw-na]:italic [&_.vw-na]:text-ds-muted',
          '[&_h1]:mb-1 [&_h1]:text-14 [&_h1]:font-semibold [&_h1]:text-heading [&_h2]:mb-1 [&_h2]:text-14 [&_h2]:font-semibold [&_h2]:text-heading',
          '[&_h3]:mb-1 [&_h3]:text-13 [&_h3]:font-semibold [&_h3]:text-heading [&_h4]:mb-1 [&_h4]:font-semibold [&_h4]:text-heading',
          '[&_p]:mb-1 [&_b]:font-semibold [&_b]:text-heading [&_strong]:font-semibold [&_strong]:text-heading [&_a]:text-brand-text [&_a]:underline',
          '[&_ul]:mb-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mb-1 [&_ol]:list-decimal [&_ol]:pl-4',
          '[&_table]:mb-1 [&_table]:w-full [&_table]:border-collapse [&_table]:text-12 [&_td]:border [&_td]:border-line [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:border [&_th]:border-line [&_th]:bg-sunken [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:text-left',
          '[&>:last-child]:mb-0',
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Card>
  );
}
