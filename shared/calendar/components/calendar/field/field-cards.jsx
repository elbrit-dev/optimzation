"use client";

/* The Field strip's cards, redesigned (27 Nov 2026, the user; mockups in
   field-expenses/design/*-20261127): one row, left to right --
     1. Help                -- every help request of the month + how TA/DA works
     2. Car · Ola · Uber    -- the own-car request, its fuel bills, and the ride bills
     3. the trips by date   -- an OS card per outstation trip, an HQ & EQ card per
                               run of local days between them
     4. the month summary   -- (MonthCard, field-ui.jsx)
   Every card is the same size; its left edge is the claim's state:
     red  Fix & resend (solid pill) · pink Not claimed · orange Bills added
     amber Awaiting approval / Car requested · green Approved.
   A card still to send shows its DA against the trip's full limit ("₹4,150 /7,900")
   and a thin bar along its bottom; once sent, the plain amounts. */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BedDouble, BookOpen, Car, CarTaxiFront, Fuel, MessageSquare, Plane, Plus, RotateCcw, Train } from "lucide-react";
import { cn } from "@calendar/lib/utils";
import { ModalTitle } from "@calendar/components/ui/responsive-modal";
import { useFieldExpenses } from "@calendar/components/calendar/field/field-context";
import { AWAY_TYPES, inr } from "@calendar/lib/field-expenses/field-days";
import { helpState, helpSummary, helpSeen } from "@calendar/lib/field-expenses/trip-help";
import { cabTotals, useCabs } from "@calendar/lib/field-expenses/cab-claims";
import { readTripBill } from "@calendar/lib/field-expenses/bill-reader";
import { ManualBill, useBillPicker } from "@calendar/components/calendar/field/field-bills";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso) => Number(String(iso).slice(8, 10));
const mon = (iso) => MON[Number(String(iso).slice(5, 7)) - 1];
export const spanLabel = (from, to) => (from === to ? `${day(from)} ${mon(from)}` : `${day(from)} – ${day(to)} ${mon(to)}`);
const errText = (e) => e?.message || String(e);

/* ---------- the claim's state, one look for every card ---------- */
export const STATE = {
  fix: { label: "Fix & resend", edge: "border-l-red-600", pill: "bg-red-600 text-white", total: "text-red-600", act: true },
  none: { label: "Not claimed", edge: "border-l-pink-600", pill: "bg-pink-50 text-pink-700", total: "text-pink-600", act: true },
  bills: { label: "Bills added", edge: "border-l-orange-600", pill: "bg-orange-50 text-orange-700", total: "text-orange-600", act: true },
  wait: { label: "Awaiting approval", edge: "border-l-amber-400", pill: "bg-yellow-50 text-yellow-700", total: "text-gray-900" },
  ok: { label: "Approved", edge: "border-l-green-500", pill: "bg-green-50 text-green-700", total: "text-gray-900" },
  idle: { label: "Nothing yet", edge: "border-l-gray-300", pill: "bg-gray-100 text-gray-600", total: "text-blue-700" },
};
const billCount = (x) => (x.calc.stayBills || 0) + (x.calc.foodBills || 0) + (x.calc.travelBills || 0) + ((x.claim.fuels || []).length || 0);
export function stateOf(items) {
  const st = items.map((x) => x.claim.status);
  if (st.includes("rejected")) return "fix";
  const open = items.filter((x) => x.claim.status === "unclaimed");
  if (open.length) return open.some((x) => billCount(x) > 0) ? "bills" : "none";
  if (items.every((x) => x.claim.status === "approved" || x.claim.status === "paid" || x.claim.status === "okd")) return "ok";
  return "wait";
}

/* ---------- the trips, as blocks by date ---------- */
/* an OS trip is a block of its own; consecutive trips with nothing to upload
   (HQ, EQ, no bills) make one HQ & EQ block; an EQ day that takes a ticket keeps
   its own card. */
