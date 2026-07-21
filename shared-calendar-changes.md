# Shared Calendar — Local Changes vs `npm run copy-shared`

**Generated:** 2026-07-21

## How this was produced

`npm run copy-shared` pulls the `shared/` folder fresh from `elbrit-dev/playground`
(via `degit`), overwriting the local copy. To find exactly what we've changed since
the last pull, the upstream `shared/calendar` was re-fetched into a temp folder and
diffed file-by-file against the local `shared/calendar`.

- **Upstream baseline:** all upstream files carry a `2026-07-17` timestamp.
- **Our work:** local changes span **2026-07-17 → 2026-07-21** (the "last few days").

## Result at a glance

| | Count |
|---|---|
| Files **modified** (differ from upstream) | 20 |
| Files **added** locally (genuine new work) | 3 |
| Files present locally but stale/unused (not this work) | 2 |

The changes cluster into **6 feature themes**. The same theme often touches several
files (e.g. "escalation approver" spans 9 files), so the file table at the end is
grouped by theme.

---

## Theme 1 — Escalation (second-level) leave approver

A leave can now be approved/rejected not only by the assigned approver (one level up,
e.g. the ABM) but also by an **escalation approver** one further level up (e.g. the RBM).
This is threaded end-to-end — from the logged-in user profile, through the form and
schema, into the ERP write, and into the permission check — **without any ERP schema
change** (reuses the existing `custom_escalation_approver` field).

| File | Overview of change |
|---|---|
| `components/auth/calendar-users.js` | Adds `escalation_approver` to the `LOGGED_IN_USER` shape. |
| `components/auth/auth-context.jsx` | Populates `LOGGED_IN_USER.escalation_approver` from the `me` query. |
| `components/calendar/constants.js` | `buildEventDefaultValues` seeds `escalation_approver` (from event, else logged-in user). |
| `components/calendar/schemas.js` | Adds optional `escalation_approver` field to the Zod form schema. |
| `components/calendar/module/leave/graphql/leave.query.js` | Fetches `custom_escalation_approver__name` for leave applications. |
| `components/calendar/module/leave/mappers/leave.mapper.js` | On create, writes `custom_escalation_approver`; on read, resolves the escalation approver (object / `__name` / string). |
| `lib/calendar/form-config.js` | Adds the **Escalation Approver** field to the leave detail layout. |
| `lib/calendar/resolveDisplay.js` | Adds an `escalation_approver` display resolver (email → employee label). |
| `lib/leavePermissions.js` | Approve/reject rights now match the logged-in user against **either** the approver **or** the escalation approver. |

---

## Theme 2 — Leave approval/rejection workflow + real error messages + balance fix

The biggest functional fix. Three related problems in leave handling were addressed,
mostly inside `leave.service.js`.

**(a) Rejection was silently failing / reverting.** ERP's Leave Application `status`
is a Title-Case Select (`Open`/`Approved`/`Rejected`/`Cancelled`) — the old code sent
UPPERCASE (`REJECTED`), which ERP refused. Worse, the "Leave Approval" workflow reverts
a *direct* status write. Rejection is now performed the sanctioned way: via the
workflow **action** (`apply_workflow` → `"Reject"`), exactly what the desk button does.
Both Approved and Rejected are now treated as submitted states (docstatus 1).

**(b) Errors were opaque.** Failures showed only `HTTP 417`. A new `extractErpError()`
digs the real reason out of Frappe's `_server_messages` / `exception` (e.g.
"Insufficient leave balance for Casual Leave") and surfaces it to the user.

**(c) Leave balance showed the wrong period.** ERP returns both last period's and the
current period's allocation for the same leave type. The balance calc now keeps only
the allocation whose `from_date`/`to_date` window covers **today**, and only counts
used/pending leaves that fall inside that current window.

| File | Overview of change |
|---|---|
| `components/calendar/module/leave/services/leave.service.js` | Title-Case status map; `extractErpError()`; reject-via-workflow-action; Approved+Rejected both require submit; current-period-only leave-balance computation. |
| `components/calendar/module/leave/components/leave-dialog.jsx` | Shows ERP's real error text on status-update failure; supports **function-based field labels** (label changes with status). |
| `components/calendar/module/leave/graphql/leave.query.js` | Also fetches `from_date`/`to_date` on allocations and `from_date` on used/pending — the data the balance-period fix needs. |
| `components/calendar/module/leave/mappers/leave.mapper.js` | Create payload uses Title-Case `STATUS.OPEN` (not `"OPEN"`) so the workflow accepts it. |
| `lib/calendar/form-config.js` | Approver label is now state-aware: "Approved By" / "Rejected By" / "Approver" (pending). |

---

## Theme 3 — Manual "Sync" button + block event creation while on approved leave

Adds an explicit **Sync** button to the header that hard-refreshes calendar data, and
prevents creating an event on a day the user is already on approved leave.

| File | Overview of change |
|---|---|
| `lib/calendar/leaveDay.js` **(NEW)** | `isEmployeeOnApprovedLeave(events, employeeId, date)` — true only for **Approved** leave covering that day. |
| `components/calendar/contexts/calendar-context.jsx` | New `syncCalendar()` — clears event/leave caches then re-fetches fresh from ERP (no full reload); exposed on context. |
| `components/calendar/header/calendar-header.jsx` | Adds the Sync button (spinner + disabled while syncing); disables "Add Event" when the user is on leave that day. |
| `components/calendar/dialogs/add-edit-event-dialog.jsx` | Central guard: blocks opening the add form (any entry point) when on approved leave. Also simplifies the employee picker to show **all** employees (see Theme 6). |

