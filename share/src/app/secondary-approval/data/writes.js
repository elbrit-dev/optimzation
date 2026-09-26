/* Approve / revisit, through Frappe's standard workflow actions.
 *
 * NOT operational_tracker_decision. That custom API method (server script
 * "Secondary Operational Tracker") is what the app used first, but its revisit
 * is refused on production and UAT alike — it passes through "ABM Rejected",
 * and the "Approval flow" workflow has no Rejected → Approval Waiting step —
 * and the ERP team does not own it. The workflow's own steps do the same work,
 * and the tracker's Before Save ("operational tracker" script) still runs on
 * every save, so verification, the entry's tracker row and the roll-up all
 * happen exactly as before (compared field by field on UAT):
 *
 *   approve                    apply_workflow "Approve to Verification"
 *   revisit, waiting           store the note — the approval is already
 *                              waiting on the approver; the workflow's
 *                              "Revisit" there is a same-state no-op
 *   revisit, approved (not     apply_workflow "Revisit" (back to "ABM Approval
 *   yet verified)              Waiting", re-routed by Before Save), then the note
 *
 * The note is written in the ERP's own format, "Revisit (from <state>):
 * <reason>", which is how both screens recognise a stockist sent back.
 *
 * WHO MAY DO WHAT IS THE ERP'S: `actions(names)` asks it (frappe's
 * get_transitions — the workflow's own rules for this user on this
 * tracker), and the screen offers Approve where it lists "Approve to
 * Verification" and Revisit where it lists "Revisit". Nothing here decides
 * who approves whom. (Ramu, RBM, on a tracker waiting on his ABM is offered
 * only "Approve" and "Reject" — the RBM step that changes nothing — so he
 * gets no buttons there.)
 *
 * What IS checked is the ERP's own answer after a write: an approval that
 * did not reach "Approved and Waiting for Verification" is reported as a
 * failure, not as done. A revisit needs a reason (the note is the revisit).
 *
 * KNOWN GAP (ERP): an RBM covering a vacant ABM is refused until the workflow
 * allows RBM those steps.
 *
 * One call (or two) per stockist; the screen gets one result per stockist,
 * `{ name, ok, state, error }`, so a partial failure is named. As the
 * signed-in user (`gqlToken`), no shared credential. */

function authHeader(token) {
  const t = String(token ?? '').trim();
  if (!t) return null;
  return /^(token|bearer|basic)\s/i.test(t) ? t : `token ${t}`;
}

export function erpErrorMessage(body, status) {
  if (body?._server_messages) {
    try {
      const msgs = JSON.parse(body._server_messages).map((m) => {
        try {
          return JSON.parse(m).message;
        } catch {
          return m;
        }
      });
      const text = msgs.join(' ').replace(/<[^>]+>/g, '').trim();
      if (text) return text;
    } catch {
      /* fall through */
    }
  }
  if (body?.exc_type) return body.exc_type;
  if (body?.message && typeof body.message === 'string') return body.message;
  return `ERP request failed (${status})`;
}

export const WAITING = / Approval Waiting$/;
export const UNVERIFIED = / Approved and Waiting for Verification$/;

/* The note both screens read as "sent back": the ERP's own format. */
export function revisitNote(fromState, reason) {
  return `Revisit (from ${fromState}): ${String(reason ?? '').trim()}`;
}

/* How many stockists are decided at once — enough to be quick on a card of
   ten, few enough not to hammer the ERP. */
const PARALLEL = 3;