export function blocksOf(claimed, isLocalTrip) {
  const items = [...claimed].sort((a, b) => a.trip.from.localeCompare(b.trip.from));
  const out = [];
  for (const x of items) {
    const local = x.trip.kind !== "tour" && isLocalTrip(x);
    const last = out[out.length - 1];
    if (local && last?.kind === "local") last.items.push(x);
    else out.push({ kind: local ? "local" : x.trip.kind === "tour" ? "os" : "eq", items: [x] });
  }
  return out.map((b) => ({ ...b, from: b.items[0].trip.from, to: b.items[b.items.length - 1].trip.to, id: b.items.map((x) => x.trip.id).join("+") }));
}

const CARD = "relative flex h-[118px] w-56 shrink-0 flex-col overflow-hidden rounded-[14px] border border-l-4 bg-white px-[11px] pb-[7px] pt-[9px] text-left shadow-sm active:opacity-80";
const Tag = ({ tone, children }) => (
  <span className={cn("shrink-0 rounded-[5px] px-1.5 text-[10px] font-extrabold leading-[17px]", tone)}>{children}</span>
);
const StatePill = ({ k, label }) => (
  <span className={cn("ml-auto shrink-0 whitespace-nowrap rounded-full px-2 py-px text-[9.5px] font-bold", STATE[k].pill)}>{label || STATE[k].label}</span>
);
const Mark = ({ Icon, tone, title }) => (
  <span title={title} aria-label={title} className={cn("grid h-[18px] w-5 place-items-center rounded-[5px]", tone)}>
    <Icon className="h-3 w-3" aria-hidden />
  </span>
);
/* help tickets as ONE chip: the count, coloured by the one that needs most
   attention; an orange corner dot for a new reply */
const HELP_CHIP = { raised: "bg-red-50 text-red-700", prog: "bg-orange-50 text-orange-700", done: "bg-green-50 text-green-700" };
export function HelpChip({ s }) {
  if (!s?.total) return null;
  return (
    <span className={cn("relative inline-flex h-[18px] items-center gap-0.5 rounded-[5px] px-1.5 text-[10.5px] font-extrabold", HELP_CHIP[s.state] || HELP_CHIP.done)} title="Help requests">
      <MessageSquare className="h-2.5 w-2.5" aria-hidden />
      {s.total}
      {s.unread > 0 && <i className="absolute -right-[3px] -top-[3px] h-[7px] w-[7px] rounded-full border-[1.5px] border-white bg-orange-500" />}
    </span>
  );
}
const Fig = ({ label, children }) => (
  <span className="flex min-w-0 flex-col justify-end">
    <small className="mb-0.5 truncate text-[8.5px] font-bold uppercase leading-[11px] tracking-wide text-gray-400">{label}</small>
    <span className="flex h-[19px] items-center whitespace-nowrap text-[12px] font-extrabold text-gray-900">{children}</span>
  </span>
);
const Meter = ({ p }) => (
  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-gray-100" aria-hidden>
    <i className="block h-full bg-green-500" style={{ width: `${Math.max(2, Math.min(100, p))}%` }} />
  </span>
);

