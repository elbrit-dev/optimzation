/* Trip claims and own-car requests for the planner's Field layer.

   PREVIEW BACKEND. The ERP has no doctype yet for a trip claim (TA + DA with
   stay, fuel and toll bills) or for an own-car request, so this module keeps
   them in the browser, per employee. Every screen goes through the async
   functions below and nothing else, so when the ERP side exists each one is
   swapped for its ERP call (and `PREVIEW` set to false) without touching the
   UI:
     submitTrip      -> create the claim, attach the bills, "Send for Approval"
                        (12 Nov 2026: the trip's lines go into the month's
                        ERP claim by erp-claim.js first; this records it)
     recallTrip      -> workflow action "Withdraw"
     saveTripDraft   -> save the Draft claim
   Bills (12 Nov 2026) are stored in the ERP the moment they are scanned and
   checked (bill-reader.js); here only what was read, the ERP file's url, the
   fingerprint and the signed read the claim check needs. */

export const PREVIEW = false;

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

const blankClaim = () => ({ status: "unclaimed", recalled: false, car: false, fuels: [], tolls: [], foods: [], stays: [] });
const uid = () => Math.random().toString(36).slice(2, 10);

export const claimOf = (state, tripId) => {
  const c = { ...blankClaim(), ...(state?.trips?.[tripId] || {}) };
  // before 12 Nov 2026 stays were one per night ({ date: bill }) and bills
  // were never checked: those are dropped, scan them again
  const checked = (b) => b && b.signed?.sig && b.url;
  for (const k of ["stays", "foods", "fuels", "tolls"]) c[k] = Array.isArray(c[k]) ? c[k].filter(checked) : [];
  return c;
};

function updateTrip(emp, tripId, fn) {
  const state = read(emp);
  const cur = claimOf(state, tripId);
  if (cur.status !== "unclaimed") throw new Error("This trip is already submitted — recall it to change it.");
  const next = fn(cur);
  return write(emp, { ...state, trips: { ...state.trips, [tripId]: next } });
}

/* ---------- bills, before the trip is submitted ---------- */

export async function setCar(emp, tripId, on) {
  return updateTrip(emp, tripId, (c) => ({ ...c, car: !!on }));
}

/* kind: "stays" | "foods" | "fuels" | "tolls". `bill` is what readTripBill
   gave back: it passed its checks, is stored in the ERP (url) and has its
   fingerprint (fp). -> the bill's id */
export async function addBill(emp, tripId, kind, bill) {
  const id = uid();
  updateTrip(emp, tripId, (c) => ({ ...c, [kind]: [...(c[kind] || []), { id, ...bill }] }));
  return id;
}

/* -> the bill taken off (so its fingerprint can be released) */
export async function removeBill(emp, tripId, kind, id) {
  let gone = null;
  updateTrip(emp, tripId, (c) => {
    gone = (c[kind] || []).find((b) => b.id === id) || null;
    return { ...c, [kind]: (c[kind] || []).filter((b) => b.id !== id) };
  });
  return gone;
}

/* ---------- submit / recall ---------- */

/* erpClaim: the month's ERP Expense Claim the trip's lines went into (see
   erp-claim.js: one claim per rep per month). */
export async function submitTrip(emp, tripId, { total, ta, da, review, erpClaim }) {
  const state = read(emp);
  const cur = claimOf(state, tripId);
  if (cur.status !== "unclaimed") throw new Error("This trip is already submitted.");
  const next = {
    ...cur,
    status: review ? "review" : "submitted",
    recalled: false,
    submittedAt: new Date().toISOString(),
    claimed: { total, ta, da },
    ...(erpClaim ? { erpClaim } : {}),
  };
  return write(emp, { ...state, trips: { ...state.trips, [tripId]: next } });
}

export async function recallTrip(emp, tripId) {
  const state = read(emp);
  const cur = claimOf(state, tripId);
  if (cur.status !== "submitted" && cur.status !== "review") throw new Error("Only a submitted trip can be recalled — this one is past approval.");
  const next = { ...cur, status: "unclaimed", recalled: true, submittedAt: null };
  return write(emp, { ...state, trips: { ...state.trips, [tripId]: next } });
}

/* Own-car requests are not kept here any more (12 Nov 2026): they are the
   ERP's Car Request, decided by the GM (erp-claim.js loadCarRequests /
   requestCar / withdrawCar). */

/* ---------- labels ---------- */

/* A submitted trip shows where the MONTH'S claim is in the ERP (field-context
   sets it from the claim): sent -> with the officer, rejected -> sent back,
   approved -> approved by the officer, waiting for the final check, paid ->
   finalised for payroll. */
export const STATUS_LABEL = {
  unclaimed: "To claim",
  recalled: "Recalled",
  submitted: "In month's claim",
  sent: "With officer",
  // the officer decides each trip on its own (12 Nov 2026)
  okd: "Trip approved",
  rejected: "Sent back",
  review: "In review",
  approved: "Approved",
  paid: "Finalised",
};
export const statusKey = (c) => (c.status === "unclaimed" && c.recalled ? "recalled" : c.status);
export const canRecall = (c) => c.status === "submitted" || c.status === "review" || c.status === "sent" || c.status === "rejected";
export const isLocked = (c) => c.status === "approved" || c.status === "paid";
