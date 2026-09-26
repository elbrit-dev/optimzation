/* THE CONTRACT — what a Secondary Data Entry row looks like to this screen.
 *
 * One ERP `Secondary Data Entry` is one stockist (distributor) for one month,
 * dated the 1st. It is SHARED by several seats: every item line carries the
 * `custom_role_profile` that entered it, and every seat gets its own row in
 * `custom_status_tracker` once it has submitted. So "the status of this
 * stockist" is always the status FOR ONE SEAT, never the document's
 * `workflow_state` (which the workflow sets once for everybody).
 *
 * The seat lifecycle, read off the live "Secondary tracker" Before-Save script:
 *   - a seat's lines carry `custom_status` "Draft" until it submits;
 *   - once ALL of a seat's lines are out of Draft, the save creates that
 *     seat's Operational Tracker and appends its tracker row with status
 *     "<next role> Approval Waiting";
 *   - approvers move the tracker row on from there.
 *
 * Rows arrive from DataProvider (`SecondaryEntry` query, after its
 * transformer), so field names are read tolerantly: a link comes back either
 * as `item__name` (GraphQL scalar), `item` (REST / flat) or `item.item_name`
 * (GraphQL object). Everything below goes through `pick`, never a bare
 * property read.
 */

export const STATUSES = ['draft', 'pending', 'approved', 'rejected', 'revisit'];

export const STATUS_LABEL = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  revisit: 'Revisit',
};

/* Draft is the colour of "still yours to do", which on this screen is the
   action item — the design paints it red, not the DS's neutral draft grey. */
export const STATUS_TONE = {
  draft: 'danger',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  /* Sent back to be corrected: the seat's to do again, like a draft. */
  revisit: 'danger',
};

/* The approver's "Revisit" leaves the approval WAITING and writes its reason
   onto the tracker as "Revisit (from <state>): <reason>" — the note outlives
   the revisit (it is still there after the next approval), so it only means
   "sent back" while the tracker is waiting. Returns the reason, or null. */
export function revisitReason(note, trackerState) {
  const m = String(note ?? '').match(/^Revisit \(from [^)]*\):\s*([\s\S]*)$/);
  if (!m) return null;
  if (trackerState && !/approval waiting$/i.test(String(trackerState))) return null;
  return m[1].trim() || 'No reason given.';
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    const value = key.includes('.')
      ? key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), obj)
      : obj[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* Rows may come as nodes, edges or a connection; anything else is empty. */
export function toRowArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.map((r) => (r && r.node ? r.node : r)).filter(Boolean);
  if (Array.isArray(data.edges)) return toRowArray(data.edges);
  if (data.secondary) return toRowArray(data.secondary);
  return [];
}

export function lineRoleProfile(line) {
  return pick(line, ['custom_role_profile__name', 'custom_role_profile.name', 'custom_role_profile', 'role_profile']) ?? null;
}

function lineItemName(line) {
  return pick(line, ['item__name', 'item.item_name', 'item.name', 'item_name', 'item']) ?? '';
}

/* PTS, the price the value columns are computed at. `rate` on a live line is
   often 0 while its values are right, so a line's own value ÷ qty beats it. */
function linePrice(line) {
  const explicit = num(pick(line, ['custom_last_pts', 'item.custom_last_pts', 'pts', 'price']));
  if (explicit > 0) return explicit;
  const salesQty = num(line?.sales_qty);
  const closingQty = num(line?.closing_qty);
  if (salesQty > 0 && num(line?.sales_value) > 0) return num(line.sales_value) / salesQty;
  if (closingQty > 0 && num(line?.closing_balance) > 0) return num(line.closing_balance) / closingQty;
  return num(line?.rate);
}

export function normalizeLine(line, index) {
  const price = linePrice(line);
  const salesQty = num(line?.sales_qty);
  const closingQty = num(line?.closing_qty);
  const salesValue = num(line?.sales_value) || salesQty * price;
  const closingValue = num(pick(line, ['closing_balance', 'closing_value'])) || closingQty * price;
  return {
    key: pick(line, ['name']) ?? `line-${index}`,
    item: lineItemName(line),
    pack: pick(line, ['custom_pack', 'item.custom_pack', 'pack', 'item.stock_uom']) ?? '',
    price,
    salesQty,
    closingQty,
    salesValue,
    closingValue,
    lineStatus: pick(line, ['custom_status']) ?? null,
    roleProfile: lineRoleProfile(line),
  };
}

