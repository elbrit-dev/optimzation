'use client';

import { useMemo, useState } from 'react';
import { ServiceForm } from '@/app/doctor-service/components/ServiceForm';
import { makeSampleClient } from '@/app/doctor-service/data/sample';

/* The "Add service" form on its own, on the sample client: pick a doctor and
   try the per-service details (EB Bill, Recharge, EMI...). What a save would
   send is shown below the form, as the app sends it to ERP. Dev only. */

function DoctorServiceFormHarness({ doctor = 'DR-10649' }) {
  const [sent, setSent] = useState(null);
  const [open, setOpen] = useState(true);
  const client = useMemo(() => {
    const c = makeSampleClient('MIS');
    return { ...c, create: async (fields) => { setSent(fields); return c.create(fields); } };
  }, []);
  const names = { 'DR-10649': 'Dr Sujatha', 'DR-46036': 'Dr Vinitha Priya', 'DR-1': 'Dr Yuvaraj' };
  return (
    <div>
      {open ? (
        <ServiceForm client={client} doctor={{ id: doctor, name: names[doctor] || doctor }} entry={null}
          viewer={{ can_enter: true, employee_name: 'Vishnu' }}
          onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />
      ) : <button type="button" data-testid="reopen" onClick={() => setOpen(true)}>Open the form again</button>}
      <pre data-testid="sent" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{sent ? JSON.stringify(sent, null, 1) : 'nothing sent yet'}</pre>
    </div>
  );
}

export const doctorServiceFormHarness = {
  id: 'doctor-service-form',
  title: 'Doctor Service Form',
  component: DoctorServiceFormHarness,
  meta: { name: 'DoctorServiceForm', props: { doctor: { type: 'choice', options: ['DR-10649', 'DR-46036', 'DR-1'], defaultValue: 'DR-10649' } } },
  bind: () => ({}),
  hidden: [],
  defaults: { doctor: 'DR-10649' },
  frame: { width: 900, surface: 'app', padded: true },
  modes: [{ id: 'sample', label: 'Sample', note: 'In-memory — no ERP call.', defaults: {} }],
  addons: [],
};
