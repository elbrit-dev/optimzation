"use client";

/* The planner's Field layer, after the Elbrit Claims prototype:
     - trips as cards above the calendar, ending in TA · DA, with their claim
       status; own-car requests as cards beside them; the month's numbers last
     - a chip on each travel day in the month grid
     - the day's trip at the top of its agenda list
     - a sheet per trip: the story line, one TA line (fare, or own car = fuel +
       toll scans up to the approved cap), a day timeline with a stay-bill chip
       per outstation day (paid at 50 % until its bill is approved), the
       checks, and Submit / Recall & edit
     - the own-car request form
   Day types, TA and DA per day are the ERP's (Field Expense Day); the trip
   claim rules are in lib/field-expenses/claim-rules.js and every action goes
   through lib/field-expenses/trip-claims-store.js. */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  BedDouble,
  Camera,
  Car,
  Check,
  ChevronDown,
  CircleHelp,
  ChevronRight,
  Eye,
  Fuel,
  Info,
  Loader2,
  MapPin,
  Plane,
  ShieldCheck,
  TrainFront,
  Undo2,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@calendar/lib/utils";
import { Modal, ModalContent, ModalTitle } from "@calendar/components/ui/responsive-modal";
import { useFieldExpenses } from "@calendar/components/calendar/field/field-context";
import {
  AWAY_TYPES,
  DAY_TYPE_LABEL,
  dayLabel,
  dayPlace,
  fareBasis,
  inr,
  rangeLabel,
} from "@calendar/lib/field-expenses/field-days";
import { FUEL_PRICE, MILEAGE_KM_PER_L, carDayShares } from "@calendar/lib/field-expenses/claim-rules";
import { PREVIEW, STATUS_LABEL, canRecall, isLocked, statusKey } from "@calendar/lib/field-expenses/trip-claims-store";
import { readTripBill } from "@calendar/lib/field-expenses/bill-reader";
import { addTripToMonth, addTripsToMonth, monthWord, removeTripFromMonth, tripClaimRows } from "@calendar/lib/field-expenses/erp-claim";
import { CarRequestSheet, KpiSheet, RequestSheet } from "@calendar/components/calendar/field/field-sheets";
import { BILL_NAME, BillChip, BillEditor, ChipButton, ManualBill, useBillPicker } from "@calendar/components/calendar/field/field-bills";
import { useTripBillViewer } from "@calendar/components/calendar/field/field-bill-view";
import { HELP_STATUS, askedText, htmlText, listTripHelp, addRouteText, sendTripHelp } from "@calendar/lib/field-expenses/trip-help";
import { NonReportCard, NonReportDayRow, NonReportSheet } from "@calendar/components/calendar/field/field-nonreport";
import { CabCard, CabSheet } from "@calendar/components/calendar/field/field-cab";

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym) => MONTH_LONG[Number(ym.slice(5, 7)) - 1];

/* tour (stayed away) vs day trip (out and back), in the prototype's field blue */
const TONE = {
  tour: "border-indigo-200 bg-indigo-50 text-indigo-800",
  day: "border-blue-200 bg-blue-50 text-blue-800",
};
const typeTone = (dayType) => (AWAY_TYPES.has(dayType) ? TONE.tour : dayType === "EQ" ? TONE.day : "border-gray-200 bg-gray-50 text-gray-700");

const PILL = {
  unclaimed: "bg-rose-100 text-rose-700",
  recalled: "bg-rose-100 text-rose-700",
  submitted: "bg-blue-50 text-blue-700",
  sent: "bg-amber-50 text-amber-700",
  okd: "bg-green-50 text-green-700",
  rejected: "bg-rose-100 text-rose-700",
  review: "bg-amber-50 text-amber-700",
  approved: "bg-green-50 text-green-700",
  paid: "bg-green-50 text-green-700",
  pending: "bg-amber-50 text-amber-700",
  ok: "bg-green-50 text-green-700",
};
const Pill = ({ tone, children, className }) => (
  <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold", PILL[tone] || "bg-gray-100 text-gray-600", className)}>
    {children}
  </span>
);
const StatusPill = ({ claim, className }) => {
  const k = statusKey(claim);
  return <Pill tone={k} className={className}>{STATUS_LABEL[k]}</Pill>;
};

const errText = (e) => e?.message || String(e);

/* ---------- strip above the calendar ---------- */

export function FieldStrip() {
  const f = useFieldExpenses();
  if (!f.enabled) return null;

  const m = monthName(f.month);
  // the month on screen is not where this TA/DA lives (a month is claimed in
  // the next one, and moves back to its own view once settled)
  if (f.away) {
    return (
      <div className="shrink-0 bg-white px-3 pb-2 pt-1.5">
        <div className="flex min-h-9 w-full items-center gap-1.5 rounded-xl border border-dashed border-gray-200 bg-gray-50 pl-2.5 pr-1.5 text-[12px]">
          <Car className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
          <span className="flex min-w-0 flex-1 items-center gap-1 truncate font-semibold text-gray-500">
            <b className="font-extrabold text-gray-700">Field</b>
            <span className="truncate">· {f.away.text}</span>
          </span>
          {f.away.to && (
            <button type="button" onClick={() => f.goToMonth(f.away.to)} className="flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-[12px] font-extrabold text-blue-700 active:bg-blue-50">
              {f.away.toLabel} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        <FieldSheets />
      </div>
    );
  }
  const toClaim = f.claimed.filter((x) => x.claim.status === "unclaimed");
  // sent back by the officer: still the rep's to fix (20 Nov 2026 -- it read
  // "nothing to claim · all in" while a rejected trip waited to be fixed)
  const toFix = f.claimed.filter((x) => x.claim.status === "rejected");
  // with the officer -- "okd" is a trip they approved while the claim is still with them
  const awaiting = f.claimed.filter((x) => ["submitted", "sent", "review", "okd"].includes(x.claim.status)).length;
  const canOpen = f.status === "ready";
  const sum = (xs) => xs.reduce((a, x) => a + x.calc.total, 0);

  // the tile's two halves: what is left to claim, and what is waiting on someone else
  let left;
  let right = null;
  if (f.status === "loading" || f.status === "idle") left = "loading…";
  else if (f.status === "error") left = f.error?.code === "no-month" ? `${m} not built yet` : f.error?.status === 401 || f.error?.status === 403 ? "sign in again" : "TA/DA unavailable";
  else {
    left = toClaim.length
      ? `${toClaim.length} to claim`
      : toFix.length
        ? `${toFix.length} sent back to fix`
        : f.claimed.length
          ? "nothing to claim"
          : `nothing in ${m.slice(0, 3)}`;
    right = toClaim.length
      ? inr(sum(toClaim))
      : toFix.length
        ? inr(sum(toFix))
        : awaiting
          ? `${awaiting} awaiting`
          : f.claimed.length
            ? "all in"
            : null;
  }
  // the fill: how many trips are past "to claim" (a trip sent back is not)
  const done = f.claimed.length ? (f.claimed.length - toClaim.length - toFix.length) / f.claimed.length : 0;

  return (
    <div className="shrink-0 bg-white px-3 pb-2 pt-1.5">
      <button
        type="button"
        disabled={!canOpen}
        onClick={f.toggleStrip}
        aria-expanded={!!f.stripOpen}
        className="relative flex min-h-9 w-full items-center gap-1.5 overflow-hidden rounded-xl border border-gray-200 bg-white pl-2.5 pr-2 text-left text-[12px] shadow-sm active:opacity-80"
      >
        {canOpen && f.claimed.length > 0 && (
          <span className="absolute inset-y-0 left-0 bg-blue-100/80 transition-[width] duration-500" style={{ width: `${Math.max(6, Math.round(done * 100))}%` }} aria-hidden />
        )}
        <Car className="relative h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden />
        <span className="relative flex min-w-0 flex-1 items-center gap-1 truncate font-semibold text-gray-600">
          <b className="font-extrabold text-gray-900">Field</b>
          {/* which month: in the current month's view it is last month's claim */}
          <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-px text-[11px] font-extrabold text-blue-700">{m.slice(0, 3)}</span>
          <span className={cn("truncate", !toClaim.length && toFix.length > 0 && "text-rose-700")}>· {left}</span>
        </span>
        {right && <b className="relative shrink-0 text-[12.5px] font-extrabold text-gray-900">{right}</b>}
        {canOpen && <ChevronDown className={cn("relative h-4 w-4 shrink-0 text-gray-400 transition-transform", f.stripOpen && "rotate-180")} aria-hidden />}
      </button>

      {canOpen && f.stripOpen && (
        <>
          <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Trips">
            {/* the trips with no bills in one card first (HQ / EQ, and a BE's /
                ABM's OS trips -- 14 Nov 2026), then the trips with bill uploads:
                outstation by date (earliest first), an EQ day with its own car
                after them, the month's summary last; each card says OS / EQ */}
            {f.claimed.some(isLocalTrip) && <LocalCard items={f.claimed.filter(isLocalTrip)} onOpen={f.openLocal} />}
            {/* the working days with nothing on record (19 Nov 2026): say what was done */}
            <NonReportCard />
            {/* SM / ZSM: the month's cab bills, apart from TA/DA (20 Nov 2026) */}
            <CabCard />
            {[(x) => x.trip.kind === "tour", (x) => x.trip.kind !== "tour"].flatMap((pick) =>
              f.claimed
                .filter((x) => !isLocalTrip(x) && pick(x))
                .sort((p, q) => p.trip.from.localeCompare(q.trip.from))
                .map((x) => <TripCard key={x.trip.id} item={x} onOpen={() => f.openTrip(x.trip.id)} />)
            )}
            <MonthCard month={m} closed={f.month < thisMonth()} stats={f.stats} claimed={f.claimed} pulledAt={f.data?.pulledAt} onOpen={f.openKpi} />
          </div>
          {PREVIEW && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-amber-700">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Preview — claims and car requests are kept on this device until the ERP claim flow is connected.
            </p>
          )}
        </>
      )}
      <FieldSheets />
    </div>
  );
}

/* A trip with nothing to upload sits in the one combined card (14 Nov 2026:
   by bill uploads, not by OS): no own-car request sent for it (waiting or
   approved -- fuel bills may follow; a rejected one is paid the fare and
   comes back), no fuel bills, and no stay / food bills asked for or added.
   A BE / ABM never uploads (their outstation DA is already 100 %), so every
   trip of theirs -- OS too -- is in it; an RBM and up keeps an outstation
   trip with nights on its own card for the bills. */
const CAR_ASKED = new Set(["pending", "approved"]);
const needsBills = (calc) => (calc.billsAllowed && calc.nights.length > 0 && !calc.fullNoBill) || calc.stayBills + calc.foodBills > 0;
export const isLocalTrip = (x) => !CAR_ASKED.has(x.calc.request?.status) && !x.calc.carBilled && !needsBills(x.calc);

// "1 HQ day · 16 EQ days · 2 OS trips"
const localKinds = (items) => {
  const hq = items.filter((x) => x.trip.kind === "hq").reduce((n, x) => n + x.trip.days.filter((d) => d.payable).length, 0);
  const eq = items.filter((x) => x.trip.kind === "day").length;
  const os = items.filter((x) => x.trip.kind === "tour").length;
  return {
    os,
    text: [hq ? `${hq} HQ day${hq > 1 ? "s" : ""}` : null, eq ? `${eq} EQ day${eq > 1 ? "s" : ""}` : null, os ? `${os} OS trip${os > 1 ? "s" : ""}` : null].filter(Boolean).join(" · "),
  };
};
const localTitle = (os) => (os ? "HQ, EQ & OS" : "HQ & EQ days");

/* The trips with no bills, as one card: how many, what they come to, what is
   left to claim -- tap for the date-wise list. */
function LocalCard({ items, onOpen }) {
  const open = items.filter((x) => x.claim.status === "unclaimed");
  const ta = items.reduce((a, x) => a + x.calc.ta, 0);
  const da = items.reduce((a, x) => a + x.calc.da, 0);
  const total = items.reduce((a, x) => a + x.calc.total, 0);
  const worst = [...items].sort((a, b) => rank(a.claim) - rank(b.claim))[0];
  const { os, text: kinds } = localKinds(items);
  return (
    <div className={cn(CARD, "w-52 bg-white p-0", open.length ? "border-l-blue-500" : "border-l-gray-300")}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-col gap-0.5 px-2.5 pb-1.5 pt-2 text-left">
        <span className="flex min-w-0 items-center gap-1.5">
          <b className="min-w-0 flex-1 truncate text-[13px] font-bold text-gray-900">{localTitle(os)}</b>
          {open.length ? (
            <Pill tone="unclaimed" className="px-1.5 text-[9.5px]">{open.length} to claim</Pill>
          ) : (
            <StatusPill claim={worst.claim} className="px-1.5 text-[9.5px]" />
          )}
        </span>
        <span className="block truncate text-[11px] text-gray-500">{kinds} · no bills</span>
        <span className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] items-end gap-1.5 border-t border-dashed pt-1">
          <Amount label="TA" value={ta} />
          <Amount label="DA" value={da} />
          <span className="flex min-w-0 flex-col items-end leading-tight">
            <small className="max-w-full truncate text-[8.5px] font-bold uppercase tracking-wide text-gray-400">{open.length ? "to claim" : "total"}</small>
            <b className={cn("flex max-w-full items-center gap-0.5 text-[13px] font-extrabold", open.length ? "text-blue-600" : "text-gray-900")}>
              <span className="min-w-0 truncate">{inr(open.length ? open.reduce((a, x) => a + x.calc.total, 0) : total)}</span>
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
            </b>
          </span>
        </span>
      </button>
    </div>
  );
}