/* EBS codes as they actually sit on Customer (read off live ERP):
 *   whg_ebs_code         "EBS220"; sometimes dirty — "E01156-Aravind Ch…"
 *   whg_other_ebs_codes  "EBS101, EBS020" — comma separated, and very often
 *                        just the primary again ("EBS756" / "EBS756")
 * A code is the leading LETTERS+DIGITS token when there is one, else the
 * trimmed text. Others drop blanks, repeats and the primary itself, so a
 * card never shows "EBS756 · +1" where the +1 is EBS756. */
function cleanCode(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = /^([A-Za-z]+\d+)/.exec(s);
  return m ? m[1].toUpperCase() : s;
}

export function parseEbsCodes(primaryRaw, othersRaw) {
  const primary = cleanCode(primaryRaw);
  const seen = new Set(primary ? [primary] : []);
  const others = [];
  for (const part of String(othersRaw ?? '').split(/[,;\n]+/)) {
    const code = cleanCode(part);
    if (code && !seen.has(code)) {
      seen.add(code);
      others.push(code);
    }
  }
  /* No primary but others present: promote the first, rather than showing a
     card with a "+2" and no code in front of it. */
  if (!primary && others.length) return { primary: others[0], others: others.slice(1) };
  return { primary, others };
}

function trackerRoleProfile(row) {
  const rp = pick(row, ['role_profile__name', 'role_profile.name', 'role_profile']);
  if (rp) return rp;
  /* Older rows only carry the tracker docname, which ends with the seat:
     "Secondary Data Entry-<stockist>-<date>-<role profile>". */
  const tracker = pick(row, ['tracker__name', 'tracker']);
  return typeof tracker === 'string' ? tracker : null;
}

function trackerStatusText(row) {
  return pick(row, ['status__name', 'status.name', 'status']) ?? '';
}

/* Tracker/workflow text → one of the four buckets. "Approval Waiting" must
   NOT read as approved, hence /approved/ rather than /approv/. */
export function bucketFromText(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  if (t === 'draft') return 'draft';
  if (t.includes('reject')) return 'rejected';
  if (t.includes('approved') || t.includes('verified')) return 'approved';
  return 'pending';
}

/* One stockist as this screen sees it, FOR `roleProfile`. With no seat known
   the whole entry is summed and its document-level workflow_state is used. */
export function normalizeEntry(row, roleProfile) {
  const allLines = (row?.items ?? []).map(normalizeLine);
  const lines = roleProfile ? allLines.filter((l) => l.roleProfile === roleProfile) : allLines;

  const trackers = row?.custom_status_tracker ?? [];
  const tracker = roleProfile
    ? trackers.find((t) => {
        const rp = trackerRoleProfile(t);
        return rp === roleProfile || (typeof rp === 'string' && rp.endsWith(`-${roleProfile}`));
      })
    : null;

  let status;
  let statusText;
  /* Case-blind on purpose: GraphQL returns this Select as an enum, "DRAFT" /
     "SUBMITTED", while REST (and a save's own reply) says "Draft". */
  const anyDraftLine = lines.some((l) => String(l.lineStatus ?? '').toLowerCase() === 'draft');
  if (roleProfile) {
    if (tracker && !anyDraftLine) {
      statusText = trackerStatusText(tracker);
      status = bucketFromText(statusText) ?? 'pending';
      /* Needs custom_status_tracker { tracker { workflow_state__name
         reason_for_rejection } } in the query; without it a revisit reads as
         plain Pending. */
      const reason = revisitReason(
        pick(tracker, ['tracker.reason_for_rejection']),
        pick(tracker, ['tracker.workflow_state__name', 'tracker.workflow_state']) ?? statusText,
      );
      if (status === 'pending' && reason) {
        status = 'revisit';
        statusText = reason;
      }
    } else {
      /* No tracker row yet, or lines still in Draft: this seat has not
         submitted, whatever the document's own workflow_state says. */
      status = 'draft';
      statusText = 'Draft';
    }
  } else {
    statusText = pick(row, ['workflow_state__name', 'workflow_state']) ?? (anyDraftLine ? 'Draft' : '');
    status = anyDraftLine ? 'draft' : (bucketFromText(statusText) ?? 'draft');
  }

  const sum = (key) => lines.reduce((acc, l) => acc + l[key], 0);
  const date = String(pick(row, ['date']) ?? '');
  const stockist = pick(row, ['distributor.customer_name', 'distributor__name', 'distributor_customer_name', 'distributor']) ?? '';
  const stockistName = typeof stockist === 'string' ? stockist : '';

  /* Identity off the Customer record — EBS codes and territory — when the
     query selects `distributor { whg_ebs_code whg_other_ebs_codes
     territory__name }`. The HQ falls back to this seat's own line, which
     carries custom_hq. */
  const { primary: ebsCode, others: otherEbsCodes } = parseEbsCodes(
    pick(row, ['distributor.whg_ebs_code', 'distributor__whg_ebs_code', 'whg_ebs_code', 'ebs_code']),
    pick(row, ['distributor.whg_other_ebs_codes', 'distributor__whg_other_ebs_codes', 'whg_other_ebs_codes']),
  );
  const seatHq = (row?.items ?? []).find((l) => !roleProfile || lineRoleProfile(l) === roleProfile);
  const hq =
    pick(row, ['distributor.territory__name', 'distributor.territory.name', 'distributor.territory', 'distributor__territory'])
    ?? pick(seatHq, ['custom_hq__name', 'custom_hq'])
    ?? null;

  return {
    name: pick(row, ['name']) ?? `${stockistName}-${date}`,
    stockist: stockistName,
    ebsCode,
    otherEbsCodes,
    hq,
    /* A line about the party beyond its code — a doctor's specialty, say —
       when the server sends one (`distributor.note`). */
    note: pick(row, ['distributor.note', 'party_note']) ?? null,
    date,
    month: date.slice(0, 7),
    status,
    statusText,
    lines,
    /* Products OTHER seats carry on this entry. BEs sharing a stockist each
       carry their own products there, never the same one — so these are
       not offered to this seat (the picker, the bulk sheet). */
    /* The elbrit_secondary_entry server script sends only this seat's lines
       and the others' products as names (`other_items`); a saved query or a
       save's reply carries the whole entry — both are read. */
    otherItems: roleProfile
      ? [
          ...new Set([
            ...(Array.isArray(row?.other_items) ? row.other_items : []),
            ...allLines.filter((l) => l.roleProfile !== roleProfile).map((l) => l.item),
          ]),
        ]
      : [],
    salesQty: sum('salesQty'),
    salesValue: sum('salesValue'),
    closingQty: sum('closingQty'),
    closingValue: sum('closingValue'),
  };
}

