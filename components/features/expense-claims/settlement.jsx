"use client";

import { useState } from "react";
import { decideSettlement, withdrawSettlement } from "./data/claimsApi";
import { eachByGroup } from "../../../lib/limit";
import { inr, shortDate } from "./model";
import { BillThumb, FilePreview, IC, Icon, Note, RiskBadge, Sheet, Spinner, billFile, btn, card, ell, label, tabNum } from "./ui";

/* Settlement approval (16 Nov 2026), the app's side: a request -- the rep's
 * AI-checked bills, or a cash advance -- goes up their reporting line, BE >
 * ABM > RBM > SM/ZSM > GM > CEO, one approver at a time; the CEO's approval
 * is final. ERP: "Settlement API" (claimsApi: fetchMySettlements, ...).
 *
 *   ChainTrack     the chain as steps: approved (tick), waiting (dot), to come
 *   SendBar        "Send N bills for approval" on the Settlements page
 *   MyRequests     the requester's requests, each with its chain, the reason
 *                  when sent back, and "Take back" before the first approval
 *   SettleQueue    the approver's tab: waiting for me / my team / decided
 *   SettleSheet    one request: bills (photo, AI score), chain, Approve /
 *                  Reject with a reason
 *
 * The CEO's approval makes it Verified -- nothing more for now (no Accounts
 * Task, no booking, 16 Nov 2026). */

const STATUS = {
  waiting: { text: "In approval", fg: "#b54708", bg: "#fffaeb" },
  approved: { text: "Verified", fg: "#067647", bg: "#ecfdf3" },
  rejected: { text: "Sent back", fg: "#b42318", bg: "#fef3f2" },
  withdrawn: { text: "Taken back", fg: "#667085", bg: "#f2f4f7" },
};
const when = (s) => {
  const d = new Date(String(s || "").replace(" ", "T"));
  return isNaN(d) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};
// a request is one bill since 16 Nov 2026 -- called by the bill's own name
export const kindWord = (r) => (r.kind === "cash" ? "Cash request"
  : r.bills.length === 1 ? (r.bills[0].title || "1 bill") : `${r.bills.length} bills`);
/* who it waits on, in words */
export const waitingOn = (r) => {
  const s = r.steps[r.step];
  return r.status === "waiting" && s ? `with ${s.level === "CEO" ? "the CEO" : s.name}${s.level && s.level !== "CEO" ? ` (${s.level})` : ""}` : "";
};

function StatusPill({ r }) {
  // approved = booked in the accounts (17 Nov 2026): to be paid, or paid
  const s = r.status === "approved" && r.booked
    ? (r.booked.paid ? { text: "Paid", fg: "#067647", bg: "#ecfdf3" } : { text: "To be paid", fg: "#1d4ed8", bg: "#eef3fe" })
    : STATUS[r.status] || STATUS.waiting;
  return <span style={{ flex: "none", fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: s.fg, background: s.bg, whiteSpace: "nowrap" }}>{s.text}</span>;
}

/* The chain, left to right: each approver with a tick (approved), a cross
   (sent back), a dot (waiting now) or nothing yet; the CEO last. */
