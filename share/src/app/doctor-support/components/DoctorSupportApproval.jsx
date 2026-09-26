'use client';

import { SecondaryApproval } from '@/app/secondary-approval/components/SecondaryApproval';
import { DOCTOR_SUPPORT } from '@/app/secondary-entry/data/task';

/* Doctor Support approvals — an approver's month of doctor support to
 * decide. The Secondary Approval screen with the Doctor Support task: the
 * elbrit_doctor_support_approval server script's trackers, doctors instead
 * of stockists, decided through the same Operational Tracker "Approval
 * flow" (Approve to Verification / Revisit). */
export function DoctorSupportApproval(props) {
  return <SecondaryApproval {...props} task={DOCTOR_SUPPORT} />;
}

export default DoctorSupportApproval;
