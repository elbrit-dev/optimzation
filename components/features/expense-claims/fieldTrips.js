/* A planner field claim's lines, trip by trip (12 Nov 2026).
 *
 * The planner tags every line it writes with its trip (Expense Claim Detail
 * .custom_trip = "2026-10-12..2026-10-15 · Bangalore"), and the reporting
 * officer approves or rejects each trip on its own ("Field Trip Decision API"
 * sets custom_trip_decision / _note / _decided_by / _decided_on on the trip's
 * lines). Lines saved before the tag existed fall into the tagged trip whose
 * dates hold them, else into runs of consecutive days. */

export const tripTag = (t) => `${t.from}..${t.to}${t.name ? ` · ${t.name}` : ""}`;

export function parseTripTag(s) {
  const m = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})(?: · (.*))?$/.exec(String(s || "").trim());
  return m ? { from: m[1], to: m[2], name: (m[3] || "").trim() } : null;
}

const nextDay = (d) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};

/* -> [{ key, from, to, name, lines, amount, bills, decision, note, by, on }]
   decision: "approved" (every line) | "rejected" (any line) | "pending" */
export function tripsOf(lines) {
  const trips = new Map();
  const loose = [];
  for (const l of lines || []) {
    const t = parseTripTag(l.trip);
    if (!t) {
      loose.push(l);
      continue;
    }
    const key = `${t.from}..${t.to}`;
    if (!trips.has(key)) trips.set(key, { key, ...t, lines: [] });
    trips.get(key).lines.push(l);
  }
  // untagged: into the tagged trip holding the date, else consecutive-day runs
  const tagged = [...trips.values()];
  const rest = [];
  for (const l of loose) {
    const t = tagged.find((x) => l.date >= x.from && l.date <= x.to);
    if (t) t.lines.push(l);
    else rest.push(l);
  }
  rest.sort((a, b) => a.date.localeCompare(b.date));
  let run = null;
  for (const l of rest) {
    if (!run || (l.date !== run.to && l.date !== nextDay(run.to))) {
      run = { key: `run:${l.date}`, from: l.date, to: l.date, name: "", lines: [] };
      trips.set(run.key, run);
    }
    run.to = l.date > run.to ? l.date : run.to;
    run.lines.push(l);
  }
  return [...trips.values()]
    .map((t) => {
      const ls = [...t.lines].sort((a, b) => a.date.localeCompare(b.date) || (a.idx || 0) - (b.idx || 0));
      const rej = ls.find((l) => l.decision === "Rejected");
      const all = ls.length > 0 && ls.every((l) => l.decision === "Approved");
      const by = (rej || (all ? ls[0] : null)) || null;
      return {
        ...t,
        lines: ls,
        // what the trip comes to now: a line the officer changed counts at its new amount
        amount: ls.reduce((s, l) => s + (Number(l.adjusted ? l.final : l.amount) || 0), 0),
        bills: ls.filter((l) => l.bill).length,
        days: new Set(ls.map((l) => l.date)).size,
        decision: rej ? "rejected" : all ? "approved" : "pending",
        note: rej ? rej.decisionNote || "" : "",
        by: by ? by.decidedBy || "" : "",
        on: by ? by.decidedOn || "" : "",
      };
    })
    .sort((a, b) => a.from.localeCompare(b.from));
}
