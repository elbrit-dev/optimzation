"use client";

/* The Field layer's other sheets, after the Elbrit Claims prototype:
     KpiSheet         "October · TA & DA" — the month's TA and DA side by side,
                      each split into in payroll / submitted / to claim
     CarRequestSheet  "Own car for a planned trip" — pick the trip from the
                      Planner, vehicle and fuel, the suggested cap, your ask
     RequestSheet     one car request: pending (recall & edit) or approved */

import { useState } from "react";
import { toast } from "sonner";
import { BedDouble, Car, ChevronRight, Info, Loader2, Route, Undo2, Zap } from "lucide-react";
import { cn } from "@calendar/lib/utils";
import { ModalTitle } from "@calendar/components/ui/responsive-modal";
import { useFieldExpenses } from "@calendar/components/calendar/field/field-context";
import { inr, rangeLabel } from "@calendar/lib/field-expenses/field-days";
import { FUEL_PRICE, MILEAGE_KM_PER_L, fuelCost, tripRoute } from "@calendar/lib/field-expenses/claim-rules";

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym) => MONTH_LONG[Number(ym.slice(5, 7)) - 1];
const errText = (e) => e?.message || String(e);

/* ---------- shared pieces ---------- */

/* What the sheet comes to, and its one action — pinned to the bottom. */
const SheetFoot = ({ label, value, children }) => (
  <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex items-center justify-between gap-3 border-t bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
    <div className="min-w-0">
      <span className="block text-[12px] text-gray-500">{label}</span>
      <b className="block truncate text-[17px] font-extrabold text-gray-900">{value}</b>
    </div>
    {children}
  </div>
);

const FootBtn = ({ ghost, disabled, busy, onClick, children }) => (
  <button
    type="button"
    disabled={disabled || busy}
    onClick={onClick}
    className={cn(
      "flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-5 text-[15px] font-bold transition active:scale-[.98]",
      ghost ? "bg-gray-100 text-gray-900" : "bg-blue-600 text-white disabled:bg-gray-200 disabled:text-gray-500"
    )}
  >
    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
    {children}
  </button>
);

const Note = ({ icon: Icon = Info, tone, children }) => (
  <p className={cn("flex items-start gap-1.5 text-[12.5px] leading-snug", tone === "warn" ? "text-amber-700" : "text-gray-500")}>
    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
    <span>{children}</span>
  </p>
);

const Pill = ({ ok, children }) => (
  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold", ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}>
    {children}
  </span>
);

const dateBlock = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return { dd: d.getDate(), dow: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getDay()] };
};

/* ---------- month summary: TA & DA side by side ---------- */

