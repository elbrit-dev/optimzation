/* The Plasmic registration of SecondaryApproval — its props, as Studio shows them.
   Kept next to the component and imported by src/plasmic-init.js, so the dev
   harness (src/app/dev/harness) can read the SAME prop list without
   importing plasmic-init (which starts the Plasmic loader on import). */

export const secondaryApprovalMeta = {
  name: 'SecondaryApproval',
  displayName: 'Secondary Approval',
  section: 'ElbritCoreLib',
  importPath: './src/app/secondary-approval/components/SecondaryApproval',
  importName: 'SecondaryApproval',
  description:
    "An approver's month of secondary submissions: done-of-total progress, one chip per person who raised figures, and a card per submission — stockists on Secondary Entry's stockist card, Approve / Revisit per stockist or for the whole submission from the pinned bar (Revisit sends it back to the BE with a reason). Drop it on the page on its own and bind gqlToken (the signed-in user's own ERP token) and gqlEnvironment: it loads from the ERP's elbrit_secondary_approval server script as that user — one month at a time with a month switcher, every tracker they may see (no cap), each with only its own seat's lines. Approve / Revisit appear exactly where the ERP workflow allows this user those actions. It also still works inside an Elbrit DataProvider (Views) on SecondaryApproval, or with rows passed in.",
  props: {
    gqlToken: {
      type: 'string',
      helpText:
        "REQUIRED to decide. The signed-in user's own ERP token ('key:secret' or 'token key:secret'). Without it the screen is read-only — there is no shared-credential fallback.",
    },
    gqlEnvironment: {
      type: 'string',
      defaultValue: 'ERP',
      helpText: 'The /tokens registry row NAME the ERP host is resolved from. Never a credential.',
    },
    title: { type: 'string', defaultValue: 'Secondary approvals' },
    bottomGap: {
      type: 'string',
      helpText:
        'Space under the Approve / Reject bar pinned to the bottom of the screen. Any CSS length; set e.g. calc(4rem + 12px) to clear the app\'s bottom navigation. Default 12px.',
    },
    onBack: { type: 'eventHandler', argTypes: [] },
    onDecided: {
      type: 'eventHandler',
      argTypes: [{ name: 'info', type: 'object' }],
      helpText: 'Fires after each decision with { decisions, results, live }.',
    },
    rows: {
      type: 'object',
      advanced: true,
      helpText: 'Only for use OUTSIDE a DataProvider: the SecondaryApproval rows to show. Inside one, leave empty.',
    },
    className: { type: 'string' },
  },
};
