/* Home overview view model: turns the section payloads into exactly what the
 * tiles, the command board and the detail panels print. Every derived figure
 * -- pace, status, deltas, stock cover, the attention items -- is computed
 * here from the payload, never typed in, so a BE and an admin get the same
 * page with their own numbers.
 *
 * Payload shapes are the live reads' (data/liveOverview.js); sampleData.js
 * carries the design's figures in the same shapes. */

export const CIRC = 2 * Math.PI * 44;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };
export const G = "#16a34a", A = "#d97706", R = "#dc2626";
const OK = ["#067647", "#ecfdf3"], WN = ["#b54708", "#fffaeb"], BD = ["#b42318", "#fef3f2"];

const num = (v) => Number(v) || 0;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const ratio = (a, b) => (b ? a / b : 0);
const crShort = (n) => {
  const s = n < 0 ? "−" : "", a = Math.abs(n);
  return s + (a >= 1e7 ? "₹" + (a / 1e7).toFixed(2) + " Cr" : a >= 1e5 ? "₹" + (a / 1e5).toFixed(1) + " L" : "₹" + Math.round(a).toLocaleString("en-IN"));
};
/* Every amount on the page goes through here: always the full rupee value.
   Only the labels on top of chart bars use crShort -- a full amount does not
   fit a bar. */
export const cr = (n) => (n < 0 ? "−" : "") + "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");
const nos = (n) => Math.round(n).toLocaleString("en-IN");
const pc = (x) => (x * 100).toFixed(1) + "%";
const pct = (x) => Math.min(Math.max(x, 0), 1) * 100 + "%";
const signed = (d) => (d >= 0 ? "+" : "") + (d * 100).toFixed(1) + "%";
const plural = (n, one, many = one + "s") => nos(n) + " " + (n === 1 ? one : many);
export const initials = (n) => String(n || "").replace(/^Dr\.?\s*/i, "").split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
/* "Vasco Coimbatore - ELPL" -> "Vasco Coimbatore": the company suffix repeats on every team. */
export const shortName = (n) => String(n || "").replace(/\s+-\s+[A-Z]{2,}$/, "");
const hqName = (n) => String(n || "").replace(/^HQ-\s*/, "");
const hourLabel = (h) => String(h).replace(/(\d)\s*(AM|PM)/i, "$1 $2");
const AV = ["#7c3aed", "#2563eb", "#0e9f9a", "#be185d", "#15803d", "#b45309", "#4f46e5"];
const avatar = (s) => { let x = 0; for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) % 997; return AV[x % AV.length]; };

function toDate(v) {
  const d = v ? new Date(v) : new Date();
  return isNaN(d) ? new Date() : d;
}

export function clock(asOf) {
  const d = toDate(asOf);
  const day = d.getDate(), days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const h = d.getHours();
  return {
    day, days,
    greet: h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening",
    long: DOW[d.getDay()] + ", " + day + " " + MON[d.getMonth()] + " " + d.getFullYear(),
    short: DOW[d.getDay()] + ", " + day + " " + MON[d.getMonth()],
    monthLabel: MON[d.getMonth()] + " " + d.getFullYear(),
  };
}

