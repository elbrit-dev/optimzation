'use client';

import { useMemo } from 'react';
import { Card } from '@/design-system';
import RingNav from '@/app/ring-nav/components/RingNav';
import { ringNavMeta } from '@/app/ring-nav/plasmic.meta';
import { DEFAULT_RING_NAV_ITEMS } from '@/app/ring-nav/data/defaultRingNavItems';
import { emulatedBrowser } from '../addons/emulatedBrowser';

/* The sample tiles — Mock mode's starting `items` and `data`. They show in
   the Props panel as source and are edited there; any tile field may be a
   function of { data, now, today, day, weekday, month }, and show: false
   takes a tile off. Preview another day with the `now` prop. */
export const RING_NAV_MOCK = {
  data: { secondary: { approved: 4, pending: 2, draft: 14 } },
  items: [
    {
      id: 'secondary-entry',
      label: 'Secondary',
      href: '/secondary/entry',
      icon: 'calendar-clock',
      statusIcon: 'pencil',
      show: ({ day }) => day <= 5,
      caption: ({ data }) => `${data.secondary.draft} left`,
      captionTone: 'danger',
      count: ({ data }) => data.secondary.draft,
      segments: ({ data: { secondary: s } }) => [
        { value: s.approved, tone: 'success', label: 'Approved' },
        { value: s.pending, tone: 'warning', label: 'Pending' },
        { value: s.draft, tone: 'danger', label: 'Draft' },
      ],
    },
    ...DEFAULT_RING_NAV_ITEMS.slice(1),
  ],
};

/* The page the strip sits on, so stickyBar has something to scroll past. */
const pageBelow = {
  id: 'pageBelow',
  use() {
    return useMemo(
      () => ({
        wrap: (node) => (
          <>
            {node}
            <div className="flex flex-col gap-3 p-4">
              {[1, 2, 3].map((n) => (
                <Card key={n} title={n === 1 ? 'Page content' : `More content ${n}`}>
                  <p className="type-app-body text-ds-secondary">
                    The rest of the page the strip sits on. Press a tile to go to its page; scroll to see a sticky strip stay.
                  </p>
                  <div className="h-40" />
                </Card>
              ))}
            </div>
          </>
        ),
      }),
      [],
    );
  },
};

export const ringNavHarness = {
  id: 'ring-nav',
  title: 'Ring Nav',
  component: RingNav,
  meta: ringNavMeta,
  bind: ({ envName, token }) => ({ gqlEnvironment: envName, gqlToken: token }),
  hidden: ['className'],
  defaults: { stickyBar: true, ariaLabel: 'Daily tasks' },
  frame: { width: 390, surface: 'app', padded: false },
  modes: [
    {
      id: 'live',
      label: 'ERP',
      note: 'The elbrit_ring_nav server script, as the person acting — tiles counted with their permissions. Preview a day with now, another entry month with month; the Secondary tiles show on the 1st–5th (Role Profile IT: always). Setting items shows those instead.',
    },
    {
      id: 'mock',
      label: 'Mock',
      note: 'Sample tiles — items and data in Props, edited there (JavaScript, so fields can be functions). No network.',
      defaults: RING_NAV_MOCK,
    },
  ],
  addons: [pageBelow, emulatedBrowser()],
};
