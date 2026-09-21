"use client";

/**
 * Every number the doctor console draws, as ONE pure function.
 *
 * `buildConsole(data, ui, on)` takes what ERP returned and what the reader has
 * chosen, and returns the finished figures — the totals cards, the coverage
 * rings, the chart series, the department table, the activity feed, the filter
 * label. No fetching, no React, no state.
 *
 * It is a plain function and not a hook for one reason: the five cards are
 * placed SEPARATELY on a page, and the single filter (department, period, value
 * format) only means anything if one thing owns the arithmetic. The session
 * runs this once per change and hands every card the same object, so two cards
 * can never be measured over different windows — which is exactly what would
 * happen if each derived its own.
 *
 * `compact` is deliberately NOT an input. Each card measures its own box now,
 * so anything that depends on width (the chart's label step) is computed by the
 * card that draws it, not here.
 */

import { ROLE_LADDER, ROLE_NAMES } from "./erp";
import {
  MONTHS, fdate, inrShort, makeMoney, monthLabel, monthsSince, now, plural, roiText, sdate, span,
} from "./format";
import {
  UNATTRIBUTED_NOTE, buildTable, computeRoi, coverageByRole, flow, mEnd, mStart,
  monthSeries, monthWindow, resolveRange, sum,
} from "./analytics";
import { TONE } from "../ui/parts";

/**
 * The clock time a note was written, for the line under it.
 *
 * Notes are the one thing on this page a person types by hand, and several
 * land on the same doctor on the same day — so the feed, which groups by day,
 * needs the time to put them in an order a reader can follow. Everything else
 * here is dated by ERP to the day and gets none.
 *
 * An ERP datetime ("2026-09-21 11:02:33") is not what `new Date()` parses on
 * every browser until the space becomes a T. A value that is only a date, or
 * that will not parse, yields nothing rather than a misleading midnight.
 */
