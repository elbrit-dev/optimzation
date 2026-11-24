# SYSTEM CONSOLE -- move 11 BE seats' base area to where the BE actually works (19 Nov 2026, the user).
# Evidence: September + October 2026 check-ins (~105,000). Each of these BEs had under ~25% of his
# check-ins within 15 km of the sheet's base area, every month, and 61-82% around the suggested one --
# the sheet named an outlying town while he works the HQ city, so every city day was paid as a long trip
# (E00699: Hosur -> Salem ~147 km, Rs 904 + 275 a day).
# Prod. Desk > System Console, type Python, as Administrator.
#   1) DRY = True, "Commit" unticked: prints old -> new.  2) DRY = False, tick "Commit", Execute.
#   Then /field-expenses (Ctrl+Shift+R), October -> "Pull road km & save".
# Safe to re-run. A seat whose base area is no longer the one listed as "was" is skipped (someone changed it).
# Written with frappe.db.set_value (no Role Profile save -- that would re-sync every user's roles).
# role_profile_locality_console.py carries the same new values, so a re-run of it does not undo these.
#
#   seat               BE                           was                -> now          near base Sep/Oct  near new
#   BE5-CND-CO-SAL     Sakthivel M (E00699)          Hosur              -> Salem        10% / 5%           66%
#   BE6-CND-CO-SAL     Venkatesan Raja (E00930)      Gangavalli         -> Salem         9% / 4%           65%
#   BE5-ELBR-CO-SAL    Kamala Kannan (E00978)        Dharmapuri         -> Salem         0% / 9%           76%
#   BE1-CND-CO-COI     Krishnakumar (E00843)         Udumalaipettai     -> Gandhipuram   7% / 5%           71%
#   BE3-CND-CO-COI     Sasikumar (E01319)            Udhagamandalam     -> Gandhipuram   -  / 4% (Oct only) 79%
#   BE3-ELBR-CO-COI    Dhaneshkumar Natarajan (E01255) Tiruppur         -> Gandhipuram  15% / 17%          82%
#   BE2-CND-CO-COI     Ranjithkumar Ganesan (E01135) Tiruppur           -> Gandhipuram  18% / 21%          79%
#   BE7-CND-CO-ERO     Srimanikandan Sanmugam (E01168) Vellakoil        -> Erode         5% / 8%           67%
#   BE4-ELBR-CO-ERO    Vignesh Somasundaram (E00869) Gobichettipalayam  -> Erode        12% / 24%          61%
#   BE4-CND-CO-ERO     Naveenkumar Mathiazhagan (E01014) Gobichettipalayam -> Erode     14% / 16%          65%
#   BE7-AURA-KE-COC    Ajith Sasidharan (E01225)     Kallur - Thrissur  -> Ernakulam     0% / 0%           51%
#
# NOT changed (the RBM to decide -- they work a wide area, ~45% near any one place): uncomment to apply.
#   BE4-AURA-KE-PER  Praneesh V (E01136, ABM Shiju E V, RBM Hashim M H)       Perinthalmanna -> Nilambur
#   BE3-ELBR-KE-PER  Sabeesh T (E00446, ABM Ratheesh V, RBM Sainudheen K V)   Perinthalmanna -> Ponnani

DRY = True

CHANGES = [
    # [seat, was, now]
    ["BE5-CND-CO-SAL", "Hosur", "Salem"],
    ["BE6-CND-CO-SAL", "Gangavalli", "Salem"],
    ["BE5-ELBR-CO-SAL", "Dharmapuri", "Salem"],
    ["BE1-CND-CO-COI", "Udumalaipettai", "Gandhipuram"],
    ["BE3-CND-CO-COI", "Udhagamandalam", "Gandhipuram"],
    ["BE3-ELBR-CO-COI", "Tiruppur", "Gandhipuram"],
    ["BE2-CND-CO-COI", "Tiruppur", "Gandhipuram"],
    ["BE7-CND-CO-ERO", "Vellakoil", "Erode"],
    ["BE4-ELBR-CO-ERO", "Gobichettipalayam", "Erode"],
    ["BE4-CND-CO-ERO", "Gobichettipalayam", "Erode"],
    ["BE7-AURA-KE-COC", "Kallur - Thrissur", "Ernakulam"],
    # ["BE4-AURA-KE-PER", "Perinthalmanna", "Nilambur"],   # RBM to confirm
    # ["BE3-ELBR-KE-PER", "Perinthalmanna", "Ponnani"],    # RBM to confirm
]

W = "WOULD " if DRY else ""
todo = []
for c in CHANGES:
    if not frappe.db.exists("Role Profile", c[0]):
        print("NOT FOUND seat: " + c[0])
        continue
    if not frappe.db.exists("Locality", c[2]):
        print("NOT FOUND Locality: " + c[2] + " (for " + c[0] + ")")
        continue
    cur = frappe.db.get_value("Role Profile", c[0], "custom_locality")
    if cur == c[2]:
        print("ok already: " + c[0] + " = " + c[2])
        continue
    if cur != c[1]:
        print("SKIPPED " + c[0] + ": base area is now " + str(cur) + ", not " + c[1] + " -- changed by someone, check it")
        continue
    holder = frappe.db.get_value("Role Profile", c[0], "custom_employee_id") or "vacant"
    print(W + "set " + c[0] + " (" + holder + "): " + c[1] + " -> " + c[2])
    todo.append(c)
if not DRY:
    for c in todo:
        frappe.db.set_value("Role Profile", c[0], "custom_locality", c[2], update_modified=False)
    frappe.db.commit()
    print("done -- " + str(len(todo)) + " seats changed. Now /field-expenses (Ctrl+Shift+R), October -> Pull road km & save.")
else:
    print("dry run -- " + str(len(todo)) + " seats would change, nothing written.")
