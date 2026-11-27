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
                 more, and the bill is PRINTED. A HANDWRITTEN bill, however
                 clear (16 Nov 2026), or one read below that (no bill no /
                 date, a faded print) is NOT refused: the rep enters its type,
                 date(s) and amount by hand next to the photo (`manual`, 12 Nov
                 2026) -- manualBillVerdict checks those, the line is marked
                 "entered by hand" and gets a person's look in Accounts.

   The amount is never a reason to refuse: the trip caps it (claim-rules.js).
   No imports: the server and the browser both use this file. */

export const MIN_READ = 0.6;

/* "da" = stay OR food, decided by the bill (the trip's one upload button);
   "dta" = stay, food OR travel (23 Nov 2026: RBM and above, no own car). */
export const SLOTS = {
  stays: { kind: "Stay", title: "Hotel bill", word: "stay" },
  foods: { kind: "Food", title: "Food bill", word: "food" },
  fuels: { kind: "Fuel", title: "Fuel bill", word: "fuel" },
  tolls: { kind: "Toll", title: "Toll", word: "toll" },
  // a manager's (SM / ZSM) cab bills of the month, kept apart from TA/DA (20 Nov
  // 2026): any cab ride dated inside the month; registered as kind "Bill"
  cabs: { kind: "Cab", title: "Cab bill", word: "cab" },
  /* 23 Nov 2026 (the user): a TRAVEL bill -- a TRAIN or BUS ticket only --
     RBM and above, with no own car approved: on an outstation trip (with the
     stay / food bills) and on an EQ day over 100 km. Each ticket counts on its
     DEPARTURE date, against that day's journey fare (claim-rules.js); one
     ticket is one journey, never several days. A flight is the company's. */
  travels: { kind: "Travel", title: "Travel bill", word: "travel" },
};
export const TRAVEL_TITLES = ["Train ticket", "Bus ticket"];
// the ride services whose bills the cab card takes, whatever the vehicle (25 Nov 2026)
const RIDE_VENDOR = /\b(ola|uber|rapido|red\s*taxi|redtaxi|fast\s*track|namma\s*yatri|blu\s*smart|meru|savaari|eagle fleet|in\s*drive|indrive)\b/i;
const FLIGHT = "Flights are booked by the company — a flight ticket is not claimed here.";
const SLOT_OF_TITLE = Object.fromEntries(Object.entries(SLOTS).map(([k, s]) => [s.title, k]));

const CLEAR = "Upload a clear photo of the bill — this one could not be read.";
const HANDWRITTEN = "This is a handwritten bill. Check the details read from it before adding it.";
const MANUAL = "This bill couldn't be read (handwritten, faded, or no bill no / date). Enter its details below — your photo stays with it.";
/* Not readable enough: no refusal -- the rep enters it by hand, starting from
   whatever was read. */
function unreadable(read, slotKind, reason = MANUAL) {
  const v = read?.values || {};
  const guess = slotKind || { "Hotel bill": "Stay", "Food bill": "Food", "Fuel bill": "Fuel", Toll: "Toll", "Cab bill": "Cab", "Train ticket": "Travel", "Bus ticket": "Travel" }[read?.title] || null;
  return {
    ok: false,
    manual: true,
    handwritten: reason === HANDWRITTEN,
    reason,
    prefill: {
      kind: guess,
      amount: typeof v.total === "number" && v.total > 0 ? Math.round(v.total) : null,
      date: ISO.test(String(v.date || "")) ? v.date : null,
      checkIn: ISO.test(String(v.check_in || "")) ? v.check_in : null,
      checkOut: ISO.test(String(v.check_out || "")) ? v.check_out : null,
      vendor: v.vendor || null,
      // not shown: carried to the fingerprint, so the same bill entered
      // again is still caught by its number
      billNo: v.bill_no || null,
    },
  };
}
const NOT_BILL = "This doesn't look like a bill — upload a photo of the bill itself.";
const TOLL_NOT_PAID = "Tolls are not paid — upload the fuel bill only.";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (iso) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
const span = (a, b) => (a === b ? shortDate(a) : `${shortDate(a)}–${shortDate(b)}`);
// the bill's date with its year when that is not the trip's -- "27 Oct 2025", so
// a misread year shows instead of reading "27 Oct is outside 27–29 Oct" (25 Nov 2026)
const billDay = (iso, trip) => (iso.slice(0, 4) === String(trip?.from || "").slice(0, 4) ? shortDate(iso) : `${shortDate(iso)} ${iso.slice(0, 4)}`);
/* A date whose day and month fall inside the trip but whose YEAR does not
   (25 Nov 2026, live: a handwritten "27/10/26" read with another year, so the
   bill was refused as "dated 27 Oct — outside 27–29 Oct") -> that date in the
   trip's year, else null. Not trusted on its own: the bill goes to hand entry
   with it filled in, for the rep to confirm. */
