/* The design's admin figures, in the payload shapes the live reads return.
 * Shown only while "Sample data" is on AND there is no URL/token and no data
 * prop bound, so a Studio canvas has something to look at and a live page
 * never mixes these with real data. */

const period = { label: "Sep 2026", live: true, closed: false, pace: 25 / 30, left: 5, day: 25, days: 30, elapsed: 25, totalDays: 30 };

/* Sales / Returns / Offers in the proportions the design's command card
   shows, scaled to each team's achievement. */
const split = (a, t) => ({
  target: t, inc: a, net: a * 0.99, gross: a * 1.12, credit: -a * 0.11, expired: -a * 0.013, breakage: -a * 0.002, ret: -a * 0.095,
  prod: a * 0.009, inv: 0, claim: a * 0.029,
});
const TEAMS = [
  ["Aura & Proxima Chennai - ELPL", 302316, 2600000], ["Aura & Proxima Coimbatore - ELPL", 555296, 2250000],
  ["Aura & Proxima Karnataka - ELPL", 1480000, 3400000], ["Vasco Coimbatore - ELPL", 4120000, 7800000],
  ["Elbrit Coimbatore - ELPL", 5310000, 9200000], ["Elbrit Chennai - ELPL", 6240000, 11500000],
  ["Vasco Chennai - ELPL", 3890000, 9100000], ["Elbrit Kerala - ELPL", 4450000, 8600000],
  ["Vasco Madurai - ELPL", 2980000, 7400000], ["Elbrit Hyderabad - ELPL", 3025586, 9025000],
];
const units = TEAMS.map(([name, a, t]) => ({ name, ...split(a, t), hqs: [] }));
units[4].hqs = [{ name: "HQ-Coimbatore", ...split(3100000, 5200000) }, { name: "HQ-Salem", ...split(2210000, 4000000) }];
const totals = units.reduce((x, u) => Object.fromEntries(Object.keys(split(0, 0)).map((k) => [k, (x[k] || 0) + u[k]])), {});

const today = [["Elbrit Coimbatore - ELPL", 400000, 7], ["Elbrit Chennai - ELPL", 370000, 6], ["Elbrit Kerala - ELPL", 370000, 6], ["Vasco Chennai - ELPL", 280000, 5], ["Vasco Coimbatore - ELPL", 260000, 4], ["Elbrit Hyderabad - ELPL", 250000, 4], ["Vasco Madurai - ELPL", 200000, 3], ["Aura & Proxima Karnataka - ELPL", 110000, 3], ["Aura & Proxima Coimbatore - ELPL", 38281.62, 1], ["Aura & Proxima Chennai - ELPL", 20000, 1]];

const cust = (name, hq, s, c) => ({ name, hq, s, c, o: s + c, sv: s * 206, cv: c * 202 });
const sec = (name, dist, s, c, sv, cv, hqs) => ({ name, dist, s, c, o: s + c, sv, cv, hqs: hqs.map(([n, a, b]) => ({ name: "HQ-" + n, dist: Math.max(1, Math.round(dist / hqs.length)), s: a, c: b, o: a + b, sv: a * 206, cv: b * 202, customers: [] })), customers: [] });
const SEC = [
  sec("Vasco Coimbatore - ELPL", 30, 3445, 9310, 708979, 1882807, [["Coimbatore", 1150, 3000], ["Madurai", 1020, 2750], ["Erode", 720, 2120], ["Salem", 555, 1440]]),
  sec("Elbrit Coimbatore - ELPL", 7, 2295, 2258, 271420, 267810, [["Coimbatore", 1410, 1320], ["Salem", 885, 938]]),
  sec("Aura & Proxima Chennai - ELPL", 2, 880, 874, 84487, 82144, [["Chennai", 880, 874]]),
];
SEC[0].customers = [cust("Aaditya Pharmex", "HQ-Coimbatore", 310, 1240), cust("Prakas Pharmacy Pvt Ltd", "HQ-Madurai", 280, 1100), cust("Power Pharmaceuticals Pvt Ltd", "HQ-Erode", 220, 890)];
SEC[1].customers = [cust("Omkar Medical Distributors", "HQ-Coimbatore", 410, 520), cust("New Rrpd Pvt Ltd", "HQ-Salem", 260, 300)];

