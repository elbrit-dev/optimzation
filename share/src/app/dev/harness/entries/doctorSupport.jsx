'use client';

import { DoctorSupportEntry } from '@/app/doctor-support/components/DoctorSupportEntry';
import { DoctorSupportApproval } from '@/app/doctor-support/components/DoctorSupportApproval';
import { doctorSupportApprovalMeta, doctorSupportEntryMeta } from '@/app/doctor-support/plasmic.meta';
import { DOCTOR_SUPPORT } from '@/app/secondary-entry/data/task';
import { createErpWriter } from '@/app/secondary-entry/data/writes';
import { createDecisionWriter } from '@/app/secondary-approval/data/writes';
import { dryRunWrites } from '../addons/dryRunWrites';
import { emulatedBrowser } from '../addons/emulatedBrowser';

/* Doctor Support — the Secondary Entry / Approval screens with the Doctor
   Support task, against the ERP as the person acting. Writes are dry runs
   until switched on. */

const bottomGap = { bottomGap: 'calc(var(--harness-bottom, 0px) + 12px)' };

export const doctorSupportEntryHarness = {
  id: 'doctor-support-entry',
  title: 'Doctor Support Entry',
  component: DoctorSupportEntry,
  meta: doctorSupportEntryMeta,
  bind: ({ envName, token }) => ({ gqlEnvironment: envName, gqlToken: token }),
  hidden: ['className'],
  defaults: bottomGap,
  frame: { width: 390, surface: 'app', padded: true },
  modes: [{ id: 'live', label: 'ERP', note: 'The elbrit_doctor_support_entry server script, as the person acting.' }],
  addons: [
    dryRunWrites({
      label: 'Save to ERP',
      makeWriter: (log, { endpointUrl, token }) => {
        const real = token ? createErpWriter({ endpointUrl, gqlToken: token, task: DOCTOR_SUPPORT }) : null;
        return {
          live: false,
          whoAmI: () => (real ? real.whoAmI() : Promise.resolve({ user: null, seat: null })),
          async saveSeat(name, opts) {
            log('saveSeat — dry run', [{ name, ...opts }], 'warn');
            return null;
          },
        };
      },
    }),
    emulatedBrowser(),
  ],
};

export const doctorSupportApprovalHarness = {
  id: 'doctor-support-approval',
  title: 'Doctor Support Approval',
  component: DoctorSupportApproval,
  meta: doctorSupportApprovalMeta,
  bind: ({ envName, token }) => ({ gqlEnvironment: envName, gqlToken: token }),
  hidden: ['className'],
  defaults: bottomGap,
  frame: { width: 390, surface: 'app', padded: true },
  modes: [{ id: 'live', label: 'ERP', note: 'The elbrit_doctor_support_approval server script, as the person acting.' }],
  addons: [
    dryRunWrites({
      label: 'Send decisions to ERP',
      makeWriter: (log, { endpointUrl, token }) => {
        /* Which actions a user may take is still asked of the ERP, so the
           buttons are real; only the decisions are held back. */
        const real = token ? createDecisionWriter({ endpointUrl, gqlToken: token }) : null;
        return {
          live: false,
          whoAmI: () => (real ? real.whoAmI() : Promise.resolve(null)),
          actions: (names) => (real ? real.actions(names) : Promise.resolve(new Map())),
          async decide(decisions) {
            log('decide — dry run', [decisions], 'warn');
            return decisions.map((d) => ({ name: d.name, ok: false, state: null, error: 'Dry run — nothing sent to ERP.' }));
          },
        };
      },
    }),
    emulatedBrowser(),
  ],
};
