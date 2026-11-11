"use client";

/* The planner's Field layer, after the Elbrit Claims prototype:
     - trips as cards above the calendar, ending in TA · DA, with their claim
       status; own-car requests as cards beside them; the month's numbers last
     - a chip on each travel day in the month grid
     - the day's trip at the top of its agenda list
     - a sheet per trip: the story line, one TA line (fare, or own car = fuel +
       toll scans up to the approved cap), a day timeline with a stay-bill chip
       per night (50 % → 100 %), the checks, and Submit / Recall & edit
     - the own-car request form
   Day types, TA and DA per day are the Field expenses console's; the trip
   claim rules are in lib/field-expenses/claim-rules.js and every action goes
   through lib/field-expenses/trip-claims-store.js. */

import { useState, useSyncExternalStore } from "react";
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
import { FUEL_PRICE, MILEAGE_KM_PER_L } from "@calendar/lib/field-expenses/claim-rules";
import { PREVIEW, STATUS_LABEL, canRecall, isLocked, statusKey } from "@calendar/lib/field-expenses/trip-claims-store";
import { readBill } from "@calendar/lib/field-expenses/bill-reader";
import { CarRequestSheet, KpiSheet, RequestSheet } from "@calendar/components/calendar/field/field-sheets";
import { BILL_NAME, BillChip, BillEditor, ChipButton, useBillPicker } from "@calendar/components/calendar/field/field-bills";

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
  const toClaim = f.claimed.filter((x) => x.claim.status === "unclaimed");
  const awaiting = f.claimed.filter((x) => x.claim.status === "submitted" || x.claim.status === "review").length;
  const canOpen = f.status === "ready";

  // the tile's two halves: what is left to claim, and what is waiting on someone else
  let left;
  let right = null;
  if (f.status === "loading" || f.status === "idle") left = "loading…";
  else if (f.status === "error") left = f.error?.code === "no-month" ? `${m} not in the console yet` : f.error?.status === 401 ? "sign in again" : f.error?.status === 404 ? "no employee record" : "console unavailable";
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
const rank = (c) => ({ unclaimed: 0, review: 1, submitted: 2, approved: 3, paid: 4 })[c.status] ?? 5;

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
        {calc.da > 0 ? <Amount label={calc.missingStayBills ? "DA*" : "DA"} value={calc.da} hint={calc.missingStayBills ? "DA without a stay bill (50 %)" : undefined} /> : <span />}
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
    {/* a car is asked for from the month summary; the card only shows how a
        request stands */}
    {canCar && (calc.carApproved || calc.carPending) && (
      <div className="border-t border-gray-100 px-2.5 py-1">
        {calc.carApproved ? (
          <button type="button" onClick={() => onRequestOpen(req.id)} className="flex w-full items-center gap-1 text-[11px] font-extrabold text-green-700">
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">Car approved · {inr(req.ask)}</span>
          </button>
        ) : calc.carPending ? (
          <button type="button" onClick={() => onRequestOpen(req.id)} className="flex w-full items-center gap-1 text-[11px] font-bold text-amber-700">
            <Car className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">Car requested · awaiting GM</span>
          </button>
        ) : null}
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
        {krow("In payroll", inr(payroll), "muted")}
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

function TripSheet({ item }) {
  const f = useFieldExpenses();
  const { trip, claim, calc, checks } = item;
  const editable = claim.status === "unclaimed";
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null); // { kind, id }
  const [billInput, pickBill] = useBillPicker();

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

  const scan = (kind) =>
    pickBill(async (file) => {
      setBusy(`scan-${kind}`);
      try {
        const read = await readBill(file, BILL_NAME[kind]);
        const id = await f.actions.addCarBill(trip.id, kind, { amount: read?.amount ?? null, file, read });
        setEditing({ kind, id });
        toast[read ? "success" : "message"](read ? `Read ${inr(read.amount)} off the bill` : "Couldn't read the amount — type it in");
      } catch (e) {
        toast.error(errText(e));
      } finally {
        setBusy(null);
      }
    });

  // "scan stay" fills the first night still without a hotel bill
  const nextNight = calc.nights.find((n) => !n.bill) || null;
  // a hotel bill is read for its amount; that amount is the night's DA
  const stayBill = (date) =>
    pickBill(async (file) => {
      setBusy(`stay-${date}`);
      try {
        const read = await readBill(file, "Hotel bill");
        await f.actions.setStayBill(trip.id, date, file, read?.amount ?? null);
        if (read?.amount) toast.success(`Hotel bill ${inr(read.amount)} — the night is paid at the bill`);
        else {
          toast.message("Couldn't read the amount — type it in");
          setEditing({ kind: "stays", id: date });
        }
      } catch (e) {
        toast.error(errText(e));
      } finally {
        setBusy(null);
      }
    });

  const review = checks.some((c) => c.level === "review");
  const req = calc.request;

  const nDays = trip.days.length;
  const daysLabel = nDays > 1 ? `${nDays} days` : dayLabel(trip.from);
  const costStatus =
    claim.status === "unclaimed"
      ? claim.recalled
        ? "Recalled · not claimed"
        : "Not claimed yet"
      : claim.status === "review"
        ? "Claimed · in review"
        : claim.status === "submitted"
          ? "Claimed · awaiting approval"
          : "Claimed · in payroll";
  const sectionLabel = "text-[13px] font-bold text-gray-500";

  return (
    <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 [&>*]:shrink-0 gap-3">
      {billInput}

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
              <b className="font-extrabold text-gray-900">fuel + toll</b>
              <span>
                · {inr(calc.fuel)} + {inr(calc.tolls)}
              </span>
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
                  className={cn("block h-full rounded-full", calc.fuel + calc.tolls > calc.cap ? "bg-rose-600" : "bg-green-600")}
                  style={{ width: `${Math.min(100, Math.round(((calc.fuel + calc.tolls) / (calc.cap || 1)) * 100))}%` }}
                />
              </span>
              <b className={cn("shrink-0", calc.fuel + calc.tolls > calc.cap ? "text-rose-600" : "text-gray-900")}>
                {inr(calc.fuel + calc.tolls)} / {inr(calc.cap)}
              </b>
            </span>

            <div className="mt-3 flex flex-wrap gap-2">
              {["fuels", "tolls"].flatMap((kind) =>
                (claim[kind] || []).map((b) => (
                  <BillChip key={b.id} kind={kind} bill={b} on={editing?.id === b.id} readOnly={!editable} onClick={() => setEditing(editing?.id === b.id ? null : { kind, id: b.id })} />
                ))
              )}
              {editable && (
                <>
                  <ChipButton busy={busy === "scan-fuels"} onClick={() => scan("fuels")}>
                    <Camera className="h-4 w-4" aria-hidden /> scan fuel
                  </ChipButton>
                  <ChipButton busy={busy === "scan-tolls"} onClick={() => scan("tolls")}>
                    <Camera className="h-4 w-4" aria-hidden /> scan toll
                  </ChipButton>
                </>
              )}
            </div>
            {editable && editing && editing.kind !== "foods" && (
              <BillEditor
                key={editing.id}
                bill={(claim[editing.kind] || []).find((b) => b.id === editing.id)}
                kind={editing.kind}
                onAmount={(amount) => f.actions.updateCarBill(trip.id, editing.kind, editing.id, { amount })}
                onPhoto={() => pickBill((file) => run("photo", () => f.actions.updateCarBill(trip.id, editing.kind, editing.id, { file }), "Photo attached"))}
                onRemove={() => {
                  run("rm", () => f.actions.removeCarBill(trip.id, editing.kind, editing.id));
                  setEditing(null);
                }}
              />
            )}
          </div>
        )}

        <p className="col-start-2 col-end-4 mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug text-gray-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {calc.car
            ? !calc.fuel && !calc.tolls
              ? "Scan the pump bill and every toll receipt — AI reads the amounts."
              : "Fuel + tolls are this trip's whole TA — no train fare is paid."
            : calc.carPending
              ? "Car requested — until the GM approves, this trip is paid the normal fare."
              : "TA pays the travel — one fare for the whole trip."}
        </p>
      </div>

      {/* day by day */}
      <ol className="mt-1 border-t border-dashed border-gray-300 pt-4">
        {trip.days.map((d, i) => (
          <TripDay
            key={d.date}
            row={d}
            data={f.data}
            car={calc.car}
            last={i === trip.days.length - 1}
            multi={trip.days.length > 1}
            night={calc.nights.find((n) => n.date === d.date)}
          />
        ))}
      </ol>

      {/* DA: the daily allowance is what pays food and stay. The day DA comes
          from the rate card; a stay bill takes the night from 50 % to 100 %;
          food bills are the proof behind it, not a cost on top. */}
      <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-2 border-t border-dashed border-gray-300 pt-3">
        <span className="text-[13px] font-extrabold text-gray-500">DA</span>
        <span className="min-w-0 text-[15px] text-gray-600">
          {calc.nights.length ? `daily ${inr(calc.da - calc.nightDA)} + stay ${inr(calc.nightDA)}` : ""}
        </span>
        <b className="text-[18px] font-extrabold text-gray-900">{inr(calc.da)}</b>
      </div>

      {/* bills only for a night spent away: back at HQ the same day, no stay
          or food bill is asked for (one already added still shows) */}
      {calc.billsAllowed && (calc.nights.length > 0 || (claim.foods || []).length > 0) && (
        <div>
          <span className={sectionLabel}>DA bills · stay &amp; food</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {calc.nights
              .filter((n) => n.bill)
              .map((n) => (
                <StayChip
                  key={n.date}
                  night={n}
                  on={editing?.kind === "stays" && editing.id === n.date}
                  readOnly={!editable}
                  busy={busy === `stay-${n.date}`}
                  onClick={() => setEditing(editing?.kind === "stays" && editing.id === n.date ? null : { kind: "stays", id: n.date })}
                />
              ))}
            {(claim.foods || []).map((b) => (
              <BillChip key={b.id} kind="foods" bill={b} on={editing?.id === b.id} readOnly={!editable} onClick={() => setEditing(editing?.id === b.id ? null : { kind: "foods", id: b.id })} />
            ))}
            {editable && (
              <>
                {nextNight && (
                  <ChipButton busy={busy === `stay-${nextNight.date}`} onClick={() => stayBill(nextNight.date)}>
                    <Camera className="h-4 w-4" aria-hidden /> scan stay
                  </ChipButton>
                )}
                <ChipButton busy={busy === "scan-foods"} onClick={() => scan("foods")}>
                  <Camera className="h-4 w-4" aria-hidden /> scan food
                </ChipButton>
              </>
            )}
          </div>
          {editable && editing?.kind === "stays" && calc.nights.find((n) => n.date === editing.id)?.bill && (
            <BillEditor
              key={`stay-${editing.id}`}
              bill={calc.nights.find((n) => n.date === editing.id).bill}
              kind="stays"
              onAmount={(amount) => run(`stay-${editing.id}`, () => f.actions.setStayAmount(trip.id, editing.id, amount))}
              onPhoto={() => stayBill(editing.id)}
              onRemove={() => {
                run(`stay-${editing.id}`, () => f.actions.setStayBill(trip.id, editing.id, null), "Stay bill removed — the night is back to 50 % of DA");
                setEditing(null);
              }}
            />
          )}
          {editable && editing?.kind === "foods" && (
            <BillEditor
              key={editing.id}
              bill={(claim.foods || []).find((b) => b.id === editing.id)}
              kind="foods"
              onAmount={(amount) => f.actions.updateCarBill(trip.id, "foods", editing.id, { amount })}
              onPhoto={() => pickBill((file) => run("photo", () => f.actions.updateCarBill(trip.id, "foods", editing.id, { file }), "Photo attached"))}
              onRemove={() => {
                run("rm", () => f.actions.removeCarBill(trip.id, "foods", editing.id));
                setEditing(null);
              }}
            />
          )}
          <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug text-gray-500">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {nextNight
              ? `Night of ${dayLabel(nextNight.date)}: no bill, so 50 % of DA (${inr(nextNight.amount)}). Upload the hotel bill and the night is paid at the bill's amount.`
              : calc.nights.length
                ? calc.nights.some((n) => n.bill && !n.billed)
                  ? "A stay bill has no amount yet — tap it and type the amount."
                  : "Every night is paid at its hotel bill."
                : "No night away on this trip — no bill needed."}
            {" "}Food bills are kept as proof of the DA{calc.food ? ` (${inr(calc.food)} scanned)` : ""} — they do not add to it.
          </p>
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
        <div className="mt-1.5 flex items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-3.5 py-3">
          <div className="min-w-0">
            <small className="block text-[11.5px] font-extrabold uppercase tracking-wider text-blue-700">Trip cost</small>
            <b className="block text-[28px] font-extrabold leading-tight tracking-tight text-gray-900">{inr(calc.total)}</b>
            <span className="block text-[13px] text-gray-500">
              TA {inr(calc.ta)}
              {calc.da || nightsAny(calc) ? ` + DA ${inr(calc.da)} (food & stay${calc.missingStayBills ? ", stay bill missing" : ""})` : ""}
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
          Submitted without a stay bill — those nights are at 50 % of DA. Recall and upload the bill to be paid at its amount.
        </p>
      )}
      {isLocked(claim) && (
        <p className="flex items-start gap-2 rounded-2xl bg-gray-50 px-3 py-2.5 text-[12.5px] text-gray-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Locked — already in payroll.
        </p>
      )}

      {/* with the car on, what is still missing before it can go */}
      {editable && calc.car && (calc.carBlock || calc.missingStayBills > 0) && (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] font-semibold text-amber-800">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">Own car · bills needed</span>
          {calc.carBlock && (
            <span className="flex items-start gap-2">
              <Fuel className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {calc.carBlock}
            </span>
          )}
          {calc.missingStayBills > 0 && (
            <span className="flex items-start gap-2">
              <BedDouble className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Attach the stay bill for {calc.missingStayBills} night{calc.missingStayBills > 1 ? "s" : ""} — DA stays at 50 % until you do
            </span>
          )}
        </div>
      )}

      {/* total + the one action, pinned to the bottom */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex items-center justify-between gap-3 border-t bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="min-w-0">
          <span className="block text-[13px] text-gray-500">
            Total · {daysLabel}
            {!editable ? ` · ${STATUS_LABEL[statusKey(claim)]}` : ""}
          </span>
          <b className="block text-[22px] font-extrabold tracking-tight text-gray-900">{inr(calc.total)}</b>
        </div>
        {editable ? (
          <button
            type="button"
            disabled={!!busy || calc.total <= 0 || !!calc.carBlock}
            onClick={() =>
              run("submit", () => f.actions.submitTrip(trip.id, { total: calc.total, ta: calc.ta, da: calc.da, review }), review ? "Submitted — one item goes to a reviewer" : "Trip submitted")
            }
            className="flex min-h-[52px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 text-[16px] font-bold text-white transition active:scale-[.98] disabled:bg-gray-200 disabled:text-gray-500"
          >
            {busy === "submit" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {claim.recalled ? "Resubmit" : "Submit"} {trip.kind === "tour" ? "tour" : trip.kind === "hq" ? (nDays > 1 ? "HQ days" : "HQ day") : "day"}
          </button>
        ) : canRecall(claim) ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("recall", () => f.actions.recallTrip(trip.id), "Recalled — edit and resubmit")}
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
  );
}

