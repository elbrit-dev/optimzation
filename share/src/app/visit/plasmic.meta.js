/* The Plasmic registration of VisitReport — its props, as Studio shows them.
   Kept next to the component and imported by src/plasmic-init.js, so the dev
   harness (src/app/dev/harness) can read the SAME prop list without
   importing plasmic-init (which starts the Plasmic loader on import). */

export const visitReportMeta = {
  name: 'VisitReport',
  displayName: 'Visit Report',
  section: 'ElbritCoreLib',
  description:
    'Mobile-first field-force visit KPI report: attendance, planned vs happened calls, POB, geo-verified vs force visits, an HQ strip with hourly chart, and the manager team tree. The period is today or any month back through the picker; the scope picker takes several branches at once, each either the manager alone or their whole subtree. Attendance chips and per-node Dr plan buttons open the rows behind the numbers. Reads live from ERPNext (Events, Employees, LeaveApplications, Quotations) as the SIGNED-IN user, so the default my-team scope and every permission-scoped row reflect who is actually looking. Bind gqlToken to the same user credential the other ERP-reading components on this canvas use -- there is no shared/service-token fallback.',
  props: {
    gqlEnvironment: {
      type: 'string',
      defaultValue: 'ERP',
      helpText:
        "The /tokens registry row NAME this resolves the ERP HOST from ('ERP' vs a UAT/sandbox row). Never used for a credential -- gqlToken is the only source of that.",
    },
    gqlToken: {
      type: 'string',
      helpText:
        "REQUIRED. The signed-in user's own ERP token ('key:secret' or already-prefixed 'token key:secret'). There is no fallback: leaving this empty means the report has nothing to authenticate with and throws rather than silently using a shared credential.",
    },
  },
};
