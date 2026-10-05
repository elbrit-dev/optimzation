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

import { SECONDARY } from './task';

/* The doctype and fields written come from the TASK (see task.js):
   Secondary Data Entry by default, Doctor Support for that screen. */
export const DOCTYPE = SECONDARY.doctype;

export const LINE_DRAFT = 'Draft';
export const LINE_SUBMITTED = 'Submitted';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function childRoleProfile(child, f = SECONDARY.fields) {
  return child[f.roleProfile] ?? child[`${f.roleProfile}__name`] ?? null;
}

function childItem(child) {
  return child.item ?? child.item__name ?? null;
}

/* The figures a form line writes, in the task's field names: qty and its
   value at the line's price (PTS), and closing where the task keys it. */
function lineFigures(form, f) {
  const price = Number(form.price) || 0;
  const qty = Number(form.salesQty) || 0;
  const out = { [f.qty]: qty, [f.value]: round2(qty * price) };
  if (f.closingQty) {
    const closingQty = Number(form.closingQty) || 0;
    out[f.closingQty] = closingQty;
    out[f.closingValue] = round2(closingQty * price);
  }
  if (f.rate && price > 0) out[f.rate] = price;
  return out;
}

/* The task's line field names, as THIS record has them. A task can name
   another set (`fieldsAlt`: Doctor Support's custom_role_profile etc. on
   production, role_profile etc. on UAT); the set the record's lines carry
   wins. frappe.client.get returns every field of a line, empty ones too, so
   any line says which names this ERP uses. */
export function lineFields(children, task = SECONDARY) {
  const f = task.fields;
  const alt = task.fieldsAlt;
  if (!alt || !children.length) return f;
  const has = (key) => children.some((c) => Object.prototype.hasOwnProperty.call(c, key));
  return !has(f.roleProfile) && has(alt.roleProfile) ? { ...f, ...alt } : f;
}

/* Pure: the document with `roleProfile`'s lines set from `lines`. Other
   seats' children are returned as the same objects, untouched. `task` says
   which child table and fields (Secondary by default). */
export function applySeatLines(doc, { roleProfile, lines, submit }, task = SECONDARY) {
  if (!roleProfile) throw new Error('No seat (roleProfile) to write lines for.');
  const children = Array.isArray(doc[task.childTable]) ? doc[task.childTable] : [];
  const f = lineFields(children, task);
  const status = submit ? LINE_SUBMITTED : LINE_DRAFT;
  const byItem = new Map(lines.filter((l) => l.item).map((l) => [l.item, l]));
  const template = children.find((c) => childRoleProfile(c, f) === roleProfile) ?? {};

  const touched = new Set();
  const nextChildren = children.map((child) => {
    if (childRoleProfile(child, f) !== roleProfile) return child;
    const form = byItem.get(childItem(child));
    const next = { ...child, [f.status]: status };
    if (form) {
      touched.add(form.item);
      Object.assign(next, lineFigures(form, f));
    }
    return next;
  });

  for (const form of byItem.values()) {
    if (touched.has(form.item)) continue;
    nextChildren.push({
      doctype: task.childDoctype,
      parentfield: task.childTable,
      item: form.item,
      [f.roleProfile]: roleProfile,
      [f.hq]: template[f.hq] ?? template[`${f.hq}__name`],
      [f.department]: template[f.department] ?? template[`${f.department}__name`],
      [f.status]: status,
      ...lineFigures(form, f),
    });
  }

  return { ...doc, [task.childTable]: nextChildren };
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

export function createErpWriter({ endpointUrl, gqlToken, task = SECONDARY }) {
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
    const qs = new URLSearchParams({ doctype: task.doctype, name });
    return call(`/api/method/frappe.client.get?${qs}`);
  }

  return {
    live: true,
    /* Who the token's user is, and their seat: their active Employee's
       custom_role_profile, as the ERP's own tracker scripts resolve it
       (role_id is stale for some people: an old seat, e.g. from before a
       promotion), with role_id only as the fallback. */
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
      return { user, seat: emp?.custom_role_profile || emp?.role_id || null };
    },
    async saveSeat(name, opts) {
      for (let attempt = 1; ; attempt += 1) {
        const doc = await fetchDoc(name);
        if (!doc) throw new Error(`Entry "${name}" not found in ERP.`);
        try {
          return await call('/api/method/frappe.client.save', {
            method: 'POST',
            body: { doc: JSON.stringify(applySeatLines(doc, opts, task)) },
          });
        } catch (e) {
          if (!e.timestampClash || attempt >= 2) throw e;
        }
      }
    },
    attachSheet(file, names) {
      return sendSheet({ origin, token, task, file, names });
    },
    /* "Add doctor" / "Add stockist" (task.addMethod): the seat's lines onto
       each party's record for the PREVIOUS month — the script decides the
       month from today's date, so none is sent — created when there is none.
       The parties go under task.addParam ("doctors" / "stockists").
       → { month, created: [name], added: [name], skipped: [{ doctor, reason }] } */
    addParties({ parties }) {
      if (!task.addMethod) throw new Error(`${task.Parties} cannot be added here.`);
      return call(`/api/method/${task.addMethod}`, { method: 'POST', body: { [task.addParam]: parties } });
    },
  };
}