export function KpiSheet() {
  const f = useFieldExpenses();
  const m = monthName(f.month);
  // the month's ERP claim: the submitted trips' lines, sent to the reporting
  // officer as ONE claim (erp-claim.js)
  const mc = f.monthClaim?.claim || null;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(null);
  const act = async (key, fn, ok) => {
    setBusy(key);
    try {
      await fn();
      setConfirm(false);
      toast.success(ok);
    } catch (e) {
      // a refused send must be read: it stays until closed
      toast.error(errText(e), { duration: Infinity, closeButton: true });
    } finally {
      setBusy(null);
    }
  };
  const claimState = !mc
    ? "none"
    : mc.open
      ? mc.status === "Rejected"
        ? "rejected"
        : "open"
      : ["Verified", "Paid"].includes(mc.status)
        ? "final"
        : mc.status === "Approved"
          ? "approved"
          : "sent";
  const notAdded = f.claimed.filter((x) => x.claim.status === "unclaimed" && x.calc.total > 0).length;
  const by = (pick) => {
    const sumOf = (pred) => f.claimed.filter((x) => pred(x.claim.status)).reduce((s, x) => s + pick(x), 0);
    return {
      total: f.claimed.reduce((s, x) => s + pick(x), 0),
      payroll: sumOf((s) => s === "approved" || s === "paid"),
      // in the claim or with the officer (approved by them trip by trip, too)
      submitted: sumOf((s) => s === "submitted" || s === "review" || s === "sent" || s === "okd"),
      // still to claim, or sent back to fix
      toClaim: sumOf((s) => s === "unclaimed" || s === "rejected"),
    };
  };
  const ta = by((x) => x.calc.ta);
  const da = by((x) => x.calc.da);
  const carTrips = f.claimed.filter((x) => x.calc.car).length;
  const nights = f.claimed.reduce((s, x) => s + x.calc.nights.length, 0);
  const withBill = f.claimed.reduce((s, x) => s + x.calc.nights.filter((n) => n.bill).length, 0);
  // nights still at 50 % for want of a bill (BE / ABM days are at 100 % with none)
  const noBill = f.claimed.reduce((s, x) => s + x.calc.nights.filter((n) => !n.bill && !n.fullNoBill).length, 0);
  // the whole month by kind of day: HQ, EQ (out and back) and outstation
  const kindRow = (k) => {
    const xs = f.claimed.filter((x) => (k === "hq" ? x.trip.kind === "hq" : k === "tour" ? x.trip.kind === "tour" : x.trip.kind !== "hq" && x.trip.kind !== "tour"));
    return {
      days: xs.reduce((s, x) => s + x.trip.days.filter((d) => d.payable).length, 0),
      ta: xs.reduce((s, x) => s + x.calc.ta, 0),
      da: xs.reduce((s, x) => s + x.calc.da, 0),
    };
  };
  const kinds = [
    ["HQ days", kindRow("hq")],
    ["EQ days", kindRow("day")],
    ["Outstation", kindRow("tour")],
  ].filter(([, r]) => r.days > 0);
  const daysWorked = kinds.reduce((s, [, r]) => s + r.days, 0);

  return (
    <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 [&>*]:shrink-0 gap-3">
      <ModalTitle className="pr-10 text-lg font-extrabold text-gray-900">{m} · TA &amp; DA</ModalTitle>
      <div className="rounded-3xl bg-gray-100 p-3">
        <div className="flex items-start gap-3 px-1 pb-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600">
            <Car className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h3 className="text-[16px] font-extrabold text-gray-900">{m} summary</h3>
            <p className="text-[13px] leading-snug text-gray-600">
              {daysWorked} days worked · {f.stats.km} km · into {f.payroll.name} (by {f.payroll.cutoff})
            </p>
          </div>
        </div>
        {/* one card: the month's TA + DA, one bar split between them, and
            where the money stands */}
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-3.5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-blue-800">TA + DA</span>
              <b className="text-[26px] font-extrabold leading-tight tracking-tight text-gray-900">{inr(ta.total + da.total)}</b>
            </div>
          </div>
          <span
            className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-gray-100"
            role="img"
            aria-label={`TA ${inr(ta.total)}, DA ${inr(da.total)}`}
          >
            {ta.total > 0 && <i style={{ flex: ta.total }} className="block h-full rounded-full bg-blue-600" />}
            {da.total > 0 && <i style={{ flex: da.total }} className="block h-full rounded-full bg-sky-300" />}
          </span>
          <div className="flex flex-col gap-2">
            <Part icon={Route} dot="bg-blue-600" title="TA · travel" value={ta.total} sub={`${f.stats.km} km · ${carTrips ? `car on ${carTrips} trip${carTrips > 1 ? "s" : ""}` : "fare"}`} />
            <Part
              icon={BedDouble}
              dot="bg-sky-300"
              title="DA"
              value={da.total}
              sub={`${daysWorked} day${daysWorked === 1 ? "" : "s"}${nights ? ` · ${nights} outstation, ${withBill} with bill` : ""}`}
            />
          </div>
          {/* the month by kind of day */}
          {kinds.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,.6fr)_repeat(3,minmax(0,1fr))] gap-1 bg-gray-50 px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-400">
                <span>Day</span>
                <span className="text-right">Days</span>
                <span className="text-right">TA</span>
                <span className="text-right">DA</span>
                <span className="text-right">Total</span>
              </div>
              {kinds.map(([label, r]) => (
                <div key={label} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,.6fr)_repeat(3,minmax(0,1fr))] gap-1 border-t border-gray-100 px-2.5 py-1.5 text-[12.5px] tabular-nums text-gray-700">
                  <span className="truncate font-bold text-gray-900">{label}</span>
                  <span className="text-right">{r.days}</span>
                  <span className="truncate text-right">{inr(r.ta)}</span>
                  <span className="truncate text-right">{inr(r.da)}</span>
                  <b className="truncate text-right text-gray-900">{inr(r.ta + r.da)}</b>
                </div>
              ))}
            </div>
          )}
          {noBill > 0 && (
            <span className="flex items-start gap-1 text-[11.5px] font-semibold leading-snug text-amber-700">
              <Zap className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {noBill} night{noBill > 1 ? "s" : ""} at 50 % of DA — upload the bill to be paid in full once approved
            </span>
          )}
          <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
            <Stand label="In payroll" value={ta.payroll + da.payroll} />
            <Stand label="Submitted" value={ta.submitted + da.submitted} />
            <Stand label="To claim" value={ta.toClaim + da.toClaim} hi />
          </div>
        </div>
      </div>
      {/* the month's claim: what is in it, and where it stands */}
      <div className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-3.5 py-3">
        <span className="flex items-center justify-between gap-2">
          <b className="text-[14.5px] font-extrabold text-gray-900">{m} claim</b>
          <Pill ok={claimState === "approved" || claimState === "final"}>
            {f.monthClaim?.status === "loading"
              ? "loading…"
              : claimState === "none"
                ? "nothing added yet"
                : claimState === "open"
                  ? "not sent yet"
                  : claimState === "rejected"
                    ? "sent back · fix and send again"
                    : claimState === "sent"
                      ? `waiting for ${f.manager}`
                      : claimState === "final"
                        ? "finalised"
                        : "approved · final check pending"}
          </Pill>
        </span>
        {mc ? (
          <span className="flex items-end justify-between gap-2">
            <span className="text-[12.5px] text-gray-600">
              {mc.lines.length} line{mc.lines.length === 1 ? "" : "s"} · {mc.name}
            </span>
            <b className="text-[18px] font-extrabold text-gray-900">
              {mc.final != null && Math.round(mc.final) !== Math.round(mc.total) ? (
                <>
                  <s className="mr-1.5 text-[13px] font-semibold text-gray-400">{inr(mc.total)}</s>
                  {inr(mc.final)}
                </>
              ) : (
                inr(mc.total)
              )}
            </b>
          </span>
        ) : null}
        {/* what the final check changed, who changed it and why */}
        {mc?.adjustments?.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900">
            <b className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">Changed on the final check</b>
            {mc.adjustments.map((a, i) => (
              <span key={i}>
                {a.type} · {a.date.slice(8)}/{a.date.slice(5, 7)}: <s>{inr(a.amount)}</s> → <b>{inr(a.final)}</b>
                {a.by ? ` · by ${a.by}` : ""}
                {a.reason ? ` — “${a.reason}”` : ""}
              </span>
            ))}
          </div>
        )}
        <Note>
          {claimState === "sent"
            ? `With ${f.manager} for approval — every ${m} trip you submit joins this one claim. Recall a trip to change it.`
            : claimState === "approved"
              ? `Approved by ${f.manager}. Accounts / the CEO do the final check — a line may be adjusted, with the reason shown here — then it goes into payroll.`
              : claimState === "final"
                ? `Finalised${mc?.finalisedBy ? ` by ${mc.finalisedBy}` : ""} — ${inr(mc?.final ?? mc?.total)} goes into payroll${mc?.additionalSalary ? ` (${mc.additionalSalary})` : ""}.`
              : claimState === "open" && mc?.lines.length
                ? `Saved but not sent — send it to ${f.manager}.${notAdded ? ` ${notAdded} trip${notAdded > 1 ? "s are" : " is"} not submitted yet.` : ""}`
                : claimState === "rejected"
                  ? `${f.manager} sent ${m} back — recall the trip to fix, submit it again, or send ${m} as it is.`
                  : `Each trip you submit goes to ${f.manager} in one claim for ${m}.${notAdded ? ` ${notAdded} trip${notAdded > 1 ? "s are" : " is"} not submitted yet.` : ""}`}
        </Note>
        {confirm && (
          <div role="alertdialog" aria-label={`Send ${m} for approval`} className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
            <b className="text-[13.5px] font-extrabold text-gray-900">
              Send {m} ({inr(mc?.total)}) to {f.manager} for approval?
            </b>
            <span className="text-[12px] leading-snug text-gray-600">
              {notAdded ? `${notAdded} trip${notAdded > 1 ? "s are" : " is"} not in it — add ${notAdded > 1 ? "them" : "it"} first if ${notAdded > 1 ? "they" : "it"} should be paid this month. ` : ""}
              You can recall it until it is approved.
            </span>
            <span className="flex gap-2">
              <button type="button" disabled={!!busy} onClick={() => setConfirm(false)} className="min-h-10 flex-1 rounded-xl border border-gray-300 bg-white text-[13.5px] font-bold text-gray-800">
                Cancel
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => act("send", () => f.actions.sendMonth(), `${m} sent to ${f.manager} for approval`)}
                className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-[13.5px] font-bold text-white disabled:opacity-60"
              >
                {busy === "send" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Yes, send
              </button>
            </span>
          </div>
        )}
      </div>

      {/* RBM, ZSM and SM: ask the GM for the car on one of the month's trips */}
      {f.canCar && (
        <button
          type="button"
          onClick={() => f.openCarRequest({ pick: true })}
          className="flex w-full items-center gap-2 rounded-2xl bg-blue-50 px-3 py-2.5 text-left text-blue-800 hover:bg-blue-100"
        >
          <Car className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">Going by car on a planned trip? Request it from the {f.carApprover}</span>
          <span className="flex shrink-0 items-center text-[13px] font-extrabold">
            Request <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        </button>
      )}
      <SheetFoot label="Field claims go into" value={`${f.payroll.name} · by ${f.payroll.cutoff}`}>
        {(claimState === "open" || claimState === "rejected") && mc?.lines.length ? (
          <FootBtn disabled={confirm} busy={busy === "send"} onClick={() => setConfirm(true)}>
            Send {m}
          </FootBtn>
        ) : (
          <FootBtn ghost onClick={f.closeSheet}>
            Close
          </FootBtn>
        )}
      </SheetFoot>
    </div>
  );
}

