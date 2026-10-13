# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Approval Actions
#   Script Type : API
#   API Method  : elbrit_approval_actions
#   Allow Guest : NO
#
# WHAT THE CALLER MAY DO ON MANY TRACKERS, IN ONE CALL — the approval
# screens' Approve / Rework buttons. The app used to ask per tracker
# (frappe.client.get, then frappe.model.workflow.get_transitions): two
# calls each, 140 for an RBM's 70 doctors, before the buttons settled.
#
#   POST /api/method/elbrit_approval_actions   { "trackers": ["<tracker>", ...] }
#   -> { user, actions: { "<tracker>": { approve, revisit, understood } } }
#
# THE WORKFLOW'S OWN ANSWER, worked out as get_transitions does it: the
# "Approval flow" steps out of the tracker's state whose role the user holds
# ("All" for everyone) and whose condition holds. A server script cannot
# evaluate a condition string, so the conditions are recognised — every one
# in the workflow is either empty (the role is the rule) or ours, from
# scripts/erp/approval-flow-extra.mjs:
#   - "custom_fallback_approver": the tracker's fallback approver, or an
#     extra approver over its seat (EXTRA_USERS, or an RBM / SM seat:
#     EXTRA_SEATS, one to three levels above the tracker's seat);
#   - "Elbrit Rework Approved": rework after approval — that script's switch
#     on, a Secondary / Doctor Support tracker, and an extra approver over
#     its seat as above.
# Any other condition: the tracker comes back `understood: false`, and the
# app asks the workflow itself for it, as before.
#
# What the screens offer, from those steps:
#   approve  "Approve to Verification" is a step for the user;
#   revisit  "Revisit" is, while the tracker waits for approval — and, once
#            approved and waiting for verification, only through the rework-
#            after-approval step (the workflow's role-only "Revisit" there,
#            any ABM on an ABM-approved tracker, is not offered).
# The decision itself stays the workflow's (apply_workflow, as the user).
#
# EXTRA_USERS / EXTRA_SEATS are copies of the lists in approval-flow-extra.mjs
# and the entry scripts: change them together.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

WORKFLOW = "Approval flow"
SWITCH = "Elbrit Rework Approved"
APPROVE_MARK = "custom_fallback_approver"
EXTRA_USERS = ["kamesh@elbrit.org", "ramu@elbrit.org", "rahulbhargav@elbrit.org"]
EXTRA_SEATS = ["RBM", "SRBM", "Deputy RBM", "SM"]
REWORK_DOCTYPES = ["Secondary Data Entry", "Doctor Support"]
WAITING = " Approval Waiting"
UNVERIFIED = " Approved and Waiting for Verification"
LEVELS = 3

me = frappe.session.user
my_seat = frappe.db.get_value("User", me, "role_profile_name") or ""
extra = bool(my_seat) and (me in EXTRA_USERS or my_seat.split("-")[0] in EXTRA_SEATS)

roles = {"All": 1, "Guest": 1}
for r in frappe.get_all("Has Role", filters={"parenttype": "User", "parent": me}, pluck="role"):
    roles[r] = 1

# The switch, read as the workflow condition reads it: the script enabled,
# and a line of its own "REWORK_APPROVED = True".
sw = frappe.db.get_value("Server Script", SWITCH, ["disabled", "script"], as_dict=True)
rework_on = bool(sw) and not sw.get("disabled") and ("\nREWORK_APPROVED = True" in ("\n" + (sw.get("script") or "")))

# The workflow's steps, by state.
steps_of = {}
for t in frappe.get_all("Workflow Transition",
                        filters={"parenttype": "Workflow", "parent": WORKFLOW},
                        fields=["state", "action", "allowed", "condition"],
                        order_by="idx asc", limit_page_length=0):
    steps_of.setdefault(t.get("state") or "", []).append(t)

asked = []
raw = frappe.form_dict.get("trackers")
if raw:
    parsed = json.loads(raw) if isinstance(raw, str) else raw
    if isinstance(parsed, list):
        for n in parsed:
            n = str(n or "").strip()
            if n and n not in asked:
                asked.append(n)

parent_of = {}
actions = {}
i = 0
while i < len(asked):
    part = asked[i:i + 500]
    i = i + 500
    for t in frappe.get_all("Operational Tracker",
                            filters=[["name", "in", part]],
                            fields=["name", "workflow_state", "role_profile", "reference_doctype",
                                    "custom_fallback_approver"],
                            limit_page_length=0):
        state = t.get("workflow_state") or ""

        # Is the caller an extra approver over this tracker's seat? (worked
        # out once, only when a step asks)
        over = None
        approve = False
        revisit = False
        understood = True
        for s in steps_of.get(state, []):
            if not roles.get(s.get("allowed")):
                continue
            cond = s.get("condition") or ""
            kind = "role"
            if cond:
                if SWITCH in cond:
                    kind = "rework"
                elif APPROVE_MARK in cond:
                    kind = "ours"
                else:
                    understood = False
                    continue
            if kind != "role" and over is None:
                over = False
                if extra:
                    cur = t.get("role_profile") or ""
                    hops = 0
                    while cur and hops < LEVELS and not over:
                        if cur not in parent_of:
                            parent_of[cur] = frappe.db.get_value("Role Profile", cur, "parent_role_profile") or ""
                        cur = parent_of[cur]
                        hops = hops + 1
                        if cur == my_seat:
                            over = True
            if kind == "role":
                ok = True
            elif kind == "ours":
                ok = me == (t.get("custom_fallback_approver") or "") or over
            else:
                ok = rework_on and t.get("reference_doctype") in REWORK_DOCTYPES and over
            if not ok:
                continue
            if s.get("action") == "Approve to Verification":
                approve = True
            if s.get("action") == "Revisit":
                if state.endswith(WAITING):
                    revisit = True
                elif state.endswith(UNVERIFIED) and kind == "rework":
                    revisit = True
        actions[t.get("name")] = {"approve": approve, "revisit": revisit, "understood": understood}

frappe.response["message"] = {"user": me, "actions": actions}
