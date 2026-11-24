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
  if (calc.travelBills) out.push(`Travel bills: ${calc.travelBills}, ₹${Math.round(calc.travel)} (fare ₹${Math.round(calc.fare)})`);
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
    if (d.flight) bits.push("travel by company");
    if ((d.flags || []).length) bits.push(`flags: ${d.flags.join(", ")}`);
    bits.push(d.status || "Draft");
    out.push(`- ${bits.join(" · ")}`);
  }
  return out.join("\n");
}

/* A place to add to a day's route (19 Nov 2026): not a new trip -- an
   in-between stop the day's route left out. The day, its route as it is, the
   place and where it goes in it, rough extra km and why -> the request's
   words, one line the TA/DA team can act on. */
export function addRouteText({ date, route, place, after, km, why }) {
  const stops = (route || []).filter(Boolean);
  const bits = [`Add to route · ${dayLabel(date)}`];
  if (stops.length) bits.push(`route now: ${stops.join(" → ")}`);
  bits.push(`add ${String(place).trim()}${after ? ` after ${after}` : ""}`);
  if (Number(km) > 0) bits.push(`about ${Math.round(Number(km))} km more`);
  if (String(why || "").trim()) bits.push(String(why).trim());
  return bits.join(" · ");
}

/* Places to add to the trip's routes (24 Nov 2026: several, anywhere --
   before the first stop, between any two, after the last -- on any of the
   trip's days). days: [{ date, route: [stop names as it is], next: [{ name,
   km?, added }] }] (the day's route as it would be) -> the request's words, a
   line per day the TA/DA team can act on. */
export function routeChangeText(days, why) {
  const lines = [];
  for (const d of days || []) {
    const adds = (d.next || []).filter((s) => s.added && String(s.name || "").trim());
    if (!adds.length) continue;
    const km = adds.reduce((a, s) => a + (Number(s.km) || 0), 0);
    const bits = [`Add to route · ${dayLabel(d.date)}`];
    if ((d.route || []).length) bits.push(`route now: ${d.route.join(" → ")}`);
    bits.push(
      `new route: ${(d.next || [])
        .filter((s) => !s.added || String(s.name || "").trim())
        .map((s) => (s.added ? `${String(s.name).trim()} (new${Number(s.km) > 0 ? `, +${Math.round(Number(s.km))} km` : ""})` : s.name))
        .join(" → ")}`
    );
    if (km > 0) bits.push(`about ${Math.round(km)} km more`);
    lines.push(bits.join(" · "));
  }
  if (String(why || "").trim()) lines.push(`Why: ${String(why).trim()}`);
  return lines.join("\n");
}

/* A request's state for the rep (24 Nov 2026, the user), by colour:
     raised  (red)    no reply from the team yet
     prog    (orange) the team replied (or is working on it), not done
     done    (green)  completed / closed
   status: the Task's; team: how many replies came from the team */
export function helpState(status, team) {
  if (status === "Completed" || status === "Cancelled") return "done";
  if ((team || 0) > 0 || status === "Working" || status === "Pending Review") return "prog";
  return "raised";
}
export const HELP_STATE = {
  raised: { label: "Raised", note: "No reply yet" },
  prog: { label: "In progress", note: "The team replied" },
  done: { label: "Resolved", note: "Done" },
};
// the team's replies on a listed request (listTripHelp's shape)
export const teamReplies = (t) => (t?.replies || []).filter((r) => !r.mine).length;

/* Which team replies the rep has opened, per request, on this device: a
   request with more team replies than seen has a new reply (the dot). */
const SEEN_KEY = "fx-help-seen";
const readSeen = () => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") || {};
  } catch {
    return {};
  }
};
export const helpSeen = (name) => Number(readSeen()[name] || 0);
export function markHelpSeen(name, n) {
  try {
    const s = readSeen();
    if ((s[name] || 0) >= n) return;
    s[name] = n;
    localStorage.setItem(SEEN_KEY, JSON.stringify(s));
  } catch {
    /* private mode: no dots kept */
  }
}

