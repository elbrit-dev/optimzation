# SYSTEM CONSOLE -- remove Baranidharan B's (IN002) November TEST leave (20 Nov 2026, the user).
# Made while testing the app's Leave approval page; it is not a real leave.
#   HR-LAP-2026-00608  Casual Leave, 20 Nov 2026, 1 day, Approved + submitted (made 19 Nov 14:54 by himself)
#   HR-ATT-2026-01807  Attendance 20 Nov 2026 "On Leave", created by that approval
# Cancels both (that also gives the Casual Leave day back -- the leave ledger entry goes with the cancel),
# then deletes them. His leave ALLOCATIONS are untouched: none were made in November (2026-27 ones are from
# 31 Aug by Administrator; the Nov 2025 ones are last year's).
# Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.
# Safe to re-run: a record that is already gone is skipped.

DRY = True
W = "WOULD " if DRY else ""
EMP = "IN002"
LEAVE = "HR-LAP-2026-00608"

if not frappe.db.exists("Leave Application", LEAVE):
    print("ok: " + LEAVE + " is already gone")
else:
    la = frappe.get_doc("Leave Application", LEAVE)
    if la.employee != EMP:
        print("STOP: " + LEAVE + " belongs to " + str(la.employee) + ", not " + EMP + " -- nothing done")
    else:
        atts = frappe.get_all("Attendance", filters={"leave_application": LEAVE}, fields=["name", "attendance_date", "status", "docstatus"])
        leds = frappe.get_all("Leave Ledger Entry", filters={"transaction_name": LEAVE}, fields=["name", "leaves", "docstatus"])
        print(W + "remove " + LEAVE + "  " + la.employee_name + "  " + str(la.leave_type) + "  " + str(la.from_date) + " to " + str(la.to_date) +
              "  (" + str(la.status) + ", docstatus " + str(la.docstatus) + ")")
        for a in atts:
            print("   " + W + "remove Attendance " + a.name + "  " + str(a.attendance_date) + "  " + str(a.status))
        for l in leds:
            print("   leave ledger " + l.name + "  " + str(l.leaves) + " day(s) -- goes with the cancel")
        if not DRY:
            # 1. cancel the leave (HRMS also cancels its attendance and removes the ledger entry)
            if la.docstatus == 1:
                la.flags.ignore_permissions = True
                la.cancel()
                print("   cancelled " + LEAVE)
            # 2. attendance: cancel if still submitted, then delete
            for a in atts:
                ad = frappe.get_doc("Attendance", a.name)
                if ad.docstatus == 1:
                    ad.flags.ignore_permissions = True
                    ad.cancel()
                ad.delete(ignore_permissions=True)
                print("   deleted Attendance " + a.name)
            # 3. any ledger entry left behind
            for l in frappe.get_all("Leave Ledger Entry", filters={"transaction_name": LEAVE}, fields=["name"]):
                frappe.db.delete("Leave Ledger Entry", {"name": l.name})
                print("   deleted Leave Ledger Entry " + l.name)
            # 4. the leave itself
            frappe.get_doc("Leave Application", LEAVE).delete(ignore_permissions=True)
            frappe.db.commit()
            print("done -- " + LEAVE + " and its attendance deleted.")
        else:
            print("dry run -- nothing changed.")
