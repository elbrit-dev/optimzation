/* The checks every bill on a planner trip must pass, in order (12 Nov 2026,
   the user's rules) -- run by the app server on the AI's read the moment the
   bill is scanned (/api/claims/read-bill), so a bill that fails never reaches
   the trip:

     1. type  -- the bill is what the slot asks for (a food bill under Stay is
                 refused, and so on);
     2. date  -- it falls inside this trip. A hotel bill counts its NIGHTS:
                 check-in up to the day before check-out, so a check-out the
                 morning after the trip ends is fine; nights outside the trip
                 do not count and their share of the bill comes off;
     3. read  -- the type, date and total were read with 60 % confidence or
                 more. Below that (a handwritten bill, no bill no / date, a
                 faded print) the bill is NOT refused: the rep enters its type,
                 date(s) and amount by hand next to the photo (`manual`, 12 Nov
                 2026) -- manualBillVerdict checks those, the line is marked
                 "entered by hand" and gets a person's look in Accounts.

   The amount is never a reason to refuse: the trip caps it (claim-rules.js).
   No imports: the server and the browser both use this file. */

export const MIN_READ = 0.6;

/* "da" = stay OR food, decided by the bill (the trip's one upload button). */
export const SLOTS = {
  stays: { kind: "Stay", title: "Hotel bill", word: "stay" },
  foods: { kind: "Food", title: "Food bill", word: "food" },
  fuels: { kind: "Fuel", title: "Fuel bill", word: "fuel" },
  tolls: { kind: "Toll", title: "Toll", word: "toll" },
};
const SLOT_OF_TITLE = Object.fromEntries(Object.entries(SLOTS).map(([k, s]) => [s.title, k]));

const CLEAR = "Upload a clear photo of the bill — this one could not be read.";
const MANUAL = "This bill couldn't be read (handwritten, faded, or no bill no / date). Enter its details below — your photo stays with it.";
/* Not readable enough: no refusal -- the rep enters it by hand, starting from
   whatever was read. */
function unreadable(read, slotKind) {
  const v = read?.values || {};
  const guess = slotKind || { "Hotel bill": "Stay", "Food bill": "Food", "Fuel bill": "Fuel", Toll: "Toll" }[read?.title] || null;
  return {
    ok: false,
    manual: true,
    reason: MANUAL,
    prefill: {
      kind: guess,
      amount: typeof v.total === "number" && v.total > 0 ? Math.round(v.total) : null,
      date: ISO.test(String(v.date || "")) ? v.date : null,
      checkIn: ISO.test(String(v.check_in || "")) ? v.check_in : null,
      checkOut: ISO.test(String(v.check_out || "")) ? v.check_out : null,
      vendor: v.vendor || null,
    },
  };
}
const NOT_BILL = "This doesn't look like a bill — upload a photo of the bill itself.";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (iso) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
const span = (a, b) => (a === b ? shortDate(a) : `${shortDate(a)}–${shortDate(b)}`);

const sure = (c) => typeof c === "number" && c >= MIN_READ;
/* 13 Nov 2026: a bill the reader takes for ANOTHER kind (cab, auto, train ...)
   is refused once it is fairly sure of it -- not sent to "enter it by hand",
   where it could be typed in as food. Hand entry is for the right kind of
   bill that could not be read. */
export const WRONG_KIND_READ = 0.3;
const fairly = (c) => typeof c === "number" && c >= WRONG_KIND_READ;

/* read: the reader's { values, confidence, title, titleConfidence }
   trip:  { from, to } (yyyy-mm-dd)
   -> { ok: false, reason }
    | { ok: true, kind, billed, amount, date, nights, checkIn, checkOut, vendor, billNo }
      billed = the bill's total; amount = what counts for this trip (a hotel
      bill's share for its nights inside the trip); date = the row's date. */
