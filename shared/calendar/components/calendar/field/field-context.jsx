"use client";

/* Field layer state for the planner: the signed-in rep's TA/DA for the month on
   screen (from the ERP's Field Expense Day, see lib/field-expenses), grouped
   into trips, each trip's claim (stay bills, car, fuel and toll bills, status)
   and the rep's own-car requests, plus which sheet is open. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { buildTrips, fetchFieldMonth, monthStats } from "@calendar/lib/field-expenses/field-days";
import { CAR_APPROVER, canUseCar, claimsStays, payrollOf, plannedTrips, tripChecks, tripClaim } from "@calendar/lib/field-expenses/claim-rules";
import { TAG_IDS } from "@calendar/components/calendar/constants";
import * as store from "@calendar/lib/field-expenses/trip-claims-store";
import * as monthErp from "@calendar/lib/field-expenses/erp-claim";
import { releaseTripBill } from "@calendar/lib/field-expenses/bill-reader";

const FieldContext = createContext(null);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shiftMonth = (ym, n) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthWord = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1] || ym;

export function FieldExpensesProvider({ children }) {
  const { selectedDate, setSelectedDate, selectedUserId, allEvents, users } = useCalendar();
  /* Which month's TA/DA the layer works on (12 Nov 2026): a month is claimed
     in the NEXT month, so the current month's view shows last month.
       viewing the current month (Nov)   -> October (being claimed now)
       viewing any past month (Oct ...)  -> that month itself
       viewing a future month (Dec ...)  -> nothing yet
     So in December: October shows October, November and December show November. */
  const viewed = format(selectedDate || new Date(), "yyyy-MM");
  const current = format(new Date(), "yyyy-MM");
  const prev = shiftMonth(current, -1);
  const month = viewed >= current ? prev : viewed;
  const [state, setState] = useState({ month: null, status: "idle", data: null, error: null });
  const [sheet, setSheet] = useState(null); // { kind: "trip", id } | { kind: "car", tripId? }
  const [stripOpen, setStripOpen] = useState(false);

  // The layer is the signed-in rep's own money. A manager looking at someone
  // else's calendar would otherwise see their own trips over a colleague's visits.
  const viewingSelf =
    !selectedUserId?.length || !LOGGED_IN_USER.id || selectedUserId.includes(LOGGED_IN_USER.id);

  useEffect(() => {
    let alive = true;
    setState((s) => (s.month === month && s.status === "ready" ? s : { month, status: "loading", data: null, error: null }));
    fetchFieldMonth(month)
      .then((data) => alive && setState({ month, status: "ready", data, error: null }))
      .catch((error) => alive && setState({ month, status: "error", data: null, error }));
    return () => {
      alive = false;
    };
  }, [month]);

  // the claims belong to whoever the ERP says this is
  const emp = state.data?.employee?.code || null;
  const [claims, setClaims] = useState(() => store.loadClaims(null));
  useEffect(() => {
    setClaims(store.loadClaims(emp));
    return store.subscribeClaims((who, next) => who === emp && setClaims(next));
  }, [emp]);

  // the month's ERP Expense Claim (one per rep per month): what is in it and
  // whether it is still open, sent, or approved -- read fresh after each change
  const [monthClaim, setMonthClaim] = useState({ month: null, status: "idle", claim: null, error: null });
  const refreshMonthClaim = useCallback(() => {
    if (!emp) return Promise.resolve(null);
    setMonthClaim((s) => (s.month === month ? { ...s, status: s.status === "ready" ? "ready" : "loading" } : { month, status: "loading", claim: null, error: null }));
    return monthErp
      .loadMonthClaim(emp, month)
      .then((claim) => {
        setMonthClaim({ month, status: "ready", claim, error: null });
        return claim;
      })
      .catch((error) => setMonthClaim({ month, status: "error", claim: null, error }));
  }, [emp, month]);
  useEffect(() => {
    refreshMonthClaim();
  }, [refreshMonthClaim]);

  // own-car requests: in the ERP (Car Request, decided by the GM) -- read
  // fresh, and again after each change
  const [carReqs, setCarReqs] = useState({ emp: null, list: [] });
  const refreshCarRequests = useCallback(() => {
    if (!emp) return Promise.resolve([]);
    return monthErp
      .loadCarRequests()
      .then((list) => {
        setCarReqs({ emp, list });
        return list;
      })
      .catch(() => []);
  }, [emp]);
  useEffect(() => {
    refreshCarRequests();
  }, [refreshCarRequests]);
  const carRequests = useMemo(() => (carReqs.emp === emp ? carReqs.list : []), [carReqs, emp]);

  const value = useMemo(() => {
    const rows = state.data?.rows || [];
    const trips = buildTrips(rows, state.data?.employee?.hq);
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const tripByDate = new Map();
    trips.forEach((t) => t.days.forEach((d) => tripByDate.set(d.date, t)));
    const role = state.data?.employee?.role || null;
    const ctx = { role, requests: carRequests };

    // each trip with its claim and what it is worth
    // a submitted trip's status is the month's claim's in the ERP, once the
    // trip's days are in that claim
    // -- and, while the month is with the officer or sent back, the officer's
    // own decision on THIS trip (they decide trip by trip): approved stays
    // approved, rejected is sent back with the reason
    const mcl = monthClaim.month === month ? monthClaim.claim : null;
    const ERP_STATUS = { "Waiting for Approval": "sent", Rejected: "rejected", Approved: "approved", Verified: "paid", Paid: "paid", "In Review": "review" };
    // a month can hold several claims (a new one once one is approved): the
    // trip's lines and status come from the claim that holds them
    const monthClaims = mcl ? mcl.all || [{ name: mcl.name, status: mcl.status, open: mcl.open, lines: mcl.lines }] : [];
    const live = (local, t) => {
      let holder = null;
      let mine = [];
      for (const c of monthClaims) {
        mine = monthErp.tripLinesOf(c.lines, t);
        if (mine.length) {
          holder = c;
          break;
        }
      }
      // this browser has no record of the trip but the ERP has its lines: it
      // was claimed elsewhere (another phone or site) -- the ERP's word stands
      const claim = local.status === "unclaimed" && mine.length ? monthErp.claimFromErp(mine) : local;
      if (claim.status !== "submitted" && claim.status !== "review") return claim;
      if (!holder) return claim;
      let s = ERP_STATUS[holder.status];
      const rej = mine.find((l) => l.decision === "Rejected");
      const ok = mine.every((l) => l.decision === "Approved");
      if (s === "sent" || s === "rejected") s = rej ? "rejected" : ok ? "okd" : s;
      const officer = rej
        ? { decision: "rejected", note: rej.decisionNote, by: rej.decidedBy, on: rej.decidedOn }
        : ok
          ? { decision: "approved", by: mine[0].decidedBy, on: mine[0].decidedOn }
          : null;
      // amounts changed after it was sent (13 Nov 2026): by the reporting
      // officer while it waited, or on the final check -- who, why, and what
      // it does to the trip's TA / DA
      const changes = mine
        .filter((l) => l.adjusted)
        .map((l) => ({ id: l.id, type: l.type, date: l.date, amount: l.amount, final: l.final, reason: l.adjustReason || "", by: l.adjustedBy || "" }));
      const TA_LINE = new Set(["Travel", "Fuel", "Toll"]);
      const taDelta = changes.filter((x) => TA_LINE.has(x.type)).reduce((a, x) => a + (x.final - x.amount), 0);
      const daDelta = changes.filter((x) => !TA_LINE.has(x.type)).reduce((a, x) => a + (x.final - x.amount), 0);
      // the claim it is in (the trip sheet shows where THAT claim is)
      return {
        ...claim,
        ...(s ? { status: s } : {}),
        officer,
        changes,
        taDelta,
        daDelta,
        holder: { name: holder.name, status: holder.status, open: holder.open },
      };
    };
    const claimed = trips.map((t) => {
      const claim = live(store.claimOf(claims, t.id), t);
      const base = tripClaim(t, claim, ctx);
      const dTa = Math.round(claim.taDelta || 0);
      const dDa = Math.round(claim.daDelta || 0);
      const calc = dTa || dDa ? { ...base, taClaimed: base.ta, daClaimed: base.da, ta: base.ta + dTa, da: base.da + dDa, total: base.total + dTa + dDa } : base;
      return { trip: t, claim, calc, checks: tripChecks(t, claim, calc) };
    });
    const byTrip = new Map(claimed.map((x) => [x.trip.id, x]));

    // upcoming trips from the rep's own HQ Tour Plan, for an own-car request
    const today = format(new Date(), "yyyy-MM-dd");
    const liveRequests = carRequests.filter((r) => r.status !== "withdrawn");
    const plans = plannedTrips({
      events: allEvents,
      me: LOGGED_IN_USER.id,
      homeHq: state.data?.employee?.hq,
      rows,
      today,
      hqTourPlanTag: TAG_IDS.HQ_TOUR_PLAN,
    }).map((p) => ({ ...p, request: liveRequests.find((r) => r.planId === p.id || (r.from <= p.to && r.to >= p.from)) || null }));

    // who approves: the rep's leave approver, as the team list names them
    // a future month: nothing to claim yet -- a short note and a jump back
    const away = viewed > current ? { text: `${monthWord(viewed)} is claimed from ${monthWord(shiftMonth(viewed, 1))}`, to: current, toLabel: `Go to ${monthWord(current).slice(0, 3)}` } : null;

    const approverEmail = String(LOGGED_IN_USER.leave_approver || "").toLowerCase();
    const approver = approverEmail ? (users || []).find((u) => String(u.email || "").toLowerCase() === approverEmail) : null;
    const manager = approver ? `${approver.name || approver.id}${approver.roleId ? ` (${approver.roleId})` : ""}` : "your manager";

    return {
      month,
      status: state.status,
      error: state.error,
      data: state.data,
      emp,
      role,
      canCar: canUseCar(role),
      // who says yes to a car request
      carApprover: `the ${CAR_APPROVER}`,
      // stay and food bills start at RBM; the designation is the ERP's
      claimsBills: claimsStays(role),
      designation: state.data?.employee?.designation || null,
      // nothing to show for someone the ERP has no field days for (office staff)
      enabled: viewingSelf && !(state.status === "ready" && !state.data?.employee),
      rows,
      trips,
      claimed,
      claimFor: (id) => byTrip.get(id) || null,
      requests: liveRequests,
      plans,
      manager,
      approverId: approverEmail || null,
      payroll: payrollOf(month),
      stats: monthStats(rows, trips),
      // the month on screen is not where this TA/DA lives: the strip says
      // where it is, and the calendar's days carry none of it
      away,
      goToMonth: (ym) => setSelectedDate?.(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)),
      dayOf: (date) => (away ? null : byDate.get(typeof date === "string" ? date : format(date, "yyyy-MM-dd")) || null),
      tripOf: (date) => (away ? null : tripByDate.get(typeof date === "string" ? date : format(date, "yyyy-MM-dd")) || null),
      sheet,
      stripOpen,
      // the month's ERP claim: { status, claim: { name, status, open, total, lines } | null }
      monthClaim: monthClaim.month === month ? monthClaim : { month, status: "loading", claim: null, error: null },
    };
  }, [month, viewed, current, setSelectedDate, state, viewingSelf, sheet, stripOpen, claims, emp, allEvents, users, monthClaim, carRequests]);

  // from: "local" -- opened from the HQ & EQ days list, closing goes back there
  const openTrip = useCallback((id, from) => setSheet({ kind: "trip", id, ...(from ? { from } : {}) }), []);
  const openLocal = useCallback(() => setSheet({ kind: "local" }), []);
  /* opts: { tripId } a travelled trip, { planId } a planned one, { draft } a recalled request's values */
  const openCarRequest = useCallback((opts = {}) => setSheet({ kind: "car", ...(typeof opts === "string" ? { tripId: opts } : opts || {}) }), []);
  const openRequest = useCallback((id) => setSheet({ kind: "request", id }), []);
  const openKpi = useCallback(() => setSheet({ kind: "kpi" }), []);
  const closeSheet = useCallback(() => setSheet((s) => (s?.from === "local" ? { kind: "local" } : null)), []);
  const toggleStrip = useCallback(() => setStripOpen((v) => !v), []);

  // actions, bound to this rep; each returns a promise (the ERP later)
  const actions = useMemo(
    () => ({
      // a checked bill (bill-reader.js readTripBill) onto the trip, and off it
      // again -- its fingerprint freed so the same bill can be scanned again
      addBill: (tripId, kind, bill) => store.addBill(emp, tripId, kind, bill),
      removeBill: (tripId, kind, id) => store.removeBill(emp, tripId, kind, id).then((gone) => releaseTripBill(gone)),
      submitTrip: (tripId, totals) => store.submitTrip(emp, tripId, totals),
      // the whole month's claim to the reporting officer, and back
      sendMonth: () => monthErp.sendMonth({ employee: emp, month }).finally(refreshMonthClaim),
      recallMonth: () => monthErp.recallMonth({ employee: emp, month }).finally(refreshMonthClaim),
      refreshMonthClaim,
      recallTrip: (tripId) => store.recallTrip(emp, tripId),
      // own car: to the GM through the ERP, and back
      requestOwnCar: (req) => monthErp.requestCar(req).finally(refreshCarRequests),
      withdrawRequest: (id) => monthErp.withdrawCar(id).finally(refreshCarRequests),
      refreshCarRequests,
    }),
    [emp, month, refreshMonthClaim, refreshCarRequests]
  );

  return (
    <FieldContext.Provider value={{ ...value, actions, openTrip, openLocal, openCarRequest, openRequest, openKpi, closeSheet, toggleStrip }}>
      {children}
    </FieldContext.Provider>
  );
}

/* Outside the provider (the calendar used somewhere without it) the layer is
   simply off, so the shared month cell and agenda list keep working. */
export function useFieldExpenses() {
  return (
    useContext(FieldContext) || { enabled: false, dayOf: () => null, tripOf: () => null, claimFor: () => null, trips: [], rows: [], claimed: [], requests: [] }
  );
}
