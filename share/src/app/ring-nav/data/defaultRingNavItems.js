/* The field app's daily task strip, as the mock draws it. HARNESS ONLY:
   the /ring-nav playground starts from these. Studio deliberately gets no
   sample data — an unconfigured Ring Nav renders nothing rather than ten
   tiles of placeholder links.

   The hrefs are PLACEHOLDERS, derived from the ids — replace them with the
   app's real routes when binding the strip.

   The labels repeat (two Secondaries, two Supports, two Expenses) because
   the same kind of work shows up at more than one stage — `-entry` for
   filling it in, `-approval` for signing it off. The ids carry that; the
   labels do not need to.

   Captions are written in sentence case; the tile uppercases them in CSS, so
   a screen reader says "5 Aug" and not "five A-U-G". */

export const DEFAULT_RING_NAV_ITEMS = [
  {
    id: 'secondary-entry',
    label: 'Secondary',
    href: '/secondary/entry',
    icon: 'calendar-clock',
    caption: '5 Aug',
    captionTone: 'danger',
    count: 14,
    progress: 30,
    statusIcon: 'pencil',
  },
  {
    id: 'support-entry',
    label: 'Support',
    href: '/support/entry',
    icon: 'file-check',
    caption: '5 Aug',
    captionTone: 'danger',
    count: 75,
    progress: 37,
    statusIcon: 'pencil',
  },
  {
    id: 'expense-entry',
    label: 'Expense',
    href: '/expense/entry',
    icon: 'wallet',
    caption: '5 Aug',
    captionTone: 'danger',
    count: 1,
    progress: 0,
    statusIcon: 'pencil',
  },
  {
    id: 'secondary-approval',
    label: 'Secondary',
    href: '/secondary/approval',
    icon: 'calendar-clock',
    caption: 'Today',
    captionTone: 'warning',
    count: 1,
    progress: 0,
    statusIcon: 'check-square',
    statusTone: 'neutral',
  },
  {
    id: 'support-approval',
    label: 'Support',
    href: '/support/approval',
    icon: 'file-check',
    caption: 'Today',
    captionTone: 'warning',
    count: 1,
    progress: 0,
    statusIcon: 'check-square',
    statusTone: 'neutral',
  },
  {
    id: 'service-approval',
    label: 'Service',
    href: '/service/approval',
    icon: 'cog',
    caption: 'Today',
    captionTone: 'warning',
    count: 1,
    progress: 0,
    statusIcon: 'check-square',
    statusTone: 'neutral',
  },
  {
    id: 'expense',
    label: 'Expense',
    href: '/expense',
    icon: 'wallet',
    iconTone: 'success',
    progress: 100,
    statusIcon: 'check-square',
    statusTone: 'neutral',
  },
  {
    id: 'leave',
    label: 'Leave',
    href: '/leave',
    icon: 'calendar',
    iconTone: 'success',
    progress: 100,
    statusIcon: 'check-square',
    statusTone: 'neutral',
  },
  {
    id: 'survey',
    label: 'Survey',
    href: '/survey',
    icon: 'comments',
    iconTone: 'success',
    progress: 100,
    statusIcon: 'pencil',
  },
  {
    /* Two separate announcements, both unread: explicit segments rather than
       `progress`, so the ring shows two items and not one bar of 2. */
    id: 'updates',
    label: 'Updates',
    href: '/updates',
    icon: 'megaphone',
    count: 2,
    segments: [
      { key: 'u1', value: 1, tone: 'danger', label: 'Unread' },
      { key: 'u2', value: 1, tone: 'danger', label: 'Unread' },
    ],
    statusIcon: 'megaphone',
    statusTone: 'warning',
  },
];
