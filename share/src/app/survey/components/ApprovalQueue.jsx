'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Icon, cx, toneFill } from '@/design-system';
import { answerText } from '../data/shape';

/* 26 Nov 2026 · SURVEY STUDIO — the approver's "To approve" queue (survey_approval), as the Studio's Approver preview:
 *   progress (approved of all) · how many the AI approved · one tab per team member (most waiting first) · that
 *   person's card with "Approve all N" · each answer: what it is about, when, Clerk (with the AI's reason) or
 *   Waiting, the first answer (all of them on tap) · Return (with a reason the rep sees) / Approve.
 * A returned answer goes back to the rep as a to-do. Survey Managers see everyone's (head office on the approver's behalf). */

/* 27 Nov 2026 · when it was sent, as the artifact's queue says it: "Today 10:12", "Yesterday", "3 days ago" */
export function whenText(at, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(at || ''));
  if (!m) return at || '';
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const n = Math.round((today - day) / 86400000);
  if (n <= 0) return m[4] ? `Today ${m[4]}:${m[5]}` : 'Today';
  if (n === 1) return 'Yesterday';
  return `${n} days ago`;
}

export function useApprovals(api, enabled = true) {
  const [state, setState] = useState({ loaded: false, items: [], done: [], all: 0, err: '' });
  const load = useCallback(async () => {
    if (!enabled || typeof api?.approval !== 'function') return;
    try {
      const [p, d] = await Promise.all([api.approval({ action: 'list', which: 'pending' }), api.approval({ action: 'list', which: 'done' })]);
      setState({ loaded: true, items: p?.items ?? [], done: d?.items ?? [], all: p?.all ?? 0, err: '' });
    } catch (e) {
      setState((s) => ({ ...s, loaded: true, err: e?.message || 'Couldn’t load the approvals.' }));
    }
  }, [api, enabled]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

/* the circle on the home strip — only for an approver with something waiting or already decided */
export function approveTile(ap, { hrefBase = '/survey' } = {}) {
  if (!ap?.loaded || (!ap.items.length && !ap.done.length)) return null;
  const n = ap.items.length;
  return {
    id: 'survey-approve',
    label: 'To approve',
    href: `${hrefBase}/approve`,
    icon: 'verified',
    statusIcon: n ? 'clock' : 'check-square',
    statusTone: n ? undefined : 'success',
    iconTone: n ? undefined : 'success',
    caption: n ? 'Answers' : 'Done',
    captionTone: n ? 'danger' : 'success',
    ...(n ? { count: n, countTone: 'danger' } : {}),
    segments: n ? [{ key: 'left', value: n, tone: 'danger', label: 'To approve' }] : [{ key: 'done', value: 1, tone: 'success', label: 'All approved' }],
    ariaLabel: n ? `To approve: ${n} answer${n === 1 ? '' : 's'} from your team` : 'To approve: all done',
  };
}

const first = (n) => String(n || '').split(' ')[0];
const initials = (n) =>
  String(n || '?')
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
const AV = ['#9333ea', '#5fbdbd', '#d97706'];
/* "{#lead_name}'s clinic" → "Dr A K Jaiswal's clinic" */
const fillLabel = (t, sub) => String(t || '').replace(/\{#\s*(\w+)\s*\}/g, (m, k) => (/name/i.test(k) && sub?.label ? sub.label : '…'));

function Item({ it, busy, onDecide }) {
  const [open, setOpen] = useState(false);
  const [ret, setRet] = useState(null); // the reason being typed, or null
  const ans = (it.answers || []).map((a) => [fillLabel(a.label, it.subject), answerText({ type: a.type, label: a.label, fields: a.fields }, a.answer)]);
  const shown = open ? ans : ans.slice(0, 1);
  const clerk = it.ai?.state === 'clerk';
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-15 font-semibold text-heading">{it.subject?.label || it.title}</b>
          <span className="truncate text-12 text-ds-muted">
            {it.subject?.label ? `${it.title} · ` : ''}
            {whenText(it.submitted_on)}
            {it.overdue ? ' · overdue' : ''}
          </span>
        </div>
        <span
          className={cx(
            'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-11 font-semibold',
            clerk ? 'bg-warning-wash text-warning-text' : 'bg-sunken text-ds-secondary',
          )}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: toneFill(clerk ? 'warning' : 'neutral') }} />
          {clerk ? 'Clerk' : it.ai?.state === 'waiting' ? 'Reading' : 'Waiting'}
        </span>
      </div>
      {clerk && it.ai?.why ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-13">
          <span className="text-ds-muted">Decision AI</span>
          <b className="font-medium text-heading [overflow-wrap:anywhere]">{it.ai.why}</b>
        </div>
      ) : null}
      {shown.length ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-x-3 gap-y-1 text-13">
          {shown.map(([q, a], i) => (
            <div key={i} className="contents">
              <span className="text-ds-muted [overflow-wrap:anywhere]">{q}</span>
              <b className="whitespace-pre-line font-medium text-heading [overflow-wrap:anywhere]">{a || '—'}</b>
            </div>
          ))}
        </div>
      ) : null}
      {ans.length > 1 ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="-ml-2 inline-flex h-8 items-center gap-1 self-start rounded-md px-2 text-13 font-medium text-brand-text hover:bg-brand-tint-weak">
          <Icon name={open ? 'angle-down' : 'angle-right'} size="sm" />
          {open ? 'Show less' : `All ${ans.length} answers`}
        </button>
      ) : null}
      {ret != null ? (
        <div className="flex flex-col gap-2">
          <textarea
            aria-label="Why are you returning it?"
            rows={2}
            value={ret}
            autoFocus
            placeholder="Why? The rep sees this and redoes it."
            onChange={(e) => setRet(e.target.value)}
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-14 text-heading"
          />
          <div className="flex gap-2">
            <Button type="default" size="lg" block onClick={() => setRet(null)} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button type="primary" size="lg" block danger loading={busy === 'return'} disabled={!ret.trim() || Boolean(busy)} onClick={() => onDecide(it, 'return', ret.trim())}>
              Send back
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="default" size="lg" block disabled={Boolean(busy)} onClick={() => setRet('')}>
            Return
          </Button>
          <Button type="primary" size="lg" block loading={busy === 'approve'} disabled={Boolean(busy)} onClick={() => onDecide(it, 'approve')}>
            Approve
          </Button>
        </div>
      )}
    </div>
  );
}

