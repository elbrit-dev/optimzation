/* "Is this doctor worth it?" — worked out from elbrit_doctor_service_insight.
 *
 *   support   what the doctor gave back: Doctor Support's monthly total
 *   service   what was given: Doctor Service rows already paid / approved
 *             (a Draft or one still in approval was not given yet)
 *   ROI       support / service — over the window, and per service: the
 *             support from that service's month to the end of the window,
 *             against that one service (the doctor page's model).
 *
 * DEPARTMENT: pass one and both sides are that department's only — support
 * from the month's by_dept split (the Support Items lines), services by
 * their department (the server reads it off the role profile). An Elbrit
 * service is judged on Elbrit's support and Elbrit's services, not the
 * doctor's other departments. Rows on different seats are separate
 * services even on the same day for the same amount. */

import { MON, cmp, fDY, money, roiTxt } from './workflow';

const GIVEN = ['Paid', 'Approved'];
const label = (k) => MON[Number(k.slice(5, 7)) - 1];
const monthName = (k) => `${label(k)} ${k.slice(0, 4)}`;

function dur(share) {
  const w = share * 4.3;
  if (w < 1) return 'less than 1 week of sales';
  if (share < 0.85) return `about ${Math.round(w)} week${Math.round(w) === 1 ? '' : 's'} of sales`;
  if (share < 1.5) return 'about 1 month of sales';
  return `about ${Math.round(share)} months of sales`;
}

/* → the model the detail and the form render; `sel` is a month index or null,
   `department` the one to judge on (null: the whole doctor). */
export function bizView(ins, request, sel = null, department = null) {
  if (!ins?.months?.length) return null;
  const keys = ins.months.map((m) => m.month);
  // A server without the split (by_dept) cannot answer for one department:
  // fall back to the whole doctor and say so, never pass it off as the department's.
  const split = !!department && ins.months.some((m) => m.by_dept && typeof m.by_dept === 'object');
  const dep = split ? department : null;
  const supAll = ins.months.map((m) => Number(m.support) || 0);
  const sup = dep ? ins.months.map((m) => Number((m.by_dept || {})[dep]) || 0) : supAll;
  const from = keys[0];
  const to = keys[keys.length - 1];
  const inWindow = (ins.services || []).filter((s) => GIVEN.includes(s.status) && s.date && s.date.slice(0, 7) >= from && s.date.slice(0, 7) <= to);
  const hist = dep ? inWindow.filter((s) => s.department === dep) : inWindow;
  const svcBy = keys.map((k) => hist.filter((h) => h.date.slice(0, 7) === k).reduce((a, h) => a + h.amount, 0));
  const booked = sup.filter((v) => v > 0).length;
  const bTot = sup.reduce((a, v) => a + v, 0);
  const sTot = hist.reduce((a, h) => a + h.amount, 0);
  const avgM = booked ? bTot / booked : 0;
  const END = keys.length - 1;
  const max = Math.max(1, ...sup, ...svcBy);

  const after = (h, end) => {
    const mi = Math.max(0, keys.indexOf(h.date.slice(0, 7)));
    const since = sup.slice(mi, end + 1).reduce((a, v) => a + v, 0);
    const n = end - mi + 1;
    return {
      svc: h.service, date: fDY(h.date), amt: money(h.amount), since: money(Math.round(since)),
      span: `${monthName(keys[mi])} – ${monthName(keys[end])} · ${n} month${n === 1 ? '' : 's'}`,
      roi: roiTxt(since / h.amount),
    };
  };
  const top3 = hist.slice(0, 3).map((h, i) => ({
    ...after(h, END),
    tag: ['Latest', '2nd last', '3rd last'][i],
    tagC: i ? '#4B5563' : '#1D4ED8',
    tagBg: i ? '#E5E7EB' : '#DBEAFE',
  }));

  const req = Number(request) || 0;
  const share = avgM ? req / avgM : null;
  const planC = share == null || share > 1 ? '#DC2626' : share > 0.5 ? '#B45309' : '#15803D';

  let selView = null;
  if (sel != null && sel >= 0 && sel <= END) {
    const lh = hist.find((h) => h.date.slice(0, 7) <= keys[sel]);
    const mo = monthName(keys[sel]);
    if (lh) {
      const a = after(lh, sel);
      selView = { head: a.span, supL: 'Support after service', sup: a.since, svcL: 'Service', svc: a.amt, roi: a.roi, lastLbl: 'Last service up to ' + mo, lastTxt: `${a.svc} · ${a.date}` };
    } else {
      const sp = sup.slice(0, sel + 1).reduce((a, v) => a + v, 0);
      selView = { head: `${monthName(from)} – ${mo} · no service yet`, supL: 'Support', sup: cmp(sp), svcL: 'Service', svc: '₹0', roi: '—', lastLbl: 'Last service', lastTxt: 'No service up to ' + mo };
    }
  }

  const allSup = supAll.reduce((a, v) => a + v, 0);
  const allSvc = inWindow.reduce((a, h) => a + h.amount, 0);
  return {
    window: `${monthName(from)} – ${monthName(to)}`,
    scope: dep || (department ? 'All departments (no department split from ERP)' : 'All departments'),
    from: monthName(from),
    totals: [
      { l: 'Total support', v: cmp(bTot), full: money(Math.round(bTot)), s: `about ${cmp(avgM)} / month`, c: '#1E3A8A' },
      { l: 'Total service', v: cmp(sTot), full: money(Math.round(sTot)), s: `${hist.length} service${hist.length === 1 ? '' : 's'}`, c: '#111827' },
      { l: 'ROI', v: sTot ? roiTxt(bTot / sTot) : '—', full: 'Total support ÷ total service', s: 'support ÷ service', c: '#B91C1C' },
    ],
    top3,
    last: top3[0] || null,
    request: money(req),
    planSub: share == null ? 'No support to compare with' : `= ${dur(share)}`,
    planC,
    months: keys.map((k, i) => {
      const on = sel == null || i <= sel;
      const cur = sel === i;
      return {
        key: k, label: label(k)[0],
        bh: Math.max(2, (sup[i] / max) * 100) + '%',
        sh: svcBy[i] ? Math.max(4, (svcBy[i] / max) * 100) + '%' : '0%',
        bc: on ? '#3B82F6' : '#BFDBFE', sc: on ? '#F59E0B' : '#FDE2B3',
        colBg: cur ? '#E0E7FF' : 'transparent', lc: cur ? '#1D4ED8' : '#9CA3AF', lw: cur ? 700 : 400,
        tip: `${monthName(k)} · support ${money(sup[i])}${svcBy[i] ? ' · service ' + money(svcBy[i]) : ''}`,
      };
    }),
    sel: selView,
    visits: (ins.visits || []).map((v) => ({ role: v.role, name: v.name, dates: (v.dates || []).map(fDY), none: !(v.dates || []).length })),
    /* The form's three cells: the department's figures (this view's), and the whole doctor's. */
    cells: { service: sTot, support: bTot, roi: sTot ? bTot / sTot : null, all: allSvc, allSupport: allSup, allRoi: allSvc ? allSup / allSvc : null },
  };
}

export const ROLE_C = { BE: ['#EAF1FF', '#1D4ED8'], ABM: ['#E5F6EC', '#15803D'], RBM: ['#FEF3E2', '#B45309'], SM: ['#F3E8FF', '#7E22CE'] };
