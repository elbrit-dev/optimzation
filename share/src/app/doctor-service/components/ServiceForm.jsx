'use client';

/* The "Add service" drawer — the approved prototype's form, for the MIS
 * team entering ON BEHALF OF an RBM or SM linked to the doctor.
 *
 *   doctor        locked (it opens from the doctor page, or edits a row)
 *   On behalf of  the RBMs / SMs linked to this doctor (the options
 *                 script); the department and HQ come from them — a second
 *                 choice appears only when that person covers this doctor in
 *                 more than one department
 *   service       type (Cash / EMI / Bookings / Gift), then sub-service
 *   date, amount, remarks, attachment (optional)
 *
 * SAVING SUBMITS: there is no draft. The Doctor Service Guard checks the
 * save in ERP and puts the service into approval (its Operational Tracker,
 * at GM); saving a sent-back one resubmits it. The attachment is uploaded
 * right after the save (the guard allows that while it waits on GM). A
 * drawer on wide screens, a bottom sheet on narrow ones. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { CATS, CAT_OF, EDITABLE, REWORK, cleanVals, cmp, localToday, money, roiTxt, short } from '../data/workflow';
import { bizView } from '../data/insight';
import { Combo, DatePicker, Icon, initials } from './parts';
import { ensureStyles } from './styles';

const pairKey = (p) => (p ? p.department + '|' + p.hq : '');

export function ServiceForm({ client, doctor, entry, viewer, onClose, onSaved }) {
  ensureStyles();
  const editing = !!entry;
  const [opts, setOpts] = useState(null);
  const [ins, setIns] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [f, setF] = useState(() => ({
    by: entry?.by || '',
    pair: entry ? entry.dept + '|' + entry.hq : '',
    cat: entry ? CAT_OF[entry.service] || entry.category || '' : '',
    service: entry?.service || '',
    date: entry?.date || localToday(),
    amount: entry ? String(entry.amount) : '',
    remarks: entry?.remarks || '',
    // Service details, by key: what the chosen service asks for (EB number,
    // mobile number...). Filled from the record being edited, or this
    // doctor's earlier values for the service once the options arrive.
    det: Object.fromEntries((entry?.details || []).map((d) => [d.key, d.values])),
    file: null,
  }));
  const [err, setErr] = useState({});
  const [combo, setCombo] = useState(null);
  const [saving, setSaving] = useState(null);
  const [failed, setFailed] = useState(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let live = true;
    client.options(doctor.id).then((o) => { if (live) setOpts(o); }).catch((e) => { if (live) setLoadErr(e.message); });
    client.insight(doctor.id, entry?.id).then((x) => { if (live) setIns(x); }).catch(() => {});
    return () => { live = false; };
  }, [client, doctor.id, entry?.id]);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !combo) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [combo, onClose]);

  const employees = opts?.employees || [];
  const chosen = employees.find((e) => e.employee === f.by) || null;
  const pairs = chosen?.pairs || [];
  const pair = pairs.find((p) => pairKey(p) === f.pair) || (pairs.length === 1 ? pairs[0] : null);

  // One linked person, or one department: chosen for you.
  useEffect(() => {
    if (!f.by && employees.length === 1) setF((s) => ({ ...s, by: employees[0].employee }));
  }, [employees, f.by]);
  useEffect(() => {
    if (chosen && pairs.length === 1 && f.pair !== pairKey(pairs[0])) setF((s) => ({ ...s, pair: pairKey(pairs[0]) }));
  }, [chosen, pairs, f.pair]);

  const services = useMemo(() => (opts?.services || []).map((s) => ({ ...s, cat: s.category || CAT_OF[s.name] || 'Cash' })), [opts]);
  const set = (patch, key) => { setF((s) => ({ ...s, ...patch })); if (key) setErr((e) => ({ ...e, [key]: undefined })); };

  // Judged on the chosen person's seat department (as the approval is); an SM
  // seat has none, so the chosen pair's department.
  const judgeDept = chosen?.seat_department || pair?.department || null;
  const biz = useMemo(() => bizView(ins, Number(f.amount) || 0, null, judgeDept), [ins, f.amount, judgeDept]);
  const cells = biz ? biz.cells : null;

  const amtOk = Number(f.amount) > 0;
  // The details the chosen service asks for, and what this doctor gave before.
  const capture = services.find((s) => s.name === f.service)?.capture || [];
  const known = opts?.known?.[f.service] || {};
  // The latest such service's values: what is filled in (a replaced number
  // stays out); older ones are only offered as "used before" chips.
  const last = opts?.last?.[f.service] || known;
  const valsOf = (c) => {
    const v = cleanVals(f.det[c.key]);
    return c.multi ? v : v.slice(0, 1);
  };
  const missing = capture.filter((c) => c.required && !valsOf(c).length);
  // A field with nothing typed yet starts from this doctor's earlier values.
  useEffect(() => {
    if (!capture.length) return;
    const fill = {};
    for (const c of capture) {
      if (cleanVals(f.det[c.key]).length) continue;
      const prev = last[c.key] || [];
      fill[c.key] = prev.length ? (c.multi ? prev.slice() : prev.slice(0, 1)) : [''];
    }
    if (Object.keys(fill).length) setF((s) => ({ ...s, det: { ...s.det, ...fill } }));
  }, [f.service, opts]); // eslint-disable-line react-hooks/exhaustive-deps
  const setDet = (key, list) => set({ det: { ...f.det, [key]: list } }, 'det');
  const done = [!!chosen && !!pair, !!f.service && !missing.length, !!f.date, amtOk].filter(Boolean).length;
  const canEnter = viewer?.can_enter ?? opts?.viewer?.can_enter;

  async function save() {
    const e = {};
    if (!chosen) e.by = 'Choose the RBM or SM this service is for.';
    else if (!pair) e.pair = 'Choose the department.';
    if (!f.cat) e.service = 'Choose a service type.';
    else if (!f.service) e.service = 'Choose the sub-service.';
    if (f.service && missing.length) e.det = `Add the ${missing.map((c) => c.label).join(', ')}.`;
    if (!f.date) e.date = 'Pick the service date.';
    else if (f.date > localToday()) e.date = 'The service date cannot be in the future.';
    if (!amtOk) e.amount = 'Enter an amount above ₹0.';
    setErr(e);
    if (Object.keys(e).length) return;
    setSaving('submit');
    setFailed(null);
    const fields = {
      doctor: doctor.id,
      service_name: f.service,
      service_date: f.date,
      service_amount: Math.round(Number(f.amount) * 100) / 100,
      by: chosen.employee,
      department: pair.department,
      hq: pair.hq,
      remarks: f.remarks.trim(),
    };
    // What the service asked for, as JSON on the record (the guard keeps only
    // the service's own fields and checks the required ones).
    fields.custom_service_details = JSON.stringify(
      capture.map((c) => ({ key: c.key, label: c.label, values: valsOf(c) })).filter((d) => d.values.length));
    let name = entry?.id;
    try {
      if (editing) await client.update(name, fields);
      // `date` (the entry date) is part of the record's NAME, which ERP builds
      // before any script runs — so it is sent, not left to the guard.
      else name = (await client.create({ ...fields, date: localToday() })).name;
    } catch (x) {
      setSaving(null);
      setFailed(x.message);
      return;
    }
    let note = '';
    if (f.file) {
      try { await client.upload(name, f.file); } catch (x) { note = ` The attachment did not upload: ${x.message}`; }
    }
    setSaving(null);
    onSaved?.({ name, submitted: true, message: `${doctor.name} · ${f.service} ${editing ? 'resubmitted' : 'submitted'} · now with GM.${note}` });
  }

  const empItems = employees.map((e) => ({
    value: e.employee,
    label: e.employee_name,
    sub: `${e.grade} · ${e.pairs.map((p) => short(p.department)).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`,
  }));
  const svcItems = services.filter((s) => s.cat === f.cat).map((s) => ({ value: s.name, label: s.name }));
  const editable = !editing || EDITABLE.includes(entry.state);

  return (
    <div className="dsv dsv-ov" onClick={onClose}>
      <div className="dsv-drawer" role="dialog" aria-modal="true" aria-label={editing ? 'Edit service' : 'New service'} onClick={(e) => e.stopPropagation()}>
        <div className="dsv-dh">
          <div className="t">
            <span className="dsv-eyebrow">Doctor Service</span>
            <b>{editing ? 'Edit service' : 'New service'}</b>
          </div>
          <button type="button" className="xbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} width={2.2} /></button>
        </div>

        <div className="dsv-db" style={{ paddingBottom: combo ? 380 : 18 }}>
          {loadErr ? <div className="dsv-err">{loadErr}</div> : null}
          {opts && !canEnter ? <div className="dsv-note">Only the MIS team (MIS, MIS Admin, Manager MIS, CRM Manager) and IT can add a doctor service.</div> : null}
          {editing && entry.state === REWORK ? (
            <div className="dsv-banner dsv-banner--back" style={{ margin: 0 }}><b>Sent back — fix and resubmit</b>{entry.reason ? <span>“{entry.reason}”</span> : null}</div>
          ) : null}

          <div className="dsv-field">
            <span className="lab">Doctor</span>
            <div className="dsv-locked">
              <span className="dsv-av">{initials(doctor.name)}</span>
              <span className="x"><b>{doctor.name}</b><span>{doctor.id}</span></span>
              <span className="lk"><Icon name="lock" size={12} color="#6B7280" width={2.2} />{editing ? 'Fixed' : 'From doctor page'}</span>
            </div>
            {cells ? (
              <div className="dsv-mini">
                <div className="h"><b>{judgeDept ? short(judgeDept) : 'This doctor'}</b><span>{biz.window}</span></div>
                <div className="g">
                  <div><span>Total service</span><b className="num">{money(Math.round(cells.service))}</b></div>
                  <div><span>Total support</span><b className="num" style={{ color: '#1E3A8A' }}>{money(Math.round(cells.support))}</b></div>
                  <div><span>ROI</span><b className="num" style={{ color: '#B91C1C' }}>{roiTxt(cells.roi)}</b></div>
                </div>
                <div className="f">All departments · support {cmp(cells.allSupport)} · service {cmp(cells.all)} · ROI {roiTxt(cells.allRoi)}</div>
              </div>
            ) : null}
          </div>

          <div className="dsv-field">
            <span className="lab">On behalf of <i>*</i></span>
            {opts && canEnter && !employees.length ? (
              <div className="dsv-note">No RBM or SM is linked to this doctor. Fix the doctor's role profile in ERP first — the department comes from them.</div>
            ) : (
              <Combo
                value={f.by}
                label={chosen ? `${chosen.employee_name} · ${chosen.grade}` : ''}
                placeholder={opts ? 'Choose the RBM or SM' : 'Loading…'}
                items={empItems}
                open={combo === 'emp'}
                onOpen={() => opts && setCombo('emp')}
                onClose={() => setCombo(null)}
                onPick={(v) => { setCombo(null); set({ by: v, pair: '' }, 'by'); }}
                bad={!!err.by}
                searchHint="Search RBM / SM"
                avatar
              />
            )}
            {err.by ? <span className="er">{err.by}</span> : null}
            {chosen && pairs.length > 1 ? (
              <>
                <span className="lab" style={{ marginTop: 6 }}>Department <i>*</i></span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pairs.map((p) => {
                    const on = pairKey(p) === f.pair;
                    return (
                      <button key={pairKey(p)} type="button" className={'dsv-fopt' + (on ? ' on' : '')} style={{ border: '1px solid ' + (on ? '#2563EB' : '#E1E5EB') }} onClick={() => set({ pair: pairKey(p) }, 'pair')}>
                        <span className="rd">{on ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2563EB' }} /> : null}</span>
                        <span className="x"><b>{short(p.department)}</b><span>{p.hq}</span></span>
                      </button>
                    );
                  })}
                </div>
                {err.pair ? <span className="er">{err.pair}</span> : null}
              </>
            ) : null}
          </div>

          <div className="dsv-field">
            <span className="lab">Service type <i>*</i></span>
            <div className="dsv-cats" role="radiogroup" aria-label="Service type">
              {CATS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={f.cat === c} className={'dsv-cat' + (f.cat === c ? ' on' : '')}
                  onClick={() => set({ cat: c, service: (services.find((s) => s.name === f.service)?.cat === c) ? f.service : '' }, 'service')}>
                  {c}<span>{services.filter((s) => s.cat === c).length || (opts ? 0 : '–')} types</span>
                </button>
              ))}
            </div>
            {f.cat ? (
              <>
                <span className="lab" style={{ marginTop: 6 }}>Sub-service <i>*</i></span>
                <Combo
                  value={f.service}
                  label={f.service}
                  placeholder={`Search ${f.cat} sub-services`}
                  items={svcItems}
                  open={combo === 'svc'}
                  onOpen={() => setCombo('svc')}
                  onClose={() => setCombo(null)}
                  onPick={(v) => { setCombo(null); set({ service: v }, 'service'); }}
                  bad={!!err.service}
                  searchHint="Search Doctor Service Master"
                />
              </>
            ) : null}
            {err.service ? <span className="er">{err.service}</span> : null}
            {capture.map((c) => {
              const list = (f.det[c.key] && f.det[c.key].length ? f.det[c.key] : ['']);
              const shown = c.multi ? list : list.slice(0, 1);
              // This doctor's earlier values not in the list now: one tap adds one.
              const prev = (known[c.key] || []).filter((v) => !cleanVals(list).includes(v));
              return (
                <div key={c.key} className="dsv-eb">
                  <span className="lab">{c.label} {c.required ? <i>*</i> : null}</span>
                  {shown.map((n, i) => (
                    <div key={i} className="dsv-eb-row">
                      <span className={'dsv-amt' + (err.det && c.required && !String(n).trim() ? ' bad' : '')}>
                        <input type="text" value={n} placeholder={c.label}
                          aria-label={`${c.label}${shown.length > 1 ? ' ' + (i + 1) : ''}`}
                          onChange={(ev) => setDet(c.key, shown.map((x, j) => (j === i ? ev.target.value : x)))} />
                      </span>
                      {shown.length > 1 ? (
                        <button type="button" className="dsv-x" aria-label={`Remove ${c.label} ${i + 1}`}
                          onClick={() => setDet(c.key, shown.filter((_, j) => j !== i))}>
                          <Icon name="x" size={12} color="#4B5563" width={3} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {prev.length ? (
                    <div className="dsv-eb-prev">
                      <span>Used before:</span>
                      {prev.map((v) => (
                        <button key={v} type="button" className="dsv-eb-chip"
                          onClick={() => setDet(c.key, c.multi ? [...cleanVals(list), v] : [v])}>{v}</button>
                      ))}
                    </div>
                  ) : null}
                  {c.multi ? (
                    <button type="button" className="dsv-eb-add" onClick={() => setDet(c.key, [...shown, ''])}>+ Add another</button>
                  ) : null}
                </div>
              );
            })}
            {err.det ? <span className="er">{err.det}</span> : null}
          </div>

          <div className="dsv-row2">
            <div className="dsv-field">
              <span className="lab">Service date <i>*</i></span>
              <DatePicker value={f.date} onChange={(v) => set({ date: v }, 'date')} bad={!!err.date} />
              {err.date ? <span className="er">{err.date}</span> : null}
            </div>
            <label className="dsv-field">
              <span className="lab">Service amount <i>*</i></span>
              <span className={'dsv-amt' + (err.amount ? ' bad' : '')}>
                <span>₹</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={f.amount} placeholder="0.00" onChange={(e) => set({ amount: e.target.value }, 'amount')} />
              </span>
              {err.amount ? <span className="er">{err.amount}</span> : null}
            </label>
          </div>

          <label className="dsv-field">
            <span className="lab">Remarks</span>
            <textarea className="dsv-ta" rows={3} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="e.g. NEW EMI, CAR EMI, Ooty Conference (CAB BILL REIMBURSEMENT)" />
          </label>

          <div className="dsv-field">
            <span className="lab">Attachment <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span></span>
            <div className={'dsv-drop' + (drag ? ' on' : '')} role="button" tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const file = e.dataTransfer.files?.[0]; if (file) set({ file }); }}>
              <Icon name="clip" size={16} color="#6B7280" />
              {f.file ? <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file.name}</span> : <span style={{ flex: 1 }}><b>Add a bill or receipt</b> — or drop it here</span>}
              {f.file ? <button type="button" className="dsv-x" aria-label="Remove file" onClick={(e) => { e.stopPropagation(); set({ file: null }); }}><Icon name="x" size={12} color="#4B5563" width={3} /></button> : null}
            </div>
            {editing && entry.att && !f.file ? <span style={{ fontSize: 12, color: '#6B7280' }}>Already attached: {entry.att.split('/').pop()}</span> : null}
            <input ref={fileRef} type="file" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) set({ file }); e.target.value = ''; }} />
          </div>

          <div className="dsv-auto">
            <div><span>Entered by</span><b>{viewer?.employee_name || opts?.viewer?.employee_name || '—'} · MIS</b></div>
            <div><span>On behalf of</span><b>{chosen ? `${chosen.employee} · ${chosen.employee_name}` : '—'}</b></div>
            <div><span>Designation</span><b>{chosen ? (chosen.grade === 'SM' ? 'Sales Manager' : 'Regional Business Manager') : '—'}</b></div>
            <div><span>Department</span><b>{pair ? pair.department : '—'}</b></div>
            <div><span>HQ</span><b>{pair ? pair.hq : '—'}</b></div>
            <div><span>Approval route</span><b>GM → CEO (GM may approve as final)</b></div>
          </div>
          {failed ? <div className="dsv-err" role="alert">{failed}</div> : null}
        </div>

        <div className="dsv-df">
          <span className="p">{done === 4 ? 'Ready to submit' : `${done} of 4 required`}</span>
          <button type="button" className="dsv-btn pri" disabled={!!saving || !canEnter || !editable} style={{ background: done === 4 ? undefined : '#93B4F8' }} onClick={save}>
            {saving ? 'Submitting…' : editing ? 'Save & resubmit' : 'Submit for approval'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ServiceForm;