const nightsAny = (calc) => calc.nights.length > 0;

/* An attached hotel bill: the night it covers and the amount on the bill
   (that amount is the night's DA). Tap to fix the amount or remove it. */
function StayChip({ night, on, readOnly, busy, onClick }) {
  const known = !!night.billed;
  const cls = cn(
    "inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-[12px] font-bold",
    known ? "border-gray-200 bg-white text-gray-800" : "border-amber-300 bg-amber-50 text-amber-800",
    on && "ring-2 ring-blue-500"
  );
  const inner = (
    <>
      <BedDouble className="h-3.5 w-3.5" aria-hidden />
      {dayLabel(night.date)} · {known ? inr(night.billed) : "₹ — amount?"}
      <Check className="h-3 w-3 text-green-700" aria-hidden />
    </>
  );
  if (readOnly) return <span className={cls}>{inner}</span>;
  return (
    <button type="button" className={cls} disabled={busy} aria-pressed={on} onClick={onClick} aria-label={`Hotel bill for ${dayLabel(night.date)} — tap to edit`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : inner}
    </button>
  );
}

function TripDay({ row, data, car, last, multi, night }) {
  const d = new Date(row.date + "T00:00:00");
  const dow = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getDay()];
  const stops = (row.route || []).map((s) => s.place).filter(Boolean);
  const basis = fareBasis(row, data);
  const route = stops.length ? stops.join(" → ") + (night ? " (stay)" : "") : DAY_TYPE_LABEL[row.dayType] || row.dayType || row.kind;
  const nightLabel = `night of ${dayLabel(row.date)}`;
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
              {row.da ? ` · DA ${inr(row.da)}` : ""}
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
              night.bill ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
            )}
          >
            <BedDouble className="h-3.5 w-3.5 shrink-0" aria-hidden />
            DA · {nightLabel} · {night.billed ? "as billed" : night.bill ? "bill · amount missing · 50 %" : "no bill · 50 % of DA"} · {inr(night.amount)}
          </span>
        ) : (
          row.payable && (
            <span className="mt-2 inline-flex rounded-xl bg-gray-100 px-2.5 py-1.5 text-[12.5px] font-semibold text-gray-600">
              {last && multi ? "back at HQ" : multi ? "on tour" : "home the same day"} · no night DA
            </span>
          )
        )}
      </div>
    </li>
  );
}
