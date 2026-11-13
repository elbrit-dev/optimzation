# Server Script "Field Trip Decision Guard" -- DocType Event, Expense Claim,
# Before Save (12 Nov 2026).
#
# The officer's per-trip decision (custom_trip_decision / _note / _decided_by /
# _decided_on on each line) is written only by the "Field Trip Decision API".
# Any save of a planner field claim -- the rep adding a trip, the workflow
# moving -- takes those fields from the database, never from what was sent:
#   a line that is unchanged (same date, type, amount and bill) keeps its
#   decision; a changed or new line starts undecided.
# So after a send-back the trips already approved stay approved, and the one
# the rep fixed comes back to the officer. The line's trip tag (custom_trip)
# is kept the same way when a save leaves it out.

PREFIX = "Field TA/DA · "
KEEP = ["custom_trip_decision", "custom_trip_note", "custom_trip_decided_by", "custom_trip_decided_on"]

if str(doc.remark or "").startswith(PREFIX):
    old = {}
    if not doc.is_new():
        for r in frappe.get_all(
            "Expense Claim Detail",
            filters={"parent": doc.name, "parenttype": "Expense Claim"},
            fields=["name", "expense_date", "expense_type", "amount", "custom_bill", "custom_trip", "custom_trip_decision", "custom_trip_note", "custom_trip_decided_by", "custom_trip_decided_on"],
            limit_page_length=1000,
        ):
            old[r.name] = r
    for row in doc.expenses:
        o = old.get(row.name) if row.name else None
        same = False
        if o:
            same = (
                str(o.expense_date)[:10] == str(row.expense_date or "")[:10]
                and (o.expense_type or "") == (row.expense_type or "")
                and abs(frappe.utils.flt(o.amount) - frappe.utils.flt(row.amount)) < 0.01
                and (o.custom_bill or "") == (row.custom_bill or "")
            )
        for k in KEEP:
            row.set(k, o.get(k) if same else None)
        if o and not row.get("custom_trip") and o.get("custom_trip"):
            row.set("custom_trip", o.get("custom_trip"))