export function ChainTrack({ r, steps: given, compact }) {
  const steps = given || r.steps;
  return (
    <ol aria-label="Approval chain" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
      {steps.map((s, i) => {
        const now = r && r.status === "waiting" && i === r.step;
        const ok = s.decision === "Approved";
        const no = s.decision === "Rejected";
        const skip = s.decision === "Skipped"; // on leave / left / 2 working days (17 Nov 2026)
        const tone = ok ? "#067647" : no ? "#b42318" : now ? "#b54708" : "#98a2b3";
        return (
          <li key={i} aria-current={now ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: 4 }} title={[s.name, s.decision, s.at ? when(s.at) : "", s.note].filter(Boolean).join(" · ")}>
            {i > 0 && <span aria-hidden style={{ color: "#c0c5cf", fontSize: 12 }}>›</span>}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: compact ? "2px 7px" : "4px 9px", borderRadius: 99, fontSize: compact ? 11 : 12, fontWeight: 700, color: tone, background: ok ? "#ecfdf3" : no ? "#fef3f2" : now ? "#fffaeb" : "#f2f4f7", boxShadow: now ? "0 0 0 1.5px #f79009" : "none", whiteSpace: "nowrap" }}>
              {ok ? <Icon d={IC.check} size={11} sw={3} /> : no ? <Icon d={IC.x} size={11} sw={3} /> : now ? <span style={{ width: 6, height: 6, borderRadius: 99, background: "#f79009" }} /> : null}
              <span style={skip ? { textDecoration: "line-through" } : undefined}>{s.level || "Approver"}</span>{!compact && <span style={{ fontWeight: 500, color: "#475467" }}> {String(s.name || "").split(" ")[0]}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* On the Settlements page, only when needed (16 Nov 2026): a bill is sent for
   approval the moment it is added, so this is for a bill sent back (fixed,
   to send again) or one that could not be sent at the time. */
export function SendBar({ bills, busy, onSend }) {
  if (!bills.length) return null;
  const total = bills.reduce((s, l) => s + l.amount, 0);
  const back = bills.filter((l) => l.review).length;
  const allBack = back === bills.length;
  return (
    <section style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 10, boxShadow: `0 0 0 1.5px ${allBack ? "#d92d20" : "#0e7490"}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>
          {allBack ? `${back} ${back === 1 ? "bill" : "bills"} sent back` : `${bills.length} ${bills.length === 1 ? "bill" : "bills"} not sent yet`}
        </span>
        <b style={{ fontSize: 18, ...tabNum }}>{inr(total)}</b>
      </div>
      {back > 0 && <span style={{ fontSize: 12.5, color: "#b42318" }}>Open {back === 1 ? "it" : "them"} below to see why. Fix or remove {back === 1 ? "it" : "them"}, then send again.</span>}
      <button type="button" className="ec-cta" disabled={busy} onClick={onSend} style={{ ...btn.primary, height: 48, borderRadius: 14, fontSize: 15.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {busy ? <><Spinner size={14} />Sending…</> : <><Icon d={IC.arrow} size={18} />{allBack ? "Send again" : "Send for approval"}</>}
      </button>
    </section>
  );
}

/* The requester's requests, newest first (16 Nov 2026, user): one short row
   each -- what, when, with whom, amount, status. Tap a row for the details:
   the chain step by step, the bills, the reason it came back, Take back. */
export function MyRequests({ conn, requests, onChanged }) {
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  const list = requests.filter((r) => r.status !== "withdrawn");
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 5);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: "#5b6576" }}>Your requests</span>
      <div style={{ ...card, padding: "2px 14px" }}>
        {shown.map((r, i) => (
          <button key={r.id} type="button" onClick={() => setOpen(r)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 0", border: 0, borderTop: i ? "1px solid #eef1f5" : 0, background: "transparent", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <b style={{ fontSize: 14, ...ell }}>{kindWord(r)}{r.kind === "cash" && r.purpose ? ` · ${r.purpose}` : ""}</b>
              <span style={{ fontSize: 12, color: r.status === "rejected" ? "#b42318" : "#8a93a3", ...ell }}>
                {r.bills.length === 1 && r.bills[0].date ? `${shortDate(r.bills[0].date)} · ` : ""}{r.status === "rejected" ? "Sent back — tap to see why" : r.status === "approved" ? "Verified" : waitingOn(r) || `sent ${when(r.created)}`}
              </span>
            </span>
            <b style={{ fontSize: 15, ...tabNum }}>{inr(r.amount)}</b>
            <StatusPill r={r} />
            <span aria-hidden style={{ color: "#98a2b3", display: "flex" }}><Icon d={IC.next} size={16} /></span>
          </button>
        ))}
      </div>
      {list.length > 5 && (
        <button type="button" className="ec-ghost" onClick={() => setAll((a) => !a)} style={{ ...btn.ghost, alignSelf: "center", height: 34, fontSize: 12.5 }}>
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
      {open && <MyRequestSheet conn={conn} r={open} onClose={() => setOpen(null)} onChanged={(m) => { setOpen(null); onChanged?.(m); }} />}
    </section>
  );
}

/* One of my requests, opened: the chain as a timeline, the bills (no score --
   that is for the approvers), the reason it came back, and Take back while
   nobody has approved it yet. */
function MyRequestSheet({ conn, r, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null);
  const canTakeBack = r.status === "waiting" && r.step === 0;
  const takeBack = async () => {
    setBusy(true);
    setErr("");
    try {
      await withdrawSettlement(conn, r.id);
      onChanged?.(`${kindWord(r)} taken back`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  const files = r.bills.map((b) => billFile(b.bill)).filter(Boolean);
  return (
    <>
      <Sheet title={kindWord(r)} sub={`${r.id} · ${inr(r.amount)} · sent ${when(r.created)}`} onClose={busy ? () => {} : onClose} desktop="dialog" maxWidth={560} body="#f4f5f7"
        footer={canTakeBack ? <>
          <button type="button" className="ec-ghost" disabled={busy} onClick={takeBack} style={{ ...btn.ghost, flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{busy ? <><Spinner size={14} />Taking back…</> : "Take back"}</button>
          <button type="button" className="ec-cta" disabled={busy} onClick={onClose} style={{ ...btn.primary, flex: 1 }}>Close</button>
        </> : <button type="button" className="ec-cta" onClick={onClose} style={{ ...btn.primary, flex: 1 }}>Close</button>}>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {err && <Note>{err}</Note>}
          {r.status === "rejected" && r.note && (
            <span style={{ fontSize: 13, color: "#b42318", padding: "10px 12px", borderRadius: 12, background: "#fef3f2", lineHeight: 1.45 }}>
              <b>Sent back by {r.steps.find((s) => s.decision === "Rejected")?.name || "an approver"}:</b> {r.note}
              {r.kind === "bills" ? " — the bills are back with you to fix and send again." : ""}
            </span>
          )}
          {r.status === "approved" && <span style={{ fontSize: 13, fontWeight: 600, color: "#067647", padding: "10px 12px", borderRadius: 12, background: "#ecfdf3" }}>
            Approved — {!r.booked ? (r.kind === "bills" ? "the bill is verified." : "verified.")
              : r.booked.paid ? (r.kind === "bills" ? "paid to you." : "the cash is paid to you.")
              : r.kind === "bills" ? "booked in the accounts; Accounts pays it in the next payment run." : "Accounts pays the cash in the next payment run."}
          </span>}
          <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column" }}>
            <span style={{ ...label, marginBottom: 10 }}>Approval</span>
            {r.steps.map((s, i) => {
              const now = r.status === "waiting" && i === r.step;
              const ok = s.decision === "Approved", no = s.decision === "Rejected", skip = s.decision === "Skipped";
              const tone = ok ? "#067647" : no ? "#b42318" : now ? "#b54708" : "#98a2b3";
              const last = i === r.steps.length - 1;
              return (
                <div key={i} style={{ display: "flex", gap: 10 }}>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none", width: 22 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 99, display: "grid", placeItems: "center", color: "#fff", background: ok ? "#12b76a" : no ? "#d92d20" : now ? "#f79009" : "#d0d5dd" }}>
                      {ok ? <Icon d={IC.check} size={12} sw={3} /> : no ? <Icon d={IC.x} size={12} sw={3} /> : <span style={{ width: 6, height: 6, borderRadius: 99, background: "#fff" }} />}
                    </span>
                    {!last && <span style={{ flex: 1, width: 2, minHeight: 14, background: ok ? "#a6f4c5" : "#eaecf0" }} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, paddingBottom: last ? 0 : 12 }}>
                    <span style={{ fontSize: 13.5 }}><b>{s.name}</b> <span style={{ color: "#8a93a3" }}>{s.level}</span></span>
                    <span style={{ fontSize: 12, color: tone }}>
                      {ok ? `Approved · ${when(s.at)}` : no ? `Sent back · ${when(s.at)}` : skip ? `Skipped · ${when(s.at)}` : now ? "Waiting for them" : r.status === "waiting" ? "Next" : "—"}
                    </span>
                    {s.note && <span style={{ fontSize: 12, color: "#475467" }}>{s.note}</span>}
                  </span>
                </div>
              );
            })}
          </div>
          {r.kind === "cash" ? (
            <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={label}>Cash asked for</span>
              <b style={{ fontSize: 20, ...tabNum }}>{inr(r.amount)}</b>
              {r.purpose && <span style={{ fontSize: 14, color: "#344054" }}>{r.purpose}</span>}
            </div>
          ) : (
            <div style={{ ...card, padding: "2px 14px" }}>
              <span style={{ ...label, display: "block", paddingTop: 12 }}>{r.bills.length === 1 ? "The bill" : kindWord(r)}</span>
              {r.bills.map((b, i) => {
                const f = billFile(b.bill);
                return (
                  <div key={b.row || i} style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: i ? "1px solid #eef1f5" : 0, alignItems: "center" }}>
                    {f ? <BillThumb conn={conn} file={f} w={44} h={54} onOpen={() => setPreview(f)} /> : <span style={{ width: 44, height: 54, borderRadius: 8, background: "#f2f4f7", display: "grid", placeItems: "center", color: "#98a2b3" }}><Icon d={IC.file} size={16} /></span>}
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <b style={{ fontSize: 13.5, ...ell }}>{b.title}</b>
                      <span style={{ fontSize: 12, color: "#5b6576" }}>{shortDate(b.date)}</span>
                    </span>
                    <b style={{ fontSize: 14, ...tabNum }}>{inr(b.amount)}</b>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Sheet>
      {preview && <FilePreview conn={conn} file={preview} files={files} onClose={() => setPreview(null)} />}
    </>
  );
}

/* The approver's tabs (17 Nov 2026, the user's list):
 *   Waiting       waits on the caller now -- "Select clean" (every bill 90+,
 *                 or cash) approves many at once
 *   In approval   the caller approved it and it is still going up -- until
 *                 the CEO approves it (17 Nov 2026, the user's rule: before a
 *                 request reaches someone they see nothing of it)
 *   Approved      the caller approved it and the CEO verified it
 *   Rejected      sent back, by the caller or by someone above them after
 *                 they approved
 *   History       every request the caller acted on, approved or rejected,
 *                 with their own decision -- even while it is still moving
 * The IT overview (not in any chain) gets In approval / Approved / Rejected
 * over everyone's requests, read-only.
 * Every tab lists HQ > employee > requests, each level folding (17 Nov 2026:
 * so the higher-ups can follow a whole region); one HQ skips that level. */

/* the caller's place in the chain, from the requests they appear in */
function roleOf(data) {
  const me = data?.me;
  const count = {};
  for (const r of [...(data?.waiting || []), ...(data?.team || []), ...(data?.decided || [])])
    for (const s of r.steps) if (s.user === me) count[s.level] = (count[s.level] || 0) + 1;
  const level = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  // the LAST step is the GM (17 Nov 2026), the CEO only where no GM is above
  return { level, ceo: level === "CEO" || level === "GM", overview: !!data?.overview, approver: !!level };
}
const clean = (r) => r.kind === "cash" || r.bills.every((b) => b.score != null && b.score >= 90);
const sumOf = (rs) => rs.reduce((s, r) => s + r.amount, 0);

function QueueCard({ r, act, picked, onPick, onOpen, mine }) {
  const look = r.kind === "bills" && r.bills.some((b) => b.score != null && b.score < 90);
  const scored = r.kind === "bills" && r.bills.every((b) => b.score != null);
  return (
    <div style={{ ...card, padding: 0, display: "flex", alignItems: "stretch", boxShadow: act ? "0 0 0 1.5px #f79009" : card.boxShadow, overflow: "hidden" }}>
      {onPick && (
        <label style={{ display: "grid", placeItems: "center", padding: "0 4px 0 12px", cursor: "pointer" }} aria-label={`Select ${r.id}`}>
          <input type="checkbox" checked={picked} onChange={(e) => onPick(e.target.checked)} style={{ width: 18, height: 18, accentColor: "#2563eb" }} />
        </label>
      )}
      <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, padding: 14, display: "flex", flexDirection: "column", gap: 7, border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, ...ell }}>{kindWord(r)}{r.kind === "cash" && r.purpose ? ` · ${r.purpose}` : ""}</span>
          <span style={{ fontSize: 16, fontWeight: 700, ...tabNum }}>{inr(r.amount)}</span>
        </span>
        <span style={{ fontSize: 12, color: "#8a93a3", ...ell }}>Sent {when(r.created)}{r.resent ? <b style={{ color: "#b54708", fontWeight: 600 }}> · sent again</b> : null}</span>
        {act && (look ? (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#b54708" }}>Needs a look — open the bill</span>
        ) : scored ? (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#067647" }}>Bill matches</span>
        ) : null)}
        <ChainTrack r={r} compact />
        {mine && (
          <span style={{ fontSize: 12, fontWeight: 600, color: mine.decision === "Rejected" ? "#b42318" : "#067647", ...ell }}>
            You {mine.decision === "Rejected" ? "rejected" : "approved"}{mine.at ? ` · ${when(mine.at)}` : ""}{mine.decision === "Rejected" && mine.note ? ` — ${mine.note}` : ""}
          </span>
        )}
        {!act && (r.status === "waiting" ? <span style={{ fontSize: 12, color: "#8a93a3" }}>{waitingOn(r)}</span> : <StatusPill r={r} />)}
      </button>
    </div>
  );
}

/* one folding row: an HQ (plain, bold) or an employee (inside its card) */
function Fold({ open, onClick, title, sub, n, amount, hot, hq }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: hq ? "4px 2px" : "12px 14px", border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }}>
      <span aria-hidden style={{ flex: "none", width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", background: open ? "#eef3fe" : "#f2f4f7", color: open ? "#1d4ed8" : "#475467", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
        <Icon d={IC.next} size={14} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
        <b style={{ fontSize: hq ? 15 : 14, ...ell }}>{title}</b>
        {sub && <span style={{ fontSize: 12, color: "#8a93a3", ...ell }}>{sub}</span>}
      </span>
      <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: 11, display: "grid", placeItems: "center", background: hot ? "#fef0c7" : "#f2f4f7", color: hot ? "#b54708" : "#475467", fontSize: 12, fontWeight: 700, ...tabNum }}>{n}</span>
        <b style={{ fontSize: 13.5, ...tabNum }}>{inr(amount)}</b>
      </span>
    </button>
  );
}

export function SettleQueue({ conn, data, desk, onOpen, onDone, onError }) {
  const role = roleOf(data);
  const me = data?.me;
  const { waiting = [], team = [], decided = [] } = data || {};
  const others = [...team, ...decided];
  const myStep = (r) => r.steps.find((x) => x.user === me && (x.decision === "Approved" || x.decision === "Rejected"));
  const newest = (a, b) => String(b.decidedOn || b.modified || "").localeCompare(String(a.decidedOn || a.modified || ""));
  const reader = role.overview && !role.approver;
  const tabs = [
    ...(reader ? [] : [{ k: "waiting", t: "Waiting", list: waiting, act: true }]),
    // only what reached the caller (they approved or rejected it); the IT overview sees all
    { k: "moving", t: "In approval", list: others.filter((r) => r.status === "waiting" && (reader || myStep(r)?.decision === "Approved")) },
    { k: "approved", t: "Approved", list: others.filter((r) => r.status === "approved" && (reader || myStep(r))).sort(newest) },
    { k: "rejected", t: "Rejected", list: others.filter((r) => r.status === "rejected" && (reader || myStep(r))).sort(newest) },
    ...(reader ? [] : [{
      k: "history", t: "History", history: true,
      list: others.filter(myStep).sort((a, b) => String(myStep(b).at).localeCompare(String(myStep(a).at))),
    }]),
  ];
  const [tab, setTab] = useState(() => (tabs[0].list.length || !tabs[1].list.length ? tabs[0].k : tabs[1].k));
  const cur = tabs.find((x) => x.k === tab) || tabs[0];
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState("");
  const [flip, setFlip] = useState(() => new Set()); // folds the user turned, against the default
  const needle = q.trim().toLowerCase();
  const shown = cur.list.filter((r) => !needle || `${r.employeeName} ${r.hq}`.toLowerCase().includes(needle));
  // HQ > employee > requests
  const hqs = [...shown.reduce((m, r) => {
    const h = r.hq || "No HQ";
    if (!m.has(h)) m.set(h, new Map());
    const ps = m.get(h);
    if (!ps.has(r.employee)) ps.set(r.employee, { id: r.employee, name: r.employeeName, list: [] });
    ps.get(r.employee).list.push(r);
    return m;
  }, new Map()).entries()]
    .map(([name, ps]) => ({ name, people: [...ps.values()].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => (a.name === "No HQ") - (b.name === "No HQ") || a.name.localeCompare(b.name));
  const nPeople = hqs.reduce((n, h) => n + h.people.length, 0);
  const isOpen = (k, def) => (flip.has(k) ? !def : def);
  const toggle = (k) => setFlip((f) => { const n = new Set(f); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const cleanOnes = cur.act ? shown.filter(clean) : [];
  // one employee's bills at once (17 Nov 2026): reject the odd one by
  // opening it, then "Approve all" on the employee does the rest
  const [sure, setSure] = useState(""); // the employee whose "Approve all" waits for its second tap
  const approveMany = async (only) => {
    const ids = Array.isArray(only) ? only : [...picked];
    setSure("");
    setBusy(`Approving 0 of ${ids.length}…`);
    // 17 Nov 2026: different employees in parallel, at most 3 at a time; one
    // employee's own requests one after another (they write to the same claim)
    const byId = new Map([...waiting, ...others].map((r) => [r.id, r]));
    let ok = 0;
    const res = await eachByGroup(ids, (id) => byId.get(id)?.claim || byId.get(id)?.employee || id, 3, async (id) => {
      await decideSettlement(conn, id, "Approve", "");
      ok += 1;
      setBusy(`Approving ${ok} of ${ids.length}…`);
    });
    const failed = res.filter((x) => !x.ok).map((x) => `${x.item}: ${x.error?.message || x.error}`);
    setBusy("");
    setPicked(new Set());
    if (failed.length) onError?.(`${ok} approved, ${failed.length} failed — ${failed[0]}`);
    else onDone?.(role.ceo ? `${ok} ${ok === 1 ? "bill" : "bills"} approved — booked for the next payment run` : `${ok} ${ok === 1 ? "request" : "requests"} approved — on to the next level`);
  };
  const grid = { display: "grid", gridTemplateColumns: desk ? "repeat(auto-fill,minmax(320px,1fr))" : "minmax(0,1fr)", gap: 8 };
  const EMPTY = { waiting: "Nothing waits on you.", moving: "Nothing you approved is still going up.", approved: "Nothing approved yet.", rejected: "Nothing rejected.", history: "You have not approved or rejected anything yet." };

  return (
    <>
      <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "#e9ecf1", alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto" }}>
        {tabs.map((x) => (
          <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} onClick={() => { setTab(x.k); setPicked(new Set()); setFlip(new Set()); }}
            style={{ height: 34, padding: "0 12px", borderRadius: 9, border: 0, background: tab === x.k ? "#fff" : "transparent", boxShadow: tab === x.k ? "0 1px 2px rgba(16,24,40,.12)" : "none", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            {x.t} <span style={{ color: x.act && x.list.length ? "#b54708" : "#8a93a3" }}>{x.list.length}</span>
          </button>
        ))}
      </div>

      {busy && !picked.size && <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#1d4ed8" }}><Spinner size={12} />{busy}</span>}
      {(cur.list.length > 6 || (cur.act && cleanOnes.length > 1) || picked.size > 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {cur.list.length > 6 && (
            <label style={{ flex: desk ? "0 1 300px" : "1 1 100%", display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: 10, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec" }}>
              <Icon d={IC.search} size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee or HQ" aria-label="Search employee or HQ" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 13.5 }} />
            </label>
          )}
          {cur.act && cleanOnes.length > 1 && (
            <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => setPicked(new Set(cleanOnes.map((r) => r.id)))} style={{ ...btn.ghost, height: 36, fontSize: 12.5 }}>
              Select {cleanOnes.length} clean
            </button>
          )}
          {cur.act && picked.size > 0 && <>
            <button type="button" className="ec-cta" disabled={!!busy} onClick={() => approveMany()} style={{ ...btn.primary, height: 36, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
              {busy ? <><Spinner size={12} />{busy}</> : `Approve ${picked.size} selected`}
            </button>
            <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => setPicked(new Set())} style={{ ...btn.ghost, height: 36, fontSize: 12.5 }}>Clear</button>
          </>}
        </div>
      )}

      {!shown.length ? (
        <div style={{ ...card, padding: "28px 16px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>{cur.list.length ? `No one matches “${q}”.` : EMPTY[cur.k]}</div>
      ) : (
        hqs.map((h) => {
          const people = h.people.map((p) => {
            const k = `p:${h.name}:${p.id}`;
            const open = isOpen(k, nPeople === 1);
            return (
              <div key={k} style={{ ...card, padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, paddingRight: cur.act ? 10 : 0, flexWrap: desk ? "nowrap" : "wrap" }}>
                  {cur.act && (
                    <label style={{ display: "grid", placeItems: "center", paddingLeft: 12, cursor: "pointer" }} aria-label={`Select all of ${p.name}'s bills`}>
                      <input type="checkbox" disabled={!!busy} checked={p.list.every((r) => picked.has(r.id))}
                        onChange={(e) => setPicked((s) => { const n = new Set(s); for (const r of p.list) { if (e.target.checked) n.add(r.id); else n.delete(r.id); } return n; })}
                        style={{ width: 18, height: 18, accentColor: "#2563eb" }} />
                    </label>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Fold open={open} onClick={() => toggle(k)} title={p.name} sub={hqs.length === 1 && h.name !== "No HQ" ? h.name : ""}
                      n={p.list.length} amount={sumOf(p.list)} hot={cur.act} />
                  </div>
                  {cur.act && (
                    <button type="button" className={sure === p.id ? "ec-cta" : "ec-ghost"} disabled={!!busy}
                      onClick={() => (sure === p.id ? approveMany(p.list.map((r) => r.id)) : setSure(p.id))}
                      onBlur={() => setSure((x) => (x === p.id ? "" : x))}
                      style={{ ...(sure === p.id ? btn.primary : btn.ghost), height: 34, padding: "0 12px", fontSize: 12.5, whiteSpace: "nowrap", marginLeft: desk ? 0 : 12, marginBottom: desk ? 0 : 10 }}>
                      {sure === p.id
                        ? `Tap again: approve ${p.list.length} · ${inr(sumOf(p.list))}`
                        : p.list.length === 1 ? "Approve" : `Approve all ${p.list.length}`}
                    </button>
                  )}
                </div>
                {open && (
                  <div style={{ ...grid, padding: "0 12px 12px" }}>
                    {p.list.map((r) => (
                      <QueueCard key={r.id} r={r} act={!!cur.act} picked={picked.has(r.id)} mine={cur.history ? myStep(r) : null}
                        onPick={cur.act ? (on) => setPicked((s) => { const n = new Set(s); if (on) n.add(r.id); else n.delete(r.id); return n; }) : null}
                        onOpen={() => onOpen(r, !!cur.act)} />
                    ))}
                  </div>
                )}
              </div>
            );
          });
          if (hqs.length === 1) return <div key={h.name} style={{ display: "flex", flexDirection: "column", gap: 8 }}>{people}</div>;
          const k = `h:${h.name}`;
          const open = isOpen(k, hqs.length <= 3);
          const all = h.people.flatMap((p) => p.list);
          return (
            <section key={k} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Fold open={open} onClick={() => toggle(k)} title={h.name} sub={`${h.people.length} ${h.people.length === 1 ? "person" : "people"}`}
                n={all.length} amount={sumOf(all)} hot={cur.act} hq />
              {open && <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: desk ? 18 : 8 }}>{people}</div>}
            </section>
          );
        })
      )}
    </>
  );
}

