# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Operational Tracker Restriction
#   Script Type : Permission Query
#   Reference   : Operational Tracker
#
# Who may READ an Operational Tracker (Secondary and Doctor Support
# approvals). Taken from production's own (27 Jul 2026) and kept here from
# now on; the only change is (3), the extra approvers.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

EXTRA_APPROVERS = ["kamesh@elbrit.org", "ramu@elbrit.org", "rahulbhargav@elbrit.org"]

user = frappe.session.user
role_profile = frappe.db.get_value("User", user, "role_profile_name") or ""

# Restrict only sales field-force; Administrator/others unaffected
SALES_PREFIXES = ("ABM", "BE", "RBM", "SM", "SRBM", "ZSM")

if user == "Administrator" or not role_profile.startswith(SALES_PREFIXES):
    conditions = ""
else:
    def in_clause(values):
        return "'" + "', '".join(values) + "'"

    clauses = []

    # 1) Currently routed to me
    clauses.append("`tabOperational Tracker`.next_approver = '" + user + "'")
    clauses.append("`tabOperational Tracker`.custom_fallback_approver = '" + user + "'")

    # 2) No approver left on the row (verification / orphan) ->
    #    fall back to my own role-profile subtree (walk parent_role_profile down)
    subtree = [role_profile]
    frontier = [role_profile]
    for level in range(8):
        if not frontier:
            break
        rows = frappe.db.sql(
            "SELECT name FROM `tabRole Profile` "
            "WHERE parent_role_profile IN (" + in_clause(frontier) + ")",
            as_dict=True
        )
        nxt = []
        for r in rows:
            if r["name"] not in subtree:
                subtree.append(r["name"])
                nxt.append(r["name"])
        frontier = nxt

    no_approver = (
        "IFNULL(`tabOperational Tracker`.next_approver, '') = '' "
        "AND IFNULL(`tabOperational Tracker`.custom_fallback_approver, '') = ''"
    )
    clauses.append(
        "(" + no_approver + " AND `tabOperational Tracker`.role_profile IN ("
        + in_clause(subtree) + "))"
    )

    # 3) EXTRA APPROVERS: every tracker under their own seat, whoever it
    #    waits on -- they may approve their team's entries (the steps are
    #    ours in the "Approval flow" workflow; scripts/erp/approval-flow-
    #    extra.mjs). The list is copied there by hand: change both together.
    if user in EXTRA_APPROVERS:
        clauses.append("`tabOperational Tracker`.role_profile IN (" + in_clause(subtree) + ")")

    conditions = "(" + " OR ".join(clauses) + ")"