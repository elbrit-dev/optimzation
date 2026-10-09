/* The Plasmic registration of ReviewReport — its props, as Studio shows them.
   Kept next to the component and imported by src/plasmic-init.js, so the dev
   harness (src/app/dev/harness) reads the SAME prop list. */

export const reviewReportMeta = {
  name: 'ReviewReport',
  displayName: 'Monthly Review Report',
  section: 'ElbritCoreLib',
  description:
    'The SM monthly review (the SM REVIEW FORMAT workbook) as one page: target vs primary vs secondary by month, YTD, PCPM and growth; doctor support sorted into new / increased / stable / decreased / dropped against each doctor\'s recent average; stockists at 2x or more closing stock, chronic and dead stock; for any seat of the team tree or any department. Reads the elbrit_sm_review server script as the SIGNED-IN user — their seat and everything under it (IT: the whole Sales tree).',
  props: {
    gqlEnvironment: {
      type: 'string',
      defaultValue: 'ERP',
      helpText: "The /tokens registry row NAME the ERP host comes from ('ERP' vs a UAT row). Never a credential.",
    },
    gqlToken: {
      type: 'string',
      helpText: "REQUIRED. The signed-in user's own ERP token ('key:secret'). No fallback.",
    },
    root: {
      type: 'string',
      helpText: 'Optional seat (Role Profile) to start at, inside the caller\'s own subtree — e.g. SM-ELB_AURA_KA. Empty: the caller\'s seat.',
    },
    fy: {
      type: 'string',
      helpText: 'Optional FY by its opening year, e.g. 2026 for FY 26-27. Empty: the current FY.',
    },
    upto: {
      type: 'string',
      helpText: 'Optional last month (YYYY-MM). Empty: last month — the current one is not over.',
    },
    includeDrafts: {
      type: 'boolean',
      defaultValue: false,
      helpText: 'Count lines not yet sent in the month still being entered (closed months always count every line).',
    },
    title: { type: 'string', defaultValue: 'Monthly review' },
    showMockSheets: {
      type: 'boolean',
      defaultValue: false,
      helpText: 'Show the "Other sheets · mock" tab (Institutions, Trip doctors, Default stockists) — sample data, not from ERP.',
    },
  },
};
