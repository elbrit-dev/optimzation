# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Rework Approved
#   Script Type : API
#   API Method  : elbrit_rework_approved
#   Allow Guest : NO
#
# REWORK AFTER APPROVAL: the switch, and who may.
#
# An RBM (an SM / ZSM, or an extra user, alike) may send a Secondary or
# Doctor Support entry of their team back to Rework after it was approved —
# by their ABM or by themselves — while it still waits for MIS verification
# ("<X> Approved and Waiting for Verification"). Once verified it is final.
#
# THE SWITCH is REWORK_APPROVED, just below. Set it to False — or tick this
# script's Disabled box — and the feature is off everywhere at once:
#   - the "Approval flow" steps that allow it (scripts/erp/approval-flow-
#     extra.mjs) read this script's text and Disabled box in their
#     condition, so the ERP refuses the step, the ERP desk included;
#   - this method answers no trackers, so the app offers no Rework button.
#
#   GET /api/method/elbrit_rework_approved?trackers=["<tracker>", ...]
#   -> { enabled, user, seat, trackers: [those the caller may send back now] }
#
# WHO, as the workflow condition checks it: the user is in EXTRA_USERS or
# their seat (the User's role_profile_name) is an RBM / SM seat
# (EXTRA_SEATS), and the tracker's seat is one to three levels under theirs
# in the Role Profile tree. EXTRA_USERS / EXTRA_SEATS are copies of the
# lists in the entry scripts and approval-flow-extra.mjs: change them
# together. The sending back itself is the workflow's "Revisit", applied by
# the app as the user, so the ERP's own tracker scripts run as for any
# rework; "Elbrit Rework Clears Verification" cancels the MIS verification
# task it leaves open.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

REWORK_APPROVED = True

EXTRA_USERS = ["kamesh@elbrit.org", "ramu@elbrit.org", "rahulbhargav@elbrit.org"]
EXTRA_SEATS = ["RBM", "SRBM", "Deputy RBM", "SM"]
DOCTYPES = ["Secondary Data Entry", "Doctor Support"]
SUFFIX = " Approved and Waiting for Verification"
LEVELS = 3

me = frappe.session.user
seat = frappe.db.get_value("User", me, "role_profile_name") or ""
extra = me in EXTRA_USERS or seat.split("-")[0] in EXTRA_SEATS

asked = []
raw = frappe.form_dict.get("trackers")
if raw:
    parsed = json.loads(raw) if isinstance(raw, str) else raw
    if isinstance(parsed, list):
        for n in parsed:
            n = str(n or "").strip()
            if n and n not in asked:
                asked.append(n)

allowed = []
if REWORK_APPROVED and extra and seat and asked:
    parent_of = {}
    i = 0
    while i < len(asked):
        part = asked[i:i + 500]
        i = i + 500
        for t in frappe.get_all("Operational Tracker",
                                filters=[["name", "in", part]],
                                fields=["name", "workflow_state", "role_profile", "reference_doctype"],
                                limit_page_length=0):
            state = t.get("workflow_state") or ""
            if not state.endswith(SUFFIX) or t.get("reference_doctype") not in DOCTYPES:
                continue
            cur = t.get("role_profile") or ""
            hops = 0
            under = False
            while cur and hops < LEVELS and not under:
                if cur not in parent_of:
                    parent_of[cur] = frappe.db.get_value("Role Profile", cur, "parent_role_profile") or ""
                cur = parent_of[cur]
                hops = hops + 1
                if cur == seat:
                    under = True
            if under:
                allowed.append(t.get("name"))

frappe.response["message"] = {
    "enabled": bool(REWORK_APPROVED),
    "user": me,
    "seat": seat or None,
    "trackers": allowed,
}
