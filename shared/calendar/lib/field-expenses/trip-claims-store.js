/* Trip claims and own-car requests for the planner's Field layer.

   PREVIEW BACKEND. The ERP has no doctype yet for a trip claim (TA + DA with
   stay, fuel and toll bills) or for an own-car request, so this module keeps
   them in the browser, per employee. Every screen goes through the async
   functions below and nothing else, so when the ERP side exists each one is
   swapped for its ERP call (and `PREVIEW` set to false) without touching the
   UI:
     submitTrip      -> create the claim, attach the bills, "Send for Approval"
     recallTrip      -> workflow action "Withdraw"
     saveTripDraft   -> save the Draft claim
     requestOwnCar   -> create the request for the rep's manager
     withdrawRequest -> cancel it
   Bill photos are not kept here: only their name and size, plus the amount
   read off them. */

export const PREVIEW = true;

const KEY = (emp) => `fx-trip-claims:${emp}`;
const empty = () => ({ trips: {}, requests: [] });
const listeners = new Set();
const memory = new Map(); // emp -> state, when storage is unavailable

function read(emp) {
  if (!emp) return empty();
  try {
    const raw = window.localStorage.getItem(KEY(emp));
    return raw ? { ...empty(), ...JSON.parse(raw) } : memory.get(emp) || empty();
  } catch {
    return memory.get(emp) || empty();
  }
}

function write(emp, state) {
  memory.set(emp, state);
  try {
    window.localStorage.setItem(KEY(emp), JSON.stringify(state));
  } catch {
    /* private window: kept in memory for this visit */
  }
  listeners.forEach((fn) => fn(emp, state));
  return state;
}

export function loadClaims(emp) {
  return read(emp);
}

export function subscribeClaims(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const blankClaim = () => ({ status: "unclaimed", recalled: false, car: false, fuels: [], tolls: [], foods: [], stays: {} });
const uid = () => Math.random().toString(36).slice(2, 10);
const fileMeta = (file) => (file ? { name: file.name || "bill", size: file.size || 0 } : null);

export const claimOf = (state, tripId) => ({ ...blankClaim(), ...(state?.trips?.[tripId] || {}) });

function updateTrip(emp, tripId, fn) {
  const state = read(emp);
  const cur = claimOf(state, tripId);
  if (cur.status !== "unclaimed") throw new Error("This trip is already submitted — recall it to change it.");
  const next = fn(cur);
  return write(emp, { ...state, trips: { ...state.trips, [tripId]: next } });
}

/* ---------- editing a trip before it is submitted ---------- */

export async function setCar(emp, tripId, on) {
  return updateTrip(emp, tripId, (c) => ({ ...c, car: !!on }));
}

/* A night's hotel bill and the amount on it (read off the bill, or typed in).
   With a bill the night's DA is the bill's amount; without one, 50 % of DA. */
export async function setStayBill(emp, tripId, date, file, amount = null) {
  return updateTrip(emp, tripId, (c) => {
    const stays = { ...c.stays };
    if (file) stays[date] = { ...fileMeta(file), amount: Number(amount) > 0 ? Math.round(Number(amount)) : null };
    else delete stays[date];
    return { ...c, stays };
  });
}

export async function setStayAmount(emp, tripId, date, amount) {
  return updateTrip(emp, tripId, (c) => {
    if (!c.stays?.[date]) return c;
    return { ...c, stays: { ...c.stays, [date]: { ...c.stays[date], amount: Number(amount) > 0 ? Math.round(Number(amount)) : null } } };
  });
}

/* kind: "fuels" | "tolls" | "foods". A scan adds a row with what the bill
   reader found. Food bills are kept with the claim as the proof behind the DA. */
export async function addCarBill(emp, tripId, kind, { amount = null, file = null, read = null, date = null } = {}) {
  const id = uid();
  updateTrip(emp, tripId, (c) => ({ ...c, [kind]: [...(c[kind] || []), { id, amount, file: fileMeta(file), read, ...(date ? { date } : {}) }] }));
  return id;
}

export async function updateCarBill(emp, tripId, kind, id, patch) {
  return updateTrip(emp, tripId, (c) => ({
    ...c,
    [kind]: (c[kind] || []).map((b) => (b.id === id ? { ...b, ...patch, ...(patch.file !== undefined ? { file: fileMeta(patch.file) } : {}) } : b)),
  }));
}

export async function removeCarBill(emp, tripId, kind, id) {
  return updateTrip(emp, tripId, (c) => ({ ...c, [kind]: (c[kind] || []).filter((b) => b.id !== id) }));
}

/* ---------- submit / recall ---------- */

export async function submitTrip(emp, tripId, { total, ta, da, review }) {
  const state = read(emp);
  const cur = claimOf(state, tripId);
  if (cur.status !== "unclaimed") throw new Error("This trip is already submitted.");
  const next = { ...cur, status: review ? "review" : "submitted", recalled: false, submittedAt: new Date().toISOString(), claimed: { total, ta, da } };
  return write(emp, { ...state, trips: { ...state.trips, [tripId]: next } });
}

export async function recallTrip(emp, tripId) {
  const state = read(emp);
  const cur = claimOf(state, tripId);
  if (cur.status !== "submitted" && cur.status !== "review") throw new Error("Only a submitted trip can be recalled — this one is past approval.");
  const next = { ...cur, status: "unclaimed", recalled: true, submittedAt: null };
  return write(emp, { ...state, trips: { ...state.trips, [tripId]: next } });
}

/* ---------- own-car requests ---------- */

export async function requestOwnCar(emp, req) {
  const state = read(emp);
  const clash = state.requests.find((r) => r.status !== "withdrawn" && (r.tripId && r.tripId === req.tripId || (r.from <= req.to && r.to >= req.from)));
  if (clash) {
    throw new Error(clash.status === "approved" ? "The car is already approved for these dates." : "A car request for these dates is already waiting — recall it to change it.");
  }
  const next = { id: uid(), status: "pending", requestedAt: new Date().toISOString(), ...req };
  return write(emp, { ...state, requests: [...state.requests, next] });
}

/* PREVIEW ONLY: stands in for the GM approving in the ERP, so the car
   allowance can be seen before the approval flow exists. */
export async function approveRequest(emp, id) {
  if (!PREVIEW) throw new Error("Car requests are approved by the GM in the ERP.");
  const state = read(emp);
  return write(emp, { ...state, requests: state.requests.map((r) => (r.id === id && r.status === "pending" ? { ...r, status: "approved", approvedAt: new Date().toISOString() } : r)) });
}

/* The fuel and toll bills on a car request (name, size, amount each). */
export async function setRequestBills(emp, id, bills) {
  const state = read(emp);
  return write(emp, { ...state, requests: state.requests.map((r) => (r.id === id ? { ...r, bills } : r)) });
}

export async function withdrawRequest(emp, id) {
  const state = read(emp);
  return write(emp, { ...state, requests: state.requests.map((r) => (r.id === id ? { ...r, status: "withdrawn" } : r)) });
}

/* ---------- labels ---------- */

export const STATUS_LABEL = {
  unclaimed: "To claim",
  recalled: "Recalled",
  submitted: "Submitted",
  review: "In review",
  approved: "In payroll",
  paid: "Paid",
};
export const statusKey = (c) => (c.status === "unclaimed" && c.recalled ? "recalled" : c.status);
export const canRecall = (c) => c.status === "submitted" || c.status === "review";
export const isLocked = (c) => c.status === "approved" || c.status === "paid";
