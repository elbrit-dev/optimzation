#!/usr/bin/env node
/**
 * Pins the User Permission analysis — specifically which permissions count as
 * "this user can see another person's Employee record".
 *
 * That verdict drives a delete button on live ERP data, so a false positive would
 * push someone into revoking a correct permission. The rule was wrong once: it
 * compared record IDs only, which flagged 3 of 12 wrongly because a user's
 * `user_id` legitimately appears on more than one Employee record.
 *
 * Offline — pure functions, no ERP, no credentials.
 */

import { analysePermissions, COMMON_ALLOW_DOCTYPES } from './lib/permissions.mjs'

let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`)
}

// Employee records shaped like the real ones, including the two awkward shapes.
const employees = [
  { name: 'E00893', employee_name: 'Arun Kumar', user_id: 'arunkumar893.be@elbrit.org', status: 'Active' },
  { name: 'E01154', employee_name: 'Thamaraiselvan', user_id: 'thamaraiselvan1154.be@elbrit.org', status: 'Active' },
  { name: 'E00959', employee_name: 'Ajay Giri', user_id: 'ajay959.be@elbrit.org', status: 'Active' },
  // vacant placeholder carrying the SAME user_id as E00959 — a data fault, but
  // not one person seeing another's data
  { name: 'V01745', employee_name: 'Vacant_Ajay Giri (E00959)', user_id: 'ajay959.be@elbrit.org', status: 'Active' },
  // duplicate record for one person, also sharing the user_id
  { name: 'DE062', employee_name: 'Birat Kumar', user_id: 'birat@elbrit.org', status: 'Left' },
  { name: 'DE078', employee_name: 'Murdhul R', user_id: 'birat@elbrit.org', status: 'Active' },
  // an Employee with no login at all
  { name: 'E01189', employee_name: 'Abhinav Singh', user_id: '', status: 'Active' },
  { name: 'E00990', employee_name: 'Lavkush', user_id: 'lavkush990.be@elbrit.org', status: 'Active' },
]

const perms = [
  { name: 'p1', user: 'arunkumar893.be@elbrit.org', allow: 'Employee', for_value: 'E00893', apply_to_all_doctypes: 1 },
  { name: 'p2', user: 'arunkumar893.be@elbrit.org', allow: 'Employee', for_value: 'E01154', apply_to_all_doctypes: 1 },
  { name: 'p3', user: 'ajay959.be@elbrit.org', allow: 'Employee', for_value: 'V01745', apply_to_all_doctypes: 1 },
  { name: 'p4', user: 'birat@elbrit.org', allow: 'Employee', for_value: 'DE078', apply_to_all_doctypes: 1 },
  { name: 'p5', user: 'lavkush990.be@elbrit.org', allow: 'Employee', for_value: 'E01189', apply_to_all_doctypes: 1 },
  { name: 'p6', user: 'arunkumar893.be@elbrit.org', allow: 'Company', for_value: 'Elbrit Lifesciences Private Limited', apply_to_all_doctypes: 1 },
  { name: 'p7', user: 'someone.else@elbrit.org', allow: 'Employee', for_value: 'E99999', apply_to_all_doctypes: 1 },
  { name: 'p8', user: 'arunkumar893.be@elbrit.org', allow: 'Department', for_value: 'Sales - ELPL', apply_to_all_doctypes: 0, applicable_for: 'Sales Order' },
]

const { rows, kpis } = analysePermissions(perms, employees)
const by = Object.fromEntries(rows.map((r) => [r.name, r]))

console.log('\nOwn record vs someone else')
check('own employee record -> self, not flagged', [by.p1.ownership, by.p1.mismatch], ['self', false])
check("another person's record -> flagged", [by.p2.ownership, by.p2.mismatch], ['other', true])
check('  and names who it actually belongs to',
  [by.p2.targetEmployeeName, by.p2.targetEmployeeUser],
  ['Thamaraiselvan', 'thamaraiselvan1154.be@elbrit.org'])
check('  and the user’s own record', [by.p2.ownEmployeeId], ['E00893'])

console.log('\nThe false positives that the ID-only rule got wrong')
// Both of these are different Employee records, so an ID comparison flags them —
// but each carries this user's own user_id, so nobody is seeing another person.
check('vacant placeholder with the same user_id -> self',
  [by.p3.ownership, by.p3.mismatch], ['self', false])
check('duplicate employee record with the same user_id -> self',
  [by.p4.ownership, by.p4.mismatch], ['self', false])

console.log('\nEdge cases')
check('target employee has no login -> still another person', by.p5.mismatch, true)
check('target record does not exist -> dangling, not mismatch',
  [by.p7.ownership, by.p7.danglingTarget, by.p7.mismatch], ['missing', true, false])
check('non-Employee permission has no ownership verdict',
  [by.p6.ownership, by.p6.mismatch], [null, false])
check('applicable_for is carried through', by.p8.applicableFor, 'Sales Order')
check('applyToAll reflects the flag', [by.p6.applyToAll, by.p8.applyToAll], [true, false])

console.log('\nAggregates')
check('total', kpis.total, 8)
// arunkumar893, ajay959, birat, lavkush990, someone.else
check('distinct users', kpis.users, 5)
check('mismatched', kpis.mismatched, 2)
check('dangling', kpis.dangling, 1)
// p1 p2 p3 p4 p5 p7 — p7's target is missing but it is still Employee-scoped
check('employee-scoped', kpis.employeePerms, 6)
// someone.else@ has only an Employee perm; the others all have one too, so none
// are missing it here — the count must still be computed, not assumed.
check('users with no employee permission', kpis.usersWithoutEmployeePerm, 0)
check('mismatches sort to the top', rows.slice(0, 2).every((r) => r.mismatch), true)
check('Employee is offered first in the doctype list', COMMON_ALLOW_DOCTYPES[0], 'Employee')

console.log(failures ? `\n${failures} FAILED\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
