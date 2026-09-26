/* Operational Tracker rows → the approval screen's model. Pure.
 *
 * ONE TRACKER = ONE STOCKIST × ONE SEAT × ONE MONTH. A Secondary Data Entry
 * (stockist + month) is shared by several seats; the server script opens one
 * Operational Tracker per seat once that seat's lines are all out of Draft,
 * and the tracker — not the entry — is what an approver decides. So a
 * "slice" here is one tracker with the seat's OWN lines of the linked entry
 * (the entry carries every seat's lines; the others are not this approval).
 *
 * A SUBMISSION is what the screen shows as one card: everything one person
 * raised for one month — their slices, several stockists. Approve / Reject on
 * the card decides every slice of it that is waiting on the viewer.
 *
 * Tolerant of shape, like secondary-entry/data/shape.js: relay edges or bare
 * arrays, `x__name` scalars or `{ name }` objects, since the saved query can
 * drift from what this file was written against. */

import { lineRoleProfile, revisitReason } from '@/app/secondary-entry/data/shape';

export const STATUS_LABEL = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  partial: 'Partly approved',
};

export const STATUS_TONE = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  partial: 'warning',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function pick(obj, paths) {
  for (const p of paths) {
    const v = get(obj, p);
    if (v != null && v !== '') return v;
  }
  return undefined;
}

export function toTrackerRows(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.map((r) => (r && r.node ? r.node : r)).filter(Boolean);
  if (Array.isArray(data.edges)) return toTrackerRows(data.edges);
  for (const key of ['approvals', 'OperationalTrackers', 'trackers', 'rows']) {
    if (data[key]) return toTrackerRows(data[key]);
  }
  return [];
}

/* "BE7-VASC-CO-NAG" → "BE"; "SRBM1-…" → "SRBM". */
export function tierOf(roleProfile) {
  return String(roleProfile ?? '').split('-')[0].replace(/\d+$/, '').toUpperCase() || null;
}

/* Where a tracker is, from its workflow state. The ERP spells these as
   "<ROLE> Approval Waiting", "<ROLE> Approved and Waiting for Verification",
   "<ROLE> Rejected", "RBM Approved and Verification Rejected", "Approved and
   Verified" — so the bucket is read from the words, not matched exactly.
   Verification being rejected is a rejection: it comes back to be fixed. */
export function bucketOfState(state) {
  const s = String(state ?? '').toLowerCase();
  if (!s) return 'pending';
  if (s.includes('rejected')) return 'rejected';
  if (s.endsWith('approval waiting')) return 'pending';
  if (s.includes('approved') || s.includes('verified')) return 'approved';
  return 'pending';
}

/* The role a pending tracker waits on: "ABM Approval Waiting" → "ABM". */
function waitingRole(state, nextRole) {
  const m = String(state ?? '').match(/^(\S+) Approval Waiting$/i);
  return (m ? m[1] : nextRole) || null;
}

/* The role that decided it: "ABM Approved and …" / "ABM Rejected" → "ABM". */
function decidedRole(state) {
  const m = String(state ?? '').match(/^(\S+) (?:Approved|Rejected)/i);
  return m ? m[1].toUpperCase() : null;
}

/* The entry's name ends "-YYYY-MM-DD" and the tracker's is
   "Secondary Data Entry-<entry>-<seat>" — a fallback for rows whose link to
   the entry did not resolve. */
function parseTrackerName(name, roleProfile) {
  let s = String(name ?? '').replace(/^(Secondary Data Entry|Doctor Support)-/, '');
  if (roleProfile && s.endsWith(`-${roleProfile}`)) s = s.slice(0, -(roleProfile.length + 1));
  const m = s.match(/^(.*)-(\d{4}-\d{2}-\d{2})$/);
  return m ? { stockist: m[1], date: m[2] } : { stockist: s, date: null };
}

export function monthLabel(month) {
  if (!month) return '';
  return MONTHS[Number(String(month).slice(5, 7)) - 1] ?? '';
}

