/* Help on a trip or a day (14 Nov 2026; a Task since 16 Nov 2026). The rep
   writes what is wrong and it becomes an ERP Task in the "Expense claim"
   project -- assigned to the team that answers, shared with the managers --
   carrying the trip itself, day by day, so nobody has to ask. The rep then
   sees each request's progress and the team's replies (the Task's comments)
   on the same trip, and may raise another.
   ERP side: Server Script "Field Trip Help API" (method field_trip_help,
   share/src/app/field-expense/server/field_trip_help_api.py), called with
   the rep's own token: reps cannot read Task themselves. */
import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import { dayLabel, rangeLabel } from "@calendar/lib/field-expenses/field-days";

const KIND = { tour: "OS", day: "EQ", hq: "HQ" };
const inr = (n) => `Rs ${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

const erpOrigin = () => {
  try {
    return new URL(AUTH_CONFIG.erpUrl).origin;
  } catch {
    return "";
  }
};
const tokenHeader = (t) => (/^(token|bearer)\s/i.test(String(t || "")) ? t : `token ${t}`);

async function callHelp(params) {
  let res;
  try {
    res = await fetch(`${erpOrigin()}/api/method/field_trip_help`, {
      method: "POST",
      headers: { Authorization: tokenHeader(AUTH_CONFIG.authToken), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(params),
    });
  } catch {
    throw new Error("Couldn't reach the ERP — check the connection and try again.");
  }
  const json = await res.json().catch(() => ({}));
  if (res.ok) return json.message || {};
  // the script's own words (frappe.throw)
  let msg = null;
  try {
    msg = JSON.parse(JSON.parse(json._server_messages)[0]).message;
  } catch {
    /* none */
  }
  throw new Error(msg ? String(msg).replace(/<[^>]*>/g, "") : `The request could not be sent (HTTP ${res.status}).`);
}

/* The trip as the app shows it, as plain text for the Task: the trip line,
   the money, the bills, then every day. */
export function tripDetails({ trip, calc, claim, emp }) {
  const kind = KIND[trip.kind] || "Trip";
  const out = [
    `Employee: ${emp || "-"}`,
    `${kind} · ${trip.name} · ${rangeLabel(trip.from, trip.to)} · ${trip.days.length} day${trip.days.length > 1 ? "s" : ""} · ${trip.km} km · ${trip.visits || 0} visits`,
    `TA ${inr(calc.ta)} + DA ${inr(calc.da)} = ${inr(calc.total)}${calc.carBilled ? ` (own car: fuel ${inr(calc.fuel)}, toll ${inr(calc.tolls)})` : ""}`,
    `Claim: ${claim?.status || "unclaimed"}${claim?.holder?.name ? ` · ${claim.holder.name}` : ""}`,
  ];
  if (calc.stayBills || calc.foodBills) out.push(`Bills: ${calc.stayBills || 0} stay, ${calc.foodBills || 0} food`);
  out.push("", "Day by day:");
  for (const d of trip.days) {
    const bits = [dayLabel(d.date), d.dayType || d.label || d.kind];
    if (d.journey) bits.push(`${d.journey.from || "?"} → ${d.journey.to || "?"}${d.journey.km ? ` ${d.journey.km} km` : ""}${d.journey.fare ? ` (fare ${inr(d.journey.fare)})` : ""}`);
    const stops = (d.route || []).map((s) => `${s.place}${s.km != null ? ` ${s.km} km` : ""}`).filter(Boolean);
    if (stops.length) bits.push(`route: ${stops.join(", ")}`);
    if (d.km) bits.push(`${d.km} km`);
    bits.push(`${d.visits || 0} visits${(d.visitPlaces || []).length ? ` (${d.visitPlaces.map(([p, n]) => `${p} ${n}`).join(", ")})` : ""}`);
    if ((d.otherWork || []).length) bits.push(`other work: ${d.otherWork.join("; ")}`);
    bits.push(`TA ${inr(d.ta)}`, `DA ${inr(d.da)}`);
    if (d.flight) bits.push("flight");
    if ((d.flags || []).length) bits.push(`flags: ${d.flags.join(", ")}`);
    bits.push(d.status || "Draft");
    out.push(`- ${bits.join(" · ")}`);
  }
  return out.join("\n");
}

/* -> the new request ({ name, status, ... }, as listTripHelp's) */
export async function sendTripHelp({ trip, calc, claim, emp, message }) {
  const text = String(message || "").trim();
  if (text.length < 5) throw new Error("Write what is wrong (a few words at least).");
  const r = await callHelp({
    action: "raise",
    trip_id: trip.id,
    kind: KIND[trip.kind] || "",
    from: trip.from,
    to: trip.to,
    title: trip.name,
    message: text,
    details: tripDetails({ trip, calc, claim, emp }),
  });
  return r.task || null;
}

/* The rep's own requests on this trip, newest first:
   [{ name, status, subject, creation, modified, completed_on, description,
      assigned: [user], replies: [{ by, mine, at, content }] }] */
export async function listTripHelp(trip) {
  const r = await callHelp({ action: "list", from: trip.from, to: trip.to });
  return r.tasks || [];
}

/* HTML from the ERP (the Task's description, a comment) -> its text */
export function htmlText(html) {
  if (!html) return "";
  try {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    doc.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
    return (doc.body.textContent || "").trim();
  } catch {
    return String(html).replace(/<[^>]*>/g, " ").trim();
  }
}

/* What the rep wrote, out of the Task's description (its second paragraph:
   "<name> asks:" then the words) */
export function askedText(description) {
  try {
    const doc = new DOMParser().parseFromString(String(description || ""), "text/html");
    const p = doc.querySelectorAll("p")[1];
    if (!p) return "";
    p.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
    return (p.textContent || "").trim();
  } catch {
    return "";
  }
}

/* Task status -> what the rep sees */
export const HELP_STATUS = {
  Open: { label: "Raised", tone: "blue" },
  Overdue: { label: "Raised", tone: "blue" },
  Working: { label: "Being looked at", tone: "amber" },
  "Pending Review": { label: "Being checked", tone: "amber" },
  Completed: { label: "Done", tone: "green" },
  Cancelled: { label: "Closed", tone: "gray" },
};
