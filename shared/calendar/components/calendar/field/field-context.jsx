"use client";

/* Field layer state for the planner: the signed-in rep's TA/DA for the month on
   screen (from the Field expenses console, see lib/field-expenses), grouped
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

const FieldContext = createContext(null);

export function FieldExpensesProvider({ children }) {
  const { selectedDate, selectedUserId, allEvents, users } = useCalendar();
  const month = format(selectedDate || new Date(), "yyyy-MM");
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

  // the claims belong to whoever the console says this is
  const emp = state.data?.employee?.code || null;
  const [claims, setClaims] = useState(() => store.loadClaims(null));
  useEffect(() => {
    setClaims(store.loadClaims(emp));
    return store.subscribeClaims((who, next) => who === emp && setClaims(next));
  }, [emp]);

  const value = useMemo(() => {
    const rows = state.data?.rows || [];
    const trips = buildTrips(rows);
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const tripByDate = new Map();
    trips.forEach((t) => t.days.forEach((d) => tripByDate.set(d.date, t)));
    const role = state.data?.employee?.role || null;
    const ctx = { rates: state.data?.rates, role, requests: claims.requests };

    // each trip with its claim and what it is worth
    const claimed = trips.map((t) => {
      const claim = store.claimOf(claims, t.id);
      const calc = tripClaim(t, claim, ctx);
      return { trip: t, claim, calc, checks: tripChecks(t, claim, calc) };
    });
    const byTrip = new Map(claimed.map((x) => [x.trip.id, x]));

    // upcoming trips from the rep's own HQ Tour Plan, for an own-car request
    const today = format(new Date(), "yyyy-MM-dd");
    const liveRequests = claims.requests.filter((r) => r.status !== "withdrawn");
    const plans = plannedTrips({
      events: allEvents,
      me: LOGGED_IN_USER.id,
      homeHq: state.data?.employee?.hq,
      rows,
      today,
      hqTourPlanTag: TAG_IDS.HQ_TOUR_PLAN,
    }).map((p) => ({ ...p, request: liveRequests.find((r) => r.planId === p.id || (r.from <= p.to && r.to >= p.from)) || null }));

    // who approves: the rep's leave approver, as the team list names them
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
      // nothing to show for someone the console does not cover (office staff)
      enabled: viewingSelf && !(state.status === "ready" && !state.data?.employee),
      rows,
      trips,
      claimed,
      claimFor: (id) => byTrip.get(id) || null,
      requests: liveRequests,
      plans,
      manager,
      payroll: payrollOf(month),
      stats: monthStats(rows, trips),
      dayOf: (date) => byDate.get(typeof date === "string" ? date : format(date, "yyyy-MM-dd")) || null,
      tripOf: (date) => tripByDate.get(typeof date === "string" ? date : format(date, "yyyy-MM-dd")) || null,
      sheet,
      stripOpen,
    };
  }, [month, state, viewingSelf, sheet, stripOpen, claims, emp, allEvents, users]);

  const openTrip = useCallback((id) => setSheet({ kind: "trip", id }), []);
  /* opts: { tripId } a travelled trip, { planId } a planned one, { draft } a recalled request's values */
  const openCarRequest = useCallback((opts = {}) => setSheet({ kind: "car", ...(typeof opts === "string" ? { tripId: opts } : opts || {}) }), []);
  const openRequest = useCallback((id) => setSheet({ kind: "request", id }), []);
  const openKpi = useCallback(() => setSheet({ kind: "kpi" }), []);
  const closeSheet = useCallback(() => setSheet(null), []);
  const toggleStrip = useCallback(() => setStripOpen((v) => !v), []);

  // actions, bound to this rep; each returns a promise (the ERP later)
  const actions = useMemo(
    () => ({
      setStayBill: (tripId, date, file, amount) => store.setStayBill(emp, tripId, date, file, amount),
      setStayAmount: (tripId, date, amount) => store.setStayAmount(emp, tripId, date, amount),
      addCarBill: (tripId, kind, bill) => store.addCarBill(emp, tripId, kind, bill),
      updateCarBill: (tripId, kind, id, patch) => store.updateCarBill(emp, tripId, kind, id, patch),
      removeCarBill: (tripId, kind, id) => store.removeCarBill(emp, tripId, kind, id),
      submitTrip: (tripId, totals) => store.submitTrip(emp, tripId, totals),
      recallTrip: (tripId) => store.recallTrip(emp, tripId),
      requestOwnCar: (req) => store.requestOwnCar(emp, req),
      withdrawRequest: (id) => store.withdrawRequest(emp, id),
      setRequestBills: (id, bills) => store.setRequestBills(emp, id, bills),
      approveRequest: (id) => store.approveRequest(emp, id),
    }),
    [emp]
  );

  return (
    <FieldContext.Provider value={{ ...value, actions, openTrip, openCarRequest, openRequest, openKpi, closeSheet, toggleStrip }}>
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
