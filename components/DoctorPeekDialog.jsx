import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Copy, Loader2, MapPin, Plus, X } from "lucide-react";

import useDoctorConsole from "./DoctorConsole/useDoctorConsole";

/**
 * DoctorPeekDialog — the doctor card's preview popup.
 *
 * WHY THIS EXISTS: the card used to navigate on its own click, which put a
 * page change one stray tap away from the Add POB button sitting inside it. A
 * mis-tap cost the reader their place in a long list, their scroll position
 * and their filters. Navigation is now something you ASK for: the card opens
 * this preview, and leaving the list takes a deliberate second press. A
 * mis-tap now costs one dismiss.
 *
 * It is a PRESENTER — every value arrives already derived by the card, so the
 * two can never disagree about what a doctor's speciality or HQ is, and the
 * popup costs no ERP read. It shows what the card shows plus what the card has
 * no room for: the division x HQ pairings, the categories, and the full name
 * and code untruncated.
 *
 * Loaded lazily by DoctorCard, so a list of 200 cards pays for it once,
 * the first time somebody opens one.
 */
/**
 * The history the legacy "Dr. Information" screen showed, inside this popup.
 *
 * It reads through useDoctorConsole -- the SAME session, reads and derivations
 * the doctor detail page uses -- so a figure here can never disagree with the
 * figure on that page, and a reader who opens the popup and then the page sees
 * one story. The read only happens once a card is actually opened: this file is
 * itself lazily imported, and the hook is not mounted until then.
 *
 * WHAT THE LEGACY SCREEN HAD THAT ERP DOES NOT: "Last 5 Visit Remarks" has no
 * source. Event carries no remarks field of its own (its 19 custom fields are
 * all links, coordinates and flags), `description` is empty on every
 * doctor-linked event, and so is `custom_force_visit_reason`. Rather than
 * invent one, the section is left out; when a field exists it drops straight in
 * beside the others. "Sample" is the same story, so that section shows what ERP
 * does hold -- the service rows that record gifts, gadgets and cards.
 */
function Section({ title, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-gray-50/60 px-3 py-2 text-left transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
      >
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {count ? <span className="text-xs font-medium text-gray-500">{count}</span> : null}
          <ChevronDown size={15} className={"text-gray-400 transition-transform " + (open ? "rotate-180" : "")} />
        </span>
      </button>
      {open ? <div className="divide-y divide-gray-100">{children}</div> : null}
    </div>
  );
}

function Row({ left, sub, right }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <span className="min-w-0">
        <span className="block truncate text-sm text-gray-800">{left}</span>
        {sub ? <span className="block truncate text-[11px] text-gray-500">{sub}</span> : null}
      </span>
      {right ? <span className="shrink-0 text-xs font-semibold text-gray-700">{right}</span> : null}
    </div>
  );
}

const Empty = ({ what }) => <div className="px-3 py-2 text-[12px] text-gray-500">{what}</div>;

/** "2026-09-03" -> "03-Sep-2026", the form the screen this replaces used. */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fday(value) {
  if (!value) return "";
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return String(value);
  return String(t.getDate()).padStart(2, "0") + "-" + MON[t.getMonth()] + "-" + t.getFullYear();
}