function Part({ icon: Icon, dot, title, value, sub }) {
  return (
    <div className="flex items-center gap-2.5">
      <i className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[13px] font-extrabold text-gray-900">
          <Icon className="h-3.5 w-3.5 text-blue-800" aria-hidden /> {title}
        </span>
        <span className="block truncate text-[11.5px] text-gray-500">{sub}</span>
      </div>
      <b className="text-[15px] font-extrabold text-gray-900">{inr(value)}</b>
    </div>
  );
}

const Stand = ({ label, value, hi }) => (
  <span className="flex min-w-0 flex-col">
    <small className="truncate text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{label}</small>
    <b className={cn("truncate text-[14px] font-extrabold", hi ? "text-blue-700" : "text-gray-900")}>{inr(value)}</b>
  </span>
);

/* ---------- own car for a planned trip ---------- */

export function CarRequestSheet({ opts }) {
  const f = useFieldExpenses();
  const travelled = opts?.tripId ? f.trips.find((t) => t.id === opts.tripId) : null;
  const picking = !!opts?.pick;
  const draft = opts?.draft || null;

  const fromTrip = (t, claim, request) => ({
    id: t.id,
    from: t.from,
    to: t.to,
    places: tripRoute(t, f.data?.employee?.hq),
    name: t.name,
    km: t.km,
    kmKnown: true,
    nights: t.nights,
    tolls: 0,
    travelled: true,
    // a trip already asked for, or already claimed, is listed but not pickable
    blocked: request
      ? request.status === "approved"
        ? "car approved"
        : "car requested"
      : claim && claim.status !== "unclaimed"
        ? "already claimed"
        : null,
  });

  // the trips to pick from: a trip card asks for its own trip only; the
  // month summary lists every trip of the month, then the upcoming HQ Tour
  // Plan trips that have no request yet
  const options = travelled
    ? [fromTrip(travelled)]
    : [
        ...(picking
          ? [...f.claimed]
              .filter((x) => x.trip.kind !== "hq")
              .sort((a, b) => a.trip.from.localeCompare(b.trip.from))
              .map((x) => fromTrip(x.trip, x.claim, x.calc.request))
          : []),
        ...f.plans.filter((p) => !p.request),
      ];
  const firstOpen = options.find((o) => !o.blocked);
  const [planId, setPlanId] = useState(draft?.planId && options.some((o) => o.id === draft.planId && !o.blocked) ? draft.planId : firstOpen?.id || null);
  const plan = options.find((p) => p.id === planId) || null;

  // one fuel price for every car: petrol (12 Nov 2026)
  const fuel = "Petrol";
  const [kmIn, setKmIn] = useState(draft?.km ?? "");
  // null: not touched, the ask follows the suggestion; otherwise what was
  // typed, as typed ("" while the box is being cleared counts as ₹0)
  const [askIn, setAskIn] = useState(draft?.ask != null ? String(draft.ask) : null);
  const [busy, setBusy] = useState(false);

  const planKm = plan && plan.kmKnown && plan.km ? plan.km : null;
  const km = plan ? planKm || Math.max(0, Math.round(Number(kmIn) || 0)) : 0;
  const tolls = 0; // not paid (13 Nov 2026)
  const fuelAmt = fuelCost(km, fuel);
  const sugg = fuelAmt;
  const ask = askIn != null ? Math.max(0, Math.round(Number(askIn) || 0)) : sugg;
  const ok = !!plan && km > 0 && ask > 0;


  const send = async () => {
    setBusy(true);
    try {
      await f.actions.requestOwnCar({
        planId: plan.id,
        tripId: plan.travelled ? plan.id : null,
        from: plan.from,
        to: plan.to,
        places: plan.places,
        km,
        fuel,
        fuelCost: fuelAmt,
        tolls,
        suggested: sugg,
        ask,
      });
      toast.success(`Car request sent to ${f.carApprover}`);
      f.closeSheet();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const input = "h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-500";
  return (
    <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 [&>*]:shrink-0 gap-3">
      <ModalTitle className="pr-10 text-lg font-extrabold text-gray-900">
        {travelled ? `Request car · ${travelled.name}` : picking ? "Request car · pick a trip" : "Own car for a planned trip"}
      </ModalTitle>
      <Note>
        {`Until ${f.carApprover} approves, the trip is paid the normal allowance. Once approved, the fuel bills replace the fare — scan them in the claim. Tolls are not paid.`}
      </Note>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-gray-700">{travelled ? "Trip" : picking ? "Which trip" : "Which planned trip"}</span>
        {options.length ? (
          options.map((p) => {
            const b = dateBlock(p.from);
            const on = p.id === planId;
            const pKm = (p.kmKnown && p.km) || (on ? km : 0);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                disabled={!!p.blocked}
                onClick={() => setPlanId(p.id)}
                className={cn(
                  "grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-2xl border-[1.5px] p-2.5 text-left",
                  on ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white",
                  p.blocked && "cursor-not-allowed opacity-55"
                )}
              >
                <span className="flex flex-col items-center leading-none">
                  <b className="text-[17px] font-extrabold text-gray-900">{b.dd}</b>
                  <small className="mt-0.5 text-[10px] font-bold text-gray-500">{b.dow}</small>
                </span>
                <span className="min-w-0">
                  <b className="block truncate text-[13.5px] font-bold text-gray-900">{p.travelled ? (travelled ? `${p.name} · this trip` : p.name) : p.places}</b>
                  <small className="block text-[11.5px] leading-snug text-gray-500">
                    {rangeLabel(p.from, p.to)} · {pKm ? `~${pKm} km` : "km to enter"}
                    {p.nights ? ` · ${p.nights} night${p.nights > 1 ? "s" : ""}` : ""}
                    {p.travelled ? " · already travelled" : ""}
                  </small>
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold",
                    p.blocked ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-800"
                  )}
                >
                  {p.blocked || (pKm ? `up to ${inr(fuelCost(pKm, fuel))}` : "—")}
                </span>
              </button>
            );
          })
        ) : (
          <p className="rounded-xl bg-gray-50 px-3 py-3 text-[12.5px] text-gray-500">
            {picking
              ? "No trip this month, and no upcoming plan without a car request. Add the trip as an HQ Tour Plan in the Planner first."
              : "No upcoming plan without a car request. Add the trip as an HQ Tour Plan in the Planner first, then request the car from it."}
          </p>
        )}
        <Note icon={Route}>
          Suggested = km ÷ {MILEAGE_KM_PER_L} km/l × fuel price (fixed) — fuel only, tolls are not paid. Edit the ask before you send; the manager approves the asked amount.
        </Note>
      </div>

      {plan && !planKm && (
        <label className="flex flex-col gap-1 text-[13px] font-bold text-gray-700">
          Route km (out and back)
          <input type="number" inputMode="numeric" min="0" className={input} placeholder="e.g. 460" value={kmIn} onChange={(e) => setKmIn(e.target.value)} />
          <span className="text-[11.5px] font-normal text-gray-500">The Planner has no distance for {plan.places}.</span>
        </label>
      )}

      {plan && km > 0 && (
        <div className="rounded-2xl bg-gray-100 px-3 py-2.5 text-[12.5px] text-gray-600">
          <div className="flex justify-between gap-2 py-0.5">
            <span>Fuel price</span>
            <b className="text-gray-900">₹{FUEL_PRICE[fuel]}/l</b>
          </div>
          <div className="flex justify-between gap-2 py-0.5">
            <span>
              Fuel · {km} km ÷ {MILEAGE_KM_PER_L} km/l × ₹{FUEL_PRICE[fuel]}
            </span>
            <b className="text-gray-900">{inr(fuelAmt)}</b>
          </div>
          <div className="mt-1 flex justify-between gap-2 border-t border-dashed border-gray-300 pt-1.5 font-bold text-gray-900">
            <span>Suggested</span>
            <b className="text-[15px] font-extrabold">{inr(sugg)}</b>
          </div>
          <label className="mt-2 flex flex-col gap-1 text-[12.5px] font-bold text-gray-700">
            <span>
              Your ask <small className="font-medium text-gray-500">· edit if needed</small>
            </span>
            <span className="flex h-11 items-center gap-1 rounded-xl border border-gray-300 bg-white px-3">
              <span className="text-gray-400">₹</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="10"
                value={askIn ?? String(sugg)}
                onChange={(e) => setAskIn(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold outline-none"
                aria-label="Amount asked"
              />
            </span>
          </label>
        </div>
      )}


      <SheetFoot label={plan ? (ask === 0 ? "type the amount you ask for" : ask !== sugg ? `asking · suggested ${inr(sugg)}` : "asking · as suggested") : "Pick a trip"} value={plan && km ? inr(ask) : "—"}>
        <FootBtn disabled={!ok} busy={busy} onClick={send}>
          Request
        </FootBtn>
      </SheetFoot>
    </div>
  );
}

/* ---------- one car request ---------- */

export function RequestSheet({ req }) {
  const f = useFieldExpenses();
  const ok = req.status === "approved";
  const no = req.status === "rejected";
  const n = Math.round((new Date(req.to) - new Date(req.from)) / 86400000) + 1;
  const [busy, setBusy] = useState(false);
  const row = (k, v) => (
    <div className="flex justify-between gap-3 border-b border-gray-100 py-2 text-[13px]">
      <span className="shrink-0 text-gray-500">{k}</span>
      <span className="text-right font-semibold text-gray-900">{v}</span>
    </div>
  );
  // recall = withdraw it, then reopen the form with its values to edit and resend
  const recall = async () => {
    setBusy(true);
    try {
      await f.actions.withdrawRequest(req.id);
      f.openCarRequest({ tripId: req.tripId || null, draft: req });
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 [&>*]:shrink-0 gap-2">
      <ModalTitle className="pr-10 text-lg font-extrabold text-gray-900">{ok ? "Car approved for this trip" : no ? "Car not approved" : "Car requested"}</ModalTitle>
      <div className="flex flex-wrap items-center gap-2">
        <Pill ok={ok}>{ok ? "approved" : no ? "rejected" : "awaiting approval"}</Pill>
        <span className="text-[12.5px] text-gray-500">{ok || no ? `by ${f.carApprover}` : `waiting for ${f.carApprover}`} · {req.id}</span>
      </div>
      <div className="mt-1">
        {row("Dates", `${rangeLabel(req.from, req.to)} · ${n} day${n > 1 ? "s" : ""}`)}
        {row("Route", req.places)}
        {row("Estimated", `~${req.km} km`)}
        {row("Fuel price", `₹${FUEL_PRICE.Petrol}/l`)}
        {row("Fuel", `${inr(req.fuelCost ?? fuelCost(req.km))} · ${req.km} km ÷ ${MILEAGE_KM_PER_L} km/l × ₹${FUEL_PRICE.Petrol}`)}
        {req.tolls > 0 && row("Tolls (asked before)", inr(req.tolls))}
        {row("Suggested", inr((req.fuelCost ?? fuelCost(req.km)) + (req.tolls || 0)))}
        <div className="flex justify-between gap-3 py-2 text-[14px] font-bold text-gray-900">
          <span>{ok ? "Approved up to" : req.status === "rejected" ? "Not approved · asked" : "Asked"}</span>
          <b className="text-[16px] font-extrabold">{inr(ok ? req.ask : req.asked || req.ask)}</b>
        </div>
        {ok && req.asked && req.approvedAmount !== req.asked && row("You asked", inr(req.asked))}
        {req.note && row(ok ? "GM's note" : "Reason", req.note)}
      </div>
      <Note>
        {ok
          ? "After the trip, scan the fuel bills on the trip itself — they replace the fare for all its days (split by km). No bill: the fare is paid. Tolls are not paid."
          : no
            ? "The trip is paid the normal fare. You can ask again from the trip."
            : `Until ${f.carApprover} approves, the trip is paid the normal allowance.`}
      </Note>
      <SheetFoot label={ok ? "Car allowance on" : no ? "Not approved" : `Awaiting ${f.carApprover}`} value={rangeLabel(req.from, req.to)}>
        {ok || no ? (
          <FootBtn ghost onClick={f.closeSheet}>
            Close
          </FootBtn>
        ) : (
          <FootBtn ghost busy={busy} onClick={recall}>
            <Undo2 className="h-4 w-4" aria-hidden /> Recall &amp; edit
          </FootBtn>
        )}
      </SheetFoot>
    </div>
  );
}
