/* Writing a seat's figures back to ERP.
 *
 * WHY REST get → save AND NOT GraphQL saveDoc. Frappe rebuilds every child
 * table from the dict it is handed: a table missing from the payload is
 * emptied, a row missing from a table is deleted. A GraphQL saveDoc can only
 * send back the fields its query selected, so one un-selected field or table
 * (`custom_item_log`, a tracker column) would silently destroy data belonging
 * to OTHER seats on the same entry. `frappe.client.get` returns the whole
 * document verbatim; changing only this seat's lines in that and handing it
 * back to `frappe.client.save` round-trips everything else untouched.
 *
 * `modified` rides along in the fetched doc, so a save racing another seat's
 * gets TimestampMismatchError instead of overwriting it. That clash is
 * RETRIED ONCE, and the retry is not blind: it re-reads the entry and lays
 * only this seat's lines over the other seat's fresh save — so two BEs
 * pressing Submit on one stockist at the same moment both go through (seen
 * on UAT, where the loser used to get "reload and try again"). A second
 * clash in a row is surfaced as before.
 *
 * SUBMIT IS A SAVE, NOT A WORKFLOW ACTION. The "Secondary tracker" Before-Save
 * script creates a seat's Operational Tracker and tracker row once all of the
 * seat's lines are out of Draft. So Save draft writes the lines as "Draft",
 * Submit writes them as "Submitted", and the server does the rest. Totals
 * (custom_total_*) are summed server-side too — from each line's sales_value
 * and closing_balance, which is why those are computed here as qty × PTS.
 *
 * Credentials: the signed-in user's own token, required, never a shared one
 * (same rule as /visit's liveSource).
 */

export const DOCTYPE = 'Secondary Data Entry';
const CHILD_DOCTYPE = 'Secondary Data Table';

export const LINE_DRAFT = 'Draft';
export const LINE_SUBMITTED = 'Submitted';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function childRoleProfile(child) {
  return child.custom_role_profile ?? child.custom_role_profile__name ?? null;
}

function childItem(child) {
  return child.item ?? child.item__name ?? null;
}

/* Pure: the document with `roleProfile`'s lines set from `lines`. Other
   seats' children are returned as the same objects, untouched. */
export function applySeatLines(doc, { roleProfile, lines, submit }) {
  if (!roleProfile) throw new Error('No seat (roleProfile) to write lines for.');
  const status = submit ? LINE_SUBMITTED : LINE_DRAFT;
  const byItem = new Map(lines.filter((l) => l.item).map((l) => [l.item, l]));
  const children = Array.isArray(doc.items) ? doc.items : [];
  const template = children.find((c) => childRoleProfile(c) === roleProfile) ?? {};

  const touched = new Set();
  const nextChildren = children.map((child) => {
    if (childRoleProfile(child) !== roleProfile) return child;
    const form = byItem.get(childItem(child));
    const next = { ...child, custom_status: status };
    if (form) {
      touched.add(form.item);
      const price = Number(form.price) || 0;
      next.sales_qty = Number(form.salesQty) || 0;
      next.closing_qty = Number(form.closingQty) || 0;
      next.sales_value = round2(next.sales_qty * price);
      next.closing_balance = round2(next.closing_qty * price);
      if (price > 0) next.rate = price;
    }
    return next;
  });

  for (const form of byItem.values()) {
    if (touched.has(form.item)) continue;
    const price = Number(form.price) || 0;
    const salesQty = Number(form.salesQty) || 0;
    const closingQty = Number(form.closingQty) || 0;
    nextChildren.push({
      doctype: CHILD_DOCTYPE,
      parentfield: 'items',
      item: form.item,
      custom_role_profile: roleProfile,
      custom_hq: template.custom_hq ?? template.custom_hq__name,
      custom_department: template.custom_department ?? template.custom_department__name,
      custom_status: status,
      rate: price,
      sales_qty: salesQty,
      closing_qty: closingQty,
      sales_value: round2(salesQty * price),
      closing_balance: round2(closingQty * price),
    });
  }

  return { ...doc, items: nextChildren };
}

function normalizeToken(raw) {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return /^token\s/i.test(trimmed) ? trimmed : `token ${trimmed}`;
}