/* THE UPLOADED SHEET, kept on every entry it fills: the "Upload File" API
 * script (upload_to_field, source in server/) adds it as a File on each of
 * `docnames` — earlier uploads, other teams' included, stay — and points the
 * task's sheetField (Transformed Data) at it. The screen sends it BEFORE the
 * figures and fills nothing when this throws, so it must either keep the
 * file on every record or say it did not:
 *   - a dropped connection, a timeout or a 5xx is retried (ATTEMPTS in all);
 *     a refusal (403, a frappe.throw's 417 …) is final and is not
 *   - the answer must name every record sent: a script that does not take
 *     `docnames` (an older copy keeps the first record only) is an error,
 *     not a quiet partial save
 * `docname` (the first) rides along for that older script's sake. */
const ATTEMPTS = 3;
const RETRY_STATUS = [408, 425, 429, 500, 502, 503, 504];

/* What the kept file is called on a record: "<seat>-<party>-<month>" — who
   uploaded it, for which stockist / doctor, for which month. The script adds
   the extension, and numbers a repeat by the same seat on the same record:
   "… (1)", "… (2)". Characters a file name or URL cannot carry are dropped. */
export function sheetBaseName({ seat, party, month }) {
  return [seat, party, month]
    .map((s) => String(s ?? '').replace(/[\\/:*?"<>|#%\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('-')
    .slice(0, 120);
}

/* `targets`: the records, each a name or { name, base } (base: sheetBaseName). */
export async function sendSheet({ origin, token, task, file, names: targets, fetchImpl = fetch, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const bases = {};
  for (const t of targets ?? []) {
    const n = typeof t === 'string' ? t : t?.name;
    if (n && !(n in bases)) bases[n] = (typeof t === 'object' && t?.base) || '';
  }
  const docnames = Object.keys(bases);
  if (!task?.sheetField || !docnames.length) return null;
  if (!file) throw new Error('No file to keep.');
  /* A File from the picker; anything else read into one. */
  const blob = typeof Blob !== 'undefined' && file instanceof Blob ? file : new Blob([await file.arrayBuffer()]);
  if (!blob.size) throw new Error('The file is empty.');
  const filename = String(file.name ?? '').trim() || `${task.fileStem ?? 'sheet'}.xlsx`;

  for (let attempt = 1; ; attempt += 1) {
    const form = new FormData();
    form.append('doctype', task.doctype);
    form.append('docname', docnames[0]);
    form.append('docnames', JSON.stringify(docnames));
    form.append('filenames', JSON.stringify(bases));
    form.append('fieldname', task.sheetField);
    form.append('file', blob, filename);
    let res;
    try {
      res = await fetchImpl(`${origin}/api/method/upload_to_field`, { method: 'POST', headers: { Authorization: token }, body: form });
    } catch (e) {
      if (attempt < ATTEMPTS) {
        await wait(attempt * 1000);
        continue;
      }
      throw new Error(`Could not reach ERP to keep the file (${e?.message ?? e}).`);
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* as in call() */
    }
    if (!res.ok || json?.exc_type || json?.exception) {
      if (RETRY_STATUS.includes(res.status) && attempt < ATTEMPTS) {
        await wait(attempt * 1000);
        continue;
      }
      throw new Error(erpErrorMessage(json, res.status));
    }
    const kept = new Set(Array.isArray(json?.message?.docnames) ? json.message.docnames : []);
    const missed = docnames.filter((n) => !kept.has(n));
    if (missed.length) {
      throw new Error(`ERP kept the file on ${docnames.length - missed.length} of ${docnames.length} records — its "Upload File" script is out of date.`);
    }
    return json.message;
  }
}

/* The harness's stand-in. It also plays the part of the server script —
   a submitted seat gets its tracker row — so the screen can be exercised end
   to end without ERP. Nothing here runs in production. Its rows are in the
   server scripts' shape (Secondary's field names) for every task, so it
   writes them with Secondary's mapping; `task` only names the tracker. */
export function createMockWriter({ getRows, setRows, delayMs = 350, seat = null, task = SECONDARY }) {
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
          tracker: `${task.trackerPrefix}-${next.distributor?.name ?? next.distributor}-${next.date}-${opts.roleProfile}`,
        });
        next.custom_status_tracker = trackers;
      }
      const copy = rows.slice();
      copy[index] = next;
      setRows(copy);
      return next;
    },
    async attachSheet() {
      return null;
    },
  };
}
