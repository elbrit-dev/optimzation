/* The Plasmic registrations of DoctorSupportEntry and DoctorSupportApproval —
   their props, as Studio shows them. Imported by src/plasmic-init.js and
   read by the dev harness (src/app/dev/harness). */

const shared = {
  gqlToken: {
    type: 'string',
    helpText:
      "REQUIRED. The signed-in user's own ERP token ('key:secret' or 'token key:secret'). Without it nothing loads and nothing can be saved — there is no shared-credential fallback.",
  },
  gqlEnvironment: {
    type: 'string',
    defaultValue: 'ERP',
    helpText: 'The /tokens registry row NAME the ERP host is resolved from. Never a credential.',
  },
  bottomGap: {
    type: 'string',
    helpText:
      "Space under the bars pinned to the bottom of the screen. Any CSS length; set e.g. calc(4rem + 12px) to clear the app's bottom navigation. Default 12px.",
  },
  onBack: { type: 'eventHandler', argTypes: [] },
  className: { type: 'string' },
};

export const doctorSupportEntryMeta = {
  name: 'DoctorSupportEntry',
  displayName: 'Doctor Support Entry',
  section: 'ElbritCoreLib',
  importPath: './src/app/doctor-support/components/DoctorSupportEntry',
  importName: 'DoctorSupportEntry',
  description:
    "A seat's month of doctor support and the form to key it in — Secondary Entry's screen for doctors: entered-of-total progress, bulk entry via a sheet, Draft / Pending / Approved counts, the doctor list, and a per-doctor qty-by-product form (valued at PTS) with Save draft and Submit for approval. Bind gqlToken (the signed-in user's own ERP token) and gqlEnvironment: it loads from the ERP's elbrit_doctor_support_entry server script as that user — every Doctor Support they may see for the month, each with only their seat's lines. Saves re-read the Doctor Support and change only this seat's lines (Draft for Save, Submitted for Submit — the ERP's Support Tracker then raises the approval).",
  props: {
    month: { type: 'string', description: 'The month to load (YYYY-MM). Empty: last month.' },
    roleProfile: {
      type: 'string',
      helpText:
        "Optional override of the seat entering. Leave empty: the seat is the ERP's answer for the signed-in user (their active Employee's role_id).",
    },
    gqlToken: shared.gqlToken,
    gqlEnvironment: shared.gqlEnvironment,
    title: { type: 'string', defaultValue: 'Doctor support' },
    bottomGap: shared.bottomGap,
    onBack: shared.onBack,
    onSaved: {
      type: 'eventHandler',
      argTypes: [{ name: 'info', type: 'object' }],
      helpText: 'Fires after each save with { name, submit, live }.',
    },
    className: shared.className,
  },
};

export const doctorSupportApprovalMeta = {
  name: 'DoctorSupportApproval',
  displayName: 'Doctor Support Approval',
  section: 'ElbritCoreLib',
  importPath: './src/app/doctor-support/components/DoctorSupportApproval',
  importName: 'DoctorSupportApproval',
  description:
    "An approver's month of doctor support to decide — Secondary Approval's screen for doctors: one card per person who raised support, doctors on the same cards, Approve / Revisit per doctor or for the whole submission. Bind gqlToken and gqlEnvironment: it loads from the ERP's elbrit_doctor_support_approval server script as that user, one month at a time (the prior month by default). Approve / Revisit appear exactly where the ERP workflow allows this user.",
  props: {
    gqlToken: shared.gqlToken,
    gqlEnvironment: shared.gqlEnvironment,
    title: { type: 'string', defaultValue: 'Doctor support approvals' },
    bottomGap: shared.bottomGap,
    onBack: shared.onBack,
    onDecided: {
      type: 'eventHandler',
      argTypes: [{ name: 'info', type: 'object' }],
      helpText: 'Fires after each decision with { decisions, results, live }.',
    },
    className: shared.className,
  },
};