export function tripBillVerdict(read, slot, trip) {
  // "da": ONE upload for stay and food (12 Nov 2026) -- the bill itself says
  // which it is; anything else is refused
  if (slot === "da") {
    if (read?.title === "Hotel bill") return tripBillVerdict(read, "stays", trip);
    if (read?.title === "Food bill") return tripBillVerdict(read, "foods", trip);
    if (!read?.title || !fairly(read.titleConfidence)) return unreadable(read, null);
    if (read.title === "Not a bill") return { ok: false, reason: NOT_BILL };
    const other = SLOT_OF_TITLE[read.title];
    return {
      ok: false,
      reason: other
        ? `This is a ${SLOTS[other].word} bill — only hotel and food bills go here${other === "fuels" || other === "tolls" ? " (fuel and toll bills go with an approved own car)" : ""}.`
        : `This is a ${String(read.title).toLowerCase()} — only hotel and food bills go here.`,
    };
  }
  // "car": ONE upload for an approved own car's fuel and toll bills
  if (slot === "car") {
    if (read?.title === "Fuel bill") return tripBillVerdict(read, "fuels", trip);
    if (read?.title === "Toll") return tripBillVerdict(read, "tolls", trip);
    if (!read?.title || !fairly(read.titleConfidence)) return unreadable(read, null);
    if (read.title === "Not a bill") return { ok: false, reason: NOT_BILL };
    const other = SLOT_OF_TITLE[read.title];
    return {
      ok: false,
      reason: other
        ? `This is a ${SLOTS[other].word} bill — only fuel and toll bills go here${other === "stays" || other === "foods" ? " (hotel and food bills go under Normal TA)" : ""}.`
        : `This is a ${String(read.title).toLowerCase()} — only fuel and toll bills go here.`,
    };
  }
  const s = SLOTS[slot];
  if (!s) return { ok: false, reason: "Unknown bill slot." };
  if (!trip?.from || !trip?.to) return { ok: false, reason: CLEAR };
  if (!read) return unreadable(null, s.kind);
  const v = read.values || {}, conf = read.confidence || {};

  // 1. type
  if (!read.title || (read.title === s.title ? !sure(read.titleConfidence) : !fairly(read.titleConfidence))) return unreadable(read, s.kind);
  if (read.title === "Not a bill") return { ok: false, reason: NOT_BILL };
  if (read.title !== s.title) {
    const other = SLOT_OF_TITLE[read.title];
    return {
      ok: false,
      reason: other
        ? `This is a ${SLOTS[other].word} bill — scan it under ${SLOTS[other].word}, not ${s.word}.`
        : `This is a ${String(read.title).toLowerCase()}, not a ${s.word} bill — only ${s.word} bills go here.`,
    };
  }

  // a date read clearly and outside the trip: refused, whatever else could
  // not be read (13 Nov 2026)
  if (slot !== "stays" && ISO.test(String(v.date || "")) && sure(conf.date) && (v.date < trip.from || v.date > trip.to)) {
    return { ok: false, reason: `This bill is dated ${shortDate(v.date)} — outside this trip (${span(trip.from, trip.to)}).` };
  }
  if (slot === "stays") {
    const ci = ISO.test(String(v.check_in || "")) && sure(conf.check_in) ? v.check_in : null;
    const co = ISO.test(String(v.check_out || "")) && sure(conf.check_out) ? v.check_out : null;
    if (ci && co && (co <= trip.from || ci > trip.to)) return { ok: false, reason: `This stay is ${span(ci, addDays(co, -1))} — outside this trip (${span(trip.from, trip.to)}).` };
  }

  // 3. (before the date: a date needs a sure read) the total
  if (!(typeof v.total === "number" && v.total > 0) || !sure(conf.total)) return unreadable(read, s.kind);
  const billed = Math.round(v.total);
  const base = { ok: true, kind: s.kind, billed, vendor: v.vendor || null, billNo: v.bill_no || null };

  // 2. date
  if (slot === "stays") {
    let checkIn = ISO.test(String(v.check_in || "")) && sure(conf.check_in) ? v.check_in : null;
    let checkOut = ISO.test(String(v.check_out || "")) && sure(conf.check_out) ? v.check_out : null;
    if (!checkIn && !checkOut) {
      // no stay dates printed: the bill's own date, usually made out at
      // check-out -- the night before it, else that day itself
      if (!ISO.test(String(v.date || "")) || !sure(conf.date)) return unreadable(read, s.kind);
      const prev = addDays(v.date, -1);
      checkIn = prev >= trip.from && prev <= trip.to ? prev : v.date;
      checkOut = addDays(checkIn, 1);
    }
    if (!checkIn) checkIn = addDays(checkOut, -1);
    if (!checkOut || checkOut <= checkIn) checkOut = addDays(checkIn, 1);
    const all = [];
    for (let d = checkIn; d < checkOut && all.length < 62; d = addDays(d, 1)) all.push(d);
    const nights = all.filter((d) => d >= trip.from && d <= trip.to);
    if (!nights.length) return { ok: false, reason: `This stay is ${span(checkIn, addDays(checkOut, -1))} — outside this trip (${span(trip.from, trip.to)}).` };
    return { ...base, amount: Math.round((billed * nights.length) / all.length), date: nights[0], nights, checkIn, checkOut };
  }

  if (!ISO.test(String(v.date || "")) || !sure(conf.date)) return unreadable(read, s.kind);
  if (v.date < trip.from || v.date > trip.to) return { ok: false, reason: `This bill is dated ${shortDate(v.date)} — outside this trip (${span(trip.from, trip.to)}).` };
  return { ...base, amount: billed, date: v.date, nights: [] };
}

