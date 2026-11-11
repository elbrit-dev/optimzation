/* The Plasmic registration of LeaveApproval — its props, as Studio shows them.
   Kept next to the component and imported by src/plasmic-init.js, so the dev
   harness reads the SAME prop list. */

export const leaveApprovalMeta = {
  name: 'LeaveApproval',
  displayName: 'Leave Approval',
  section: 'ElbritCoreLib',
  importPath: './src/app/leave-approval/components/LeaveApproval',
  importName: 'LeaveApproval',
  description:
    "Every leave waiting on the signed-in approver (as leave approver, or the escalation approver one level up), most urgent first: who, which leave and when, how soon it starts and how long it has waited, reason and attachment. Approve / Reject per card, or tick several and decide from the pinned bar (Reject asks a reason). A seven-day strip shows who is off. Bind gqlToken (the user's own ERP token) and gqlEnvironment.",
  props: {
    gqlToken: { type: 'string', helpText: "REQUIRED to read and decide. The signed-in user's own ERP token." },
    gqlEnvironment: { type: 'string', defaultValue: 'ERP', helpText: 'The /tokens registry row NAME the ERP host is resolved from.' },
    title: { type: 'string', defaultValue: 'Leave approvals' },
    bottomGap: { type: 'string', helpText: 'Space under the pinned bar, e.g. calc(4rem + 12px) to clear the bottom navigation.' },
    onBack: { type: 'eventHandler', argTypes: [] },
    onDecided: { type: 'eventHandler', argTypes: [{ name: 'info', type: 'object' }], helpText: 'Fires after each decision with { action, names, results }.' },
    className: { type: 'string' },
  },
};
