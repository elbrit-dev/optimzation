'use client';

import Link from 'next/link';
import { HARNESS_ENTRIES } from './entries';

/* /dev/harness — every screen the harness can run. */
export default function HarnessIndex() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div>
        <p className="text-10 font-semibold uppercase tracking-wide text-ds-muted">Dev harness</p>
        <h1 className="text-20 font-semibold text-heading">Try a screen against any ERP, as anyone</h1>
        <p className="mt-1 text-12 text-ds-secondary">
          Pick the ERP and who to act as, set any prop from the component&apos;s Plasmic registration, switch data modes and
          viewport widths, and watch every event it fires.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {HARNESS_ENTRIES.map((e) => (
          <li key={e.id}>
            <Link href={`/dev/harness/${e.id}`} className="flex flex-col rounded-xl border border-line-subtle bg-surface p-4 hover:border-line-strong">
              <span className="text-14 font-semibold text-heading">{e.title}</span>
              <span className="line-clamp-2 text-12 text-ds-secondary">{e.meta?.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
