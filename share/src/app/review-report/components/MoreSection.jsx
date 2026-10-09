'use client';

import { useMemo, useState } from 'react';
import { Card, ChipRow, SectionLabel } from '@/design-system';
import { mockDefaults, mockInstitutionVisits, mockInstitutions, mockTrips } from '../data/mocks';
import { monthShort, ratio, rupees } from '../data/format';
import { MockBanner } from './bits';

/* The workbook sheets with NO source in ERP yet — Institutions, Institution
 * doctor visits, Trip doctors, Default stockists — laid out as they will
 * look, on MOCK data, each with a banner saying what wiring it needs. */

const SHEETS = [
  { key: 'inst', label: 'Institutions' },
  { key: 'instv', label: 'Institution visits' },
  { key: 'trip', label: 'Trip doctors' },
  { key: 'def', label: 'Default stockists' },
];

function Table({ head, rows }) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-12 tabular-nums">
          <thead>
            <tr className="text-11 text-ds-muted">
              {head.map((h, k) => (
                <th key={h} className={k ? 'whitespace-nowrap px-2 py-2 text-right font-medium' : 'sticky left-0 z-10 bg-[var(--surface-card)] px-3 py-2 text-left font-medium'}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-t border-[var(--border-subtle)]">
                {r.map((c, k) => (
                  <td key={k} className={k ? 'whitespace-nowrap px-2 py-1.5 text-right text-ds-secondary' : 'sticky left-0 z-10 whitespace-nowrap bg-[var(--surface-card)] px-3 py-1.5 font-medium text-heading'}>
                    {c ?? <span className="text-ds-muted">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function MoreSection({ ix, scope, mi }) {
  const [sheet, setSheet] = useState('inst');
  const data = useMemo(() => ({
    inst: mockInstitutions(ix, scope, mi),
    instv: mockInstitutionVisits(ix, scope, mi),
    trip: mockTrips(ix, scope, mi),
    def: mockDefaults(ix, scope),
  }), [ix, scope, mi]);
  const d = data[sheet];
  const hq = (h) => String(h ?? '').replace(/^HQ-/, '');

  let body = null;
  if (sheet === 'inst') {
    body = (
      <Table
        head={['Institution', 'HQ', 'Pharmacy in-charge', 'Mobile', 'Doctors', 'SM days', 'Scheme', 'Supplier', 'Terms', 'Products available']}
        rows={d.rows.map((r) => [r.name, hq(r.hq), r.pharmacist, r.phone, r.doctors, r.smDays, r.scheme, r.supplier, r.terms, r.products])}
      />
    );
  } else if (sheet === 'instv') {
    body = (
      <Table
        head={['Doctor', 'Hospital', 'HQ', ...d.months.map((m) => `${monthShort(m)} SM/RBM/ABM`)]}
        rows={d.rows.map((r) => [r.doctor, r.hospital, hq(r.hq), ...r.visits.map((v) => [v.SM, v.RBM, v.ABM].map((x) => x ?? '·').join(' / '))])}
      />
    );
  } else if (sheet === 'trip') {
    body = (
      <Table
        head={['Doctor', 'HQ', 'Activity', 'Amount', 'Expected ROI/m', ...d.months.map(monthShort), 'ROI times']}
        rows={d.rows.map((r) => [r.doctor, hq(r.hq), r.activity, rupees(r.amount), rupees(r.expected), ...r.roi.map((v) => rupees(v)), ratio(r.times)])}
      />
    );
  } else {
    body = (
      <Table
        head={['Stockist', 'Region', 'HQ', 'Payment', 'Overdue', 'Days', 'Reason to continue', 'Reason to discontinue']}
        rows={d.rows.map((r) => [r.stockist, r.region, hq(r.hq), r.mode, rupees(r.overdue), r.days, r.continueWhy || null, r.stopWhy || null])}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ChipRow items={SHEETS} value={sheet} onChange={setSheet} ariaLabel="Sheet" />
      <MockBanner what={d.mock.what} needs={d.mock.needs} />
      <div>
        <SectionLabel>{SHEETS.find((s) => s.key === sheet).label} · sample layout</SectionLabel>
        {body}
      </div>
    </div>
  );
}
