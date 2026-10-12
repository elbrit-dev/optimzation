/* Doctor Service — every ERP call the form and the two pages make, as the
 * signed-in user (their own token), never a shared credential.
 *
 *   reads    the three server scripts in ../server:
 *              options(doctor?)   who is asking, + the form's lists
 *              list()             every app-raised service
 *              insight(doctor)    support by month, services, visits
 *   writes   plain Frappe:
 *              create / update    /api/resource/Doctor Service — SAVING
 *                                 SUBMITS: the Doctor Service Guard puts a new
 *                                 or sent-back service into approval (its
 *                                 Operational Tracker, at GM)
 *              decide(tracker, kind, reason)
 *                                 frappe.model.workflow.apply_workflow on the
 *                                 service's Operational Tracker — the way
 *                                 Secondary Approval decides — then the note
 *                                 into the tracker's reason_for_rejection
 *              upload(name, file) /api/method/upload_file
 *              comment(name, text) a Comment on the service (approver's note)
 *            The ERP's workflow decides who may do what; the guard checks
 *            every save. Nothing here decides it.
 *
 * `makeClient` takes the GraphQL endpoint the rest of the app is bound to
 * ("https://erp.../api/method/graphql") and talks to its origin. */

import { erpErrorMessage } from '@/app/secondary-approval/data/writes';

export const DOCTYPE = 'Doctor Service';
export const TRACKER = 'Operational Tracker';
/* The app's decision -> the "Approval flow" workflow's action. */
export const ACTIONS = {
  approve: 'Approve', // GM: on to CEO
  final: 'Approve to Verification', // GM: approve as final; CEO: approve
  reject: 'Reject',
  revisit: 'Revisit', // send back to MIS (Rework)
};
export const revisitNote = (fromState, reason) => `Revisit (from ${fromState}): ${String(reason ?? '').trim()}`;

function authHeader(token) {
  const t = String(token ?? '').trim();
  if (!t) return null;
  return /^(token|bearer|basic)\s/i.test(t) ? t : `token ${t}`;
}

export function makeClient({ endpointUrl, token, fetchImpl = (...a) => fetch(...a) }) {
  if (!endpointUrl) throw new Error('No ERP endpoint is bound.');
  if (!authHeader(token)) throw new Error("No ERP token is bound — sign in again.");
  const origin = new URL(endpointUrl).origin;
  const auth = authHeader(token);

  async function call(path, { method = 'GET', body, query, raw } = {}) {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const headers = { Authorization: auth, Accept: 'application/json' };
    if (body && !raw) headers['Content-Type'] = 'application/json';
    const res = await fetchImpl(`${origin}${path}${qs}`, {
      method,
      headers,
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.exc_type) {
      const err = new Error(erpErrorMessage(json, res.status));
      err.status = res.status;
      throw err;
    }
    return json;
  }
  const method = (name, query) => call(`/api/method/${name}`, { query }).then((j) => j.message);
  const resource = (name) => `/api/resource/${encodeURIComponent(DOCTYPE)}${name ? `/${encodeURIComponent(name)}` : ''}`;

  return {
    live: true,
    options: (doctor) => method('elbrit_doctor_service_options', doctor ? { doctor } : undefined),
    list: () => method('elbrit_doctor_service_list'),
    insight: (doctor, exclude) => method('elbrit_doctor_service_insight', exclude ? { doctor, exclude } : { doctor }),
    create: (fields) => call(resource(), { method: 'POST', body: { ...fields, custom_via_app: 1 } }).then((j) => j.data),
    update: (name, fields) => call(resource(name), { method: 'PUT', body: fields }).then((j) => j.data),
    /* A sent-back service: saving it again resubmits it (the guard). */
    resubmit: (name) => call(resource(name), { method: 'PUT', body: {} }).then((j) => j.data),
    /* kind: approve | final | reject | revisit.
       → the tracker's new workflow_state. */
    async decide(tracker, kind, reason) {
      const action = ACTIONS[kind];
      if (!action) throw new Error(`Unknown decision "${kind}"`);
      if (!tracker) throw new Error('This service is not in approval yet.');
      const doc = (await call('/api/method/frappe.client.get', { query: { doctype: TRACKER, name: tracker } })).message;
      const from = doc.workflow_state;
      const next = (await call('/api/method/frappe.model.workflow.apply_workflow', {
        method: 'POST',
        body: { doc, action },
      })).message;
      const note = String(reason ?? '').trim();
      if (note) {
        // After the step, as Secondary Approval does: the tracker the step
        // saved is the one the note goes on.
        await call('/api/method/frappe.client.set_value', {
          method: 'POST',
          body: { doctype: TRACKER, name: tracker, fieldname: 'reason_for_rejection', value: kind === 'revisit' ? revisitNote(from, note) : note },
        });
      }
      return next?.workflow_state;
    },
    comment: (name, text) => call('/api/resource/Comment', {
      method: 'POST',
      body: { comment_type: 'Comment', reference_doctype: DOCTYPE, reference_name: name, content: text },
    }).then(() => true),
    async upload(name, file) {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('doctype', DOCTYPE);
      form.append('docname', name);
      form.append('fieldname', 'service_attachement');
      form.append('is_private', '1');
      const up = (await call('/api/method/upload_file', { method: 'POST', body: form, raw: true })).message;
      if (up?.file_url) await call(resource(name), { method: 'PUT', body: { service_attachement: up.file_url } });
      return up;
    },
    fileUrl: (url) => (url && url.startsWith('/') ? origin + url : url),
  };
}

/* Several writes, a few at a time; one failing does not stop the rest.
   → [{ name, ok, error }] */
export async function each(names, fn, parallel = 3) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < names.length) {
      const name = names[i++];
      try {
        await fn(name);
        out.push({ name, ok: true });
      } catch (error) {
        out.push({ name, ok: false, error: error?.message || 'Could not update.' });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, names.length) }, worker));
  return out;
}
