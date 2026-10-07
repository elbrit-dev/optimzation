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
  cardTitle: 'Secondary sales',
  qtyCaption: 'units billed',
  /* Closing stock is keyed and shown alongside sales. */
  closing: true,
  entryTitle: 'Secondary entry',
  approvalTitle: 'Secondary approvals',
  entryMethod: 'elbrit_secondary_entry',
  approvalMethod: 'elbrit_secondary_approval',
  /* "Add stockist": puts the seat's lines (every product at 0) on a
     stockist of theirs not on their list — creating the month's entry when
     there is none — always for the PREVIOUS month, by today's date
     (server/elbrit_secondary_add.py). `addParam` names the stockists in the
     request. At most `addLimit` per go, as the script allows. */
  addMethod: 'elbrit_secondary_add',
  addParam: 'stockists',
  addLimit: 20,
  /* A manager covering a vacant seat adds that seat's stockists too: the
     script takes the covered `seat` and checks the caller covers it. */
  addCovers: true,
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
    /* Where the line's figures came from (writes.js ENTRY_SOURCE). */
    source: 'custom_entry_source',
    hq: 'custom_hq',
    department: 'custom_department',
  },
  trackerTable: 'custom_status_tracker',
  trackerPrefix: 'Secondary Data Entry',
  /* The Attach field an uploaded sheet is kept in, on every entry it filled
     (writes.js attachSheet). */
  sheetField: 'custom_transformed_data',
};

export const DOCTOR_SUPPORT = {
  id: 'doctor-support',
  party: 'doctor',
  parties: 'doctors',
  Party: 'Doctor',
  Parties: 'Doctors',
  qtyLabel: 'Qty',
  codeLabel: 'Doctor code',
  /* The downloaded sheet names each doctor by code and name, not only by
     the entry (csv.js). */
  sheetIdentity: true,
  valueNoun: 'support',
  cardTitle: 'Doctor support',
  qtyCaption: 'units',
  closing: false,
  entryTitle: 'Doctor support',
  approvalTitle: 'Doctor support approvals',
  entryMethod: 'elbrit_doctor_support_entry',
  approvalMethod: 'elbrit_doctor_support_approval',
  /* "Add doctor": puts the seat's lines (every product at 0) on a doctor
     the bulk load did not bring — creating the month's record when there is
     none — always for the PREVIOUS month, by today's date
     (doctor-support/server/elbrit_doctor_support_add.py). At most
     `addLimit` doctors per go, as the script allows. */
  addMethod: 'elbrit_doctor_support_add',
  addParam: 'doctors',
  addLimit: 20,
  /* A manager covering a vacant seat adds that seat's doctors too: the
     script takes the covered `seat` and checks the caller covers it. */
  addCovers: true,
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
    source: 'custom_entry_source',
    hq: 'hq',
    department: 'department',
  },
  /* Production names the same line fields custom_*: the writer takes
     whichever the record's own lines carry (writes.js lineFields). */
  fieldsAlt: {
    roleProfile: 'custom_role_profile',
    status: 'custom_status',
    hq: 'custom_hq',
    department: 'custom_department',
  },
  trackerTable: 'custom_approver_table',
  trackerPrefix: 'Doctor Support',
  sheetField: 'custom_transformed_data',
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