/* `sort: false` keeps the server's order. Under server paging each load
   appends the next rows; re-sorting A–Z would slot them in ABOVE rows the
   reader has already scrolled past, and the list would jump.
 *
 * EVERY ENTRY THE ERP SENT. Which stockists a user may enter for is the
 * ERP's "Secondary Data Entry Permission Query" (their Customer / Territory /
 * Department user permissions) — not narrowed here. What IS this screen's is
 * WITHIN an entry: one entry carries several seats' lines, and only
 * `roleProfile`'s are shown, totalled and written (see normalizeEntry and
 * writes.applySeatLines). */
export function normalizeEntries(data, roleProfile, { sort = true } = {}) {
  const entries = toRowArray(data).map((row) => normalizeEntry(row, roleProfile));
  return sort ? entries.sort((a, b) => a.stockist.localeCompare(b.stockist)) : entries;
}

/* The `Items` query, whatever shape its transformer leaves it in. */
export function normalizeProducts(data) {
  let list = data;
  if (list && !Array.isArray(list) && typeof list === 'object') {
    list = list.edges ?? Object.values(list).find((v) => Array.isArray(v)) ?? [];
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const node = raw?.node ?? raw;
    const item = pick(node, ['item_code', 'name', 'item_name', 'item__name']);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    const label = pick(node, ['item_name', 'name']) ?? item;
    out.push({
      item,
      label,
      /* The product card groups variants under their brand; an item with no
         brand stands as its own. */
      brand: pick(node, ['brand__name', 'brand.name', 'brand']) ?? label,
      pack: pick(node, ['custom_pack', 'custom_pack_size', 'stock_uom']) ?? '',
      price: num(pick(node, ['custom_last_pts', 'pts', 'price', 'standard_rate'])),
      /* The Items row itself, for ProductCard's MRP / PTR / PTS row. */
      row: typeof node === 'object' ? node : { item_name: label },
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/* Fields the SecondaryEntry query must select for per-seat status to be
   right. The harness lists whichever are missing from the live rows. */
export const REQUIRED_LINE_FIELDS = ['custom_status', 'custom_role_profile'];
export const REQUIRED_ROW_FIELDS = ['custom_status_tracker'];

export function missingFields(rows) {
  const first = rows.find((r) => Array.isArray(r?.items) && r.items.length);
  if (!first) return [];
  const missing = [];
  for (const f of REQUIRED_ROW_FIELDS) if (!(f in first)) missing.push(f);
  const line = first.items[0];
  if (!('custom_status' in line)) missing.push('items.custom_status');
  if (lineRoleProfile(line) == null) missing.push('items.custom_role_profile__name');
  return missing;
}
