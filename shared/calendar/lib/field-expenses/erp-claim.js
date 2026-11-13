/* The rep's field TA/DA as ERP Expense Claims: ONE claim per employee per
   month (12 Nov 2026), found by its remark "Field TA/DA · 2026-10". No AI yet.

   Submitting a trip SENDS it (12 Nov 2026): its lines go into the month's
   claim and the claim goes through the ERP's "Expense Claim Approval"
   workflow to the rep's reporting officer. Still one claim for the month: a
   claim already waiting with the officer is taken back (Withdraw), the trip
   added, and sent again, so the officer approves the month as one. A trip's
   lines are the claim's rows dated inside the trip -- trips never overlap --
   so submitting it again replaces them and recalling it removes them. Once
   the month is approved it is closed: a later trip starts a new claim.

   Rows, each its own Expense Claim Type, no sub type:
     Travel           the day's TA as the ERP priced it -- unless the own car
                      is approved AND fuel / toll bills are scanned: then the
                      bills are the TA (no bills = the fare stays)
     Fuel / Toll      those own-car bills, capped at the approved amount
     Daily Allowance  the day's DA as the ERP priced it (an outstation day is
                      50 % of its rate until a bill is approved)
     Stay / Food      the trip's checked hotel and food bills, DAY BY DAY: a
                      hotel bill one line per night (split evenly), a food
                      bill on its date; each day paid as billed between its
                      50 % and 100 % (they replace that day's DA row) -- a DA
                      top-up row below 50 %, trimmed above 100 % */

import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import { DAY_TYPE_LABEL, dayLabel, fareBasis } from "@calendar/lib/field-expenses/field-days";
import { stayShares } from "@calendar/lib/field-expenses/claim-rules";
import { parseTripTag, tripTag } from "../../../../components/features/expense-claims/fieldTrips";

const api = () => import("../../../../components/features/expense-claims/data/claimsApi");
const connOf = (m) => m.makeConn({ url: AUTH_CONFIG.erpUrl, token: AUTH_CONFIG.authToken });