export function updatedLabel(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return "Updated " + v;
  const pad = (n) => String(n).padStart(2, "0");
  return "Updated " + d.getDate() + " " + MON[d.getMonth()] + " " + pad(d.getFullYear() % 100) + " · " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

/* ---------------- Primary ---------------- */

/* PRIMARY IS JUDGED AGAINST TARGET ONLY: Inc. Primary ÷ Target, no pace.
   Bands: under 50% red, under 75% orange, under 90% blue, 90% and up green.
   Returned as [label, chip text, chip background, bar / accent colour]. */
export function band(r) {
  if (r >= 0.9) return ["On target", "#067647", "#ecfdf3", G];
  if (r >= 0.75) return ["Good", "#1d4ed8", "#eef3fe", "#2563eb"];
  if (r >= 0.5) return ["Behind", "#b54708", "#fff4ed", "#f97316"];
  return ["At risk", "#b42318", "#fef3f2", R];
}

function buildPrimary(p, inv, level) {
  if (!p?.units?.length) return null;
  const Pd = p.period || {};
  const left = Pd.closed ? 0 : num(Pd.left);
  const invBy = level === "dept" ? inv?.dept || {} : inv?.hq || {};
  const offerOf = (x) => num(x.claim) + num(x.prod) + num(x.inv);
  const cellsOf = (x) => [
    { l: "Sales", n: cr(num(x.inc)) },
    { l: "Returns", n: cr(num(x.credit)), c: num(x.credit) < 0 ? "#b42318" : undefined },
    { l: "Offers", n: cr(offerOf(x)) },
  ];
  const todayLbl = inv ? (inv.back === 0 ? "Today" : inv.back === 1 ? "Yesterday" : inv.label) : "Today";
  /* What fills a card's middle: the gap as "₹x a day" over the days left,
     that unit's own invoicing for the day, and its top two HQs by % of
     target (none when the units are HQs already). */
  const perDayOf = (a, t) => (left && t > a ? cr((t - a) / left) + " a day" : null);
  const hqTopOf = (hqs) => (hqs || []).filter((h) => num(h.target) > 0)
    .map((h) => { const r = ratio(num(h.inc), num(h.target)), b = band(r); return { name: h.name, pctTxt: pc(r), w: pct(r), c: b[3], fg: b[1] }; })
    .sort((x, y) => parseFloat(y.pctTxt) - parseFloat(x.pctTxt)).slice(0, 2);
  const units = p.units.map((u) => {
    const a = num(u.inc), t = num(u.target), r = ratio(a, t), b = band(r), td = invBy[u.name] || { v: 0, n: 0 };
    return {
      ...u, key: u.name, short: level === "dept" ? shortName(u.name) : u.name, a, t, r, pctTxt: pc(r), w: pct(r),
      sLabel: b[0], sColor: b[1], sBg: b[2], dot: b[3], achC: cr(a), tgtC: cr(t), cells: cellsOf(u), toGo: t > a ? cr(t - a) + " to target" : "Target met",
      todayV: td.v, todayN: td.n, todayC: inv ? cr(td.v) : null,
      perDay: perDayOf(a, t), hqTop: hqTopOf(u.hqs),
      meta: [perDayOf(a, t), inv ? todayLbl + " " + cr(td.v) : null].filter(Boolean).join(" · "),
    };
  });
  const T = p.totals || {};
  const achT = num(T.inc) || sum(units.map((u) => u.a)), tgtT = num(T.target) || sum(units.map((u) => u.t));
  const rT = ratio(achT, tgtT), st = band(rT);
  const gap = Math.max(tgtT - achT, 0), perDay = gap / Math.max(left, 1);
  const riskN = units.filter((u) => u.r < 0.5).length;
  const ofT = (v) => "(" + (v < 0 ? "−" : "") + (Math.abs(ratio(v, tgtT)) * 100).toFixed(2) + "%)";
  const offer = offerOf(T);
  const kindL = level === "dept" ? "Teams" : "HQs";
  const allTile = { key: "__all__", all: true, name: level === "dept" ? "All teams" : "All HQs", t: tgtT, tgtC: cr(tgtT), r: rT, pctTxt: pc(rT), w: pct(rT), dot: st[3], cells: cellsOf({ ...T, inc: achT }), toGo: tgtT > achT ? cr(tgtT - achT) + " to target" : "Target met",
    perDay: perDayOf(achT, tgtT), todayC: inv ? cr(inv.total) : null, todayN: inv ? num(inv.count) : 0,
    meta: [perDayOf(achT, tgtT), inv ? todayLbl + " " + cr(inv.total) : null].filter(Boolean).join(" · "),
    hqTop: [...units].sort((x, y) => y.r - x.r).slice(0, 2).map((x) => ({ name: x.short, pctTxt: x.pctTxt, w: x.w, c: x.dot, fg: x.sColor })) };
  return {
    period: Pd, units, achT, tgtT, rT, riskN, allName: allTile.name, todayLbl,
    totals: { ...T, inc: achT, target: tgtT },
    top: [...units].sort((a, b) => b.r - a.r),
    tiles: [allTile, ...[...units].sort((a, b) => b.r - a.r)],
    card: {
      kicker: "Primary sales · " + (Pd.label || ""), verdict: st[0], vFg: st[1], vBg: st[2], barC: st[3],
      pct: pc(rT), ach: cr(achT), tgt: cr(tgtT), w: pct(rT),
      today: inv ? cr(inv.total) : null, todayLbl, todaySub: inv ? plural(inv.count, "invoice") : "",
      toGo: gap ? cr(gap) + " to target" : "Target met",
      tot: [
        { l: "Sales", v: cr(num(T.inc)), s: "Inc. primary " + ofT(num(T.inc)), c: "#067647", bg: "#f6fef9" },
        { l: "Returns", v: cr(num(T.credit)), s: "Credit note " + ofT(num(T.credit)), c: "#b42318", bg: "#fffbfa" },
        { l: "Offers", v: cr(offer), s: "Total offer " + ofT(offer), c: "#b54708", bg: "#fffcf5" },
      ],
      lagT: kindL + " furthest from target",
      lag: [...units].sort((a, b) => a.r - b.r).slice(0, 4).map((u) => ({ key: u.key, short: u.short, pctTxt: u.pctTxt, w: u.w, bar: u.dot, fg: u.sColor })),
    },
    slide: {
      key: "primary", name: "Primary", dot: A, kicker: "Primary sales · " + (Pd.label || ""), title: pc(rT), sub: "of target", isRing: true, w: pct(rT), barC: st[3],
      ringA: cr(achT), ringB: "of " + cr(tgtT),
      mstats: [
        { v: cr(gap), l: "to target" },
        { v: riskN + " of " + units.length, l: kindL.toLowerCase() + " under 50%", c: "#b42318" },
        inv ? { v: cr(inv.total), l: "invoiced " + (inv.back === 0 ? "today" : inv.label) } : { v: cr(tgtT), l: "target" },
        left ? { v: cr(perDay), l: "needed per day" } : { v: cr(tgtT), l: "target" },
      ],
    },
    worst: [...units].sort((a, b) => a.r - b.r)[0],
    stats: { perDay, left },
  };
}

/* ---------------- Secondary ---------------- */

function buildSecondary(s, level) {
  if (!s) return null;
  const src = level === "dept" ? s.depts || s.units || [] : s.hqs || (s.depts || []).flatMap((d) => d.hqs || []);
  if (!src.length) return null;
  const Pd = s.period || {};
  const days = Math.max(1, num(Pd.closed ? Pd.totalDays : Pd.elapsed) || 25);
  const units = src.map((u) => ({ ...u, key: u.name, short: level === "dept" ? shortName(u.name) : u.name, r: ratio(u.s, u.o) }));
  const tot = units.reduce((x, u) => ({ s: x.s + u.s, c: x.c + u.c, o: x.o + u.o, sv: x.sv + num(u.sv), cv: x.cv + num(u.cv), dist: x.dist + num(u.dist) }), { s: 0, c: 0, o: 0, sv: 0, cv: 0, dist: 0 });
  const rT = ratio(tot.s, tot.o);
  const cells = (t) => [{ l: "Sold", n: nos(t.s) }, { l: "Closing", n: nos(t.c) }, { l: "Opening", n: nos(t.o) }];
  const tile = (t, name, key, all) => ({ key, name, dist: t.dist, pctTxt: pc(ratio(t.s, t.o)), w: pct(ratio(t.s, t.o)), cells: cells(t), all });
  const v = rT >= 0.5 ? ["Healthy", ...OK] : rT >= 0.3 ? ["Watch stock", ...WN] : ["Slow", ...BD];
  const stock = [...units].sort((a, b) => ratio(b.c, b.o) - ratio(a.c, a.o))[0];
  const heroU = [...units].sort((a, b) => b.o - a.o).slice(0, 6), hMax = Math.max(1, ...heroU.map((x) => x.o));
  return {
    period: Pd, units, tot, rT, days,
    tiles: [tile(tot, level === "dept" ? "All teams" : "All HQs", null, true)].concat(units.map((u) => tile(u, u.short, u.key, false))),
    card: { kicker: "Secondary · " + (Pd.label || ""), verdict: v[0], vFg: v[1], vBg: v[2], big: pc(rT), sub: "stock sold", note: nos(tot.c) + " Nos still in distributor stock", soldW: pct(rT) },
    slide: {
      key: "secondary", name: "Secondary", dot: "#2563eb", kicker: "Secondary · " + (Pd.label || ""), title: pc(rT), sub: "of stock sold", isBars: true,
      bars: heroU.map((u) => ({ gh: (u.o / hMax) * 86 + "%", h: (u.s / hMax) * 86 + "%", c: "#2563eb" })),
      mstats: [{ v: cr(tot.sv), l: "sales value" }, { v: nos(tot.c), l: "Nos closing stock" }, { v: nos(tot.o), l: "Nos opening stock" }, { v: tot.dist, l: "distributors" }],
    },
    stock,
  };
}

/* ---------------- Visit ---------------- */

function buildVisit(v, level) {
  if (!v) return null;
  const src = level === "dept" ? v.byDept || v.hqs || [] : v.byHq || v.hqs || [];
  if (!src.length) return null;
  const hours = v.hours?.length ? v.hours : ["10AM", "11AM", "12PM", "1PM", "2PM", "3PM", "4PM"];
  const live = v.live !== false;
  const units = src.map((u) => {
    const geo = sum(u.geo || []), force = sum(u.force || []), done = geo + force;
    return { ...u, key: u.name, short: level === "dept" ? shortName(u.name) : hqName(u.name), done, geoN: geo, forceN: force, pending: Math.max(num(u.plan) - done, 0), w: pct(ratio(done, u.plan)) };
  });
  const geo = hours.map((_, i) => sum(units.map((u) => num(u.geo?.[i])))), force = hours.map((_, i) => sum(units.map((u) => num(u.force?.[i]))));
  const tots = hours.map((_, i) => geo[i] + force[i]), max = Math.max(1, ...tots);
  const plan = sum(units.map((u) => num(u.plan))), done = sum(tots), forceT = sum(force);
  const reps = v.reps && num(v.reps.total) ? { reported: num(v.reps.reported), total: num(v.reps.total), vacant: num(v.reps.vacant) } : null;
  const vR = ratio(done, plan);
  const vd = vR >= 0.7 ? ["On track", ...OK] : vR >= 0.4 ? ["Behind", ...WN] : ["At risk", ...BD];
  const period = live ? "live today" : v.period || "";
  const grad = (i) => (force[i] ? `linear-gradient(180deg,${R} 0%,${R} ${ratio(force[i], tots[i]) * 100}%,${G} ${ratio(force[i], tots[i]) * 100}%)` : G);
  const fU = [...units].sort((a, b) => b.forceN - a.forceN)[0];
  return {
    live, period, units, hours, geo, force, plan, done, forceT, geoT: sum(geo), reps,
    range: hourLabel(hours[0]) + " – " + hourLabel(hours[hours.length - 1]),
    allHours: hours.map((l, i) => ({ label: l, gH: (geo[i] / max) * 100 + "%", fH: (force[i] / max) * 100 + "%", gR: force[i] ? "0" : "4px 4px 0 0" })),
    repsW: reps && { rep: pct(ratio(reps.reported, reps.total)), not: pct(ratio(reps.total - reps.reported, reps.total)), notN: reps.total - reps.reported },
    kicker: live ? "Visit · live today" : "Visit · " + period,
    card: {
      kicker: live ? "Visits · live today" : "Visits · " + period, verdict: vd[0], vFg: vd[1], vBg: vd[2], big: done + "/" + plan, sub: "visits done",
      note: (reps ? reps.reported + " of " + reps.total + " reps reported · " : "") + forceT + " force",
      bars: hours.map((_, i) => ({ h: (tots[i] / max) * 100 + "%", c: grad(i) })),
    },
    slide: {
      key: "visit", name: "Visit", dot: G, kicker: live ? "Visits · today, live" : "Visits · " + period, title: done + "/" + plan, sub: "visits done", isBars: true,
      bars: hours.map((_, i) => ({ gh: "0%", h: (tots[i] / max) * 86 + "%", c: grad(i) })),
      mstats: [{ v: Math.max(plan - done, 0), l: "visits pending" }, { v: forceT, l: "force visits", c: "#b42318" }, { v: sum(geo), l: "geo-tagged", c: "#067647" }, reps ? { v: reps.reported + "/" + reps.total, l: "reps reported" } : { v: plan, l: "planned" }],
    },
    fU: fU && fU.forceN ? fU : null,
  };
}

/* ---------------- Support ---------------- */

const FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

function buildSupport(s) {
  const sel = s?.selected;
  if (!sel || !num(sel.value)) return null;
  const months = (s.months || []).filter((m) => num(m.value));
  const max = Math.max(1, ...months.map((m) => num(m.value)));
  const onL = (sel.labels || [])[0];
  const delta = sel.prevValue ? (num(sel.value) - num(sel.prevValue)) / num(sel.prevValue) : null;
  const prevName = sel.prevLabel || "";
  const best = num(sel.value) >= max;
  const mgrs = [...(s.managers || [])].map((m) => ({ ...m, v: num(m.value) })).sort((a, b) => b.v - a.v);
  const mMax = mgrs[0]?.v || 1;
  const h = s.health;
  const dd = delta == null ? null : { t: signed(delta), c: delta >= 0 ? "#067647" : "#b42318", bg: delta >= 0 ? "#ecfdf3" : "#fef3f2" };
  return {
    sel, months, delta, dd, prevName, best, mgrs, scope: s.scope || "", topDoctors: s.topDoctors || [], brands: s.brands || [],
    kicker: "Doctor support · " + sel.label,
    latest: cr(num(sel.value)), latestSub: nos(num(sel.doctors)) + " doctors · " + nos(num(sel.qty)) + " units",
    mini: months.slice(-6).map((m) => { const on = m.label === onL; return { l: m.label, h: (num(m.value) / (max * 1.032)) * 100 + "%", c: on ? "#2563eb" : "#d6e2fb", lc: on ? "#0b1220" : "#8a93a3", lw: on ? 600 : 400 }; }),
    cast: mgrs.slice(0, 5).map((m, i) => ({ key: i, name: m.name, role: m.role, rank: i + 1, ini: initials(m.name), vS: cr(m.v), w: pct(m.v / mMax), share: Math.round(ratio(m.v, sel.value) * 100) + "%" })),
    health: h && { issues: num(h.issues), zero: nos(num(h.zeroRateLines)), vacant: cr(num(h.vacantValue)), lastImport: h.lastImport },
    card: {
      kicker: "Doctor support · " + sel.label,
      verdict: dd ? dd.t + " vs " + prevName : sel.label, vFg: dd ? dd.c : "#5b6576", vBg: dd ? dd.bg : "#f2f4f7",
      big: cr(num(sel.value)), sub: "to " + nos(num(sel.doctors)) + " doctors",
      note: nos(num(sel.qty)) + " units" + (best ? " · best month this year" : ""),
      bars: months.slice(-7).map((m) => ({ h: (num(m.value) / max) * 100 + "%", c: m.label === onL ? "#2563eb" : "#c7d7fa" })),
    },
    slide: {
      key: "support", name: "Support", dot: "#2563eb", kicker: "Doctor support · " + sel.label, title: cr(num(sel.value)), sub: "to " + nos(num(sel.doctors)) + " doctors", isBars: true,
      bars: FY_MONTHS.map((l) => { const m = months.find((x) => x.label === l); return m ? { gh: "0%", h: (num(m.value) / (max * 1.032)) * 86 + "%", c: l === onL ? "#2563eb" : "#d6e2fb" } : { gh: "12%", gb: "1.5px dashed #d0d5dd", h: "0%", c: "transparent" }; }),
      mstats: [
        dd ? { v: dd.t, l: "vs " + (FULL[prevName] || prevName), c: dd.c } : { v: sel.label, l: "latest month" },
        { v: nos(num(sel.qty)), l: "units supported" }, { v: nos(num(sel.doctors)), l: "doctors" },
        { v: cr(ratio(num(sel.value), num(sel.doctors))), l: "avg per doctor" },
      ],
    },
  };
}

/* ---------------- The whole page ---------------- */

export function buildView({ primary, invoiced, secondary, visit, support, asOf }) {
  const T = clock(asOf);
  /* One level for every section: the viewer's scope. Departments for a
     token that sees several (admin, SM), the HQs of its one department
     otherwise (RBM, BE). Primary decides; the others follow. */
  const level = primary?.level || secondary?.level || visit?.level || "dept";
  const kind = level === "dept" ? "Department" : "HQ", kinds = level === "dept" ? "departments" : "HQs";
  const P = buildPrimary(primary, invoiced, level), S = buildSecondary(secondary, level), V = buildVisit(visit, level), U = buildSupport(support);

  const TD = invoiced && P ? (() => {
    const by = level === "dept" ? invoiced.dept : invoiced.hq;
    const rows = Object.entries(by || {}).map(([name, x]) => ({ key: name, name: level === "dept" ? shortName(name) : name, val: num(x.v), n: num(x.n) })).filter((r) => r.val || r.n).sort((a, b) => b.val - a.val);
    const top = rows[0]?.val || 1;
    return {
      title: invoiced.back === 0 ? "Invoiced today" : "Invoiced " + invoiced.label, dateLabel: invoiced.dateLabel,
      total: cr(invoiced.total), totalV: num(invoiced.total), countN: num(invoiced.count), count: plural(num(invoiced.count), "invoice"), by: "by " + kind.toLowerCase(),
      rows, top: rows.slice(0, 4).map((r) => ({ ...r, v: cr(r.val), nS: plural(r.n, "invoice"), w: pct(r.val / top) })),
    };
  })() : null;

  /* Needs your attention: the worst unit, the reps who have not reported,
     where the force visits are, and the stock that is not moving. */
  const HA = [
    P?.worst && { c: P.worst.dot, t: P.worst.short + " at " + P.worst.pctTxt, s: "of target · " + cr(Math.max(0, P.worst.t - P.worst.a)) + " to go", act: { mode: "pri", k: P.worst.key } },
    V?.reps && V.reps.total - V.reps.reported > 0 && { c: A, t: nos(V.reps.total - V.reps.reported) + " reps not reported", s: "Only " + Math.round(ratio(V.reps.reported, V.reps.total) * 100) + "% reported " + (V.live ? "so far today" : V.period), act: { mode: "reps", f: "not" } },
    V?.fU && { c: R, t: V.forceT + " force visits " + (V.live ? "today" : V.period), s: "Most in " + V.fU.short, act: { mode: "visit", u: V.fU.key, f: "force" } },
    S?.stock && { c: "#2563eb", t: S.stock.short + " stock unsold", s: pc(ratio(S.stock.c, S.stock.o)) + " of opening still with distributors", act: { mode: "sec", k: S.stock.key } },
  ].filter(Boolean);

  return {
    T, level, kind, kinds, P, S, V, U, TD, HA,
    slides: [V, P, S, U].filter(Boolean).map((x) => x.slide),
  };
}

/* ---------------- Detail panels ----------------
 * One spec per panel; the component draws specs, it does not compute. */

const H = (t, a = "right") => ({ t, a });
const cell = (v, c, fw) => ({ v, c: c || "#0b1220", fw: fw || 500 });
const gtc = (n) => "minmax(0,1.7fr) repeat(" + n + ",minmax(0,1fr))";

export function primaryPanel(view, key, extra) {
  const { P, TD, level, kind } = view;
  if (!P) return null;
  const kl = kind.toLowerCase();
  if (key == null) {
    if (!TD) return null;
    const topR = TD.rows[0], tot = sum(TD.rows.map((r) => r.val)) || 1;
    return {
      kicker: "Primary · " + TD.title.replace(/^Invoiced /, ""), dot: A, title: TD.title, sub: (TD.dateLabel || "") + " · by " + kl,
      kpis: [
        { l: TD.title, v: TD.total, s: TD.count }, { l: "Average invoice", v: cr(ratio(TD.totalV, TD.countN)), s: "per invoice" },
        { l: "Top " + kl, v: topR ? cr(topR.val) : "—", s: topR ? topR.name : "" }, { l: "Month so far", v: cr(P.achT), s: pc(P.rT) + " of target" },
      ],
      tables: [{ t: kind + "-wise", s: "value", gtc: gtc(3), head: [H(kind, "left"), H("Invoices"), H("Share"), H("Value")],
        rows: TD.rows.map((r) => { const u = P.units.find((x) => x.key === r.key); return { name: r.name, sub: u ? "Month " + u.pctTxt + " of target" : "", cells: [cell(r.n), cell(Math.round(ratio(r.val, tot) * 100) + "%"), cell(cr(r.val), null, 600)], w: pct(ratio(r.val, TD.rows[0].val)), wc: "#93b4f5" }; }) }],
    };
  }
  /* "__all__" is the All teams card: the totals, with a by-unit table in
     place of by-HQ and no distributor read. */
  const isAll = key === "__all__";
  const u = isAll
    ? (() => { const b = band(P.rT); return { ...P.totals, key, short: P.allName, a: P.achT, t: P.tgtT, r: P.rT, pctTxt: pc(P.rT), sLabel: b[0], sColor: b[1], dot: b[3], achC: cr(P.achT), tgtC: cr(P.tgtT), todayC: TD ? TD.total : cr(0), todayN: TD ? TD.countN : 0, hqs: [] }; })()
    : P.units.find((x) => x.key === key);
  if (!u) return null;
  const f = (v, neg) => ({ v: cr(neg ? -Math.abs(v) : v), p: "(" + (neg && v ? "−" : "") + (Math.abs(ratio(v, u.t)) * 100).toFixed(2) + "%)" });
  const group = (t, bg, bd, hc, vc, rows, totL, tot) => ({ t, bg, bd, hc, vc, rows, totL, totV: tot.v, totP: tot.p });
  const offer = num(u.claim) + num(u.prod) + num(u.inv);
  const hqs = (u.hqs || []).filter((h) => num(h.target) || num(h.inc));
  const dist = extra?.distributors;
  return {
    kicker: "Primary · " + (P.period.label || ""), dot: A, title: u.short, sub: (isAll ? view.kinds.charAt(0).toUpperCase() + view.kinds.slice(1) : level === "dept" ? "Team" : "HQ") + " · " + u.sLabel,
    kpis: [
      { l: "Achieved", v: u.pctTxt, s: u.achC + " of " + u.tgtC, c: u.sColor },
      { l: "To target", v: cr(Math.max(0, u.t - u.a)), s: P.stats.left ? cr(Math.max(0, u.t - u.a) / P.stats.left) + " a day" : "month closed" },
      { l: view.P.card.todayLbl, v: u.todayC, s: plural(u.todayN, "invoice") },
      { l: "Returns", v: cr(num(u.credit)), s: "credit note", c: num(u.credit) < 0 ? "#b42318" : "#0b1220" },
    ],
    bar: { t: "Achievement vs target", w: pct(u.r), c: u.dot, l: u.achC + " booked", r: "Target " + u.tgtC },
    groups: [
      group("Sales", "#f6fef9", "#abefc6", "#067647", "#067647", [{ l: "Gross", ...f(num(u.gross)) }, { l: "Net", ...f(num(u.net)) }], "Inc. primary", f(num(u.inc))),
      group("Returns", "#fffbfa", "#fecdca", "#b42318", "#b42318", [{ l: "Expiry", ...f(num(u.expired), true) }, { l: "Return", ...f(num(u.ret), true) }, { l: "Breakage", ...f(num(u.breakage), true) }], "Credit note", f(num(u.credit), true)),
      group("Offers", "#fffcf5", "#fedf89", "#b54708", "#0b1220", [{ l: "Claim", ...f(num(u.claim)) }, { l: "Product", ...f(num(u.prod)) }, { l: "Invoice", ...f(num(u.inv)) }], "Total offer", f(offer)),
    ],
    tables: isAll ? [{ t: level === "dept" ? "By team" : "By HQ", s: "achieved vs target", gtc: gtc(3), head: [H(kind, "left"), H("Achieved"), H("Target"), H("%")],
        rows: P.top.map((x) => ({ name: x.short, sub: "", cells: [cell(x.achC), cell(x.tgtC), cell(x.pctTxt, x.sColor, 600)], w: x.w, wc: x.dot })) }] : [
      ...(hqs.length > 1 ? [{ t: "By HQ", s: "achieved vs target", gtc: gtc(3), head: [H("HQ", "left"), H("Achieved"), H("Target"), H("%")],
        rows: hqs.map((h) => { const r = ratio(num(h.inc), num(h.target)), s = band(r); return { name: h.name, sub: num(h.target) ? "" : "no target", cells: [cell(cr(num(h.inc))), cell(cr(num(h.target))), cell(num(h.target) ? pc(r) : "—", s[1], 600)], w: pct(r), wc: s[3] }; }) }] : []),
      { t: "Top distributors", s: (P.period.label || "") + " · by value", gtc: gtc(2), head: [H("Distributor", "left"), H("Invoices"), H("Value")], loading: !dist,
        rows: (dist || []).map((d) => ({ name: d.name, sub: d.hq, cells: [cell(d.invoices), cell(cr(d.value), null, 600)] })) },
    ],
  };
}

export function secondaryPanel(view, key) {
  const { S, level } = view;
  if (!S) return null;
  const t = key == null ? { name: level === "dept" ? "All teams" : "All HQs", ...S.tot, customers: S.units.flatMap((u) => u.customers || []) } : S.units.find((x) => x.key === key);
  if (!t) return null;
  const cover = (s, c) => (s ? Math.round(c / (s / S.days)) : 0);
  const cv = cover(t.s, t.c);
  const rows = key == null
    ? S.units.map((x) => ({ name: x.short, sub: plural(num(x.dist), "distributor"), cells: [cell(nos(x.s)), cell(nos(x.c)), cell(pc(ratio(x.s, x.o)), "#1d4ed8", 600)], w: pct(ratio(x.s, x.o)), wc: "#2563eb" }))
    : (t.hqs || []).map((h) => ({ name: h.name, sub: nos(h.o) + " Nos opening", cells: [cell(nos(h.s)), cell(nos(h.c)), cell(pc(ratio(h.s, h.o)), "#1d4ed8", 600)], w: pct(ratio(h.s, h.o)), wc: "#2563eb" }));
  const dists = [...(t.customers || [])].sort((a, b) => b.c - a.c).slice(0, 8);
  return {
    kicker: "Secondary · " + (S.period.label || ""), dot: "#2563eb", title: key == null ? t.name : t.short, sub: plural(num(t.dist), "distributor"),
    kpis: [
      { l: "Sell-through", v: pc(ratio(t.s, t.o)), s: nos(t.s) + " of " + nos(t.o) + " Nos", c: "#1d4ed8" },
      { l: "Sales value", v: cr(num(t.sv)), s: nos(t.s) + " Nos sold" },
      { l: "Closing stock", v: cr(num(t.cv)), s: nos(t.c) + " Nos" },
      { l: "Stock cover", v: cv + " days", s: "at the month's sell rate", c: cv > 45 ? "#b42318" : "#0b1220" },
    ],
    bar: { t: "Opening stock used", w: pct(ratio(t.s, t.o)), bg: "#dbe5f7", l: "Sold " + nos(t.s), r: "Closing " + nos(t.c) },
    tables: [
      ...(rows.length > 1 || key == null ? [{ t: key == null ? (level === "dept" ? "By team" : "By HQ") : "By HQ", s: "Nos", gtc: gtc(3), head: [H(key == null ? "Name" : "HQ", "left"), H("Sold"), H("Closing"), H("Sold %")], rows }] : []),
      { t: "Distributors", s: "highest closing stock first", gtc: gtc(3), head: [H("Distributor", "left"), H("Sold"), H("Closing"), H("Cover")],
        rows: dists.map((d) => { const c = cover(d.s, d.c); return { name: d.name, sub: d.hq, cells: [cell(nos(d.s)), cell(nos(d.c)), cell(d.s ? c + "d" : "—", c > 45 ? "#b42318" : "#0b1220", 600)] }; }) },
    ],
  };
}

export function supportPanel(view, key) {
  const { U } = view;
  if (!U) return null;
  const all = key == null || key < 0, m = all ? null : U.mgrs[key];
  if (!all && !m) return null;
  const tv = all ? num(U.sel.value) : m.v;
  const docs = all ? U.topDoctors : m.topDoctors || [];
  const brands = all ? U.brands : m.brands || [];
  const dMax = docs[0]?.value || 1, bMax = brands[0]?.value || 1;
  const onL = (U.sel.labels || [])[0];
  const series = all ? U.months.map((x) => ({ l: x.label, value: num(x.value), on: x.label === onL })) : (m.months || []).map((x) => ({ l: x.label, value: num(x.value), on: x.on }));
  const sMax = Math.max(1, ...series.map((x) => x.value));
  const doctors = all ? num(U.sel.doctors) : num(m.doctors), units = all ? num(U.sel.qty) : num(m.qty);
  const tables = [];
  if (all && U.mgrs.length) tables.push({ t: "By manager", s: U.sel.label, gtc: gtc(2), head: [H("Name", "left"), H("Share"), H("Value")], rows: U.mgrs.map((x) => ({ name: x.name, sub: x.role, cells: [cell(Math.round(ratio(x.v, tv) * 100) + "%"), cell(cr(x.v), null, 600)], w: pct(ratio(x.v, U.mgrs[0].v)), wc: "#2563eb" })) });
  tables.push({ t: "Doctor-wise", s: "top doctors by value", gtc: gtc(2), head: [H("Doctor", "left"), H("Units"), H("Value")], rows: docs.map((d) => ({ name: d.name, sub: [d.spec, d.hq].filter(Boolean).join(" · "), cells: [cell(nos(d.qty)), cell(cr(d.value), null, 600)], w: pct(d.value / dMax), wc: "#93b4f5" })) });
  tables.push({ t: "By brand", s: "share of value", gtc: gtc(2), head: [H("Brand", "left"), H("Share"), H("Value")], rows: brands.map((b) => ({ name: b.name, sub: "", cells: [cell(Math.round(ratio(b.value, tv) * 100) + "%"), cell(cr(b.value), null, 600)], w: pct(b.value / bMax), wc: "#2563eb" })) });
  return {
    kicker: U.kicker, dot: "#2563eb", title: all ? "Support value" : m.name, sub: all ? U.scope : m.role + " · #" + (key + 1),
    kpis: [
      { l: "Support value", v: cr(tv), s: all ? (U.dd ? U.dd.t + " vs " + U.prevName : U.sel.label) : Math.round(ratio(tv, U.sel.value) * 100) + "% of total" },
      { l: "Doctors", v: nos(doctors), s: "supported" }, { l: "Units", v: nos(units), s: "supplied" }, { l: "Per doctor", v: cr(ratio(tv, Math.max(1, doctors))), s: "average" },
    ],
    chart: { t: "Value by month", bars: series.map((x) => ({ l: x.l, v: crShort(x.value).replace("₹", ""), h: (x.value / sMax) * 85 + "%", c: x.on ? "#2563eb" : "#c7d7fa" })) },
    tables,
  };
}

/* Field activity panel: one unit's people as a tree, or every unit as a
   list, with the Visiting / Pending / Force / No plan filters. */
export function visitPanel(view, unitKey, filter = "all", open = {}) {
  const { V, kind, kinds } = view;
  if (!V) return null;
  const U = unitKey != null ? V.units.find((x) => x.key === unitKey) : null;
  const src = U ? U.people || [] : V.units.map((x) => {
    const tops = (x.people || []).filter((p) => p.lvl === 0);
    return { id: "u:" + x.key, unit: x.key, name: x.short, role: kind, hq: "", lvl: 0, vac: false, leaf: true, plan: x.plan, geo: x.geoN, force: x.forceN, joint: sum(tops.map((p) => num(p.joint))), seats: sum(tops.map((p) => num(p.seats))), rep: sum(tops.map((p) => num(p.rep))) };
  });
  const rows0 = src.map((p, i) => {
    const d = num(p.geo) + num(p.force), has = num(p.plan) > 0, isUnit = !!p.unit;
    return {
      i, id: p.id, unit: p.unit, lvl: p.lvl, name: p.vac ? String(p.name).replace(/^\s*Vacant\s*_?\s*/i, "Vacant · ") : p.name, role: p.role,
      rep: p.vac ? "Vacant territory" : p.leaf && !isUnit ? (d ? "Reported" : "Not reported") + (p.hq ? " · HQ-" + p.hq : "") : num(p.rep) + "/" + num(p.seats) + " reported" + (p.hq && p.lvl > 0 ? " · HQ-" + p.hq : ""),
      ini: p.vac ? "—" : initials(p.name), av: p.vac ? "#98a2b3" : avatar(p.name), has, noPlan: !has && !p.vac,
      geo: num(p.geo), joint: num(p.joint), force: num(p.force), pending: Math.max(0, num(p.plan) - d), w: has ? pct(ratio(d, p.plan)) : "0%", barC: d ? G : "#98a2b3",
      isUnit, m: { all: true, active: d > 0, pending: has && num(p.plan) - d > 0, force: num(p.force) > 0, noplan: !has && !p.vac },
    };
  });
  // Tree visibility: a row shows when every ancestor is open (the first root starts open).
  const stack = [];
  rows0.forEach((r, i) => {
    while (stack.length && rows0[stack[stack.length - 1]].lvl >= r.lvl) stack.pop();
    r.vis = stack.every((j) => open[rows0[j].id] ?? j === 0);
    r.kids = i + 1 < rows0.length && rows0[i + 1].lvl > r.lvl;
    r.isOpen = open[r.id] ?? i === 0;
    stack.push(i);
  });
  const rows = U && filter === "all" ? rows0.filter((r) => r.vis) : rows0.filter((r) => r.m[filter]).map((r) => ({ ...r, kids: false }));
  const g = U ? U.geo || [] : V.geo, fo = U ? U.force || [] : V.force;
  const pl = U ? num(U.plan) : V.plan, dn = sum(g.map(num)) + sum(fo.map(num)), mx = Math.max(1, ...V.hours.map((_, i) => num(g[i]) + num(fo[i])));
  const FL = [["all", "All"], ["active", "Visiting"], ["pending", "Pending"], ["force", "Force"], ["noplan", "No plan"]];
  return {
    kicker: V.kicker, dot: G, title: U ? U.short : "All " + kinds, sub: U ? kind : V.units.length + " " + kinds,
    kpis: [{ l: "Visits done", v: dn + " / " + pl }, { l: "Geo visits", v: sum(g.map(num)), c: "#067647" }, { l: "Force visits", v: sum(fo.map(num)), c: sum(fo.map(num)) ? "#b42318" : "#0b1220" }, { l: "Pending", v: Math.max(0, pl - dn) }],
    hours: V.hours.map((l, i) => ({ label: hourLabel(l).replace(/ (AM|PM)/, ""), gH: (num(g[i]) / mx) * 100 + "%", fH: (num(fo[i]) / mx) * 100 + "%", gR: num(fo[i]) ? "0" : "3px 3px 0 0" })),
    filters: FL.map(([k, label]) => ({ k, label, n: rows0.filter((r) => r.m[k]).length, on: filter === k })),
    rows, empty: !rows.length, unitKey, filter,
  };
}

/* Reps reporting panel: reported / not reported / vacant, by unit. */
export function repsPanel(view, filter = "not", openUnit) {
  const { V, kinds } = view;
  if (!V?.reps) return null;
  const { reported, total, vacant } = V.reps;
  const groups = V.units.map((u) => {
    const r = u.reps || { reported: [], notYet: [], vacant: [] };
    const list = filter === "rep" ? r.reported : filter === "vac" ? r.vacant : r.notYet;
    const all = r.reported.length + r.notYet.length + r.vacant.length || 1;
    return {
      key: u.key, name: u.short, n: list.length, tot: r.reported.length + r.notYet.length, rep: r.reported.length, vac: r.vacant.length,
      repW: pct(r.reported.length / all), notW: pct(r.notYet.length / all), vacW: pct(r.vacant.length / all),
      fc: filter === "rep" ? "#067647" : filter === "vac" ? "#5b6576" : "#b42318",
      people: list.slice(0, 8).map((p) => ({ name: p.name, ini: filter === "vac" ? "—" : initials(p.name), av: filter === "vac" ? "#98a2b3" : avatar(p.name), meta: p.role + (p.hq ? " · HQ-" + p.hq : ""), st: filter === "rep" ? p.time : filter === "vac" ? "Unfilled" : "Not reported", sc: filter === "rep" ? "#067647" : filter === "vac" ? "#5b6576" : "#b42318" })),
      more: Math.max(0, list.length - 8),
    };
  }).sort((a, b) => b.n - a.n);
  const openKey = openUnit === undefined ? groups[0]?.key : openUnit;
  const not = total - reported, seats = total + vacant || 1;
  return {
    kicker: V.kicker, dot: G, title: "Reps reporting · " + (V.live ? "today" : V.period), sub: V.units.length + " " + kinds,
    kpis: [{ l: "Reported", v: reported, dot: G }, { l: "Not reported", v: not, dot: R }, { l: "Vacant", v: vacant, dot: "#98a2b3" }, { l: "Filled seats", v: total, dot: "#d0d5dd" }],
    repW: pct(reported / seats), notW: pct(not / seats), vacW: pct(vacant / seats),
    note: Math.round(ratio(reported, total) * 100) + "% of filled seats have reported." + (groups[0] && filter === "not" && groups[0].n ? " " + groups[0].name + " has the most pending." : ""),
    filters: [["not", "Not reported", not], ["rep", "Reported", reported], ["vac", "Vacant", vacant]].map(([k, label, n]) => ({ k, label, n, on: filter === k })),
    groups: groups.map((g) => ({ ...g, open: g.key === openKey })),
  };
}
