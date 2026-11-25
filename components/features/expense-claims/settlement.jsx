"use client";

import { useState } from "react";
import { approveSettlements, decideSettlement, withdrawSettlement } from "./data/claimsApi";
import { RISK, inr, shortDate } from "./model";
import { BillThumb, FilePreview, IC, Icon, Note, Sheet, Spinner, billFile, btn, card, ell, label, tabNum } from "./ui";

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
export const kindWord = (r) => (r.kind === "cash" ? "Advance request"
  : r.bills.length === 1 ? (r.bills[0].title || "1 bill") : `${r.bills.length} bills`);
/* who it waits on, in words */
export const waitingOn = (r) => {
  const s = r.steps[r.step];
  return r.status === "waiting" && s ? `with ${s.level === "CEO" ? "the CEO" : s.name}${s.level && s.level !== "CEO" ? ` (${s.level})` : ""}` : "";
};
/* The settlement type in one short line (23 Nov 2026): "Own · Courier &
   postage", "Doctor activity · Dr X", "Doctor service · Dr X · <service>";
   "" for cash. x: a request (type, expenseKind, doctorName, service) or a
   bill line (settleType, expenseKind, doctorName, doctorService). An old own
   bill has no kind: just "Own". */
export const drName = (n) => (!n ? "" : /^dr\.?\s/i.test(n) ? n : `Dr ${n}`);
export function typeLine(x) {
  const t = x?.settleType || x?.type || "Own";
  if (t === "Cash" || x?.kind === "cash") return "";
  if (t === "Own") return x.expenseKind ? `Own · ${x.expenseKind}` : "Own";
  // no service tagged (the settings switch off, 24 Nov 2026): the day it was done
  const sv = t !== "Doctor service" ? ""
    : x.service?.service || x.doctorService || (/^\d{4}-\d{2}-\d{2}$/.test(x.serviceDate || "") ? `service on ${shortDate(x.serviceDate)}` : "");
  return [t, drName(x.doctorName), sv].filter(Boolean).join(" · ");
}
/* A doctor service bill TAGGED to a service can be approved only once that
   service is approved (settlement_api decide): until then it waits, and is
   never picked. One with just a service day (switch off) never waits. */
export const serviceHeld = (r) => r?.type === "Doctor service" && r.status === "waiting" && !r.serviceDate && !r.service?.approved;
export const HELD_NOTE = "Approve once the doctor service is approved";
/* "<service> · ₹amount · ₹billed billed · ₹left left · <state>" */
export const serviceLine = (s) => (s ? [s.service || s.name, inr(s.amount), `${inr(s.billed)} billed`, `${inr(s.left)} left`, s.state || (s.approved ? "Approved" : "Waiting for approval")].join(" · ") : "");
/* The type, the doctor and the service, for the approvers. */
export function TypeInfo({ r, small }) {
  const t = typeLine(r);
  if (!t) return null;
  const fs = small ? 11.5 : 12.5;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: fs, fontWeight: 600, color: "#344054", lineHeight: 1.4 }}>{t}</span>
      {r.type === "Doctor service" && r.service && <span style={{ fontSize: fs - 0.5, color: "#5b6576", lineHeight: 1.4 }}>{serviceLine(r.service)}</span>}
      {serviceHeld(r) && <span style={{ fontSize: fs - 0.5, fontWeight: 600, color: "#b54708", lineHeight: 1.4 }}>{HELD_NOTE}</span>}
    </span>
  );
}

/* " since 18 Nov": when it reached the one it waits on -- the step before
   decided (or skipped) then, or it was sent then */
const since = (r) => {
  if (r.status !== "waiting") return "";
  const at = String((r.step > 0 && r.steps[r.step - 1]?.at) || r.created || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(at) ? ` since ${shortDate(at)}` : "";
};
// read only by screen readers
const SR = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 };

/* The bill check's badge, in words an approver reads right: "Bill matches ·
   100%", not "Low risk · 100" (which reads as risk 100). */
