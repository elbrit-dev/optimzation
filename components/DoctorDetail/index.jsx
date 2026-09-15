"use client";

/**
 * The doctor page, as approved by management in September 2026.
 *
 * One page, no tabs: hero card, a swipeable strip of totals, coverage by role,
 * the monthly trend, and one panel that switches between the department table
 * and the activity timeline. Everything below the hero answers to a single
 * filter — department, value format and period — so two numbers on the page can
 * never be measured over different windows.
 *
 * WHAT IS BOUND: the doctor, and the signed-in user's ERP credential. Nothing
 * else. Who is reading, what they may see, which departments exist, who covers
 * them — all of that is read from ERP with that credential, which is the point:
 * several reps share a doctor, and ERP's own permissions are what keep one of
 * them out of another's rows.
 *
 * EVERY FIGURE IS ATTRIBUTED. Support's department, role profile and product
 * breakdown live on `Doctor Support`'s item child table (not on the parent row,
 * which is what makes a list read look bare); service carries its own
 * department and role; POBs and visits get theirs from the employee who raised
 * them. So the department filter, the chart's pager and the table's rows all
 * count the same way. The only thing that ever lands in Unassigned is a month
 * Ecubix sent as a total with no products behind it.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import styles from "./styles";
import useContainerMode from "./lib/useContainerMode";
import { useDoctorData } from "./lib/useDoctorData";
import { appendLeadNote, ROLE_LADDER, ROLE_NAMES } from "./lib/erp";
import {
  MONTHS, fdate, inrShort, makeMoney, monthLabel, monthsSince, now, plural, roiText, sdate, span,
} from "./lib/format";
import {
  UNATTRIBUTED_NOTE, buildTable, computeRoi, coverageByRole, flow, mEnd, mStart,
  monthSeries, monthWindow, resolveRange, sum,
} from "./lib/analytics";

import Hero from "./ui/Hero";
import Banner from "./ui/Banner";
import Coverage from "./ui/Coverage";
import Trend from "./ui/Trend";
import DataTable from "./ui/DataTable";
import Activity from "./ui/Activity";
import { FilterModal, MapModal, NoteModal, PharmacyModal, RoleDetailModal, SupportItemsModal } from "./ui/Modals";
import { Icon, TONE } from "./ui/parts";

// The POB capture drags in the calendar's form kit, its ERP services and the
// item master. The page renders fine without any of it, so it arrives the first
// time somebody presses Add POB.
const DoctorPobDialog = dynamic(() => import("../DoctorPobDialog"), { ssr: false });

const CHART_W = 600;
const CHART_H = 184;

export default function DoctorDetail({
  doctor: doctorProp,
  erpUrl,
  authToken,
  erpTarget,
  onBack,
  onAddClinic,
  onAddPharmacy,
  onRequestService,
  onPobSaved,
  className = "",
  style,
}) {
  const [wrapRef, compact] = useContainerMode(720);
  const panelRef = useRef(null);

  const [div, setDiv] = useState("all");
  const [rangeMode, setRangeMode] = useState({ mode: "fy", from: null, to: null });
  const [numShort, setNumShort] = useState(false);
  const [pivotOn, setPivotOn] = useState(false);
  const [openRow, setOpenRow] = useState(null);
  const [sortIdx, setSortIdx] = useState(-1);
  const [sortDir, setSortDir] = useState("desc");
  const [view, setView] = useState("table");
  const [kindFilter, setKindFilter] = useState("all");
  const [bannerIdx, setBannerIdx] = useState(0);
  const [chartPage, setChartPage] = useState(0);
  const [hidden, setHidden] = useState({});
  const [sel, setSel] = useState(null);
  const [hov, setHov] = useState(null);
  const [clinicIdx, setClinicIdx] = useState(0);
  const [modal, setModal] = useState(null);
  const [roleOpen, setRoleOpen] = useState(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickStage, setPickStage] = useState("from");
  const [pickYear, setPickYear] = useState(now().getFullYear());
  const [noteForm, setNoteForm] = useState({ subject: "", body: "", tag: "Note" });
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState(null);
  const [pobOpen, setPobOpen] = useState(false);
  const [supportSplit, setSupportSplit] = useState(null);

  const data = useDoctorData(doctorProp, { erpUrl, authToken, erpTarget });
  const { doctor, canSeeService, viewer } = data;
  const money = useMemo(() => makeMoney(numShort), [numShort]);
  const count = (n) => (n ? String(n) : "—");

  /* ------------------------------------------------------------- scoping */

  const range = useMemo(() => resolveRange(rangeMode), [rangeMode]);
  const inRange = useCallback((r) => r.t >= range.from && r.t <= range.to, [range]);
  const byDiv = useCallback((rows) => (div === "all" ? rows : rows.filter((r) => r.div === div)), [div]);

  const supportAll = useMemo(() => byDiv(data.support), [byDiv, data.support]);
  const serviceAll = useMemo(() => byDiv(data.service), [byDiv, data.service]);
  const pobAll = useMemo(() => byDiv(data.pobs), [byDiv, data.pobs]);
  const visitAll = useMemo(() => byDiv(data.visits), [byDiv, data.visits]);

  const support = useMemo(() => supportAll.filter(inRange), [supportAll, inRange]);
  const service = useMemo(() => serviceAll.filter(inRange), [serviceAll, inRange]);
  const pobs = useMemo(() => pobAll.filter(inRange), [pobAll, inRange]);
  const visits = useMemo(() => visitAll.filter(inRange), [visitAll, inRange]);
  const notes = useMemo(() => data.notes.filter(inRange), [data.notes, inRange]);

  const { window: win } = useMemo(
    () => monthWindow([supportAll, serviceAll, pobAll, visitAll]),
    [supportAll, serviceAll, pobAll, visitAll]
  );
  const firstT = useMemo(() => {
    const all = [...supportAll, ...serviceAll, ...pobAll, ...visitAll];
    return all.length ? Math.min(...all.map((r) => r.t)) : null;
  }, [supportAll, serviceAll, pobAll, visitAll]);

  /* ----------------------------------------------------------------- ROI */

  const roi = useMemo(() => computeRoi(support, service), [support, service]);
  const latestSub = roi.latestService
    ? fdate(roi.latestService.d) + " · " + plural(monthsSince(roi.latestService.t), "mo", "mo")
    : "No service in this view";

  const stats = useMemo(() => {
    if (!canSeeService) return [];
    return [
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
    ];
  }, [canSeeService, roi, money, latestSub, service.length, range.label]);

  /* --------------------------------------------------------------- chart */

  const pages = useMemo(() => (
    div === "all"
      ? [{ k: null, label: "All departments" }].concat(doctor?.divisions?.map((d) => ({ k: d.key, label: d.key })) ?? [])
      : [{ k: div, label: div }]
  ), [div, doctor]);
  const pIdx = Math.min(chartPage, pages.length - 1);
  const pageDiv = pages[pIdx]?.k ?? null;

  const months = useMemo(
    () => monthSeries(win, { support: supportAll, service: serviceAll, pob: pobAll, visits: visitAll }, pageDiv),
    [win, supportAll, serviceAll, pobAll, visitAll, pageDiv]
  );

  const SERIES = useMemo(() => ([
    { k: "sup", label: "Support", hue: "#1e3a8a" },
    { k: "svc", label: "Service", hue: "#a02019" },
    { k: "pob", label: "POB", hue: "#b45309" },
    { k: "vis", label: "Visits", hue: "#047857" },
  ].filter((x) => canSeeService || x.k !== "svc")), [canSeeService]);

  const shown = SERIES.filter((x) => !hidden[x.k]);
  const lineSeries = shown.filter((x) => x.k !== "vis");
  const visOn = shown.some((x) => x.k === "vis");
  const peak = Math.max(...months.flatMap((r) => lineSeries.map((b) => r[b.k])), 1);

  // The selected month defaults to the last one the period covers, so the
  // read-out agrees with the totals above it instead of always showing today.
  const lastInRange = useMemo(() => {
    let idx = -1;
    if (range.bounded) months.forEach((r, i) => { if (mEnd(r.y, r.m) >= range.from && mStart(r.y, r.m) <= range.to) idx = i; });
    return idx;
  }, [months, range]);
  const selIdx = sel != null && sel < months.length ? sel : (lastInRange >= 0 ? lastInRange : months.length - 1);
  const hovIdx = hov != null && hov < months.length ? hov : null;
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
  const lblStep = compact ? 2 : 1;
  const cols = months.map((r, i) => ({
    short: r.short,
    on: i === selIdx,
    showLabel: i % lblStep === 0 || i === selIdx,
    visOn: visOn && r.vis > 0,
    visSize: (r.vis >= 3 ? 11 : r.vis === 2 ? 9 : 7) + "px",
    aria: r.label + " — support " + (r.sup ? money(r.sup) : "none")
      + (canSeeService ? ", service " + (r.svc ? money(r.svc) : "none") : "")
      + ", POB " + (r.pob ? money(r.pob) : "none")
      + ", " + plural(r.vis, "visit", "visits"),
  }));
  const hovPct = hovIdx != null && months.length ? ((hovIdx + 0.5) / months.length) * 100 : 0;

  /* ------------------------------------------------------------ coverage */

  const coverage = useMemo(
    () => coverageByRole(ROLE_LADDER, { visits, service }),
    [visits, service]
  );
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
      open: () => setRoleOpen(r.role),
    };
  });
  const activeRoles = coverageRows.filter((r) => r.has).length;

  const roleDetail = useMemo(() => {
    const entry = roleOpen ? coverage.find((r) => r.role === roleOpen) : null;
    if (!entry) return null;
    const rows = [...entry.byDiv.values()].sort((a, b) => (b.vis + b.svc) - (a.vis + a.svc));
    const top = Math.max(...rows.map((d) => d.vis + d.svc), 1);
    return {
      role: entry.role,
      name: ROLE_NAMES[entry.role] ?? entry.role,
      scope: range.label,
      visits: String(entry.visits),
      heads: String(entry.heads.size),
      headUnit: entry.heads.size === 1 ? "person" : "people",
      svc: entry.svc ? String(entry.svc) : "—",
      svcAmt: entry.svcAmt ? money(entry.svcAmt) : "—",
      last: entry.lastD ? fdate(entry.lastD) : "—",
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
  }, [roleOpen, coverage, range.label, money]);

  /* --------------------------------------------------------------- table */

  const divisionKeys = useMemo(
    () => (div === "all" ? (doctor?.divisions ?? []).map((d) => d.key) : [div]),
    [div, doctor]
  );

  const table = useMemo(() => {
    const built = buildTable({
      divisions: divisionKeys, support, service, pob: pobs, visits, months,
      range, canSeeService, pivotOn, ladder: ROLE_LADDER, money, count,
    });
    // Expanding a department shows its PRODUCT lines — support items from
    // Ecubix and POB lines from the quotation ledger, keyed by product so the
    // same drug lines up across both. Service is a payment, not a product, and
    // a visit is not attached to one either, so those columns stay blank.
    const rows = built.rows.map((r) => {
      const lines = new Map();
      const touch = (name) => {
        if (!lines.has(name)) lines.set(name, { sup: 0, pob: 0 });
        return lines.get(name);
      };
      support.filter((x) => x.div === r.label).forEach((x) => { touch(x.item).sup += x.amt; });
      pobs.filter((p) => p.div === r.label).forEach((p) => { touch(p.item).pob += p.amt; });

      const items = [...lines.entries()]
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
    if (sortIdx >= 0 && sortIdx < built.subs.length) {
      const dir = sortDir === "asc" ? 1 : -1;
      ordered = rows.slice().sort((a, b) => (((a.cells[sortIdx]?.n ?? 0) - (b.cells[sortIdx]?.n ?? 0)) * dir));
    }
    return { ...built, rows: ordered, scope: range.label };
  }, [divisionKeys, support, service, pobs, visits, months, range, canSeeService, pivotOn, money, sortIdx, sortDir]);

  /* ------------------------------------------------------------ timeline */

  const jumpTo = useCallback((kind) => {
    setView("activity");
    setKindFilter(kind);
    setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      let p = el.parentElement;
      while (p && p.scrollHeight <= p.clientHeight + 4) p = p.parentElement;
      const top = el.getBoundingClientRect().top;
      if (p && p !== document.documentElement && p !== document.body) {
        p.scrollTo({ top: p.scrollTop + top - p.getBoundingClientRect().top - 10, behavior: "smooth" });
      } else {
        window.scrollTo({ top: window.scrollY + top - 10, behavior: "smooth" });
      }
    }, 40);
  }, []);

  const feed = useMemo(() => {
    const out = [];
    // One card per support MONTH, not per product line — a doctor with twenty
    // items would otherwise bury every other kind of row. The month's products
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
      k: "note", id: "note-" + r.id, t: r.t, d: r.d, div: "",
      title: r.title, amt: null,
      meta: [r.by, r.body !== r.title ? r.body : null].filter(Boolean).join(" · "),
    }));
    return out.sort((a, b) => b.t - a.t);
  }, [support, service, pobs, visits, notes, canSeeService]);

  const feedShown = kindFilter === "all" ? feed : feed.filter((e) => e.k === kindFilter);
  const feedGroups = useMemo(() => {
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
        onSplit: e.items?.length ? () => setSupportSplit(e) : null,
      });
    });
    return groups;
  }, [feedShown, money]);

  const filterDefs = ["all", "pob", "support", ...(canSeeService ? ["service"] : []), "visit", "note"];
  const filters = filterDefs.map((k) => ({
    k,
    label: (k === "all" ? "All" : TONE[k].label) + " "
      + (k === "all" ? feed.length : feed.filter((e) => e.k === k).length),
    on: kindFilter === k,
    pick: () => setKindFilter(k),
  }));

  /* ---------------------------------------------------------------- cards */

  const last3 = (rows, map) => rows.slice(0, 3).map(map);
  const bannerOrder = ["visit", "pob", "support", "note", ...(canSeeService ? ["service"] : [])];
  const cards = useMemo(() => {
    const totals = { support: support.length, service: service.length, pob: pobs.length, visit: visits.length, note: notes.length };
    const noun = { support: "support rows", service: "services", pob: "POB lines", visit: "visits", note: "notes" };
    const make = (k, value, sub, items) => ({
      value, sub, items,
      itemsLabel: "Last 3 " + (k === "visit" ? "visits" : k === "note" ? "notes" : k === "pob" ? "POB lines" : k === "support" ? "support months" : "services"),
      shownOf: Math.min(3, totals[k]) + " of " + totals[k] + " " + noun[k],
      open: () => jumpTo(k),
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
  }, [support, service, pobs, visits, notes, roi, money, range.label, jumpTo]);

  /* -------------------------------------------------------------- period */

  const rangeOpts = [
    { k: "fy", label: range.fyLabel },
    { k: "cur", label: "This month" },
    { k: "last", label: "Last month" },
    { k: "m3", label: "3 months" },
    { k: "all", label: "All time" },
  ].map((o) => ({ ...o, on: rangeMode.mode === o.k }));

  const pickMonth = (key) => {
    setSel(null);
    setRangeMode((r) => {
      if (pickStage === "from") { setPickStage("to"); return { mode: "custom", from: key, to: key }; }
      setPickStage("from");
      let from = r.from;
      let to = key;
      if (key < from) { from = key; to = r.from; }
      return { mode: "custom", from, to };
    });
  };

  const ny = now().getFullYear();
  const nm = now().getMonth();
  const picker = {
    open: pickOpen,
    toggle: () => { setPickOpen((v) => !v); setPickStage("from"); },
    year: String(pickYear),
    prevYear: () => setPickYear((y) => Math.max(y - 1, ny - 5)),
    nextYear: () => setPickYear((y) => Math.min(y + 1, ny)),
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
    hint: pickStage === "from" ? "Tap the first month" : "Now tap the last month",
    pick: pickMonth,
    cells: MONTHS.map((mn, i) => {
      const k = pickYear + "-" + String(i + 1).padStart(2, "0");
      const future = pickYear > ny || (pickYear === ny && i > nm);
      const edge = k === rangeMode.from || k === rangeMode.to;
      const band = !!rangeMode.from && !!rangeMode.to && k > rangeMode.from && k < rangeMode.to;
      return { label: mn, k, edge: edge && !future, band: band && !edge && !future, off: future };
    }),
  };

  /* --------------------------------------------------------------- notes */

  const setNoteField = (key, value) => setNoteForm((f) => ({ ...f, [key]: value }));
  const saveNote = async () => {
    setNoteSaving(true);
    setNoteError(null);
    try {
      await appendLeadNote(data.doctorId, { ...noteForm, author: viewer?.email });
      setNoteForm({ subject: "", body: "", tag: "Note" });
      setModal(null);
      data.refresh();
    } catch (error) {
      setNoteError(error?.message ?? "Could not save the note.");
    } finally {
      setNoteSaving(false);
    }
  };

  /* -------------------------------------------------------------- render */

  if (!data.doctorId) {
    return (
      <div className={"dx-root " + className} style={style} ref={wrapRef}>
        <style>{styles}</style>
        <div className="dx-empty">Bind a doctor — a Lead id such as DR-47718, or the row from the list.</div>
      </div>
    );
  }

  const READ_NAMES = {
    lead: "the doctor's profile", support: "support", service: "service",
    pobs: "POBs", visits: "visits", addresses: "addresses",
  };
  const named = (source) => Object.keys(source ?? {}).filter((k) => source[k]).map((k) => READ_NAMES[k] ?? k);
  const failed = named(data.errors);
  const refused = named(data.denied);
  const filterLabel = (div === "all" ? "All depts" : div) + " · " + range.label;
  const filterOn = div !== "all" || rangeMode.mode !== "fy";

  return (
    <div
      ref={wrapRef}
      className={"dx-root" + (compact ? " dx-root--compact" : "") + (className ? " " + className : "")}
      style={style}
    >
      <style>{styles}</style>

      <div className="dx-crumbs">
        {onBack ? (
          <button type="button" className="dx-crumb-btn" onClick={() => onBack({ doctor: data.doctor, code: data.doctorId })}>
            Doctor lists
          </button>
        ) : <span>Doctor lists</span>}
        <span className="dx-sep">▸</span>
        <span className="dx-here">{doctor?.name ?? data.doctorId}</span>
      </div>

      {data.fatal ? <div className="dx-warn" role="alert"><span>{data.fatal}</span></div> : null}

      {data.scope === "shared" ? (
        <div className="dx-warn" role="status">
          <span>
            Reading with the shared service credential, not your own — figures are not narrowed to what you may see.
            Bind the signed-in user&apos;s ERP token on this page.
          </span>
        </div>
      ) : null}

      <Hero
        doctor={doctor}
        compact={compact}
        loading={data.loading}
        since={firstT ? monthLabel(new Date(firstT).getFullYear(), new Date(firstT).getMonth()) : null}
        age={firstT ? span(monthsSince(firstT)) : null}
        roiTill={roiText(roi.tillDate)}
        canSeeService={canSeeService}
        stats={stats}
        clinics={data.clinics}
        clinicIndex={Math.min(clinicIdx, Math.max(0, data.clinics.length - 1))}
        onPickClinic={setClinicIdx}
        onAddClinic={onAddClinic ? () => onAddClinic({ doctor: data.doctor, code: data.doctorId }) : undefined}
        onOpenMap={() => setModal("map")}
        pharmacyCount={data.pharmacies.length}
        onOpenRx={() => setModal("rx")}
        onAddPob={() => setPobOpen(true)}
        onAddNote={() => { setNoteError(null); setModal("note"); }}
        onRequestService={onRequestService ? () => onRequestService({ doctor: data.doctor, code: data.doctorId }) : undefined}
      />

      <Banner order={bannerOrder} cards={cards} index={bannerIdx} onIndex={setBannerIdx} compact={compact} />

      <div className="dx-strip">
        <div className="dx-strip-who">
          <span className="dx-pill">
            Signed in as {viewer?.role ?? (data.loading ? "…" : "unknown role")}
          </span>
          {!canSeeService ? <span className="dx-strip-note">service figures hidden at this level</span> : null}
        </div>
        <div className="dx-spring" />
        <button
          type="button"
          className={"dx-filter-btn" + (filterOn ? " dx-filter-btn--on" : "")}
          onClick={() => setModal("filter")}
        >
          {Icon.filter({ size: 14, w: filterOn ? 2.2 : 2 })}
          Filter
          <i />
          <b>{filterLabel}</b>
          {filterOn ? <i className="dx-flag" /> : null}
        </button>
      </div>

      {refused.length ? (
        <div className="dx-warn" role="status">
          <span>
            Your ERP role cannot read {refused.join(", ")} for this doctor, so it is left out.
            Everything else on the page is real. Ask MIS if you should have access — retrying will not help.
          </span>
        </div>
      ) : null}

      {failed.length ? (
        <div className="dx-warn" role="status">
          <span>Couldn’t load {failed.join(", ")}. Everything else on the page is still real.</span>
          <button type="button" onClick={data.refresh}>Retry</button>
        </div>
      ) : null}

      <div className="dx-stack">
        <Coverage
          rows={coverageRows}
          note={activeRoles + " of " + coverageRows.length + " roles active · " + plural(visits.length, "visit", "visits")}
        />

        <section ref={panelRef} className="dx-panel dx-panel--flush">
          <Trend
            readLabel={selMonth.label}
            page={{
              label: pages[pIdx]?.label ?? "All departments",
              many: pages.length > 1,
              prev: () => { setChartPage((p) => (p - 1 + pages.length) % pages.length); setSel(null); setHov(null); },
              next: () => { setChartPage((p) => (p + 1) % pages.length); setSel(null); setHov(null); },
            }}
            cols={cols}
            // Always short form: the axis column is 44px and ₹1,24,300 does not fit.
            yLabels={[inrShort(peak), inrShort(peak * 0.66), inrShort(peak * 0.33), "0"]}
            lines={lines}
            markers={lines.map((l) => ({ k: l.k, hue: l.hue, top: l.tops[crossIdx] ?? 0 }))}
            crossLeft={crossLeft}
            series={SERIES.map((x) => ({
              k: x.k,
              label: x.label,
              hue: x.hue,
              on: !hidden[x.k],
              value: x.k === "vis" ? String(selMonth.vis) : (selMonth[x.k] ? money(selMonth[x.k]) : "—"),
              toggle: () => setHidden((h) => ({ ...h, [x.k]: !h[x.k] })),
            }))}
            tip={hovIdx != null ? {
              left: hovPct.toFixed(2),
              shift: hovPct < 22 ? "-8px" : hovPct > 78 ? "calc(-100% + 8px)" : "-50%",
              label: months[hovIdx]?.label ?? "",
              rows: [
                ...lines.map((l) => {
                  const s = SERIES.find((x) => x.k === l.k);
                  const v = months[hovIdx]?.[l.k] ?? 0;
                  return { label: s.label, hue: l.hue, value: v ? money(v) : "—" };
                }),
                ...(visOn ? [{ label: "Visits", hue: "#047857", value: String(months[hovIdx]?.vis ?? 0) }] : []),
              ],
            } : null}
            onHover={(i) => { setSel(i); setHov(i); }}
            onLeave={() => setHov(null)}
          />

          <div className="dx-switchbar">
            <div className="dx-switch">
              {view === "table"
                ? <span className="dx-on">{Icon.table({ size: 13 })}Data</span>
                : <button type="button" onClick={() => setView("table")} aria-label="Show data table">{Icon.table({ size: 13 })}Data</button>}
              {view === "activity"
                ? <span className="dx-on">{Icon.clock({ size: 13 })}Activity</span>
                : <button type="button" onClick={() => setView("activity")} aria-label="Show activity">{Icon.clock({ size: 13 })}Activity</button>}
            </div>
            <div className="dx-spring" />
            <span className="dx-total">{range.label} total</span>
          </div>

          {view === "table" ? (
            <DataTable
              table={table}
              openRow={openRow}
              onToggleRow={(k) => setOpenRow((v) => (v === k ? null : k))}
              pivotOn={pivotOn}
              onTogglePivot={() => { setPivotOn((v) => !v); setOpenRow(null); setSortIdx(-1); }}
              sortIdx={sortIdx}
              sortDir={sortDir}
              onSort={(i) => {
                setSortDir((d) => (sortIdx === i && d === "desc" ? "asc" : "desc"));
                setSortIdx(i);
              }}
              footnote={"Expanding a department shows its product lines — support items from Ecubix and POB lines from the quotation ledger. Service is a payment, so it has no products. " + UNATTRIBUTED_NOTE}
            />
          ) : (
            <Activity
              filters={filters}
              groups={feedGroups}
              today={fdate(new Date().toISOString().slice(0, 10))}
              foot={feedShown.length
                ? "Earlier than " + feedGroups[feedGroups.length - 1].label + " is outside the selected period"
                : "Nothing recorded for this filter"}
            />
          )}
        </section>

        <p className="dx-foot">
          Support, service, POB, visits and notes are ERP figures read live with your own credential.
          {firstT ? " On file since " + monthLabel(new Date(firstT).getFullYear(), new Date(firstT).getMonth())
            + " · " + span(monthsSince(firstT)) + "." : ""}
          {canSeeService ? " ROI is support earned from a service onward over every rupee of service from that point." : ""}
        </p>
      </div>

      {modal === "filter" ? (
        <FilterModal
          divisions={[{ key: "all", label: "All" }, ...(doctor?.divisions ?? []).map((d) => ({ key: d.key, label: d.key }))]}
          div={div}
          onDiv={(k) => { setDiv(k); setSel(null); setChartPage(0); }}
          numShort={numShort}
          onNum={setNumShort}
          range={{ opts: rangeOpts, isCustom: rangeMode.mode === "custom" }}
          onRange={(k) => { setRangeMode((r) => ({ ...r, mode: k })); setSel(null); }}
          picker={picker}
          label={filterLabel}
          onReset={() => { setDiv("all"); setRangeMode({ mode: "fy", from: null, to: null }); setSel(null); setChartPage(0); }}
          onClose={() => setModal(null)}
        />
      ) : null}

      {modal === "map" ? (
        <MapModal
          clinics={data.clinics}
          index={Math.min(clinicIdx, Math.max(0, data.clinics.length - 1))}
          onPick={setClinicIdx}
          onClose={() => setModal(null)}
        />
      ) : null}

      {modal === "rx" ? (
        <PharmacyModal
          rows={data.pharmacies}
          money={money}
          onAdd={onAddPharmacy ? () => onAddPharmacy({ doctor: data.doctor, code: data.doctorId }) : undefined}
          onClose={() => setModal(null)}
        />
      ) : null}

      {modal === "note" ? (
        <NoteModal
          form={noteForm}
          setForm={setNoteField}
          saving={noteSaving}
          error={noteError}
          onSave={saveNote}
          onClose={() => setModal(null)}
        />
      ) : null}

      {supportSplit ? (
        <SupportItemsModal
          entry={supportSplit}
          money={money}
          onClose={() => setSupportSplit(null)}
        />
      ) : null}

      {roleDetail ? (
        <RoleDetailModal detail={roleDetail} compact={compact} onClose={() => setRoleOpen(null)} />
      ) : null}

      {pobOpen ? (
        <DoctorPobDialog
          open={pobOpen}
          onOpenChange={setPobOpen}
          doctorId={data.doctorId}
          doctorName={doctor?.name}
          doctorHq={doctor?.hq}
          // The signed-in Employee, resolved from the token rather than bound.
          // Add POB defaults to them and narrows the dropdown to them plus
          // everyone under them.
          employee={viewer?.employee ?? null}
          erpUrl={erpUrl}
          authToken={authToken}
          erpTarget={erpTarget}
          onSaved={(payload) => { setPobOpen(false); data.refresh(); onPobSaved?.(payload); }}
        />
      ) : null}
    </div>
  );
}
