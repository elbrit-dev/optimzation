/* The Plasmic registrations of DoctorServiceEntry and DoctorServiceApproval
   — the two Doctor Service pages (the home rings open them). Imported by
   src/plasmic-init.js and read by the dev harness. */

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
  sampleData: {
    type: 'boolean',
    defaultValue: false,
    helpText: 'Show sample services (no ERP call) — for designing the page in Studio.',
  },
  sampleRole: {
    type: 'choice',
    options: ['MIS', 'GM', 'CEO', 'IT'],
    advanced: true,
    helpText: 'With sample data: who is looking. Live, the ERP says who the token is.',
  },
  bottomGap: {
    type: 'string',
    helpText:
      "Space under the bulk bar pinned to the bottom of the screen on a phone. Any CSS length; e.g. calc(4rem + 12px) to clear the app's bottom navigation. Default 12px.",
  },
  onBack: { type: 'eventHandler', argTypes: [] },
  onOpenDoctor: {
    type: 'eventHandler',
    argTypes: [{ name: 'info', type: 'object' }],
    helpText: 'Fires when the doctor name on a service is tapped, with { doctor, name } — wire it to open the doctor page.',
  },
  onFindDoctor: {
    type: 'eventHandler',
    argTypes: [],
    helpText: '"Find a doctor" on an empty list. Unwired, it goes to /doctor.',
  },
  className: { type: 'string' },
};

export const doctorServiceEntryMeta = {
  name: 'DoctorServiceEntry',
  displayName: 'Doctor Service Entry',
  section: 'ElbritCoreLib',
  importPath: './src/app/doctor-service/components/ServiceWorkspace',
  importName: 'DoctorServiceEntry',
  description:
    "SERVICES — the MIS team's doctor services (MIS, MIS Admin, CRM Manager enter them on behalf of an RBM / SM; IT, GM and CEO may look): Draft / In approval / Approved / Rejected / All, search and Filter & sort, a list beside the detail (bottom sheet on a phone) with \"Is this doctor worth it?\", tick drafts and submit them together, edit / delete / resubmit. Bind gqlToken and gqlEnvironment: it reads the ERP's elbrit_doctor_service_list server script as that user, and writes through the Doctor Service workflow (MIS -> GM -> CEO).",
  props: {
    gqlToken: shared.gqlToken,
    gqlEnvironment: shared.gqlEnvironment,
    title: { type: 'string', defaultValue: 'Services' },
    sampleData: shared.sampleData,
    sampleRole: shared.sampleRole,
    bottomGap: shared.bottomGap,
    onBack: shared.onBack,
    onOpenDoctor: shared.onOpenDoctor,
    onFindDoctor: shared.onFindDoctor,
    className: shared.className,
  },
};

export const doctorServiceApprovalMeta = {
  name: 'DoctorServiceApproval',
  displayName: 'Doctor Service Approval',
  section: 'ElbritCoreLib',
  importPath: './src/app/doctor-service/components/ServiceWorkspace',
  importName: 'DoctorServiceApproval',
  description:
    'SERVICE APPROVAL — GM and CEO decide doctor services (IT and MIS may look): Awaiting you / In approval / Approved / Rejected / All, a team strip, group by team / on behalf of / entered by, sort by oldest waiting or biggest doctors, Approve / Reject one or many (reject needs a reason); GM sends on to CEO or approves as final. Bind gqlToken and gqlEnvironment: it reads elbrit_doctor_service_list as that user; decisions are the ERP workflow\'s own actions.',
  props: {
    gqlToken: shared.gqlToken,
    gqlEnvironment: shared.gqlEnvironment,
    title: { type: 'string', defaultValue: 'Service approval' },
    highValue: { type: 'number', defaultValue: 100000, helpText: '"Big doctor" from this average monthly support (₹).' },
    midValue: { type: 'number', defaultValue: 25000, helpText: '"Medium doctor" from this average monthly support (₹).' },
    sampleData: shared.sampleData,
    sampleRole: shared.sampleRole,
    bottomGap: shared.bottomGap,
    onBack: shared.onBack,
    onOpenDoctor: shared.onOpenDoctor,
    className: shared.className,
  },
};

export const doctorServiceAllocationMeta = {
  name: 'DoctorServiceAllocation',
  displayName: 'Doctor Service Allocation',
  section: 'ElbritCoreLib',
  importPath: './src/app/doctor-service/components/AllocationWorkspace',
  importName: 'DoctorServiceAllocation',
  description:
    "SERVICE ALLOCATION — one page for two people. The GM / CEO enters one monthly service amount per SM and ZSM and tracks who has split it (Not allocated / Not split / Partly split / Split). An SM / ZSM sees their allocation and splits it, any way they need, across their own departments; the split becomes each department's Service Budget for the month. Both can change a month until its 20th. Bind gqlToken and gqlEnvironment: it reads elbrit_service_allocation and saves through elbrit_service_allocation_save as that user.",
  props: {
    gqlToken: shared.gqlToken,
    gqlEnvironment: shared.gqlEnvironment,
    title: { type: 'string', defaultValue: 'Service allocation' },
    sampleData: shared.sampleData,
    sampleRole: {
      type: 'choice',
      options: ['GM', 'SM', 'IT'],
      advanced: true,
      helpText: 'With sample data: who is looking (GM allocates, SM splits, IT can switch between both). Live, the ERP says who the token is.',
    },
    onBack: shared.onBack,
    className: shared.className,
  },
};

