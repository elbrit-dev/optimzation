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
  ChevronRight,
  Eye,
  Fuel,
  Info,
  Loader2,
  MapPin,
  Route,
  ShieldCheck,
  TrainFront,
  Undo2,
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
import { FUEL_PRICE, MILEAGE_KM_PER_L, fuelCost, tollEstimate } from "@calendar/lib/field-expenses/claim-rules";
import { PREVIEW, STATUS_LABEL, canRecall, isLocked, statusKey } from "@calendar/lib/field-expenses/trip-claims-store";
import { readTripBill } from "@calendar/lib/field-expenses/bill-reader";
import { addTripToMonth, monthWord, removeTripFromMonth, tripClaimRows } from "@calendar/lib/field-expenses/erp-claim";
import { CarRequestSheet, KpiSheet, RequestSheet } from "@calendar/components/calendar/field/field-sheets";
import { BILL_NAME, BillChip, BillEditor, ChipButton, ManualBill, useBillPicker } from "@calendar/components/calendar/field/field-bills";
import { useTripBillViewer } from "@calendar/components/calendar/field/field-bill-view";

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
  const awaiting = f.claimed.filter((x) => ["submitted", "sent", "review"].includes(x.claim.status)).length;
  const canOpen = f.status === "ready";

  // the tile's two halves: what is left to claim, and what is waiting on someone else
  let left;
  let right = null;
  if (f.status === "loading" || f.status === "idle") left = "loading…";
  else if (f.status === "error") left = f.error?.code === "no-month" ? `${m} not built yet` : f.error?.status === 401 || f.error?.status === 403 ? "sign in again" : "TA/DA unavailable";
  else {
    left = toClaim.length ? `${toClaim.length} to claim` : f.claimed.length ? "nothing to claim" : `nothing in ${m.slice(0, 3)}`;
    right = awaiting ? `${awaiting} awaiting` : f.claimed.length && !toClaim.length ? "all in" : toClaim.length ? inr(toClaim.reduce((a, x) => a + x.calc.total, 0)) : null;
  }
  // the fill: how many trips are past "to claim"
  const done = f.claimed.length ? (f.claimed.length - toClaim.length) / f.claimed.length : 0;

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
          <span className="truncate">· {left}</span>
        </span>
        {right && <b className="relative shrink-0 text-[12.5px] font-extrabold text-gray-900">{right}</b>}
        {canOpen && <ChevronDown className={cn("relative h-4 w-4 shrink-0 text-gray-400 transition-transform", f.stripOpen && "rotate-180")} aria-hidden />}
      </button>

      {canOpen && f.stripOpen && (
        <>
          <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Trips">
            {[...f.claimed]
              .sort((a, b) => rank(a.claim) - rank(b.claim) || b.trip.from.localeCompare(a.trip.from))
              .map((x) => (
                <TripCard key={x.trip.id} item={x} canCar={f.canCar} onOpen={() => f.openTrip(x.trip.id)} onRequestOpen={(id) => f.openRequest(id)} />
              ))}
            <MonthCard month={m} stats={f.stats} claimed={f.claimed} pulledAt={f.data?.pulledAt} onOpen={f.openKpi} />
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

// to claim first, then waiting, then done
const rank = (c) => ({ unclaimed: 0, rejected: 0, review: 1, submitted: 2, sent: 2, okd: 3, approved: 3, paid: 4 })[c.status] ?? 5;

/* Every card is fixed-width and clips: each line has its own slot, long text
   ends in "…" instead of running into the next line or past the border. */
const CARD = "flex shrink-0 flex-col gap-0.5 overflow-hidden rounded-xl border border-l-[3px] px-2.5 py-2 text-left shadow-sm active:opacity-80";

/* A trip card; an RBM, ZSM or SM asks for the car from here, and the card
   says where that request stands. */
function TripCard({ item, canCar, onOpen, onRequestOpen }) {
  const { trip, claim, calc } = item;
  const meta = [
    rangeLabel(trip.from, trip.to),
    `${trip.km} km`,
    calc.nights.length ? `${calc.nights.length} night${calc.nights.length > 1 ? "s" : ""}` : null,
    calc.car ? "car" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const req = calc.request;
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
        <b className="min-w-0 flex-1 truncate text-[13px] font-bold text-gray-900">{trip.name}</b>
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
    {/* where the trip's own-car request stands, on the card itself: waiting,
        approved (and for how much) or not approved -- tap for the request */}
    {canCar && req && ["pending", "approved", "rejected"].includes(req.status) && (
      <div className="border-t border-gray-100 px-2 py-1">
        <button
          type="button"
          onClick={() => onRequestOpen(req.id)}
          className={cn(
            "flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-extrabold",
            req.status === "approved" ? "bg-green-50 text-green-700" : req.status === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"
          )}
        >
          {req.status === "approved" ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Car className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          <span className="truncate">
            {req.status === "approved"
              ? `Car approved · up to ${inr(req.ask)}`
              : req.status === "rejected"
                ? "Car not approved · fare paid"
                : `Car requested · ${inr(req.asked || req.ask)} · awaiting GM`}
          </span>
        </button>
      </div>
    )}
    </div>
  );
}

const Amount = ({ label, value, hint }) => (
  <span className="flex min-w-0 flex-col leading-tight" title={hint}>
    <small className="truncate text-[8.5px] font-bold uppercase tracking-wide text-gray-400">{label}</small>
    <b className="truncate text-[12px] font-extrabold text-gray-900">{inr(value)}</b>
  </span>
);

function MonthCard({ month, stats, claimed, pulledAt, onOpen }) {
  const by = (pred) => claimed.filter((x) => pred(x.claim)).reduce((s, x) => s + x.calc.total, 0);
  const toClaim = by((c) => c.status === "unclaimed");
  // approved by the officer (waiting for the final check) or finalised
  const payroll = by((c) => c.status === "approved" || c.status === "paid");
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
        <b className="flex-1 whitespace-nowrap text-[14px] font-extrabold text-gray-900">{month} so far</b>
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

/* ---------- the day's row in the agenda list ---------- */

export function FieldDayRow({ date }) {
  const f = useFieldExpenses();
  if (!f.enabled || f.status !== "ready") return null;
  const row = f.dayOf(date);
  if (!row) return null;

  if (row.kind === "working" && !row.payable) {
    return (
      <p className="mx-4 mb-3 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
        No visits logged on this working day — no TA/DA.
      </p>
    );
  }
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
      <Modal side={side} open={kind === "kpi"} onOpenChange={close}>
        <ModalContent className={cls}>{kind === "kpi" && <KpiSheet />}</ModalContent>
      </Modal>
    </>
  );
}

function tripStory(trip) {
  const paid = trip.days.filter((d) => d.payable);
  if (!paid.length) return rangeLabel(trip.from, trip.to);
  if (trip.kind === "hq") {
    const n = paid.length;
    return `${n} day${n > 1 ? "s" : ""} worked at HQ · ${trip.visits} visit${trip.visits === 1 ? "" : "s"} · DA only, no travel`;
  }
  if (trip.kind === "day") {
    const d = paid[0];
    return `${dayLabel(d.date)} · out to ${dayPlace(d) || "the field"} and back the same day · ${d.km ?? "?"} km`;
  }
  const first = paid[0];
  const last = paid[paid.length - 1];
  const out = first.journey ? `Left ${first.journey.from || "HQ"} ${dayLabel(first.date)}` : `Out from ${dayLabel(first.date)}`;
  const back = last.journey && last !== first ? ` · back at ${last.journey.to || "HQ"} ${dayLabel(last.date)}` : "";
  return `${out} · ${trip.days.length} days away${back} · ${trip.km} km`;
}

/* How the trip was travelled, inside the trip itself (RBM, ZSM, SM): normal
   TA (the fare), or own car -- ticked, it shows the ask (km ÷ mileage × fuel
   price + tolls, editable) and sends the request to the approver from here.
   Waiting, it says so (withdraw to change it); approved, the trip's TA turns
   into fuel + tolls and the fuel / toll scans appear in the TA block above.
   Until approval the trip is paid the normal fare. */
function CarMode({ trip, calc, editable, tab, setTab }) {
  const f = useFieldExpenses();
  const req = calc.request;
  // the tab is the trip sheet's: it also decides the pinned upload button
  // (fare -> stay / food bills, own car -> fuel / toll bills)
  const on = tab === "car";
  // one fuel price for every car: petrol (12 Nov 2026)
  const fuel = "Petrol";
  const [askIn, setAskIn] = useState(null);
  const [busy, setBusy] = useState(false);
  const km = trip.km || 0;
  const tolls = tollEstimate(km);
  const sugg = fuelCost(km, fuel) + tolls;
  const ask = askIn != null ? Math.max(0, Math.round(Number(askIn) || 0)) : sugg;

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
  const send = () =>
    act(async () => {
      await f.actions.requestOwnCar({
        planId: trip.id,
        tripId: trip.id,
        from: trip.from,
        to: trip.to,
        places: ["HQ", ...trip.places, "HQ"].join(" → "),
        km,
        fuel,
        fuelCost: fuelCost(km, fuel),
        tolls,
        suggested: sugg,
        ask,
      });
    }, `Car request sent to ${f.carApprover}`);

  const box = "rounded-2xl border border-gray-200 bg-white px-3 py-2.5";
  // already asked: its state, and what can be done with it (the GM decides in
  // the ERP -- Car Request -- from the approvals page)
  const live = req && req.status !== "rejected" ? req : null;
  const ok = live?.status === "approved";
  const changed = ok && live.asked && live.approvedAmount !== live.asked;
  const status = live ? (
      <div className={cn(box, "flex flex-col gap-2", ok ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50")}>
        <span className="flex items-center gap-2 text-[13px] font-bold text-gray-900">
          <Car className={cn("h-4 w-4", ok ? "text-green-700" : "text-amber-700")} aria-hidden />
          {ok
            ? `Own car approved up to ${inr(req.ask)}${changed ? ` (you asked ${inr(req.asked)})` : ""}`
            : `Own car requested · ${inr(req.ask)} · waiting for ${f.carApprover}`}
        </span>
        <span className="text-[12.5px] leading-snug text-gray-600">
          {ok ? "Fuel / toll bills replace the fare · no bills, the fare is paid." : "Fare until approved · then upload fuel / toll bills."}
          {ok && req.note ? <span className="mt-0.5 block italic text-gray-500">{f.carApprover.replace(/^the /, "")}: &ldquo;{req.note}&rdquo;</span> : null}
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
  ) : null;
  // rejected: why, and the rep may ask again below
  const rejected = req && req.status === "rejected" ? (
    <div className={cn(box, "flex flex-col gap-1 border-rose-200 bg-rose-50")}>
      <span className="flex items-center gap-2 text-[13px] font-bold text-rose-900">
        <Car className="h-4 w-4 text-rose-700" aria-hidden />
        Own car not approved · you asked {inr(req.asked)}
      </span>
      <span className="text-[12.5px] leading-snug text-rose-900">
        {req.note ? `${f.carApprover.replace(/^the /, "")}: “${req.note}”` : "No reason given."} · fare paid{editable ? " · ask again below" : ""}
      </span>
    </div>
  ) : null;
  if (!editable) return status || rejected ? <div className="col-start-1 col-end-4 mt-2">{status || rejected}</div> : null;
  return (
    <div className="col-start-1 col-end-4 mt-2 flex flex-col gap-2">
      <span className="text-[13px] font-bold text-gray-500">How did you travel?</span>
      <span role="radiogroup" aria-label="How did you travel" className="grid grid-cols-2 gap-1 rounded-2xl bg-gray-100 p-1">
        {[
          [false, "Normal TA · fare"],
          [true, "Own car · fuel + toll"],
        ].map(([v, label]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={on === v}
            onClick={() => setTab(v ? "car" : "fare")}
            className={cn("min-h-10 rounded-xl px-2 text-[13px] font-bold", on === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")}
          >
            {label}
          </button>
        ))}
      </span>
      {on && status}
      {on && !live && rejected}
      {!on && live && (
        <span className="text-[12px] leading-snug text-gray-500">
          {ok ? "Own car approved for this trip — open Own car to upload the fuel and toll bills." : "Own car requested — open Own car to see it."}
        </span>
      )}
      {on && !live && (
        <div className={cn(box, "flex flex-col gap-2 bg-gray-50")}>
          <span className="flex justify-between gap-2 text-[12.5px] text-gray-600">
            <span>Fuel price</span>
            <b className="text-gray-900">₹{FUEL_PRICE[fuel]}/l</b>
          </span>
          <span className="flex justify-between gap-2 text-[12.5px] text-gray-600">
            <span>Fuel · {km} km ÷ {MILEAGE_KM_PER_L} km/l × ₹{FUEL_PRICE[fuel]}</span>
            <b className="text-gray-900">{inr(fuelCost(km, fuel))}</b>
          </span>
          <span className="flex justify-between gap-2 text-[12.5px] text-gray-600">
            <span>Tolls on this route</span>
            <b className="text-gray-900">{inr(tolls)}</b>
          </span>
          <span className="flex justify-between gap-2 border-t border-dashed border-gray-300 pt-1.5 text-[12.5px] font-bold text-gray-900">
            <span>Suggested</span>
            <b>{inr(sugg)}</b>
          </span>
          <label className="flex items-center justify-between gap-2 text-[12.5px] font-bold text-gray-700">
            Your ask
            <span className="flex h-9 w-32 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2">
              <span className="text-gray-400">₹</span>
              <input type="number" inputMode="numeric" min="0" step="10" value={askIn ?? String(sugg)} onChange={(e) => setAskIn(e.target.value)} className="w-full bg-transparent text-[13px] font-semibold outline-none" aria-label="Amount asked" />
            </span>
          </label>
          <button type="button" disabled={busy || !(km > 0 && ask > 0)} onClick={send} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-[14px] font-bold text-white disabled:bg-gray-200 disabled:text-gray-500">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Send to {f.carApprover} for approval
          </button>
          <span className="text-[11.5px] leading-snug text-gray-500">
            {f.carApprover.replace(/^the /, "")} approves (may change the amount) or rejects · fare until then.
          </span>
        </div>
      )}
    </div>
  );
}

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
  const [tab, setTab] = useState(() => (calc.request && calc.request.status !== "rejected" ? "car" : "fare"));
  const carTab = f.canCar && trip.kind !== "hq" && tab === "car";
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
  const [reading, setReading] = useState({ da: 0, car: 0 });
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
        const slot = kind === "da" ? (r.bill.kind === "Stay" ? "stays" : "foods") : kind === "car" ? (r.bill.kind === "Toll" ? "tolls" : "fuels") : kind;
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
          {rangeLabel(trip.from, trip.to)} · {nDays} day{nDays > 1 ? "s" : ""} · {trip.km} km
        </p>
      </div>

      {/* justification: the route, then one TA line for the whole trip */}
      <div>
        <span className={sectionLabel}>Justification · this trip</span>
        <p className="mt-1 flex items-start gap-1.5 text-[13.5px] leading-snug text-blue-800">
          <Route className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {tripStory(trip)}
        </p>
      </div>

      <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-2">
        <span className="text-[13px] font-extrabold text-gray-500">TA</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[15px] text-gray-600">
          {calc.car ? (
            <>
              <b className="inline-flex items-center gap-1 font-extrabold text-gray-900">
                <Car className="h-4 w-4 text-green-600" aria-hidden /> car
              </b>
              <span>·</span>
              {calc.carBilled ? (
                <>
                  <span>
                    fuel <b className="font-extrabold text-gray-900">{inr(calc.fuel)}</b> + toll <b className="font-extrabold text-gray-900">{inr(calc.tolls)}</b>
                  </span>
                </>
              ) : (
                <>
                  <b className="font-extrabold text-gray-900">fare</b>
                  <span>· no bills yet</span>
                </>
              )}
            </>
          ) : (
            <>
              <b className="font-extrabold text-gray-900">fare</b>
              <span>· {trip.km} km</span>
            </>
          )}
        </span>
        <b className="text-[18px] font-extrabold text-gray-900">{inr(calc.ta)}</b>

        {calc.car && (
          <div className="col-start-2 col-end-4 mt-2 text-[12.5px] text-gray-600">
            <span className="flex items-start gap-1.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
              <span>
                {calc.carApproved ? "approved up to" : "allowed up to"} <b className="text-gray-900">{inr(calc.cap)}</b>
                {!req?.ask && ` · ${trip.km} km ÷ ${MILEAGE_KM_PER_L} km/l × ₹${FUEL_PRICE.Petrol} + tolls ${inr(calc.cap - Math.round((trip.km / MILEAGE_KM_PER_L) * FUEL_PRICE.Petrol))}`}
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

        <p className="col-start-2 col-end-4 mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug text-gray-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {calc.car
            ? !calc.carBilled
              ? `No fuel / toll bill yet · paid the fare ${inr(calc.fare)} · bills pay up to ${inr(calc.cap)}.`
              : calc.capped
                ? `Car bills ${inr(calc.fuel + calc.tolls)} → TA ${inr(calc.cap)} (approved max).`
                : `Fuel + toll are the TA · up to ${inr(calc.cap)}.`
            : calc.carPending
              ? "Car requested · paid the fare until the GM approves."
              : "TA · one fare for the whole trip."}
        </p>

        {/* normal fare or own car, asked for right here (RBM, ZSM, SM) */}
        {f.canCar && trip.kind !== "hq" && <CarMode trip={trip} calc={calc} editable={editable} tab={tab} setTab={setTab} />}
      </div>

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
            bills={calc.billsByDate?.[d.date] || null}
            stayOff={!!calc.stayOff?.[d.date]}
            billStrip={billView.strip(d.date)}
          />
        ))}
      </ol>

      {/* DA: the ERP's daily allowance -- an outstation day at 50 % of its
          rate; with stay + food bills those days are paid what the bills come
          to, pooled over the trip: at least 50 %, at most the full rate. */}
      <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-2 border-t border-dashed border-gray-300 pt-3">
        <span className="text-[13px] font-extrabold text-gray-500">DA</span>
        <span className="min-w-0 text-[15px] text-gray-600">
          {calc.pool?.on
            ? `${calc.nights.length} outstation day${calc.nights.length > 1 ? "s" : ""} · bills day by day`
            : calc.nights.length
              ? `${calc.nights.length} outstation day${calc.nights.length > 1 ? "s" : ""} at 50 %`
              : ""}
        </span>
        <b className="text-[18px] font-extrabold text-gray-900">{inr(calc.da)}</b>
      </div>

      {/* bills only for a night spent away: back at HQ the same day, no stay
          or food bill is asked for (one already added still shows) */}
      {calc.billsAllowed && (calc.nights.length > 0 || calc.stayBills + calc.foodBills > 0) && (
        <div>
          <span className={sectionLabel}>DA bills · stay &amp; food</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {["stays", "foods"].flatMap((kind) =>
              (claim[kind] || []).map((b) => (
                <BillChip key={b.id} kind={kind} bill={b} on={editing?.id === b.id} readOnly={!editable} onClick={() => setEditing(editing?.id === b.id ? null : { kind, id: b.id })} />
              ))
            )}
            {!calc.stayBills && !calc.foodBills && <span className="text-[12.5px] text-gray-500">No bill yet — upload them with the button at the bottom.</span>}
          </div>
          {editable && (editing?.kind === "stays" || editing?.kind === "foods") && (
            <BillEditor
              key={editing.id}
              bill={(claim[editing.kind] || []).find((b) => b.id === editing.id)}
              kind={editing.kind}
              onRemove={() => removeBill(editing.kind, editing.id)}
            />
          )}
          {calc.nights.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug text-gray-500">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {calc.pool?.on
                ? `Each day: stay + food, kept between 50 % and 100 % of its DA.${calc.pool.unpaid ? ` ${inr(calc.pool.unpaid)} on days with no outstation DA.` : ""}`
                : `No bill yet · 50 % DA ${inr(calc.pool?.half || 0)} · add stay / food bills for up to 100 %.`}
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
        {/* what the final check changed on this trip's days, who and why */}
        {(mc?.adjustments || []).filter((a) => a.date >= trip.from && a.date <= trip.to).length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-snug text-amber-900">
            <b className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">Changed on the final check</b>
            {mc.adjustments
              .filter((a) => a.date >= trip.from && a.date <= trip.to)
              .map((a, i) => (
                <span key={i}>
                  {a.type} · {dayLabel(a.date)}: <s>{inr(a.amount)}</s> → <b>{inr(a.final)}</b>
                  {a.by ? ` · by ${a.by}` : ""}
                  {a.reason ? ` — “${a.reason}”` : ""}
                </span>
              ))}
          </div>
        )}
        <div className="mt-1.5 flex items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-3.5 py-3">
          <div className="min-w-0">
            <small className="block text-[11.5px] font-extrabold uppercase tracking-wider text-blue-700">Trip cost</small>
            <b className="block text-[28px] font-extrabold leading-tight tracking-tight text-gray-900">{inr(calc.total)}</b>
            <span className="block text-[13px] text-gray-500">
              TA {inr(calc.ta)}
              {calc.da || nightsAny(calc) ? ` + DA ${inr(calc.da)}${calc.missingStayBills ? " · no stay bill" : ""}` : ""}
            </span>
          </div>
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
        {/* ONE upload for stay and food bills, always in reach: the bill itself
            says whether it is a hotel or a food bill */}
        {/* own-car tab: fuel and toll bills, only once the GM approved the car */}
        {editable && carTab && !confirming && (
          <button
            type="button"
            disabled={!calc.carApproved}
            onClick={() => scan("car")}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-blue-300 bg-blue-50 px-4 text-[14px] font-bold text-blue-700 active:bg-blue-100 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
          >
            {reading.car ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Fuel className={cn("h-4 w-4", calc.carApproved ? "text-green-600" : "text-gray-400")} aria-hidden />}
            {reading.car ? `Reading ${reading.car} bill${reading.car > 1 ? "s" : ""}… · add another` : "Upload fuel / toll bill"}
            {!calc.carApproved && <span className="text-[12px] font-semibold">· {calc.carPending ? `after ${f.carApprover.replace(/^the /, "")} approves` : "ask for the car first"}</span>}
            {calc.carApproved && calc.fuel + calc.tolls > 0 && !reading.car && (
              <span className="text-[12px] font-semibold text-blue-600">
                · {(claim.fuels || []).length + (claim.tolls || []).length} added · {inr(calc.fuel + calc.tolls)}
              </span>
            )}
          </button>
        )}
        {editable && !carTab && calc.billsAllowed && calc.nights.length > 0 && !confirming && (
          <button
            type="button"
            disabled={false}
            onClick={() => scan("da")}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-blue-300 bg-blue-50 px-4 text-[14px] font-bold text-blue-700 active:bg-blue-100 disabled:opacity-60"
          >
            {reading.da ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4 text-green-600" aria-hidden />}
            {reading.da ? `Reading ${reading.da} bill${reading.da > 1 ? "s" : ""}… · add another` : "Upload stay / food bill"}
            {calc.stayBills + calc.foodBills > 0 && !reading.da && (
              <span className="text-[12px] font-semibold text-blue-600">
                · {calc.stayBills + calc.foodBills} added · {inr(calc.pool?.bills || 0)}
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

function TripDay({ row, data, car, last, multi, night, bills, stayOff, billStrip }) {
  const d = new Date(row.date + "T00:00:00");
  const dow = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getDay()];
  const stops = (row.route || []).map((s) => s.place).filter(Boolean);
  const basis = fareBasis(row, data);
  const route = stops.length ? stops.join(" → ") + (night ? " (stay)" : "") : DAY_TYPE_LABEL[row.dayType] || row.dayType || row.kind;
  const nightLabel = `outstation ${dayLabel(row.date)}`;
  // the day's TA in parts, as the console shows it: the local run (km × rate,
  // each way) and, on a day that also moves between HQs, the train fare; the
  // two add up to the console's TA
  const legKm = row.chart?.km ?? row.km;
  const local = Math.max(0, (row.ta || 0) - (row.journey?.fare || 0));
  const byKm = local > 0 && legKm > 0 && legKm <= (data?.bands?.eqKm ?? 100);
  const perKm = byKm ? Math.round((local / (2 * legKm)) * 100) / 100 : null;

  return (
    <li className="grid grid-cols-[18px_44px_minmax(0,1fr)] gap-x-2">
      {/* the timeline: a filled dot on a night away, an open one otherwise */}
      <span className="relative flex justify-center">
        <span className={cn("relative z-10 mt-1 h-3.5 w-3.5 rounded-full border-2 border-blue-600", night ? "bg-blue-600" : "bg-white")} aria-hidden />
        {!last && <span className="absolute bottom-0 top-5 w-px bg-blue-200" aria-hidden />}
      </span>
      <span className="flex flex-col leading-none">
        <b className="text-[19px] font-extrabold text-gray-900">{d.getDate()}</b>
        <small className="mt-1 text-[10.5px] font-bold text-gray-500">{dow}</small>
      </span>

      <div className={cn("min-w-0", !last && "pb-5")}>
        <b className="block text-[15px] font-bold leading-snug text-gray-900">{route}</b>
        <span className="mt-0.5 block text-[13px] text-gray-500">
          {row.payable ? (
            <>
              {car
                ? `${row.km != null ? `${row.km} km · ` : ""}fuel covers it`
                : byKm
                  ? `${legKm} km × ₹${perKm}, each way · ${inr(local)} both ways`
                  : row.journey
                    ? local > 0
                      ? `${row.km != null ? `${row.km} km · ` : ""}local ${inr(local)}`
                      : `${row.km != null ? `${row.km} km · ` : ""}no local fare`
                    : `${row.km != null ? `${row.km} km · ` : ""}fare ${inr(row.ta)}`}
              {/* with stay / food bills the day is paid what they add up to (50-100 %) */}
              {row.da ? ` · DA ${inr(night && bills ? night.paid : row.da)}` : ""}
            </>
          ) : (
            `${row.dayType || row.kind} · no TA`
          )}
        </span>
        {/* the journey between HQs: by car it is just the drive, no train fare */}
        {row.payable && row.journey && (
          <span className="mt-0.5 flex items-center gap-1 text-[12px] text-gray-400">
            {car ? <Car className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <TrainFront className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {row.journey.from} → {row.journey.to}
            {row.journey.km != null ? ` · ${Math.round(row.journey.km)} km` : ""}
            {car ? " · by car" : ` · ${inr(row.journey.fare)}`}
          </span>
        )}
        {row.payable && !car && basis && !row.journey && !byKm && <span className="mt-0.5 block text-[11.5px] text-gray-400">{basis}</span>}
        {/* both parts on one day: their total, the day's TA */}
        {row.payable && !car && row.journey && local > 0 && (
          <span className="mt-1 block text-[13px] font-bold text-gray-900">TA {inr(row.ta)}</span>
        )}

        {/* the night's DA; the stay bill itself is scanned in "Stay & food bills" */}
        {night ? (
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
        ) : bills || stayOff ? (
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
          row.payable && (
            <span className="mt-2 inline-flex rounded-xl bg-gray-100 px-2.5 py-1.5 text-[12.5px] font-semibold text-gray-600">
              {last && multi ? "back at HQ" : multi ? "on tour" : "home the same day"} · no outstation DA
            </span>
          )
        )}
        {/* that day's bills as pictures -- tap one to see it full screen */}
        {billStrip}
      </div>
    </li>
  );
}