export function createDecisionWriter({ endpointUrl, gqlToken, fetchImpl = fetch }) {
  const auth = authHeader(gqlToken);
  const origin = new URL(endpointUrl).origin;

  async function call(path, body) {
    const res = await fetchImpl(`${origin}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.exc_type) throw new Error(erpErrorMessage(json, res.status));
    return json.message;
  }
  const getTracker = (name) =>
    call(`/api/method/frappe.client.get?${new URLSearchParams({ doctype: 'Operational Tracker', name })}`);
  const applyWorkflow = (doc, action) => call('/api/method/frappe.model.workflow.apply_workflow', { doc, action });
  const setNote = (name, value) =>
    call('/api/method/frappe.client.set_value', { doctype: 'Operational Tracker', name, fieldname: 'reason_for_rejection', value });

  async function decideOne({ name, action, reason }) {
    const doc = await getTracker(name);
    const state = doc.workflow_state ?? '';
    if (action === 'approve') {
      const after = await applyWorkflow(doc, 'Approve to Verification');
      if (!UNVERIFIED.test(after?.workflow_state ?? '')) {
        return { name, ok: false, state: after?.workflow_state ?? state, error: 'The ERP did not approve it — your role may not be allowed to.' };
      }
      return { name, ok: true, state: after.workflow_state, error: null };
    }
    if (action === 'revisit') {
      if (!String(reason ?? '').trim()) return { name, ok: false, state, error: 'A reason is required to send it back.' };
      if (WAITING.test(state)) {
        await setNote(name, revisitNote(state, reason));
        return { name, ok: true, state, error: null };
      }
      if (UNVERIFIED.test(state)) {
        const after = await applyWorkflow(doc, 'Revisit');
        if (!WAITING.test(after?.workflow_state ?? '')) {
          return { name, ok: false, state: after?.workflow_state ?? state, error: 'The ERP did not send it back — your role may not be allowed to.' };
        }
        try {
          await setNote(name, revisitNote(state, reason));
        } catch (e) {
          /* Moved back, but without its reason: say so, the item is not lost. */
          return { name, ok: true, state: after.workflow_state, error: `Sent back, but the reason was not saved: ${e.message}` };
        }
        return { name, ok: true, state: after.workflow_state, error: null };
      }
      return { name, ok: false, state, error: `Cannot revisit from state: ${state}` };
    }
    return { name, ok: false, state, error: `Unknown action "${action}"` };
  }

  /* Pool of PARALLEL workers over `items`; results in order. */
  async function pool(items, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
    return results;
  }

  return {
    live: true,
    /* names → Map(name → { approve, revisit }): what the ERP's workflow lets
       this user do on each tracker now. A tracker the ERP will not answer
       for gets neither. */
    async actions(names) {
      if (!auth) return new Map();
      const answers = await pool(names, async (name) => {
        try {
          const doc = await getTracker(name);
          const list = await call('/api/method/frappe.model.workflow.get_transitions', { doc });
          const acts = new Set((Array.isArray(list) ? list : []).map((t) => t?.action));
          return [name, { approve: acts.has('Approve to Verification'), revisit: acts.has('Revisit') }];
        } catch {
          return [name, { approve: false, revisit: false }];
        }
      });
      return new Map(answers);
    },
    async decide(decisions) {
      if (!auth) throw new Error("Not signed in to ERP — bind gqlToken (the user's own token) to decide.");
      return pool(decisions, async (d) => {
        try {
          return await decideOne(d);
        } catch (e) {
          return { name: d.name, ok: false, state: null, error: e.message };
        }
      });
    },
  };
}

/* The in-memory stand-in for the harness: plays the ERP's part on the mock
   rows — the same outcomes and refusals as createDecisionWriter, and, for
   `actions`, the routing the ERP's workflow applies: a waiting tracker is
   the viewer's to approve or revisit when it is routed to them (next or
   fallback approver); one they approved that MIS has not verified is theirs
   to revisit. Here, and only here, because here the mock IS the ERP. */
export function createMockWriter({ getRows, setRows, viewer }) {
  const v = String(viewer ?? '').toLowerCase();
  const lower = (x) => String(x ?? '').toLowerCase();
  return {
    live: false,
    async actions(names) {
      const byName = new Map(getRows().map((r) => [r.name, r]));
      return new Map(
        names.map((name) => {
          const r = byName.get(name);
          const state = r?.workflow_state__name ?? '';
          const routed = Boolean(v) && (lower(r?.next_approver__name) === v || lower(r?.custom_fallback_approver__name) === v);
          const waiting = WAITING.test(state) && routed;
          const approvedByMe = UNVERIFIED.test(state) && Boolean(v) && lower(r?.modified_by__name) === v;
          return [name, { approve: waiting, revisit: waiting || approvedByMe }];
        }),
      );
    },
    async decide(decisions) {
      await new Promise((r) => setTimeout(r, 350));
      const byName = new Map(decisions.map((d) => [d.name, d]));
      const results = [];
      const next = getRows().map((row) => {
        const d = byName.get(row.name);
        if (!d) return row;
        const state = row.workflow_state__name ?? '';
        const waiting = state.match(/^(\S+) Approval Waiting$/);
        const verifying = state.match(/^(\S+) Approved and Waiting for Verification$/);
        if (d.action === 'revisit') {
          if (!waiting && !verifying) {
            results.push({ name: row.name, ok: false, error: `Cannot revisit from state: ${state}` });
            return row;
          }
          if (!d.reason) {
            results.push({ name: row.name, ok: false, error: 'A reason is required to send it back.' });
            return row;
          }
          const back = waiting ? state : 'ABM Approval Waiting';
          results.push({ name: row.name, ok: true, state: back, error: null });
          return {
            ...row,
            workflow_state__name: back,
            next_approver__name: viewer ?? row.next_approver__name,
            modified_by__name: viewer ?? row.modified_by__name,
            reason_for_rejection: `Revisit (from ${state}): ${d.reason}`,
          };
        }
        if (!waiting) {
          results.push({ name: row.name, ok: false, error: `Not awaiting approval (state: ${state})` });
          return row;
        }
        const nextState = `${waiting[1]} Approved and Waiting for Verification`;
        results.push({ name: row.name, ok: true, state: nextState, error: null });
        return { ...row, workflow_state__name: nextState, next_approver__name: null, modified_by__name: viewer ?? row.next_approver__name };
      });
      setRows(next);
      return results;
    },
  };
}