/* an OS / EQ / HQ & EQ card */
export function BlockCard({ block, onOpen }) {
  const f = useFieldExpenses();
  const { items } = block;
  const k = stateOf(items);
  const S = STATE[k];
  const days = items.flatMap((x) => x.trip.days);
  const paid = days.filter((d) => d.payable);
  const ta = items.reduce((a, x) => a + x.calc.ta, 0);
  const da = items.reduce((a, x) => a + x.calc.da, 0);
  const total = items.reduce((a, x) => a + x.calc.total, 0);
  // the DA's full limit while bills can still add to it
  const one = items.length === 1 ? items[0].calc : null;
  const gap = S.act && one && one.billsAllowed && one.nights.length > 0 && !one.fullNoBill ? Math.max(0, (one.pool?.full || 0) - (one.pool?.paid || 0)) : 0;
  const help = f.helpOf ? helpSummary(items.flatMap((x) => f.helpOf(x.trip))) : null;
  const reqs = items.map((x) => (x.calc.carAllowed ? x.calc.request : null)).filter(Boolean);
  const marks = [
    days.some((d) => d.flight || d.company === "Travel") && { key: "t", Icon: Plane, tone: "bg-sky-50 text-sky-700", title: "Travel by company" },
    days.some((d) => d.company === "Stay") && { key: "s", Icon: BedDouble, tone: "bg-sky-50 text-sky-700", title: "Stay by company" },
    reqs.some((q) => q.status === "approved") && { key: "c", Icon: Car, tone: "bg-green-50 text-green-700", title: "Own car approved" },
    reqs.some((q) => q.status === "pending") && { key: "w", Icon: Car, tone: "bg-amber-50 text-amber-700", title: "Car requested" },
  ].filter(Boolean);
  let tag;
  let place;
  let note;
  if (block.kind === "os") {
    tag = <Tag tone="bg-indigo-50 text-indigo-700">OS</Tag>;
    place = String(items[0].trip.name || "").split(" · ")[0] || "Outstation";
    const away = paid.filter((d) => AWAY_TYPES.has(d.dayType)).length;
    note = away ? `${away} day${away > 1 ? "s" : ""} away` : "";
  } else {
    tag = <Tag tone="bg-slate-100 text-slate-600">{block.kind === "eq" ? "EQ" : "HQ & EQ"}</Tag>;
    const hq = paid.filter((d) => d.dayType === "HQ").length;
    const eq = paid.filter((d) => d.dayType === "EQ").length;
    place = block.kind === "eq" ? String(items[0].trip.name || "").split(" · ")[0] || "Ex-HQ" : "Local days";
    note = [hq ? `${hq} HQ` : null, eq ? `${eq} EQ` : null].filter(Boolean).join(" · ");
  }
  return (
    <button type="button" onClick={onOpen} className={cn(CARD, S.edge)} title={`${place} · ${spanLabel(block.from, block.to)} · ${S.label}`}>
      <span className="flex items-center gap-1.5">
        {tag}
        <StatePill k={k} />
      </span>
      <span className="mt-1.5 flex items-center gap-1.5">
        <b className="whitespace-nowrap text-[15px] font-extrabold tracking-tight text-gray-900">{spanLabel(block.from, block.to)}</b>
        <span className="ml-auto flex items-center gap-1">
          {marks.map((m) => (
            <Mark key={m.key} Icon={m.Icon} tone={m.tone} title={m.title} />
          ))}
          <HelpChip s={help} />
        </span>
      </span>
      <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
        <b className="truncate text-[12.5px] font-bold text-gray-700">{place}</b>
        {note && <small className="shrink-0 text-[10.5px] text-gray-400">{note}</small>}
      </span>
      <span className="mt-auto grid grid-cols-[auto_auto_minmax(0,1fr)] items-end gap-3 border-t border-dashed border-gray-200 pt-1.5">
        <Fig label="TA">{inr(ta)}</Fig>
        <Fig label="DA">
          {inr(da)}
          {gap > 0 && <i className="ml-0.5 text-[10px] font-semibold not-italic text-gray-400">/{inr(da + gap).slice(1)}</i>}
        </Fig>
        <span className="flex min-w-0 flex-col items-end justify-end">
          <small className="mb-0.5 text-[8.5px] font-bold uppercase leading-[11px] tracking-wide text-gray-400">Total</small>
          <b className={cn("flex h-[19px] items-center text-[14px] font-extrabold", S.total)}>
            {inr(total)}
            <span className="ml-px text-gray-400">›</span>
          </b>
        </span>
      </span>
      {gap > 0 && <Meter p={(total / (total + gap)) * 100} />}
    </button>
  );
}

