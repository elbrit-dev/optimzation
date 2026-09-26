'use client';

/* Dev harness for the INPUT CLUSTER: InputText, InputNumber and Calendar.
 *
 * WHY THESE THREE TOGETHER
 * Calendar and InputNumber each render an InputText internally, and we cannot
 * set `unstyled` on an instance we do not construct. So registering `inputtext`
 * globally while those two are still lara-themed would layer design-system
 * classes on top of the theme rather than replacing it. They have to migrate as
 * one unit — structural rule B in docs/PRIMEREACT_SWEEP.md.
 *
 * WHY A HARNESS
 * The Calendar PANEL — 40-odd sections: header, month/year pickers, the day
 * grid, today/selected/other-month states, the button bar — appears in no
 * baseline anywhere, because it only exists while the calendar is open. The
 * only Calendar in the product is the table's date-range filter. Migrating it
 * blind would have been a rewrite of ~40 sections with nothing checking any of
 * them.
 *
 * Baselined BEFORE the migration so the diff afterwards means something.
 * Static values, no network, no auth. Deliberately NOT wrapped in
 * ProtectedRoute.
 */

import { useState } from 'react';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';

/* A fixed date, so the day grid and the "today" highlight do not move between
   runs. Without this the screenshot would change every midnight. */
const FIXED = new Date(2026, 0, 15);

function Row({ label, children }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-40 shrink-0 type-app-label text-ds-secondary">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export default function InputsDevHarness() {
  const [text, setText] = useState('Typed value');
  const [num, setNum] = useState(1234.5);
  const [date, setDate] = useState(FIXED);

  return (
    <div data-surface="console" className="min-h-screen bg-page">
      <main className="mx-auto flex max-w-[1600px] flex-col gap-8 px-4 py-8">
        <header>
          <h1 className="type-doc-head text-heading">Input cluster harness</h1>
          <p className="type-app-body text-ds-secondary">
            InputText, InputNumber and Calendar — including the calendar panel,
            which exists in no other baseline.
          </p>
        </header>

        <section className="flex flex-col gap-3" data-testid="inputs-text">
          <h2 className="type-app-label text-heading">InputText</h2>
          <Row label="default / placeholder">
            <InputText unstyled value={text} onChange={(e) => setText(e.target.value)} />
            <InputText unstyled placeholder="Placeholder…" />
          </Row>
          <Row label="disabled / invalid">
            <InputText unstyled value="Disabled" disabled />
            <InputText unstyled value="Invalid" className="p-invalid" />
          </Row>
        </section>

        <section className="flex flex-col gap-3" data-testid="inputs-number">
          <h2 className="type-app-label text-heading">InputNumber</h2>
          <Row label="plain / disabled">
            <InputNumber unstyled value={num} onValueChange={(e) => setNum(e.value)} />
            <InputNumber unstyled value={99} disabled />
          </Row>
        </section>

        <section className="flex flex-col gap-3" data-testid="inputs-calendar">
          <h2 className="type-app-label text-heading">Calendar (closed)</h2>
          <Row label="with trigger">
            <Calendar unstyled value={date} onChange={(e) => setDate(e.value)} showIcon />
          </Row>
        </section>

        {/* `inline` renders the same panel the popup does, but always open and
            in normal flow — which is what makes it screenshot-able at all. */}
        <section className="flex flex-col gap-3" data-testid="inputs-calendar-panel">
          <h2 className="type-app-label text-heading">Calendar panel</h2>
          <Calendar unstyled value={date} onChange={(e) => setDate(e.value)} inline showButtonBar />
        </section>
      </main>
    </div>
  );
}