export const monthRemark = (month) => `Field TA/DA · ${month}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthWord = (month) => MON[Number(month.slice(5, 7)) - 1] || month;
/* The month's claim can still take trips: not yet sent, or sent back. */
export const isOpen = (c) => !c || (c.docstatus === 0 && ["Draft", "Rejected"].includes(c.status));

const stops = (d) => (d.route || []).map((s) => s.place).filter(Boolean).join(" → ");
const inTrip = (trip) => (date) => date >= trip.from && date <= trip.to;

/* Bills as claim rows, each with its ERP file, the last ones trimmed so the
   rows add up to `pay` (a cap). -> [{ date, type, sub, note, amount, bill, signed }] */
function billRows(bills, pay, capNote) {
  const out = [];
  let left = pay;
  for (const { b, type, note } of bills) {
    const counted = Math.round(Number(b.amount) || 0);
    if (!(counted > 0) || left <= 0) continue;
    const amount = Math.min(counted, left);
    left -= amount;
    // a handwritten bill (12 Nov 2026): the rep's reason and the payment
    // proof's link ride in the line's own description (no extra ERP fields);
    // the approvals page reads them back from there
    const hand = b.manual
      ? ` · handwritten: ${String(b.why || "no reason given").replace(/·/g, "-").trim()}${b.proof ? ` · proof: ${b.proof}` : ""}`
      : "";
    out.push({
      date: b.date, type, sub: "", note: `${note}${amount < counted ? ` · ${capNote}` : ""}${hand}`, amount, bill: b.url, file: b.fileName, signed: b.signed,
      ...(b.manual && b.proofName ? { proofFile: b.proofName } : {}),
    });
  }
  return out;
}

/* The claim's rows for a trip. -> [{ date, type, sub, note, amount, bill?, signed? }] */
export function tripClaimRows(trip, claim, calc, data) {
  const rows = [];
  // outstation days whose DA their own stay + food bills pay instead
  const billedNights = calc.pool?.on ? calc.nights.filter((n) => n.billSum > 0) : [];
  const pooled = new Set(billedNights.map((n) => n.date));
  for (const d of trip.days) {
    if (!d.payable) continue;
    if (!calc.carBilled && d.ta > 0) {
      const basis = fareBasis(d, data);
      rows.push({
        date: d.date,
        type: "Travel",
        sub: "",
        note: `TA · ${dayLabel(d.date)} · ${stops(d) || DAY_TYPE_LABEL[d.dayType] || "field work"}${basis ? ` · ${basis}` : ""}${
          d.flight ? ` · flight travel (company ticket)${d.flight.legs.length ? `: ${d.flight.legs.join(", ")}` : ""} at ₹0` : ""
        }`,
        amount: d.ta,
      });
    }
    if (d.da > 0 && !pooled.has(d.date)) {
      const half = d.osDaFull > 0 && d.da < d.osDaFull;
      rows.push({
        date: d.date,
        type: "Daily Allowance",
        sub: "",
        note: `DA · ${dayLabel(d.date)} · ${DAY_TYPE_LABEL[d.dayType] || d.dayType}${half ? ` · 50 % of ₹${d.osDaFull} (no bill)` : ""}`,
        amount: d.da,
      });
    }
  }

  // stay + food bills, DAY BY DAY (12 Nov 2026): each outstation day's stay
  // share and its own food, paid as billed between the day's 50 % and 100 % --
  // the last bills of a day trimmed above it, a DA top-up below it; what one
  // day goes over is not carried to another
  // a hotel bill is split over its WORKING nights only (13 Nov 2026)
  const work = new Set(calc.nights.map((x) => x.date));
  for (const n of billedNights) {
    const lines = [];
    for (const b of claim.stays || []) {
      const share = stayShares(b, work)[n.date];
      if (!share) continue;
      const all = (b.nights || []).length || 1;
      const worked = (b.nights || []).filter((d) => work.has(d)).length || all;
      lines.push({
        b: { ...b, amount: share, date: n.date },
        type: "Stay",
        note: `Stay · ${b.vendor || "hotel"} · ${dayLabel(n.date)}${
          worked < all ? ` · 1 of ${worked} working nights of a ₹${b.amount} bill (${all} nights)` : all > 1 ? ` · 1 of ${all} nights of a ₹${b.amount} bill` : ""
        }`,
      });
    }
    for (const b of (claim.foods || []).filter((x) => x.date === n.date)) {
      lines.push({ b, type: "Food", note: `Food · ${b.vendor || "bill"} · ${dayLabel(n.date)}` });
    }
    rows.push(...billRows(lines, n.paid - n.topUp, `capped: ${dayLabel(n.date)} over its full DA ₹${n.full}`));
    if (n.topUp > 0) {
      rows.push({
        date: n.date,
        type: "Daily Allowance",
        sub: "",
        note: `DA top-up · ${dayLabel(n.date)} · stay + food bills ₹${n.billSum} raised to 50 % of the day's DA (₹${n.amount})`,
        amount: n.topUp,
      });
    }
  }

  // own car, with bills: paid as billed up to the approved amount
  if (calc.carBilled) {
    const bills = [
      ...(claim.fuels || []).map((b) => ({ b, type: "Fuel", note: `Own car · fuel · ${trip.name}` })),
    ];
    rows.push(...billRows(bills, calc.ta, `capped at the approved ₹${calc.cap}`));
  }
  // every line carries its trip, so the officer can decide trip by trip
  const tag = tripTag(trip);
  return rows.map((r) => ({ ...r, trip: tag }));
}

/* The rep's claim for the month (null = none yet), shaped for the planner:
   { name, status, open, total, lines, posting } */
