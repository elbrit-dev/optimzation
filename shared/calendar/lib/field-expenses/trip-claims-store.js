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

const blankClaim = () => ({ status: "unclaimed", recalled: false, car: false, fuels: [], tolls: [], foods: [], stays: [], travels: [] });
const uid = () => Math.random().toString(36).slice(2, 10);

export const claimOf = (state, tripId) => {
  const c = { ...blankClaim(), ...(state?.trips?.[tripId] || {}) };
  // before 12 Nov 2026 stays were one per night ({ date: bill }) and bills
  // were never checked: those are dropped, scan them again
  // fromSent: a hotel night spread from a bill already sent on another card
  // (23 Nov 2026) -- checked on that card's line, see /api/claims/check
  const checked = (b) => b && (b.signed?.sig || b.fromSent) && b.url;
  for (const k of ["stays", "foods", "fuels", "tolls", "travels"]) c[k] = Array.isArray(c[k]) ? c[k].filter(checked) : [];
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

/* kind: "stays" | "foods" | "fuels" | "tolls" | "travels". `bill` is what readTripBill
   gave back: it passed its checks, is stored in the ERP (url) and has its
   fingerprint (fp). -> the bill's id */
export async function addBill(emp, tripId, kind, bill) {
  const id = uid();
  updateTrip(emp, tripId, (c) => ({ ...c, [kind]: [...(c[kind] || []), { id, ...bill }] }));
  return id;
}

/* -> the bill taken off (so its fingerprint can be released), with
   stillUsed: true when a sent trip still claims the same hotel bill.
   A hotel bill spread over several cards (spreadStays) comes off every card
   not yet sent, and is not spread there again (`dropped`) unless it is
   uploaded again. */
export async function removeBill(emp, tripId, kind, id) {
  let gone = null;
  updateTrip(emp, tripId, (c) => {
    gone = (c[kind] || []).find((b) => b.id === id) || null;
    return { ...c, [kind]: (c[kind] || []).filter((b) => b.id !== id) };
  });
  if (kind !== "stays" || !gone?.url) return gone;
  const state = read(emp);
  const trips = { ...state.trips };
  let stillUsed = false;
  for (const tid of Object.keys(trips)) {
    const c = claimOf(state, tid);
    const has = c.stays.some((b) => b.url === gone.url);
    if (c.status !== "unclaimed") {
      if (has) stillUsed = true;
      continue;
    }
    if (!has && tid !== tripId) continue;
    trips[tid] = { ...c, stays: c.stays.filter((b) => b.url !== gone.url), dropped: [...new Set([...(c.dropped || []), gone.url])] };
  }
  write(emp, { ...state, trips });
  return { ...gone, stillUsed };
}

/* ONE HOTEL BILL, SEVERAL CARDS (23 Nov 2026, the user): a stay in one town
   is cut into cards by the journeys in between (Ayodhya 5 Oct -> Ballia 6 Oct
   -> Ayodhya 7-8 Oct), so a 3-night hotel bill uploaded on the first card
   counted 1 night, and uploading it again on the next card was refused as a
   duplicate. Now every hotel bill on this device is added, by itself, to each
   card (not yet sent) that holds any of its nights -- with those nights and
   their share of the bill (billed x nights here / all its nights). A sent card
   is left alone (`waiting`: recall it and the bill comes back to it).
   force: a url uploaded again by hand -- spread even where it was removed.
   trips: [{ id, from, to }] -> { added: [{ trip, url }], waiting: [{ trip, url }] }
   sources: [{ tripId, status, stays }] each trip's claim as the planner shows
   it -- with a trip sent from another phone, or before this was built, rebuilt
   from the ERP lines (claimFromErp), so its hotel bill spreads too; a trip whose
   status there is not "unclaimed" is never added to. */
const addDay = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const spanOf = (b) => {
  const v = b?.signed?.read?.trip?.verdict || {};
  const checkIn = b?.checkIn || v.checkIn || null;
  const checkOut = b?.checkOut || v.checkOut || null;
  if (!checkIn || !checkOut || checkOut <= checkIn) return null;
  const nights = [];
  for (let d = checkIn; d < checkOut && nights.length < 62; d = addDay(d)) nights.push(d);
  return { checkIn, checkOut, nights };
};
export function spreadStays(emp, trips, { force = null, sources = [] } = {}) {
  const out = { added: [], waiting: [] };
  if (!emp || !(trips || []).length) return out;
  const state = read(emp);
  const src = new Map(); // url -> { b, checkIn, checkOut, nights }
  const take = (b) => {
    const sp = spanOf(b);
    if (sp && b.url && !src.has(b.url)) src.set(b.url, { b, ...sp });
  };
  for (const t of trips) claimOf(state, t.id).stays.forEach(take);
  const liveStatus = new Map();
  const liveUrls = new Map(); // tripId -> the hotel bills its claim (as shown) already holds
  for (const s of sources || []) {
    liveStatus.set(s.tripId, s.status);
    liveUrls.set(s.tripId, new Set((s.stays || []).map((b) => b.url)));
    (s.stays || []).forEach(take);
  }
  if (!src.size) return out;
  const next = { trips: { ...state.trips } };
  let changed = false;
  for (const t of trips) {
    for (const [url, s] of src) {
      const c = claimOf(next, t.id);
      if (c.stays.some((b) => b.url === url) || liveUrls.get(t.id)?.has(url)) continue;
      // a night already paid by a hotel bill on this card is not spread onto
      // (one room a night -- e.g. a second photo of the same bill added there)
      const billedHere = new Set([...c.stays, ...(sources || []).filter((x) => x.tripId === t.id).flatMap((x) => x.stays || [])].flatMap((x) => x.nights || []));
      // the card's arrival night too (t.eve: travelled out the day before, 23 Nov 2026)
      const mine = s.nights.filter((d) => d >= (t.eve || t.from) && d <= t.to && !billedHere.has(d));
      if (!mine.length) continue;
      if (c.status !== "unclaimed" || (liveStatus.get(t.id) || "unclaimed") !== "unclaimed") {
        out.waiting.push({ trip: t, url });
        continue;
      }
      if ((c.dropped || []).includes(url) && force !== url) continue;
      // the bill's whole total (a bill rebuilt from the ERP lines holds only its counted nights)
      const billed = Math.round(Number(s.b.stayTotal ?? s.b.billed ?? s.b.amount) || 0);
      const { fromErp, stayTotal, ...rest } = s.b;
      const copy = {
        ...rest,
        billed,
        ...(s.b.signed?.sig ? {} : { fromSent: true }),
        id: uid(),
        nights: mine,
        date: mine[0],
        amount: Math.round((billed * mine.length) / s.nights.length),
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        spread: true,
      };
      next.trips[t.id] = { ...c, stays: [...c.stays, copy], dropped: (c.dropped || []).filter((u) => u !== url) };
      changed = true;
      out.added.push({ trip: t, url });
    }
  }
  if (changed) write(emp, { ...state, trips: next.trips });
  return out;
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
  // claimed on another device: this one never held it, so there is nothing
  // to undo here (its lines are already out of the month's claim)
  if (cur.status === "unclaimed") return state;
  if (cur.status !== "submitted" && cur.status !== "review") throw new Error("Only a submitted trip can be recalled — this one is past approval.");
  const next = { ...cur, status: "unclaimed", recalled: true, submittedAt: null };
  return write(emp, { ...state, trips: { ...state.trips, [tripId]: next } });
}

/* The ERP no longer has this trip's lines (the claim was deleted, e.g. test
   data cleared on 13 Nov 2026): this device forgets the trip -- it is to
   claim again, from scratch (its bill files are gone with the claim). */
export async function resetTrip(emp, tripId) {
  const state = read(emp);
  if (!state.trips?.[tripId]) return state;
  const trips = { ...state.trips };
  delete trips[tripId];
  return write(emp, { ...state, trips });
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