/* A handwritten bill's reason names its payment proof ("Payment proof:
   /private/files/x.jpg", written by the bill check): show it as a photo, not
   as a path. */
const proofOf = (reason) => {
  const m = /Payment proof: (\/(?:private\/)?files\/\S+)/.exec(String(reason || ""));
  return m ? { file: billFile(m[1]), text: String(reason).replace(m[0], "Payment proof added.") } : { file: null, text: reason };
};

/* One request, opened: the bills with their photos and AI scores, the chain,
   and -- when it waits on the caller -- Approve / Reject with a reason. */
export function SettleSheet({ conn, req: r, canAct, desk, onClose, onDone, onBill }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const last = r.step === r.steps.length - 1;
  const go = async (decision) => {
    setError("");
    if (decision === "Reject" && !note.trim()) return setError("Say why it is sent back — the requester sees it.");
    try {
      setBusy(decision === "Approve" ? "Approving…" : "Sending back…");
      await decideSettlement(conn, r.id, decision, note.trim());
      onDone(decision === "Approve"
        ? last ? `${r.employeeName}: approved and verified (${inr(r.amount)})` : `${r.employeeName}: approved — on to ${r.steps[r.step + 1]?.name || "the next approver"}`
        : `${r.employeeName}: sent back`);
    } catch (e) {
      setBusy("");
      setError(e.message);
    }
  };
  const files = r.bills.map((b) => billFile(b.bill)).filter(Boolean);
  return (
    <Sheet
      title={`${r.employeeName} · ${kindWord(r)}`}
      sub={`${r.id} · ${inr(r.amount)} · sent ${when(r.created)}`}
      onClose={busy ? () => {} : onClose}
      maxWidth={desk ? 680 : 640}
      body="#f4f5f7"
      footer={!canAct ? (
        <button type="button" className="ec-ghost" onClick={onClose} style={{ ...btn.ghost, flex: 1 }}>Close</button>
      ) : rejecting ? <>
        <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => { setRejecting(false); setError(""); }} style={{ ...btn.ghost, flex: 1 }}>Back</button>
        <button type="button" disabled={!!busy} onClick={() => go("Reject")} style={{ ...btn.primary, flex: 1.4, background: "#d92d20", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{busy ? <><Spinner />{busy}</> : "Send back"}</button>
      </> : <>
        <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => setRejecting(true)} style={{ ...btn.ghost, flex: 1, color: "#b42318" }}>Reject</button>
        <button type="button" className="ec-cta" disabled={!!busy} onClick={() => go("Approve")} style={{ ...btn.primary, flex: 1.4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {busy ? <><Spinner />{busy}</> : `Approve ${inr(r.amount)}`}
        </button>
      </>}
    >
      <div style={{ padding: desk ? 18 : 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={label}>Approval chain</span>
          <ChainTrack r={r} />
          {r.resent && (
            <span style={{ fontSize: 12.5, color: "#b54708", padding: "8px 10px", borderRadius: 10, background: "#fffaeb", lineHeight: 1.45 }}>
              <b>Sent again.</b> Sent back before{r.resent.by ? ` by ${r.resent.by}` : ""}{r.resent.note ? `: “${r.resent.note}”` : ""}
            </span>
          )}
          {r.steps.filter((s) => s.decision).map((s, i) => (
            <span key={i} style={{ fontSize: 12.5, color: "#475467" }}>
              <b>{s.name}</b> ({s.level}) {s.decision === "Approved" ? "approved" : s.decision === "Skipped" ? "skipped" : "sent it back"} · {when(s.at)}{s.note ? ` — ${s.note}` : ""}
            </span>
          ))}
          {canAct && last && <span style={{ fontSize: 12.5, fontWeight: 600, color: "#067647" }}>You are the last step: approving books {r.kind === "bills" ? "the bill" : "the cash request"} for the next payment run.</span>}
        </div>
        {r.kind === "cash" ? (
          <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={label}>Cash asked for</span>
            <b style={{ fontSize: 22, ...tabNum }}>{inr(r.amount)}</b>
            <span style={{ fontSize: 14, color: "#344054" }}>{r.purpose}</span>
          </div>
        ) : (
          <div style={{ ...card, padding: "4px 14px" }}>
            {r.bills.map((b, i) => {
              const f = billFile(b.bill);
              return (
                <div key={b.row || i} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: i ? "1px solid #eef1f5" : 0, alignItems: "flex-start" }}>
                  {f ? <BillThumb conn={conn} file={f} w={64} h={80} onOpen={() => onBill(f, files)} /> : <span style={{ width: 64, height: 80, borderRadius: 10, background: "#f2f4f7", display: "grid", placeItems: "center", color: "#98a2b3" }}><Icon d={IC.file} size={18} /></span>}
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <b style={{ flex: 1, minWidth: 0, fontSize: 14, ...ell }}>{b.title}</b>
                      <b style={{ fontSize: 15, ...tabNum }}>{inr(b.amount)}</b>
                    </span>
                    <span style={{ fontSize: 12.5, color: "#5b6576" }}>{shortDate(b.date)}</span>
                    <RiskBadge ai={{ risk: b.risk || (b.score == null ? "" : b.score >= 90 ? "Low" : b.score >= 70 ? "Medium" : "High"), score: b.score }} small />
                    {b.score != null && b.score < 90 && b.reason && <span style={{ fontSize: 12, color: "#b54708", lineHeight: 1.4 }}>{proofOf(b.reason).text}</span>}
                    {proofOf(b.reason).file && (
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <BillThumb conn={conn} file={proofOf(b.reason).file} w={44} h={54} onOpen={() => onBill(proofOf(b.reason).file, [proofOf(b.reason).file])} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#475467" }}>Payment proof</span>
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {canAct && (
          <label style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={label}>{rejecting ? "Why it is sent back" : "Remarks · optional"}</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={rejecting ? "e.g. The courier bill's date does not match — add the right bill" : "e.g. Checked the bills"} style={{ width: "100%", borderRadius: 10, border: "1px solid #d0d5dd", padding: 10, fontSize: 14, resize: "vertical" }} />
          </label>
        )}
        {error && <Note>{error}</Note>}
      </div>
    </Sheet>
  );
}
