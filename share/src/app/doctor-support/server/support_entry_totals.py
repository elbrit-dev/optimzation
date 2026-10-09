# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name          : Support Entry Totals
#   Script Type   : DocType Event
#   Reference     : Doctor Support
#   Event         : Before Save
#
# Doctor Support's copy of "Secondary Data Entry Totals" (see
# secondary-entry/server/secondary_data_entry_totals.py): a line's rate is
# its item's PTS for the entry's month (month_prices: the Item's Price Table, else
# custom_last_pts), its amount qty x rate rounded to 2
# places, and the entry's totals are the sum of its lines.
#
# ONLY LINES THIS SAVE CHANGES ARE RE-PRICED: a new line, or one whose item,
# qty or status changes. Every other line keeps its stored rate and amount.
# A save carries the whole Doctor Support — every seat's lines — so
# re-pricing them all rewrote other seats' locked lines (float noise alone),
# and the Seat Guard refused the save as an edit to lines "waiting for
# verification".
#
# The line status is `status` on UAT, `custom_status` on production —
# whichever this ERP has is used.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

flt = frappe.utils.flt

SUPPORT_META = frappe.get_meta("Support Items")
F_STATUS = "status"
if not SUPPORT_META.has_field("status") and SUPPORT_META.has_field("custom_status"):
    F_STATUS = "custom_status"

old = doc.get_doc_before_save()
before = {}
if old:
    for r in (old.item_table or []):
        before[r.name] = r

def month_prices(codes, month):
    # The ENTRY MONTH's price of each item, from its Price Table
    # (Item.custom_price_table: batch, pts, ptr, mrp, month "YYYY-MM"): that
    # month's row — the last added when several batches have one — else the
    # latest month before it. An item with none is left out: the caller
    # falls back to custom_last_*. Copied into each script that prices lines
    # (entry, add, Support Entry Totals): change them together.
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


total_qty = 0
total_amount = 0

pts = {}
for row in doc.item_table:
    prev = before.get(row.name) if row.name else None
    reprice = prev is None
    if prev:
        if (prev.item or "") != (row.item or "") \
                or flt(prev.qty) != flt(row.qty) \
                or (prev.get(F_STATUS) or "") != (row.get(F_STATUS) or ""):
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
        row.amount = flt(pts[it] * flt(row.qty), 2)

    total_qty = total_qty + flt(row.qty)
    total_amount = total_amount + flt(row.amount)

doc.custom_total_qty = total_qty
doc.custom_total_amount = flt(total_amount, 2)
