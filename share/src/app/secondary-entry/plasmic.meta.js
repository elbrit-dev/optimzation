/* The Plasmic registration of SecondaryEntry — its props, as Studio shows them.
   Kept next to the component and imported by src/plasmic-init.js, so the dev
   harness (src/app/dev/harness) can read the SAME prop list without
   importing plasmic-init (which starts the Plasmic loader on import). */

export const secondaryEntryMeta = {
  name: 'SecondaryEntry',
  displayName: 'Secondary Entry',
  section: 'ElbritCoreLib',
  importPath: './src/app/secondary-entry/components/SecondaryEntry',
  importName: 'SecondaryEntry',
  description:
    "A seat's month of stockist secondary figures and the form to key them in: entered-of-total progress, bulk entry via a CSV sheet, Draft / Pending / Approved counts and value grid, the stockist list, and a per-stockist quantity-by-item form (sales + closing) with Save draft and Submit for approval. Drop it on the page on its own and bind gqlToken (the signed-in user's own ERP token) and gqlEnvironment: it loads from the ERP's elbrit_secondary_entry server script as that user — every entry they may see for the month (no cap), each with only their seat's lines, and the product list. Saves write to ERP as the signed-in user: the entry is re-read and only this seat's lines are changed (Draft for Save, Submitted for Submit — the server script then creates the approval tracker). It also still works inside an Elbrit DataProvider (Views) on SecondaryEntry, or with rows passed in.",
  props: {
    month: { type: 'string', description: 'The month to load (YYYY-MM). Empty: last month — the one keyed in on the 1st to the 5th.' },
    roleProfile: {
      type: 'string',
      helpText:
        "Optional override of the seat entering, e.g. 'BE7-VASC-CO-NAG'. Leave empty: the seat is the ERP's answer for the signed-in user (their active Employee's role_id). Which stockists show is the ERP's permission rules; only the seat's lines within each are shown and written.",
    },
    gqlToken: {
      type: 'string',
      helpText:
        "REQUIRED to save. The signed-in user's own ERP token ('key:secret' or 'token key:secret'). Without it the screen is read-only — there is no shared-credential fallback.",
    },
    gqlEnvironment: {
      type: 'string',
      defaultValue: 'ERP',
      helpText: 'The /tokens registry row NAME the ERP host is resolved from. Never a credential.',
    },
    productsQueryId: {
      type: 'string',
      defaultValue: 'Items',
      helpText: 'Saved query offered by "+ Add product" (run through the provider). Falls back to the items already on the entries.',
    },
    title: { type: 'string', defaultValue: 'Secondary entry' },
    bottomGap: {
      type: 'string',
      helpText:
        'Space under the bars pinned to the bottom of the screen: the bulk "Send for approval" bar while stockists are ticked, and Save draft / Submit on a stockist. Any CSS length; set e.g. calc(4rem + 12px) to clear the app\'s bottom navigation. Default 12px.',
    },
    onBack: { type: 'eventHandler', argTypes: [] },
    onSaved: {
      type: 'eventHandler',
      argTypes: [{ name: 'info', type: 'object' }],
      helpText: 'Fires after each save with { name, submit, live }.',
    },
    rows: {
      type: 'object',
      advanced: true,
      helpText: 'Only for use OUTSIDE a DataProvider: the SecondaryEntry rows to show. Inside one, leave empty.',
    },
    className: { type: 'string' },
  },
};