/* ---------- Help card ---------- */
export function HelpCard() {
  const f = useFieldExpenses();
  const list = f.helpAll || [];
  const s = helpSummary(list);
  const open = s.raised + s.prog;
  const k = s.unread ? "bills" : open ? "wait" : list.length ? "ok" : "idle";
  const label = s.unread ? "New reply" : open ? "Open" : list.length ? "All answered" : "Ask anything";
  return (
    <button type="button" onClick={() => f.openHelp()} className={cn(CARD, s.unread ? "border-l-orange-500" : open ? "border-l-amber-400" : "border-l-gray-300")}>
      <span className="flex items-center gap-1.5">
        <Tag tone="bg-orange-50 text-orange-700">HELP</Tag>
        <StatePill k={k} label={label} />
      </span>
      <span className="mt-1.5 flex items-center gap-1.5">
        <b className="text-[15px] font-extrabold tracking-tight text-gray-900">Help</b>
        <span className="ml-auto">
          <HelpChip s={s} />
        </span>
      </span>
      <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
        <b className="truncate text-[12.5px] font-bold text-gray-700">{list.length ? `${list.length} request${list.length > 1 ? "s" : ""}` : "No requests"}</b>
        <small className="shrink-0 text-[10.5px] text-gray-400">· how TA/DA works</small>
      </span>
      <span className="mt-auto grid grid-cols-3 items-end gap-2 border-t border-dashed border-gray-200 pt-1.5">
        <Fig label="Open">
          <span className="text-red-700">{s.raised}</span>
        </Fig>
        <Fig label="In progress">
          <span className="text-orange-700">{s.prog}</span>
        </Fig>
        <span className="flex flex-col items-end justify-end">
          <small className="mb-0.5 text-[8.5px] font-bold uppercase leading-[11px] tracking-wide text-gray-400">Resolved</small>
          <b className="flex h-[19px] items-center text-[14px] font-extrabold text-green-700">
            {s.done}
            <span className="ml-px text-gray-400">›</span>
          </b>
        </span>
      </span>
    </button>
  );
}

/* ---------- Car · Ola · Uber card ---------- */
/* the month's own car (RBM, SM, ZSM) and ride bills (SM, ZSM) in one card:
   fuel bills sit on the car's trips; their total, the approved limit, and the
   ride bills' total show here. */
export function useCarCab() {
  const f = useFieldExpenses();
  const { status, claims } = useCabs(f.emp, f.month, !!f.canCab);
  const t = cabTotals(claims || []);
  const reqs = (f.requests || []).filter((r) => r.status !== "withdrawn");
  const approved = reqs.filter((r) => r.status === "approved");
  const pending = reqs.some((r) => r.status === "pending");
  const fuelBills = (f.claimed || []).flatMap((x) => (x.claim.fuels || []).map((b) => ({ ...b, item: x })));
  const fuel = fuelBills.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const cap = approved.reduce((a, r) => a + (Number(r.approvedAmount ?? r.ask) || 0), 0);
  const carTrips = (f.claimed || []).filter((x) => x.calc.carApproved);
  const fuelState = carTrips.length ? stateOf(carTrips) : null;
  let k;
  let label;
  if (t.sentBack || fuelState === "fix") [k, label] = ["fix", "Fix & resend"];
  else if (t.draft.count) [k, label] = ["bills", "Rides to send"];
  else if (approved.length && !fuelBills.length) [k, label] = ["bills", "Add fuel bills"];
  else if (pending) [k, label] = ["wait", "Car requested"];
  else if (t.waiting.count || fuelState === "wait" || fuelState === "bills") [k, label] = ["wait", "Awaiting approval"];
  else if (t.count || fuelBills.length) [k, label] = ["ok", "Approved"];
  else [k, label] = ["idle", "Nothing yet"];
  return { status, claims, t, reqs, approved, pending, fuelBills, fuel, cap, carTrips, k, label };
}
export function CarCabCard() {
  const f = useFieldExpenses();
  const c = useCarCab();
  if (!f.canCar && !f.canCab) return null;
  const S = STATE[c.k];
  const rides = c.t.count;
  const title = f.canCab ? "Car · Ola · Uber" : "Own car";
  const showCap = c.approved.length > 0 && (S.act || c.k === "idle");
  return (
    <button type="button" onClick={() => f.openCab()} className={cn(CARD, S.edge)}>
      <span className="flex items-center gap-1.5">
        <Tag tone="bg-cyan-50 text-cyan-700">{f.canCab ? "CAR & CAB" : "CAR"}</Tag>
        <StatePill k={c.k} label={c.label} />
      </span>
      <span className="mt-1.5 flex items-center gap-1.5">
        <b className="truncate text-[15px] font-extrabold tracking-tight text-gray-900">{title}</b>
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
        {c.fuelBills.length || rides ? (
          <>
            {c.fuelBills.length > 0 && (
              <span className="inline-flex h-5 items-center gap-1 rounded-md bg-sky-50 px-1.5 text-[11px] font-bold text-sky-700">
                <Fuel className="h-3 w-3" aria-hidden /> {c.fuelBills.length} fuel
              </span>
            )}
            {rides > 0 && (
              <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-bold", c.t.sentBack ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-700")}>
                <CarTaxiFront className="h-3 w-3" aria-hidden /> {rides} ride{rides > 1 ? "s" : ""}
              </span>
            )}
          </>
        ) : (
          <>
            <b className="truncate text-[12.5px] font-bold text-gray-700">{c.approved.length ? "No bills yet" : c.pending ? "Waiting for the GM" : f.canCar ? "Request car" : "Add a ride bill"}</b>
            {!c.approved.length && !c.pending && f.canCar && f.canCab && <small className="shrink-0 text-[10.5px] text-gray-400">or add a ride bill</small>}
          </>
        )}
      </span>
      <span className="mt-auto grid grid-cols-[auto_auto_minmax(0,1fr)] items-end gap-3 border-t border-dashed border-gray-200 pt-1.5">
        <Fig label="Fuel">
          {c.approved.length || c.fuel ? inr(c.fuel) : "—"}
          {showCap && <i className="ml-0.5 text-[10px] font-semibold not-italic text-gray-400">/{inr(c.cap).slice(1)}</i>}
        </Fig>
        {f.canCab ? <Fig label="Ola / Uber">{rides ? inr(c.t.total) : "—"}</Fig> : <span />}
        <span className="flex min-w-0 flex-col items-end justify-end">
          <small className="mb-0.5 text-[8.5px] font-bold uppercase leading-[11px] tracking-wide text-gray-400">Total</small>
          <b className={cn("flex h-[19px] items-center text-[14px] font-extrabold", S.total)}>
            {c.k === "idle" ? "Start" : inr(c.fuel + (f.canCab ? c.t.total : 0))}
            <span className="ml-px text-gray-400">›</span>
          </b>
        </span>
      </span>
      {showCap && c.cap > 0 && <Meter p={(c.fuel / c.cap) * 100} />}
    </button>
  );
}

