'use client';

import { createContext, useContext } from 'react';

/* THE TASK — what the Entry and Approval screens are FOR. The screens are one
 * engine; a task says what its records are called, which server scripts feed
 * it, and how a seat's lines are written back:
 *
 *   Secondary       one Secondary Data Entry per STOCKIST per date, lines of
 *                   sales and closing qty, valued at PTS
 *   Doctor Support  one Doctor Support per DOCTOR per date, lines of qty,
 *                   valued at PTS into `amount`
 *
 * Both work the same way: a seat fills its own lines on a pre-created record
 * and submits them (lines "Draft" → "Submitted"); the ERP's Before-Save
 * script raises that seat's Operational Tracker, which approvers decide
 * through the shared "Approval flow". Each task's server scripts answer in
 * ONE shape (Secondary's field names), so reading is the same for both —
 * only the labels and the write-back differ. */

export const SECONDARY = {
  id: 'secondary',
  party: 'stockist',
  parties: 'stockists',
  Party: 'Stockist',
  Parties: 'Stockists',
  qtyLabel: 'Sales',
  codeLabel: 'EBS code',
  /* The approver's person card: "Jul secondary", total qty "units billed". */
  valueNoun: 'secondary',
  qtyCaption: 'units billed',
  /* Closing stock is keyed and shown alongside sales. */
  closing: true,
  entryTitle: 'Secondary entry',
  approvalTitle: 'Secondary approvals',
  entryMethod: 'elbrit_secondary_entry',
  approvalMethod: 'elbrit_secondary_approval',
  fileStem: 'secondary-entry',
  /* How a seat's lines are written back (REST get → save, see writes.js). */
  doctype: 'Secondary Data Entry',
  childTable: 'items',
  childDoctype: 'Secondary Data Table',
  fields: {
    roleProfile: 'custom_role_profile',
    status: 'custom_status',
    qty: 'sales_qty',
    value: 'sales_value',
    closingQty: 'closing_qty',
    closingValue: 'closing_balance',
    rate: 'rate',
    hq: 'custom_hq',
    department: 'custom_department',
  },
  trackerTable: 'custom_status_tracker',
  trackerPrefix: 'Secondary Data Entry',
};

export const DOCTOR_SUPPORT = {
  id: 'doctor-support',
  party: 'doctor',
  parties: 'doctors',
  Party: 'Doctor',
  Parties: 'Doctors',
  qtyLabel: 'Qty',
  codeLabel: 'Doctor code',
  valueNoun: 'support',
  qtyCaption: 'units',
  closing: false,
  entryTitle: 'Doctor support',
  approvalTitle: 'Doctor support approvals',
  entryMethod: 'elbrit_doctor_support_entry',
  approvalMethod: 'elbrit_doctor_support_approval',
  fileStem: 'doctor-support',
  doctype: 'Doctor Support',
  childTable: 'item_table',
  childDoctype: 'Support Items',
  fields: {
    roleProfile: 'role_profile',
    status: 'status',
    qty: 'qty',
    value: 'amount',
    closingQty: null,
    closingValue: null,
    rate: null,
    hq: 'hq',
    department: 'department',
  },
  trackerTable: 'custom_approver_table',
  trackerPrefix: 'Doctor Support',
};

/* "3 doctors", "1 stockist". */
export function partyCount(task, n) {
  return `${n} ${n === 1 ? task.party : task.parties}`;
}

const TaskContext = createContext(SECONDARY);
export const TaskProvider = TaskContext.Provider;

/* The task the screen around this component is for — Secondary unless a
   screen says otherwise. */
export function useTask() {
  return useContext(TaskContext);
}