export function ApprovalQueue({ api, approvals }) {
  const own = useApprovals(api, !approvals);
  const ap = approvals ?? own;
  const [busy, setBusy] = useState({});
  const [who, setWho] = useState(null);
  const [note, setNote] = useState('');

  /* one tab per team member: the most waiting first; those with nothing waiting (only approved) last, with a tick */
  const team = useMemo(() => {
    const by = new Map();
    const add = (x, waiting) => {
      const k = x.rep_id || x.rep;
      if (!by.has(k)) by.set(k, { key: k, name: x.rep, items: [], approved: 0 });
      const t = by.get(k);
      if (waiting) t.items.push(x);
      else if (x.status === 'Approved') t.approved += 1;
    };
    ap.items.forEach((x) => add(x, true));
    ap.done.forEach((x) => add(x, false));
    return [...by.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [ap.items, ap.done]);
  const cur = team.find((t) => t.key === who) ?? team[0] ?? null;
  const approved = ap.done.filter((x) => x.status === 'Approved').length;
  const byAi = ap.done.filter((x) => x.auto).length;
  const total = approved + ap.items.length;
  const pct = total ? Math.round((approved / total) * 100) : 0;
  const days = ap.items[0]?.days ?? 3;

  const say = (t) => {
    setNote(t);
    window.setTimeout(() => setNote(''), 4000);
  };
  const decide = async (it, decision, reason) => {
    if (cur) setWho(cur.key); /* stay on this person after the list changes */
    setBusy((b) => ({ ...b, [it.response]: decision }));
    try {
      await api.approval({ action: 'decide', response: it.response, decision, note: reason });
      say(decision === 'approve' ? 'Approved.' : 'Sent back — the rep sees your reason.');
      await ap.reload();
    } catch (e) {
      say(e?.message || 'Couldn’t save that. Try again.');
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[it.response];
        return n;
      });
    }
  };
  const approveAll = async () => {
    if (!cur?.items.length) return;
    setWho(cur.key);
    setBusy((b) => ({ ...b, all: 'approve' }));
    try {
      const m = await api.approval({ action: 'approve_all', responses: JSON.stringify(cur.items.map((x) => x.response)) });
      say(`Approved ${m?.approved ?? cur.items.length}.`);
      await ap.reload();
    } catch (e) {
      say(e?.message || 'Couldn’t approve them. Try again.');
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n.all;
        return n;
      });
    }
  };

  if (!ap.loaded) {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-3">
        <div className="h-16 animate-pulse rounded-xl bg-sunken" />
        <div className="h-48 animate-pulse rounded-xl bg-sunken" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3.5">
      {ap.err ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-danger-wash px-3 py-2.5 text-13 font-semibold text-danger-text">
          <Icon name="exclamation-circle" size="sm" />
          {ap.err}
        </p>
      ) : null}
      {/* progress: approved of all, with the Approved count */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-13 font-medium text-body">
          <span>
            <b className="text-15 font-semibold text-heading">{approved}</b> of {total} answers done
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-success-wash px-2.5 text-13 font-medium text-success">
            <Icon name="check" size="var(--fs-12)" />
            Approved · {approved}
          </span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${approved} of ${total} approved`}>
          <span className="h-full rounded-full bg-success" style={{ width: `${pct}%`, minWidth: approved ? 6 : 0 }} />
        </div>
        <div className="flex justify-between text-12 text-ds-muted">
          <span>{ap.items.length} to approve</span>
          <span>{pct}%</span>
        </div>
      </div>
      {byAi ? (
        <p className="flex items-start gap-2 text-13 text-ds-muted">
          <Icon name="verified" size="sm" className="mt-px shrink-0 text-brand-text" />
          <span>
            {byAi} answer{byAi === 1 ? ' was' : 's were'} Clear and approved automatically.{' '}
            {ap.items.length ? `${ap.items.length} need${ap.items.length === 1 ? 's' : ''} you, by employee.` : 'Nothing needs you right now.'}
          </span>
        </p>
      ) : null}
      {note ? (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-wash px-3 py-2 text-12 font-medium text-success">
          <Icon name="check-circle" size="sm" />
          {note}
        </p>
      ) : null}
      {team.length ? (
        <>
          <div role="tablist" aria-label="Team members" className="ds-scroll-x -mx-1 flex gap-2 px-1 py-0.5">
            {team.map((t) => {
              const on = t.key === cur?.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setWho(t.key)}
                  className={cx(
                    'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-13 font-medium',
                    on ? 'border-heading bg-heading text-on-brand' : t.items.length ? 'border-line-strong bg-surface text-body' : 'border-transparent bg-success-wash text-success',
                  )}
                >
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: on ? 'currentColor' : toneFill(t.items.length ? 'neutral' : 'success') }} />
                  {first(t.name)}
                  {t.items.length ? ` · ${t.items.length}` : <Icon name="check" size="var(--fs-12)" />}
                </button>
              );
            })}
          </div>
          {cur ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-13 font-semibold text-white" style={{ backgroundColor: AV[cur.name.length % 3] }}>
                {initials(cur.name)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-15 font-semibold text-heading">{cur.name}</b>
                <span className="text-13 text-ds-muted">{cur.items.length ? `${cur.items.length} waiting · ${cur.approved} approved` : `All ${cur.approved} approved`}</span>
              </div>
              {cur.items.length > 1 ? (
                <Button type="default" size="sm" loading={busy.all === 'approve'} onClick={approveAll}>
                  Approve all {cur.items.length}
                </Button>
              ) : null}
            </div>
          ) : null}
          {cur?.items.length ? (
            cur.items.map((it) => <Item key={it.response} it={it} busy={busy[it.response] || busy.all} onDecide={decide} />)
          ) : (
            <div className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-4 py-6 text-center">
              <Icon name="check-circle" size="lg" className="text-success" />
              <span className="text-15 font-semibold text-heading">Nothing waiting from {first(cur?.name)}</span>
              <span className="text-13 text-ds-muted">{cur?.approved ?? 0} approved. Returned ones come back here when redone.</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-4 py-8 text-center">
          <Icon name="check-circle" size="lg" className="text-success" />
          <span className="text-14 font-semibold text-heading">Nothing to approve</span>
          <span className="text-13 text-ds-muted">Answers from your team that need approval show up here.</span>
        </div>
      )}
      <p className="text-center text-12 text-ds-muted">Approve within {days} days. Returned answers go back to the employee with your reason.</p>
    </div>
  );
}
