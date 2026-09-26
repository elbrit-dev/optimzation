'use client';

import { SecondaryEntry } from '@/app/secondary-entry/components/SecondaryEntry';
import { DOCTOR_SUPPORT } from '@/app/secondary-entry/data/task';

/* Doctor Support entry — a seat's month of doctor support, and the form to
 * key it in. The Secondary Entry screen with the Doctor Support task
 * (secondary-entry/data/task.js): doctors instead of stockists, one qty per
 * product valued at PTS into `amount`, no closing stock. It loads from the
 * elbrit_doctor_support_entry server script as the signed-in user, and
 * writes the seat's lines back to the Doctor Support; the ERP's "Support
 * Tracker" raises the approval once they are submitted. */
export function DoctorSupportEntry(props) {
  return <SecondaryEntry {...props} task={DOCTOR_SUPPORT} />;
}

export default DoctorSupportEntry;
