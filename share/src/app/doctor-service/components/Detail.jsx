'use client';

/* One service, in full — the prototype's detail pane: status and position,
 * doctor and amount, the MIS -> GM -> CEO stepper, the
 * rejected / sent-back banner,
 * "Is this doctor worth it?", the record's fields, remarks, attachment and
 * activity; the footer carries what THIS viewer may do with it. */

import {
  CEO, GM, NOT_SUBMITTED, REJECTED, REWORK, activity, canDecide, canEdit, fDY, money, short, statusOf, stepper, stoppedBy,
} from '../data/workflow';
import { Biz } from './Biz';
import { Icon, extOf } from './parts';

export function Detail({
  e, viewer, sheet, pos, insight, insightLoading, comment, setComment, busy, fileUrl,
  onClose, onOpenDoctor, onEdit, onResubmit, onApprove, onFinal, onReject, onRevisit,
  // What this PAGE offers: approving belongs to Service approval only;
  // editing and resubmitting to the MIS team's Services page.
  mayDecide = true, mayEnter = true,
}) {
  const st = statusOf(e);
  const decide = mayDecide && canDecide(e, viewer);
  const edit = mayEnter && canEdit(e, viewer);
  const gmCanClose = decide && e.state === GM;
  const stop = e.state === REJECTED || e.state === REWORK ? stoppedBy(e) : null;
  const stopRole = stop?.role === 'MIS' ? 'verification' : stop?.role;
  const ax = e.att ? extOf(e.att) : null;
  const steps = stepper(e);
  const trail = activity(e);

  const fields = [
    ['Department', short(e.dept)],
    ['On behalf of', `${e.byName}${e.byRole ? ' · ' + e.byRole : ''}`],
    ['HQ', (e.hq || '—').replace(/^HQ-/, '')],
    ['Entered by', `${e.enteredBy} · MIS`],
    ['Created on', fDY(e.created)],
    ['Employee ID', e.by || '—'],
  ];

  let footer = null;
  if (edit) {
    footer = (
      <>
        <span style={{ flex: 1 }} />
        <button type="button" className="dsv-btn" onClick={onEdit} disabled={!!busy}>Edit</button>
        <button type="button" className="dsv-btn pri" onClick={onResubmit} disabled={!!busy} style={{ flex: sheet ? '1 1 auto' : '0 0 auto' }}>
          {busy === 'submit' ? 'Submitting…' : e.state === NOT_SUBMITTED ? 'Submit for approval' : 'Resubmit'}
        </button>
      </>
    );
  } else if (decide) {
    footer = (
      <>
        <button type="button" className="dsv-btn rej" onClick={onReject} disabled={!!busy}>Reject</button>
        <button type="button" className="dsv-btn" onClick={onRevisit} disabled={!!busy} title="Send it back to the MIS team to fix">Send back</button>
        <span style={{ flex: 1 }} />
        <div className="dsv-decide">
          {gmCanClose ? (
            <button type="button" className="dsv-btn fin" onClick={onFinal} disabled={!!busy} title="Approve as final — CEO approval not needed">
              <Icon name="check" size={15} color="#15803D" width={3} />{busy === 'final' ? 'Approving…' : 'Approve as final'}
            </button>
          ) : null}
          <button type="button" className="dsv-btn pri" onClick={e.state === GM ? onApprove : onFinal} disabled={!!busy}>
            <Icon name="check" size={16} color="#fff" width={3} />
            {busy === 'approve' || (busy === 'final' && !gmCanClose) ? 'Working…' : e.state === GM ? 'Send to CEO' : 'Approve'}
            {!sheet ? <span className="k">A</span> : null}
          </button>
        </div>
      </>
    );
  }

  const body = (
    <section className="dsv-detail" aria-label="Service detail" role={sheet ? 'dialog' : 'region'} aria-modal={sheet || undefined} onClick={(ev) => ev.stopPropagation()}>
      {sheet ? <div className="dsv-grab"><span /></div> : null}
      <div className="dsv-dscroll">
        <div className="dsv-dhead">
          <div className="dsv-dtop">
            {sheet ? <button type="button" className="dsv-close" onClick={onClose} aria-label="Close"><Icon name="x" size={14} width={2.6} /></button> : null}
            <span className="dsv-pill" style={{ height: 24, fontSize: 12, padding: '0 9px', background: st.bg, color: st.fg }}>{st.label}</span>
            <span className="id" title={e.id}>{e.id}</span>
            {pos && pos.total > 1 ? (
              <div className="dsv-nav">
                <button type="button" onClick={pos.onPrev} aria-label="Previous"><Icon name="left" size={14} width={2.4} /></button>
                <span className="num" style={{ whiteSpace: 'nowrap', padding: '0 4px' }}>{pos.idx + 1} / {pos.total}</span>
                <button type="button" onClick={pos.onNext} aria-label="Next"><Icon name="right" size={14} width={2.4} /></button>
              </div>
            ) : null}
          </div>
          <div className="dsv-dmain">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              {onOpenDoctor ? (
                <button type="button" className="dsv-doclink" onClick={() => onOpenDoctor({ doctor: e.doctorId, name: e.doctorName })}><h2>{e.doctorName}</h2></button>
              ) : <h2>{e.doctorName}</h2>}
              <span className="sub">{e.doctorId}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span className="big">{money(e.amount)}</span>
              <span className="when">{e.service} · {fDY(e.date)}</span>
            </div>
          </div>
          <div className="dsv-steps" role="list" aria-label="Approval stages">
            {steps.map((n) => (
              <div key={n.label} className="dsv-step" role="listitem">
                <div className="ln">
                  <i style={{ background: n.lineL }} />
                  <span className="dot" style={{ background: n.bg, borderColor: n.border }}>
                    {n.kind === 'done' ? <Icon name="check" size={11} color="#fff" width={4} /> : null}
                    {n.kind === 'current' ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563EB' }} /> : null}
                    {n.kind === 'skip' ? <span style={{ width: 8, height: 2, borderRadius: 1, background: '#9CA3AF' }} /> : null}
                    {n.kind === 'x' ? <Icon name="x" size={11} color="#fff" width={4} /> : null}
                  </span>
                  <i style={{ background: n.lineR }} />
                </div>
                <span className="lb" style={{ color: n.fg }}>{n.label}</span>
                <span className="sb">{n.sub}</span>
              </div>
            ))}
          </div>
        </div>

        {e.state === REJECTED || e.state === REWORK ? (
          <div className={'dsv-banner' + (e.state === REWORK ? ' dsv-banner--back' : '')}>
            <b>{e.state === REWORK ? 'Sent back' : 'Rejected'}{stop ? ` by ${stop.name}${stopRole ? ` (${stopRole})` : ''} · ${fDY(stop.at)}` : ''}</b>
            {e.reason ? <span>“{e.reason}”</span> : null}
            {e.state === REWORK && viewer?.can_enter ? <span>Edit it and resubmit — it goes back to GM.</span> : null}
          </div>
        ) : null}

        <Biz key={e.id} insight={insight} request={e.amount} department={e.deptKey || e.dept} loading={insightLoading} />

        <div className="dsv-sec">
          <div className="dsv-fields">
            {fields.map(([l, v]) => <div key={l}><span>{l}</span><b title={v}>{v}</b></div>)}
          </div>
        </div>
        <div className="dsv-sec">
          <span className="cap">Remarks</span>
          <p className="dsv-remark">{e.remarks || '—'}</p>
        </div>
        <div className="dsv-sec">
          <span className="cap">Service attachment</span>
          {e.att ? (
            <a className="dsv-file" href={fileUrl ? fileUrl(e.att) : e.att} target="_blank" rel="noreferrer">
              <span className="ext" style={{ background: ax.bg, color: ax.fg }}>{ax.ext}</span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.att.split('/').pop()}</span>
                <span style={{ fontSize: 12, color: '#6B7280' }}>Open</span>
              </span>
            </a>
          ) : <span style={{ fontSize: 13, color: '#6B7280' }}>No file attached</span>}
        </div>
        <div className="dsv-sec" style={{ borderBottom: 'none', gap: 10 }}>
          <span className="cap">Activity</span>
          <div className="dsv-trail">
            {trail.map((t, i) => (
              <div key={i} className="dsv-ev">
                <div className="rail"><b style={{ background: t.dot }} />{t.hasLine ? <i /> : null}</div>
                <div className="tx">
                  <div className="tl"><b>{t.title}</b><span>{t.when}</span></div>
                  {t.note ? <span className="nt">“{t.note}”</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
        {decide ? (
          <div className="dsv-comment">
            <label htmlFor={'dsv-c-' + e.id}>
              Comment · {e.state === GM ? 'send it on to CEO, or approve as final here' : e.state === CEO ? 'your approval marks it Approved' : ''}
            </label>
            <textarea id={'dsv-c-' + e.id} className="dsv-ta" rows={2} value={comment} onChange={(ev) => setComment(ev.target.value)} placeholder="Optional for approve · required to reject or send back" />
          </div>
        ) : null}
      </div>
      {footer ? <div className="dsv-foot">{footer}</div> : null}
    </section>
  );

  if (sheet) return <div className="dsv-scrim" onClick={onClose}>{body}</div>;
  return body;
}
