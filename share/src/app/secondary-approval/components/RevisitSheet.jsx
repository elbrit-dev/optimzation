'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Sheet } from '@/design-system';
import { partyCount, useTask } from '@/app/secondary-entry/data/task';

/* Send a whole submission back for revisit: one reason for every stockist in
 * it that waits on the viewer. A revisit keeps the approval open — the BE
 * corrects and it comes straight back to the viewer — and the ERP requires
 * the reason, so the button stays off until there is one. */
export function RevisitSheet({ open, onClose, onConfirm, count, raiserName, busy, error }) {
  const task = useTask();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const ok = reason.trim().length > 0;
  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title={`Send ${partyCount(task, count)} back for revisit?`}
      subtitle={raiserName ? `${raiserName} corrects them, and they come back to you to approve.` : undefined}
      surface="app"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok && !busy) onConfirm(reason.trim());
        }}
      >
        <Field
          size="app"
          label="Reason for revisit"
          placeholder="What should be corrected…"
          value={reason}
          onChange={setReason}
          disabled={busy}
          autoFocus
        />
        {error ? (
          <p role="alert" className="text-12 text-danger-text">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="default" size="app" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="primary" size="app" danger htmlType="submit" loading={busy} disabled={!ok}>
            Send back
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
