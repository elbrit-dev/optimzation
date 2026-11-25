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
  const checked = (b) => b && b.signed?.sig && b.url;
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
  updateTrip(emp, tripId, (c) => {
    // the same bill again on this card (24 Nov 2026: the ERP now hands back the
    // rep's own earlier fingerprint when a reworked trip's bill is scanned again)
    if (bill?.fp && (c[kind] || []).some((b) => b.fp === bill.fp)) throw new Error("This bill is already on this trip.");
    return { ...c, [kind]: [...(c[kind] || []), { id, ...bill }] };
  });
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
   trips: [{ id, from, to }] -> { added: [{ trip, url }], waiting: [{ trip, url }] } */
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
export function spreadStays(emp, trips, { force = null } = {}) {
  const out = { added: [], waiting: [] };
  if (!emp || !(trips || []).length) return out;
  const state = read(emp);
  const src = new Map(); // url -> { b, checkIn, checkOut, nights }
  for (const t of trips) {
    for (const b of claimOf(state, t.id).stays) {
      const sp = spanOf(b);
      if (sp && b.url && !src.has(b.url)) src.set(b.url, { b, ...sp });
    }
  }
  if (!src.size) return out;
  const next = { trips: { ...state.trips } };
  let changed = false;
  for (const t of trips) {
    for (const [url, s] of src) {
      const c = claimOf(next, t.id);
      if (c.stays.some((b) => b.url === url)) continue;
      const mine = s.nights.filter((d) => d >= t.from && d <= t.to);
      if (!mine.length) continue;
      if (c.status !== "unclaimed") {
        out.waiting.push({ trip: t, url });
        continue;
      }
      if ((c.dropped || []).includes(url) && force !== url) continue;
      const billed = Math.round(Number(s.b.billed ?? s.b.amount) || 0);
      const copy = {
        ...s.b,
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

/* REWORKED TRIPS (24 Nov 2026, the user): the office recalculates a month and
   a trip's days change (15-20 Oct becomes 15-17 Oct + 20 Oct) -- a new trip
   id, so the card came up empty and the rep's bills, scanned again, were
   refused as his own duplicates. Now the bills this device holds under a trip
   id that no longer exists move, by themselves, to the trip that holds their
   dates now (a hotel bill: its nights, with that share of the bill). Only
   into a card not yet sent (a sent one gets them once it is recalled); the
   old record is kept and remembers each card it filled (`carriedTo`), so a
   bill the rep then takes off is not put back. Bills keep their signed read (dated inside the old trip,
   which still holds their date). trips: this month's [{ id, from, to }]
   -> { moved: [{ trip, kind, url }] } */
const idSpan = (id) => {
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(String(id || ""));
  return m ? { from: m[1], to: m[2] } : null;
};
const BILL_KINDS = ["stays", "foods", "fuels", "tolls", "travels"];
export function carryBills(emp, trips) {
  const out = { moved: [] };
  if (!emp || !(trips || []).length) return out;
  const state = read(emp);
  const ids = new Set(trips.map((t) => t.id));
  const lo = trips.reduce((a, t) => (t.from < a ? t.from : a), trips[0].from);
  const hi = trips.reduce((a, t) => (t.to > a ? t.to : a), trips[0].to);
  const next = { ...state.trips };
  let changed = false;
  for (const oldId of Object.keys(state.trips || {})) {
    if (ids.has(oldId)) continue;
    const done = state.trips[oldId]?.carriedTo || [];
    const span = idSpan(oldId);
    if (!span || span.to < lo || span.from > hi) continue;
    const old = claimOf(state, oldId);
    if (!BILL_KINDS.some((k) => old[k].length)) continue;
    for (const t of trips) {
      if (t.to < span.from || t.from > span.to || done.includes(t.id)) continue;
      const c = claimOf({ trips: next }, t.id);
      if (c.status !== "unclaimed") continue; // a sent card: its bills are the ERP's
      let grew = false;
      const card = { ...c };
      for (const k of BILL_KINDS) {
        for (const b of old[k]) {
          if (card[k].some((x) => x.url === b.url && (k !== "stays" || (x.nights || []).some((n) => (b.nights || []).includes(n))))) continue;
          if ((c.dropped || []).includes(b.url)) continue;
          if (k === "stays") {
            const sp = spanOf(b);
            const all = sp ? sp.nights : (b.nights || []).length ? b.nights : [b.date];
            const mine = all.filter((d) => d >= t.from && d <= t.to);
            if (!mine.length) continue;
            const amount = sp
              ? Math.round((Math.round(Number(b.billed ?? b.amount) || 0) * mine.length) / all.length)
              : Math.round(((Number(b.amount) || 0) * mine.length) / all.length);
            card[k] = [...card[k], { ...b, id: uid(), nights: mine, date: mine[0], amount, carried: true }];
          } else {
            // a fuel bill may be dated outside its trip (checked against the month since
            // 25 Nov 2026): one no new trip holds by date goes to the first that overlaps the old
            const firstOver = trips.filter((x) => !(x.to < span.from || x.from > span.to)).sort((x, y) => x.from.localeCompare(y.from))[0];
            const held = (x) => b.date >= x.from && b.date <= x.to;
            const fuelHere = k === "fuels" && !trips.some((x) => !(x.to < span.from || x.from > span.to) && held(x)) && firstOver?.id === t.id;
            if (!held(t) && !fuelHere) continue;
            card[k] = [...card[k], { ...b, id: uid(), carried: true }];
          }
          grew = true;
          out.moved.push({ trip: t, kind: k, url: b.url });
        }
      }
      if (grew) next[t.id] = card;
      next[oldId] = { ...(next[oldId] || state.trips[oldId]), carriedTo: [...((next[oldId] || state.trips[oldId]).carriedTo || []), t.id] };
      changed = true;
    }
  }
  if (changed) write(emp, { ...state, trips: next });
  return out;
}

/* BILLS ON EVERY DEVICE (25 Nov 2026, the owner): the rep's bills the ERP holds (rows from
   listMyBills: registered, on no claim line yet) that this device does not have are put back on
   their trip card -- from the app's copy saved with the bill (card), or rebuilt by the server
   (legacy(name, kind, trip) -> { ok, bill }) for a bill scanned before copies were kept. A bill
   the rep took off is gone from the ERP too (released), so it does not come back. A card already
   sent is left alone. A trip that no longer exists keeps the bill under its old id: carryBills
   moves it. -> { restored: [{ tripId, kind, bill, fresh }], backfill: [{ fp, card }] }
   backfill: bills this device has whose ERP copy is missing -- for the caller to save. */
const KIND_SLOT = { Stay: "stays", Food: "foods", Fuel: "fuels", Toll: "tolls", Bill: "travels" };
export async function restoreBills(emp, rows, legacy) {
  const out = { restored: [], backfill: [] };
  if (!emp || !(rows || []).length) return out;
  const where = (state, row) => {
    for (const tid of Object.keys(state.trips || {})) {
      const c = claimOf(state, tid);
      for (const k of BILL_KINDS) {
        const b = (c[k] || []).find((x) => x.fp === row.name || (row.file_url && x.url === row.file_url));
        if (b) return { tid, k, b };
      }
      if (row.file_url && (c.dropped || []).includes(row.file_url)) return { tid, k: null, b: null };
    }
    return null;
  };
  for (const row of rows) {
    let card = null;
    try {
      card = row.card ? JSON.parse(row.card) : null;
    } catch {
      card = null;
    }
    const here = where(read(emp), row);
    if (here) {
      // this device has it and the ERP has no copy yet: send ours (the first time after this change)
      if (!card && here.b) out.backfill.push({ fp: row.name, card: { tripId: here.tid, kind: here.k, bill: here.b } });
      continue;
    }
    const tripId = card?.tripId || row.trip;
    const kind = card?.kind || KIND_SLOT[row.kind];
    const span = idSpan(tripId);
    if (!span || !kind || claimOf(read(emp), tripId).status !== "unclaimed") continue;
    let bill = card?.bill || null;
    const fresh = !bill;
    if (!bill) {
      const r = await legacy(row.name, kind, { id: tripId, ...span });
      if (!r?.ok) continue;
      bill = r.bill;
    }
    const state = read(emp);
    if (where(state, row)) continue;
    const c = claimOf(state, tripId);
    if (c.status !== "unclaimed") continue;
    write(emp, { ...state, trips: { ...state.trips, [tripId]: { ...c, [kind]: [...(c[kind] || []), { ...bill, id: uid(), restored: true }] } } });
    out.restored.push({ tripId, kind, bill, fresh });
  }
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
