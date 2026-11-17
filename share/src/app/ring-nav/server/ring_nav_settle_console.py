# Ring Nav: the "Settle" tile (16 Nov 2026), app-uat only. Adds one section to
# the LIVE Server Script "Elbrit Ring Nav" (nothing else in it changes): the
# settlement requests waiting on the caller in the BE > ABM > RBM > SM/ZSM >
# GM > CEO chain, linking to /expense/approval?view=settle. Shown only when
# the app asks with expense_all=1 -- app-uat does, live never does. Needs the
# settlement console (DocType "Settlement Request") run first.
# Source: share/src/app/ring-nav/server/elbrit_ring_nav.py (SETTLE section).
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit.
# Safe to re-run. Re-running UPDATES an existing Settle tile in place (17 Nov
# 2026: receipt icon, caption "Pending" -- the badge shows the count) and
# the Expense tile's caption ("Pending" too).

DRY = True
W = "WOULD " if DRY else ""
BLOCK = '# ---------------------------------------------------------------- SETTLE\n# Settlement approval (16 Nov 2026): requests (AI-checked bills, or cash) going\n# up the requester\'s line, BE > ABM > RBM > SM/ZSM > GM > CEO ("Settlement\n# API"); the CEO\'s approval makes them Verified. app-uat ONLY: the app asks\n# with expense_all=1 there, never on live. The tile is for whoever a request\n# waits on, or who approved one still going up, or verified this month. A\n# request that has not reached someone yet is not theirs to see (17 Nov 2026).\n#   badge     requests waiting on the caller\n#   caption   "Pending", else "Clear" (the badge carries the number)\n#   icon      receipt -- not the Expense tile\'s wallet (17 Nov 2026)\n#   ring      waiting on me / I approved, still going up / verified this month\nHREFS["settle-approval"] = "/expense/approval?view=settle"\n\n\ndef settle_tile():\n    if not expense_all or not frappe.db.exists("DocType", "Settlement Request"):\n        return\n    # a BE approves nobody (17 Nov 2026): no Settle tile\n    head = str(seat or "").split("-")[0].upper()\n    if head[:2] == "BE" and head[2:].isdigit() or head == "BE":\n        return\n    mine = "%|" + me + "|%"\n    waiting = frappe.get_all("Settlement Request", filters={"status": "Waiting", "next_approver": me},\n                             fields=["amount"], limit_page_length=500)\n    # approved by me and still going up (the steps are a child table: SQL)\n    team = frappe.db.sql("select distinct r.name from `tabSettlement Request` r join `tabSettlement Step` s"\n                         " on s.parent = r.name and s.parenttype = \'Settlement Request\'"\n                         " where r.status = \'Waiting\' and s.user = %s and s.decision = \'Approved\' limit 500", (me,))\n    verified = frappe.get_all("Settlement Request", filters={"status": "Approved", "approvers": ["like", mine],\n                                                             "decided_on": [">=", today[:8] + "01"]},\n                              pluck="name", limit_page_length=500)\n    n = len(waiting)\n    if not (n or team or verified):\n        return\n    items.append({\n        "id": "settle-approval",\n        "label": "Settle",\n        "href": HREFS["settle-approval"],\n        "icon": "receipt",\n        "statusIcon": "check-square",\n        "statusTone": "neutral",\n        "count": n,\n        "caption": "Pending" if n else "Clear",\n        "captionTone": "danger" if n else "success",\n        "segments": service_ring([\n            {"key": "waiting", "value": n, "tone": "danger", "label": "Waiting for you"},\n            {"key": "team", "value": len(team), "tone": "warning", "label": "You approved, going up"},\n            {"key": "verified", "value": len(verified), "tone": "success", "label": "Verified this month"},\n        ]),\n    })\n\n\ntry:\n    settle_tile()\nexcept Exception as err:\n    frappe.log_error(title="Elbrit Ring Nav: settle tile", message=str(err))\n\n'
MARK = 'frappe.response["message"] = {'
EXPENSE_OLD = '"caption": (str(waiting) + " to approve") if waiting else "Clear",'
EXPENSE_NEW = '"caption": "Pending" if waiting else "Clear",'

name = "Elbrit Ring Nav"
src = (frappe.db.get_value("Server Script", name, "script") or "").replace(chr(13), "")
if not src:
    print("STOP: Server Script " + name + " not found.")
elif BLOCK in src and EXPENSE_OLD not in src:
    print("ok: the Settle and Expense tiles are already up to date -- nothing to do")
elif "def settle_tile" in src and src.find(BLOCK[:70]) >= 0 and MARK in src:
    # 17 Nov 2026: the tile is there -- swap it for the new one (receipt icon,
    # "Pending" instead of "N to approve")
    i = src.index(BLOCK[:70])
    j = src.rindex(MARK)
    new = src[:i] + BLOCK + src[j:]
    # the Expense tile too: "Pending", not "N to approve" (the badge has the number)
    new = new.replace(EXPENSE_OLD, EXPENSE_NEW)
    print(W + "update the Settle tile in " + name + " (ring: what you approved, still going up; none for a BE)")
    if not DRY:
        doc = frappe.get_doc("Server Script", name)
        doc.script = new
        doc.save(ignore_permissions=True)
        print("saved: the Settle tile is updated")
elif "expense_all = str(frappe.form_dict" not in src or "def service_ring(" not in src or MARK not in src:
    print("STOP: this Ring Nav script is not the expected version (no expense_all / service_ring) -- nothing changed.")
else:
    i = src.rindex(MARK)
    new = src[:i] + BLOCK + src[i:]
    print(W + "add the Settle tile to " + name + " (" + str(len(src)) + " -> " + str(len(new)) + " characters)")
    if not DRY:
        doc = frappe.get_doc("Server Script", name)
        doc.script = new
        doc.save(ignore_permissions=True)
        print("saved: on app-uat, approvers now get the Settle tile")
