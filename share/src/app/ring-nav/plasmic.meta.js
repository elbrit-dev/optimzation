/* The Plasmic registration of RingNav — its props, as Studio shows them.
   Kept next to the component and imported by src/plasmic-init.js, so the dev
   harness (src/app/dev/harness) reads the SAME prop list without importing
   plasmic-init (which starts the Plasmic loader on import). */

export const ringNavMeta = {
  name: 'RingNav',
  displayName: 'Elbrit Ring Nav',
  section: 'ElbritCoreLib',
  importPath: './src/app/ring-nav/components/RingNav',
  isDefaultExport: true,
  // The strip sizes its rings from its own width, so it must not hug them.
  defaultStyles: { width: 'stretch' },
  description:
    "The field app task strip (Secondary, Support, Expense, Leave…) as a row of shortcuts. Each tile shows a progress ring, a count badge, a due-date caption and a status dot, and links to its item's href — a tap navigates there (client-side, via next/link). No tile is ever highlighted, including the one for the current page. Two ways to fill it: bind gqlToken (the signed-in user's own ERP token) and leave items empty, and the tiles come from ERP ready to draw — the elbrit_ring_nav server script counts the user's own work with the ERP's permissions, refetched every refreshEvery ms (default 5 min) and on return to the app; or set items yourself. Renders nothing until one of them gives tiles.",
  props: {
    items: {
      type: 'object',
      displayName: 'items',
      description:
        'Array of item configs, or plain strings. Each: { id, label, href, target, icon, caption, captionTone, iconTone, count, countTone, progress: 0-100 (percent done) | segments: [{ value, tone, color, label }] (any number), statusIcon, statusTone, ariaLabel, disabled, show }. ANY field may be a function of { data, now, today, day, weekday, month } — e.g. caption: ({ data }) => data.draft + " to enter", segments: ({ data }) => [...] — and show: ({ day }) => day <= 5 takes the tile off the strip when false. Bind with a dynamic value (custom code) to write functions; or pass JavaScript text evaluating to the array. href is where the tile goes; with no href the tile is shown but not pressable. target: "_blank" opens a new tab. icon / statusIcon are PrimeIcons names ("wallet", "pencil"). Tones: brand, success, warning, danger, neutral; countTone is danger or brand. progress fills green for done and red for the rest; segments draw any number of parts in proportion, each coloured by tone or by color (any CSS colour, e.g. "#7c3aed" — wins over tone).',
    },
    onItemClick: {
      type: 'eventHandler',
      description:
        'Fired when a tile is pressed, just before it navigates — for analytics, or to run an action first. Args: id, href.',
      argTypes: [
        { name: 'id', type: 'string' },
        { name: 'href', type: 'string' },
      ],
    },
    stickyBar: {
      type: 'boolean',
      defaultValue: false,
      description: 'Pin the strip to the top of the nearest scrolling ancestor while the page scrolls under it.',
    },
    inset: {
      type: 'boolean',
      defaultValue: true,
      description: 'The default inset: pt-1.5 pb-0.5, and a 16px side margin INSIDE the scroller — the strip runs to the device edges, the first and last tiles rest 16px in, and tiles scroll out under the screen edge. Turn off to place it flush and inset it yourself.',
    },
    ariaLabel: { type: 'string', defaultValue: 'Shortcuts', description: 'Accessible name of the strip.' },
    gqlToken: {
      type: 'string',
      helpText: "The signed-in user's own ERP token ('key:secret' or 'token key:secret'). With items empty, the tiles are fetched from ERP as this user.",
    },
    gqlEnvironment: {
      type: 'string',
      defaultValue: 'ERP',
      helpText: 'The /tokens registry row NAME the ERP host is resolved from. Never a credential.',
    },
    month: { type: 'string', description: 'The entry month the ERP tiles count (YYYY-MM). Empty: last month — the one keyed in on the 1st to the 5th.' },
    hrefs: {
      type: 'object',
      description: "Re-point ERP tiles by id, e.g. { 'secondary-entry': '/secondary/entry', 'secondary-approval': '/secondary/approval' }.",
    },
    data: {
      type: 'object',
      description: 'What the tiles read from — a query answer, counts, flags. A tile field written as a function gets it as data.',
    },
    refreshEvery: {
      type: 'number',
      description: 'ERP tiles: how often (ms) to refetch — default 300000 (5 min), at least 10000. Tiles you set with functions: how often to re-resolve them (they also re-resolve at midnight).',
    },
    now: {
      type: 'string',
      description: 'Preview the strip at this moment (YYYY-MM-DD or an ISO date-time). Leave empty in production.',
    },
    className: { type: 'string' },
  },
};
