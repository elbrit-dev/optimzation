"use client";

import { useState } from "react";
import { decideSettlement, withdrawSettlement } from "./data/claimsApi";
import { inr, shortDate } from "./model";
import { BillThumb, IC, Icon, Note, RiskBadge, Sheet, Spinner, billFile, btn, card, ell, label, tabNum } from "./ui";

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
export const kindWord = (r) => (r.kind === "cash" ? "Cash request" : `${r.bills.length} ${r.bills.length === 1 ? "bill" : "bills"}`);
/* who it waits on, in words */
export const waitingOn = (r) => {
  const s = r.steps[r.step];
  return r.status === "waiting" && s ? `with ${s.level === "CEO" ? "the CEO" : s.name}${s.level && s.level !== "CEO" ? ` (${s.level})` : ""}` : "";
};

function StatusPill({ r }) {
  const s = STATUS[r.status] || STATUS.waiting;
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
        const tone = ok ? "#067647" : no ? "#b42318" : now ? "#b54708" : "#98a2b3";
        return (
          <li key={i} aria-current={now ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: 4 }} title={[s.name, s.decision, s.at ? when(s.at) : "", s.note].filter(Boolean).join(" · ")}>
            {i > 0 && <span aria-hidden style={{ color: "#c0c5cf", fontSize: 12 }}>›</span>}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: compact ? "2px 7px" : "4px 9px", borderRadius: 99, fontSize: compact ? 11 : 12, fontWeight: 700, color: tone, background: ok ? "#ecfdf3" : no ? "#fef3f2" : now ? "#fffaeb" : "#f2f4f7", boxShadow: now ? "0 0 0 1.5px #f79009" : "none", whiteSpace: "nowrap" }}>
              {ok ? <Icon d={IC.check} size={11} sw={3} /> : no ? <Icon d={IC.x} size={11} sw={3} /> : now ? <span style={{ width: 6, height: 6, borderRadius: 99, background: "#f79009" }} /> : null}
              {s.level || "Approver"}{!compact && <span style={{ fontWeight: 500, color: "#475467" }}> {String(s.name || "").split(" ")[0]}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* On the Settlements page: the checked bills not sent yet, and the button. */
export function SendBar({ bills, chain, busy, onSend }) {
  if (!bills.length) return null;
  const total = bills.reduce((s, l) => s + l.amount, 0);
  const back = bills.filter((l) => l.review).length;
  return (
    <section style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 0 0 1.5px #0e7490" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{bills.length} checked {bills.length === 1 ? "bill" : "bills"} to send</span>
        <b style={{ fontSize: 18, ...tabNum }}>{inr(total)}</b>
      </div>
      {back > 0 && <span style={{ fontSize: 12.5, color: "#b42318" }}>{back === 1 ? "1 bill was" : `${back} bills were`} sent back — fix or remove {back === 1 ? "it" : "them"} if needed, then send again.</span>}
      {chain?.length > 0 && (
        <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#5b6576" }}>Goes to, one after the other:</span>
          <ChainTrack steps={chain.map((c) => ({ ...c, decision: "" }))} r={null} />
        </span>
      )}
      <button type="button" className="ec-cta" disabled={busy} onClick={onSend} style={{ ...btn.primary, height: 48, borderRadius: 14, fontSize: 15.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {busy ? <><Spinner size={14} />Sending…</> : <><Icon d={IC.arrow} size={18} />Send for approval</>}
      </button>
    </section>
  );
}

/* The requester's requests, newest first: where each is, and why one came back. */
export function MyRequests({ conn, requests, onChanged }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const shown = requests.filter((r) => r.status !== "withdrawn").slice(0, 8);
  if (!shown.length) return null;
  const takeBack = async (r) => {
    setBusy(r.id);
    setErr("");
    try {
      await withdrawSettlement(conn, r.id);
      onChanged?.(`${kindWord(r)} taken back`);
    } catch (e) {
      setErr(e.message);
    }
    setBusy("");
  };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: "#5b6576" }}>Your requests</span>
      {err && <Note>{err}</Note>}
      {shown.map((r) => (
        <div key={r.id} style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              <b style={{ fontSize: 14.5, ...ell }}>{kindWord(r)}{r.kind === "cash" && r.purpose ? ` · ${r.purpose}` : ""}</b>
              <span style={{ fontSize: 12, color: "#8a93a3" }}>{r.id} · sent {when(r.created)}{waitingOn(r) ? ` · ${waitingOn(r)}` : ""}</span>
            </span>
            <b style={{ fontSize: 16, ...tabNum }}>{inr(r.amount)}</b>
            <StatusPill r={r} />
          </div>
          <ChainTrack r={r} />
          {r.status === "rejected" && r.note && (
            <span style={{ fontSize: 13, color: "#b42318", padding: "8px 10px", borderRadius: 10, background: "#fef3f2" }}>
              Sent back by {r.steps.find((s) => s.decision === "Rejected")?.name || "an approver"}: {r.note}
              {r.kind === "bills" ? " — the bills are back with you to fix and send again." : ""}
            </span>
          )}
          {r.status === "approved" && <span style={{ fontSize: 12.5, color: "#067647" }}>Approved by the CEO — {r.kind === "bills" ? "the bills are verified." : "verified."}</span>}
          {r.status === "waiting" && r.step === 0 && (
            <button type="button" className="ec-ghost" disabled={busy === r.id} onClick={() => takeBack(r)} style={{ ...btn.ghost, alignSelf: "flex-start", height: 34, fontSize: 12.5 }}>
              {busy === r.id ? "Taking back…" : "Take back"}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

/* The approver's tab, by role (16 Nov 2026):
 *   the CEO       "Final approval" -- approving verifies
 *   ABM .. GM     their own step ("RBM approval"), what goes on after them
 *   IT overview   every request, read-only (and their own step, if any)
 * A role card with the numbers, then For you / Team / Decided (the overview:
 * In approval / Verified / Sent back), a search, requests grouped by person,
 * and -- on For you -- "Select clean" (every bill 90+, or cash) to approve
 * many at once. */

/* the caller's place in the chain, from the requests they appear in */
function roleOf(data) {
  const me = data?.me;
  const count = {};
  for (const r of [...(data?.waiting || []), ...(data?.team || []), ...(data?.decided || [])])
    for (const s of r.steps) if (s.user === me) count[s.level] = (count[s.level] || 0) + 1;
  const level = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  return { level, ceo: level === "CEO", overview: !!data?.overview, approver: !!level };
}
const clean = (r) => r.kind === "cash" || r.bills.every((b) => b.score != null && b.score >= 90);
const sumOf = (rs) => rs.reduce((s, r) => s + r.amount, 0);
const thisMonth = (s) => String(s || "").slice(0, 7) === new Date().toISOString().slice(0, 7);

function QueueCard({ r, act, picked, onPick, onOpen }) {
  const low = r.kind === "bills" ? r.bills.filter((b) => b.score != null && b.score < 90).length : 0;
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
        <span style={{ fontSize: 12, color: "#8a93a3", ...ell }}>{r.id} · sent {when(r.created)}</span>
        {low > 0 ? (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#b54708" }}>{low} {low === 1 ? "bill" : "bills"} below the AI bar — open to look</span>
        ) : r.kind === "bills" ? (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#067647" }}>Every bill matched (AI 90+)</span>
        ) : null}
        <ChainTrack r={r} compact />
        {!act && (r.status === "waiting" ? <span style={{ fontSize: 12, color: "#8a93a3" }}>{waitingOn(r)}</span> : <StatusPill r={r} />)}
      </button>
    </div>
  );
}

function Stat({ k, n, amount, tone }) {
  return (
    <span style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 2, padding: "10px 12px", borderRadius: 12, background: "#f7f8fa" }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "#5b6576", ...ell }}>{k}</span>
      <b style={{ fontSize: 20, color: tone || "#0b1220", ...tabNum }}>{n}</b>
      <span style={{ fontSize: 11.5, color: "#8a93a3", ...tabNum }}>{inr(amount)}</span>
    </span>
  );
}

export function SettleQueue({ conn, data, desk, onOpen, onDone, onError }) {
  const role = roleOf(data);
  const { waiting = [], team = [], decided = [] } = data || {};
  // the overview sees everyone's: split by where each request is
  const all = role.overview ? [...waiting, ...team, ...decided] : [];
  const tabs = role.overview && !role.approver
    ? [
        { k: "open", t: "In approval", list: all.filter((r) => r.status === "waiting") },
        { k: "verified", t: "Verified", list: all.filter((r) => r.status === "approved") },
        { k: "back", t: "Sent back", list: all.filter((r) => r.status === "rejected") },
      ]
    : [
        { k: "mine", t: "For you", list: waiting, act: true },
        { k: "team", t: role.ceo ? "Coming to you" : "Your team", list: team },
        { k: "decided", t: "Decided", list: decided },
      ];
  const [tab, setTab] = useState(() => (tabs[0].list.length || !tabs[1].list.length ? tabs[0].k : tabs[1].k));
  const cur = tabs.find((x) => x.k === tab) || tabs[0];
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState("");
  const shown = cur.list.filter((r) => !q.trim() || r.employeeName.toLowerCase().includes(q.trim().toLowerCase()));
  // person -> their requests, the most waiting first
  const people = Object.values(shown.reduce((m, r) => {
    (m[r.employee] = m[r.employee] || { id: r.employee, name: r.employeeName, list: [] }).list.push(r);
    return m;
  }, {})).sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name));
  const cleanOnes = cur.act ? shown.filter(clean) : [];
  const approveMany = async () => {
    const ids = [...picked];
    setBusy(`Approving 0 of ${ids.length}…`);
    let ok = 0;
    const failed = [];
    for (const id of ids) {
      try {
        await decideSettlement(conn, id, "Approve", "");
        ok += 1;
        setBusy(`Approving ${ok} of ${ids.length}…`);
      } catch (e) {
        failed.push(`${id}: ${e.message}`);
      }
    }
    setBusy("");
    setPicked(new Set());
    if (failed.length) onError?.(`${ok} approved, ${failed.length} failed — ${failed[0]}`);
    else onDone?.(role.ceo ? `${ok} ${ok === 1 ? "request" : "requests"} approved and verified` : `${ok} ${ok === 1 ? "request" : "requests"} approved — on to the next level`);
  };
  const verifiedMonth = [...decided, ...team].filter((r) => r.status === "approved" && thisMonth(r.decidedOn));
  const grid = { display: "grid", gridTemplateColumns: desk ? "repeat(auto-fill,minmax(320px,1fr))" : "minmax(0,1fr)", gap: 8 };

  return (
    <>
      <section style={{ ...card, padding: desk ? "16px 18px" : 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <b style={{ fontSize: 16 }}>
            {role.ceo ? "Final approval" : role.approver ? `${role.level} approval` : "Settlement overview"}
          </b>
          <span style={{ fontSize: 13, color: "#5b6576", lineHeight: 1.45 }}>
            {role.ceo
              ? "You are the last step. Your approval verifies the request — nothing goes further."
              : role.approver
                ? "You approve the requests of your team at your step; after you, each goes on to the next level, up to the CEO, whose approval verifies it."
                : "Every settlement request, wherever it is in its chain. Read-only — only the person it waits on can approve it."}
          </span>
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          {role.overview && !role.approver ? <>
            <Stat k="In approval" n={tabs[0].list.length} amount={sumOf(tabs[0].list)} tone="#b54708" />
            <Stat k="Verified" n={tabs[1].list.length} amount={sumOf(tabs[1].list)} tone="#067647" />
            <Stat k="Sent back" n={tabs[2].list.length} amount={sumOf(tabs[2].list)} tone="#b42318" />
          </> : <>
            <Stat k="Waiting for you" n={waiting.length} amount={sumOf(waiting)} tone={waiting.length ? "#b54708" : "#067647"} />
            <Stat k={role.ceo ? "Coming to you" : "In your team"} n={team.length} amount={sumOf(team)} />
            <Stat k={`Verified · ${new Date().toLocaleString("en-IN", { month: "short" })}`} n={verifiedMonth.length} amount={sumOf(verifiedMonth)} tone="#067647" />
          </>}
        </span>
      </section>

      <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "#e9ecf1", alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto" }}>
        {tabs.map((x) => (
          <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} onClick={() => { setTab(x.k); setPicked(new Set()); }}
            style={{ height: 34, padding: "0 12px", borderRadius: 9, border: 0, background: tab === x.k ? "#fff" : "transparent", boxShadow: tab === x.k ? "0 1px 2px rgba(16,24,40,.12)" : "none", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            {x.t} <span style={{ color: x.act && x.list.length ? "#b54708" : "#8a93a3" }}>{x.list.length}</span>
          </button>
        ))}
      </div>

      {cur.list.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label style={{ flex: desk ? "0 1 300px" : "1 1 100%", display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: 10, background: "#fff", boxShadow: "0 0 0 1px #e4e7ec" }}>
            <Icon d={IC.search} size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee" aria-label="Search employee" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 13.5 }} />
          </label>
          {cur.act && cleanOnes.length > 0 && (
            <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => setPicked(new Set(cleanOnes.map((r) => r.id)))} style={{ ...btn.ghost, height: 36, fontSize: 12.5 }}>
              Select {cleanOnes.length} clean
            </button>
          )}
          {cur.act && picked.size > 0 && <>
            <button type="button" className="ec-cta" disabled={!!busy} onClick={approveMany} style={{ ...btn.primary, height: 36, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
              {busy ? <><Spinner size={12} />{busy}</> : `${role.ceo ? "Approve & verify" : "Approve"} ${picked.size} selected`}
            </button>
            <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => setPicked(new Set())} style={{ ...btn.ghost, height: 36, fontSize: 12.5 }}>Clear</button>
          </>}
        </div>
      )}

      {!cur.list.length && (
        <div style={{ ...card, padding: "28px 16px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>
          {cur.act ? "Nothing waits on you." : cur.k === "team" ? (role.ceo ? "Nothing on its way to you." : "Nothing from your team in approval.") : "Nothing here yet."}
        </div>
      )}
      {cur.list.length > 0 && !people.length && <div style={{ ...card, padding: "20px 16px", textAlign: "center", fontSize: 13.5, color: "#5b6576" }}>No one matches &ldquo;{q}&rdquo;.</div>}

      {people.map((p) => (
        <section key={p.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "2px 2px 0" }}>
            <b style={{ flex: 1, minWidth: 0, fontSize: 14, ...ell }}>{p.name}</b>
            <span style={{ fontSize: 12, color: "#8a93a3", ...tabNum }}>{p.list.length} {p.list.length === 1 ? "request" : "requests"} · {inr(sumOf(p.list))}</span>
          </span>
          <div style={grid}>
            {p.list.map((r) => (
              <QueueCard key={r.id} r={r} act={!!cur.act} picked={picked.has(r.id)}
                onPick={cur.act ? (on) => setPicked((s) => { const n = new Set(s); if (on) n.add(r.id); else n.delete(r.id); return n; }) : null}
                onOpen={() => onOpen(r, !!cur.act)} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

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
          {busy ? <><Spinner />{busy}</> : last ? `Approve & verify ${inr(r.amount)}` : `Approve ${inr(r.amount)}`}
        </button>
      </>}
    >
      <div style={{ padding: desk ? 18 : 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={label}>Approval chain</span>
          <ChainTrack r={r} />
          {r.steps.filter((s) => s.decision).map((s, i) => (
            <span key={i} style={{ fontSize: 12.5, color: "#475467" }}>
              <b>{s.name}</b> ({s.level}) {s.decision === "Approved" ? "approved" : "sent it back"} · {when(s.at)}{s.note ? ` — ${s.note}` : ""}
            </span>
          ))}
          {canAct && last && <span style={{ fontSize: 12.5, fontWeight: 600, color: "#067647" }}>You are the last step: approving verifies {r.kind === "bills" ? "the bills" : "the request"}.</span>}
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
                    {b.score != null && b.score < 90 && b.reason && <span style={{ fontSize: 12, color: "#b54708", lineHeight: 1.4 }}>{b.reason}</span>}
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
