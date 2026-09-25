/* Pure pieces of the Support Report: who a line belongs to, the financial-
 * year timeline, and every number format on the screen. No fetching here. */

/* ── Org ─────────────────────────────────────────────────────────────── */

const DESIGNATION_SHORT = {
  "Business Executive": "BE",
  "Area Business Manager": "ABM",
  "Regional Business Manager": "RBM",
  "Sr. Regional Business Manager": "RBM",
  "Deputy Regional Business Manager": "DRBM",
  "Sales Manager": "SM",
  "Zonal Sales Manager": "ZSM",
  "General Manager": "GM",
  "Key Account Manager": "KAM",
};
const SALES_SHORTS = new Set(["BE", "ABM", "RBM", "DRBM", "SM", "ZSM", "GM"]);
const SALES_ROLE_ROOT = "Sales";

export const ROOT_ID = "__all__";
export const NO_RP = "—";

export const ROLEL = { ALL: "Admin", GM: "GM", ZSM: "ZSM", SM: "SM", RBM: "RBM", DRBM: "DRBM", ABM: "ABM", BE: "BE", KAM: "KAM" };
const ROLEC = {
  ALL: ["#101828", "#fff"], GM: ["#EEF0FA", "#3E4784"], ZSM: ["#EEF0FA", "#3E4784"], SM: ["#EEF0FA", "#3E4784"],
  RBM: ["#EEF3FF", "#1F4FD8"], DRBM: ["#EEF3FF", "#1F4FD8"], ABM: ["#E6F4F1", "#0E7466"], BE: ["#F2F4F7", "#344054"],
};
export const roleChip = (role) => ROLEC[role] || ["#F2F4F7", "#667085"];
export const roleLabel = (role) => ROLEL[role] || role || "—";

export const TITLE = { ALL: "Support overview", GM: "Support overview", ZSM: "Zone support", SM: "Zone support", RBM: "Region support", DRBM: "Region support", ABM: "Area support", BE: "My support" };
export const TEAMT = { ALL: "Sales managers", GM: "Sales managers", ZSM: "Regional managers", SM: "Regional managers", RBM: "Area managers", DRBM: "Area managers", ABM: "Business executives" };

export const DIV = [
  { id: "ELBR", name: "Elbrit", c: "#1F4FD8" },
  { id: "VASC", name: "Vasco", c: "#0E8C7E" },
  { id: "AURA", name: "Aura & Proxima", c: "#7A2E9E" },
  { id: "CND", name: "CND", c: "#B4236E" },
  { id: "ITF", name: "ITF", c: "#667085" },
];
export const DIVC = Object.fromEntries(DIV.map((d) => [d.id, d]));
const OTHER_DIV = { id: "OTHER", name: "Other", c: "#98A2B3" };
export const divInfo = (id) => DIVC[id] || OTHER_DIV;

export function divOf(dept) {
  const d = String(dept || "");
  if (/^elbrit/i.test(d)) return "ELBR";
  if (/^vasco/i.test(d)) return "VASC";
  if (/^cnd/i.test(d)) return "CND";
  if (/^aura/i.test(d)) return "AURA";
  if (/^institution/i.test(d) || /^itf/i.test(d)) return "ITF";
  return null;
}

export const stripHq = (s) => String(s || "").replace(/^HQ-/i, "").trim();
export const stripCo = (s) => String(s || "").replace(/\s+-\s+ELPL$/i, "").trim();

/* HR keeps an open seat as a V-series placeholder named "Vacant_<name>(Exxxx)". */
const isVacant = (id, name) => /^v\d/i.test(id || "") || /^\s*vacant\s*_/i.test(name || "");
const vacantName = (name) =>
  "Vacant · " + String(name).replace(/^\s*vacant\s*_\s*/i, "").replace(/\s*\([^)]*\)?\s*$/, "").trim(); // ")" is sometimes missing in HR's data

const roleFromRp = (rp) => {
  const m = /^([A-Z]+)\d*-/.exec(rp || "");
  return m ? m[1] : "BE";
};