const tripYearDate = (iso, from, to) => {
  if (!ISO.test(String(iso || "")) || !from || !to) return null;
  for (const y of new Set([from.slice(0, 4), to.slice(0, 4)])) {
    const d = `${y}${iso.slice(4)}`;
    if (d !== iso && d >= from && d <= to) return d;
  }
  return null;
};
/* 27 Nov 2026 (the user): no date guessing in our code. When the AI is not sure of the
   date (or its date needs a fix), keep what it read and ask the rep for the date only --
   pre-filled with the AI's date when that falls inside the trip. */
const ASK_DATE = "Check the date on this bill and set it below.";
function askDate(read, kind) {
  const r = unreadable(read, kind, ASK_DATE);
  return { ...r, askDate: true, prefill: { ...r.prefill, kind, askDate: true } };
}

/* The first night a hotel bill may count on the trip: the ARRIVAL NIGHT
   (trip.eve, the night before its first day -- the rep travelled out the day
   before, holiday or not; 23 Nov 2026), else the trip's first day. Stays only. */
const stayFrom = (trip) => (trip?.eve && trip.eve === addDays(trip.from, -1) ? trip.eve : trip.from);
/* 27 Nov 2026 (the user): a train / bus ticket may be dated from the day BEFORE the
   trip (a night bus / train out) to its last day; it counts against the trip's first
   day's journey fare (claim-rules.js ticketDay). Other bills keep the trip's dates. */
const billWin = (slot, trip) => (slot === "travels" ? { from: addDays(trip.from, -1), to: trip.to } : trip);

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
/* A fuel bill is checked against the claim's MONTH, not the trip's dates (25 Nov 2026, the
   owner: the car is asked for a date range and the tank is filled when it is filled). The
   duplicate check (fingerprint) is unchanged. */