/* Frappe buries the useful sentence in _server_messages (a JSON string of
   JSON strings) or in exception. HTTP 417 on its own tells the user nothing. */
export function erpErrorMessage(json, status) {
  if (json?.exc_type === 'TimestampMismatchError' || /TimestampMismatch/.test(json?.exception ?? '')) {
    return 'Someone else saved this stockist since you opened it. Reload and try again.';
  }
  if (json?._server_messages) {
    try {
      const messages = JSON.parse(json._server_messages).map((m) => {
        try {
          return JSON.parse(m).message;
        } catch {
          return m;
        }
      });
      const text = messages.filter(Boolean).join(' ').replace(/<[^>]+>/g, '').trim();
      if (text) return text;
    } catch {
      /* fall through */
    }
  }
  if (json?.exception) return String(json.exception).replace(/^[\w.]+:\s*/, '');
  if (json?.message && typeof json.message === 'string') return json.message;
  return `ERP request failed (HTTP ${status})`;
}

export function createErpWriter({ endpointUrl, gqlToken }) {
  const token = normalizeToken(gqlToken);
  if (!endpointUrl) throw new Error('No ERP endpoint configured for writes.');
  if (!token) {
    throw new Error("No gqlToken — bind the signed-in user's ERP token to save or submit entries.");
  }
  const origin = new URL(endpointUrl).origin;

  async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* A proxy error page is not JSON; the status below still says enough. */
    }
    if (!res.ok || json?.exc_type || json?.exception) {
      const err = new Error(erpErrorMessage(json, res.status));
      err.timestampClash = json?.exc_type === 'TimestampMismatchError' || /TimestampMismatch/.test(json?.exception ?? '');
      throw err;
    }
    return json?.message;
  }

  async function fetchDoc(name) {
    const qs = new URLSearchParams({ doctype: DOCTYPE, name });
    return call(`/api/method/frappe.client.get?${qs}`);
  }

  return {
    live: true,
    /* Who the token's user is, and their seat: their active Employee's
       role_id — the ERP's answer, as its own scripts resolve it. */
    async whoAmI() {
      const user = await call('/api/method/frappe.auth.get_logged_user');
      const [emp] =
        (await call('/api/method/frappe.client.get_list', {
          method: 'POST',
          body: {
            doctype: 'Employee',
            filters: { user_id: user, status: 'Active' },
            fields: ['role_id', 'custom_role_profile'],
            limit_page_length: 1,
          },
        })) ?? [];
      return { user, seat: emp?.role_id || emp?.custom_role_profile || null };
    },
    async saveSeat(name, opts) {
      for (let attempt = 1; ; attempt += 1) {
        const doc = await fetchDoc(name);
        if (!doc) throw new Error(`Entry "${name}" not found in ERP.`);
        try {
          return await call('/api/method/frappe.client.save', {
            method: 'POST',
            body: { doc: JSON.stringify(applySeatLines(doc, opts)) },
          });
        } catch (e) {
          if (!e.timestampClash || attempt >= 2) throw e;
        }
      }
    },
  };
}

/* The harness's stand-in. It also plays the part of the server script —
   a submitted seat gets its tracker row — so the screen can be exercised end
   to end without ERP. Nothing here runs in production. */
export function createMockWriter({ getRows, setRows, delayMs = 350, seat = null }) {
  return {
    live: false,
    async whoAmI() {
      return { user: null, seat };
    },
    async saveSeat(name, opts) {
      await new Promise((r) => setTimeout(r, delayMs));
      const rows = getRows();
      const index = rows.findIndex((r) => r.name === name);
      if (index < 0) throw new Error(`Entry "${name}" not found.`);
      const next = applySeatLines(rows[index], opts);
      if (opts.submit) {
        const trackers = (next.custom_status_tracker ?? []).filter((t) => t.role_profile !== opts.roleProfile);
        trackers.push({
          role_profile: opts.roleProfile,
          status: 'ABM Approval Waiting',
          tracker: `Secondary Data Entry-${next.distributor?.name ?? next.distributor}-${next.date}-${opts.roleProfile}`,
        });
        next.custom_status_tracker = trackers;
      }
      const copy = rows.slice();
      copy[index] = next;
      setRows(copy);
      return next;
    },
  };
}