/* the Own car part of the Car · Ola · Uber sheet: the request, the limit, and
   the fuel bills (added here, onto the car's first trip still to send) */
export function OwnCarSection({ c, onAddFuel }) {
  const f = useFieldExpenses();
  if (!f.canCar) return null;
  const req = c.approved[0] || c.reqs.find((r) => r.status === "pending") || c.reqs[0] || null;
  const tone = !req ? "text-gray-500" : req.status === "approved" ? "text-green-700" : req.status === "pending" ? "text-amber-700" : "text-red-700";
  const word = !req ? "Not requested" : req.status === "approved" ? "Approved" : req.status === "pending" ? "Car requested" : "Not approved";
  return (
    <section className="flex flex-col gap-2">
      <span className="flex items-center gap-2 px-1">
        <span className="grid h-[22px] w-[22px] place-items-center rounded-[7px] bg-cyan-50 text-cyan-700">
          <Car className="h-3.5 w-3.5" aria-hidden />
        </span>
        <b className="text-[12px] font-bold uppercase tracking-wide text-gray-600">Own car</b>
        <span className={cn("ml-auto text-[12px] font-semibold", tone)}>{word}</span>
      </span>
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,.04)] ring-1 ring-gray-100">
        {!req || req.status === "rejected" ? (
          <div className="flex items-center justify-between gap-3 px-3.5 py-3">
            <b className="text-[14px] font-semibold text-gray-900">Own car this month?</b>
            <button type="button" onClick={() => f.openCarRequest({ pick: true })} className="flex h-9 items-center gap-1.5 rounded-[10px] bg-gray-900 px-3.5 text-[13px] font-semibold text-white">
              <Car className="h-3.5 w-3.5" aria-hidden /> Request
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => f.openRequest(req.id)} className="flex w-full flex-col px-3.5 py-3 text-left">
            <span className="flex items-baseline justify-between text-[13px] text-gray-600">
              <span>Fuel limit</span>
              <span>
                <b className="text-[14px] text-gray-900">{inr(c.fuel)}</b> of {inr(c.cap || req.ask || 0)}
              </span>
            </span>
            <span className="mt-2 block h-[5px] overflow-hidden rounded-full bg-gray-100">
              <i className="block h-full rounded-full bg-green-600" style={{ width: `${Math.min(100, Math.round((c.fuel / (c.cap || req.ask || 1)) * 100))}%` }} />
            </span>
          </button>
        )}
        {c.fuelBills.map((b) => (
          <div key={b.id} className="flex items-center gap-3 border-t border-gray-100 px-3.5 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-orange-500 text-white">
              <Fuel className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="truncate text-[14px] font-semibold text-gray-900">{b.vendor || "Fuel bill"}</b>
              <small className="text-[12px] text-gray-400">
                {day(b.date)} {mon(b.date)} · {b.item.trip.name}
              </small>
            </span>
            <b className="shrink-0 text-[14px] font-bold tabular-nums text-gray-900">{inr(b.amount)}</b>
          </div>
        ))}
      </div>
      {onAddFuel && c.approved.length > 0 && !f.canCab && (
        <button type="button" onClick={onAddFuel} className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-blue-600 text-[15px] font-bold text-white">
          <Plus className="h-4 w-4" aria-hidden /> Add fuel bill
        </button>
      )}
    </section>
  );
}

