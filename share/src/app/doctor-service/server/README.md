# Doctor Service — ERP setup

This is what the app's "Add service", "Services" and "Service approval" screens need in ERP.
The ERP team sets up the workflow, roles and fields. The four scripts in this folder are
pasted into **Server Script** exactly as written; each file's header gives its name, type and
method.

## Who does what

| Who | ERP roles | Can do |
|---|---|---|
| MIS team (e.g. vishnu.mis) and IT | `MIS`, `User MIS`, `MIS Admin`, `Manager MIS`, `CRM Manager`, `IT` | Add and edit services (Draft / Rejected), submit them |
| GM | `GM` | Approve (sends to CEO), Approve as final, Reject |
| CEO | `CEO` | Approve, Reject |
| IT (view only) | an `IT…` role profile without the `IT` role | See everything, change nothing |

RBM / SM do not enter services. MIS enters each one **on behalf of** an RBM or SM linked to
the doctor; that person goes in `by`, and the department and HQ are taken from them.
Seeing doctor services (both pages, the doctor page's Services card) is IT, MIS, GM and CEO.

## Workflow (Doctor Service)

States: `Draft`, `GM Approval`, `CEO Approval`, `Approved`, `Rejected`.

| From | Action (exact name) | To | Allowed role |
|---|---|---|---|
| Draft | Submit | GM Approval | MIS roles (one transition row per role) |
| Rejected | Submit | GM Approval | MIS roles |
| GM Approval | Approve | CEO Approval | GM |
| GM Approval | Approve as final | Approved | GM |
| GM Approval | Reject | Rejected | GM |
| CEO Approval | Approve | Approved | CEO |
| CEO Approval | Reject | Rejected | CEO |

- The action names must match exactly — the app calls `apply_workflow` with these names.
- Leave transition **conditions** empty.
- Allow edit in `Draft` and `Rejected`: the MIS roles. Every other state: GM / CEO only.
  The guard script also blocks content edits once a service is out of Draft / Rejected.
- **Old rows:** about 26.7k existing rows have `workflow_state = Draft`. Turning the
  workflow on must not move them anywhere. The app only lists rows with
  `custom_via_app = 1`, and the guard only checks those.

## Custom fields on Doctor Service

| Field | Type | Needed | Purpose |
|---|---|---|---|
| `custom_via_app` | Check | **Yes** | Set by the app. Only these rows are guarded and listed |
| `custom_rejection_reason` | Small Text | **Yes** | Required when rejecting, shown to MIS |
| `custom_entered_by` | Link → Employee | Recommended | The MIS person who entered it (`by` is the RBM/SM) |
| `custom_gm_action_by` / `custom_gm_action_on` | Link → Employee / Datetime | Recommended | GM's decision |
| `custom_ceo_action_by` / `custom_ceo_action_on` | Link → Employee / Datetime | Recommended | CEO's decision |
| `custom_ceo_skipped` | Check | Recommended | GM approved as final |

The recommended fields are optional: the scripts write them only if they exist.
`service_attachement` stays **optional**.

## Custom field on Doctor Service Master

| Field | Type | Values |
|---|---|---|
| `custom_category` | Select | Cash, EMI, Bookings, Gift |

The form groups sub-services by this. Until it exists, the form falls back to the app's
built-in list.

## Scripts

| File | Type | What it does |
|---|---|---|
| `elbrit_doctor_service_options.py` | API `elbrit_doctor_service_options` | Who is asking (can add / can see / approver). With `doctor=`: the RBM / SM linked to that doctor (with department + HQ pairs) and the service list |
| `elbrit_doctor_service_list.py` | API `elbrit_doctor_service_list` | Every app-raised service for the two pages, with names, history and each doctor's average monthly support. IT / MIS / GM / CEO only |
| `elbrit_doctor_service_insight.py` | API `elbrit_doctor_service_insight` | One doctor: support by month (18 months), every service, last 3 visits by role — the "Is this doctor worth it?" block |
| `doctor_service_guard.py` | DocType Event, Before Save | Checks for app rows: MIS-only edits, edit lock after submit, on-behalf employee must be linked to the doctor, sets department / HQ, amount > 0, date not in future, rejection reason, approval stamps |

The app writes with plain Frappe calls as the signed-in user: `POST /api/resource/Doctor Service`
(`custom_via_app: 1`), then `frappe.model.workflow.apply_workflow` for Submit / Approve /
Approve as final / Reject — the same way Secondary Approval decides — and
`/api/method/upload_file` for the optional attachment. So the workflow's roles are the
only gate on who may do what, and the guard checks every save.

The three API scripts each carry a copy of `viewer_of()` (who may see / add / approve) —
change all three together. `linked_managers()` is shared by options and the guard the same way.

## Deployed on UAT (2026-10-12)

All four scripts and the two required fields (`custom_via_app`, `custom_rejection_reason`)
are live on UAT. A test create through the guard worked (department / HQ / role profile set
from the on-behalf RBM), an ABM as "on behalf of" was refused, and the test record was deleted.

**Permissions (done 2026-10-12):** `MIS`, `MIS Admin`, `Manager MIS`, `CRM Manager` and `IT`
have Doctor Service Read / Write / Create / Report / Export / Print (Custom DocPerm). Delete
is not granted, so "Delete draft" in the app is refused for them. The guard's `ENTRY_ROLES`
matches this list.

Still with the ERP team on UAT:
- **Workflow**: still the old Draft → ABM → RBM → SM → GM → CEO route. Change it to the
  table above (Submit from Draft / Rejected, GM Approve / Approve as final / Reject,
  CEO Approve / Reject). Until then Save draft works; Save & submit does not.
- **Operational Tracker**: the existing "Doctor service tracker" script (Before Save) makes
  an OT only when `date` is next month or later. Test it with the workflow once that is in.

Gotcha for anyone editing the guard: a DocType Event script cannot use top-level helper
functions (they cannot see `doc` or each other), so the guard is one `guard(doc)` function.
