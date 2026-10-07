# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name          : Secondary Data Entry Totals
#   Script Type   : DocType Event
#   Reference     : Secondary Data Entry
#   Event         : Before Save
#
# A line's value is qty x its item's PTS (Item.custom_last_pts), rounded to
# 2 places, and the entry's totals are the sum of its lines.
#
# ONLY LINES THIS SAVE CHANGES ARE RE-PRICED: a new line, or one whose item,
# sales/closing qty or status changes. Every other line keeps its stored
# value. A save carries the whole entry — every seat's lines — so re-pricing
# them all rewrote other seats' locked lines (float noise alone:
# 64.29 x 10 = 642.9000000000001), and the Seat Guard refused the save as an
# edit to lines "waiting for verification".
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

flt = frappe.utils.flt

old = doc.get_doc_before_save()
before = {}
if old:
    for r in (old.items or []):
        before[r.name] = r

total_sales_qty = 0
total_sales_value = 0
total_closing_qty = 0
total_closing_value = 0

pts = {}
for row in doc.items:
    prev = before.get(row.name) if row.name else None
    reprice = prev is None
    if prev:
        if (prev.item or "") != (row.item or "") \
                or flt(prev.sales_qty) != flt(row.sales_qty) \
                or flt(prev.closing_qty) != flt(row.closing_qty) \
                or (prev.custom_status or "") != (row.custom_status or ""):
            reprice = True

    it = row.item
    if it and reprice:
        if it not in pts:
            pts[it] = flt(frappe.db.get_value("Item", it, "custom_last_pts"))
        row.sales_value = flt(pts[it] * flt(row.sales_qty), 2)
        row.closing_balance = flt(pts[it] * flt(row.closing_qty), 2)

    total_sales_qty = total_sales_qty + flt(row.sales_qty)
    total_sales_value = total_sales_value + flt(row.sales_value)
    total_closing_qty = total_closing_qty + flt(row.closing_qty)
    total_closing_value = total_closing_value + flt(row.closing_balance)

doc.custom_total_sales_qty = total_sales_qty
doc.custom_total_sales_value = flt(total_sales_value, 2)
doc.custom_total_closing_qty = total_closing_qty
doc.custom_total_closing_value = flt(total_closing_value, 2)
