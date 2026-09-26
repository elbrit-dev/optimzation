'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { HarnessShell } from '../HarnessShell';
import { harnessEntry } from '../entries';

/* /dev/harness/<screen> — the harness for one screen. */
export default function HarnessPage() {
  const { id } = useParams();
  const entry = harnessEntry(String(id));
  if (!entry) {
    return (
      <p className="p-6 text-12 text-ds-secondary">
        No harness entry &quot;{String(id)}&quot;. <Link href="/dev/harness" className="text-brand-text">All screens</Link>
      </p>
    );
  }
  return <HarnessShell entry={entry} />;
}