const monthSpan = (t) => {
  if (!t?.from || !t?.to) return t;
  const y = Number(t.to.slice(0, 4)), m = Number(t.to.slice(5, 7));
  return { ...t, from: `${t.from.slice(0, 7)}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
};
const outsideWhat = (slot) => (slot === "cabs" || slot === "fuels" ? "the claim's month" : "this trip");

export function tripBillVerdict(read, slot, trip) {
  if (slot === "fuels" && !trip?.monthSpan) trip = { ...monthSpan(trip), monthSpan: true };
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
  // "dta" (23 Nov 2026): the trip's ONE upload for RBM and above with no own
  // car approved -- a hotel bill to Stay, a food bill to Food, a train / bus
  // ticket to Travel. "travels": train / bus tickets only (an EQ day over 100 km,
  // or a BE / ABM's OS trip -- tickets are for every role since 24 Nov 2026).
  if (slot === "dta" || slot === "travels") {
    const t = read?.title;
    if (slot === "dta" && t === "Hotel bill") return tripBillVerdict(read, "stays", trip);
    if (slot === "dta" && t === "Food bill") return tripBillVerdict(read, "foods", trip);
    if (!TRAVEL_TITLES.includes(t)) {
      if (!t || !fairly(read.titleConfidence)) return unreadable(read, slot === "travels" ? "Travel" : null);
      if (t === "Not a bill") return { ok: false, reason: NOT_BILL };
      if (t === "Flight ticket") return { ok: false, reason: FLIGHT };
      const what = slot === "dta" ? "hotel and food bills and train / bus tickets" : "train and bus tickets";
      const word = SLOT_OF_TITLE[t] ? `${SLOTS[SLOT_OF_TITLE[t]].word} bill` : String(t).toLowerCase();
      return { ok: false, reason: `This is ${/^[aeiou]/i.test(word) ? "an" : "a"} ${word} — only ${what} go here${t === "Fuel bill" || t === "Toll" ? " (fuel bills go with an approved own car)" : t === "Cab bill" || t === "Auto bill" ? " (cab and auto rides are not paid as travel)" : ""}.` };
    }
    if (slot === "dta") return tripBillVerdict(read, "travels", trip);
    // "travels" with a train / bus title: the checks below, as that title
  }
  // "all": the trip's ONE upload once the car is approved and the trip has
  // stay / food bills too (16 Nov 2026) -- the bill says which it is: a hotel
  // bill goes to Stay, a food bill to Food, a fuel bill to Fuel. Tolls are
  // not paid (13 Nov 2026).
  if (slot === "all") {
    if (read?.title === "Hotel bill") return tripBillVerdict(read, "stays", trip);
    if (read?.title === "Food bill") return tripBillVerdict(read, "foods", trip);
    if (read?.title === "Fuel bill") return tripBillVerdict(read, "fuels", trip);
    if (!read?.title || !fairly(read.titleConfidence)) return unreadable(read, null);
    if (read.title === "Not a bill") return { ok: false, reason: NOT_BILL };
    if (read.title === "Toll") return { ok: false, reason: TOLL_NOT_PAID };
    return { ok: false, reason: `This is a ${String(read.title).toLowerCase()} — only hotel, food and fuel bills go here.` };
  }
  // "car": ONE upload for an approved own car's fuel and toll bills
  if (slot === "car") {
    if (read?.title === "Fuel bill") return tripBillVerdict(read, "fuels", trip);
    // tolls are not paid (13 Nov 2026): refused before the bill is stored
    if (read?.title === "Toll") return { ok: false, reason: TOLL_NOT_PAID };
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
  // a travel bill is checked as the title it was read as (train, bus, cab, auto)
  // THE CAB CARD TAKES EVERY RIDE (25 Nov 2026, the user: "accept all from those services"): a cab or
  // an auto, and any bill of a ride service (Ola, Uber, Rapido, Red Taxi ...) whatever the reader
  // called the vehicle -- checked as a cab bill
  const rideBill = slot === "cabs" && read && (read.title === "Auto bill" || RIDE_VENDOR.test(String(read.values?.vendor || "") + " " + String(read.md || "").slice(0, 400)));
  const s = slot === "travels" && TRAVEL_TITLES.includes(read?.title) ? { ...SLOTS.travels, title: read.title } : rideBill ? { ...SLOTS.cabs, title: read.title } : SLOTS[slot];
  if (!s) return { ok: false, reason: "Unknown bill slot." };
  if (!trip?.from || !trip?.to) return { ok: false, reason: CLEAR };
  if (!read) return unreadable(null, s.kind);
  const v = read.values || {}, conf = read.confidence || {};

  // 1. type
  if (!read.title || (read.title === s.title ? !sure(read.titleConfidence) : !fairly(read.titleConfidence))) return unreadable(read, s.kind);
  if (read.title === "Not a bill") return { ok: false, reason: NOT_BILL };
  if (read.title !== s.title) {
    const other = SLOT_OF_TITLE[read.title];
    // the cab card takes cab bills only, whatever else it is (20 Nov 2026)
    if (slot === "cabs") {
      const t = String(read.title).toLowerCase();
      return { ok: false, reason: `This is ${/^[aeiou]/.test(t) ? "an" : "a"} ${t} — only rides (Ola, Uber, Rapido, cabs and autos) go here.` };
    }
    return {
      ok: false,
      reason: other
        ? `This is a ${SLOTS[other].word} bill — scan it under ${SLOTS[other].word}, not ${s.word}.`
        : `This is a ${String(read.title).toLowerCase()}, not a ${s.word} bill — only ${s.word} bills go here.`,
    };
  }

  // a date read clearly and outside the trip: refused, whatever else could
  // not be read (13 Nov 2026). NOT for a handwritten bill (25 Nov 2026, live):
  // its date is read off handwriting -- it goes to hand entry, where the date
  // typed is checked against the trip. A date off by its YEAR only goes to
  // hand entry too, with the trip's year filled in (tripYearDate).
  if (!read.handwritten && slot !== "stays" && ISO.test(String(v.date || "")) && sure(conf.date) && (v.date < billWin(slot, trip).from || v.date > trip.to)) {
    // was: a year-fix guess (tripYearDate) into hand entry (27 Nov 2026: ask the rep instead)
    if (tripYearDate(v.date, trip.from, trip.to) && typeof v.total === "number" && v.total > 0 && sure(conf.total)) return askDate(read, s.kind);
    return { ok: false, reason: `This bill is dated ${billDay(v.date, trip)} — outside ${outsideWhat(slot)} (${span(billWin(slot, trip).from, trip.to)}).` };
  }
  if (!read.handwritten && slot === "stays") {
    const ci = ISO.test(String(v.check_in || "")) && sure(conf.check_in) ? v.check_in : null;
    const co = ISO.test(String(v.check_out || "")) && sure(conf.check_out) ? v.check_out : null;
    if (ci && co && (co <= stayFrom(trip) || ci > trip.to)) {
      // was: a year-fix guess into hand entry (27 Nov 2026: the rep sets the stay dates)
      if (tripYearDate(ci, stayFrom(trip), trip.to) && typeof v.total === "number" && v.total > 0 && sure(conf.total)) return askDate(read, s.kind);
      return { ok: false, reason: `This stay is ${span(ci, addDays(co, -1))}${ci.slice(0, 4) !== trip.from.slice(0, 4) ? ` ${ci.slice(0, 4)}` : ""} — outside this trip (${span(stayFrom(trip), trip.to)}).` };
    }
  }
  // a handwritten bill whose date (read off the handwriting) is off by its year:
  // hand entry starts from the trip's year
  if (read.handwritten && ISO.test(String(v.date || "")) && (v.date < billWin(slot, trip).from || v.date > trip.to)) {
    const fixed = tripYearDate(v.date, trip.from, trip.to);
    if (fixed) return unreadable({ ...read, values: { ...v, date: fixed } }, s.kind, HANDWRITTEN);
  }

  // a HANDWRITTEN bill, however clear: entered by hand, from what was read,
  // with the payment proof and the reason (16 Nov 2026). Only after the
  // refusals above -- a handwritten bill of the wrong kind, or clearly
  // outside the trip, is still refused.
  if (read.handwritten) return unreadable(read, s.kind, HANDWRITTEN);

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
      // 27 Nov 2026: an unsure date -> the rep sets the stay dates (was: unreadable -> full hand entry)
      if (!ISO.test(String(v.date || "")) || !sure(conf.date)) return askDate(read, s.kind);
      const prev = addDays(v.date, -1);
      checkIn = prev >= stayFrom(trip) && prev <= trip.to ? prev : v.date;
      checkOut = addDays(checkIn, 1);
    }
    if (!checkIn) checkIn = addDays(checkOut, -1);
    if (!checkOut || checkOut <= checkIn) checkOut = addDays(checkIn, 1);
    const all = [];
    for (let d = checkIn; d < checkOut && all.length < 62; d = addDays(d, 1)) all.push(d);
    // its nights on this trip, the arrival night included (stayFrom)
    const nights = all.filter((d) => d >= stayFrom(trip) && d <= trip.to);
    if (!nights.length) return { ok: false, reason: `This stay is ${span(checkIn, addDays(checkOut, -1))} — outside this trip (${span(stayFrom(trip), trip.to)}).` };
    return { ...base, amount: Math.round((billed * nights.length) / all.length), date: nights[0], nights, checkIn, checkOut };
  }

  // 27 Nov 2026: an unsure date -> the rep sets it (was: unreadable -> full hand entry)
  if (!ISO.test(String(v.date || "")) || !sure(conf.date)) return askDate(read, s.kind);
  if (v.date < billWin(slot, trip).from || v.date > trip.to) {
    // was: a year-fix guess (tripYearDate) into hand entry
    if (tripYearDate(v.date, trip.from, trip.to)) return askDate(read, s.kind);
    return { ok: false, reason: `This bill is dated ${billDay(v.date, trip)} — outside ${outsideWhat(slot)} (${span(billWin(slot, trip).from, trip.to)}).` };
  }
  return { ...base, amount: billed, date: v.date, nights: [] };
}

/* A bill the rep entered by hand (it could not be read) -- the same rules as a
   read one, on what was typed: the kind belongs to the upload it came from,
   the date (a stay's nights) falls inside the trip, the amount is a positive
   rupee figure.
   entry: { kind, date, checkIn, checkOut, amount, vendor }
   -> { ok: false, reason } | the same as tripBillVerdict, with manual: true */
// tolls are not paid (13 Nov 2026): never offered for hand entry on a trip
export const MANUAL_KINDS = { da: ["Stay", "Food"], dta: ["Stay", "Food", "Travel"], car: ["Fuel"], all: ["Stay", "Food", "Fuel"], stays: ["Stay"], foods: ["Food"], fuels: ["Fuel"], tolls: ["Toll"], cabs: ["Cab"], travels: ["Travel"] };
/* opts.whyOptional: Field Expense Settings "hw_reason_optional" (21 Nov 2026) -- the reason may be empty */
export function manualBillVerdict(entry, slot, trip, opts = {}) {
  const e = entry || {};
  const kinds = MANUAL_KINDS[slot] || [];
  if (!kinds.includes(e.kind)) return { ok: false, reason: `Pick what the bill is: ${kinds.join(" or ").toLowerCase()}.` };
  if (!trip?.from || !trip?.to) return { ok: false, reason: "Which trip is this bill for?" };
  const billed = Math.round(Number(e.amount) || 0);
  if (!(billed > 0) || billed > 200000) return { ok: false, reason: "Enter the bill's total amount." };
  // 12 Nov 2026: a handwritten bill needs the rep's reason (the payment proof
  // itself is checked by the server: a second file must come with it)
  const why = String(e.why || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (why.length < 5 && !opts.whyOptional) return { ok: false, reason: "Say why you only have a handwritten bill." };
  // 13 Nov 2026: the payment proof is REQUIRED (the server checks a second
  // file came) -- unless it was paid in cash, which has none
  // billNo: the number the reader found on a handwritten bill (not typed)
  const base = { ok: true, manual: true, kind: e.kind, billed, vendor: String(e.vendor || "").trim().slice(0, 140) || null, billNo: String(e.billNo || "").trim().slice(0, 140) || null, why, cash: !!e.cash };
  if (e.kind === "Stay") {
    const checkIn = ISO.test(String(e.checkIn || "")) ? e.checkIn : null;
    let checkOut = ISO.test(String(e.checkOut || "")) ? e.checkOut : null;
    if (!checkIn) return { ok: false, reason: "Enter the check-in date." };
    if (!checkOut) checkOut = addDays(checkIn, 1);
    if (checkOut <= checkIn) return { ok: false, reason: "Check-out must be after check-in." };
    const all = [];
    for (let d = checkIn; d < checkOut && all.length < 62; d = addDays(d, 1)) all.push(d);
    const nights = all.filter((d) => d >= stayFrom(trip) && d <= trip.to);
    if (!nights.length) return { ok: false, reason: `That stay is ${span(checkIn, addDays(checkOut, -1))} — outside this trip (${span(stayFrom(trip), trip.to)}).` };
    return { ...base, amount: Math.round((billed * nights.length) / all.length), date: nights[0], nights, checkIn, checkOut };
  }
  if (!ISO.test(String(e.date || ""))) return { ok: false, reason: "Enter the bill's date." };
  // a fuel bill: anywhere in the claim's month (25 Nov 2026)
  const fuelBill = e.kind === "Fuel";
  const win = fuelBill ? monthSpan(trip) : e.kind === "Travel" ? billWin("travels", trip) : trip;
  if (e.date < win.from || e.date > win.to) return { ok: false, reason: `${shortDate(e.date)} is outside ${fuelBill ? "the claim's month" : outsideWhat(slot)} (${span(win.from, win.to)}).` };
  return { ...base, amount: billed, date: e.date, nights: [] };
}