export function PeekHistory({ doctor, erpUrl, authToken, employee }) {
  const c = useDoctorConsole({ doctor, erpUrl, authToken, employee, period: "all" });
  /*
   * Both pieces of state are declared BEFORE the early returns below. React
   * counts hooks by call order, so a useState sitting after `if (!c) return`
   * would be skipped on the first render and shift every later hook by one.
   */
  const [dept, setDept] = useState("all");
  const [openItem, setOpenItem] = useState(null);

  if (!c) return null;
  if (c.loading && !c.ready) return <p className="text-[12px] text-gray-500">Loading history…</p>;

  const money = c.money;
  const mine = c.viewer?.employee ?? null;

  /*
   * ONE department picker for the whole history.
   *
   * A doctor worked by three divisions has three separate stories -- Elbrit
   * Coimbatore's support has nothing to do with CND's visits -- and stacking
   * them into one list reads as a single larger story that is true of nobody.
   * The tabs are the doctor's OWN divisions, the same list the detail page's
   * filter offers, so the two never disagree about which departments exist.
   *
   * Every section below answers to this, which is why the filter is applied
   * once here rather than per section.
   */
  const divisions = c.doctor?.divisions ?? [];
  const tabs = divisions.length > 1
    ? [{ key: "all", label: "All" }, ...divisions.map((d) => ({ key: d.key, label: d.label ?? d.key }))]
    : [];
  const pick = tabs.length && tabs.some((t) => t.key === dept) ? dept : "all";
  const inDept = (r) => pick === "all" || r.div === pick;

  const visitsIn = (c.visits ?? []).filter(inDept);
  const supportIn = (c.support ?? []).filter(inDept);
  const pobsIn = (c.pobs ?? []).filter(inDept);
  const serviceIn = (c.service ?? []).filter(inDept);

  /*
   * Grouped by WHO, three dates each, the way the screen this replaces did it:
   *   Self   22-Apr-2026, 06-Jun-2026, 08-Aug-2026
   *   BE     20-May-2026, 06-Jun-2026, 08-Aug-2026
   * "Self" is the reader's own calls; everyone else groups under their seat, so
   * a manager sees their own line and their team's separately rather than three
   * rows that happen to be whoever went most recently.
   */
  const visitGroups = (() => {
    const g = new Map();
    visitsIn.forEach((v) => {
      const k = v.employee && v.employee === mine ? "Self" : (v.role || "Unassigned");
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(v);
    });
    return [...g.entries()]
      .sort((a, b) => (a[0] === "Self" ? -1 : b[0] === "Self" ? 1 : 0))
      .map(([who, rows]) => ({ who, rows: rows.slice(0, 3) }));
  })();

  // Support is one row per PRODUCT; the month view sums them by period.
  const byMonth = new Map();
  supportIn.forEach((r) => {
    const k = r.p ?? r.d;
    if (!k) return;
    byMonth.set(k, (byMonth.get(k) ?? 0) + (r.amt ?? 0));
  });
  const months = [...byMonth.entries()].slice(0, 6);

  const byProduct = new Map();
  supportIn.forEach((r) => {
    const k = r.item || r.brand;
    if (!k) return;
    byProduct.set(k, (byProduct.get(k) ?? 0) + (r.amt ?? 0));
  });
  const products = [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  // POB rows are one per LINE, so they are folded back to their quotation.
  const byQuote = new Map();
  pobsIn.forEach((r) => {
    const k = r.quotation ?? r.id;
    const e = byQuote.get(k) ?? { d: r.d, chemist: r.chemist, amt: 0, lines: 0 };
    e.amt += r.amt ?? 0; e.lines += 1;
    byQuote.set(k, e);
  });
  const pobs = [...byQuote.values()].slice(0, 3);

  const gifts = serviceIn.slice(0, 5);

  /*
   * A product's own months. Support arrives as one row per product per month,
   * so the product list sums them and this splits one product back out again --
   * no second read, and the two can never disagree because they are the same
   * rows added up differently.
   */
  const monthsFor = (item) => {
    const m = new Map();
    supportIn.forEach((r) => {
      if ((r.item || r.brand) !== item) return;
      const k = r.p ?? r.d;
      if (!k) return;
      m.set(k, (m.get(k) ?? 0) + (r.amt ?? 0));
    });
    return [...m.entries()];
  };

  return (
    <div className="space-y-2">
      {/* Only when there is a choice to make: a doctor with one division would
          get a single tab that does nothing but take up a row. */}
      {tabs.length ? (
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="Department">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={pick === t.key}
              onClick={() => { setDept(t.key); setOpenItem(null); }}
              className={"shrink-0 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors "
                + (pick === t.key
                  ? "border-[#1e2a5a] bg-[#1e2a5a] text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:bg-indigo-50")}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      <Section title="Last 3 Visit" count={visitsIn.length || null} defaultOpen>
        {visitGroups.length ? visitGroups.map((g) => (
          <div key={g.who} className="flex items-start justify-between gap-3 px-3 py-2">
            <span className="shrink-0 text-sm font-medium text-gray-800">{g.who}</span>
            <span className="min-w-0 text-right text-[12px] leading-5 text-gray-600">
              {g.rows.map((v) => (
                <span key={v.id} className="block whitespace-nowrap">
                  {fday(v.d)}{v.made === false ? " · planned" : ""}
                </span>
              ))}
            </span>
          </div>
        )) : <Empty what="No visits recorded." />}
      </Section>

      <Section title="Last 6 Month Support" count={months.length ? c.money(months.reduce((a, [, v]) => a + v, 0)) : null}>
        {months.length ? months.map(([label, amt]) => (
          <Row key={label} left={label} right={money(amt)} />
        )) : <Empty what="No support booked." />}
      </Section>

      <Section title="Last 6 Month Product Wise Support" count={products.length ? products.length + " products" : null}>
        {products.length ? products.map(([item, amt]) => {
          const open = openItem === item;
          const rows = open ? monthsFor(item) : [];
          return (
            <div key={item}>
              <button
                type="button"
                onClick={() => setOpenItem(open ? null : item)}
                aria-expanded={open}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <ChevronDown size={13} className={"shrink-0 text-gray-400 transition-transform " + (open ? "rotate-180" : "-rotate-90")} />
                  <span className="truncate text-sm text-gray-800">{item}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-gray-700">{money(amt)}</span>
              </button>
              {open ? (
                <div className="bg-gray-50/70 pb-1">
                  {rows.length ? rows.map(([label, v]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3 py-1 pl-9 pr-3">
                      <span className="truncate text-[12px] text-gray-600">{label}</span>
                      <span className="shrink-0 text-[12px] font-medium text-gray-700">{money(v)}</span>
                    </div>
                  )) : <div className="py-1 pl-9 pr-3 text-[12px] text-gray-500">No months recorded.</div>}
                </div>
              ) : null}
            </div>
          );
        }) : <Empty what="No product lines recorded." />}
      </Section>

      <Section title="Last Product, Gift & Sample" count={gifts.length ? gifts.length : null}>
        {gifts.length ? gifts.map((g, i) => (
          <Row
            key={g.id ?? i}
            /* `kind` is Doctor Service's own service_name -- Cash, GIFT CARD,
               EMI TAKEOVER, Dinner, Travel, gold. It reads as the thing that
               was actually given, which is the point of the section; the
               earlier code asked for fields the row does not have and every
               line came back as the word "Service". */
            left={g.kind || "Service"}
            /* Date and division only. The row's `ref` (remarks) was in here
               and came straight back out: ERP's remarks are whole sentences --
               "NEED INNOVA CAB FROM CROWN RESIDENCE (BASHYAM APARTMENT)
               KOYAMBEDU ON 31-10-2025 @ 3AM TO DROP CHENNAI AIRPORT" -- which
               is three wrapped lines inside a popup that is meant to be
               skimmed. */
            sub={[fday(g.d), g.div].filter(Boolean).join(" · ")}
            right={g.amt != null ? money(g.amt) : ""}
          />
        )) : <Empty what={c.canSeeService ? "Nothing recorded." : "Not shown at your level."} />}
      </Section>

      <Section title="Last 3 POB" count={pobs.length ? pobs.length : null}>
        {pobs.length ? pobs.map((q, i) => (
          <Row key={i} left={q.chemist || "Chemist not named"} sub={[fday(q.d), q.lines + (q.lines === 1 ? " line" : " lines")].filter(Boolean).join(" · ")} right={money(q.amt)} />
        )) : <Empty what="No POB tagged." />}
      </Section>
    </div>
  );
}

export default function DoctorPeekDialog({
  open,
  onOpenChange,
  name,
  code,
  speciality,
  hq,
  city,
  tags = [],
  categories = [],
  roleRows = [],
  initials,
  tone,
  copied,
  onCopyCode,
  showCopyCode = true,
  showAddPob = false,
  addPobLabel = "Add POB",
  // Passed straight through from DoctorCard, which already has all three. No
  // new Studio prop is introduced for this.
  doctorRow,
  erpUrl,
  authToken,
  employee,
  detailLabel = "Doctor detail",
  onAddPob,
  onOpenDetail,
}) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const titleId = useId();

  /*
   * Opening the detail page is a ROUTE CHANGE, and a route change on this app
   * is not instant: the page has to mount and make its own ERP reads. Without
   * this the reader pressed "Doctor detail", nothing on screen acknowledged it,
   * and the natural response is to press it again.
   *
   * The state is cleared when the dialog closes -- which is what happens on a
   * successful navigation -- and by a timer, so a page that wires the handler
   * but never actually navigates is left with a working button rather than a
   * permanently disabled one.
   */
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (!open) { setOpening(false); return undefined; }
    if (!opening) return undefined;
    const t = setTimeout(() => setOpening(false), 10000);
    return () => clearTimeout(t);
  }, [open, opening]);

  const close = useCallback(() => onOpenChange?.(false), [onOpenChange]);

  // Escape closes, Tab stays inside. A dialog the keyboard can walk out of is
  // worse than no dialog: focus lands on the list behind and the reader cannot
  // see where it went.
  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = typeof document !== "undefined" ? document.activeElement : null;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    // The list behind must not scroll under the sheet.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => panelRef.current?.focus());

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(raf);
      // Send focus back where it came from, so the reader keeps their place.
      if (restoreRef.current && typeof restoreRef.current.focus === "function") {
        restoreRef.current.focus();
      }
    };
  }, [open, close]);

  if (!open) return null;

  const avatarTone = tone?.avatar ?? "bg-indigo-100 text-indigo-700";
  const chipTone = tone?.chip ?? "bg-indigo-50 text-indigo-700";

  // Speciality is deliberately absent: the chip under the name already says it,
  // and repeating it as a row made the reader check whether the two agreed.
  const facts = [
    { label: "HQ", value: hq },
    { label: "City", value: city && city.toLowerCase() !== String(hq ?? "").toLowerCase() ? city : "" },
  ].filter((fact) => fact.value);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      // The backdrop dismisses, but only when the backdrop itself is pressed —
      // a drag that starts inside the panel and releases outside must not close it.
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl outline-none sm:max-w-lg sm:rounded-2xl"
      >
        {/* A grab bar, so the sheet reads as dismissable on a phone. */}
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-gray-300" />
        </div>

        <div className="flex items-start gap-3 border-b border-gray-100 p-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold ${avatarTone}`}>
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            {/* Not truncated — room to read the whole name is half the point
                of opening this. */}
            <h2 id={titleId} className="text-[17px] font-bold leading-snug text-[#1e2a5a]">
              {name || "Unnamed doctor"}
            </h2>
            {speciality ? (
              <span className={`mt-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${chipTone}`}>
                {speciality}
              </span>
            ) : null}
            {code && code !== name ? (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <span>{code}</span>
                {showCopyCode && onCopyCode ? (
                  <button
                    type="button"
                    onClick={onCopyCode}
                    title={copied ? "Copied" : "Copy code"}
                    aria-label={copied ? "Code copied" : `Copy code ${code}`}
                    className={`transition-colors ${copied ? "text-emerald-600" : "text-gray-400 hover:text-indigo-600"}`}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-m-1 shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {facts.length ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {facts.map((fact) => (
                <React.Fragment key={fact.label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{fact.label}</dt>
                  <dd className="flex items-center gap-1.5 font-medium text-gray-800">
                    {fact.label === "HQ" ? <MapPin size={13} className="shrink-0 text-gray-400" /> : null}
                    {fact.value}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          ) : null}

          {categories.length ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Categories</p>
              <p className="mt-1 text-sm text-gray-700">{categories.join("  |  ")}</p>
            </div>
          ) : null}

          {/* The division x HQ pairing the card has no room for. It is a real
              pairing, not two independent lists, so it stays as rows. */}
          {roleRows.length ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Coverage</p>
              <div className="mt-1.5 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100">
                {roleRows.map((role) => (
                  <div key={`${role.department}|${role.hq}`} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 text-sm font-medium text-gray-800">
                      {role.department || "Division not specified"}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">{role.hq || "HQ not specified"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : roleRows.length === 0 && tags.length ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Divisions</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="whitespace-nowrap rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* The history the legacy Dr. Information screen carried. Only
              mounted when the popup is open, and only when the card was given
              an ERP credential to read with. */}
          {doctorRow && erpUrl && authToken ? (
            <PeekHistory doctor={doctorRow} erpUrl={erpUrl} authToken={authToken} employee={employee} />
          ) : null}
        </div>

        {/* Both actions are explicit and named. Opening the full record is the
            secondary one: it costs the reader their place in the list, so it
            should never be the thing a stray press does. With neither wired the
            bar is dropped rather than left as an empty ruled strip. */}
        {(showAddPob && onAddPob) || onOpenDetail ? (
        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-gray-100 bg-white p-4">
          {showAddPob && onAddPob ? (
            <button
              type="button"
              onClick={onAddPob}
              className="inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
            >
              <Plus size={16} />
              {addPobLabel}
            </button>
          ) : null}
          {onOpenDetail ? (
            <button
              type="button"
              onClick={() => { setOpening(true); onOpenDetail(); }}
              disabled={opening}
              aria-busy={opening || undefined}
              className="inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-[#1e2a5a] transition-colors hover:border-indigo-200 hover:bg-indigo-50 active:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-wait disabled:opacity-70 disabled:hover:border-gray-200 disabled:hover:bg-white"
            >
              {opening ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  Opening…
                </>
              ) : (
                <>
                  {detailLabel}
                  <ArrowUpRight size={16} />
                </>
              )}
            </button>
          ) : null}
        </div>
        ) : null}
      </div>
    </div>
  );
}