/* Builds the tree the whole screen hangs off.
 *
 * People come from Employee.reports_to -- the same hierarchy the Visit report
 * uses. A support line is tied to whoever currently holds its role profile.
 * A role profile nobody holds is kept as an "Unassigned" seat under the
 * holder of its nearest parent profile, so every line still counts somewhere
 * and a manager's total always equals the sum of the rows beneath it. */
export function buildTree(org, lineRps) {
  const employees = org?.employees ?? [];
  const roleParents = org?.roleParents ?? {};

  const salesProfiles = new Set();
  const childrenOf = new Map();
  for (const [rp, parent] of Object.entries(roleParents)) {
    if (!parent) continue;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(rp);
  }
  const stack = [SALES_ROLE_ROOT];
  while (stack.length) {
    const cur = stack.pop();
    if (salesProfiles.has(cur)) continue;
    salesProfiles.add(cur);
    for (const c of childrenOf.get(cur) ?? []) stack.push(c);
  }

  const everyone = new Map(employees.map((e) => [e.id, e]));
  const withShort = employees
    .filter((e) => e.active !== false)
    .map((e) => ({ ...e, role: DESIGNATION_SHORT[e.designation] || e.designation || "—" }));
  /* A "Vacant_" record whose role profile an ACTIVE real person also holds is
     stale -- HR filled the seat and never retired the placeholder. 17 sales
     seats looked like this on 25 Sep 2026. Such a placeholder is not a row of
     its own, and anyone still reporting to it belongs under the real holder.
     Found by reconciling against REST: Mailarappa Durgad reports to V01698, a
     stale ABM4-AURA-KA-HUB placeholder parked under a Vasco RBM, while the
     seat's real holder, Sadath Ali J, sits in Aura Karnataka under Vinoth
     Kumar R -- following the placeholder filed Aura lines under Vasco. */
  /* When two people hold one seat, the choice must not depend on the order
     the ERP lists records in. A real person beats a placeholder; then the
     one whose designation matches the seat type (ABM1-... -> an ABM, not a
     BE; RBM-... -> the RBM, not their DRBM); then the lower employee id.
     Seen: ABM1-AURA-CH-CHE (an ABM and a BE), RBM-ELBR-BA-BAN (RBM + DRBM). */
  const seatScore = (e, rp) => (isVacant(e.id, e.name) ? 0 : 2) + (roleFromRp(rp) === e.role ? 1 : 0);
  const better = (a, b, rp) => { const d = seatScore(a, rp) - seatScore(b, rp); return d ? d > 0 : a.id < b.id; };
  const realHolder = new Map();
  for (const e of withShort) {
    if (!e.rp || isVacant(e.id, e.name)) continue;
    const cur = realHolder.get(e.rp);
    if (!cur || better(e, cur, e.rp)) realHolder.set(e.rp, e);
  }
  const isStale = (e) => !!e && isVacant(e.id, e.name) && !!e.rp && realHolder.has(e.rp) && realHolder.get(e.rp).id !== e.id;
  const keep = withShort.filter(
    (e) => !isStale(e) && (SALES_SHORTS.has(e.role) || (e.rp && (salesProfiles.has(e.rp) || lineRps.has(e.rp)))),
  );
  const keepIds = new Set(keep.map((e) => e.id));

  const N = new Map();
  const root = { id: ROOT_ID, name: "All India", role: "ALL", parent: null, kids: [], dept: "Management", hq: "All India", vac: false, code: "", div: null, pseudo: false };
  N.set(ROOT_ID, root);

  for (const e of keep) {
    const vac = isVacant(e.id, e.name);
    N.set(e.id, {
      id: e.id,
      name: vac ? vacantName(e.name) : e.name,
      role: e.role,
      parent: null,
      kids: [],
      dept: stripCo(e.dept),
      hq: stripHq(e.hq),
      vac,
      code: e.rp || "",
      div: divOf(e.dept),
      pseudo: false,
      userId: e.userId,
    });
  }
  const link = (child, parent) => {
    child.parent = parent;
    parent.kids.push(child);
  };
  /* A manager who isn't in the tree (a vacant seat, someone inactive or
     outside sales) must not cut their team loose. Climb reports_to through
     EVERY employee record to the next person who is in the tree -- the
     next immediate higher-up. If that chain dead-ends, fall back to whoever
     holds the parent role profile, and only then to the top. */
  const rpHolderEmp = new Map();
  for (const e of keep) {
    if (!e.rp) continue;
    const cur = rpHolderEmp.get(e.rp);
    if (!cur || better(e, cur, e.rp)) rpHolderEmp.set(e.rp, e);
  }
  const managerOf = (e) => {
    const seen = new Set([e.id]);
    let up = e.reportsTo;
    while (up && !seen.has(up)) {
      // Reporting to a stale placeholder means reporting to whoever now holds that seat.
      const upE = everyone.get(up);
      if (upE && upE.active !== false && isStale(upE)) {
        const h = realHolder.get(upE.rp);
        if (keepIds.has(h.id) && h.id !== e.id) return N.get(h.id);
      }
      if (keepIds.has(up)) return N.get(up);
      seen.add(up);
      up = upE?.reportsTo ?? null;
    }
    const rpSeen = new Set();
    let rp = e.rp ? roleParents[e.rp] : null;
    while (rp && !rpSeen.has(rp)) {
      rpSeen.add(rp);
      const h = rpHolderEmp.get(rp);
      if (h && h.id !== e.id) return N.get(h.id);
      rp = roleParents[rp];
    }
    return root;
  };
  // Link first, then drop any accidental cycle the fallback could create.
  for (const e of keep) {
    const n = N.get(e.id);
    let m = managerOf(e);
    for (let p = m; p && p !== root; p = p.parent) if (p === n) { m = root; break; }
    link(n, m);
  }

  /* A vacant seat that reports to nobody is an HR placeholder left floating,
     not a territory -- if its role profile still carries lines they reach
     the tree below as an Unassigned seat under the profile's parent. */
  root.kids = root.kids.filter((k) => {
    if (k.vac && !k.kids.length) {
      N.delete(k.id);
      return false;
    }
    return true;
  });

  /* A single sales head (the GM) IS "All India" -- collapsing them into the
     root keeps the first team level the sales managers, as the design has it. */
  let mergedHead = null;
  const heads = root.kids.filter((k) => k.role === "GM");
  if (heads.length === 1 && heads[0].kids.length) {
    mergedHead = heads[0];
    root.kids = root.kids.filter((k) => k !== mergedHead).concat(mergedHead.kids);
    for (const k of mergedHead.kids) k.parent = root;
    N.delete(mergedHead.id);
  }

  // Holder of each role profile, by the same rule as above.
  const holder = new Map();
  const holderEmp = new Map();
  for (const e of keep) {
    if (!e.rp) continue;
    const node = N.get(e.id) || (mergedHead?.id === e.id ? root : null);
    if (!node) continue;
    const cur = holderEmp.get(e.rp);
    if (!cur || better(e, cur, e.rp)) { holder.set(e.rp, node); holderEmp.set(e.rp, e); }
  }

  const noOrg = employees.length === 0;
  const rpNode = new Map(holder);
  const seatFor = (rp) => {
    if (rpNode.has(rp)) return rpNode.get(rp);
    if (rp === NO_RP) {
      const n = { id: `rp:${NO_RP}`, name: "No role profile", role: "—", parent: null, kids: [], dept: "Lines without a role profile", hq: "", vac: true, code: "", div: null, pseudo: true };
      link(n, root);
      N.set(n.id, n);
      rpNode.set(rp, n);
      return n;
    }
    let up = roleParents[rp];
    const seen = new Set();
    let parent = root;
    while (up && !seen.has(up)) {
      seen.add(up);
      if (holder.has(up)) {
        parent = holder.get(up);
        break;
      }
      up = roleParents[up];
    }
    const n = {
      id: `rp:${rp}`,
      name: noOrg ? rp : `Unassigned · ${rp}`,
      role: roleFromRp(rp),
      parent: null,
      kids: [],
      dept: "",
      hq: "",
      vac: !noOrg,
      code: rp,
      div: null,
      pseudo: true,
    };
    link(n, parent);
    N.set(n.id, n);
    rpNode.set(rp, n);
    return n;
  };
  for (const rp of lineRps) seatFor(rp);

  const viewerEmail = String(org?.email || "").toLowerCase();
  let viewer = root;
  if (viewerEmail) {
    const me = keep.find((e) => (e.userId || "").toLowerCase() === viewerEmail);
    if (me && N.has(me.id)) viewer = N.get(me.id);
  }

  return { N, root, rpNode, viewer, seatFor };
}