function noteTime(raw) {
  const text = String(raw ?? "");
  if (!text.includes(":")) return null;
  const at = new Date(text.replace(" ", "T"));
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export const CHART_W = 600;
export const CHART_H = 184;

/** The period keys the filter actually offers — see `rangeOpts` below. */
/*
 * "all" is valid but is NOT offered in the filter sheet or on the Studio prop --
 * see `rangeOpts`. It stays reachable in code because the doctor card's popup
 * asks for it deliberately: its sections are "last 3" and "last 6 months", so
 * they need a wide window to take the last N from, and a gift from 2024 is
 * exactly what that section is for.
 *
 * It costs nothing to allow. The period is a CLIENT-SIDE filter over rows that
 * are already in hand -- queries.js sends no date filter to ERP, only a
 * doctor and a row limit -- so all-time reads no more than this month does.
 * It was dropped from the presets because it is not a useful VIEW of the page,
 * not because it was slow, and "m6" is what people reached for instead.
 */
export const PERIODS = new Set(["fy", "cur", "last", "m3", "m6", "all"]);

export const READ_NAMES = {
  lead: "the doctor's profile", support: "support", service: "service",
  pobs: "POBs", visits: "visits", addresses: "addresses",
};

export const ALL_CARDS = ["visit", "pob", "support", "note", "service"];

export { UNATTRIBUTED_NOTE };

/**
 * The departments a page asked to open on, however it phrased it.
 *
 * Multi-select, because an SM or a ZSM covers several divisions at once and
 * "one department or all of them" is not a choice they can usefully make. An
 * EMPTY list means all of them — there is no "all" key, because a list that
 * both contains "all" and names two departments has no obvious meaning.
 *
 * Tolerant on purpose: Studio may hand over an array, a single string, a comma
 * list, or rows like { key } — a department is bound from half a dozen shapes
 * across this app and none of them is worth a mapping step.
 */
export function parseDepartments(value) {
  const list = value == null ? [] : (Array.isArray(value) ? value : String(value).split(","));
  const out = [];
  list.forEach((entry) => {
    const key = typeof entry === "string"
      ? entry.trim()
      : String(entry?.key ?? entry?.value ?? entry?.label ?? entry?.division ?? "").trim();
    // "all" is how a page spells the empty list; it is not a department.
    if (key && key.toLowerCase() !== "all" && !out.includes(key)) out.push(key);
  });
  return out;
}

/** The interaction state a session starts with. */
export function initialUi({ department, period, valueFormat } = {}) {
  return {
    divs: parseDepartments(department),
    rangeMode: { mode: PERIODS.has(period) ? period : "fy", from: null, to: null },
    numShort: valueFormat === "short",
    pivotOn: false,
    openRow: null,
    sortIdx: -1,
    sortDir: "desc",
    view: "table",
    kindFilter: "all",
    bannerIdx: 0,
    chartPage: 0,
    hidden: {},
    sel: null,
    hov: null,
    clinicIdx: 0,
    modal: null,
    roleOpen: null,
    pickOpen: false,
    pickStage: "from",
    pickYear: now().getFullYear(),
    noteForm: { body: "" },
    noteSaving: false,
    noteError: null,
    pobOpen: false,
    supportSplit: null,
  };
}

export function buildConsole(data, ui, on) {
  const { doctor, canSeeService, viewer } = data;
  const { divs, rangeMode, numShort } = ui;
  // No departments chosen means every department, not none.
  const allDivs = !divs.length;
  const money = makeMoney(numShort);
  const count = (n) => (n ? String(n) : "—");

  /* ------------------------------------------------------------- scoping */

  /*
   * key -> the fuller "Elbrit Chennai" name. EVERYTHING that displays a
   * division goes through this; everything that groups by one uses the key.
   * Defined up here because the chart pager, the filter summary and the table
   * all need it.
   */
  const divisionLabel = new Map((doctor?.divisions ?? []).map((d) => [d.key, d.label ?? d.key]));
  const divName = (k) => divisionLabel.get(k) ?? k;

  const range = resolveRange(rangeMode);
  const inRange = (r) => r.t >= range.from && r.t <= range.to;
  const byDiv = (rows) => (allDivs ? rows : rows.filter((r) => divs.includes(r.div)));

  /*
   * A visit COUNTS only if it can be placed: a seat on the BE/ABM/RBM/ZSM
   * ladder, and a department to sit under.
   *
   * Filtered here, once, so that every panel agrees. The department table can
   * only ever show a visit that has both -- its rows are departments and its
   * columns are the ladder -- so before this, the table read 23 for DR-7155
   * while the headline and the coverage rings read 25, and nothing on the page
   * explained the other 2.
   *
   * What it drops, and the cost, decided deliberately: an `Admin`-seat event
   * (EV280012 for DR-7155 is a test visit created from an admin login) and a
   * visit whose custom_department is empty in ERP. The second is the one that
   * hurts -- EV272731 is a COMPLETED visit by E00010, a real ZSM, stamped
   * 10:41 on 15 Jul 2026, and it is not counted anywhere on the page now. That
   * is a data gap in ERP, not in this page: fill in that event's department and
   * it reappears on its own.
   *
   * The division is tested against the DOCTOR's own divisions, not merely
   * against "is it set". A visit's div comes from the employee record, and at
   * the top of the ladder that is an HR bucket rather than a sales division:
   * all eight SM holders sit in a department literally called "Sales", which
   * parseDepartment turns into a division named "Sales" that no doctor has. It
   * passed an "is it set" test and was counted in the headline, but the table's
   * rows are the doctor's divisions, so it landed in none of them and the two
   * disagreed by one all over again. Testing against the doctor's own list is
   * what makes the headline equal the sum of the table's rows BY CONSTRUCTION,
   * for every doctor, rather than for the ones we happened to check.
   *
   * To count everything again, delete this filter and give buildTable an
   * "Unassigned" row the way deriveSupport already has one.
   */
  const doctorDivs = new Set((doctor?.divisions ?? []).map((d) => d.key));
  const countable = (v) =>
    ROLE_LADDER.includes(v.role) && doctorDivs.has(v.div);

  const supportAll = byDiv(data.support);
  const serviceAll = byDiv(data.service);
  const pobAll = byDiv(data.pobs);
  const visitAll = byDiv(data.visits.filter(countable));

  const support = supportAll.filter(inRange);
  const service = serviceAll.filter(inRange);
  const pobs = pobAll.filter(inRange);
  const visits = visitAll.filter(inRange);
  const notes = data.notes.filter(inRange);

  const { window: win } = monthWindow([supportAll, serviceAll, pobAll, visitAll], range);
  const everything = [...supportAll, ...serviceAll, ...pobAll, ...visitAll];
  const firstT = everything.length ? Math.min(...everything.map((r) => r.t)) : null;

  /* ----------------------------------------------------------------- ROI */

  const roi = computeRoi(support, service);
  const latestSub = roi.latestService
    ? fdate(roi.latestService.d) + " · " + plural(monthsSince(roi.latestService.t), "mo", "mo")
    : "No service in this view";

  /*
   * SUPPORT is on the strip for EVERYONE; ROI and service are not.
   *
   * The strip used to be all-or-nothing -- a reader below SM got an empty array
   * and therefore no strip at all, which meant a BE saw no headline figure for
   * the doctor they actually work. Support is the doctor's OWN contribution
   * rather than anything the company spends, so there was never a reason to
   * gate it; it was only ever gated by being in the same array as the numbers
   * that are.
   *
   * ROI STAYS GATED, and not out of caution: roi = support / service, so a
   * reader who can see ROI and support can divide one by the other and recover
   * the service figure exactly. Showing "ROI but not service" would hand out
   * the very number the SM-and-above gate exists to withhold.
   */
  const supportStat = {
    l: "Support",
    v: money(roi.supTotal),
    s: support.length
      ? plural(new Set(support.map((r) => r.p)).size, "month booked", "months booked")
      : "none in " + range.label,
    accent: false,
  };

  const stats = !canSeeService ? [supportStat] : [
    {
      l: "ROI till date",
      v: roiText(roi.tillDate),
      s: roi.svcTotal ? money(roi.supTotal) + " on " + money(roi.svcTotal) : "no service yet",
      accent: true,
    },
    { l: "Latest ROI", v: roiText(roi.latest), s: latestSub, accent: true },
    {
      l: "Service",
      v: money(roi.svcTotal),
      s: service.length ? plural(service.length, "service given", "services given") : "none in " + range.label,
      accent: false,
    },
    supportStat,
  ];

  /* --------------------------------------------------------------- chart */

  // The pager walks the departments the filter left in play, opening on their
  // COMBINED line (k: null over the already-filtered rows) so a reader who
  // covers four divisions sees the total first rather than adding four pages up
  // in their head.
  //
  // The one case with no combined page is a reader who picked exactly ONE
  // department: "all of the one thing you chose" and "that thing" are the same
  // page, and showing both is just a pager that does nothing. Choosing NOTHING
  // is different — it still leads with "All departments" even for a doctor who
  // has only one, because that is the page the reader is on and it should say
  // so rather than silently renaming itself to the division.
  const inPlay = allDivs ? (doctor?.divisions ?? []).map((d) => d.key) : divs;
  const pages = divs.length === 1
    ? [{ k: divs[0], label: divName(divs[0]) }]
    : [{ k: null, label: allDivs ? "All departments" : divs.length + " departments" }]
      .concat(inPlay.map((k) => ({ k, label: divName(k) })));
  const pIdx = Math.min(ui.chartPage, pages.length - 1);
  const pageDiv = pages[pIdx]?.k ?? null;

  const months = monthSeries(win, { support: supportAll, service: serviceAll, pob: pobAll, visits: visitAll }, pageDiv);

  const SERIES = [
    { k: "sup", label: "Support", hue: "#1e3a8a" },
    { k: "svc", label: "Service", hue: "#a02019" },
    { k: "pob", label: "POB", hue: "#b45309" },
    { k: "vis", label: "Visits", hue: "#047857" },
  ].filter((x) => canSeeService || x.k !== "svc");

  const shown = SERIES.filter((x) => !ui.hidden[x.k]);
  const lineSeries = shown.filter((x) => x.k !== "vis");
  const visOn = shown.some((x) => x.k === "vis");
  const peak = Math.max(...months.flatMap((r) => lineSeries.map((b) => r[b.k])), 1);

  // The selected month defaults to the last one the period covers, so the
  // read-out agrees with the totals above it instead of always showing today.
  let lastInRange = -1;
  if (range.bounded) {
    months.forEach((r, i) => {
      if (mEnd(r.y, r.m) >= range.from && mStart(r.y, r.m) <= range.to) lastInRange = i;
    });
  }
  const selIdx = ui.sel != null && ui.sel < months.length
    ? ui.sel
    : (lastInRange >= 0 ? lastInRange : months.length - 1);
  const hovIdx = ui.hov != null && ui.hov < months.length ? ui.hov : null;
  const crossIdx = hovIdx != null ? hovIdx : selIdx;
  const crossLeft = months.length ? (((crossIdx + 0.5) / months.length) * 100).toFixed(2) : "0";
  const selMonth = months[selIdx] ?? { label: "—", sup: 0, svc: 0, pob: 0, vis: 0 };

  const lines = lineSeries.map((x) => {
    const vals = months.map((r) => r[x.k]);
    return {
      k: x.k,
      hue: x.hue,
      line: flow(vals, peak, CHART_W, CHART_H).line,
      tops: vals.map((v) => ((CHART_H - (v / peak) * (CHART_H * 0.9)) / CHART_H * 100).toFixed(2)),
    };
  });
  const hovPct = hovIdx != null && months.length ? ((hovIdx + 0.5) / months.length) * 100 : 0;
  const yLabels = [inrShort(peak), inrShort(peak * 0.66), inrShort(peak * 0.33), "0"];

  /* ------------------------------------------------------------ coverage */

  const coverage = coverageByRole(ROLE_LADDER, { visits, service });
  const coverageRows = coverage.map((r) => {
    const touched = r.visits > 0 || r.svc > 0;
    const bits = [];
    if (touched) {
      bits.push(plural(r.heads.size, "person", "people"));
      const dv = [...r.divs].filter(Boolean).join(", ");
      if (dv) bits.push(dv);
      if (r.svc) bits.push(plural(r.svc, "service", "services") + " · " + money(r.svcAmt));
      if (r.lastD) bits.push("last " + fdate(r.lastD));
    } else {
      bits.push("no touch in " + range.label);
    }
    return {
      role: r.role,
      n: String(r.visits),
      unit: r.visits === 1 ? "visit" : "visits",
      has: touched,
      aria: r.role + " — " + bits.join(" · "),
      open: () => on.openRole(r.role),
    };
  });
  const activeRoles = coverageRows.filter((r) => r.has).length;

  const roleEntry = ui.roleOpen ? coverage.find((r) => r.role === ui.roleOpen) : null;
  const roleDetail = !roleEntry ? null : (() => {
    const rows = [...roleEntry.byDiv.values()].sort((a, b) => (b.vis + b.svc) - (a.vis + a.svc));
    const top = Math.max(...rows.map((d) => d.vis + d.svc), 1);
    return {
      role: roleEntry.role,
      name: ROLE_NAMES[roleEntry.role] ?? roleEntry.role,
      scope: range.label,
      visits: String(roleEntry.visits),
      heads: String(roleEntry.heads.size),
      headUnit: roleEntry.heads.size === 1 ? "person" : "people",
      svc: roleEntry.svc ? String(roleEntry.svc) : "—",
      svcAmt: roleEntry.svcAmt ? money(roleEntry.svcAmt) : "—",
      last: roleEntry.lastD ? fdate(roleEntry.lastD) : "—",
      rows: rows.map((d) => ({
        v: d.v,
        vis: String(d.vis),
        svc: d.svc ? plural(d.svc, "service", "services") : "no service",
        amt: d.amt ? money(d.amt) : "—",
        heads: [...d.heads].filter(Boolean).join(", ") || "—",
        last: d.lastD ? fdate(d.lastD) : "—",
        pct: Math.round(((d.vis + d.svc) / top) * 100),
      })),
    };
  })();

  /* --------------------------------------------------------------- table */

  const divisionKeys = inPlay;

  const table = (() => {
    const built = buildTable({
      divisions: divisionKeys, divisionLabel, support, service, pob: pobs, visits, months,
      range, canSeeService, pivotOn: ui.pivotOn, ladder: ROLE_LADDER, money, count,
    });
    // Expanding a department shows its PRODUCT lines — support items from
    // Ecubix and POB lines from the quotation ledger, keyed by product so the
    // same drug lines up across both. Service is a payment, not a product, and
    // a visit is not attached to one either, so those columns stay blank.
    const rows = built.rows.map((r) => {
      const byItem = new Map();
      const touch = (name) => {
        if (!byItem.has(name)) byItem.set(name, { sup: 0, pob: 0 });
        return byItem.get(name);
      };
      support.filter((x) => x.div === r.label).forEach((x) => { touch(x.item).sup += x.amt; });
      pobs.filter((p) => p.div === r.label).forEach((p) => { touch(p.item).pob += p.amt; });

      const items = [...byItem.entries()]
        .sort((a, b) => (b[1].sup + b[1].pob) - (a[1].sup + a[1].pob))
        .map(([label, totals]) => ({
          label,
          cells: built.subs.map((head) => {
            if (head.metric === "support") return { v: totals.sup ? money(totals.sup) : "" };
            if (head.metric !== "pob") return { v: "" };
            if (!head.role) return { v: totals.pob ? money(totals.pob) : "" };
            const roleAmt = pobs
              .filter((p) => p.div === r.label && p.item === label && p.role === head.role)
              .reduce((a, p) => a + p.amt, 0);
            return { v: roleAmt ? money(roleAmt) : "" };
          }),
        }));
      return { ...r, items };
    });
    let ordered = rows;
    if (ui.sortIdx >= 0 && ui.sortIdx < built.subs.length) {
      const dir = ui.sortDir === "asc" ? 1 : -1;
      ordered = rows.slice().sort((a, b) => (((a.cells[ui.sortIdx]?.n ?? 0) - (b.cells[ui.sortIdx]?.n ?? 0)) * dir));
    }
    return { ...built, rows: ordered, scope: range.label };
  })();

  /* ------------------------------------------------------------ timeline */

  const feed = (() => {
    const out = [];
    // One card per support MONTH, not per product line — a doctor with twenty
    // items would otherwise bury every other kind of row. The month products
    // ride along so the card can open its split.
    const byMonth = new Map();
    support.forEach((r) => {
      const entry = byMonth.get(r.parent) ?? {
        k: "support", id: "sup-" + r.parent, t: r.t, d: r.d, div: "",
        title: "Support for " + r.p, amt: 0, qty: 0, period: r.p, items: [], divs: new Set(),
      };
      entry.amt += r.amt;
      entry.qty += r.qty;
      entry.items.push(r);
      if (r.div) entry.divs.add(r.div);
      byMonth.set(r.parent, entry);
    });
    byMonth.forEach((entry) => out.push({
      ...entry,
      div: entry.divs.size === 1 ? [...entry.divs][0] : "",
      meta: entry.qty.toLocaleString("en-IN") + " units · "
        + plural(entry.items.length, "product", "products")
        + (entry.divs.size > 1 ? " · " + [...entry.divs].join(", ") : "")
        + " · booked " + fdate(entry.d),
    }));
    if (canSeeService) service.forEach((r) => out.push({
      k: "service", id: "svc-" + r.id, t: r.t, d: r.d, div: r.div,
      title: r.kind, amt: r.amt,
      meta: [r.by, r.role, r.ref].filter(Boolean).join(" · "),
    }));
    pobs.forEach((r) => out.push({
      k: "pob", id: "pob-" + (r.id ?? r.quotation), t: r.t, d: r.d, div: r.div,
      title: r.item, amt: r.amt,
      meta: "Qty " + r.qty + " · " + r.chemist + (r.by ? " · " + r.by : ""),
    }));
    visits.forEach((r) => out.push({
      k: "visit", id: "vis-" + r.id, t: r.t, d: r.d, div: r.div,
      title: r.subject, amt: null,
      meta: [r.who, r.role, r.hq].filter(Boolean).join(" · "),
      flag: r.made ? (r.forced ? "Force visit" : null)
        : r.attendanceKnown ? "Planned — not marked as made" : null,
    }));
    notes.forEach((r) => out.push({
      k: "note", id: "note-" + r.id, t: r.t, d: r.d, div: r.tag === "Note" ? "" : r.tag,
      title: r.title, amt: null,
      // WHO and WHEN lead the meta line — a note nobody can be traced back to
      // is not much of a record. The time is worth the characters because
      // several notes land on one doctor on one day and the feed groups by day,
      // so the date alone does not order them for a reader.
      meta: [r.by, noteTime(r.at), r.body !== r.title ? r.body : null]
        .filter(Boolean).join(" · "),
    }));
    return out.sort((a, b) => b.t - a.t);
  })();

  const feedShown = ui.kindFilter === "all" ? feed : feed.filter((e) => e.k === ui.kindFilter);
  const feedGroups = (() => {
    const groups = [];
    feedShown.forEach((e) => {
      const x = new Date(e.t);
      const label = MONTHS[x.getMonth()] + " " + x.getFullYear();
      let g = groups[groups.length - 1];
      if (!g || g.label !== label) { g = { label, count: 0, items: [] }; groups.push(g); }
      g.count += 1;
      const tone = TONE[e.k];
      g.items.push({
        id: e.id, kind: tone.label, when: fdate(e.d), title: e.title, meta: e.meta,
        amt: e.amt != null ? money(e.amt) : "", div: e.div, flag: e.flag ?? null,
        fg: tone.hue, bg: tone.tint, bd: tone.bd,
        onSplit: e.items?.length ? () => on.openSupportSplit(e) : null,
      });
    });
    return groups;
  })();

  const filterDefs = ["all", "pob", "support", ...(canSeeService ? ["service"] : []), "visit", "note"];
  const filters = filterDefs.map((k) => ({
    k,
    label: (k === "all" ? "All" : TONE[k].label) + " "
      + (k === "all" ? feed.length : feed.filter((e) => e.k === k).length),
    on: ui.kindFilter === k,
    pick: () => on.setKindFilter(k),
  }));

  /* --------------------------------------------------------------- cards */

  const last3 = (rows, map) => rows.slice(0, 3).map(map);
  const bannerOrder = ["visit", "pob", "support", "note", ...(canSeeService ? ["service"] : [])];
  const cards = (() => {
    const totals = { support: support.length, service: service.length, pob: pobs.length, visit: visits.length, note: notes.length };
    const noun = { support: "support rows", service: "services", pob: "POB lines", visit: "visits", note: "notes" };
    const make = (k, value, sub, items) => ({
      value, sub, items,
      itemsLabel: "Last 3 " + (k === "visit" ? "visits" : k === "note" ? "notes" : k === "pob" ? "POB lines" : k === "support" ? "support months" : "services"),
      shownOf: Math.min(3, totals[k]) + " of " + totals[k] + " " + noun[k],
      open: () => on.jumpTo(k),
    });
    const made = visits.filter((v) => v.made).length;
    return {
      scope: range.label,
      support: make("support", money(roi.supTotal),
        support.length ? plural(new Set(support.map((r) => r.p)).size, "month booked", "months booked") : "nothing booked",
        last3(support, (r) => ({ a: r.p.replace(" 20", " "), c: r.div, b: money(r.amt), full: r.p + " · " + r.item + " · " + r.qty.toLocaleString("en-IN") + " units · " + money(r.amt) }))),
      service: make("service", roi.svcTotal ? money(roi.svcTotal) : "—",
        service.length ? plural(service.length, "service given", "services given") : "none given",
        last3(service, (r) => ({ a: sdate(r.d), c: r.role ?? r.div, b: money(r.amt), full: fdate(r.d) + " · " + r.kind + " · " + (r.by ?? "") + " · " + money(r.amt) }))),
      pob: make("pob", sum(pobs) ? money(sum(pobs)) : "—",
        pobs.length ? plural(pobs.length, "line tagged", "lines tagged") : "none tagged",
        last3(pobs, (r) => ({ a: sdate(r.d), c: r.role ?? r.div, b: money(r.amt), full: fdate(r.d) + " · " + r.item + " · qty " + r.qty + " · " + r.chemist }))),
      visit: make("visit", String(visits.length),
        visits.length
          ? (visits.some((v) => !v.attendanceKnown) || made === visits.length
            ? "last " + fdate(visits[0].d)
            : made + " made · " + (visits.length - made) + " planned")
          : "none logged",
        last3(visits, (r) => ({ a: sdate(r.d), c: r.role ?? "—", b: r.div, full: fdate(r.d) + " · " + r.who + " · " + r.subject }))),
      note: make("note", String(notes.length),
        notes.length ? "last " + fdate(notes[0].d) : "none written",
        last3(notes, (r) => ({ a: sdate(r.d), c: r.tag, b: r.title.split(" ").slice(0, 2).join(" "), full: fdate(r.d) + " · " + r.title }))),
    };
  })();

  /* -------------------------------------------------------------- period */

  const rangeOpts = [
    { k: "fy", label: range.fyLabel },
    { k: "cur", label: "This month" },
    { k: "last", label: "Last month" },
    { k: "m3", label: "3 months" },
    { k: "m6", label: "Last 6 months" },
  ].map((o) => ({ ...o, on: rangeMode.mode === o.k }));

  const ny = now().getFullYear();
  const nm = now().getMonth();
  const picker = {
    open: ui.pickOpen,
    toggle: on.togglePicker,
    year: String(ui.pickYear),
    prevYear: () => on.setPickYear(Math.max(ui.pickYear - 1, ny - 5)),
    nextYear: () => on.setPickYear(Math.min(ui.pickYear + 1, ny)),
    label: rangeMode.from && rangeMode.to
      ? (() => {
        const a = rangeMode.from.split("-").map(Number);
        const b = rangeMode.to.split("-").map(Number);
        return monthLabel(a[0], a[1] - 1) + " → " + monthLabel(b[0], b[1] - 1);
      })()
      : "Pick a range",
    count: rangeMode.from && rangeMode.to
      ? (() => {
        const a = rangeMode.from.split("-").map(Number);
        const b = rangeMode.to.split("-").map(Number);
        const n = (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1;
        return plural(n, "month", "months");
      })()
      : "",
    hint: ui.pickStage === "from" ? "Tap the first month" : "Now tap the last month",
    pick: on.pickMonth,
    cells: MONTHS.map((mn, i) => {
      const k = ui.pickYear + "-" + String(i + 1).padStart(2, "0");
      const future = ui.pickYear > ny || (ui.pickYear === ny && i > nm);
      const edge = k === rangeMode.from || k === rangeMode.to;
      const band = !!rangeMode.from && !!rangeMode.to && k > rangeMode.from && k < rangeMode.to;
      return { label: mn, k, edge: edge && !future, band: band && !edge && !future, off: future };
    }),
  };

  /* ------------------------------------------------------------- notices */

  const named = (source) => Object.keys(source ?? {}).filter((k) => source[k]).map((k) => READ_NAMES[k] ?? k);
  const failed = named(data.errors);
  const refused = named(data.denied);
  // One name reads better than "1 dept"; past that, the count does — four
  // division names do not fit on the filter button at phone width.
  const deptLabel = allDivs ? "All depts" : divs.length === 1 ? divName(divs[0]) : divs.length + " depts";
  const filterLabel = deptLabel + " · " + range.label;
  const filterOn = !allDivs || rangeMode.mode !== "fy";

  const heroSince = firstT ? monthLabel(new Date(firstT).getFullYear(), new Date(firstT).getMonth()) : null;
  const heroAge = firstT ? span(monthsSince(firstT)) : null;
  const heroRoiTill = roiText(roi.tillDate);
  const coverageNote = activeRoles + " of " + coverageRows.length + " roles active · "
    + plural(visits.length, "visit", "visits");

  return {
    // identity + status
    doctor, doctorId: data.doctorId, viewer, canSeeService, scoped: data.scoped,
    loading: data.loading, ready: data.ready, fatal: data.fatal,
    errors: data.errors, denied: data.denied, endpoint: data.endpoint,
    failed, refused, scope: data.scope,
    // scoped + filtered rows
    support, service, pobs, visits, notes,
    clinics: data.clinics, pharmacies: data.pharmacies,
    // derived
    range, roi, stats, months, coverageRows, activeRoles, table, roleDetail,
    filters, feedGroups, feedShown, cards, bannerOrder, firstT,
    money, count, filterLabel, filterOn, rangeOpts, picker,
    heroSince, heroAge, heroRoiTill, coverageNote,
    divisions: [
      { key: "all", label: "All", on: allDivs },
      ...(doctor?.divisions ?? []).map((d) => ({ key: d.key, label: d.label ?? d.key, on: divs.includes(d.key) })),
    ],
    deptLabel,
    // chart
    chart: {
      pages, pIdx, pageDiv, lines, peak, selIdx, hovIdx, crossIdx, crossLeft,
      selMonth, SERIES, shown, visOn, hovPct, yLabels,
    },
    // what the reader has chosen, and everything that changes it
    ui, on,
  };
}