/* a fuel bill read and put on the car's first trip still to send */
export function useFuelUpload(c) {
  const f = useFieldExpenses();
  const [input, pick] = useBillPicker();
  const [manual, setManual] = useState(null);
  const target = c.carTrips.find((x) => x.claim.status === "unclaimed") || null;
  const add = () => {
    if (!target) return toast.error("Every trip on the car is already sent — recall one to add a fuel bill.");
    pick(async (file) => {
      const tid = toast.loading("Reading the fuel bill…", { duration: Infinity });
      try {
        const r = await readTripBill(file, "car", target.trip);
        if (!r.ok) {
          if (r.manual) {
            toast.dismiss(tid);
            return setManual({ file, prefill: r.prefill, reason: r.reason });
          }
          return toast.error(r.reason, { id: tid, duration: 6000 });
        }
        if (r.bill.kind !== "Fuel") return toast.error("This isn't a fuel bill — add rides as a ride bill.", { id: tid });
        await f.actions.addBill(target.trip.id, "fuels", r.bill);
        toast.success(`Fuel bill ${inr(r.bill.billed)} added`, { id: tid });
      } catch (e) {
        toast.error(errText(e), { id: tid });
      }
    });
  };
  const sheet = manual && target && (
    <ManualBill
      file={manual.file}
      slot="car"
      trip={target.trip}
      prefill={manual.prefill}
      reason={manual.reason}
      onCancel={() => setManual(null)}
      onDone={(_slot, bill) => f.actions.addBill(target.trip.id, "fuels", bill).then(() => setManual(null))}
    />
  );
  return { input, add, sheet, can: !!target };
}