/* The trips with no bills, date by date: tap a row to open it in place (its
   days, TA and DA -- 14 Nov 2026, no separate page); a recall still opens
   the trip's sheet. "Claim all" puts every one still to claim
   into the month's claim at once. */
function LocalDaysSheet() {
  const f = useFieldExpenses();
  const items = f.claimed.filter(isLocalTrip).sort((a, b) => a.trip.from.localeCompare(b.trip.from));
  const open = items.filter((x) => x.claim.status === "unclaimed" && x.calc.total > 0 && !x.calc.carBlock);
  const openTotal = open.reduce((a, x) => a + x.calc.total, 0);
  const allTotal = items.reduce((a, x) => a + x.calc.total, 0);
  // sent back by the officer: the footer says so instead of "Nothing left to claim"
  const backItems = items.filter((x) => x.claim.status === "rejected");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (id) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const { os, text: kinds } = localKinds(items);
  const mon = monthWord(f.month);
  const unit = os ? "trip" : "day";
  const nDays = `${open.length} ${unit}${open.length > 1 ? "s" : ""}`;
  const claimAll = async () => {
    setBusy(true);
    try {
      const added = await addTripsToMonth({ employee: f.emp, month: f.month, items: open, data: f.data });
      for (const x of open) {
        await f.actions.submitTrip(x.trip.id, {
          total: x.calc.total,
          ta: x.calc.ta,
          da: x.calc.da,
          review: x.checks.some((c) => c.level === "review"),
          erpClaim: added.name,
        });
      }
      setConfirming(false);
      f.actions.refreshMonthClaim();
      if (added.sent) toast.success(`${nDays} sent to ${f.manager} — in your ${mon} claim`);
      if (added.warning) {
        if (added.sent) toast.message(added.warning);
        else toast.error(added.warning, { duration: Infinity, closeButton: true });
      }
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 [&>*]:shrink-0 gap-3">
      <div className="pr-10">
        <ModalTitle className="text-[22px] font-extrabold leading-tight tracking-tight text-gray-900">{localTitle(os)}</ModalTitle>
        <p className="mt-0.5 text-[14px] font-semibold text-gray-500">
          {monthName(f.month)} · {kinds} · no bills needed
        </p>
      </div>
      <ol className="flex flex-col divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
        {items.map((x) => {
          const { trip, claim, calc } = x;
          const req = calc.request;
          const d = new Date(`${trip.from}T00:00:00`);
          const isHq = trip.kind === "hq";
          const isOs = trip.kind === "tour";
          const on = expanded.has(trip.id);
          // a recall still needs the trip's own sheet (the car: month summary)
          const recallable = canRecall(claim);
          return (
            <li key={trip.id}>
              <button type="button" onClick={() => toggle(trip.id)} aria-expanded={on} className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-gray-50", on && "bg-blue-50/80")}>
                <span className="flex w-10 shrink-0 flex-col items-center leading-none">
                  <b className="text-[17px] font-extrabold text-gray-900">{d.getDate()}</b>
                  <small className="mt-0.5 text-[10px] font-bold uppercase text-gray-500">{d.toLocaleDateString("en-IN", { weekday: "short" })}</small>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cn("shrink-0 rounded px-1 text-[9.5px] font-extrabold", isHq ? "bg-gray-100 text-gray-700" : isOs ? "bg-indigo-50 text-indigo-800" : "bg-blue-50 text-blue-800")}>{isHq ? "HQ" : isOs ? "OS" : "EQ"}</span>
                    <b className="min-w-0 truncate text-[13.5px] font-bold text-gray-900">{trip.name}</b>
                  </span>
                  <span className="truncate text-[11.5px] text-gray-500">
                    {trip.days.length > 1 ? `${rangeLabel(trip.from, trip.to)} · ` : ""}
                    {trip.km > 0 ? (trip.kind === "day" ? `${trip.km}+${trip.km} km · ` : `${trip.km} km · `) : ""}TA{" "}
                    {calc.taClaimed != null && calc.taClaimed !== calc.ta && <s className="text-gray-400">{inr(calc.taClaimed)}</s>}{" "}
                    <span className={calc.taClaimed != null && calc.taClaimed !== calc.ta ? "font-bold text-amber-700" : ""}>{inr(calc.ta)}</span> · DA {inr(calc.da)}
                    {trip.days.some((dd) => dd.flight) ? " · travel by company, TA ₹0 there" : ""}
                  </span>
                  {req?.status === "rejected" && (
                    <span className="w-fit max-w-full rounded bg-rose-50 px-1.5 text-[10.5px] font-bold text-rose-700">
                      Car not approved · fare paid{req.note ? <span className="font-medium"> — “{req.note}”</span> : null}
                    </span>
                  )}
                  {/* sent back: say why without opening the row (20 Nov 2026) */}
                  {!on && claim.officer?.decision === "rejected" && (
                    <span className="line-clamp-2 text-[11px] leading-snug text-rose-800">
                      <b className="font-bold">Sent back</b>
                      {claim.officer.note ? ` — “${claim.officer.note}”` : " — open to see the details"}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="flex items-baseline gap-1">
                    {calc.taClaimed != null && calc.taClaimed !== calc.ta && <s className="text-[11.5px] text-gray-400">{inr(calc.total - calc.ta + calc.taClaimed)}</s>}
                    <b className="text-[14px] font-extrabold text-gray-900">{inr(calc.total)}</b>
                  </span>
                  <StatusPill claim={claim} className="px-1.5 text-[9.5px]" />
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", on && "rotate-180")} aria-hidden />
              </button>
              {on && (
                <div className="flex flex-col gap-2.5 border-t border-dashed border-blue-200 bg-blue-50/50 px-3 pb-3 pt-3">
                  <TripHelp item={x} day />
                  <ol>
                    {trip.days.map((dd, i) => (
                      <TripDay
                        key={dd.date}
                        row={dd}
                        data={f.data}
                        car={false}
                        last={i === trip.days.length - 1}
                        multi={trip.days.length > 1}
                        night={calc.nights.find((n) => n.date === dd.date)}
                        carShare={null}
                        bills={null}
                        stayOff={false}
                        billStrip={null}
                      />
                    ))}
                  </ol>
                  {/* the officer's / final check's change, with why */}
                  {(claim.changes || []).length > 0 && (
                    <div className="flex flex-col gap-0.5 rounded-xl bg-amber-50 px-2.5 py-2 text-[12px] leading-snug text-amber-900">
                      {claim.changes.map((a) => (
                        <span key={a.id}>
                          {a.type === "Travel" ? "TA" : a.type} · {dayLabel(a.date)}: <s>{inr(a.amount)}</s> → <b>{inr(a.final)}</b>
                          {a.reason ? ` — “${a.reason}”` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  {claim.officer?.decision === "rejected" && (
                    <span className="rounded-xl bg-rose-50 px-2.5 py-2 text-[12px] leading-snug text-rose-900">
                      <b>Rejected by {f.manager}</b>
                      {claim.officer.note ? ` — “${claim.officer.note}”` : ""}
                    </span>
                  )}
                  {/* the total, right under the day's amounts (the same columns as
                      the day rows above), a recall on the left */}
                  {recallable && (
                  <div className="grid grid-cols-[18px_44px_minmax(0,1fr)] items-center gap-x-2">
                    <span className="col-start-3 flex min-w-0 items-center gap-2 px-2.5">
                    {recallable && (
                      <button
                        type="button"
                        onClick={() => f.openTrip(trip.id, "local")}
                        className="flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-blue-700 active:bg-gray-50"
                      >
                        <Undo2 className="h-3.5 w-3.5" aria-hidden /> Recall
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                    </span>
                  </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="sticky bottom-0 -mx-4 mt-auto border-t border-gray-100 bg-white/95 px-4 pb-4 pt-3 backdrop-blur">
        {confirming ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-blue-200 bg-blue-50/60 p-3">
            <b className="text-[14px] text-gray-900">
              Send {nDays} · {inr(openTotal)}?
            </b>
            <span className="text-[12.5px] leading-snug text-gray-600">Into your {mon} claim and to {f.manager} · each day can still be recalled before approval.</span>
            <span className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="min-h-11 flex-1 rounded-xl border border-gray-300 bg-white text-[14px] font-bold text-gray-800">
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={claimAll} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 text-[14px] font-bold text-white disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Yes, send
              </button>
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className={cn("block text-[13px]", !open.length && backItems.length ? "font-semibold text-rose-700" : "text-gray-500")}>
                {open.length
                  ? `To claim · ${nDays}`
                  : backItems.length
                    ? `${backItems.length} sent back · open it to recall and fix`
                    : "Nothing left to claim"}
              </span>
              <b className="block text-[22px] font-extrabold tracking-tight text-gray-900">{inr(open.length ? openTotal : backItems.length ? backItems.reduce((a, x) => a + x.calc.total, 0) : allTotal)}</b>
            </div>
            {open.length ? (
              <button type="button" onClick={() => setConfirming(true)} className="flex min-h-[52px] shrink-0 items-center justify-center rounded-2xl bg-blue-600 px-6 text-[16px] font-bold text-white active:scale-[.98]">
                Claim all
              </button>
            ) : (
              <button type="button" onClick={f.closeSheet} className="flex min-h-[52px] shrink-0 items-center rounded-2xl bg-gray-100 px-6 text-[15px] font-bold text-gray-900">
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// to claim first, then waiting, then done
const rank = (c) => ({ unclaimed: 0, rejected: 0, review: 1, submitted: 2, sent: 2, okd: 3, approved: 3, paid: 4 })[c.status] ?? 5;

/* Every card is fixed-width and clips: each line has its own slot, long text
   ends in "…" instead of running into the next line or past the border. */
// the day ends at home: its fare legs include the journey home
const cameHome = (row) => !!row && (row.legs || []).some((l) => l.leg === "Home");

const CARD = "flex shrink-0 flex-col gap-0.5 overflow-hidden rounded-xl border border-l-[3px] px-2.5 py-2 text-left shadow-sm active:opacity-80";

/* A trip card; an RBM, ZSM or SM asks for the car from here, and the card
   says where that request stands. */
function TripCard({ item, onOpen }) {
  const { trip, claim, calc } = item;
  const stays = calc.nights.filter((n) => !cameHome(trip.days.find((d) => d.date === (n.date || n)))).length;
  const meta = [
    rangeLabel(trip.from, trip.to),
    trip.km > 0 ? `${trip.km} km` : null,
    // nights actually away: an outstation day that ends with the journey home is
    // not one (20 Nov 2026: a 22-24 Oct trip home on the 24th read "3 nights")
    stays ? `${stays} night${stays > 1 ? "s" : ""}` : null,
    calc.car ? "car" : null,
    trip.days.some((d) => d.flight) ? "travel by company" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      className={cn(
        CARD,
        "w-48 bg-white p-0",
        claim.status === "unclaimed" ? "border-l-blue-500" : claim.status === "review" ? "border-l-amber-500" : "border-l-gray-300"
      )}
    >
    <button type="button" onClick={onOpen} title={`${trip.name} · ${meta}`} className="flex min-w-0 flex-col gap-0.5 px-2.5 pb-1.5 pt-2 text-left">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <span className={cn("shrink-0 rounded px-1 text-[9.5px] font-extrabold", trip.kind === "tour" ? "bg-indigo-50 text-indigo-800" : "bg-blue-50 text-blue-800")}>
            {trip.kind === "tour" ? "OS" : trip.kind === "hq" ? "HQ" : "EQ"}
          </span>
          <b className="min-w-0 truncate text-[13px] font-bold text-gray-900">{trip.name}</b>
        </span>
        <StatusPill claim={claim} className="px-1.5 text-[9.5px]" />
      </span>
      <span className="block truncate text-[11px] text-gray-500">{meta}</span>
      <span className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] items-end gap-1.5 border-t border-dashed pt-1">
        <Amount label="TA" value={calc.ta} />
        {calc.da > 0 ? <Amount label={calc.missingStayBills ? "DA*" : "DA"} value={calc.da} hint={calc.missingStayBills ? "Outstation days without a bill are at 50 %" : undefined} /> : <span />}
        <span className="flex min-w-0 flex-col items-end leading-tight">
          <small className="max-w-full truncate text-[8.5px] font-bold uppercase tracking-wide text-gray-400">
            {claim.status === "unclaimed" ? "claim" : STATUS_LABEL[statusKey(claim)].toLowerCase()}
          </small>
          <b className={cn("flex max-w-full items-center gap-0.5 text-[13px] font-extrabold", claim.status === "unclaimed" ? "text-blue-600" : "text-gray-900")}>
            <span className="min-w-0 truncate">{inr(calc.total)}</span>
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          </b>
        </span>
      </span>
    </button>
    {calc.taClaimed != null && calc.taClaimed !== calc.ta && (
      <div className="border-t border-gray-100 px-2 py-1">
        <span className="flex w-full items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-extrabold text-amber-800" title={(claim.changes || []).map((a) => a.reason).filter(Boolean).join(" · ")}>
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            TA changed <s className="font-semibold opacity-70">{inr(calc.taClaimed)}</s> → {inr(calc.ta)}
          </span>
        </span>
      </div>
    )}
    {trip.flownFare > 0 && !calc.carBilled && (
      <div className="border-t border-gray-100 px-2 py-1">
        <span className="flex w-full items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10.5px] font-extrabold text-sky-800" title={`Flown: ${trip.flights.map((l) => `${l.from} → ${l.to}`).join(", ")} -- paid by the company`}>
          <Plane className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            By company · TA <s className="font-semibold opacity-70">{inr((calc.taClaimed ?? calc.ta) + trip.flownFare)}</s> → {inr(calc.taClaimed ?? calc.ta)}
          </span>
        </span>
      </div>
    )}
    {/* no car request on the trip card (14 Nov 2026): it is asked for, and
        followed, from the month summary card only */}
    </div>
  );
}

const Amount = ({ label, value, hint }) => (
  <span className="flex min-w-0 flex-col leading-tight" title={hint}>
    <small className="truncate text-[8.5px] font-bold uppercase tracking-wide text-gray-400">{label}</small>
    <b className="truncate text-[12px] font-extrabold text-gray-900">{inr(value)}</b>
  </span>
);

// "2026-11" for today (local time)
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function MonthCard({ month, closed, stats, claimed, pulledAt, onOpen }) {
  const by = (pred) => claimed.filter((x) => pred(x.claim)).reduce((s, x) => s + x.calc.total, 0);
  // still to claim, or sent back by the officer to fix
  const toClaim = by((c) => c.status === "unclaimed" || c.status === "rejected");
  // approved: by the officer trip by trip ("okd", the claim still with them),
  // the claim approved (waiting for the final check), or finalised -- it read
  // "Approved ₹0" while 3 of 4 trips were approved (20 Nov 2026)
  const payroll = by((c) => c.status === "okd" || c.status === "approved" || c.status === "paid");
  // more to claim with stay / food bills (19 Nov 2026, as the dashboard's
  // "paid / max"): each outstation day still to claim pays 50 % without a
  // bill and up to its full outstation DA with one
  const moreWithBills = claimed
    .filter((x) => x.claim.status === "unclaimed" && x.calc.billsAllowed)
    .reduce((s, x) => s + x.calc.nights.reduce((a, n) => a + (n.fullNoBill ? 0 : Math.max(0, n.full - n.paid)), 0), 0);
  // the prototype's k-grid: a small label, then its amount on the same line, never shortened
  const krow = (label, value, tone) => (
    <span
      className={cn(
        "flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-[11.5px] font-bold leading-snug",
        tone === "hi" ? "text-blue-700" : "text-gray-500"
      )}
    >
      {label}
      <b
        className={cn(
          "font-extrabold tracking-tight",
          tone === "muted" ? "text-[13px] font-bold text-gray-500" : tone === "hi" ? "text-[13px] text-blue-700" : "text-[15px] text-gray-900"
        )}
      >
        {value}
      </b>
    </span>
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${stats.trips} trips · ${stats.km} km${pulledAt ? ` · from the Field expenses console, ${dayLabel(pulledAt.slice(0, 10), false)}` : ""}`}
      className="flex w-max min-w-[244px] shrink-0 flex-col gap-1 rounded-2xl border border-l-4 border-blue-100 border-l-slate-800 bg-blue-50 px-3 py-2.5 text-left shadow-sm active:opacity-80"
    >
      <span className="flex min-w-0 items-center gap-2">
        <b className="flex-1 whitespace-nowrap text-[14px] font-extrabold text-gray-900">{closed ? month : `${month} so far`}</b>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[10.5px] font-bold text-blue-700">
          {stats.trips} trips · {stats.km} km
        </span>
      </span>
      <span className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
        {krow("TA", inr(claimed.reduce((s, x) => s + x.calc.ta, 0)))}
        {krow("DA", inr(claimed.reduce((s, x) => s + x.calc.da, 0)))}
        {krow("Approved", inr(payroll), payroll ? undefined : "muted")}
        {krow("To claim", inr(toClaim), toClaim ? "hi" : "muted")}
      </span>
      {moreWithBills > 0 && (
        <span className="mt-0.5 whitespace-nowrap text-[11px] font-semibold text-amber-700">
          + up to {inr(moreWithBills)} more with stay / food bills
        </span>
      )}
    </button>
  );
}

/* ---------- chip in a month cell ---------- */

export function FieldDayChip({ date, className }) {
  const f = useFieldExpenses();
  if (!f.enabled) return null;
  const row = f.dayOf(date);
  if (!row || !row.payable || !row.dayType || row.dayType === "HQ") return null;
  const place = dayPlace(row) || DAY_TYPE_LABEL[row.dayType];
  const trip = f.tripOf(date);
  const open = trip && f.claimFor(trip.id)?.claim.status === "unclaimed";
  return (
    <span
      title={`${DAY_TYPE_LABEL[row.dayType] || row.dayType} · ${place} · TA ${inr(row.ta)} · DA ${inr(row.da)}${open ? " · to claim" : ""}`}
      className={cn(
        "mx-0.5 block truncate rounded border px-1 text-[7px] font-bold leading-tight lg:mx-2 lg:text-[10px]",
        open ? "border-blue-600 bg-blue-600 text-white" : typeTone(row.dayType),
        className
      )}
    >
      {place}
    </span>
  );
}

/* ---------- a meeting day not paid for want of its HQ ---------- */

/* The dashboard pays a meeting-only working day once the meeting has its Hq
   Territory (and the person's Employee record has an HQ); without it the day
   is "logged but not paid" (its orange dot, 19 Nov 2026). The app only says
   why and asks the rep to add the HQ on the meeting -- nothing updates here;
   the day is paid at the next TA/DA update. */
function MeetingHqNote({ row }) {
  const what = (row.otherWork || []).join(", ") || "other work";
  return (
    <p className="mx-4 mb-3 flex items-start gap-2 rounded-xl bg-orange-50 px-3 py-2 text-xs text-orange-900">
      <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">
        <b className="font-bold">No TA/DA for this day:</b> {what}
        {row.otherHqSeen
          ? " has its HQ, but your employee record has none. Ask HR to add your HQ."
          : " has no HQ. Open the meeting in the calendar and add its HQ — the day is paid at the next TA/DA update."}
      </span>
    </p>
  );
}

/* ---------- the day's row in the agenda list ---------- */

export function FieldDayRow({ date }) {
  const f = useFieldExpenses();
  if (!f.enabled || f.status !== "ready") return null;
  const row = f.dayOf(date);
  if (!row) return null;

  // nothing on record (the dashboard's red dot): the rep says what was done
  if (row.nonReported || row.hqless) return <NonReportDayRow date={row.date} />;
  // work logged but no TA/DA (the orange dot, 19 Nov 2026): say why
  if (row.unpaid === "logged") return <MeetingHqNote row={row} />;
  if (!row.payable) return null;

  const trip = f.tripOf(date);
  const item = trip ? f.claimFor(trip.id) : null;
  const travel = row.dayType !== "HQ";
  const Icon = AWAY_TYPES.has(row.dayType) ? BedDouble : travel ? Car : MapPin;
  const body = (
    <>
      <Icon className={cn("h-4 w-4 shrink-0", travel ? "text-blue-600" : "text-gray-500")} aria-hidden />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[13.5px] font-bold text-gray-900">
          {item ? `${trip.name} · ` : ""}
          {DAY_TYPE_LABEL[row.dayType] || row.dayType}
          {!item && travel && dayPlace(row) ? ` · ${dayPlace(row)}` : ""}
        </b>
        <small className="block truncate text-xs text-gray-500">
          {row.km != null && travel ? `${row.km} km · ` : ""}
          {row.visits} visit{row.visits === 1 ? "" : "s"} · TA {inr(row.ta)} · DA {inr(row.da)}
        </small>
      </span>
      {item ? <StatusPill claim={item.claim} /> : <b className="shrink-0 text-sm font-extrabold text-gray-900">{inr(row.ta + row.da)}</b>}
    </>
  );

  const cls = cn(
    "mx-4 mb-3 flex w-[calc(100%-2rem)] items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left",
    travel ? "border-blue-100 bg-blue-50" : "border-gray-200 bg-white"
  );
  return item ? (
    <button type="button" className={cls} onClick={() => f.openTrip(trip.id)}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ---------- sheets ---------- */

/* Desktop or phone, by the device and not only the window: a mouse-driven
   desktop gets the centred popup even in a narrow window; a touch phone gets
   the bottom drawer, also turned sideways. */
const POPUP_QUERY = "(min-width: 768px) and (hover: hover), (hover: hover) and (pointer: fine)";
const subscribePopup = (cb) => {
  const q = window.matchMedia(POPUP_QUERY);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
const useSheetEdge = () =>
  useSyncExternalStore(
    subscribePopup,
    () => (window.matchMedia(POPUP_QUERY).matches ? "center" : "bottom"),
    () => "bottom"
  );

function FieldSheets() {
  const f = useFieldExpenses();
  const side = useSheetEdge();
  const kind = f.sheet?.kind;
  const item = kind === "trip" ? f.claimFor(f.sheet.id) : null;
  const req = kind === "request" ? f.requests.find((r) => r.id === f.sheet.id) : null;
  const close = (open) => !open && f.closeSheet();
  // the sheet scrolls its own body. Phone: a bottom drawer up to 90 % of the
  // screen. Desktop: a centred popup of a fixed size (480 × 720, smaller on a
  // small window) that never grows to the content's full length; `!` because
  // the design system's edge rules set width and max height themselves.
  const cls =
    "flex flex-col overflow-hidden pb-0 data-[edge=bottom]:max-h-[90dvh]! data-[edge=center]:w-[480px]! data-[edge=center]:max-w-[calc(100vw-48px)]! data-[edge=center]:h-[min(720px,calc(100dvh-48px))]! data-[edge=center]:max-h-[calc(100dvh-48px)]!";
  return (
    <>
      <Modal side={side} open={!!item} onOpenChange={close}>
        <ModalContent className={cls}>{item && <TripSheet item={item} />}</ModalContent>
      </Modal>
      <Modal side={side} open={kind === "car"} onOpenChange={close}>
        <ModalContent className={cls}>{kind === "car" && <CarRequestSheet key={JSON.stringify(f.sheet)} opts={f.sheet} />}</ModalContent>
      </Modal>
      <Modal side={side} open={!!req} onOpenChange={close}>
        <ModalContent className={cls}>{req && <RequestSheet req={req} />}</ModalContent>
      </Modal>
      <Modal side={side} open={kind === "local"} onOpenChange={close}>
        <ModalContent className={cls}>{kind === "local" && <LocalDaysSheet />}</ModalContent>
      </Modal>
      <Modal side={side} open={kind === "nonreport"} onOpenChange={close}>
        <ModalContent className={cls}>{kind === "nonreport" && <NonReportSheet key={f.sheet?.date || "list"} />}</ModalContent>
      </Modal>
      <Modal side={side} open={kind === "cab"} onOpenChange={close}>
        <ModalContent className={cls}>{kind === "cab" && <CabSheet />}</ModalContent>
      </Modal>
      <Modal side={side} open={kind === "kpi"} onOpenChange={close}>
        <ModalContent className={cls}>{kind === "kpi" && <KpiSheet />}</ModalContent>
      </Modal>
    </>
  );
}

/* The trip's own-car request, inside the trip (RBM, ZSM, SM) -- its state
   only. Since 14 Nov 2026 the car is asked for from the month summary card
   only, so there is no fare / own-car switch or ask here. Waiting: withdraw
   or view it; approved: the fuel upload shows at the bottom; not approved:
   why, and that the fare is paid. */
function CarMode({ calc, editable }) {
  const f = useFieldExpenses();
  const req = calc.request;
  const [busy, setBusy] = useState(false);
  if (!req) return null;
  const act = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const box = "rounded-2xl border px-3 py-2.5";
  const who = f.carApprover.replace(/^the /, "");
  if (req.status === "rejected") {
    return (
      <div className={cn(box, "flex flex-col gap-1 border-rose-200 bg-rose-50")}>
        <span className="flex items-center gap-2 text-[13px] font-bold text-rose-900">
          <Car className="h-4 w-4 text-rose-700" aria-hidden />
          Own car not approved · you asked {inr(req.asked)}
        </span>
        <span className="text-[12.5px] leading-snug text-rose-900">
          {req.note ? `${who}: “${req.note}”` : "No reason given."} · fare paid{editable ? " · ask again from the month summary" : ""}
        </span>
      </div>
    );
  }
  const ok = req.status === "approved";
  const changed = ok && req.asked && req.approvedAmount !== req.asked;
  return (
    <div className={cn(box, "flex flex-col gap-2", ok ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50")}>
      <span className="flex items-center gap-2 text-[13px] font-bold text-gray-900">
        <Car className={cn("h-4 w-4", ok ? "text-green-700" : "text-amber-700")} aria-hidden />
        {ok ? `Own car approved up to ${inr(req.ask)}${changed ? ` (you asked ${inr(req.asked)})` : ""}` : `Own car requested · ${inr(req.ask)} · waiting for ${f.carApprover}`}
      </span>
      <span className="text-[12.5px] leading-snug text-gray-600">
        {ok ? "Fuel bills replace the fare · no bill, the fare is paid." : "Fare until approved · then upload the fuel bills."}
        {ok && req.note ? <span className="mt-0.5 block italic text-gray-500">{who}: &ldquo;{req.note}&rdquo;</span> : null}
      </span>
      {editable && (
        <span className="flex flex-wrap gap-2">
          <button type="button" onClick={() => f.openRequest(req.id)} className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-[12.5px] font-bold text-gray-800">
            View request
          </button>
          {!ok && (
            <button type="button" disabled={busy} onClick={() => act(() => f.actions.withdrawRequest(req.id), "Car request withdrawn — the trip is back to the normal fare")} className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-[12.5px] font-bold text-gray-800">
              Withdraw
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/* Help on a trip (14 Nov 2026; a Task since 16 Nov 2026): a wording line in
   the look of the "Going by car…  Request ›" line, "Help" at its right; tap ->
   a drawer from the bottom with the rep's requests on this trip so far (each
   one's progress and the team's replies) and a box to raise a new one. Each
   request is an ERP Task carrying the trip day by day (trip-help.js). */
// the Help drawer shows this many of the rep's requests on the trip, newest first
const HELP_SHOWN = 3;
const HELP_TONE = {
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-800",
  green: "bg-green-50 text-green-700",
  gray: "bg-gray-100 text-gray-600",
};
const whenText = (s) => {
  const d = new Date(String(s || "").replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};
function HelpRequest({ t }) {
  const st = HELP_STATUS[t.status] || { label: t.status, tone: "gray" };
  const asked = askedText(t.description);
  const done = t.status === "Completed" || t.status === "Cancelled";
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <span className="flex items-center gap-2">
        <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold", HELP_TONE[st.tone])}>{st.label}</span>
        <small className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-gray-500">
          {t.name} · raised {whenText(t.creation)}
        </small>
      </span>
      {asked && <p className="whitespace-pre-line text-[13px] text-gray-800">{asked}</p>}
      {t.replies.map((r, i) => (
        <div key={i} className={cn("rounded-lg px-2.5 py-1.5 text-[12.5px]", r.mine ? "bg-gray-50 text-gray-700" : "bg-blue-50 text-blue-900")}>
          <b className="font-bold">{r.mine ? "You" : r.by}</b> <small className="text-[11px] text-gray-500">{whenText(r.at)}</small>
          <p className="whitespace-pre-line">{htmlText(r.content)}</p>
        </div>
      ))}
      {!t.replies.length && !done && <small className="text-[11.5px] text-gray-500">No reply yet — it&apos;s with the expense team.</small>}
    </li>
  );
}

function TripHelp({ item, day = false }) {
  const f = useFieldExpenses();
  const { trip, calc, claim } = item;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // the rep's requests on this trip: null = loading, [] = none
  const [tasks, setTasks] = useState(null);
  const [loadError, setLoadError] = useState("");
  // what kind of request (19 Nov 2026): "wrong" = free words, "place" = a
  // place to add to a day's route (an in-between stop, not a new trip)
  const [mode, setMode] = useState("wrong");
  const firstDay = (trip.days.find((d) => d.payable) || trip.days[0])?.date || trip.from;
  const [miss, setMiss] = useState({ date: firstDay, place: "", after: "", km: "", why: "" });
  const setM = (k) => (e) => setMiss((m) => ({ ...m, [k]: e.target.value }));
  // the chosen day's route as it is, stop by stop
  const missDay = trip.days.find((d) => d.date === miss.date) || null;
  const missStops = (missDay?.route || []).map((x) => x.place).filter(Boolean);
  const missAfter = missStops.includes(miss.after) ? miss.after : missStops[0] || "";
  const ready = mode === "place" ? miss.place.trim().length >= 2 && !!miss.date : text.trim().length >= 5;
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoadError("");
    listTripHelp(trip)
      .then((list) => alive && setTasks(list))
      .catch((e) => {
        if (!alive) return;
        setTasks((cur) => cur || []);
        setLoadError(errText(e));
      });
    return () => {
      alive = false;
    };
  }, [open, trip.from, trip.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    setBusy(true);
    try {
      const t =
        mode === "place"
          ? await sendTripHelp({
              trip,
              calc,
              claim,
              emp: f.emp,
              message: addRouteText({ ...miss, route: missStops, after: missAfter }),
              title: `Add to route · ${miss.place.trim()}`,
            })
          : await sendTripHelp({ trip, calc, claim, emp: f.emp, message: text });
      toast.success(`Request sent${t?.name ? ` · ${t.name}` : ""} — the reply shows here`);
      setText("");
      setMiss((m) => ({ ...m, place: "", after: "", km: "", why: "" }));
      if (t) setTasks((cur) => [t, ...(cur || [])]);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const any = (tasks || []).length > 0;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("flex w-full items-center gap-2 rounded-2xl bg-blue-50 text-left text-blue-800 hover:bg-blue-100 active:bg-blue-100", day ? "px-2.5 py-2" : "px-3 py-2.5")}
      >
        <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate font-semibold", day ? "text-[12.5px]" : "text-[13px]")}>
          {day ? (trip.kind === "tour" ? "Something wrong in this trip?" : "Something wrong on this day?") : "Something wrong in this trip? Ask for help"}
        </span>
        <span className={cn("flex shrink-0 items-center font-extrabold", day ? "text-[12.5px]" : "text-[13px]")}>
          Help <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </button>
      {open && (
        // fixed inside the sheet (its panel is transformed): covers the sheet only
        <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={busy ? undefined : () => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Ask for help"
            className="flex max-h-[85%] w-full flex-col gap-2 overflow-y-auto rounded-t-3xl bg-white px-4 pt-2.5 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgba(0,0,0,.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mx-auto mb-1 h-1 w-10 shrink-0 rounded-full bg-gray-300" aria-hidden />
            <span className="flex items-center gap-2">
              <b className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-gray-900">Help · {trip.name}</b>
              <small className="shrink-0 text-[12px] font-semibold text-gray-500">{rangeLabel(trip.from, trip.to)}</small>
              <button type="button" aria-label="Close" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </span>
            {tasks === null ? (
              <span className="flex items-center gap-2 py-1 text-[12.5px] text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking your requests…
              </span>
            ) : (
              any && (
                <>
                  <b className="text-[12.5px] font-bold text-gray-600">Your requests</b>
                  {/* the 3 latest only (16 Nov 2026) */}
                  <ul className="flex flex-col gap-2">
                    {tasks.slice(0, HELP_SHOWN).map((t) => (
                      <HelpRequest key={t.name} t={t} />
                    ))}
                  </ul>
                </>
              )
            )}
            {loadError && <small className="text-[11.5px] font-semibold text-amber-700">Couldn&apos;t load your earlier requests: {loadError}</small>}
            {any && <b className="mt-1 text-[12.5px] font-bold text-gray-600">Raise another request</b>}
            <span className="flex shrink-0 gap-1 rounded-xl bg-gray-100 p-1" role="tablist" aria-label="Kind of request">
              {[
                ["wrong", "Something wrong"],
                ["place", "Add a place to the route"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={mode === k}
                  onClick={() => setMode(k)}
                  className={cn("flex-1 rounded-lg py-1.5 text-[12.5px] font-bold", mode === k ? "bg-white text-blue-700 shadow-sm" : "text-gray-500")}
                >
                  {label}
                </button>
              ))}
            </span>
            {mode === "place" ? (
              <div className="flex shrink-0 flex-col gap-2">
                <label className="flex flex-col gap-1 text-[11.5px] font-bold text-gray-600">
                  Day
                  <select value={miss.date} onChange={setM("date")} className={HELP_INPUT}>
                    {trip.days.map((d) => (
                      <option key={d.date} value={d.date}>
                        {dayLabel(d.date)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="rounded-xl bg-gray-50 px-3 py-2 text-[12px] text-gray-600">
                  <b className="font-bold text-gray-700">Route now: </b>
                  {missStops.length ? missStops.join(" → ") : "no route on this day"}
                </span>
                <span className={cn("grid gap-2", missStops.length ? "grid-cols-2" : "grid-cols-1")}>
                  <label className="flex min-w-0 flex-col gap-1 text-[11.5px] font-bold text-gray-600">
                    Place to add
                    <input value={miss.place} onChange={setM("place")} maxLength={80} placeholder="e.g. Ottapalam" className={HELP_INPUT} />
                  </label>
                  {missStops.length > 0 && (
                    <label className="flex min-w-0 flex-col gap-1 text-[11.5px] font-bold text-gray-600">
                      Comes after
                      <select value={missAfter} onChange={setM("after")} className={HELP_INPUT}>
                        {missStops.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </span>
                <span className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                  <label className="flex min-w-0 flex-col gap-1 text-[11.5px] font-bold text-gray-600">
                    Extra km
                    <input type="number" inputMode="numeric" min="0" value={miss.km} onChange={setM("km")} placeholder="38" className={HELP_INPUT} />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1 text-[11.5px] font-bold text-gray-600">
                    Why (optional)
                    <input value={miss.why} onChange={setM("why")} maxLength={300} placeholder="e.g. check-in missed at this stop" className={HELP_INPUT} />
                  </label>
                </span>
              </div>
            ) : (
              <textarea
                autoFocus={!any}
                rows={3}
                value={text}
                maxLength={1000}
                onChange={(e) => setText(e.target.value)}
                placeholder="What is wrong? e.g. the DA on 14 Oct looks low."
                className="w-full shrink-0 resize-none rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-[13.5px] text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            )}
            <small className="text-[11.5px] text-gray-500">{trip.from === trip.to ? "This day's" : "This trip's"} details go with it, day by day.</small>
            <button
              type="button"
              disabled={busy || !ready}
              onClick={send}
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 text-[15px] font-bold text-white disabled:bg-gray-200 disabled:text-gray-500"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Send request
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const HELP_INPUT =
  "w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-[13.5px] font-normal text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const UPLOAD_LABEL = { da: "Upload stay / food bill", car: "Upload fuel bill", all: "Upload stay / food / fuel bill" };

function TripSheet({ item }) {
  const f = useFieldExpenses();
  const { trip, claim, calc, checks } = item;
  const editable = claim.status === "unclaimed";
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null); // { kind, id }
  const [confirming, setConfirming] = useState(false); // Submit asks first
  // a bill the reader could not read: the rep enters it by hand
  const [manual, setManual] = useState(null); // { file, slot, prefill, reason }
  // fare or own car: picks what the pinned upload takes (opens on own car when
  // a car request is waiting or approved)
  // 14 Nov 2026: no fare / own-car switch here -- the car is asked for from
  // the month summary only; once approved, the fuel upload simply shows
  const carTab = f.canCar && trip.kind !== "hq" && calc.carApproved;
  // the trip's ONE upload (16 Nov 2026): what it takes
  const stayFood = calc.billsAllowed && calc.nights.length > 0 && !calc.fullNoBill;
  const fuelOn = carTab;
  const upSlot = stayFood && fuelOn ? "all" : fuelOn ? "car" : "da";
  const upCount = (stayFood ? calc.stayBills + calc.foodBills : 0) + (fuelOn ? (claim.fuels || []).length : 0);
  const upAmount = (stayFood ? calc.pool?.bills || 0 : 0) + (fuelOn ? calc.fuel : 0);
  const [sendError, setSendError] = useState(null); // why the last send was refused
  const [billInput, pickBill] = useBillPicker();
  // each day's bills as pictures, and the full-screen viewer (13 Nov 2026)
  const billView = useTripBillViewer(claim);

  const run = async (key, fn, ok) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(null);
    }
  };

  /* Scan a bill onto the trip: the server checks it (type, date inside the
     trip, a readable photo, not already claimed) and stores it; a bill that
     fails is refused with the reason, nothing is typed in. */
  /* 13 Nov 2026: reading a bill takes a while (the reader is ~15-25 s), so it
     runs in the background -- a "Reading the bill…" toast that turns into the
     result, the button free for the next bill, the rep free to carry on. */
  const [reading, setReading] = useState({});
  const alive = useRef(true);
  // set on every mount: React's dev double-mount runs the cleanup once in between
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const scan = (kind) =>
    pickBill(async (file) => {
      const tid = toast.loading("Reading the bill… you can carry on", { duration: Infinity });
      setReading((x) => ({ ...x, [kind]: (x[kind] || 0) + 1 }));
      try {
        const r = await readTripBill(file, kind, trip);
        if (!r.ok) {
          // could not be read (handwritten, faded, no bill no / date): enter it
          if (r.manual) {
            toast.dismiss(tid);
            if (alive.current) return setManual({ file, slot: kind, prefill: r.prefill, reason: r.reason });
            toast.error("A bill couldn't be read — open the trip and upload it again to enter it by hand.", { duration: 8000 });
            return;
          }
          toast.error(r.reason, { id: tid, duration: r.duplicate ? 10000 : 6000 });
          return;
        }
        // the one stay-and-food upload: the bill says which it is
        // tolls are not paid (13 Nov 2026): a toll receipt is refused
        if (kind === "car" && r.bill.kind === "Toll") {
          toast.error("Tolls are not paid — upload the fuel bill only.", { id: tid, duration: 6000 });
          return;
        }
        // "da" / "all": the bill says which it is (stay, food -- and fuel on "all")
        const slot = { Stay: "stays", Food: "foods", Fuel: "fuels" }[r.bill.kind] || (kind === "car" ? "fuels" : kind);
        const id = await f.actions.addBill(trip.id, slot, r.bill);
        if (alive.current) setEditing({ kind: slot, id });
        const b = r.bill;
        toast.success(
          slot === "stays"
            ? `Hotel bill ${inr(b.billed)} · ${b.nights.length} night${b.nights.length > 1 ? "s" : ""} in this trip${b.amount !== b.billed ? ` (counts ${inr(b.amount)})` : ""}`
            : `${BILL_NAME[slot]} ${inr(b.billed)} added · ${dayLabel(b.date)}`,
          { id: tid, duration: 4000 }
        );
        if (b.flag) toast.message(`${b.flag} Your reporting officer will see this.`, { duration: 10000 });
      } catch (e) {
        toast.error(errText(e), { id: tid });
      } finally {
        if (alive.current) setReading((x) => ({ ...x, [kind]: Math.max(0, (x[kind] || 0) - 1) }));
      }
    });
  const removeBill = (kind, id) => {
    run(`rm-${id}`, () => f.actions.removeBill(trip.id, kind, id), "Bill removed");
    setEditing(null);
  };

  // outstation days no stay bill covers yet
  const nextNight = calc.nights.find((n) => !n.bill) || null;

  const review = checks.some((c) => c.level === "review");
  const req = calc.request;

  // Submit: the trip's lines go into the month's ERP claim (one per rep per
  // month, erp-claim.js); the month goes to the reporting officer when it is
  // sent from the month card
  const month = trip.from.slice(0, 7);
  const mon = monthWord(month);
  const submit = () =>
    run(
      "submit",
      async () => {
        const added = await addTripToMonth({ employee: f.emp, month, trip, claim, calc, data: f.data });
        await f.actions.submitTrip(trip.id, { total: calc.total, ta: calc.ta, da: calc.da, review, erpClaim: added.name });
        setConfirming(false);
        f.actions.refreshMonthClaim();
        if (added.sent) toast.success(`Sent to ${f.manager} for approval — in your ${mon} claim`);
        // a refused send must be seen: red, and it stays until closed
        if (added.warning) (added.sent ? toast.message : toast.error)(added.warning, added.sent ? undefined : { duration: Infinity, closeButton: true });
        if (!added.sent) setSendError(added.warning);
      },
      null
    );
  // Recall: the trip's lines come back out of the month's claim (only while
  // the month is not sent), then the trip opens again
  const recall = () =>
    run(
      "recall",
      async () => {
        await removeTripFromMonth({ employee: f.emp, month, trip });
        await f.actions.recallTrip(trip.id);
        f.actions.refreshMonthClaim();
      },
      `Taken out of your ${mon} claim — edit it and submit again`
    );
  const rowCount = editable ? tripClaimRows(trip, claim, calc, f.data).length : 0;

  const nDays = trip.days.length;
  const daysLabel = nDays > 1 ? `${nDays} days` : dayLabel(trip.from);
  // where a submitted trip really is: in the month's claim, which is sent to
  // the officer as one (from the month card) -- not on its own
  // the claim this trip's lines are in (a month can have more than one)
  const mc = claim.holder || f.monthClaim?.claim || null;
  const monthState = !mc
    ? null
    : mc.open
      ? mc.status === "Rejected"
        ? "rejected"
        : "draft"
      : ["Verified", "Paid"].includes(mc.status)
        ? "final"
        : mc.status === "Approved"
          ? "approved"
          : mc.status === "In Review"
          ? "review"
          : "sent";
  const costStatus =
    claim.status === "unclaimed"
      ? claim.recalled
        ? "Recalled · not claimed"
        : "Not claimed yet"
      : monthState === "draft"
        ? `In ${mon} claim · not sent yet`
        : monthState === "rejected"
          ? `${mon} claim rejected`
          : monthState === "sent"
            ? `Sent · awaiting ${f.manager}`
            : monthState === "review"
              ? "Approved · Accounts checking"
              : monthState === "approved"
                ? "Approved · final check pending"
                : monthState === "final"
                  ? "Finalised · in payroll"
                : claim.status === "review"
                  ? "Claimed · in review"
                  : claim.status === "submitted"
                    ? `In ${mon} claim`
                    : "Claimed · in payroll";
  const sectionLabel = "text-[13px] font-bold text-gray-500";
  // the own car's TA, split over the days by the km driven (13 Nov 2026)
  const carShares = calc.carBilled ? carDayShares(trip, calc.taClaimed ?? calc.ta) : null;
  // Trip cost's words: why the TA and the DA are what they are
  const paidDays = trip.days.filter((d) => d.payable).length;
  const taBasis = calc.car
    ? calc.carBilled
      ? `own car · fuel bills ${inr(calc.fuel)}${calc.capped ? ` · capped at ${inr(calc.cap)}` : ""} · split by km`
      : "own car · fare until the bills are in"
    : trip.kind === "hq"
      ? "no travel on an HQ day"
      : trip.kind === "day"
        ? `↑ ${trip.km} km ↓ ${trip.km} km`
        : // not "by road": the journeys are paid the rail fare, local runs per km (each day's line says which)
          `${trip.km > 0 ? `fare · ${trip.km} km` : "no journey"}${trip.flownFare > 0 ? ` · company travel ${inr(trip.flownFare)} off` : ""}`;
  const nN = calc.nights.length;
  const daBasis = calc.pool?.on
    ? `${nN} outstation day${nN > 1 ? "s" : ""} · stay + food bills`
    : nN
      ? calc.fullNoBill
        ? `${nN} outstation day${nN > 1 ? "s" : ""} · 100 % (no bill needed)`
        : `${nN} outstation day${nN > 1 ? "s" : ""}${calc.missingStayBills ? ` · ${calc.missingStayBills} at 50 % (no bill)` : ""}`
      : trip.kind === "hq"
        ? `${paidDays} HQ day${paidDays > 1 ? "s" : ""}`
        : `ex-HQ day${paidDays > 1 ? `s · ${paidDays}` : ""} · return to HQ`;
  const taNote = calc.car
    ? !calc.carBilled
      ? `No fuel bill yet · paid the fare ${inr(calc.fare)} · fuel bills pay up to ${inr(calc.cap)}.`
      : null
    : calc.carPending
      ? "Car requested · paid the fare until the GM approves."
      : null;

  return (
    <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 [&>*]:shrink-0 gap-3">
      {billInput}
      {billView.viewer}
      {manual && (
        <ManualBill
          file={manual.file}
          slot={manual.slot}
          trip={trip}
          prefill={manual.prefill}
          reason={manual.reason}
          onCancel={() => setManual(null)}
          onDone={(slotKey, bill) =>
            run("manual", async () => {
              const id = await f.actions.addBill(trip.id, slotKey, bill);
              setManual(null);
              setEditing({ kind: slotKey, id });
              toast.success(`${BILL_NAME[slotKey]} ${inr(bill.billed)} added by hand — a person checks it against the photo`);
              if (bill.flag) toast.message(`${bill.flag} Your reporting officer will see this.`, { duration: 10000 });
            })
          }
        />
      )}

      {/* header */}
      <div className="pr-10">
        <ModalTitle className="text-[22px] font-extrabold leading-tight tracking-tight text-gray-900">{trip.name}</ModalTitle>
        <p className="mt-0.5 text-[14px] font-semibold text-gray-500">
          {rangeLabel(trip.from, trip.to)} · {nDays} day{nDays > 1 ? "s" : ""}{trip.km > 0 ? ` · ${trip.km} km` : ""}
        </p>
        {/* something wrong with the trip: ask MIS (14 Nov 2026) */}
        <div className="mt-3 -mr-10">
          <TripHelp item={item} />
        </div>
      </div>

      {/* how it was travelled: the own car (asked for right here) with its
          fuel / toll bills, and a flight -- the money itself is in Trip cost */}
      {(calc.car || (trip.flownFare > 0 && !calc.carBilled) || (f.canCar && trip.kind !== "hq" && calc.request)) && (
        <div className="flex flex-col gap-2">
          {calc.car && (
            <div className="rounded-2xl border border-gray-200 px-3 py-2.5 text-[12.5px] text-gray-600">
              <span className="flex items-start gap-1.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
                <span>
                  {calc.carApproved ? "approved up to" : "allowed up to"} <b className="text-gray-900">{inr(calc.cap)}</b>
                  {!req?.ask && ` · ${trip.km} km ÷ ${MILEAGE_KM_PER_L} km/l × ₹${FUEL_PRICE.Petrol}`}
                </span>
              </span>
              <span className="mt-2 flex items-center gap-3">
                <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <i
                    className={cn("block h-full rounded-full", calc.capped ? "bg-amber-500" : "bg-green-600")}
                    style={{ width: `${Math.min(100, Math.round(((calc.fuel + calc.tolls) / (calc.cap || 1)) * 100))}%` }}
                  />
                </span>
                <b className={cn("shrink-0", calc.capped ? "text-amber-700" : "text-gray-900")}>
                  {inr(calc.fuel + calc.tolls)} / {inr(calc.cap)}
                </b>
              </span>

              <div className="mt-3 flex flex-wrap gap-2">
                {["fuels", "tolls"].flatMap((kind) =>
                  (claim[kind] || []).map((b) => (
                    <BillChip key={b.id} kind={kind} bill={b} on={editing?.id === b.id} readOnly={!editable} onClick={() => setEditing(editing?.id === b.id ? null : { kind, id: b.id })} />
                  ))
                )}
              </div>
              {editable && (editing?.kind === "fuels" || editing?.kind === "tolls") && (
                <BillEditor
                  key={editing.id}
                  bill={(claim[editing.kind] || []).find((b) => b.id === editing.id)}
                  kind={editing.kind}
                  onRemove={() => removeBill(editing.kind, editing.id)}
                />
              )}
            </div>
          )}

          {/* a flown leg: the company's ticket -- the fare it would have paid
              comes off the trip's TA (13 Nov 2026) */}
          {trip.flownFare > 0 && !calc.carBilled && (
            <div className="flex items-start gap-1.5 rounded-xl bg-sky-50 px-2.5 py-2 text-[12.5px] leading-snug text-sky-900">
              <Plane className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                By road {inr((calc.taClaimed ?? calc.ta) + trip.flownFare)} − by company {trip.flights.map((l) => `${l.from} → ${l.to}`).join(", ")} {inr(trip.flownFare)} ={" "}
                <b>TA {inr(calc.taClaimed ?? calc.ta)}</b>
                <span className="block text-[11.5px] text-sky-700">The company paid for this journey, so it pays no TA.</span>
              </span>
            </div>
          )}
          {/* normal fare or own car, asked for right here (RBM, ZSM, SM) */}
          {f.canCar && trip.kind !== "hq" && <CarMode calc={calc} editable={editable} />}
        </div>
      )}

      {/* day by day */}
      <ol className="mt-1 border-t border-dashed border-gray-300 pt-4">
        {trip.days.map((d, i) => (
          <TripDay
            key={d.date}
            row={d}
            data={f.data}
            car={calc.carBilled}
            last={i === trip.days.length - 1}
            multi={trip.days.length > 1}
            night={calc.nights.find((n) => n.date === d.date)}
            carShare={carShares?.[d.date] || null}
            bills={calc.billsByDate?.[d.date] || null}
            stayOff={!!calc.stayOff?.[d.date]}
            billStrip={billView.strip(d.date)}
          />
        ))}
      </ol>

      {/* bills only for a night spent away: back at HQ the same day, no stay
          or food bill is asked for (one already added still shows) */}
      {/* only once there are bills: with none, the upload button at the
          bottom and each day's DA line already say it (13 Nov 2026) */}
      {calc.billsAllowed && calc.stayBills + calc.foodBills > 0 && (
        <div>
          <span className={sectionLabel}>DA bills · stay &amp; food</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {["stays", "foods"].flatMap((kind) =>
              (claim[kind] || []).map((b) => (
                <BillChip key={b.id} kind={kind} bill={b} on={editing?.id === b.id} readOnly={!editable} onClick={() => setEditing(editing?.id === b.id ? null : { kind, id: b.id })} />
              ))
            )}
          </div>
          {editable && (editing?.kind === "stays" || editing?.kind === "foods") && (
            <BillEditor
              key={editing.id}
              bill={(claim[editing.kind] || []).find((b) => b.id === editing.id)}
              kind={editing.kind}
              onRemove={() => removeBill(editing.kind, editing.id)}
            />
          )}
          {calc.nights.length > 0 && calc.pool?.on && (
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug text-gray-500">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {`Each day: stay + food, kept between 50 % and 100 % of its DA.${calc.pool.unpaid ? ` ${inr(calc.pool.unpaid)} on days with no outstation DA.` : ""}`}
              {nextNight && calc.stayBills > 0 ? ` No stay bill covers ${dayLabel(nextNight.date)}.` : ""}
            </p>
          )}
        </div>
      )}

      {/* checks that send it to a reviewer */}
      {checks
        .filter((c) => c.level === "review" || c.ok)
        .map((c, i) => (
          <p key={i} className={cn("flex items-start gap-2 rounded-2xl px-3 py-2.5 text-[12.5px] leading-snug", c.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800")}>
            {c.ok ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <Eye className="mt-0.5 h-4 w-4 shrink-0" />}
            {c.text}
          </p>
        ))}

      {/* cost & status */}
      <div>
        <span className={sectionLabel}>Cost &amp; status</span>
        {/* the officer decides each trip on its own: this one's decision */}
        {claim.officer?.decision === "rejected" && (
          <div className="mt-1.5 flex flex-col gap-1 rounded-2xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] leading-snug text-rose-900">
            <b className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700">This trip was rejected by {f.manager}</b>
            <span>{claim.officer.note ? `“${claim.officer.note}”` : "No reason given."}</span>
            <span className="text-rose-800">Fix it — recall the trip, change it and submit it again — or recall it to leave it out. Your other trips keep their approval.</span>
          </div>
        )}
        {claim.officer?.decision === "approved" && (monthState === "sent" || monthState === "rejected" || monthState === "draft") && (
          <div className="mt-1.5 flex items-start gap-2 rounded-2xl bg-green-50 px-3.5 py-2.5 text-[12.5px] leading-snug text-green-800">
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {f.manager} approved this trip.{" "}
              {monthState === "sent" ? `The rest of your ${mon} claim is still with them.` : `It stays approved — only a trip sent back needs fixing before ${mon} goes again.`}
            </span>
          </div>
        )}
        {/* amounts changed after it was sent: by the reporting officer, or on
            the final check -- who, what and why (13 Nov 2026) */}
        {(claim.changes || []).length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-snug text-amber-900">
            <b className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">
              {claim.changes.every((a) => a.step === "officer" || (a.step !== "final" && f.approverId && a.by.toLowerCase() === f.approverId)) ? `Changed by ${f.manager}` : "Changed after you sent it"}
            </b>
            {claim.changes.map((a) => {
              const officer = a.step === "officer" || (a.step !== "final" && f.approverId && a.by.toLowerCase() === f.approverId);
              const named = (mc?.adjustments || []).find((x) => x.date === a.date && x.type === a.type)?.by;
              return (
                <span key={a.id}>
                  {a.type === "Travel" ? "TA" : a.type} · {dayLabel(a.date)}: <s>{inr(a.amount)}</s> → <b>{inr(a.final)}</b>
                  {officer ? "" : ` · on the final check${named || a.by ? ` by ${named || a.by}` : ""}`}
                  {a.reason ? ` — “${a.reason}”` : ""}
                </span>
              );
            })}
          </div>
        )}
        <div className="mt-1.5 flex flex-col gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <small className="block pt-1 text-[11.5px] font-extrabold uppercase tracking-wider text-blue-700">Trip cost</small>
            <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[12px] font-bold",
                  claim.status === "unclaimed" ? "bg-rose-100 text-rose-700" : claim.status === "review" ? "bg-amber-50 text-amber-700" : claim.status === "submitted" ? "bg-blue-100 text-blue-700" : "bg-green-50 text-green-700"
                )}
              >
                {costStatus}
              </span>
              {calc.carApproved ? (
                <small className="flex items-center gap-1 text-[12px] font-extrabold uppercase tracking-wide text-green-700">
                  <Check className="h-3.5 w-3.5" aria-hidden /> Own car approved
                </small>
              ) : calc.carPending ? (
                <button type="button" onClick={() => f.openRequest(req.id)} className="flex items-center gap-1 text-[12px] font-extrabold uppercase tracking-wide text-amber-700">
                  <Car className="h-3.5 w-3.5" aria-hidden /> Car requested
                </button>
              ) : null}
            </div>
          </div>
          {/* TA, DA and the total, one below the other, each with why */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="w-8 shrink-0 text-[12.5px] font-extrabold text-gray-500">TA</span>
              <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-gray-600">{taBasis}</span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                {calc.taClaimed != null && calc.taClaimed !== calc.ta && <s className="text-[12.5px] tabular-nums text-gray-400">{inr(calc.taClaimed)}</s>}
                <b className="text-[16px] font-extrabold tabular-nums text-gray-900">{inr(calc.ta)}</b>
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="w-8 shrink-0 text-[12.5px] font-extrabold text-gray-500">DA</span>
              <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-gray-600">{daBasis}</span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                {calc.daClaimed != null && calc.daClaimed !== calc.da && <s className="text-[12.5px] tabular-nums text-gray-400">{inr(calc.daClaimed)}</s>}
                <b className="text-[16px] font-extrabold tabular-nums text-gray-900">{inr(calc.da)}</b>
              </span>
            </div>
            <div className="flex items-baseline gap-2 border-t border-blue-200 pt-1.5">
              <span className="min-w-0 flex-1 text-[13.5px] font-extrabold text-gray-900">Total</span>
              <b className="shrink-0 text-[22px] font-extrabold tabular-nums tracking-tight text-gray-900">{inr(calc.total)}</b>
            </div>
          </div>
          {taNote && (
            <p className="flex items-start gap-1.5 text-[12px] leading-snug text-gray-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {taNote}
            </p>
          )}
        </div>
      </div>

      {canRecall(claim) && calc.missingStayBills > 0 && (
        <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
          <Zap className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Submitted without stay or food bills — the outstation days are at 50 % of DA. Recall and scan the bills to be paid what you spent, up to the full DA.
        </p>
      )}
      {isLocked(claim) && (
        <p className="flex items-start gap-2 rounded-2xl bg-gray-50 px-3 py-2.5 text-[12.5px] text-gray-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {claim.status === "paid"
            ? "Finalised — in payroll. It can no longer change."
            : `Approved by ${f.manager} · final check next, then payroll · can't be recalled now.`}
        </p>
      )}

      {/* with the car on, what is still missing before it can go */}
      {editable && calc.carBlock && (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] font-semibold text-amber-800">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">Own car · bills needed</span>
          <span className="flex items-start gap-2">
            <Fuel className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {calc.carBlock}
          </span>
        </div>
      )}

      {/* total + the one action, pinned to the bottom; Submit asks first */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col gap-3 border-t bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {/* ONE upload, always in reach (16 Nov 2026): the bill itself says what
            it is. Stay and food bills on a trip with outstation days; fuel
            once the GM approved the car (asked for on the month summary) --
            with both, the one button takes all three. Tolls are not paid. */}
        {editable && !confirming && (stayFood || fuelOn) && (
          <button
            type="button"
            onClick={() => scan(upSlot)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-blue-300 bg-blue-50 px-4 text-[14px] font-bold text-blue-700 active:bg-blue-100"
          >
            {reading[upSlot] ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : upSlot === "car" ? (
              <Fuel className="h-4 w-4 text-green-600" aria-hidden />
            ) : (
              <Camera className="h-4 w-4 text-green-600" aria-hidden />
            )}
            {reading[upSlot] ? `Reading ${reading[upSlot]} bill${reading[upSlot] > 1 ? "s" : ""}… · add another` : UPLOAD_LABEL[upSlot]}
            {upCount > 0 && !reading[upSlot] && (
              <span className="text-[12px] font-semibold text-blue-600">
                · {upCount} added · {inr(upAmount)}
              </span>
            )}
          </button>
        )}
        {editable && confirming && (
          <div role="alertdialog" aria-label="Confirm submit" className="flex flex-col gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-3">
            <b className="text-[14.5px] font-extrabold text-gray-900">
              Send {inr(calc.total)} · {rangeLabel(trip.from, trip.to)} to {f.manager}?
            </b>
            {/* short: what goes, where, and that it can still be recalled */}
            <span className="text-[12.5px] leading-snug text-gray-600">
              TA {inr(calc.ta)} + DA {inr(calc.da)} · into your {mon} claim · recall any time before approval.
              {calc.missingStayBills ? ` ${calc.missingStayBills} day${calc.missingStayBills > 1 ? "s" : ""} at 50 % (no bill).` : ""}
            </span>
            <span className="flex gap-2">
              <button type="button" disabled={!!busy} onClick={() => setConfirming(false)} className="min-h-11 flex-1 rounded-xl border border-gray-300 bg-white text-[14px] font-bold text-gray-800">
                Cancel
              </button>
              <button type="button" disabled={!!busy} onClick={submit} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 text-[14px] font-bold text-white disabled:opacity-60">
                {busy === "submit" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Yes, send
              </button>
            </span>
          </div>
        )}
        {/* submitted, but the month is not sent yet: the trip waits in the
            month's claim -- sending is done once, for the whole month */}
        {!editable && (monthState === "draft" || monthState === "rejected") && (
          <button
            type="button"
            onClick={f.openKpi}
            className="flex w-full items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-left text-amber-900 active:bg-amber-100"
          >
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug">
              {monthState === "rejected"
                ? `${mon} was sent back by ${f.manager}. Fix the trip, then send ${mon} again.`
                : `Your ${mon} claim (${inr(mc?.total)}) is saved but not sent to ${f.manager} yet.${sendError ? ` ${sendError}` : ""}`}
            </span>
            <span className="flex shrink-0 items-center text-[13px] font-extrabold text-blue-700">
              Send {mon} <ChevronRight className="h-4 w-4" aria-hidden />
            </span>
          </button>
        )}
        <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[13px] text-gray-500">
            Total · {daysLabel}
            {!editable ? ` · ${monthState === "draft" ? `In ${mon} claim · not sent` : monthState === "sent" ? "Sent for approval" : STATUS_LABEL[statusKey(claim)]}` : ""}
          </span>
          <b className="block text-[22px] font-extrabold tracking-tight text-gray-900">{inr(calc.total)}</b>
        </div>
        {editable ? (
          <button
            type="button"
            disabled={!!busy || calc.total <= 0 || !!calc.carBlock || confirming}
            onClick={() => setConfirming(true)}
            className="flex min-h-[52px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 text-[16px] font-bold text-white transition active:scale-[.98] disabled:bg-gray-200 disabled:text-gray-500"
          >
            {claim.recalled ? "Resubmit" : "Submit"} {trip.kind === "tour" ? "tour" : trip.kind === "hq" ? (nDays > 1 ? "HQ days" : "HQ day") : "day"}
          </button>
        ) : canRecall(claim) && (monthState === "review" || monthState === "approved" || monthState === "final") ? (
          <button type="button" onClick={f.closeSheet} className="flex min-h-[52px] shrink-0 items-center rounded-2xl bg-gray-100 px-6 text-[15px] font-bold text-gray-900">
            Close
          </button>
        ) : canRecall(claim) ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={recall}
            className="flex min-h-[52px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-gray-100 px-5 text-[15px] font-bold text-gray-900 active:bg-gray-200"
          >
            {busy === "recall" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Undo2 className="h-4 w-4" aria-hidden />}
            Recall &amp; edit
          </button>
        ) : (
          <button type="button" onClick={f.closeSheet} className="flex min-h-[52px] shrink-0 items-center rounded-2xl bg-gray-100 px-6 text-[15px] font-bold text-gray-900">
            Close
          </button>
        )}
        </div>
      </div>
    </div>
  );
}

const nightsAny = (calc) => calc.nights.length > 0;

/* One line of money: a short label (TA / DA, or blank under the line above),
   what it is, and the amount on the right. */
function MoneyRow({ label, amount, note, children }) {
  return (
    <div className="flex items-baseline gap-3 text-[12.5px] leading-snug">
      <span className="w-6 shrink-0 text-[11px] font-extrabold text-gray-400">{label}</span>
      <span className="min-w-0 flex-1 text-gray-600">{children}</span>
      <b className="shrink-0 text-[13px] font-extrabold tabular-nums text-gray-900">{amount == null ? note || "" : inr(amount)}</b>
    </div>
  );
}

function TripDay({ row, data, car, last, multi, night, bills, stayOff, billStrip, carShare }) {
  const d = new Date(row.date + "T00:00:00");
  const dow = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getDay()];
  const stops = (row.route || []).map((s) => s.place).filter(Boolean);
  const basis = fareBasis(row, data);
  // the night away is named on its own line, not as "(stay)" after the route (21 Nov 2026) --
  // not on the day of the journey home
  const route = stops.length ? stops.join(" → ") : DAY_TYPE_LABEL[row.dayType] || row.dayType || row.kind;
  const stayAt = night && !cameHome(row) ? row.awayHq || stops[stops.length - 1] || null : null;
  const nightLabel = `outstation ${dayLabel(row.date)}`;
  // the day's TA in parts, as the console shows it: the local run (km × rate,
  // each way) and, on a day that also moves between HQs, the train fare; the
  // two add up to the console's TA
  const legKm = row.chart?.km ?? row.km;
  const local = Math.max(0, (row.ta || 0) - (row.journey?.fare || 0));
  const byKm = local > 0 && legKm > 0 && legKm <= (data?.bands?.eqKm ?? 100);
  const perKm = byKm ? Math.round((local / (2 * legKm)) * 100) / 100 : null;
  // with a leg flown, the journey line shows what was driven; all flown, the flight
  const jr = row.journey && "road" in row.journey ? row.journey.road : row.journey;
  const flownOnly = !!row.journey && "road" in row.journey && !row.journey.road;

  return (
    // the date sits beside the day's heading only; the money box below runs the full width (21 Nov 2026)
    <li className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2">
      {/* the timeline: a filled dot on a night away, an open one otherwise */}
      <span className="relative flex justify-center">
        <span className={cn("relative z-10 mt-1 h-3.5 w-3.5 rounded-full border-2 border-blue-600", night ? "bg-blue-600" : "bg-white")} aria-hidden />
        {!last && <span className="absolute bottom-0 top-5 w-px bg-blue-200" aria-hidden />}
      </span>
      <div className={cn("min-w-0", !last && "pb-5")}>
        <div className="flex gap-2">
        <span className="flex w-10 shrink-0 flex-col leading-none">
          <b className="text-[19px] font-extrabold text-gray-900">{d.getDate()}</b>
          <small className="mt-1 text-[10.5px] font-bold text-gray-500">{dow}</small>
        </span>
        <div className="min-w-0 flex-1">
        <b className="block text-[15px] font-bold leading-snug text-gray-900">{route}</b>
        {stayAt && (
          <span className="mt-0.5 flex items-center gap-1 text-[11.5px] font-semibold text-gray-500">
            <BedDouble className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Night in {stayAt}
          </span>
        )}
        {/* the day's visits by town, and other work (a meeting) */}
        {(row.visits > 0 || (row.otherWork || []).length > 0) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11.5px] text-gray-500">
            {row.visits > 0 && <b className="font-bold text-blue-700">{row.visits} visit{row.visits > 1 ? "s" : ""}</b>}
            {(row.visitPlaces || []).slice(0, 4).map(([town, k]) => (
              <span key={town} className="rounded-full bg-gray-100 px-1.5 font-semibold text-gray-600">
                {town} {k}
              </span>
            ))}
            {(row.otherWork || []).map((w) => (
              <span key={w} className="rounded-full bg-violet-50 px-1.5 font-semibold text-violet-700">
                {w}
              </span>
            ))}
          </span>
        )}
        </div>
        </div>
        {/* the day's money in plain rows (13 Nov 2026): what it is on the left,
            the amount on the right -- TA (the journey, the local run ↑ there
            ↓ back), then DA */}
        {row.payable ? (
          <div className="mt-2 flex flex-col gap-1.5 rounded-xl bg-gray-50 px-3 py-2.5">
            {car ? (
              // the own car: one TA line, this day's share of the fuel by km
              <MoneyRow label="TA" amount={carShare ? carShare.amount : null} note="fuel">
                <Car className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                {jr ? `${jr.from} → ${jr.to} + local` : "Local"}
                {carShare ? ` · ${carShare.km} km by car` : ""}
              </MoneyRow>
            ) : (
              jr && (
                <MoneyRow label="TA" amount={row.journey.fare}>
                  <TrainFront className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                  {jr.from} → {jr.to}
                  {jr.km != null ? ` · ${Math.round(jr.km)} km` : ""}
                </MoneyRow>
              )
            )}
            {flownOnly && (
              <MoneyRow label="TA" amount={0}>
                <Plane className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                {row.journey.from} → {row.journey.to} · flight
              </MoneyRow>
            )}
            {car ? null : byKm ? (
              <MoneyRow label={jr || flownOnly ? "" : "TA"} amount={local}>
                {/* which run: "Local · Erode ↔ Gobi" on a day that also travelled (21 Nov 2026) */}
                {row.journey ? `Local${row.awayHq && row.farthest ? ` · ${row.awayHq} ↔ ${row.farthest}` : ""} · ` : ""}
                <b className="font-bold text-gray-800">↑ {legKm} km ↓ {legKm} km</b> × ₹{perKm}
              </MoneyRow>
            ) : row.journey ? (
              local > 0 && (
                <MoneyRow label="" amount={local}>
                  Local{row.km != null ? ` · ${row.km} km` : ""}
                </MoneyRow>
              )
            ) : row.ta > 0 ? (
              <MoneyRow label="TA" amount={row.ta}>
                {basis || `Fare${row.km != null ? ` · ${row.km} km` : ""}`}
              </MoneyRow>
            ) : (
              // no travel that day: TA ₹0, said, not left out (14 Nov 2026) -- no words (21 Nov 2026)
              // no journey or local run: the day type only (21 Nov 2026)
              <MoneyRow label="TA" amount={0}>
                {row.dayType === "HQ" ? "HQ day" : AWAY_TYPES.has(row.dayType) ? "OS day" : row.dayType === "EQ" ? "EQ day" : null}
              </MoneyRow>
            )}
            {row.da > 0 && (
              <MoneyRow label="DA" amount={night && bills ? night.paid : row.da}>
                {night
                  ? bills
                    ? "outstation · stay + food bills"
                    : night.fullNoBill
                      ? "outstation · 100 % (no bill needed)"
                      : "outstation · 50 % (no bill yet)"
                  : row.dayType === "HQ"
                    ? "HQ day"
                    : AWAY_TYPES.has(row.dayType)
                      ? "outstation · no night away"
                      : "ex-HQ day · return to HQ"}
              </MoneyRow>
            )}
            {/* marked on the dashboard: the company paid it, so nothing to claim */}
            {row.company === "Stay" && (
              <MoneyRow label="DA" amount={0}>
                stay paid by the company · no DA
              </MoneyRow>
            )}
            {row.company === "Travel" && (
              <MoneyRow label="TA" amount={0}>
                travel paid by the company · no TA
              </MoneyRow>
            )}
          </div>
        ) : (
          <span className="mt-0.5 block pl-12 text-[13px] text-gray-500">{`${row.dayType || row.kind} · no TA`}</span>
        )}
        {/* a flight (marked on the field-expenses dashboard): the flown legs pay
            no TA -- the company books the ticket -- the rest are paid */}
        {row.flight && (
          <span className="mt-1.5 flex w-fit max-w-full items-center gap-1.5 rounded-xl bg-sky-50 px-2.5 py-1.5 text-[12px] font-semibold text-sky-800">
            <Plane className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              Travel by company · TA ₹0{row.flight.legs.length ? ` for ${row.flight.legs.join(", ")}` : ""}
              {row.flight.notPaid > 0 ? ` (${inr(row.flight.notPaid)} not claimed)` : ""}
            </span>
          </span>
        )}

        {/* the night's DA; the stay bill itself is scanned in "Stay & food bills" */}
        {/* no bill yet: the DA row above says 50 %; the chip shows the bills once there are some */}
        {night ? (
          !bills ? null : (
          <span
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold",
              bills ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
            )}
          >
            <BedDouble className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {/* short: the bills, then what the day is paid -- "max" when the
                day's full DA cuts it, "min 50 %" when it is raised */}
            {bills ? (
              <span title={`${nightLabel} · the day's DA is paid between ${inr(night.amount)} (50 %) and ${inr(night.full)} (100 %)`}>
                {[bills.stay ? `Stay ${inr(bills.stay)}` : null, bills.food ? `Food ${inr(bills.food)}` : null].filter(Boolean).join(" + ")}
                {night.capped ? (
                  <>
                    {" "}= {inr(night.billSum)} → <b className="font-extrabold">{inr(night.paid)}</b> <span className="font-medium opacity-80">max</span>
                  </>
                ) : night.topUp ? (
                  <>
                    {" "}→ <b className="font-extrabold">{inr(night.paid)}</b> <span className="font-medium opacity-80">min 50 %</span>
                  </>
                ) : bills.stay && bills.food ? (
                  <>
                    {" "}= <b className="font-extrabold">{inr(night.paid)}</b>
                  </>
                ) : null}
              </span>
            ) : (
              <span title={nightLabel}>
                No bill yet · 50 % · <b className="font-extrabold">{inr(night.amount)}</b>
              </span>
            )}
          </span>
        )) : row.payable && (bills || stayOff) ? (
          /* a holiday / weekly-off day inside the stay (13 Nov 2026): no DA, so
             no share of the hotel bill (it is split over the working nights)
             and its own food is not paid -- grey, not green */
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-2.5 py-1.5 text-[12px] font-semibold text-gray-600">
            <BedDouble className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
            {[stayOff ? "Hotel night · split onto working days" : bills?.stay ? `Stay ${inr(bills.stay)}` : null, bills?.food ? `Food ${inr(bills.food)} not paid (no DA)` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : (
          row.payable && multi && (
            <span className="mt-2 inline-flex rounded-xl bg-gray-100 px-2.5 py-1.5 text-[12.5px] font-semibold text-gray-600">
              {last && multi ? "back at HQ" : multi ? "on tour" : "return to HQ"} · no outstation DA
            </span>
          )
        )}
        {/* that day's bills as pictures -- tap one to see it full screen; none on an off / leave day (21 Nov 2026) */}
        {row.payable ? billStrip : null}
      </div>
    </li>
  );
}