/* A trip's requests in a few numbers: { raised, prog, done, unread, total,
   state } -- state = the one that needs most attention (raised > prog > done),
   null with none. tasks: [{ status, team }] */
export function helpSummary(tasks) {
  const out = { raised: 0, prog: 0, done: 0, unread: 0, total: 0, state: null };
  for (const t of tasks || []) {
    out[helpState(t.status, t.team)] += 1;
    out.total += 1;
    // a new reply on a request still open (a resolved one is green already)
    if (helpState(t.status, t.team) !== "done" && (t.team || 0) > helpSeen(t.name)) out.unread += 1;
  }
  out.state = out.raised ? "raised" : out.prog ? "prog" : out.done ? "done" : null;
  return out;
}

/* Every planner request of the rep's on trips starting in from..to (the
   month), light: [{ name, status, from, to, creation, team }]. [] while the
   ERP script is older (no "month" action). */
export async function listMonthHelp(from, to) {
  try {
    const r = await callHelp({ action: "month", from, to });
    return (r.tasks || []).map((t) => ({ name: t.name, status: t.status, from: t.from, to: t.to, creation: t.creation, team: Number(t.team_replies) || 0, lastReply: t.last_reply || null }));
  } catch {
    return [];
  }
}

/* The rep's reply inside their own request -> { by, mine, at, content } */
export async function replyTripHelp(name, message) {
  const text = String(message || "").trim();
  if (text.length < 2) throw new Error("Write your reply first.");
  try {
    const r = await callHelp({ action: "reply", name, message: text });
    return r.reply || null;
  } catch (e) {
    if (/unknown action/i.test(e.message)) throw new Error("Replies from the app aren't switched on yet — raise a new request instead.");
    throw e;
  }
}

/* A bill photo / PDF for a request (24 Nov 2026, "Bill not accepted"): stored
   in the ERP as the rep's OWN private file, attached to nothing yet -- the
   Server Script then attaches it to the Task (it accepts only such a file).
   -> its file_url */
export const HELP_FILE_MAX = 10 * 1024 * 1024;
export async function uploadHelpFile(file) {
  if (!file) return null;
  if (!/^image\/|^application\/pdf$/i.test(file.type || "")) throw new Error("Attach a photo or a PDF of the bill.");
  if (file.size > HELP_FILE_MAX) throw new Error("The file is over 10 MB — take a smaller photo of the bill.");
  const form = new FormData();
  form.append("file", file, file.name || "bill.jpg");
  form.append("is_private", "1");
  let res;
  try {
    res = await fetch(`${erpOrigin()}/api/method/upload_file`, {
      method: "POST",
      headers: { Authorization: tokenHeader(AUTH_CONFIG.authToken), Accept: "application/json" },
      body: form,
    });
  } catch {
    throw new Error("Couldn't upload the bill — check the connection and try again.");
  }
  const json = await res.json().catch(() => ({}));
  const url = json?.message?.file_url;
  if (!res.ok || !url) throw new Error(`The bill could not be uploaded (HTTP ${res.status}) — try again.`);
  return url;
}

// the request carries a bill photo (the Task's description says so)
export const hasHelpPhoto = (description) => /Bill photo:/i.test(String(description || ""));

/* -> the new request ({ name, status, ... }, as listTripHelp's)
   file: a bill photo / PDF to attach (optional) */
export async function sendTripHelp({ trip, calc, claim, emp, message, title, file }) {
  const text = String(message || "").trim();
  if (text.length < 5) throw new Error("Write what is wrong (a few words at least).");
  const fileUrl = file ? await uploadHelpFile(file) : null;
  const r = await callHelp({
    action: "raise",
    trip_id: trip.id,
    kind: KIND[trip.kind] || "",
    from: trip.from,
    to: trip.to,
    // an add-to-route request names the place (19 Nov 2026), else the trip
    title: String(title || trip.name).slice(0, 60),
    message: text,
    details: tripDetails({ trip, calc, claim, emp }),
    ...(fileUrl ? { file: fileUrl } : {}),
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
