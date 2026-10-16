/* An in-memory Service Allocation client for Studio and the dev harness —
 * the same answers the elbrit_service_allocation scripts give, no ERP.
 * `role`: 'GM' (allocates to everyone), 'SM' (splits their own) or 'IT'
 * (both: allocates, and switches to any SM's split view). */

const DEPTS = {
  E00010: ['Aura & Proxima Karnataka - ELPL', 'Elbrit Bangalore - ELPL', 'Elbrit Mysore - ELPL', 'Vasco Karnataka - ELPL'],
  E00004: ['Aura & Proxima Chennai - ELPL', 'Aura & Proxima Coimbatore - ELPL', 'Aura & Proxima Kerala - ELPL', 'Aura & Proxima Madurai - ELPL'],
  E00006: ['CND Coimbatore - ELPL', 'Elbrit Kerala - ELPL'],
  E00032: ['Elbrit Chennai - ELPL', 'Vasco Chennai - ELPL'],
};
const PEOPLE = [
  { employee: 'E00004', name: 'Janardhanan A', seat: 'SM-Aura_CHN_CBE_MDU_KER', designation: 'Zonal Sales Manager' },
  { employee: 'E00032', name: 'Palanikumar B', seat: 'SM2-ELBR-CH', designation: 'Sales Manager' },
  { employee: 'E00006', name: 'Suresh R', seat: 'SM-CND-ELB-KE', designation: 'Zonal Sales Manager' },
  { employee: 'E00010', name: 'Vinoth Kumar R', seat: 'SM-ELB_AURA_KA', designation: 'Zonal Sales Manager' },
];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function makeAllocationSample(role = 'GM') {
  const today = new Date();
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const store = {};
  // This month: one SM split, one partly, one allocated not split, one not allocated.
  const m0 = key(today);
  store[m0] = {
    E00010: { amount: 500000, splits: { 'Elbrit Bangalore - ELPL': 250000, 'Vasco Karnataka - ELPL': 150000, 'Elbrit Mysore - ELPL': 100000 } },
    E00004: { amount: 400000, splits: { 'Aura & Proxima Chennai - ELPL': 150000 } },
    E00006: { amount: 300000, splits: {} },
  };
  const me = role === 'SM' ? 'E00010' : null;
  const isIt = role === 'IT';
  const delay = (v) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 160));
  const statusOf = (a, t) => (t <= 0 ? 'Not split' : a > 0 && t >= a ? 'Split' : 'Partly split');
  const fy = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(fy, 3 + i, 1);
    return { key: key(d), label: `${MON[d.getMonth()]} ${d.getFullYear()}` };
  });

  function person(p, month) {
    const a = (store[month] || {})[p.employee];
    const total = a ? Object.values(a.splits).reduce((s, v) => s + v, 0) : 0;
    const budget = {};
    Object.values(store[month] || {}).forEach((x) => Object.entries(x.splits).forEach(([d, v]) => { budget[d] = (budget[d] || 0) + v; }));
    return {
      ...p,
      allocation: a ? { name: `SA-${month}-${p.employee}`, amount: a.amount, split_total: total, status: statusOf(a.amount, total),
        allocated_by: 'Rajkumar N', allocated_at: `${month}-02 10:15:00`, split_by: total ? p.name : null, split_at: total ? `${month}-05 16:40:00` : '' } : null,
      departments: (DEPTS[p.employee] || []).map((d) => ({ department: d, amount: a?.splits[d] || 0, budget: budget[d] || 0 })),
    };
  }

  return {
    live: false,
    allocation: (month = m0) => {
      const cutoff = `${month}-20`;
      const todayIso = today.toISOString().slice(0, 10);
      return delay({
        viewer: { user: role === 'SM' ? 'vinoth@elbrit.org' : 'rajkumar@elbrit.org', employee: me, employee_name: role === 'SM' ? 'Vinoth Kumar R' : 'Rajkumar N',
          seat: role === 'SM' ? 'SM-ELB_AURA_KA' : role === 'IT' ? 'IT' : 'GM', can_allocate: role !== 'SM', is_sm: role === 'SM', is_it: isIt },
        month, cutoff_day: 20, editable: todayIso <= cutoff, months,
        people: role !== 'SM' ? PEOPLE.map((p) => person(p, month)) : [],
        mine: role === 'SM' ? person(PEOPLE.find((p) => p.employee === me), month) : null,
      });
    },
    saveAllocation: (month, kind, rows, employee) => {
      const who = employee || me;
      store[month] = store[month] || {};
      if (kind === 'allocate') {
        rows.forEach((r) => { store[month][r.employee] = { amount: Number(r.amount) || 0, splits: store[month][r.employee]?.splits || {} }; });
      } else {
        if (!store[month][who]) return Promise.reject(new Error('Nothing has been allocated for this month yet.'));
        store[month][who].splits = Object.fromEntries(rows.filter((r) => Number(r.amount)).map((r) => [r.department, Number(r.amount)]));
      }
      return delay({ ok: true });
    },
  };
}
