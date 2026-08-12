/**
 * ERPNext User Permission — list, create, delete.
 *
 * A User Permission restricts what one ERP user can see: `allow` names a doctype
 * (Company, Employee, Department, Territory…) and `for_value` the single record
 * they are limited to. Get these wrong and someone either can't see their own
 * data or can see somebody else's.
 *
 * THIS MODULE WRITES TO ERP. Everything else in this tool is read-only. Creating
 * or deleting a permission changes what a real person can access, immediately, so
 * the delete path takes an explicit name and never a filter — there is no way to
 * ask it to "delete everything matching X".
 */

import { erpFetch, normEmail, cleanDept } from './audit.mjs'

const PERMISSION_FIELDS = [
  'name', 'user', 'allow', 'for_value', 'apply_to_all_doctypes',
  'applicable_for', 'is_default', 'hide_descendants', 'creation', 'owner',
]

/** Doctypes worth offering; `allow` accepts any doctype, these are the ones used. */
export const COMMON_ALLOW_DOCTYPES = [
  'Employee', 'Company', 'Department', 'Territory', 'Customer',
  'Sales Person', 'Branch', 'Cost Center', 'Warehouse', 'Item Group',
]

const PAGE = 500

/** @param {{user?: string}} filter — omit `user` to list every permission. */
export async function listUserPermissions(creds, { user } = {}) {
  const out = []
  for (let start = 0; ; start += PAGE) {
    const q = new URLSearchParams({
      fields: JSON.stringify(PERMISSION_FIELDS),
      limit_start: String(start),
      limit_page_length: String(PAGE),
      order_by: 'user asc',
    })
    if (user) q.set('filters', JSON.stringify([['user', '=', user]]))
    const json = await erpFetch(`/api/resource/User%20Permission?${q}`, creds)
    const rows = json?.data || []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

/**
 * Employee identity for cross-checking, keyed both ways so we can ask
 * "whose record is E01263?" and "which record is this user's?".
 */
export async function fetchEmployeeIndex(creds) {
  const out = []
  for (let start = 0; ; start += PAGE) {
    const q = new URLSearchParams({
      fields: JSON.stringify(['name', 'employee_name', 'user_id', 'status', 'department', 'designation']),
      limit_start: String(start),
      limit_page_length: String(PAGE),
      order_by: 'name asc',
    })
    const json = await erpFetch(`/api/resource/Employee?${q}`, creds)
    const rows = json?.data || []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

/**
 * Annotate each permission with what it actually means, and flag the dangerous
 * shape: an `Employee` permission pointing at a record that belongs to someone
 * else. Seen live — `adhithan1011.be@elbrit.org` was permitted onto `E01263`,
 * which is `sujith1263`'s record, so they could see another person's data.
 */
export function analysePermissions(permissions, employees) {
  const empById = new Map(employees.map((e) => [e.name, e]))
  const empByUser = new Map()
  for (const e of employees) {
    const uid = normEmail(e.user_id)
    if (uid && !empByUser.has(uid)) empByUser.set(uid, e)
  }

  const rows = permissions.map((p) => {
    const user = normEmail(p.user)
    const own = empByUser.get(user) || null
    const target = p.allow === 'Employee' ? empById.get(p.for_value) || null : null

    /**
     * Does this Employee permission point at the user's OWN record?
     *
     * Comparing record ids alone is too strict and produced false positives: a
     * user's `user_id` can appear on more than one Employee record — a vacant
     * placeholder (`ajay959` is on both `E00959` and `Vacant_Ajay Giri V01745`)
     * or a duplicate (`birat@elbrit.org` on `DE062` and `DE078`). Those are ERP
     * data faults, but they are NOT someone seeing another person's data, so the
     * target counts as "self" when it carries this user's own `user_id`.
     */
    let ownership = null
    if (p.allow === 'Employee') {
      if (!target) ownership = 'missing'
      else if (normEmail(target.user_id) === user) ownership = 'self'
      else if (!own) ownership = 'unknown'
      else ownership = target.name === own.name ? 'self' : 'other'
    }

    return {
      name: p.name,
      user: p.user,
      allow: p.allow,
      forValue: p.for_value,
      applyToAll: Boolean(p.apply_to_all_doctypes),
      applicableFor: p.applicable_for || '',
      isDefault: Boolean(p.is_default),
      hideDescendants: Boolean(p.hide_descendants),
      created: p.creation ? String(p.creation).slice(0, 16) : '',
      createdBy: p.owner || '',

      ownEmployeeId: own?.name || '',
      ownEmployeeName: own?.employee_name || '',
      /**
       * Role and department of the person the permission belongs to, so this page
       * can be narrowed the same way the audit views are ("every BE in Elbrit
       * Chennai") instead of only by exact user address. Blank when no Employee
       * record carries this user_id — an ERP fault in its own right.
       */
      role: own?.designation || '',
      department: own?.department ? cleanDept(own.department) : '',
      targetEmployeeName: target?.employee_name || '',
      targetEmployeeUser: target?.user_id || '',
      // Where the permission points, for the export — a mismatch is easier to
      // judge when you can see it crosses a department boundary.
      targetRole: target?.designation || '',
      targetDepartment: target?.department ? cleanDept(target.department) : '',
      ownership,
      /** The one to act on: this user is permitted onto another person's record. */
      mismatch: ownership === 'other',
      danglingTarget: ownership === 'missing',
      /**
       * Cannot be judged either way: no Employee record carries the permission
       * holder's address, so there is nothing to compare the target against. It
       * must NOT read as "self" — 35 rows did on live data, showing a green tick
       * next to somebody else's name. `adhithan1011.be@elbrit.org` → E01263
       * "Sujith" is a different person; `arunkumar817.be@elbrit.org` → E00817
       * "Arunkumar M" is the same person on a since-renamed login
       * (`arunkumar.abm@`). Only a human can tell those apart.
       */
      unverified: ownership === 'unknown',
    }
  })

  const byUser = new Map()
  for (const r of rows) {
    const k = normEmail(r.user)
    if (!byUser.has(k)) byUser.set(k, [])
    byUser.get(k).push(r)
  }

  return {
    rows: rows.sort((a, b) =>
      Number(b.mismatch) - Number(a.mismatch) || a.user.localeCompare(b.user) || a.allow.localeCompare(b.allow)),
    kpis: {
      total: rows.length,
      users: byUser.size,
      mismatched: rows.filter((r) => r.mismatch).length,
      unverified: rows.filter((r) => r.unverified).length,
      dangling: rows.filter((r) => r.danglingTarget).length,
      employeePerms: rows.filter((r) => r.allow === 'Employee').length,
      // A user with no Employee permission at all often cannot see their own
      // records in the app, which is the other half of this problem.
      usersWithoutEmployeePerm: [...byUser.values()]
        .filter((list) => !list.some((r) => r.allow === 'Employee')).length,
    },
  }
}

/**
 * Create one permission. Frappe rejects duplicates itself, so no pre-check here —
 * its error message is clearer than anything reconstructed.
 */
export async function createUserPermission(creds, { user, allow, forValue, applyToAll = true, applicableFor = '' }) {
  const missing = ['user', 'allow', 'forValue'].filter((k) => !String({ user, allow, forValue }[k] ?? '').trim())
  if (missing.length) {
    const err = new Error(`Missing: ${missing.join(', ')}`)
    err.code = 'BAD_INPUT'
    throw err
  }
  const body = {
    user: String(user).trim(),
    allow: String(allow).trim(),
    for_value: String(forValue).trim(),
    apply_to_all_doctypes: applyToAll ? 1 : 0,
  }
  // Frappe wants apply_to_all_doctypes cleared when a specific doctype is named.
  if (!applyToAll && applicableFor) {
    body.applicable_for = String(applicableFor).trim()
  }
  const json = await erpFetch('/api/resource/User%20Permission', {
    ...creds, method: 'POST', body,
  })
  return json?.data || null
}

/** Delete by exact `name`. Never by filter — see the module note. */
export async function deleteUserPermission(creds, name) {
  const id = String(name ?? '').trim()
  if (!id) {
    const err = new Error('A permission name is required.')
    err.code = 'BAD_INPUT'
    throw err
  }
  await erpFetch(`/api/resource/User%20Permission/${encodeURIComponent(id)}`, {
    ...creds, method: 'DELETE',
  })
  return { deleted: id }
}

/** Values selectable for `for_value`, so the form isn't free-text guesswork. */
export async function listAllowOptions(creds, doctype) {
  const dt = String(doctype ?? '').trim()
  if (!dt) return []
  const fields = dt === 'Employee'
    ? ['name', 'employee_name']
    : ['name']
  const q = new URLSearchParams({
    fields: JSON.stringify(fields),
    limit_page_length: '2000',
    order_by: 'name asc',
  })
  const json = await erpFetch(`/api/resource/${encodeURIComponent(dt)}?${q}`, creds)
  return (json?.data || []).map((r) => ({
    value: r.name,
    label: r.employee_name ? `${r.name} — ${r.employee_name}` : r.name,
  }))
}
