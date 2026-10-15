# Doctor Service: bring production ERP in line with UAT (everything except the server scripts).
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) Run with DRY = True and "Commit" UNticked: it only prints what it would do.
# 2) Set DRY = False, tick "Commit", run again.
# Safe to re-run: anything already in place is skipped.

DRY = True

W = "WOULD " if DRY else ""

# 1. Custom field
if frappe.db.exists("Custom Field", "Doctor Service-custom_via_app"):
    print("ok: field custom_via_app")
else:
    print(W + "add field Doctor Service.custom_via_app")
    if not DRY:
        frappe.get_doc({"doctype": "Custom Field", "dt": "Doctor Service", "fieldname": "custom_via_app",
            "label": "Via App", "fieldtype": "Check", "insert_after": "custom_tracker",
            "read_only": 1, "default": "0"}).insert(ignore_permissions=True)

# 2. Workflow states
for s in ["GM Approved and Verified", "CEO Approved and Verified"]:
    if frappe.db.exists("Workflow State", s):
        print("ok: state " + s)
    else:
        print(W + "add workflow state " + s)
        if not DRY:
            frappe.get_doc({"doctype": "Workflow State", "workflow_state_name": s, "style": "Success"}).insert(ignore_permissions=True)

# 3. Workflow action
if frappe.db.exists("Workflow Action Master", "Final Approve"):
    print("ok: action Final Approve")
else:
    print(W + "add workflow action Final Approve")
    if not DRY:
        frappe.get_doc({"doctype": "Workflow Action Master", "workflow_action_name": "Final Approve"}).insert(ignore_permissions=True)

# 4. "Approval flow" workflow: states + transitions
wf = frappe.get_doc("Workflow", "Approval flow")
like = None
for r in wf.states:
    if r.state == "GM Approved and Waiting for Verification":
        like = r
wf_changed = False
for s in ["GM Approved and Verified", "CEO Approved and Verified"]:
    have = False
    for r in wf.states:
        if r.state == s:
            have = True
    if have:
        print("ok: Approval flow has state " + s)
    else:
        print(W + "add Approval flow state " + s)
        wf.append("states", {"state": s, "doc_status": like.doc_status if like else "0",
            "allow_edit": like.allow_edit if like else None})
        wf_changed = True

DS = 'doc.setting == "Doctor Service"'
self_ok = 1
for t in wf.transitions:
    if t.state == "GM Approval Waiting" and t.action == "Reject" and t.allowed == "GM":
        self_ok = t.allow_self_approval
want = [
    ["CEO Approval Waiting", "Reject", "CEO Rejected", "CEO", DS],
    ["GM Approval Waiting", "Final Approve", "GM Approved and Verified", "GM", DS],
    ["GM Approval Waiting", "Final Approve", "GM Approved and Verified", "CEO", DS],
    ["CEO Approval Waiting", "Final Approve", "CEO Approved and Verified", "CEO", DS],
]
for w in want:
    label = w[0] + " -> " + w[1] + " -> " + w[2] + " [" + w[3] + "]"
    have = False
    for t in wf.transitions:
        if t.state == w[0] and t.action == w[1] and t.next_state == w[2] and t.allowed == w[3]:
            have = True
    if have:
        print("ok: transition " + label)
    else:
        print(W + "add transition " + label)
        wf.append("transitions", {"state": w[0], "action": w[1], "next_state": w[2], "allowed": w[3],
            "condition": w[4], "allow_self_approval": self_ok})
        wf_changed = True
if wf_changed and not DRY:
    wf.save(ignore_permissions=True)
    print("saved workflow Approval flow")

# 5. The doctype's own "Doctor Service" workflow: inactive (approval lives on the tracker)
dsw = frappe.get_doc("Workflow", "Doctor Service")
if not dsw.is_active:
    print("ok: Doctor Service workflow inactive")
else:
    print(W + "set Doctor Service workflow inactive")
    if not DRY:
        dsw.is_active = 0
        dsw.save(ignore_permissions=True)

# 6. Approval Settings "Doctor Service": CEO is always the final approver (same as UAT)
UAT = {
    "CEO": ["doc.data>=0", "doc.data>=0"],
    "GM": ["doc.data>0 and doc.data<0", "doc.data>0 and doc.data<0"],
    "SM": ["doc.data>0 and doc.data<=0", "doc.data>0 and doc.data<=0"],
    "RBM": ["doc.data>0 and doc.data<=0", "doc.data>=0 and doc.data<0"],
    "ABM": ["doc.data<=0", "doc.data<=0"],
}
aps = frappe.get_doc("Approval Settings", "Doctor Service")
as_changed = False
for r in aps.approver_list:
    u = UAT.get(r.role)
    if not u or (r.conditions_for_final_approver == u[0] and r.conditions_for_update_final_approver == u[1]):
        continue
    print(W + "set approver " + r.role + ": '" + str(r.conditions_for_final_approver) + "' -> '" + u[0] + "'")
    r.conditions_for_final_approver = u[0]
    r.conditions_for_update_final_approver = u[1]
    as_changed = True
if aps.verifier != "MIS":
    print(W + "set verifier -> MIS")
    aps.verifier = "MIS"
    as_changed = True
if not as_changed:
    print("ok: Approval Settings Doctor Service")
elif not DRY:
    aps.save(ignore_permissions=True)
    print("saved Approval Settings Doctor Service")

# 7. Permissions (Custom DocPerm, level 0)
perms = []
for role in ["MIS", "User MIS", "MIS Admin", "Manager MIS", "CRM Manager", "IT"]:
    perms.append(["Doctor Service", role, ["read", "write", "create"]])
perms.append(["Operational Tracker", "GM", ["read", "write"]])
perms.append(["Operational Tracker", "CEO", ["read", "write"]])
for p in perms:
    dt = p[0]
    role = p[1]
    label = dt + " / " + role
    if not frappe.db.count("Custom DocPerm", {"parent": dt}):
        print("SKIP " + label + ": " + dt + " has no Custom DocPerm rows; set it in Role Permissions Manager")
        continue
    name = frappe.db.get_value("Custom DocPerm", {"parent": dt, "role": role, "permlevel": 0}, "name")
    row = frappe.get_doc("Custom DocPerm", name) if name else None
    missing = []
    for t in p[2]:
        if not row or not row.get(t):
            missing.append(t)
    if not missing:
        print("ok: perm " + label + " " + "+".join(p[2]))
        continue
    print(W + ("update" if row else "add") + " perm " + label + " " + "+".join(missing))
    if DRY:
        continue
    if not row:
        row = frappe.get_doc({"doctype": "Custom DocPerm", "parent": dt, "parenttype": "DocType",
            "parentfield": "permissions", "role": role, "permlevel": 0})
    for t in missing:
        row.set(t, 1)
    if row.get("name"):
        row.save(ignore_permissions=True)
    else:
        row.insert(ignore_permissions=True)

print("DRY RUN done: nothing changed. Set DRY = False, tick Commit, run again." if DRY else "Done. Reload desk (Ctrl+Shift+R) so the new permissions show.")
