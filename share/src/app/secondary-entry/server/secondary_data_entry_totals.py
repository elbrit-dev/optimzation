# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name          : Secondary Data Entry Totals
#   Script Type   : DocType Event
#   Reference     : Secondary Data Entry
#   Event         : Before Save
#
# A line's rate is its item's PTS for the entry's month (month_prices: the
# Item's Price Table, else custom_last_pts), its sales / closing value qty x
# rate rounded to 2 places, and the entry's totals are the sum of its lines.
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

def month_prices(codes, month):
    # The ENTRY MONTH's price of each item, from its Price Table
    # (Item.custom_price_table: batch, pts, ptr, mrp, month "YYYY-MM"): that
    # month's row — the last added when several batches have one — else the
    # latest month before it. An item with none is left out: the caller
    # falls back to custom_last_*. Copied into each script that prices lines
    # (entry, add, both Totals): change them together.
    best = {}
    i = 0
    while i < len(codes):
        for r in frappe.get_all("Price Table",
                                filters=[["parenttype", "=", "Item"], ["parentfield", "=", "custom_price_table"],
                                         ["parent", "in", codes[i:i + 500]], ["month", "<=", month]],
                                fields=["parent", "pts", "ptr", "mrp", "month", "idx"], limit_page_length=0):
            k = (r.get("month") or "") + "|" + str(1000000 + int(r.get("idx") or 0))
            cur = best.get(r.get("parent"))
            if not cur or k > cur["k"]:
                best[r.get("parent")] = {"k": k, "pts": float(r.get("pts") or 0),
                                         "ptr": float(r.get("ptr") or 0), "mrp": float(r.get("mrp") or 0)}
        i = i + 500
    return best


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
            mp = month_prices([it], str(doc.date or "")[:7])
            if mp.get(it) and mp[it]["pts"] > 0:
                pts[it] = mp[it]["pts"]
            else:
                pts[it] = flt(frappe.db.get_value("Item", it, "custom_last_pts"))
        row.rate = pts[it]
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
