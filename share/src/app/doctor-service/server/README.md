# Doctor Service — ERP setup

This is what the app's "Add service", "Services" and "Service approval" screens need in ERP.
The four scripts in this folder go into **Server Script** exactly as written. Each file's
header gives its name, type and method.

## Who does what

| Who | ERP roles | Can do |
|---|---|---|
| MIS team (e.g. vishnu.mis) and IT | `MIS`, `User MIS`, `MIS Admin`, `Manager MIS`, `CRM Manager`, `IT` | Add a service (that submits it), edit and resubmit one that was sent back |
| MIS (verifier) | `MIS` | Verify, or reject, after the final approval |
| GM | `GM` | Send on to CEO, Approve as final, Send back, Reject |
| CEO | `CEO` | Approve, Send back, Reject |
| IT (view only) | an `IT…` role profile without the `IT` role | See everything, change nothing |

RBM / SM do not enter services. MIS enters each one **on behalf of** an RBM or SM linked to
the doctor (ZSMs are not offered). That person goes in `by`, and the department and HQ are
taken from them.

## Approval: the Operational Tracker, started at GM

Approval runs on the service's **Operational Tracker** ("Approval flow" workflow, Approval
Settings "Doctor Service": final approver CEO, verifier MIS), the same way it does for
Secondary and Doctor Support. **Saving submits.** There is no draft: the guard makes the
tracker on the first save and starts it at **GM**, whatever the on-behalf person's grade.

| Step | Tracker state | Who | App action → workflow action |
|---|---|---|---|
| MIS saves | GM Approval Waiting | MIS | (the guard sets it) |
| GM sends on | CEO Approval Waiting | GM | Send to CEO → `Approve` |
| GM approves as final | GM Approved and Waiting for Verification | GM | Approve as final → `Approve to Verification` |
| CEO approves | CEO Approved and Waiting for Verification | CEO | Approve → `Approve to Verification` |
| MIS verifies | Approved and Verified | MIS | Verify → `Approve` |
| MIS rejects at verification | X Approved and Verification Rejected | MIS | Reject → `Reject` |
| GM / CEO send back | Rework | GM / CEO | Send back → `Revisit` (+ reason) |
| MIS edits and saves | GM Approval Waiting | MIS | (the guard resets it) |
| GM / CEO reject | GM / CEO Rejected (final) | GM / CEO | Reject → `Reject` (+ reason) |

- The next approver is the first active user with the `GM` role above the on-behalf
  employee (`reports_to`). The fallback approver is that GM's manager (the CEO).
- The reason for a rejection or send-back goes in the tracker's `reason_for_rejection`.
- The team's "Doctor service tracker" script (desk entries, `date` next month or later) never
  fires for app rows, because they carry today's date.
- The team's "operational tracker" script copies each tracker step into the service's
  `workflow_state`, as it does for every other tracker.

## UAT changes made outside these scripts (2026-10-12)

Do the same on production when it goes live:

1. **"Approval flow" workflow:** added the CEO's steps at `CEO Approval Waiting`:
   - **Approve to Verification** → `CEO Approved and Waiting for Verification` (role CEO)
   - **Reject** → `CEO Rejected` (role CEO)

   Before this, the only CEO action there was Revisit, so anything the GM sent on got stuck.
2. **"Doctor Service" workflow (the doctype's own):** set **inactive**. Approval lives on
   the tracker. While this workflow was active, any save of a service in approval failed
   with "Rework is not a valid Workflow State". That also blocked the desk's own entries.
3. **"operational tracker" script (section 2):** a step that lands in
   "… Approved and Waiting for Verification" now counts as final, as when the GM approves
   as final. So the next approver is cleared, the verifier is set and the MIS ToDo is made.
   Before, it moved the next approver up to the CEO and made no ToDo.
4. **Role Profile "IT":** given the **MIS** role, so IT testers (vishnuk.mis) can verify.
   This is for UAT testing only; decide whether to keep it.

Tested on UAT through ERP saves, not by clicking in the app:
- save → GM;
- GM as final → MIS ToDo → verified;
- GM → CEO → CEO approves → MIS ToDo;
- sent back → MIS edits → back to GM, with the reason kept as a comment.

## Custom fields on Doctor Service

| Field | Type | Needed | Purpose |
|---|---|---|---|
| `custom_via_app` | Check | **Yes** | Set by the app. Only these rows are guarded and listed |
| `custom_tracker` | Link → Operational Tracker | **Yes** (exists) | The service's tracker |
| `custom_entered_by` | Link → Employee | Recommended | The MIS person who entered it (`by` is the RBM/SM) |

`custom_rejection_reason` (made on 2026-10-12) is no longer used, because the reason lives on
the tracker. It can be deleted. `service_attachement` stays **optional**.

## Custom field on Doctor Service Master

| Field | Type | Values |
|---|---|---|
| `custom_category` | Select | Cash, EMI, Bookings, Gift |

The form groups sub-services by this field. Until it exists, the form uses the app's
built-in list.

## Scripts

| File | Type | What it does |
|---|---|---|
| `elbrit_doctor_service_options.py` | API `elbrit_doctor_service_options` | Who is asking (can add / can see / approver / verifier). With `doctor=`: the RBMs / SMs linked to that doctor (with department + HQ pairs) and the service list |
| `elbrit_doctor_service_list.py` | API `elbrit_doctor_service_list` | Every app-raised service, with its tracker's state, reason, the person it waits on, the history (tracker steps and comments) and each doctor's average monthly support |
| `elbrit_doctor_service_insight.py` | API `elbrit_doctor_service_insight` | One doctor: support by month (18 months), every service, last 3 visits by role (the "Is this doctor worth it?" block) |
| `doctor_service_guard.py` | DocType Event, Before Save | On app rows: MIS-only edits, edit lock once in approval (Rework re-opens it), on-behalf employee must be linked to the doctor, sets department / HQ, amount > 0, date not in future. Makes or resets the tracker at GM |

The app writes as the signed-in user. Each step is a plain Frappe call:
- **Save:** `POST` / `PUT /api/resource/Doctor Service`. The guard does the submit.
- **Decide:** `frappe.model.workflow.apply_workflow` on the tracker, then
  `frappe.client.set_value` for the reason. This is the same path Secondary Approval uses.
- **Attach:** `/api/method/upload_file`. The guard allows the attachment to be added while the
  service waits on GM.

The three API scripts each carry a copy of `viewer_of()` (who may see / add / approve), so
change all three together. `linked_managers()` is shared by options and the guard the same
way.

## Gotchas

- A DocType Event script can't use top-level helper functions, because they can't see `doc`
  or each other. That is why the guard is one `guard(doc)` function.
- A new tracker is inserted and then moved to its starting step with `db.set_value`. This
  matches what the team's own script does: the workflow starts every new tracker at ABM and
  has no step out of Rework.