/* A bill the rep entered by hand (it could not be read) -- the same rules as a
   read one, on what was typed: the kind belongs to the upload it came from,
   the date (a stay's nights) falls inside the trip, the amount is a positive
   rupee figure.
   entry: { kind, date, checkIn, checkOut, amount, vendor }
   -> { ok: false, reason } | the same as tripBillVerdict, with manual: true */
export const MANUAL_KINDS = { da: ["Stay", "Food"], car: ["Fuel", "Toll"], stays: ["Stay"], foods: ["Food"], fuels: ["Fuel"], tolls: ["Toll"] };
export function manualBillVerdict(entry, slot, trip) {
  const e = entry || {};
  const kinds = MANUAL_KINDS[slot] || [];
  if (!kinds.includes(e.kind)) return { ok: false, reason: `Pick what the bill is: ${kinds.join(" or ").toLowerCase()}.` };
  if (!trip?.from || !trip?.to) return { ok: false, reason: "Which trip is this bill for?" };
  const billed = Math.round(Number(e.amount) || 0);
  if (!(billed > 0) || billed > 200000) return { ok: false, reason: "Enter the bill's total amount." };
  // 12 Nov 2026: a handwritten bill needs the rep's reason (the payment proof
  // itself is checked by the server: a second file must come with it)
  const why = String(e.why || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (why.length < 5) return { ok: false, reason: "Say why you only have a handwritten bill." };
  // 13 Nov 2026: the payment proof is REQUIRED (the server checks a second
  // file came) -- unless it was paid in cash, which has none
  const base = { ok: true, manual: true, kind: e.kind, billed, vendor: String(e.vendor || "").trim().slice(0, 140) || null, billNo: null, why, cash: !!e.cash };
  if (e.kind === "Stay") {
    const checkIn = ISO.test(String(e.checkIn || "")) ? e.checkIn : null;
    let checkOut = ISO.test(String(e.checkOut || "")) ? e.checkOut : null;
    if (!checkIn) return { ok: false, reason: "Enter the check-in date." };
    if (!checkOut) checkOut = addDays(checkIn, 1);
    if (checkOut <= checkIn) return { ok: false, reason: "Check-out must be after check-in." };
    const all = [];
    for (let d = checkIn; d < checkOut && all.length < 62; d = addDays(d, 1)) all.push(d);
    const nights = all.filter((d) => d >= trip.from && d <= trip.to);
    if (!nights.length) return { ok: false, reason: `That stay is ${span(checkIn, addDays(checkOut, -1))} — outside this trip (${span(trip.from, trip.to)}).` };
    return { ...base, amount: Math.round((billed * nights.length) / all.length), date: nights[0], nights, checkIn, checkOut };
  }
  if (!ISO.test(String(e.date || ""))) return { ok: false, reason: "Enter the bill's date." };
  if (e.date < trip.from || e.date > trip.to) return { ok: false, reason: `${shortDate(e.date)} is outside this trip (${span(trip.from, trip.to)}).` };
  return { ...base, amount: billed, date: e.date, nights: [] };
}
