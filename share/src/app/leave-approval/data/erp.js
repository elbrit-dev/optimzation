/* Leave approvals against the ERP, as the signed-in user (their own token —
 * the ERP's permissions decide what is read and what may be decided).
 *
 * READ — the elbrit_leave_approvals server script (server/): every Open
 *   leave the user may see, and every one ending within the last
 *   RECENT_DAYS (the Decided tab, and who is off) — HR, IT and the CEO
 *   everyone's, anyone else their team's down the Role Profile tree. Rows
 *   in the GraphQL shape (links as `x__name`). Without the script, GraphQL
 *   LeaveApplications: what the ERP lets the user read.
 *
 * DECIDE — the "Leave Approval" workflow's own actions, as the desk does:
 *   approve  apply_workflow "Approve"  (Open → Approved, submitted)
 *   reject   the reason as a comment on the leave, then apply_workflow
 *            "Reject" (Open → Rejected). Writing `status` directly is
 *            reverted by the workflow (calendar leave.service.js found this).
 * The ERP's answer is checked after each write: a leave that did not reach
 * the state asked for is reported as a failure, not as done.
 * TO VERIFY ON UAT before going live: the calendar approves by "set status
 * Approved, then submit"; this uses the workflow's Approve, which needs the
 * approver to hold the Leave Approver role (the workflow's `allowed`). */

const RECENT_DAYS = 30;

function authHeader(token) {
  const t = String(token ?? '').trim();
  if (!t) return null;
  return /^(token|bearer|basic)\s/i.test(t) ? t : `token ${t}`;
}

function errorText(body, status) {
  if (body?._server_messages) {
    try {
      const text = JSON.parse(body._server_messages)
        .map((m) => { try { return JSON.parse(m).message; } catch { return m; } })
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (text) return text;
    } catch { /* fall through */ }
  }
  return body?.exc_type || (typeof body?.message === 'string' ? body.message : null) || `ERP request failed (${status})`;
}

const LEAVE_FIELDS = `
  name employee__name employee_name department__name leave_type__name
  from_date to_date half_day half_day_date total_leave_days description
  posting_date status custom_attachement
  leave_approver__name leave_approver_name custom_escalation_approver__name
  modified modified_by__name
`;
const LEAVES_QUERY = `
  query LeaveApprovals($first: Int!, $filters: [DBFilterInput!]) {
    LeaveApplications(first: $first, filter: $filters) { edges { node { ${LEAVE_FIELDS} } } }
  }
`;

export function createErpLeaveSource({ endpointUrl, token, fetchImpl = fetch }) {
  const origin = new URL(endpointUrl).origin;
  const headers = { Authorization: authHeader(token), Accept: 'application/json' };

  async function gql(query, variables) {
    const res = await fetchImpl(endpointUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
    if (!res.ok || !json.data) throw new Error(errorText(json, res.status));
    return json.data;
  }

  async function method(path, body) {
    const res = await fetchImpl(`${origin}/api/method/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.exc_type) throw new Error(errorText(json, res.status));
    return json.message;
  }

  return {
    whoAmI: () => method('frappe.auth.get_logged_user'),

    /* The leaves the caller may see — the ERP decides who sees whose
       (elbrit_leave_approvals: HR, IT and the CEO everyone's; anyone else
       their team's, down the Role Profile tree). Where that script is not
       installed, the plain GraphQL read: what the ERP lets them read. */
    async load({ today }) {
      try {
        const m = await method(`elbrit_leave_approvals?today=${encodeURIComponent(today)}`);
        if (Array.isArray(m?.rows)) return m.rows;
      } catch {
        /* not installed here — fall back below */
      }
      const since = new Date(Date.parse(today) - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
      const [open, recent] = await Promise.all([
        gql(LEAVES_QUERY, { first: 2000, filters: [{ fieldname: 'status', operator: 'EQ', value: 'Open' }] }),
        gql(LEAVES_QUERY, { first: 2000, filters: [{ fieldname: 'to_date', operator: 'GTE', value: since }] }),
      ]);
      const byName = new Map();
      for (const d of [open, recent]) for (const { node } of d.LeaveApplications.edges) byName.set(node.name, node);
      return [...byName.values()];
    },

    /* [{ name, action: 'approve'|'reject', reason }] → [{ name, ok, status, error }] */
    async decide(decisions) {
      const out = [];
      for (const d of decisions) {
        const want = d.action === 'approve' ? 'Approved' : 'Rejected';
        try {
          const doc = await method(`frappe.client.get?doctype=Leave%20Application&name=${encodeURIComponent(d.name)}`);
          if (d.action === 'reject' && d.reason?.trim()) {
            await method('frappe.desk.form.utils.add_comment', {
              reference_doctype: 'Leave Application',
              reference_name: d.name,
              content: `Rejected: ${d.reason.trim()}`,
              comment_email: await method('frappe.auth.get_logged_user'),
              comment_by: '',
            });
          }
          const after = await method('frappe.model.workflow.apply_workflow', {
            doc: JSON.stringify(doc),
            action: d.action === 'approve' ? 'Approve' : 'Reject',
          });
          const ok = after?.status === want;
          out.push({ name: d.name, ok, status: after?.status ?? null, error: ok ? null : `The leave is "${after?.status}", not ${want}.` });
        } catch (error) {
          out.push({ name: d.name, ok: false, status: null, error: error.message });
        }
      }
      return out;
    },
  };
}

/* The Mock mode's writer: plays the workflow on the seeded rows. */
export function createMockLeaveSource({ getRows, setRows, viewer }) {
  return {
    whoAmI: async () => viewer,
    load: async () => getRows(),
    async decide(decisions) {
      await new Promise((r) => setTimeout(r, 450));
      const now = '2026-11-11 12:00:00';
      const want = new Map(decisions.map((d) => [d.name, d.action === 'approve' ? 'Approved' : 'Rejected']));
      setRows((rows) => rows.map((r) => (want.has(r.name) ? { ...r, status: want.get(r.name), modified: now, modified_by__name: viewer } : r)));
      return decisions.map((d) => ({ name: d.name, ok: true, status: want.get(d.name), error: null }));
    },
  };
}