/* ---------- Help sheet ---------- */
const STEP = { raised: ["Open", "border-red-200 bg-red-50 text-red-700"], prog: ["In progress", "border-amber-200 bg-amber-50 text-amber-700"], done: ["Resolved", "border-green-200 bg-green-50 text-green-700"] };
export function HelpSheet({ TripHelp }) {
  const f = useFieldExpenses();
  const [tab, setTab] = useState(f.sheet?.tab || "tickets");
  // { item, chat } -- a request opened (chat = its name) or a new one (chat null)
  const [open, setOpen] = useState(null);
  const [pickNew, setPickNew] = useState(false);
  const list = f.helpAll || [];
  const itemOf = (t) => (f.claimed || []).find((x) => x.trip.from === t.from && x.trip.to === t.to) || null;
  const rows = list
    .map((t) => ({ t, k: helpState(t.status, t.team), item: itemOf(t) }))
    .sort((a, b) => String(b.t.creation).localeCompare(String(a.t.creation)));
  const openRows = rows.filter((r) => r.k !== "done");
  const doneRows = rows.filter((r) => r.k === "done");
  const trips = useMemo(() => [...(f.claimed || [])].sort((a, b) => a.trip.from.localeCompare(b.trip.from)), [f.claimed]);
  useEffect(() => {
    if (tab === "tickets") f.actions?.seenHelp?.();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const Row = ({ r }) => {
    const fresh = r.k !== "done" && (r.t.team || 0) > helpSeen(r.t.name);
    return (
      <button type="button" onClick={() => r.item && setOpen({ item: r.item, chat: r.t.name })} className="flex w-full flex-col gap-0.5 border-t border-gray-100 px-4 py-3 text-left first:border-t-0 active:bg-gray-50">
        <span className="flex items-center gap-1.5">
          <b className="truncate text-[14px] font-semibold text-gray-900">{r.item ? r.item.trip.name.split(" · ")[0] : "Request"}</b>
          {fresh && <i className="h-[7px] w-[7px] shrink-0 rounded-full bg-orange-500" />}
          <span className={cn("ml-auto shrink-0 rounded-md border px-2 py-px text-[11px] font-semibold", STEP[r.k][1])}>{fresh ? "Replied" : STEP[r.k][0]}</span>
        </span>
        <small className="text-[12px] text-gray-400">
          {spanLabel(r.t.from, r.t.to)} · {r.t.name}
        </small>
      </button>
    );
  };
  return (
    <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">
      <div className="bg-white px-4 pb-3">
        <ModalTitle className="pr-10 text-[17px] font-bold text-gray-900">Help</ModalTitle>
        <div className="mt-3 flex rounded-xl bg-gray-100 p-[3px]">
          {[
            ["tickets", `My requests · ${list.length}`],
            ["how", "How it works"],
          ].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cn("flex-1 rounded-[10px] py-1.5 text-[13px] font-semibold", tab === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">
        {tab === "tickets" ? (
          <>
            {pickNew && (
              <section className="flex flex-col gap-2">
                <b className="px-1 text-[12px] font-bold uppercase tracking-wide text-gray-600">About</b>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                  {trips.map((x) => (
                    <button key={x.trip.id} type="button" onClick={() => setOpen({ item: x, chat: null })} className="flex w-24 shrink-0 flex-col gap-0.5 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-left">
                      <Tag tone={x.trip.kind === "tour" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"}>{x.trip.kind === "tour" ? "OS" : x.trip.kind === "day" ? "EQ" : "HQ"}</Tag>
                      <b className="whitespace-nowrap text-[13px] font-bold text-gray-900">{spanLabel(x.trip.from, x.trip.to)}</b>
                      <small className="truncate text-[11px] text-gray-400">{x.trip.name.split(" · ")[0]}</small>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {openRows.length > 0 && (
              <section className="flex flex-col gap-2">
                <span className="flex px-1 text-[12px] font-bold uppercase tracking-wide text-gray-600">
                  Open<span className="ml-auto font-semibold normal-case tracking-normal text-gray-500">{openRows.length}</span>
                </span>
                <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100">
                  {openRows.map((r) => (
                    <Row key={r.t.name} r={r} />
                  ))}
                </div>
              </section>
            )}
            {doneRows.length > 0 && (
              <section className="flex flex-col gap-2">
                <span className="flex px-1 text-[12px] font-bold uppercase tracking-wide text-gray-600">
                  Resolved<span className="ml-auto font-semibold normal-case tracking-normal text-gray-500">{doneRows.length}</span>
                </span>
                <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100">
                  {doneRows.map((r) => (
                    <Row key={r.t.name} r={r} />
                  ))}
                </div>
              </section>
            )}
            {!rows.length && !pickNew && <p className="px-1 py-6 text-center text-[13px] text-gray-500">No help requests this month.</p>}
          </>
        ) : (
          <HowItWorks />
        )}
      </div>
      <div className="border-t border-gray-100 bg-white px-4 pb-4 pt-3">
        <button type="button" onClick={() => { setTab("tickets"); setPickNew(true); }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-[15px] font-bold text-white">
          <MessageSquare className="h-4 w-4" aria-hidden /> {tab === "how" ? "Ask a question" : "Ask for help"}
        </button>
      </div>
      {open && <TripHelp key={`${open.item.trip.id}:${open.chat || "new"}`} item={open.item} bare initialChat={open.chat} onClose={() => { setOpen(null); f.actions?.refreshHelp?.(); }} />}
    </div>
  );
}

/* "How it works": only what applies to this rep, from their own month */
function HowItWorks() {
  const f = useFieldExpenses();
  const rows = (f.rows || []).filter((r) => r.payable);
  const daOf = (pred) => rows.find(pred)?.da || null;
  const hqDa = daOf((r) => r.dayType === "HQ");
  const eqDa = daOf((r) => r.dayType === "EQ");
  const osFull = Math.max(0, ...rows.map((r) => Number(r.osDaFull) || 0));
  const local = rows.flatMap((r) => r.legs || []).find((l) => l.leg === "Local" && Number(l.fare) > 0 && Number(l.rounded_km ?? l.km) > 0 && Number(l.rounded_km ?? l.km) <= 100);
  const rate = local ? Math.round((Number(local.fare) / (Number(local.rounded_km ?? local.km) * (local.both_ways ? 2 : 1))) * 100) / 100 : null;
  const be = !f.canCar;
  const Rule = ({ tag, tone, title, sub, pay, payNote }) => (
    <div className="flex gap-3 border-t border-gray-100 px-3.5 py-3 first:border-t-0">
      <span className={cn("h-fit w-10 shrink-0 rounded-lg py-1 text-center text-[10.5px] font-extrabold", tone)}>{tag}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="text-[13.5px] font-semibold text-gray-900">{title}</b>
        <small className="text-[12px] text-gray-400">{sub}</small>
      </span>
      <span className="shrink-0 text-right">
        <b className="block text-[14px] font-bold text-gray-900">{pay}</b>
        <small className="text-[11px] text-gray-400">{payNote}</small>
      </span>
    </div>
  );
  const Tip = ({ Icon, children }) => (
    <div className="flex items-center gap-2.5 border-t border-gray-100 px-3.5 py-2.5 first:border-t-0">
      <Icon className="h-[18px] w-[18px] shrink-0 text-gray-500" strokeWidth={1.8} aria-hidden />
      <span className="text-[13px] text-gray-700">{children}</span>
    </div>
  );
  return (
    <>
      <div className="grid grid-cols-3 divide-x divide-gray-100 rounded-2xl bg-white ring-1 ring-gray-100">
        {[
          ["Role", f.role || "—"],
          ["Month", `${MON[Number(f.month.slice(5, 7)) - 1]} ${f.month.slice(0, 4)}`],
          ["Rate", rate ? `₹${rate}/km` : "—"],
        ].map(([k, v]) => (
          <span key={k} className="flex flex-col px-3.5 py-2.5">
            <small className="text-[10.5px] font-semibold text-gray-400">{k}</small>
            <b className="truncate text-[14px] font-bold text-gray-900">{v}</b>
          </span>
        ))}
      </div>
      <b className="px-1 text-[12px] font-bold uppercase tracking-wide text-gray-600">Day types</b>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100">
        <Rule tag="HQ" tone="bg-slate-100 text-slate-600" title="Within 20 km" sub="No TA" pay={hqDa ? inr(hqDa) : "—"} payNote="DA" />
        <Rule tag="EQ" tone="bg-sky-50 text-sky-800" title="20 km or more, same day" sub={rate ? `TA (km + 10) × ₹${rate} × 2` : "TA (km + 10) × rate × 2"} pay={eqDa ? inr(eqDa) : "—"} payNote="DA" />
        <Rule
          tag="OS"
          tone="bg-indigo-50 text-indigo-700"
          title="Overnight at another HQ"
          sub={be ? "Fare both ways · full DA, no bills needed" : `Fare both ways · ${osFull ? inr(osFull / 2) : "50 %"} without bills`}
          pay={osFull ? inr(osFull) : "—"}
          payNote={be ? "DA" : "DA with bills"}
        />
      </div>
      <b className="px-1 text-[12px] font-bold uppercase tracking-wide text-gray-600">Good to know</b>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100">
        <Tip Icon={Train}>Over 100 km is paid at the 3A rail fare</Tip>
        <Tip Icon={RotateCcw}>The trip home is paid on your next working day</Tip>
        {be ? (
          <Tip Icon={Train}>Add bus / train tickets on the OS trip card — the larger of ticket and fare is paid</Tip>
        ) : (
          <Tip Icon={BookOpen}>Hotel and food bills go on the OS trip card — held to the trip&apos;s full DA</Tip>
        )}
        {f.canCar && <Tip Icon={Car}>Own car: request on the Car card; fuel bills go there too</Tip>}
      </div>
    </>
  );
}