/* One month back: '2026-07' → '2026-06', '2026-01' → '2025-12'. */
export function previousMonth(month) {
  if (!month) return null;
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function normalizeSlice(row) {
  const roleProfile = pick(row, ['role_profile__name', 'role_profile.name', 'role_profile']) ?? null;
  const sde = row?.custom_ref_secondary_data_entry ?? {};
  const fallback = parseTrackerName(row?.name, roleProfile);
  const date = pick(sde, ['date']) ?? fallback.date;
  const state = pick(row, ['workflow_state__name', 'workflow_state.name', 'workflow_state', 'status__name', 'status']) ?? '';
  const bucket = bucketOfState(state);

  /* WHICH TRACKERS is the ERP's permission query. WHICH LINES is ours: the
     entry holds every seat's lines, and a tracker is ONE seat's — so only
     the lines with the tracker's own role profile. */
  const lines = (Array.isArray(sde.items) ? sde.items : [])
    .filter((l) => {
      const rp = lineRoleProfile(l);
      return Boolean(roleProfile) && (typeof rp === 'string' ? rp : rp?.role_profile) === roleProfile;
    })
    .map((l) => ({
      item: pick(l, ['item__name', 'item.item_name', 'item.name', 'item']) ?? '',
      /* The product's brand, for ProductCard's name-plus-variant layout
         ("CALBRIT" + "60K"). Needs items { item { brand__name } } in the
         query; without it the card shows the item name alone. */
      brand: pick(l, ['item.brand__name', 'item.brand', 'brand__name', 'brand']) ?? null,
      salesQty: num(l.sales_qty),
      salesValue: num(l.sales_value),
      closingQty: num(l.closing_qty),
      closingValue: num(l.closing_balance),
    }))
    .filter((l) => l.item);

  const salesQty = lines.reduce((n, l) => n + l.salesQty, 0);
  const linesValue = lines.reduce((n, l) => n + l.salesValue, 0);
  const closingQty = lines.reduce((n, l) => n + l.closingQty, 0);
  const closingValue = lines.reduce((n, l) => n + l.closingValue, 0);

  const raiser = pick(row, ['user.name', 'user__name', 'user']) ?? null;
  const raiserName = pick(row, ['user.full_name', 'user_full_name']) ?? null;

  return {
    name: row?.name ?? '',
    entryName: pick(sde, ['name']) ?? null,
    stockist: pick(sde, ['distributor__name', 'distributor.name']) ?? fallback.stockist ?? '',
    ebsCode: pick(sde, ['distributor.whg_ebs_code']) ?? null,
    /* A doctor's specialty and city, when the server sends them. */
    note: pick(sde, ['distributor.note']) ?? null,
    hq: pick(row, ['hq__name', 'hq.name', 'hq']) ?? pick(sde, ['distributor.territory__name']) ?? null,
    date,
    month: date ? String(date).slice(0, 7) : null,
    roleProfile,
    tier: tierOf(roleProfile),
    raiser: typeof raiser === 'string' ? raiser.toLowerCase() : null,
    raiserName: typeof raiserName === 'string' ? raiserName.trim() : null,
    state,
    status: bucket,
    atRole: bucket === 'pending' ? waitingRole(state, pick(row, ['next_role__name', 'next_role'])) : null,
    decidedRole: bucket === 'pending' ? null : decidedRole(state),
    nextApprover: String(pick(row, ['next_approver__name', 'next_approver.name', 'next_approver']) ?? '').toLowerCase() || null,
    fallbackApprover:
      String(pick(row, ['custom_fallback_approver__name', 'custom_fallback_approver.name', 'custom_fallback_approver']) ?? '').toLowerCase() ||
      null,
    modifiedBy: String(pick(row, ['modified_by__name', 'modified_by.name', 'modified_by']) ?? '').toLowerCase() || null,
    modified: row?.modified ?? null,
    reason: pick(row, ['reason_for_rejection']) ?? null,
    /* Sent back for revisit and still waiting on the BE's correction — the
       approver's reason, else null (see secondary-entry revisitReason). */
    revisitNote: revisitReason(pick(row, ['reason_for_rejection']), state),
    lines,
    salesQty,
    closingQty,
    closingValue,
    /* The tracker's own figure is what the server summed when it opened the
       approval; the lines are the fallback when it is missing. */
    value: num(row?.data) || linesValue,
  };
}

export function normalizeSlices(data) {
  return toTrackerRows(data).map(normalizeSlice).filter((s) => s.name);
}

function submissionStatus(slices) {
  const pending = slices.filter((s) => s.status === 'pending').length;
  const rejected = slices.filter((s) => s.status === 'rejected').length;
  if (pending) return 'pending';
  if (rejected === slices.length) return 'rejected';
  if (rejected) return 'partial';
  return 'approved';
}

/* Group slices into submissions: one per (raiser, month). The raiser is the
   tracker's user; a vacant seat has none, so its seat stands in.

   WHAT THE VIEWER MAY DO IS THE ERP'S ANSWER, not worked out here:
   `allowed` maps a tracker to the workflow actions the ERP offers this user
   on it (writer.actions — frappe's get_transitions), and `mine` /
   `revisitable` are just those. A tracker not asked about yet has none. */
export function groupSubmissions(slices, { viewer, allowed } = {}) {
  const v = viewer?.toLowerCase() ?? null;
  const byKey = new Map();
  for (const s of slices) {
    const who = s.raiser || s.roleProfile || 'unknown';
    const key = `${who}::${s.month ?? ''}`;
    if (!byKey.has(key)) byKey.set(key, { key, raiser: s.raiser, month: s.month, slices: [] });
    byKey.get(key).slices.push(s);
  }
  return [...byKey.values()].map((g) => {
    const first = g.slices[0];
    const slicesSorted = [...g.slices].sort((a, b) => b.value - a.value || a.stockist.localeCompare(b.stockist));
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const s of g.slices) counts[s.status] += 1;
    const status = submissionStatus(g.slices);
    return {
      ...g,
      slices: slicesSorted,
      raiserName: first.raiserName || first.raiser || first.roleProfile || 'Unknown',
      roleProfile: first.roleProfile,
      tier: first.tier,
      hq: first.hq,
      isSelf: Boolean(v && g.raiser === v),
      mine: g.slices.filter((s) => allowed?.get(s.name)?.approve).map((s) => s.name),
      revisitable: g.slices.filter((s) => allowed?.get(s.name)?.revisit).map((s) => s.name),
      counts,
      status,
      stockists: new Set(g.slices.map((s) => s.stockist)).size,
      salesQty: g.slices.reduce((n, s) => n + s.salesQty, 0),
      value: g.slices.reduce((n, s) => n + s.value, 0),
      closingQty: g.slices.reduce((n, s) => n + s.closingQty, 0),
      closingValue: g.slices.reduce((n, s) => n + s.closingValue, 0),
    };
  });
}