export const leavesOf = (n) => (n.kids.length ? n.kids.flatMap(leavesOf) : [n]);

export function subtreeIds(n, out = new Set()) {
  out.add(n.id);
  for (const k of n.kids) subtreeIds(k, out);
  return out;
}

/* ── Timeline ─────────────────────────────────────────────────────────── */

export const MN = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export const fyOfYm = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return m >= 4 ? y : y - 1;
};

/* Month index i counts from April of `fy0`. */
export function makeTimeline(fy0, fy1) {
  const FYS = [];
  for (let f = fy0; f <= fy1; f++) FYS.push(f);
  const TL = [];
  for (const fy of FYS) {
    MN.forEach((s, k) => {
      const y = k < 9 ? fy : fy + 1;
      const m = ((k + 3) % 12) + 1;
      TL.push({ fy, k, s, y, ym: `${y}-${String(m).padStart(2, "0")}` });
    });
  }
  const indexOf = (ym) => TL.findIndex((t) => t.ym === ym);
  return { FYS, TL, fy0, indexOf };
}

export const fyL = (fy) => `FY ${fy}-${String(fy + 1).slice(2)}`;
export const fyS = (fy) => `FY${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;

/* ── Formatting ──────────────────────────────────────────────────────── */

const PAL = ["#5B3FD1", "#0E8C7E", "#B4236E", "#1F63D8", "#9A5A12", "#3E4784", "#7A2E9E", "#0B7A99"];
export const hash = (s) => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};
export const avBg = (s) => PAL[hash(s) % PAL.length];
export const ini = (s) =>
  String(s)
    .replace(/^Vacant · /, "")
    .replace(/^Unassigned · /, "")
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
export const dIni = (s) => (String(s).replace(/^Dr\.?\s*/i, "").trim()[0] || "?").toUpperCase();

export const inr = (v) => {
  v = Math.round(v || 0);
  if (v >= 1e7) return "₹" + (v / 1e7).toFixed(2) + " Cr";
  if (v >= 1e5) return "₹" + (v / 1e5).toFixed(2).replace(/\.?0+$/, "") + "L";
  if (v >= 1e3) return "₹" + (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return "₹" + v;
};
/* Compact rupees for tight spots -- bar labels, picker cells, scope list. */
export const inrS = (v) => {
  v = Math.round(v || 0);
  if (v >= 1e7) return "₹" + (v / 1e7).toFixed(1).replace(/\.0$/, "") + "Cr";
  if (v >= 1e5) return "₹" + (v / 1e5).toFixed(1).replace(/\.0$/, "") + "L";
  if (v >= 1e3) return "₹" + Math.round(v / 1e3) + "K";
  return "₹" + v;
};
export const inrF =(v) => "₹" + Math.round(v || 0).toLocaleString("en-IN");
export const num = (v) => Math.round(v || 0).toLocaleString("en-IN");
export const cq = (v) =>
  v >= 1e5 ? (v / 1e5).toFixed(1) + "L" : v >= 1e3 ? (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(Math.round(v || 0));

export const dlt = (c, p) => {
  if (!p) return { t: "—", fg: "#667085", bg: "#F2F4F7", x: 0 };
  const x = ((c - p) / p) * 100;
  if (Math.abs(x) < 0.05) return { t: "0.0%", fg: "#667085", bg: "#F2F4F7", x: 0 };
  return { t: (x >= 0 ? "+" : "") + x.toFixed(1) + "%", fg: x >= 0 ? "#15803D" : "#C4262B", bg: x >= 0 ? "#E7F6EC" : "#FDECEC", x };
};

/* ── Aggregation ─────────────────────────────────────────────────────── */

export function agg(lineLists) {
  let q = 0;
  let a = 0;
  const docs = new Set();
  const items = new Set();
  for (const lines of lineLists) {
    for (const l of lines) {
      q += l.q;
      a += l.a;
      docs.add(l.d);
      items.add(l.item);
    }
  }
  return { q, a, n: docs.size, p: items.size };
}