export async function loadMonthClaim(employee, month) {
  if (!employee) return null;
  const m = await api();
  const conn = connOf(m);
  // every claim of the month, newest first: once one is approved, trips added
  // later go into a new one (13 Nov 2026) -- each trip's status is the status
  // of the claim its lines are in
  const found = await m.fetchClaimsByRemark(conn, employee, monthRemark(month));
  if (!found.length) return null;
  // each line's trip and the officer's decision on that trip
  const marked = await Promise.all(found.map((x) => m.withTripMarks(conn, x)));
  const c = marked[0];
  // after the officer: the final check on the field-expenses dashboard --
  // adjustments (who, why) and the finalised amount
  const fin = ["Approved", "Verified", "Paid"].includes(c.status) ? await m.fetchMyFieldClaim(conn, month).catch(() => null) : null;
  return {
    name: c.id,
    status: c.status,
    open: isOpen(c),
    total: c.claimed,
    lines: c.lines,
    // all the month's claims, newest first (the first is this one)
    all: marked.map((x) => ({ name: x.id, status: x.status, open: isOpen(x), lines: x.lines })),
    posting: c.posting,
    raw: c,
    final: fin ? fin.final : null,
    adjustments: fin ? fin.adjustments : [],
    finalisedBy: fin ? fin.finalisedBy : null,
    additionalSalary: fin ? fin.additionalSalary : null,
  };
}

/* The trip's own lines in the month's claim: tagged with this trip's dates,
   or (saved before the tag) untagged inside them. */
export function tripLinesOf(lines, trip) {
  return (lines || []).filter((l) => {
    const t = parseTripTag(l.trip);
    return t ? t.from === trip.from && t.to === trip.to : l.date >= trip.from && l.date <= trip.to;
  });
}

/* A submitted trip as the ERP has it (13 Nov 2026), for a browser that has no
   record of it -- another phone, another site (app-uat), cleared storage:
   the planner kept the trip's state only on the device it was claimed from,
   so everything there read "To claim". The bills come back from their lines
   (a hotel bill's nights from its per-night lines), the totals from the
   lines' amounts. Not signed: to change the trip it is recalled and its
   bills scanned again, as on any device. */
const HAND = / · handwritten: ([^·]*?)(?: · proof: (\S+))?$/;
export function claimFromErp(lines) {
  const byUrl = new Map();
  const bills = { stays: [], foods: [], fuels: [], tolls: [] };
  const KIND = { Stay: "stays", Food: "foods", Fuel: "fuels", Toll: "tolls" };
  let ta = 0;
  let da = 0;
  for (const l of lines) {
    const amount = Math.round(Number(l.amount) || 0);
    if (["Travel", "Fuel", "Toll"].includes(l.type)) ta += amount;
    else da += amount;
    const kind = KIND[l.type];
    if (!kind || !l.bill) continue;
    const hand = HAND.exec(l.note || "");
    const seen = byUrl.get(l.bill);
    if (seen) {
      seen.amount += amount;
      seen.billed = seen.amount;
      if (kind === "stays" && !seen.nights.includes(l.date)) seen.nights.push(l.date);
      continue;
    }
    const b = {
      id: `erp-${l.id}`,
      url: l.bill,
      date: l.date,
      amount,
      billed: amount,
      nights: kind === "stays" ? [l.date] : [],
      vendor: "",
      fromErp: true,
      ...(hand ? { manual: true, why: hand[1].trim(), proof: hand[2] || null } : {}),
    };
    byUrl.set(l.bill, b);
    bills[kind].push(b);
  }
  for (const b of bills.stays) b.nights.sort();
  return {
    status: "submitted",
    recalled: false,
    car: bills.fuels.length + bills.tolls.length > 0,
    ...bills,
    claimed: { total: ta + da, ta, da },
    fromErp: true,
  };
}

// another trip's line, as it is (its trip tag and the officer's decision on
// it are kept by the ERP's "Field Trip Decision Guard" when unchanged)
const keep = (l) => ({ id: l.id, type: l.type, sub: "", date: l.date, note: l.note, amount: l.amount, bill: l.bill || "", ...(l.trip ? { trip: l.trip } : {}) });

/* Write the month's claim with `lines` (create it if there is none). An empty
   claim is deleted. -> name | null */
