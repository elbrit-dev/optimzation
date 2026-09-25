/* The Support Report's screen state, ported from the design prototype's
 * renderVals(). Same labels, same colours, same rules -- with the prototype's
 * simulated months, sample splits and "≈" estimates replaced by sums over the
 * real Doctor Support item lines of the months on file.
 *
 * Pure apart from `set`, which is the component's setState. */

import {
  MN, NO_RP, TEAMT, TITLE, agg, avBg, dIni, divInfo, divOf, dlt, fyL, fyS, inr, inrF, inrS, ini, leavesOf,
  num, roleChip, roleLabel, stripHq, subtreeIds,
} from "./data/model";

const pctOf = (a, b) => (b ? (a / b) * 100 : 0);

function fmtStamp(s) {
  if (!s) return "—";
  const [d, t] = String(s).split(" ");
  const [y, m, dd] = d.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${dd} ${mon} ${y}${t ? " · " + t.slice(0, 5) : ""}`;
}

export function buildView({ s, set, tl, onFile, months, tree, DOC, mob, fill, cache, openDrawer }) {
  const { TL, FYS, fy0 } = tl;
  const fyMin = FYS[0];
  const fyMax = FYS[FYS.length - 1];
  const fb = (fy) => (fy - fy0) * 12;
  const avail = (i) => i >= 0 && i < TL.length && onFile[TL[i].ym] > 0;
  const loaded = (i) => avail(i) && !!months[TL[i].ym];
  let LATEST = 0;
  for (let i = TL.length - 1; i >= 0; i--) if (avail(i)) { LATEST = i; break; }

  /* ── Period ── */
  let R = (s.months || [LATEST]).filter(avail).sort((a, b) => a - b);
  if (!R.length) R = [LATEST];
  const inR = new Set(R);
  const R0 = R[0];
  const rEnd = R[R.length - 1];
  const prevAvail = (i) => { for (let j = i - 1; j >= 0; j--) if (avail(j)) return j; return null; };
  let P = null;
  if (R.length === 1) { const p = prevAvail(R0); P = p == null ? null : [p]; }
  else { const pp = R.map((i) => i - 12); P = pp.every(avail) ? pp : null; }
  const ml = (i) => TL[i].s + " " + TL[i].y;
  const contig = R.every((v, i) => !i || v === R[i - 1] + 1);
  const fyMs = (f) => Array.from({ length: 12 }, (_, j) => fb(f) + j).filter(avail);
  const qMs = (f, k) => [0, 1, 2].map((j) => fb(f) + k * 3 + j).filter(avail);
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const qHit = (() => { for (const f of FYS) for (let k = 0; k < 4; k++) { const m = qMs(f, k); if (m.length && same(m, R)) return "Q" + (k + 1) + " " + fyS(f) + (m.includes(LATEST) && m.length < 3 ? " · to date" : ""); } return null; })();
  const fyHit = (() => { for (const f of FYS) { const m = fyMs(f); if (m.length > 1 && same(m, R)) return fyL(f) + (m.includes(LATEST) && m.length < 12 ? " · to date" : ""); } return null; })();
  const label = fyHit && R.length > 3 ? fyHit : qHit && R.length > 1 ? qHit : R.length === 1 ? ml(R0)
    : contig ? (TL[R0].y === TL[rEnd].y ? TL[R0].s + "–" + ml(rEnd) : ml(R0) + " – " + ml(rEnd)) : R.length + " months";
  const vs = !P ? "no earlier data on file" : R.length === 1 ? "vs " + ml(P[0]) : "vs same months last year";
  const sub = R.length === 1 ? "Month · " + fyS(TL[R0].fy) : contig ? R.length + " months · " + vs : R.map((i) => TL[i].s).join(", ");
  const shiftOk = (dir) => R.every((i) => avail(i + dir));

  /* ── Scope ── */
  const { root, viewer, N, rpNode } = tree;
  const treeRows = [];
  (function w(n, d) { treeRows.push({ n, d }); n.kids.forEach((k) => w(k, d + 1)); })(viewer, 0);
  const subIds = new Set(treeRows.map((x) => x.n.id));
  let sel = (s.sel || [viewer.id]).filter((id) => subIds.has(id));
  if (!sel.length) sel = [viewer.id];
  const selN = sel.map((id) => N.get(id));
  // A child picked alongside its own manager is already inside the manager.
  const selTop = selN.filter((n) => { for (let p = n.parent; p; p = p.parent) if (sel.includes(p.id)) return false; return true; });
  const isM = selN.includes(root);
  const isAdmin = viewer === root;
  const own = viewer.role === "BE";
  const scopeKey = selTop.map((n) => n.id).sort().join(",");
  const scopeSet = new Set();
  selTop.forEach((n) => subtreeIds(n, scopeSet));

  const nodeOf = (l) => rpNode.get(l.rp || NO_RP);
  const scoped = (key, idSet, i) => {
    const ck = "L|" + key + "|" + i;
    if (cache.has(ck)) return cache.get(ck);
    const m = months[TL[i].ym];
    if (!m) return null;
    const out = m.lines.filter((l) => idSet.has(nodeOf(l)?.id));
    cache.set(ck, out);
    return out;
  };
  const Sx = (i) => scoped(scopeKey, scopeSet, i);
  const aggOver = (key, idSet, rg) => {
    const ck = "A|" + key + "|" + rg.join(",");
    if (cache.has(ck)) return cache.get(ck);
    const lists = [];
    let pending = false;
    rg.forEach((i) => { if (!avail(i)) return; const L = scoped(key, idSet, i); if (!L) pending = true; else lists.push(L); });
    const r = { ...agg(lists), pending };
    if (!pending) cache.set(ck, r);
    return r;
  };
  const aggS = (rg) => aggOver(scopeKey, scopeSet, rg);
  const linesOver = (key, idSet, rg) => rg.flatMap((i) => (avail(i) ? scoped(key, idSet, i) || [] : []));

  /* Per-person subtree totals over the viewer's tree, for team rows and the
     scope picker. Built bottom-up once per month set. */
  const roll = (rg) => {
    const ck = "R|" + viewer.id + "|" + rg.join(",");
    if (cache.has(ck)) return cache.get(ck);
    const ownM = new Map();
    rg.forEach((i) => {
      if (!avail(i)) return;
      const L = scoped("V" + viewer.id, subIds, i);
      if (!L) return;
      for (const l of L) {
        const id = nodeOf(l).id;
        let o = ownM.get(id);
        if (!o) { o = { q: 0, a: 0, docs: new Set() }; ownM.set(id, o); }
        o.q += l.q; o.a += l.a; o.docs.add(l.d);
      }
    });
    const out = new Map();
    // Copy-on-write: a node borrows its first child's doctor set and only
    // copies it once a second set has to be merged in.
    const walk = (n) => {
      const o = ownM.get(n.id);
      let q = o ? o.q : 0;
      let a = o ? o.a : 0;
      let docs = o ? o.docs : null;
      let owned = false;
      for (const k of n.kids) {
        const c = walk(k);
        q += c.q; a += c.a;
        if (!c.docs.size) continue;
        if (!docs) { docs = c.docs; continue; }
        if (!owned) { docs = new Set(docs); owned = true; }
        c.docs.forEach((d) => docs.add(d));
      }
      const r = { q, a, n: docs ? docs.size : 0, docs: docs || new Set() };
      out.set(n.id, r);
      return r;
    };
    walk(viewer);
    cache.set(ck, out);
    return out;
  };

  /* ── Months to load, most urgent first ── */
  const cfy = s.cfy != null ? s.cfy : TL[rEnd].fy;
  const cb = fb(cfy);
  const six = Array.from({ length: 6 }, (_, j) => rEnd - 5 + j).filter((i) => i >= 0);
  const pfy = s.pfy != null ? s.pfy : TL[rEnd].fy;
  const needed = [...R, ...(P || []), ...six, ...Array.from({ length: 12 }, (_, k) => cb + k), ...(s.pop === "month" ? Array.from({ length: 12 }, (_, k) => fb(pfy) + k) : [])]
    .filter(avail).map((i) => TL[i].ym);

  /* ── KPIs ── */
  const CC = aggS(R);
  const Pv = P ? aggS(P) : null;
  const pendingMain = CC.pending || (Pv && Pv.pending);
  const kd = (c, p) => { const d = Pv && !Pv.pending ? dlt(c, p) : dlt(0, 0); return { delta: d.t, dFg: d.fg, dBg: d.bg }; };
  const card = { fs: mob ? "22px" : "30px", vc: "#101828", bg: "#fff", bd: "#EAECF0" };
  /* Value first, qty right after it -- four plain cards, same weight.
     Unique products was dropped. */
  const kpis = [
    { ...card, label: own ? "My support value" : "Support value", value: inr(CC.a), unit: "", note: vs, ...kd(CC.a, Pv?.a) },
    { ...card, label: own ? "My total qty" : "Total qty", value: num(CC.q), unit: "units", note: vs, ...kd(CC.q, Pv?.q) },
    { ...card, label: own ? "My doctors" : "Unique doctors", value: num(CC.n), unit: "", note: R.length > 1 ? "distinct across " + R.length + " months" : vs, ...kd(CC.n, Pv?.n) },
    { ...card, label: "Avg qty / product", value: num(CC.p ? CC.q / CC.p : 0), unit: "units", note: "total qty ÷ unique products", ...kd(CC.p ? CC.q / CC.p : 0, Pv?.p ? Pv.q / Pv.p : 0) },
  ];

  /* ── Value by month ── */
  const mv = Array.from({ length: 12 }, (_, k) => { const i = cb + k; if (!avail(i)) return null; return loaded(i) ? aggS([i]) : "wait"; });
  const tmx = Math.max(1, ...mv.map((v) => (v && v !== "wait" ? v.a : 0)));
  const trend = {
    sub: (isM ? "All India" : selN.length > 1 ? selN.length + " team members" : selN[0].name) + " · " + label,
    fyLabel: fyL(cfy), qty: num(CC.q),
    fyPrev: () => cfy > fyMin && set({ cfy: cfy - 1 }), fyNext: () => cfy < fyMax && set({ cfy: cfy + 1 }),
    fyPrevOp: cfy > fyMin ? 1 : 0.35, fyNextOp: cfy < fyMax ? 1 : 0.35,
    bars: mv.map((v, k) => {
      const i = cb + k, on = inR.has(i), wait = v === "wait", has = v && !wait;
      return {
        key: i, label: MN[k], yr: k === 0 || k === 9 ? String(TL[i].y) : "",
        val: has ? inrS(v.a) : wait ? "…" : "",
        title: has ? ml(i) + " · " + inrF(v.a) + " · " + num(v.q) + " units" : wait ? ml(i) + " · loading" : ml(i) + " · no data",
        h: has ? Math.max(4, Math.round((v.a / tmx) * (mob ? 100 : 130))) : 10,
        bg: has ? (on ? "#1F4FD8" : "#D6E0FA") : wait ? "#EEF1F5" : "transparent",
        dash: v ? "transparent" : "#D0D5DD",
        lc: on ? "#101828" : v ? "#667085" : "#98A2B3", fw: on ? 700 : 400, cur: v ? "pointer" : "default",
        onClick: () => { if (v) set({ months: [i], cfy: null }); },
      };
    }),
  };

  /* ── Month picker ── */
  const pm = s.pmode;
  const cst = (on, ok) => ({ tick: on ? "✓" : "", tfg: on ? "#fff" : "transparent", bg: on ? "#101828" : ok ? "#fff" : "#F9FAFB", fg: on ? "#fff" : ok ? "#101828" : "#98A2B3", bd: on ? "#101828" : ok ? "#EAECF0" : "#F2F4F7", sfg: on ? "#D0D5DD" : ok ? "#667085" : "#98A2B3", cur: ok ? "pointer" : "default" });
  const togM = (ms) => () => {
    if (!ms.length) return;
    set((x) => { const cur = (x.months || [LATEST]).filter(avail); const all = ms.every((z) => cur.includes(z)); let nx = all ? cur.filter((z) => !ms.includes(z)) : cur.concat(ms.filter((z) => !cur.includes(z))); if (!nx.length) nx = ms.slice(); return { months: nx, cfy: null }; });
  };
  const cellQty = (ms) => { const a = aggS(ms); return a.pending ? "…" : inrS(a.a); };
  let cells;
  if (pm === "quarter") cells = [0, 1, 2, 3].map((k) => { const ms = qMs(pfy, k), ok = ms.length > 0, on = ok && ms.every((z) => inR.has(z)); return { key: k, label: "Q" + (k + 1) + " · " + MN[k * 3] + "–" + MN[k * 3 + 2], sub: ok ? cellQty(ms) + (ms.length < 3 ? (ms.includes(LATEST) ? " · to date" : " · " + ms.length + "/3 mo") : "") : "no data", onClick: togM(ms), ...cst(on, ok) }; });
  else if (pm === "fy") cells = FYS.map((f) => { const ms = fyMs(f), ok = ms.length > 0, on = ok && ms.every((z) => inR.has(z)); return { key: f, label: fyL(f), sub: ok ? cellQty(ms) + (ms.length < 12 ? (ms.includes(LATEST) ? " · " + ms.length + " months to date" : " · " + ms.length + " months on file") : "") : "no data", onClick: togM(ms), ...cst(on, ok) }; });
  else cells = MN.map((m, k) => { const i = fb(pfy) + k, ok = avail(i); return { key: k, label: m, sub: ok ? cellQty([i]) : i > LATEST ? "not yet" : "no data", onClick: togM(ok ? [i] : []), ...cst(inR.has(i), ok) }; });
  const lastN = (n) => { const out = []; for (let i = LATEST; i >= 0 && out.length < n; i--) if (avail(i)) out.unshift(i); return out; };
  const runs = [];
  TL.forEach((t, i) => { if (!avail(i)) return; const last = runs[runs.length - 1]; if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]); });
  const onFileTxt = runs.map(([a, b]) => (a === b ? ml(a) : TL[a].y === TL[b].y ? TL[a].s + "–" + ml(b) : ml(a) + " – " + ml(b))).join(" · ");
  const pk = {
    label, sub, open: s.pop === "month", toggle: () => set((x) => ({ pop: x.pop === "month" ? null : "month", pfy: null })), count: R.length + " selected",
    prev: () => shiftOk(-1) && set({ months: R.map((i) => i - 1), cfy: null }), next: () => shiftOk(1) && set({ months: R.map((i) => i + 1), cfy: null }),
    prevOp: shiftOk(-1) ? 1 : 0.35, nextOp: shiftOk(1) ? 1 : 0.35,
    presets: [["Latest month", [LATEST]], ["Last 3 months", lastN(3)], ["Last 6 months", lastN(6)], ["FY to date", fyMs(TL[LATEST].fy)], ["Last FY", fyMs(TL[LATEST].fy - 1)]]
      .filter((p) => p[1].length).map(([l, m]) => ({ label: l, onClick: () => set({ months: m, cfy: null }) })),
    modes: [["month", "Month"], ["quarter", "Quarter"], ["fy", "Financial year"]].map(([id, l]) => ({ id, label: l, bg: id === pm ? "#fff" : "transparent", fg: id === pm ? "#101828" : "#475467", sh: id === pm ? "0 1px 2px rgba(16,24,40,.12)" : "none", onClick: () => set({ pmode: id }) })),
    showFy: pm !== "fy", cols: pm === "month" ? 4 : pm === "quarter" ? 2 : 1, cellH: pm === "month" ? 54 : 60,
    hint: pm === "month" ? "Tap months to add or remove" : pm === "quarter" ? "Tap quarters to add or remove" : "Tap a year to add or remove",
    fyLabel: fyL(pfy), fyPrev: () => pfy > fyMin && set({ pfy: pfy - 1 }), fyNext: () => pfy < fyMax && set({ pfy: pfy + 1 }),
    fyPrevOp: pfy > fyMin ? 1 : 0.35, fyNextOp: pfy < fyMax ? 1 : 0.35, cells,
    onFile: onFileTxt, clear: () => set({ months: [LATEST], cfy: null }),
  };

  /* ── Scope picker ── */
  const rollR = roll(R);
  const rollP = P ? roll(P) : null;
  /* The picker is a collapsible tree: only the viewer's own level is open by
     default, so a company-wide roster of ~400 names starts as ~12 rows.
     Ancestors of anyone selected open on their own, so a selection is never
     hidden inside a closed branch -- unless the reader closed it themselves. */
  const selAnc = new Set();
  selN.forEach((n) => { for (let p = n.parent; p; p = p.parent) selAnc.add(p.id); });
  const scExp = s.scExp || {};
  const scIsOpen = (n) => (scExp[n.id] != null ? scExp[n.id] : n === viewer || selAnc.has(n.id));
  const scRows = [];
  (function w(n, d) { scRows.push({ n, d }); if (scIsOpen(n)) n.kids.forEach((k) => w(k, d + 1)); })(viewer, 0);
  const sc = {
    show: viewer.kids.length > 0, open: s.pop === "scope", toggle: () => set((x) => ({ pop: x.pop === "scope" ? null : "scope" })),
    label: (selN[0] === root ? "All India · Admin" : selN[0].name + " · " + roleLabel(selN[0].role)) + (selN[0] === viewer ? " (my team)" : "") + (selN.length > 1 ? " +" + (selN.length - 1) : ""),
    count: sel.length + " selected · tap to add or remove", reset: () => set({ sel: null, exp: {}, scExp: {} }),
    collapseAll: () => set({ scExp: Object.fromEntries(treeRows.filter(({ n }) => n !== viewer && n.kids.length).map(({ n }) => [n.id, false])) }),
    items: scRows.map(({ n, d }) => {
      const on = sel.includes(n.id), rc = roleChip(n.role), open = scIsOpen(n);
      return {
        hasKids: n.kids.length > 0, rot: open ? 90 : 0, kidCount: n.kids.length,
        toggleOpen: () => set((x) => ({ scExp: { ...(x.scExp || {}), [n.id]: !open } })),
        id: n.id, name: n === root ? "All India" : n.name, role: roleLabel(n.role), chipBg: rc[0], chipFg: rc[1], pad: 8 + d * 16,
        tick: on ? "✓" : "", bg: on ? "#1F4FD8" : "#fff", bd: on ? "#1F4FD8" : "#D0D5DD", fw: on ? 600 : 400, qty: CC.pending ? "…" : inrS(rollR.get(n.id)?.a || 0),
        /* Adding someone drops anyone already ticked above or below them: a
           manager already contains their team, so ticking both would just
           mean the manager. Peers still combine. */
        onClick: () => set((x) => {
          const cur = (x.sel || [viewer.id]).filter((id) => subIds.has(id));
          let nx;
          if (cur.includes(n.id)) nx = cur.filter((z) => z !== n.id);
          else {
            const below = subtreeIds(n);
            const above = new Set();
            for (let p = n.parent; p; p = p.parent) above.add(p.id);
            nx = cur.filter((z) => !below.has(z) && !above.has(z)).concat([n.id]);
          }
          if (!nx.length) nx = [viewer.id];
          return { sel: nx, exp: {} };
        }),
      };
    }),
  };

  /* ── Team ── */
  const top = selN.length === 1 ? selN[0].kids : selTop;
  const rows = [];
  const beCount = (k) => leavesOf(k).filter((l) => l.role === "BE").length;
  const subOf = (k) => {
    if (k.pseudo) return (k.code ? k.code + " · " : "") + "no one holds this role profile" + (k.parent && k.parent !== root ? " · under " + k.parent.name : "");
    if (k.role === "BE") return (k.code || "—") + (k.hq ? " · HQ " + k.hq : "") + (k.vac ? " · vacant" : "");
    if (!k.kids.length) return [k.code, k.hq ? "covers HQ " + k.hq : "", k.vac ? "vacant" : ""].filter(Boolean).join(" · ") || roleLabel(k.role);
    return (k.dept || roleLabel(k.role)) + " · " + beCount(k) + " BEs";
  };
  /* A manager's OWN lines (booked on their own role profile -- some ABMs
     cover an HQ themselves) count in their total, so they get a row of their
     own; without it the Team card didn't add up to the KPI above it (found
     in verification: an ABM's FY total ₹63.46L vs ₹46.69L across his BEs). */
  const ownRow = (k, depth, mx) => {
    if (k === root && !k.code) return null;
    const one = new Set([k.id]);
    const c = aggOver("O" + k.id, one, R), p = P ? aggOver("O" + k.id, one, P) : null;
    if (!c.q && !c.a) return null;
    const d = dlt(c.a, p && p.a);
    return {
      id: "own:" + k.id, name: k.name + " · own lines", initials: k.vac ? "—" : ini(k.name), avBg: k.vac ? "#98A2B3" : avBg(k.name), role: roleLabel(k.role), chipBg: roleChip(k.role)[0], chipFg: roleChip(k.role)[1],
      sub: (k.code || "own role profile") + " · booked on their own role profile", main: inr(c.a), minor: num(c.q) + " units", n: num(c.n), delta: P ? d.t : "", dFg: d.fg, w: Math.min(100, (c.a / Math.max(1, mx)) * 100),
      bar: k.div ? divInfo(k.div).c : "#1F4FD8", guides: Array.from({ length: depth }, (_, i) => i), hasKids: false, rot: 0, canDocs: false, toggle: () => {}, openDocs: () => {},
    };
  };
  const addRows = (list, depth, owner) => {
    const as = list.map((k) => ({ k, c: rollR.get(k.id) || { q: 0, a: 0, n: 0 }, p: rollP ? rollP.get(k.id) : null }));
    const mx = Math.max(1, ...as.map((x) => x.c.a));
    as.sort((a, b) => b.c.a - a.c.a || b.c.q - a.c.q || a.k.name.localeCompare(b.k.name)).forEach(({ k, c, p }) => {
      const open = !!s.exp[k.id], d = dlt(c.a, p && p.a), rc = roleChip(k.role);
      rows.push({
        id: k.id, name: k.name, initials: k.vac ? "—" : ini(k.name), avBg: k.vac ? "#98A2B3" : avBg(k.name), role: roleLabel(k.role), chipBg: rc[0], chipFg: rc[1],
        sub: subOf(k), main: inr(c.a), minor: num(c.q) + " units", n: num(c.n), delta: P ? d.t : "", dFg: d.fg, w: (c.a / mx) * 100,
        bar: k.div ? divInfo(k.div).c : "#1F4FD8", guides: Array.from({ length: depth }, (_, i) => i), hasKids: k.kids.length > 0, rot: open ? 90 : 0, canDocs: c.q > 0 || c.a > 0,
        toggle: () => set((x) => { const e = { ...x.exp }; e[k.id] = !e[k.id]; return { exp: e }; }),
        openDocs: () => openDrawer({ type: "person", id: k.id }),
      });
      if (open) addRows(k.kids, depth + 1, k);
    });
    // Only alongside a team: a BE alone already sees their own lines as the whole report.
    const ownR = owner && owner.kids.length ? ownRow(owner, depth, mx) : null;
    if (ownR) rows.push(ownR);
  };
  addRows(top, 0, selN.length === 1 ? selN[0] : null);

  const TABS = [["overview", "Overview"]].concat(rows.length ? [["team", "Team"]] : [], [["docs", "Doctors"], ["brands", "Brands · HQ"]]);
  const tab = TABS.some((t) => t[0] === s.tab) ? s.tab : "overview";
  const onT = (k) => !mob || tab === k;
  const tabs = TABS.map(([id, l]) => ({ id, label: l, bg: id === tab ? "#fff" : "transparent", fg: id === tab ? "#101828" : "#475467", sh: id === tab ? "0 1px 2px rgba(16,24,40,.12)" : "none", onClick: () => set({ tab: id, pop: null }) }));
  const vis = { trend: onT("overview"), docs: onT("docs"), brands: onT("brands") };
  const showTeam = rows.length > 0 && onT("team");
  const team = { title: selN.length > 1 ? "Selected team members" : TEAMT[selN[0].role] || "Team", sub: label + " · value first · tap ▶ to go deeper", rows, collapse: () => set({ exp: {} }) };

  /* ── Doctors ── */
  const sumR = (arr, rg) => rg.reduce((x, i) => x + arr[i], 0);
  const docMonths = [...new Set([...R, ...(P || []), ...six])].filter(avail);
  const docsOf = (key, idSet) => {
    const ck = "D|" + key + "|" + docMonths.join(",") + "|" + R.join(",");
    if (cache.has(ck)) return cache.get(ck);
    const by = new Map();
    docMonths.forEach((i) => {
      const L = scoped(key, idSet, i);
      if (!L) return;
      for (const l of L) {
        let o = by.get(l.d);
        if (!o) { o = { d: DOC[l.d] || { id: l.d, name: l.d, spec: "—", cat: "—", city: "", hq: "", qual: "—" }, v: new Float64Array(TL.length), qv: new Float64Array(TL.length) }; by.set(l.d, o); }
        o.v[i] += l.a; o.qv[i] += l.q;
      }
    });
    const out = [...by.values()].map((o) => Object.assign(o, { a: sumR(o.v, R), qa: sumR(o.qv, R), pa: P ? sumR(o.v, P) : 0, pq: P ? sumR(o.qv, P) : 0 })).filter((o) => o.qa > 0 || o.a > 0);
    cache.set(ck, out);
    return out;
  };
  const pool = docsOf(scopeKey, scopeSet);
  const hqOfDoc = (d) => stripHq(d.hq) || "—";
  const qq = s.dq.trim().toLowerCase();
  const cnt = (f) => { const m = {}; pool.forEach((o) => { const k = f(o); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
  const fOk = (o) => (!s.fSpec.length || s.fSpec.includes(o.d.spec)) && (!s.fCat.length || s.fCat.includes(o.d.cat || "—")) && (!s.fHq.length || s.fHq.includes(hqOfDoc(o.d)));
  let dl = pool.filter(fOk);
  if (qq) dl = dl.filter((o) => (o.d.name + " " + o.d.id + " " + o.d.city).toLowerCase().includes(qq));
  const SORTS = [
    ["amt", "Value — high to low", (a, b) => b.a - a.a],
    ["qty", "Qty — high to low", (a, b) => b.qa - a.qa],
    ["delta", "Biggest change", (a, b) => dlt(b.a, b.pa).x - dlt(a.a, a.pa).x],
    ["name", "Name — A to Z", (a, b) => a.d.name.localeCompare(b.d.name)],
    ["nameDesc", "Name — Z to A", (a, b) => b.d.name.localeCompare(a.d.name)],
  ];
  const sortKey = SORTS.some((x) => x[0] === s.sort) ? s.sort : "amt";
  dl.sort(SORTS.find((x) => x[0] === sortKey)[2]);
  const docRow = (o) => {
    const sv = six.map((k) => o.v[k]), dm = Math.max(...sv, 1), de = dlt(o.a, o.pa);
    return {
      id: o.d.id, name: o.d.name, initials: dIni(o.d.name), avBg: avBg(o.d.name), spec: o.d.spec, cat: o.d.cat || "—", city: o.d.city,
      place: "HQ " + hqOfDoc(o.d) + (o.d.city ? " · " + o.d.city : ""), main: inr(o.a), minor: num(o.qa) + " units", delta: P && o.pa ? de.t : "—", dFg: de.fg,
      spark: six.map((k, j) => ({ key: k, h: sv[j] ? Math.max(3, Math.round((sv[j] / dm) * 22)) : 2, c: inR.has(k) ? "#1F4FD8" : "#C9D6F6" })),
    };
  };
  const lim = s.docAll ? dl.length : 12;
  const docs = {
    title: own ? "My doctors" : "Doctors", sub: (CC.pending ? "Loading…" : num(pool.length) + " doctors with support") + " · " + label, q: s.dq,
    rows: dl.slice(0, lim).map((o) => ({ ...docRow(o), open: () => openDrawer({ type: "doc", id: o.d.id }) })), empty: !CC.pending && !dl.length,
    footer: Math.min(lim, dl.length) + " of " + dl.length + (dl.length !== pool.length ? " (filtered from " + pool.length + ")" : ""),
    more: dl.length > 12, moreTxt: s.docAll ? "Show top 12" : "Show all " + dl.length, toggleAll: () => set((x) => ({ docAll: !x.docAll })),
  };
  const tog = (key, v) => () => set((x) => { const cur = x[key]; return { [key]: cur.includes(v) ? cur.filter((z) => z !== v) : cur.concat([v]) }; });
  const fcount = s.fSpec.length + s.fCat.length + s.fHq.length;
  const sorted = sortKey !== "amt";
  /* Sidebar filter: groups down the left, the active group's options on the
     right as a checkbox list. Every filter group is multi-select; "Sort by"
     is the one single choice. Long lists (HQ runs to 90+) get a search. */
  const GROUPS = [
    { id: "sort", title: "Sort by", single: true, sel: [sortKey], opts: SORTS.map(([k, l]) => ({ key: k, label: l, n: "", on: sortKey === k, onClick: () => set({ sort: k }) })) },
    { id: "spec", title: "Specialty", sel: s.fSpec, opts: cnt((o) => o.d.spec).map(([k, n]) => ({ key: k, label: k, n: String(n), on: s.fSpec.includes(k), onClick: tog("fSpec", k) })), clear: () => set({ fSpec: [] }) },
    { id: "cat", title: "Category", sel: s.fCat, opts: cnt((o) => o.d.cat || "—").map(([k, n]) => ({ key: k, label: k, n: String(n), on: s.fCat.includes(k), onClick: tog("fCat", k) })), clear: () => set({ fCat: [] }) },
    { id: "hq", title: "HQ", sel: s.fHq, opts: cnt((o) => hqOfDoc(o.d)).map(([k, n]) => ({ key: k, label: k, n: String(n), on: s.fHq.includes(k), onClick: tog("fHq", k) })), clear: () => set({ fHq: [] }) },
  ];
  const fTab = GROUPS.some((g) => g.id === s.fTab) ? s.fTab : "sort";
  const activeG = GROUPS.find((g) => g.id === fTab);
  const oq = (s.fq || "").trim().toLowerCase();
  const fl = {
    open: s.pop === "filter", toggle: () => set((x) => ({ pop: x.pop === "filter" ? null : "filter", fq: "" })), has: fcount > 0 || sorted,
    count: String(fcount + (sorted ? 1 : 0)), result: dl.length + " doctors",
    bd: fcount ? "#1F4FD8" : "#D0D5DD", bg: fcount ? "#EEF3FF" : "#fff", fg: fcount ? "#1F4FD8" : "#344054",
    clear: () => set({ fSpec: [], fCat: [], fHq: [], sort: "amt", dq: "", fq: "" }),
    tabs: GROUPS.map((g) => ({ id: g.id, title: g.title, on: g.id === fTab, badge: g.single ? (sorted ? "1" : "") : g.sel.length ? String(g.sel.length) : "", onClick: () => set({ fTab: g.id, fq: "" }) })),
    pane: {
      title: activeG.title, single: !!activeG.single, total: activeG.opts.length,
      showSearch: activeG.opts.length > 10, q: s.fq || "", onQ: (e) => set({ fq: e.target.value }),
      opts: oq ? activeG.opts.filter((o) => o.label.toLowerCase().includes(oq)) : activeG.opts,
      picked: activeG.single ? "" : activeG.sel.length ? activeG.sel.length + " selected" : "any",
      clear: activeG.clear || null,
    },
    chips: [].concat(
      sorted ? [{ key: "sort", label: "Sort: " + SORTS.find((x) => x[0] === sortKey)[1], onClick: () => set({ sort: "amt" }) }] : [],
      s.fSpec.map((v) => ({ key: "s" + v, label: v, onClick: tog("fSpec", v) })),
      s.fCat.map((v) => ({ key: "c" + v, label: "Cat " + v, onClick: tog("fCat", v) })),
      s.fHq.map((v) => ({ key: "h" + v, label: "HQ " + v, onClick: tog("fHq", v) })),
    ),
  };

  /* ── Divisions, brands, HQ -- straight off the lines in scope ── */
  const RL = linesOver(scopeKey, scopeSet, R);
  const lineHq = (l) => stripHq(l.hq) || hqOfDoc(DOC[l.d] || {});
  const g = {};
  RL.forEach((l) => { const k = divOf(l.dept) || "OTHER"; const o = (g[k] = g[k] || { q: 0, a: 0 }); o.q += l.q; o.a += l.a; });
  const divs = Object.entries(g).sort((a, b) => b[1].a - a[1].a).map(([k, o]) => { const d = divInfo(k); return { key: k, name: d.name, c: d.c, main: inr(o.a), minor: num(o.q) + " units", pct: pctOf(o.a, CC.a), pctTxt: Math.round(pctOf(o.a, CC.a)) + "%" }; });
  const bm = {};
  RL.forEach((l) => {
    const o = (bm[l.brand] = bm[l.brand] || { q: 0, a: 0, c: divInfo(divOf(l.dept)).c, h: {} });
    o.q += l.q; o.a += l.a;
    const hk = lineHq(l); const hh = (o.h[hk] = o.h[hk] || { q: 0, a: 0 }); hh.q += l.q; hh.a += l.a;
  });
  /* The Brands card pivots: by brand (each opens into its HQ split) or by
     HQ (each opens into its brand split). Same lines, same totals -- only
     which dimension is on top changes. */
  const hb = {};
  RL.forEach((l) => {
    const hk = lineHq(l);
    const o = (hb[hk] = hb[hk] || { q: 0, a: 0, c: "#1F4FD8", h: {} });
    o.q += l.q; o.a += l.a;
    const bb = (o.h[l.brand] = o.h[l.brand] || { q: 0, a: 0, c: divInfo(divOf(l.dept)).c }); bb.q += l.q; bb.a += l.a;
  });
  const bview = s.bview === "hq" ? "hq" : "brand";
  const src = bview === "hq" ? hb : bm;
  const allRows = Object.entries(src).filter((b) => b[1].a > 0 || b[1].q > 0).sort((x, y) => y[1].a - x[1].a || y[1].q - x[1].q);
  const lim0 = own ? 12 : 10;
  // Filling the column (desktop), the card scrolls, so it lists everything.
  const bl = fill || s.bAll ? allRows : allRows.slice(0, lim0);
  const bmx = bl.length && bl[0][1].a ? bl[0][1].a : 1;
  const expKey = (name) => bview + ":" + name;
  const brands = bl.map(([name, o]) => {
    const open = s.bexp === expKey(name), hl = Object.entries(o.h).sort((x, y) => y[1].a - x[1].a || y[1].q - x[1].q), hx = hl.length && hl[0][1].a ? hl[0][1].a : 1;
    return {
      name, c: o.c, main: inr(o.a), minor: num(o.q) + " units", w: (o.a / bmx) * 100, open, rot: open ? 90 : 0,
      toggle: () => set((x) => ({ bexp: x.bexp === expKey(name) ? null : expKey(name) })),
      // Sub-rows keep their own colour in HQ view (the brand's division).
      hqs: hl.map(([n, h]) => ({ name: n, main: inr(h.a), minor: num(h.q) + " u", w: (h.a / hx) * 100, c: bview === "hq" ? h.c : o.c })),
    };
  });
  const bk = {
    view: bview,
    modes: [["brand", "By brand"], ["hq", "By HQ"]].map(([id, l]) => ({ id, label: l, bg: id === bview ? "#fff" : "transparent", fg: id === bview ? "#101828" : "#475467", sh: id === bview ? "0 1px 2px rgba(16,24,40,.12)" : "none", onClick: () => set({ bview: id, bexp: null, bAll: false }) })),
    hint: bview === "hq" ? "Tap an HQ for brand split" : "Tap a brand for HQ split",
    subLabel: bview === "hq" ? "by brand" : "by HQ",
    more: !fill && allRows.length > lim0, moreTxt: s.bAll ? "Show top " + lim0 : "Show all " + allRows.length + (bview === "hq" ? " HQs" : " brands"),
    toggleAll: () => set((x) => ({ bAll: !x.bAll })),
  };

  /* ── Data health (admin) -- every row a fact about the records on file ── */
  const Rm = R.map((i) => months[TL[i].ym]).filter(Boolean);
  const lastMod = Rm.reduce((x, m) => (m.lastModified > x ? m.lastModified : x), "");
  const recs = R.reduce((x, i) => x + (onFile[TL[i].ym] || 0), 0);
  const zeroRate = RL.filter((l) => !l.rate && l.a > 0);
  const zeroItems = [...new Set(zeroRate.map((l) => l.item))];
  const vacLines = RL.filter((l) => nodeOf(l)?.vac);
  const vacSeats = [...new Set(vacLines.map((l) => nodeOf(l).code || nodeOf(l).name))];
  const vacQ = vacLines.reduce((x, l) => x + l.q, 0);
  const vacA = vacLines.reduce((x, l) => x + l.a, 0);
  const truncated = Rm.filter((m) => m.truncated);
  const health = [
    { label: "Last import", note: "latest change to a Doctor Support record in " + label, v: fmtStamp(lastMod), dot: "#16A34A" },
    { label: "Records · " + label, note: R.length > 1 ? "Doctor Support documents, summed across months" : "Doctor Support documents on file", v: num(recs), dot: truncated.length ? "#C4262B" : "#16A34A" },
    { label: "Lines with ₹0 rate", note: zeroItems.length ? zeroItems.slice(0, 2).join(", ") + (zeroItems.length > 2 ? " +" + (zeroItems.length - 2) : "") + " · amount but rate = 0" : "every line with an amount has a rate", v: zeroRate.length ? num(zeroRate.length) + " found" : "none", dot: zeroRate.length ? "#F5A524" : "#16A34A" },
    { label: "Vacant or unheld role profiles", note: vacSeats.length ? vacSeats.slice(0, 2).join(" · ") + (vacSeats.length > 2 ? " +" + (vacSeats.length - 2) : "") + " still carry doctors" : "every line has a person behind it", v: inr(vacA), dot: vacQ ? "#F5A524" : "#16A34A" },
    { label: "Months on file", note: runs.length > 1 ? "gaps between runs have no records" : "one continuous run", v: onFileTxt, dot: "#98A2B3" },
  ];
  if (truncated.length) health.splice(2, 0, { label: "Incomplete months", note: "more records than one request returns", v: truncated.map((m) => m.ym).join(", "), dot: "#C4262B" });

  /* ── Header ── */
  const f0 = selN[0];
  const ctx = {
    initials: isM ? "₹" : ini(f0.name), avBg: isM ? "#101828" : avBg(f0.name), rad: isM ? "14px" : "50%", eyebrow: "Doctor Support · " + label,
    title: selN.length > 1 ? "Team support" : TITLE[f0.role] || "Support",
    sub: isM ? "All India · " + num(CC.n) + " unique doctors · " + divs.filter((d) => d.key !== "OTHER").length + " divisions"
      : selN.length > 1 ? selN.length + " members selected · " + viewer.name + "'s team"
        : f0.name + " · " + roleLabel(f0.role) + (f0.dept ? " · " + f0.dept : "") + (f0.hq ? " · " + (f0.role === "ZSM" || f0.role === "SM" ? f0.hq : "HQ " + f0.hq) : ""),
  };

  /* ── Person popup: a team member's doctors ──
     A centred popup, not the drawer. Picking a doctor in it opens the doctor
     drawer ON TOP, and closing that drawer lands back on this list -- so the
     list never needs a Back button. */
  let pw = { open: false };
  const pn = s.modal ? N.get(s.modal.id) : null;
  if (pn) {
    const pset = subtreeIds(pn);
    const pkey = "P" + pn.id;
    const c = aggOver(pkey, pset, R);
    const list = docsOf(pkey, pset).slice().sort((a, b) => b.a - a.a || b.qa - a.qa);
    const pq = s.pq.trim().toLowerCase();
    const shown = list.filter((o) => !pq || (o.d.name + " " + o.d.id + " " + o.d.city).toLowerCase().includes(pq));
    pw = {
      open: true, title: pn.name, code: roleLabel(pn.role), initials: pn.vac ? "—" : ini(pn.name), avBg: pn.vac ? "#98A2B3" : avBg(pn.name),
      sub: (pn.code ? pn.code + " · " : "") + (pn.dept || "") + (pn.dept ? " · " : "") + label, q: s.pq,
      stats: [{ label: "Value", v: inr(c.a), c: "#101828", fs: "15px" }, { label: "Unique drs", v: num(c.n), c: "#101828", fs: "15px" }, { label: "Products", v: num(c.p), c: "#101828", fs: "15px" }, { label: "Total qty", v: num(c.q), c: "#667085", fs: "13px" }],
      docs: shown.map((o) => ({ ...docRow(o), open: () => openDrawer({ type: "doc", id: o.d.id, pid: pn.id }) })),
      footer: shown.length + " of " + list.length + " doctors",
      empty: !shown.length,
    };
  }

  /* ── Doctor drawer ── */
  let dw = { open: !!s.drawer };
  let dd = {};
  if (s.drawer) {
    {
      const d = DOC[s.drawer.id] || { id: s.drawer.id, name: s.drawer.id, spec: "—", cat: "—", qual: "—", hq: "", city: "" };
      const bset = s.drawer.pid ? subtreeIds(N.get(s.drawer.pid)) : scopeSet;
      const bkey = s.drawer.pid ? "P" + s.drawer.pid : scopeKey;
      const ofDoc = (i) => (avail(i) ? (scoped(bkey, bset, i) || []).filter((l) => l.d === d.id) : []);
      const mq = new Float64Array(TL.length);
      const ma = new Float64Array(TL.length);
      docMonths.forEach((i) => ofDoc(i).forEach((l) => { mq[i] += l.q; ma[i] += l.a; }));
      const q = sumR(mq, R), a = sumR(ma, R), pav = P ? sumR(ma, P) : 0, de = dlt(a, pav), sv = six.map((k) => ma[k]), dm = Math.max(...sv, 1);
      const ds = R.flatMap(ofDoc);
      const pr = {};
      ds.forEach((l) => { const k = l.rp || NO_RP; const o = (pr[k] = pr[k] || { q: 0, a: 0, l }); o.q += l.q; o.a += l.a; });
      const profiles = Object.entries(pr).sort((x, y) => y[1].a - x[1].a).map(([code, o]) => { const nd = nodeOf(o.l), dv = divInfo(divOf(o.l.dept)); return { code, who: (nd ? nd.name : "—") + " · " + dv.name, c: dv.c, main: inr(o.a), minor: num(o.q) + " u" }; });
      const im = {}, bmm = {};
      ds.forEach((l) => {
        const o = (im[l.item] = im[l.item] || { item: l.item, brand: l.brand, qty: 0, amount: 0 }); o.qty += l.q; o.amount += l.a;
        const b = (bmm[l.brand] = bmm[l.brand] || { q: 0, a: 0, c: divInfo(divOf(l.dept)).c }); b.q += l.q; b.a += l.a;
      });
      const items = Object.values(im).filter((i) => i.qty > 0 || i.amount > 0).sort((x, y) => y.amount - x.amount || y.qty - x.qty);
      const bl2 = Object.entries(bmm).filter((b) => b[1].a > 0 || b[1].q > 0).sort((x, y) => y[1].a - x[1].a);
      const bx = bl2.length && bl2[0][1].a ? bl2[0][1].a : 1;
      Object.assign(dw, {
        title: d.name, code: d.id, initials: dIni(d.name), avBg: avBg(d.name),
        sub: [d.spec, d.cat || "—", d.qual || "—", "HQ " + (stripHq(d.hq) || "—"), d.city].filter(Boolean).join(" · "),
        stats: [{ label: "Value", v: a ? inr(a) : "—", c: "#101828", fs: "15px" }, { label: "Qty", v: num(q), c: "#667085", fs: "13px" }, { label: "Items", v: items.length ? String(items.length) : "—", c: "#101828", fs: "15px" }, { label: "Brands", v: bl2.length ? String(bl2.length) : "—", c: "#101828", fs: "15px" }],
      });
      dd = {
        delta: P && pav ? de.t + " " + vs : "", dFg: de.fg,
        months: six.map((k, j) => ({ key: k, label: TL[k].s, v: sv[j] ? inrS(sv[j]) : "—", h: sv[j] ? Math.max(4, Math.round((sv[j] / dm) * 56)) : 2, bg: inR.has(k) ? "#1F4FD8" : "#D6E0FA", lc: inR.has(k) ? "#101828" : "#667085", fw: inR.has(k) ? 600 : 400 })),
        hasProfiles: profiles.length > 0, profiles, hasItems: items.length > 0, itemCount: items.length, brandCount: bl2.length,
        brands: bl2.slice(0, 8).map(([nm, o]) => ({ name: nm, main: inr(o.a), minor: num(o.q) + " u", w: (o.a / bx) * 100, c: o.c })),
        items: (s.allItems ? items : items.slice(0, 10)).map((i) => ({ item: i.item, brand: i.brand, qty: num(i.qty), rate: i.qty ? "₹" + Math.round(i.amount / i.qty) : "", amt: inrF(i.amount) })),
        more: items.length > 10, moreTxt: s.allItems ? "Show top 10" : "Show all " + items.length + " items", toggleAll: () => set((x) => ({ allItems: !x.allItems })),
        note: CC.pending ? "Loading item lines…" : !items.length ? "No item lines for this doctor in " + label + "." : "",
      };
      dd.hasNote = !!dd.note;
    }
  }

  return {
    needed, pending: pendingMain, ctx, sc, pk, kpis, trend, showTeam, team, docs, fl, tabs, vis,
    showHealth: isAdmin && isM && onT("overview"), health, showDivs: divs.length > 1 && onT("overview"), divs, brands,
    bk, brandTitle: bk.view === "hq" ? (own ? "My HQs" : "HQs") : own ? "My brands" : "Brands", pw, dw, dd,
    truncated: truncated.map((m) => { const t = TL.find((x) => x.ym === m.ym); return (t ? t.s + " " + t.y : m.ym) + " (" + num(m.fetched) + " of " + num(m.docs) + " records)"; }),
  };
}