---

## Theme 4 — Doctor-visit consistency across roles + doctor name/notes resolution

Fixes the doctor-visit dialog showing different data depending on who opened it (BE vs
ABM vs RBM), and doctors whose name/notes sometimes rendered blank.

- **Same view for everyone:** participants and "visited" status are now derived from the
  shared event data (attendance + captured location per participant), resolved against
  the **full** employee list (`allEmployeeOptions`) instead of the viewer's role-scoped
  slice. The green completion check shows per participant to all viewers. The viewer's
  own visit only drives the footer buttons, never the displayed status.
- **Doctor always resolves:** the loaded `doctorOptions` list is capped and may miss a
  visit's doctor; a new single-doctor fetch fills it in so name and notes always render.

| File | Overview of change |
|---|---|
| `components/calendar/module/event/components/event-details/doctor-visit-dialog.jsx` | Role-consistent participant roster & visit-complete status; per-participant `visited`; on-demand fetch of the visit's doctor when missing from options. |
| `components/calendar/module/event/components/DoctorNotesSection.jsx` | After add/delete note, refreshes **only that doctor** (`fetchDoctorById`) and merges it in — instead of replacing the whole capped list (which could drop the doctor). |
| `components/calendar/module/event/services/master-data.service.js` | New `fetchDoctorById(name)` — single-`Lead` query (with notes) for doctors outside the capped list slice. |
| `components/calendar/module/event/mappers/event-to-erp.js` | Clamps `ends_on` so it's never before `starts_on` when a visit is force-completed early (ERP rejects end-before-start). |

---

## Theme 5 — Meeting event type (new detail dialog)

Adds a dedicated **Meeting** detail dialog that renders differently for the creator, the
host (conductor), participants, and passive viewers — with the host **derived** from
participant role profiles (no ERP "host" field needed).

| File | Overview of change |
|---|---|
| `lib/meetingRoles.js` **(NEW)** | Resolves the meeting host (highest-ranked ≥ ABM participant) and classifies the viewer as creator / host / participant / viewer. |
| `components/calendar/module/event/components/event-details/meeting-dialog.jsx` **(NEW)** | The meeting detail view: role chip, conductor/creator, team roster (host badged with a crown), Google Meet link, role-based edit/delete. |
| `components/calendar/dialogs/event-details-dialog.jsx` | Registers `EventMeetingDialog` as the layout for `TAG_IDS.MEETING`. |

---

## Theme 6 — Employee / department / designation filtering in the header

Richer team-picker behaviour in the header.

| File | Overview of change |
|---|---|
| `components/calendar/header/user-select.jsx` | Selecting a **department** now drives the calendar (auto-selects that whole team's events); "All departments" resets. Adds **designation** and **department** filter selects inside the sticky search area of the popover. |
| `components/calendar/dialogs/add-edit-event-dialog.jsx` | Employee picker now shows **all** employees (like the Share dialog) instead of only the logged-in user's department subtree. *(Also listed under Theme 3.)* |

---

## Files that differ but are NOT part of this work

These two exist locally but not in upstream. They were last touched in **Feb 2026**
(commits `7626ff9 added calender`, `3fa7e4d updated calender`) and are **imported
nowhere** in the current code — orphaned legacy files, not part of the recent calendar
work. Safe to ignore (or delete) unless you know a reason to keep them.

- `services/erp-graphql-to-event.js`
- `services/event-to-erp-graphql.js`

> Note: `services/events.query.js(previous)` also exists locally as an obvious backup
> file; it's likewise stale.

---

## Complete file list (25 differences)

**Modified (20):**
1. `components/auth/auth-context.jsx`
2. `components/auth/calendar-users.js`
3. `components/calendar/constants.js`
4. `components/calendar/contexts/calendar-context.jsx`
5. `components/calendar/dialogs/add-edit-event-dialog.jsx`
6. `components/calendar/dialogs/event-details-dialog.jsx`
7. `components/calendar/header/calendar-header.jsx`
8. `components/calendar/header/user-select.jsx`
9. `components/calendar/module/event/components/DoctorNotesSection.jsx`
10. `components/calendar/module/event/components/event-details/doctor-visit-dialog.jsx`
11. `components/calendar/module/event/mappers/event-to-erp.js`
12. `components/calendar/module/event/services/master-data.service.js`
13. `components/calendar/module/leave/components/leave-dialog.jsx`
14. `components/calendar/module/leave/graphql/leave.query.js`
15. `components/calendar/module/leave/mappers/leave.mapper.js`
16. `components/calendar/module/leave/services/leave.service.js`
17. `components/calendar/schemas.js`
18. `lib/calendar/form-config.js`
19. `lib/calendar/resolveDisplay.js`
20. `lib/leavePermissions.js`

**Added — genuine new work (3):**
21. `components/calendar/module/event/components/event-details/meeting-dialog.jsx`
22. `lib/calendar/leaveDay.js`
23. `lib/meetingRoles.js`

**Added — stale/unused (2):**
24. `services/erp-graphql-to-event.js`
25. `services/event-to-erp-graphql.js`

> ⚠️ Re-running `npm run copy-shared` will **overwrite all 20 modified files** with the
> upstream versions and wipe these changes. The 5 added files would survive (degit only
> overwrites files that exist upstream), but they'd be left orphaned. Push these changes
> upstream to `elbrit-dev/playground` before pulling again.
