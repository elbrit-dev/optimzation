# Expense Claim Route: the two automatic shares no longer need the user's own
# "Share" right (12 Nov 2026).
#
# Sending a claim made the route share it with the reporting officer (and,
# for Accounts, with the verifier) as the person who pressed the button. A rep
# has no "Share" right on Expense Claim, so Frappe refused the share and with
# it the whole send: 'You need to have "Share" permission'. The route now
# marks its own two shares ignore_share_permission -- nobody gets a new right;
# only these automatic shares are let through.
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit.
# Safe to re-run: an already patched script is left as it is.

DRY = True
W = "WOULD " if DRY else ""
NAME = "Expense Claim Route"
CRLF = chr(13) + chr(10)
LF = chr(10)

OPEN_OLD = '            frappe.get_doc({' + LF + '                "doctype": "DocShare",'
OPEN_NEW = '            sh = frappe.get_doc({' + LF + '                "doctype": "DocShare",'
CLOSE_OLD = '                "notify_by_email": 0,' + LF + '            }).insert(ignore_permissions=True)'
CLOSE_NEW = ('                "notify_by_email": 0,' + LF + '            })' + LF
             + '            sh.flags.ignore_share_permission = True   # the user acting has no Share right (12 Nov 2026)' + LF
             + '            sh.insert(ignore_permissions=True)')

ss = frappe.get_doc("Server Script", NAME)
src = ss.script or ""
crlf = CRLF in src
if crlf:
    src = src.replace(CRLF, LF)
if "ignore_share_permission" in src:
    print("ok: " + NAME + " is already patched")
elif src.count(OPEN_OLD) != 2 or src.count(CLOSE_OLD) != 2:
    print("STOP: " + NAME + " is not as expected (" + str(src.count(OPEN_OLD)) + " / " + str(src.count(CLOSE_OLD)) + " share blocks, want 2 / 2) -- nothing changed")
else:
    print(W + "patch " + NAME + ": its 2 shares (approver, verifier) skip the Share-right check")
    if not DRY:
        out = src.replace(OPEN_OLD, OPEN_NEW).replace(CLOSE_OLD, CLOSE_NEW)
        if crlf:
            out = out.replace(LF, CRLF)
        ss.script = out
        ss.save(ignore_permissions=True)

print("done" if not DRY else "DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