export function CheckBadge({ b, small }) {
  const risk = b.risk || (b.score == null ? "" : b.score >= 90 ? "Low" : b.score >= 70 ? "Medium" : "High");
  if (!risk) return null;
  const t = RISK[risk] || RISK.High;
  return (
    <span title={b.reason || ""} style={{ flex: "none", alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, fontSize: small ? 10.5 : 11, fontWeight: 700, padding: small ? "1px 7px" : "2px 8px", borderRadius: 99, background: t.bg, color: t.fg, whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot }} />
      {risk === "Low" ? "Bill matches" : "Check this bill"}{b.score != null ? ` · ${Math.round(b.score)}%` : ""}
    </span>
  );
}

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
              <span style={skip ? { textDecoration: "line-through" } : undefined}>{s.level || "Approver"}</span>
              <span style={SR}>{`, ${ok ? "approved" : no ? "sent back" : skip ? "skipped" : now ? "waiting" : "not yet"}`}</span>{!compact && <span style={{ fontWeight: 500, color: "#475467" }}> {String(s.name || "").split(" ")[0]}</span>}
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
              {typeLine(r) && <span style={{ fontSize: 12, fontWeight: 600, color: "#475467", ...ell }}>{typeLine(r)}</span>}
              <span style={{ fontSize: 12, color: r.status === "rejected" ? "#b42318" : serviceHeld(r) ? "#b54708" : "#8a93a3", ...ell }}>
                {r.bills.length === 1 && r.bills[0].date ? `${shortDate(r.bills[0].date)} · ` : ""}{r.status === "rejected" ? "Sent back — tap to see why" : r.status === "approved" ? "Verified" : serviceHeld(r) ? "Waiting for the doctor service to be approved" : (waitingOn(r) && waitingOn(r) + since(r)) || `sent ${when(r.created)}`}
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
      <Sheet title={kindWord(r)} sub={`${inr(r.amount)} · sent ${when(r.created)}`} onClose={busy ? () => {} : onClose} desktop="dialog" maxWidth={560} body="#f4f5f7"
        footer={canTakeBack ? <>
          <button type="button" className="ec-ghost" disabled={busy} onClick={takeBack} style={{ ...btn.ghost, flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{busy ? <><Spinner size={14} />Taking back…</> : "Take back"}</button>
          <button type="button" className="ec-cta" disabled={busy} onClick={onClose} style={{ ...btn.primary, flex: 1 }}>Close</button>
        </> : <button type="button" className="ec-cta" onClick={onClose} style={{ ...btn.primary, flex: 1 }}>Close</button>}>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {err && <Note>{err}</Note>}
          {serviceHeld(r) && <Note tone="info" style={{ color: "#b54708", background: "#fffaeb" }}>Waiting for the doctor service to be approved — you are paid back once it is.</Note>}
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
                      {ok ? `Approved · ${when(s.at)}` : no ? `Sent back · ${when(s.at)}` : skip ? `Skipped · ${when(s.at)}` : now ? `Waiting for them${since(r)}` : r.status === "waiting" ? "Next" : "—"}
                    </span>
                    {s.note && <span style={{ fontSize: 12, color: "#475467" }}>{s.note}</span>}
                  </span>
                </div>
              );
            })}
          </div>
          {r.kind === "cash" ? (
            <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={label}>Advance asked for</span>
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
                      {typeLine(r) && <span style={{ fontSize: 12, fontWeight: 600, color: "#475467" }}>{typeLine(r)}</span>}
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
 * so the higher-ups can follow a whole region); one HQ skips that level.
 * SM/ZSM, GM and the CEO get Team (the seat's department) > employee
 * instead, the HQ shown beside each name (18 Nov 2026). */

/* the caller's place in the chain, from the requests they appear in */
function roleOf(data) {
  const me = data?.me;
  const count = {};
  for (const r of [...(data?.waiting || []), ...(data?.team || []), ...(data?.decided || [])])
    for (const s of r.steps) if (s.user === me) count[s.level] = (count[s.level] || 0) + 1;
  const level = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  // 18 Nov 2026: the chain ends with the CEO, who decides on batches
  return { level, ceo: level === "CEO", overview: !!data?.overview, approver: !!level };
}
/* the request's next approver is the CEO: approving SENDS it to him, in a batch */
export const toCeo = (r) => r.status === "waiting" && r.steps[r.step + 1]?.level === "CEO";
const clean = (r) => !serviceHeld(r) && (r.kind === "cash" || r.bills.every((b) => b.score != null && b.score >= 90));
// what a tick or "Approve all" may take: never a bill held for its doctor service
const pickable = (list) => list.filter((r) => !serviceHeld(r));
const sumOf = (rs) => rs.reduce((s, r) => s + r.amount, 0);
// desktop table pieces (18 Nov 2026)
const ageDays = (s) => { const d = new Date(String(s || "").replace(" ", "T")); return isNaN(d) ? null : Math.max(0, Math.floor((Date.now() - d) / 864e5)); };
const arrivedOf = (r) => (r.step > 0 && r.steps[r.step - 1]?.at) || r.created; // when it reached the current approver
const needsLook = (r) => r.kind === "bills" && r.bills.some((b) => b.score == null || b.score < 90);
const TH = { textAlign: "left", fontSize: 11.5, fontWeight: 600, color: "#667085", padding: "10px 12px", background: "#f9fafb", borderBottom: "1px solid #eaecf0", whiteSpace: "nowrap" };
const TD = { padding: "11px 12px", borderBottom: "1px solid #f2f4f7", verticalAlign: "middle" };
const TD2 = { ...TD, padding: "8px 12px", fontSize: 12.5 };
const CHK = { width: 16, height: 16, accentColor: "#2563eb", cursor: "pointer", display: "block", margin: "0 auto" };
const ROWBTN = { border: 0, background: "transparent", padding: 0, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#0b1220", fontSize: 13, textAlign: "left" };
const Caret = ({ open }) => (
  <span aria-hidden style={{ width: 18, height: 18, display: "grid", placeItems: "center", color: "#667085", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}><Icon d={IC.next} size={13} sw={2.4} /></span>
);

function QueueCard({ r, act, picked, onPick, onOpen, mine }) {
  const look = r.kind === "bills" && r.bills.some((b) => b.score != null && b.score < 90);
  const scored = r.kind === "bills" && r.bills.every((b) => b.score != null);
  return (
    <div style={{ ...card, padding: 0, display: "flex", alignItems: "stretch", boxShadow: act ? "0 0 0 1.5px #f79009" : card.boxShadow, overflow: "hidden" }}>
      {onPick && (
        <label style={{ display: "grid", placeItems: "center", minWidth: 44, minHeight: 44, padding: "0 0 0 6px", cursor: serviceHeld(r) ? "not-allowed" : "pointer" }} aria-label={`Select ${kindWord(r)}`} title={serviceHeld(r) ? HELD_NOTE : undefined}>
          <input type="checkbox" checked={picked} disabled={serviceHeld(r)} onChange={(e) => onPick(e.target.checked)} style={{ width: 18, height: 18, accentColor: "#2563eb" }} />
        </label>
      )}
      <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, padding: 14, display: "flex", flexDirection: "column", gap: 7, border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, ...ell }}>{kindWord(r)}{r.kind === "cash" && r.purpose ? ` · ${r.purpose}` : ""}</span>
          <span style={{ fontSize: 16, fontWeight: 700, ...tabNum }}>{inr(r.amount)}</span>
        </span>
        <span style={{ fontSize: 12, color: "#8a93a3", ...ell }}>Sent {when(r.created)}{r.resent ? <b style={{ color: "#b54708", fontWeight: 600 }}> · sent again</b> : null}</span>
        <TypeInfo r={r} small />
        {act && (look ? (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#b54708" }}>Needs a look — open the bill</span>
        ) : scored ? (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#067647" }}>Bill matches</span>
        ) : null)}
        <ChainTrack r={r} compact />
        {mine && (
          <span style={{ fontSize: 12, fontWeight: 600, color: mine.decision === "Rejected" ? "#b42318" : "#067647", ...ell }}>
            You {mine.decision === "Rejected" ? "sent it back" : "approved"}{mine.at ? ` · ${when(mine.at)}` : ""}{mine.decision === "Rejected" && mine.note ? ` — ${mine.note}` : ""}
          </span>
        )}
        {!act && (r.status === "waiting" ? <span style={{ fontSize: 12, color: "#8a93a3" }}>{waitingOn(r)}{since(r)}</span> : <StatusPill r={r} />)}
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
        <b style={{ flexShrink: 0, maxWidth: "100%", fontSize: hq ? 15 : 14, ...ell }}>{title}</b>
        {sub && <span style={{ minWidth: 0, fontSize: 12, color: "#8a93a3", ...ell }}>{sub}</span>}
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
    { k: "rejected", t: "Sent back", list: others.filter((r) => r.status === "rejected" && (reader || myStep(r))).sort(newest) },
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
  const shown = cur.list.filter((r) => !needle || `${r.employeeName} ${r.hq} ${r.team}`.toLowerCase().includes(needle));
  // HQ > employee > requests; SM/ZSM, GM and the CEO: Team > employee >
  // requests (18 Nov 2026 -- they look after whole teams, not one region)
  const byTeam = ["SM", "ZSM", "GM", "CEO"].includes(role.level);
  const NONE = byTeam ? "No team" : "No HQ";
  const hqs = [...shown.reduce((m, r) => {
    const h = (byTeam ? r.team : r.hq) || NONE;
    if (!m.has(h)) m.set(h, new Map());
    const ps = m.get(h);
    if (!ps.has(r.employee)) ps.set(r.employee, { id: r.employee, name: r.employeeName, hq: r.hq, list: [] });
    ps.get(r.employee).list.push(r);
    return m;
  }, new Map()).entries()]
    .map(([name, ps]) => ({ name, people: [...ps.values()].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => (a.name === NONE) - (b.name === NONE) || a.name.localeCompare(b.name));
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
    setBusy(`Approving ${ids.length}…`);
    // 18 Nov 2026: one server call -- what reaches the CEO goes to him as ONE batch
    try {
      const m = await approveSettlements(conn, ids);
      setPicked(new Set());
      if (m.skipped.length) onError?.(`${m.approved} approved; ${m.skipped.length} no longer waited on you`);
      else onDone?.(m.toCeo ? `${m.toCeo} ${m.toCeo === 1 ? "bill" : "bills"} sent to the CEO as one batch` : `${m.approved} ${m.approved === 1 ? "request" : "requests"} approved — on to the next level`);
    } catch (e) {
      onError?.(e.message);
    }
    setBusy("");
  };
  const grid = { display: "grid", gridTemplateColumns: desk ? "repeat(auto-fill,minmax(320px,1fr))" : "minmax(0,1fr)", gap: 8 };
  const EMPTY = { waiting: "Nothing waits on you.", moving: "Nothing you approved is still going up.", approved: "Nothing approved yet.", rejected: "Nothing sent back.", history: "You have not approved or sent back anything yet." };

  /* Desktop (18 Nov 2026, the user: "a business-level page, not cards"): a
     summary line, then ONE table -- Team (or HQ) > employee > bills -- with
     the selection in a bar that stays at the bottom. Phones keep the cards. */
  if (desk) {
    const people = new Set(shown.map((r) => r.employee)).size;
    const look = shown.filter(needsLook).length;
    const oldest = shown.reduce((m, r) => Math.max(m, ageDays(arrivedOf(r)) ?? 0), 0);
    const pickedAmt = sumOf(waiting.filter((r) => picked.has(r.id)));
    const allCeo = picked.size > 0 && [...picked].every((id) => toCeo(waiting.find((r) => r.id === id) || {}));
    const setMany = (list, on) => setPicked((s) => { const n = new Set(s); for (const r of list) { if (on && !serviceHeld(r)) n.add(r.id); else n.delete(r.id); } return n; });
    const COLS = cur.act ? 7 : 6;
    const figs = [
      [cur.act ? "Waiting on you" : cur.t, inr(sumOf(shown)), true],
      ["Bills", String(shown.length), false],
      ["People", `${people} in ${hqs.length} ${byTeam ? (hqs.length === 1 ? "team" : "teams") : hqs.length === 1 ? "HQ" : "HQs"}`, false],
      ...(cur.act ? [["Oldest waiting", oldest ? `${oldest} ${oldest === 1 ? "day" : "days"}` : "Today", false], ["Needs a look", String(look), false]] : []),
    ];
    return (
      <>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, borderBottom: "1px solid #e4e7ec" }}>
          <div role="tablist" style={{ display: "flex", gap: 20, flex: 1, minWidth: 0, overflowX: "auto" }}>
            {tabs.map((x) => (
              <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} onClick={() => { setTab(x.k); setPicked(new Set()); setFlip(new Set()); }}
                style={{ height: 40, padding: 0, border: 0, borderBottom: `2px solid ${tab === x.k ? "#2563eb" : "transparent"}`, marginBottom: -1, background: "transparent", fontSize: 13.5, fontWeight: 600, color: tab === x.k ? "#0b1220" : "#667085", cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 7 }}>
                {x.t}
                <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, display: "inline-grid", placeItems: "center", fontSize: 11.5, background: x.act && x.list.length ? "#fef0c7" : "#f2f4f7", color: x.act && x.list.length ? "#b54708" : "#667085", ...tabNum }}>{x.list.length}</span>
              </button>
            ))}
          </div>
          <label style={{ flex: "0 1 280px", display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 10px", marginBottom: 6, borderRadius: 8, background: "#fff", boxShadow: "0 0 0 1px #d0d5dd", color: "#667085" }}>
            <Icon d={IC.search} size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={byTeam ? "Search employee, team or HQ" : "Search employee or HQ"} aria-label="Search" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 13 }} />
          </label>
        </div>

        {cur.list.length > 0 && (
          <div style={{ ...card, borderRadius: 12, display: "grid", gridTemplateColumns: `1.3fr repeat(${figs.length - 1}, 1fr)` }}>
            {figs.map(([l, v, lead], i) => (
              <div key={l} style={{ padding: "14px 18px", borderLeft: i ? "1px solid #f2f4f7" : 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: lead ? "#1d4ed8" : "#667085" }}>{l}</span>
                <b style={{ fontSize: lead ? 24 : 18, fontWeight: 700, letterSpacing: "-0.01em", color: l === "Needs a look" && look ? "#b54708" : "#0b1220", ...tabNum }}>{v}</b>
              </div>
            ))}
          </div>
        )}

        {cur.act && cleanOnes.length > 1 && !picked.size && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#475467" }}>
            <span>{cleanOnes.length} of {shown.length} bills match their photo with no issues.</span>
            <button type="button" className="ec-link" disabled={!!busy} onClick={() => setPicked(new Set(cleanOnes.map((r) => r.id)))} style={{ border: 0, background: "transparent", padding: "4px 6px", borderRadius: 6, color: "#1d4ed8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Select them</button>
          </div>
        )}

        <div style={{ ...card, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {cur.act && <th style={{ ...TH, width: 44 }} />}
                <th style={TH}>{byTeam ? "Team / employee" : "HQ / employee"}</th>
                <th style={{ ...TH, textAlign: "right" }}>Bills</th>
                <th style={TH}>Bill check</th>
                <th style={TH}>{cur.act ? "Waiting" : cur.history ? "Your decision" : "Where it is"}</th>
                <th style={{ ...TH, textAlign: "right" }}>Amount</th>
                <th style={{ ...TH, width: cur.act ? 190 : 40 }} />
              </tr>
            </thead>
            <tbody>
              {!shown.length && <tr><td colSpan={COLS} style={{ padding: "36px 16px", textAlign: "center", color: "#5b6576", fontSize: 14 }}>{cur.list.length ? `No one matches “${q}”.` : EMPTY[cur.k]}</td></tr>}
              {hqs.map((h) => {
                const all = h.people.flatMap((p) => p.list);
                const gk = `h:${h.name}`;
                const gOpen = isOpen(gk, true);
                return [
                  <tr key={gk} style={{ background: "#f9fafb" }}>
                    {cur.act && <td style={{ ...TD, background: "#f9fafb" }}><input type="checkbox" disabled={!!busy} aria-label={`Select all of ${h.name}`} checked={pickable(all).length > 0 && pickable(all).every((r) => picked.has(r.id))} onChange={(e) => setMany(all, e.target.checked)} style={CHK} /></td>}
                    <td style={{ ...TD, background: "#f9fafb" }} colSpan={1}>
                      <button type="button" onClick={() => toggle(gk)} aria-expanded={gOpen} style={{ ...ROWBTN, fontSize: 13.5, fontWeight: 700 }}>
                        <Caret open={gOpen} />{h.name}<span style={{ fontWeight: 500, color: "#8a93a3", fontSize: 12.5 }}>{h.people.length} {h.people.length === 1 ? "person" : "people"}</span>
                      </button>
                    </td>
                    <td style={{ ...TD, background: "#f9fafb", textAlign: "right", fontWeight: 600, ...tabNum }}>{all.length}</td>
                    <td style={{ ...TD, background: "#f9fafb" }} colSpan={2} />
                    <td style={{ ...TD, background: "#f9fafb", textAlign: "right", fontWeight: 700, ...tabNum }}>{inr(sumOf(all))}</td>
                    <td style={{ ...TD, background: "#f9fafb" }} />
                  </tr>,
                  ...(!gOpen ? [] : h.people.flatMap((p) => {
                    const k = `p:${h.name}:${p.id}`;
                    const open = isOpen(k, nPeople === 1);
                    const looks = p.list.filter(needsLook).length;
                    const cash = p.list.filter((r) => r.kind === "cash").length;
                    const age = p.list.reduce((m, r) => Math.max(m, ageDays(arrivedOf(r)) ?? 0), 0);
                    const pl = pickable(p.list);
                    const sel = pl.length > 0 && pl.every((r) => picked.has(r.id));
                    const mine = cur.history ? myStep(p.list[0]) : null;
                    const lead = [
                      <tr key={k} style={{ background: sel && cur.act ? "#f5f8ff" : "#fff" }}>
                        {cur.act && <td style={TD}><input type="checkbox" disabled={!!busy} aria-label={`Select all of ${p.name}'s bills`} checked={sel} onChange={(e) => setMany(p.list, e.target.checked)} style={CHK} /></td>}
                        <td style={TD}>
                          <button type="button" onClick={() => toggle(k)} aria-expanded={open} style={{ ...ROWBTN, paddingLeft: 18 }}>
                            <Caret open={open} /><span style={{ fontWeight: 600 }}>{p.name}</span>{p.hq && byTeam ? <span style={{ color: "#8a93a3", fontWeight: 400 }}>{p.hq}</span> : null}
                          </button>
                        </td>
                        <td style={{ ...TD, textAlign: "right", ...tabNum }}>{p.list.length}</td>
                        <td style={TD}>
                          {looks ? <span style={{ color: "#b54708", fontWeight: 600 }}>{looks} {looks === 1 ? "needs" : "need"} a look</span>
                            : <span style={{ color: "#067647", fontWeight: 600 }}>{cash === p.list.length ? "Advance request" : "All bills match"}</span>}
                        </td>
                        <td style={{ ...TD, color: "#475467" }}>
                          {cur.act ? (age ? `${age} ${age === 1 ? "day" : "days"}` : "Today")
                            : mine ? <span style={{ color: mine.decision === "Rejected" ? "#b42318" : "#067647", fontWeight: 600 }}>{mine.decision === "Rejected" ? "Sent back" : "Approved"}{mine.at ? ` · ${when(mine.at)}` : ""}</span>
                            : p.list.length === 1 ? (p.list[0].status === "waiting" ? waitingOn(p.list[0]) + since(p.list[0]) : <StatusPill r={p.list[0]} />) : `${p.list.length} bills`}
                        </td>
                        <td style={{ ...TD, textAlign: "right", fontWeight: 700, ...tabNum }}>{inr(sumOf(p.list))}</td>
                        <td style={{ ...TD, textAlign: "right" }}>
                          {cur.act && (pl.length ? (
                            <button type="button" className={sure === p.id ? "ec-cta" : "ec-ghost"} disabled={!!busy}
                              onClick={() => (sure === p.id ? approveMany(pl.map((r) => r.id)) : setSure(p.id))}
                              onBlur={() => setSure((x) => (x === p.id ? "" : x))}
                              style={{ ...(sure === p.id ? btn.primary : btn.ghost), height: 32, padding: "0 12px", borderRadius: 8, fontSize: 12.5, whiteSpace: "nowrap" }}>
                              {sure === p.id ? `Confirm · ${inr(sumOf(pl))}` : pl.every(toCeo) ? (pl.length === 1 ? "Send to the CEO" : `Send ${pl.length} to the CEO`) : pl.length === 1 ? "Approve" : `Approve all ${pl.length}`}
                            </button>
                          ) : <span style={{ fontSize: 12, fontWeight: 600, color: "#b54708" }}>{HELD_NOTE}</span>)}
                        </td>
                      </tr>,
                    ];
                    if (!open) return lead;
                    return lead.concat(p.list.map((r) => {
                      const b = r.bills[0];
                      const m = cur.history ? myStep(r) : null;
                      return (
                        <tr key={r.id} style={{ background: "#fcfcfd" }}>
                          {cur.act && <td style={TD2}><input type="checkbox" disabled={!!busy || serviceHeld(r)} title={serviceHeld(r) ? HELD_NOTE : undefined} aria-label={`Select ${b?.title || kindWord(r)}`} checked={picked.has(r.id)} onChange={(e) => setMany([r], e.target.checked)} style={CHK} /></td>}
                          <td style={{ ...TD2, paddingLeft: 58 }}>
                            <button type="button" onClick={() => onOpen(r, !!cur.act)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", color: "#0b1220" }}>
                              <span style={{ fontWeight: 500 }}>{r.kind === "cash" ? `Advance request · ${r.purpose}` : b?.title || "Bill"}</span>
                              <span style={{ color: "#8a93a3" }}> · {b ? shortDate(b.date) : when(r.created)}{r.resent ? " · sent again" : ""}</span>
                            </button>
                            <TypeInfo r={r} small />
                          </td>
                          <td style={TD2} />
                          <td style={TD2}>{b ? <CheckBadge b={b} small /> : <span style={{ color: "#8a93a3" }}>No bill</span>}</td>
                          <td style={TD2}>{m ? <span style={{ color: m.decision === "Rejected" ? "#b42318" : "#067647", fontWeight: 600 }}>{m.decision === "Rejected" ? `Sent back${m.note ? ` — ${m.note}` : ""}` : "Approved"}</span> : <ChainTrack r={r} compact />}</td>
                          <td style={{ ...TD2, textAlign: "right", ...tabNum }}>{inr(r.amount)}</td>
                          <td style={{ ...TD2, textAlign: "right" }}>
                            <button type="button" className="ec-link" onClick={() => onOpen(r, !!cur.act)} style={{ border: 0, background: "transparent", padding: "4px 6px", borderRadius: 6, color: "#1d4ed8", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{cur.act ? "Open" : "View"}</button>
                          </td>
                        </tr>
                      );
                    }));
                  })),
                ];
              })}
            </tbody>
          </table>
        </div>

        {cur.act && picked.size > 0 && (
          <div style={{ position: "sticky", bottom: 12, zIndex: 5, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px 10px 18px", borderRadius: 12, background: "#0b1220", color: "#fff", boxShadow: "0 12px 30px -10px rgba(16,24,40,.45)" }}>
            <span style={{ flex: 1, fontSize: 13.5 }}><b>{picked.size} {picked.size === 1 ? "bill" : "bills"}</b> selected · <b style={tabNum}>{inr(pickedAmt)}</b>{allCeo ? <span style={{ color: "#98a2b3" }}> — goes to the CEO as one batch</span> : null}</span>
            <button type="button" disabled={!!busy} onClick={() => setPicked(new Set())} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid #344054", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Clear</button>
            <button type="button" className="ec-cta" disabled={!!busy} onClick={() => approveMany()} style={{ ...btn.primary, height: 34, borderRadius: 8, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
              {busy ? <><Spinner size={12} />{busy}</> : allCeo ? `Send ${picked.size} to the CEO` : `Approve ${picked.size}`}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "#e9ecf1", alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto" }}>
        {tabs.map((x) => (
          <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} onClick={() => { setTab(x.k); setPicked(new Set()); setFlip(new Set()); }}
            style={{ flex: "none", height: 44, padding: "0 12px", borderRadius: 9, border: 0, background: tab === x.k ? "#fff" : "transparent", boxShadow: tab === x.k ? "0 1px 2px rgba(16,24,40,.12)" : "none", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
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
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={byTeam ? "Search employee, team or HQ" : "Search employee or HQ"} aria-label={byTeam ? "Search employee, team or HQ" : "Search employee or HQ"} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 13.5 }} />
            </label>
          )}
          {cur.act && cleanOnes.length > 1 && (
            <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => setPicked(new Set(cleanOnes.map((r) => r.id)))} style={{ ...btn.ghost, height: 44, fontSize: 12.5 }}>
              Select {cleanOnes.length} clean
            </button>
          )}
          {cur.act && picked.size > 0 && (() => {
            // the same second tap as an employee's "Approve all" (23 Nov 2026)
            const ceoAll = [...picked].every((id) => toCeo(waiting.find((r) => r.id === id) || {}));
            const amt = inr(sumOf(waiting.filter((r) => picked.has(r.id))));
            return <>
              <button type="button" className="ec-cta" disabled={!!busy}
                onClick={() => (sure === "picked" ? approveMany() : setSure("picked"))}
                onBlur={() => setSure((x) => (x === "picked" ? "" : x))}
                style={{ ...btn.primary, height: 44, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {busy ? <><Spinner size={12} />{busy}</> : sure === "picked" ? `Tap again · ${ceoAll ? `send ${amt} to the CEO` : `approve ${amt}`}` : ceoAll ? `Send ${picked.size} to the CEO` : `Approve ${picked.size} selected`}
              </button>
              <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => { setPicked(new Set()); setSure(""); }} style={{ ...btn.ghost, height: 44, fontSize: 12.5 }}>Clear</button>
            </>;
          })()}
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
                    <label style={{ display: "grid", placeItems: "center", minWidth: 44, minHeight: 44, marginLeft: 4, cursor: "pointer" }} aria-label={`Select all of ${p.name}'s bills`}>
                      <input type="checkbox" disabled={!!busy || !pickable(p.list).length} checked={pickable(p.list).length > 0 && pickable(p.list).every((r) => picked.has(r.id))}
                        onChange={(e) => setPicked((s) => { const n = new Set(s); for (const r of p.list) { if (e.target.checked && !serviceHeld(r)) n.add(r.id); else n.delete(r.id); } return n; })}
                        style={{ width: 18, height: 18, accentColor: "#2563eb" }} />
                    </label>
                  )}
                  {/* on a phone the name keeps its room and the action button wraps
                      to its own row under it (20 Nov 2026: the button squeezed the
                      name away; 23 Nov 2026: always its own row, the name got "M..") */}
                  <div style={{ flex: desk ? 1 : cur.act ? "1 1 calc(100% - 52px)" : "1 1 170px", minWidth: desk ? 0 : cur.act ? 0 : 170 }}>
                    {/* one team / HQ only: its name is not repeated on each person on a phone */}
                    <Fold open={open} onClick={() => toggle(k)} title={p.name} sub={byTeam ? [hqs.length === 1 && h.name !== NONE && desk ? h.name : "", p.hq].filter(Boolean).join(" · ") : hqs.length === 1 && h.name !== NONE && desk ? h.name : ""}
                      n={p.list.length} amount={sumOf(p.list)} hot={cur.act} />
                  </div>
                  {cur.act && pickable(p.list).length > 0 && (() => {
                    const pl = pickable(p.list);
                    return (
                      <button type="button" className={sure === p.id ? "ec-cta" : "ec-ghost"} disabled={!!busy}
                        onClick={() => (sure === p.id ? approveMany(pl.map((r) => r.id)) : setSure(p.id))}
                        onBlur={() => setSure((x) => (x === p.id ? "" : x))}
                        style={{ ...(sure === p.id ? btn.primary : btn.ghost), height: 44, padding: "0 12px", fontSize: 12.5, whiteSpace: "nowrap", marginLeft: desk ? 0 : 12, marginBottom: desk ? 0 : 10 }}>
                        {sure === p.id
                          ? `Tap again: ${pl.every(toCeo) ? "send to the CEO" : "approve"} ${pl.length} · ${inr(sumOf(pl))}`
                          : pl.every(toCeo) ? `Send ${pl.length === 1 ? "" : `all ${pl.length} `}to the CEO` : pl.length === 1 ? "Approve" : `Approve all ${pl.length}`}
                      </button>
                    );
                  })()}
                </div>
                {open && (
                  <div style={{ ...grid, padding: "0 12px 12px" }}>
                    {p.list.map((r) => (
                      <QueueCard key={r.id} r={r} act={!!cur.act} picked={picked.has(r.id)} mine={cur.history ? myStep(r) : null}
                        onPick={cur.act ? (on) => setPicked((s) => { const n = new Set(s); if (on && !serviceHeld(r)) n.add(r.id); else n.delete(r.id); return n; }) : null}
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
  // a doctor service bill waits for its service (settlement_api decide)
  const held = serviceHeld(r);
  const go = async (decision) => {
    setError("");
    if (decision === "Approve" && held) return setError(`${HELD_NOTE}.`);
    if (decision === "Reject" && !note.trim()) return setError("Say why it is sent back — the requester sees it.");
    try {
      setBusy(decision === "Approve" ? "Approving…" : "Sending back…");
      // the request AFTER the decision: who it waits on now (an approver on
      // leave is skipped by the server, so r.steps[r.step + 1] may be wrong)
      const a = await decideSettlement(conn, r.id, decision, note.trim());
      const nx = a && a.status === "waiting" ? a.steps[a.step] : null;
      onDone(decision === "Approve"
        ? (a ? a.status === "approved" : last) ? `${r.employeeName}: approved and verified (${inr(r.amount)})`
          : `${r.employeeName}: approved — on to ${nx ? (nx.level === "CEO" ? "the CEO" : nx.name) : "the next approver"}`
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
        <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => setRejecting(true)} style={{ ...btn.ghost, flex: 1, color: "#b42318" }}>Send back</button>
        <button type="button" className="ec-cta" disabled={!!busy || held} aria-describedby={held ? "settle-held" : undefined} onClick={() => go("Approve")} style={{ ...btn.primary, flex: 1.4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, ...(held ? { opacity: 0.5, cursor: "not-allowed" } : null) }}>
          {busy ? <><Spinner />{busy}</> : toCeo(r) ? `Send ${inr(r.amount)} to the CEO` : `Approve ${inr(r.amount)}`}
        </button>
      </>}
    >
      <div style={{ padding: desk ? 18 : 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {canAct && held && (
          <Note tone="info" style={{ color: "#b54708", background: "#fffaeb" }}>
            <span id="settle-held">{HELD_NOTE}{r.service?.state ? ` — it is ${r.service.state.toLowerCase()}` : ""}. You can still send this bill back.</span>
          </Note>
        )}
        {typeLine(r) && (
          <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={label}>What it was for</span>
            <TypeInfo r={r} />
          </div>
        )}
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
          {canAct && last && <span style={{ fontSize: 12.5, fontWeight: 600, color: "#067647" }}>You are the last step: approving books {r.kind === "bills" ? "the bill" : "the advance"} for Accounts to pay.</span>}
        </div>
        {r.kind === "cash" ? (
          <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={label}>Advance asked for</span>
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
                    <CheckBadge b={b} small />
                    {/* what the bill check compared, in one plain line (23 Nov 2026) */}
                    {b.score != null && (b.reason || b.score >= 90) && (
                      <span style={{ fontSize: 12, color: b.score < 90 ? "#b54708" : "#475467", lineHeight: 1.4 }}>{b.reason ? proofOf(b.reason).text : "Total and date match the bill"}</span>
                    )}
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
