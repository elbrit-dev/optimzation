'use client';

import { useState } from 'react';
import { Button, Card, Icon, StatusPill, cx } from '@/design-system';
import { shortDate } from '../data/shape';
import { messageHtml } from '../data/view';

/* AN ANNOUNCEMENT — Survey Center's "Tell employees something; each one marks
 * it as read". The ERP's My Surveys reader, in the app: who it is from and
 * how important, the message, its attachment and link, then Mark as read
 * (survey_mark_read). When it asks for it, "I have read and understood" must
 * be ticked first. Read: when; closed unread: said, read-only.
 *
 * The attachment is a PRIVATE file served by survey_announcement_file as the
 * person — so it is fetched with their token (api.openFile) and opened from
 * memory, not linked (a plain link would arrive without the token). */
export function AnnouncementScreen({ survey, api, onChanged }) {
  const row = survey.rows[0] ?? null;
  const A = survey.announcement ?? row?.announcement ?? {};
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [readNow, setReadNow] = useState(null);
  const read = row?.state === 'done' || Boolean(readNow);
  const closed = row?.state === 'missed';
  const html = messageHtml(A.message);
  const link = A.link?.url && /^https?:\/\//i.test(A.link.url) ? A.link : null;

  const markRead = async () => {
    if (!row) return;
    setBusy('read');
    setError(null);
    try {
      const m = await api.markRead(row.response, A.ack && ticked ? 1 : 0);
      setReadNow(m ?? { read_on: null });
      await onChanged?.();
    } catch (e) {
      setError(e?.message || 'Could not save. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const openFile = async () => {
    setBusy('file');
    setError(null);
    try {
      await api.openFile(A.attachment.url, A.attachment.name);
    } catch (e) {
      setError(e?.message || 'Could not open the attachment.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {A.priority === 'Important' ? (
            <StatusPill status="danger" className="gap-1">
              <Icon name="exclamation-circle" size="var(--fs-10)" />
              Important
            </StatusPill>
          ) : (
            <StatusPill status="brand" className="gap-1">
              <Icon name="megaphone" size="var(--fs-10)" />
              Announcement
            </StatusPill>
          )}
          <span className="text-11 text-ds-muted">from {survey.from || 'Head office'}</span>
        </div>
        {html ? (
          <div
            className={cx(
              'break-words text-13 leading-relaxed text-ds-secondary',
              '[&_h3]:mb-1 [&_h3]:text-14 [&_h3]:font-semibold [&_h3]:text-heading [&_h4]:mb-1 [&_h4]:font-semibold [&_h4]:text-heading [&_h5]:mb-1 [&_h5]:font-semibold',
              '[&_p]:mb-2 [&_b]:font-semibold [&_b]:text-heading [&_strong]:font-semibold [&_a]:text-brand-text [&_a]:underline',
              '[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&>:last-child]:mb-0',
            )}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-12 text-ds-muted">No message.</p>
        )}
        {A.attachment?.url || link ? (
          <div className="flex flex-wrap gap-2 border-t border-line-subtle pt-3">
            {A.attachment?.url ? (
              <Button type="default" size="sm" loading={busy === 'file'} icon={<Icon name="paperclip" size="sm" />} onClick={openFile}>
                {A.attachment.name || 'Attachment'}
              </Button>
            ) : null}
            {link ? (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-12 font-medium text-brand-text hover:border-line-strong"
              >
                {link.label || 'Open link'}
                <Icon name="external-link" size="var(--fs-10)" />
              </a>
            ) : null}
          </div>
        ) : null}
      </Card>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-wash px-3 py-2 text-12 text-danger-text">
          <Icon name="exclamation-circle" size="sm" className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      {read ? (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-wash px-3 py-2 text-12 font-medium text-success">
          <Icon name="check-circle" size="sm" />
          Read{(readNow?.read_on || row?.read_on) ? ` on ${shortDate(readNow?.read_on || row?.read_on)}` : ''}
          {A.ack && (readNow?.acknowledged || row?.acknowledged) ? ' · acknowledged' : ''}
        </p>
      ) : closed ? (
        <p role="note" className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-12 text-ds-secondary">
          <Icon name="lock" size="sm" className="shrink-0" />
          Closed{survey.due_date ? ` ${shortDate(survey.due_date)}` : ''} · not read
        </p>
      ) : row ? (
        <Card className="flex flex-col gap-2">
          {A.ack ? (
            <label className="flex items-center gap-2 text-12 text-heading">
              <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="size-4 accent-brand" />
              I have read and understood
            </label>
          ) : null}
          <Button type="primary" size="lg" block loading={busy === 'read'} disabled={Boolean(busy) || (A.ack && !ticked)} icon={<Icon name="check" size="sm" />} onClick={markRead}>
            Mark as read
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