async function writeMonth(m, conn, employee, month, current, lines) {
  if (!lines.length) {
    if (current) await m.deleteClaim(conn, current.id);
    return null;
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  return m.saveClaim(conn, {
    claim: current || undefined,
    employee,
    postingDate: current?.posting || `${month}-${String(new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate()).padStart(2, "0")}`,
    remark: monthRemark(month),
    lines,
  });
}

const WAITING = "Waiting for Approval";

/* The month claim's risk score over every line, written by the checker login
   (/api/claims/check with no bill to check: it only re-scores the claim).
   Never stops a submit -- the score is for the verifiers. -> result | null */
async function rescore(m, conn, name) {
  try {
    return await m.checkClaim(conn, name, [], {});
  } catch (e) {
    console.warn("[field] risk score not written:", e?.message || e);
    return null;
  }
}

/* The month's claim to change, as it stands: one waiting with the officer is
   taken back first (Withdraw -> Draft); one already approved (or with
   Accounts) is closed, so a later trip starts a new claim for the month.
   -> { current, wasSent } */
async function openForChange(m, conn, employee, month) {
  let current = await m.fetchClaimByRemark(conn, employee, monthRemark(month));
  let wasSent = false;
  if (current && current.status === WAITING) {
    await m.applyAction(conn, current.id, "Withdraw");
    current = await m.fetchClaimByRemark(conn, employee, monthRemark(month));
    wasSent = true;
  }
  return { current: isOpen(current) ? current : null, closed: current && !isOpen(current) ? current : null, wasSent };
}

/* Submit a trip (12 Nov 2026: submit IS send). Its lines go into the month's
   claim (its own dates replaced) and the claim goes to the reporting officer
   -- one claim for the month, so a claim already waiting with the officer is
   taken back, the trip added, and sent again. Before sending, the trip's
   bills: their files moved onto the claim (so the officer can open them) and
   the bill rows scored by the AI checker login from each bill's signed check
   (/api/claims/check) -- a scored row is what lets the officer's approval be
   final. -> { name, sent, checked, warning } */
export async function addTripToMonth({ employee, month, trip, claim, calc, data }) {
  const m = await api();
  const conn = connOf(m);
  const rows = tripClaimRows(trip, claim, calc, data);
  if (!rows.length) throw new Error("Nothing to claim on this trip.");
  const name = await m.retryOnConflict(async () => {
    const { current } = await openForChange(m, conn, employee, month);
    const others = (current?.lines || []).filter((l) => !inTrip(trip)(l.date)).map(keep);
    // eslint-disable-next-line no-unused-vars
    const mine = rows.map(({ signed, file, proofFile, ...r }) => ({ ...r, bill: r.bill || "" }));
    return writeMonth(m, conn, employee, month, current, [...others, ...mine]);
  });
  if (!name) throw new Error("The claim could not be saved.");

  // the bills: onto the claim, then scored -- and the claim's risk score
  // (every line) written each time, bills or not (13 Nov 2026)
  let checked = null;
  let warning = null;
  const billed = rows.filter((r) => r.bill);
  if (!billed.length) checked = await rescore(m, conn, name);
  if (billed.length) {
    try {
      // the bills and any payment proofs (each file once), onto the claim
      const files = [...new Set(billed.flatMap((r) => [r.file, r.proofFile]).filter(Boolean))];
      await Promise.all(files.map((f) => m.attachFileTo(conn, f, name)));
      const saved = await m.fetchClaimByRemark(conn, employee, monthRemark(month));
      const reads = {};
      for (const r of billed) {
        const line = (saved?.lines || []).find((l) => l.bill === r.bill && l.type === r.type && l.date === r.date);
        if (line && r.signed?.sig) reads[line.id] = r.signed;
      }
      const ids = Object.keys(reads);
      if (!ids.length) {
        warning = "The bills were added but could not be matched for their check.";
        checked = await rescore(m, conn, name);
      } else {
        checked = await m.checkClaim(conn, name, ids, reads);
        if (checked?.skipped) warning = `Bill check not run: ${checked.reason}`;
      }
    } catch (e) {
      warning = `The bills were added, but their check did not finish (${e?.message || e}). They will get a person's look after your officer approves.`;
    }
  }

  // and to the officer
  try {
    await m.applyAction(conn, name, "Send for Approval");
    return { name, sent: true, checked, warning };
  } catch (e) {
    return { name, sent: false, checked, warning: `Added to your ${monthWord(month)} claim, but it could not be sent (${e?.message || e}). Send it from the ${monthWord(month)} card.` };
  }
}

/* Several HQ / EQ trips (no bills) into the month's claim in ONE save, then
   one risk score and one send -- the "claim all" of the HQ & EQ days card
   (13 Nov 2026). -> { name, sent, warning } */
export async function addTripsToMonth({ employee, month, items, data }) {
  const m = await api();
  const conn = connOf(m);
  const rows = items.flatMap(({ trip, claim, calc }) => tripClaimRows(trip, claim, calc, data));
  if (!rows.length) throw new Error("Nothing to claim on these days.");
  if (rows.some((r) => r.bill)) throw new Error("A day with bills is claimed from its own card.");
  const inAny = (date) => items.some(({ trip }) => inTrip(trip)(date));
  const name = await m.retryOnConflict(async () => {
    const { current } = await openForChange(m, conn, employee, month);
    const others = (current?.lines || []).filter((l) => !inAny(l.date)).map(keep);
    // eslint-disable-next-line no-unused-vars
    const mine = rows.map(({ signed, file, proofFile, ...r }) => ({ ...r, bill: "" }));
    return writeMonth(m, conn, employee, month, current, [...others, ...mine]);
  });
  if (!name) throw new Error("The claim could not be saved.");
  await rescore(m, conn, name);
  try {
    await m.applyAction(conn, name, "Send for Approval");
    return { name, sent: true, warning: null };
  } catch (e) {
    return { name, sent: false, warning: `Added to your ${monthWord(month)} claim, but it could not be sent (${e?.message || e}). Send it from the ${monthWord(month)} card.` };
  }
}

/* Take a trip's lines back out of the month's claim. A claim waiting with the
   officer is taken back, the trip removed, and what is left sent again; one
   already approved can't change. -> name | null */
export async function removeTripFromMonth({ employee, month, trip }) {
  const m = await api();
  const conn = connOf(m);
  let resend = false;
  const name = await m.retryOnConflict(async () => {
    const { current, closed, wasSent } = await openForChange(m, conn, employee, month);
    resend = resend || wasSent;
    if (!current) {
      if (closed) throw new Error(`Your ${monthWord(month)} claim is already approved — this trip can't be changed any more.`);
      return null;
    }
    const left = current.lines.filter((l) => !inTrip(trip)(l.date)).map(keep);
    return writeMonth(m, conn, employee, month, current, left);
  });
  // what is left: its risk score again (any change to the lines clears it)
  if (name) await rescore(m, conn, name);
  if (name && resend) await m.applyAction(conn, name, "Send for Approval");
  return name;
}

/* Send the month's claim to the reporting officer -- only needed when a
   submit saved the trip but could not send it, or after a rejection. */
export async function sendMonth({ employee, month }) {
  const m = await api();
  const conn = connOf(m);
  const current = await m.fetchClaimByRemark(conn, employee, monthRemark(month));
  if (!current || !current.lines.length) throw new Error(`Nothing in your ${monthWord(month)} claim yet — submit a trip first.`);
  if (!isOpen(current)) throw new Error(`Your ${monthWord(month)} claim is already sent.`);
  await rescore(m, conn, current.id);
  await m.applyAction(conn, current.id, "Send for Approval");
  return current.id;
}

/* Take the sent month back (Waiting for Approval -> Draft). */
export async function recallMonth({ employee, month }) {
  const m = await api();
  const conn = connOf(m);
  const current = await m.fetchClaimByRemark(conn, employee, monthRemark(month));
  if (!current) throw new Error("No claim for this month.");
  await m.applyAction(conn, current.id, "Withdraw");
  return current.id;
}

/* ---------- own-car requests (the ERP's Car Request, decided by the GM) ---------- */

/* The signed-in rep's requests, newest first. -> [request] */
export async function loadCarRequests() {
  const m = await api();
  return (await m.fetchMyCarRequests(connOf(m))).requests;
}
export async function requestCar(req) {
  const m = await api();
  return m.createCarRequest(connOf(m), req);
}
export async function withdrawCar(id) {
  const m = await api();
  return m.withdrawCarRequest(connOf(m), id);
}
