# Secondary approval

An approver's month of secondary submissions to decide, and a BE's view of
where their own stands. Sibling of `../secondary-entry` (the entry side of
the same flow); it reuses that folder's formatting, date helpers and the
unsaved-changes guard.

- `components/SecondaryApproval.jsx` — the screen (DataView child).
- `components/SubmissionCard.jsx` — strip, chain, the card and its table.
- `components/ReviewPage.jsx` — "Review line by line": a decision per stockist.
- `data/shape.js` — tracker rows → slices → submissions.
- `data/selectors.js` — what the viewer sees, progress, month-on-month.
- `data/writes.js` — decisions via Frappe's workflow actions (`apply_workflow`) and the revisit note.
- Harness: `/dev/secondary-approval` (mock by default; live is a dry run until switched on).

## Model

One **Operational Tracker** per stockist × seat × month (the server script opens
it when a seat's lines are all out of Draft). A **submission** is everything one
person raised for one month, so its card holds several trackers; Approve / Revisit
on the card decides the ones routed to the viewer (`next_approver`, or
`custom_fallback_approver` for a vacant seat) in one batched call.

## The saved query — `gql/SecondaryApproval`

Saved in Firestore (preset `Default`, `urlKey: ERP`, `month: false`) — that
document is the one source; the dev harness's UAT mode runs it too, pointed
at UAT. No viewer filter: the ERP's permission query ("Operational Tracker
Restriction") already limits a sales user to trackers routed to them plus
decided ones in their own role-profile subtree. An admin token sees every
tracker, which is what the harness's "Viewer email" / "Decide as" are for.

It must select, per Operational Tracker node: `name`, `role_profile__name`,
`workflow_state__name`, `next_role__name`, `next_approver__name`,
`custom_fallback_approver__name`, `user { name full_name }`,
`modified_by__name`, `hq__name`, `data`, `reason_for_rejection` (the revisit
note), and `custom_ref_secondary_data_entry { name date distributor__name
distributor { whg_ebs_code territory__name } items { item__name item {
brand__name } sales_qty sales_value closing_qty closing_balance
custom_role_profile__name } }`.

The `SecondaryEntry` query (Secondary Entry's) must select, under
`custom_status_tracker`, `tracker { workflow_state__name reason_for_rejection }`
— how a stockist sent back for revisit is recognised.

## Known ERP gaps (not ours to fix here)

- **How decisions are made.** Not through the custom `operational_tracker_decision`
  method (server script "Secondary Operational Tracker" — its revisit is refused,
  below, and the ERP team does not own it) but through Frappe's standard
  workflow actions: approve = `apply_workflow` "Approve to Verification";
  revisit = the note "Revisit (from <state>): <reason>" on a waiting approval,
  or `apply_workflow` "Revisit" then the note on an approved-unverified one.
  The tracker's Before Save runs as before — compared field by field on UAT.
  The ERP still checks the caller's **role** (the workflow) and **read access**
  (the "Operational Tracker Restriction" permission query): another ABM cannot
  read or decide a tracker not routed to them. For testing, decide with the
  approver's own token.
- An RBM covering a **vacant** ABM is routed the approval but refused by the
  workflow (approve and revisit are allowed for ABM only). Recorded, with the
  fix, in `erp-evidence/` (outside this repo).
- A BE cannot see their own **pending** trackers: the permission query shows
  trackers routed to the user, and decided ones in their subtree, but not
  waiting ones in their own seat. The Self card only fills in once that
  query also allows `role_profile = <my seat>`.
- **The method's revisit is broken** (why the app no longer uses it).
  `operational_tracker_decision` revisits by first writing "ABM Rejected" and
  then saving "ABM Approval Waiting"; the "Approval flow" workflow has no
  "ABM Rejected → ABM Approval Waiting" transition, so Frappe refuses it
  ("Workflow State transition not allowed"). Fix, proven on UAT: add
  `ABM Rejected --Revisit--> ABM Approval Waiting`, allowed ABM (and the same
  for RBM/SM/… levels if they revisit). A failed revisit from "Approved and
  Waiting for Verification" also left the entry's tracker row out of step
  with its tracker — the method only rolls the tracker back.
- A revisit does not notify the BE: the state goes "Approval Waiting" →
  "Approval Waiting", and the notification script fires on a change only.
- The revisit note stays on the tracker after it is approved again; the
  screens read it as "sent back" only while the tracker is waiting.
- This screen uses Revisit, not Reject. A rejected tracker is never
  restarted when the seat resubmits (see
  `../secondary-entry` — verified on UAT).
