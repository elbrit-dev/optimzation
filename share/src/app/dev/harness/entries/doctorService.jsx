'use client';

import { DoctorServiceApproval, DoctorServiceEntry } from '@/app/doctor-service/components/ServiceWorkspace';
import { doctorServiceApprovalMeta, doctorServiceEntryMeta } from '@/app/doctor-service/plasmic.meta';

/* Doctor Service — the Services (MIS) and Service approval (GM / CEO)
   pages. "Sample" runs on in-memory data (pick who is looking with
   sampleRole); "ERP" reads elbrit_doctor_service_list as the person acting
   and WRITES for real — use a test ERP. */

const bottomGap = { bottomGap: 'calc(var(--harness-bottom, 0px) + 12px)' };
const modes = (script) => [
  { id: 'sample', label: 'Sample', note: 'In-memory services — no ERP call.', defaults: { sampleData: true } },
  { id: 'live', label: 'ERP', note: `The ${script} server script, as the person acting. Writes are real.`, defaults: { sampleData: false } },
];

export const doctorServiceEntryHarness = {
  id: 'doctor-service-entry',
  title: 'Doctor Service Entry',
  component: DoctorServiceEntry,
  meta: doctorServiceEntryMeta,
  bind: ({ envName, token }) => ({ gqlEnvironment: envName, gqlToken: token }),
  hidden: ['className'],
  defaults: { ...bottomGap, sampleRole: 'MIS' },
  frame: { width: 1280, surface: 'app', padded: true },
  modes: modes('elbrit_doctor_service_list'),
  addons: [],
};

export const doctorServiceApprovalHarness = {
  id: 'doctor-service-approval',
  title: 'Doctor Service Approval',
  component: DoctorServiceApproval,
  meta: doctorServiceApprovalMeta,
  bind: ({ envName, token }) => ({ gqlEnvironment: envName, gqlToken: token }),
  hidden: ['className'],
  defaults: { ...bottomGap, sampleRole: 'GM' },
  frame: { width: 1280, surface: 'app', padded: true },
  modes: modes('elbrit_doctor_service_list'),
  addons: [],
};