const person = (id, name, role, hq, lvl, plan, geo, force, joint, seats, rep, vac = false, leaf = true) => ({ id, name, role, hq, lvl, vac, leaf, plan, geo, force, joint, seats, rep });
const vunit = (name, plan, geo, force, people, reps) => ({ name, plan, geo, force, people, reps });
const byDept = [
  vunit("Elbrit Coimbatore - ELPL", 16, [1, 1, 2, 4, 3, 1, 0], [0, 0, 0, 0, 0, 0, 0], [
    person("E1", "Vinoth Kumar R", "SM", "Coimbatore", 0, 16, 12, 0, 2, 7, 5, false, false),
    person("E2", "Chandrasekar S", "RBM", "Coimbatore", 1, 16, 12, 0, 2, 7, 5, false, false),
    person("E3", "Sankar Ganesh T", "ABM", "Coimbatore", 2, 9, 7, 0, 1, 3, 3, false, false),
    person("E4", "Vijadhiran R", "BE", "Coimbatore", 3, 3, 3, 0, 1, 1, 1),
    person("E5", "Giriram R", "BE", "Coimbatore", 3, 3, 2, 0, 0, 1, 1),
    person("E6", "Dhaneshkumar Natarajan", "BE", "Coimbatore", 3, 3, 2, 0, 0, 1, 1),
    person("E7", "Nandhakumar V", "ABM", "Salem", 2, 7, 5, 0, 1, 4, 2, false, false),
    person("E8", "Dharun Raj R", "BE", "Salem", 3, 4, 3, 0, 1, 1, 1),
    person("E9", "Kamala Kannan", "BE", "Salem", 3, 3, 2, 0, 0, 1, 1),
    person("E10", "Vignesh Somasundaram", "BE", "Erode", 3, 0, 0, 0, 0, 1, 0),
  ], { reported: [{ name: "Vijadhiran R", role: "BE", hq: "Coimbatore", time: "10:12 AM" }, { name: "Giriram R", role: "BE", hq: "Coimbatore", time: "10:48 AM" }], notYet: [{ name: "Vignesh Somasundaram", role: "BE", hq: "Erode" }], vacant: [] }),
  vunit("Vasco Coimbatore - ELPL", 13, [0, 1, 1, 2, 2, 1, 1], [0, 0, 0, 1, 0, 0, 0], [person("E20", "Palanikumar B", "SM", "Chennai", 0, 13, 8, 1, 1, 9, 6, false, false)], { reported: [{ name: "Ashok Ganesan", role: "BE", hq: "Salem", time: "11:20 AM" }], notYet: [{ name: "Velraj S", role: "BE", hq: "Nagercoil" }, { name: "Karthick A R", role: "BE", hq: "Madurai" }], vacant: [{ name: "Vacant (Cheyesu)", role: "BE", hq: "Tirunelveli" }] }),
  vunit("Vasco Chennai - ELPL", 10, [0, 1, 0, 2, 1, 0, 0], [0, 1, 0, 0, 0, 0, 0], [], { reported: [], notYet: [{ name: "Jagan J", role: "BE", hq: "Vellore" }], vacant: [{ name: "Vacant (Venkatesh J)", role: "BE", hq: "Chennai" }] }),
  vunit("Aura & Proxima Chennai - ELPL", 9, [0, 1, 1, 2, 1, 0, 0], [0, 0, 0, 0, 0, 0, 0], [], { reported: [], notYet: [{ name: "Kamalesh J", role: "BE", hq: "Chennai" }], vacant: [] }),
  vunit("Elbrit Chennai - ELPL", 12, [0, 0, 0, 1, 1, 0, 1], [0, 1, 0, 0, 0, 0, 0], [], { reported: [], notYet: [{ name: "Sathya P", role: "BE", hq: "Chennai" }], vacant: [{ name: "Vacant (Varadharajan)", role: "ABM", hq: "Chennai" }] }),
];

const MGR = (name, role, value, share) => ({
  name, role, value, qty: Math.round(582010 * share), doctors: Math.round(5018 * share),
  months: [["Apr", 57e6], ["May", 55e6], ["Jun", 59.33e6], ["Jul", 62e6]].map(([label, v]) => ({ label, value: v * share, on: label === "Jul" })),
  topDoctors: [["Dr Vinitha Priya", "General Physician", "HQ-Coimbatore", 0.085], ["Dr Arun Kumar S", "Diabetologist", "HQ-Chennai", 0.07], ["Dr Meena R", "Cardiologist", "HQ-Erode", 0.06]].map(([n, sp, hq, p]) => ({ name: n, spec: sp, hq, qty: Math.round(value * p / 107), value: value * p })),
  brands: [["NEURONZ", 0.2], ["GLIMIBRIT", 0.16], ["ROZULA", 0.13]].map(([n, p]) => ({ name: n, value: value * p })),
});

export const SAMPLE = {
  userName: "Baranidharan",
  scope: "All India · System Manager / MIS",
  primary: { period, level: "dept", units, depts: units, totals },
  invoiced: { back: 0, label: "today", dateLabel: "Fri, 25 Sep 2026", total: 2298281.62, count: 40, dept: Object.fromEntries(today.map(([n, v, c]) => [n, { v, n: c }])), hq: {} },
  secondary: { period, level: "dept", units: SEC, depts: SEC, hqs: SEC.flatMap((d) => d.hqs) },
  visit: { live: true, period: null, level: "dept", hours: ["10AM", "11AM", "12PM", "1PM", "2PM", "3PM", "4PM"], byDept, byHq: byDept, hqs: byDept, reps: { reported: 9, total: 319, vacant: 64 } },
  support: {
    fy: 2026,
    months: [{ label: "Apr", value: 57e6, qty: 535000, doctors: 4810 }, { label: "May", value: 55e6, qty: 526000, doctors: 4790 }, { label: "Jun", value: 59.33e6, qty: 558500, doctors: 4848 }, { label: "Jul", value: 62e6, qty: 582010, doctors: 5018 }],
    selected: { label: "Jul 2026", labels: ["Jul"], value: 62e6, qty: 582010, doctors: 5018, prevValue: 59.33e6, prevLabel: "Jun" },
    scope: "All India",
    managers: [MGR("Vinoth Kumar R", "ZSM", 17300000, 0.28), MGR("Suresh R", "ZSM", 14100000, 0.23), MGR("Sanjay Kumar", "SM", 11200000, 0.18), MGR("Palanikumar B", "SM", 9600000, 0.15), MGR("Praveen Kumar Sharma", "SM", 6100000, 0.1)],
    health: { issues: 5, zeroRateLines: 242, vacantValue: 4460000, lastImport: "31 Aug · 13:53" },
    topDoctors: [{ name: "Dr G.R. Ravi", spec: "Diabetologist", hq: "HQ-Chennai", qty: 1790, value: 175527 }, { name: "Dr Vinitha Priya", spec: "General Physician", hq: "HQ-Coimbatore", qty: 1620, value: 158200 }],
    brands: [{ name: "NEURONZ", value: 7302868 }, { name: "GLIMIBRIT", value: 5661187 }, { name: "ROZULA", value: 4921273 }],
  },
};
