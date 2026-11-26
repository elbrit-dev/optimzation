"use client";

/* The CEO's batches (18 Nov 2026, management: the chain ends with the CEO,
 * who decides on BATCHES). The approver right before him -- the GM; the SM
 * where no GM is above -- sends the bills they approve as one batch per
 * send. His approval is final: the bills are booked in the ledger and
 * Accounts pays them with no further approval.
 *
 * How the CEO decides (18 Nov 2026, the user: "full at once, many batches at
 * once, a single batch, specific things in it, reject where needed"):
 *   - the list: tick several batches -> approve them all in one go
 *   - a batch: approve all of it; or tick a team, an employee or single bills
 *     -> approve just those, or send just those back with one reason (the rep
 *     sees it); the rest stays in the batch for later
 * Server: approve_many (any bills), decide (one bill), decide_batch (a whole
 * batch) of the "Settlement API". */

import { useState } from "react";
import { approveCeoBatch, approveSettlements, decideSettlement } from "./data/claimsApi";
import { inr, shortDate } from "./model";
import { BillThumb, FilePreview, IC, Icon, Note, Sheet, Spinner, billFile, btn, card, ell, label, tabNum } from "./ui";
import { CheckBadge, DupTag, HELD_NOTE, TypeInfo, kindWord, serviceHeld } from "./settlement";

const when = (s) => {
  const d = new Date(String(s || "").replace(" ", "T"));
  return isNaN(d) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};
const waitingIn = (b) => b.requests.filter((r) => r.status === "waiting");
const people = (rs) => new Set(rs.map((r) => r.employee)).size;
const sum = (rs) => rs.reduce((s, r) => s + r.amount, 0);
const looks = (rs) => rs.filter((r) => r.kind === "bills" && r.bills.some((x) => x.score == null || x.score < 90)).length;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const TH = { textAlign: "left", fontSize: 11.5, fontWeight: 600, color: "#667085", padding: "10px 12px", background: "#f9fafb", borderBottom: "1px solid #eaecf0", whiteSpace: "nowrap" };
const TD = { padding: "12px", borderBottom: "1px solid #f2f4f7", verticalAlign: "middle" };
const CHK = { width: 17, height: 17, accentColor: "#2563eb", cursor: "pointer", flex: "none", margin: 0 };

/* a tick box for a group: ticked when all are, a dash when some are */
function GroupBox({ ids, picked, setPicked, disabled, label: aria }) {
  const n = ids.filter((id) => picked.has(id)).length;
  return (
    <input type="checkbox" aria-label={aria} disabled={disabled || !ids.length} checked={!!ids.length && n === ids.length}
      ref={(el) => { if (el) el.indeterminate = n > 0 && n < ids.length; }}
      onChange={(e) => setPicked((s) => { const x = new Set(s); for (const id of ids) { if (e.target.checked) x.add(id); else x.delete(id); } return x; })}
      style={CHK} />
  );
}

/* the bar that stays at the bottom while something is ticked */
function PickBar({ text, children }) {
  return (
    <div style={{ position: "sticky", bottom: 12, zIndex: 5, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px 10px 18px", borderRadius: 12, background: "#0b1220", color: "#fff", boxShadow: "0 12px 30px -10px rgba(16,24,40,.45)" }}>
      <span style={{ flex: 1, minWidth: 160, fontSize: 13.5 }}>{text}</span>
      {children}
    </div>
  );
}
const darkGhost = { height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid #344054", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };

export function CeoBatches({ conn, data, desk, onDone, onError, onChanged }) {
  const [open, setOpen] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [sel, setSel] = useState(() => new Set()); // batches ticked in the list
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState("");
  const waiting = data.batches.filter((b) => b.status === "waiting");
  const done = data.batches.filter((b) => b.status !== "waiting");
  const chosen = waiting.filter((b) => sel.has(b.id));
  const chosenReqs = chosen.flatMap(waitingIn);
  const teamsOf = (rs) => new Set(rs.map((r) => r.team || "No team")).size;

  // several whole batches in one go
  const approveBatches = async () => {
    setSure(false);
    setBusy(`Approving ${plural(chosenReqs.length, "bill")}…`);
    try {
      const m = await approveSettlements(conn, chosenReqs.filter((r) => !serviceHeld(r)).map((r) => r.id));
      setSel(new Set());
      onDone?.(`Approved ${plural(m.approved, "bill")} in ${plural(chosen.length, "batch")}`.replace("batchs", "batches") + ` · ${inr(sum(chosenReqs))} — booked; Accounts pays them`
        + (m.skipped.length ? ` (${m.skipped.length} no longer waited on you)` : ""));
    } catch (e) {
      onError?.(e.message);
    }
    setBusy("");
  };

  const listBar = sel.size > 0 && (
    <PickBar text={<><b>{plural(chosen.length, "batch").replace("batchs", "batches")}</b> · {plural(chosenReqs.length, "bill")} · <b style={tabNum}>{inr(sum(chosenReqs))}</b>{looks(chosenReqs) ? <span style={{ color: "#fec84b" }}> · {looks(chosenReqs)} need a look</span> : null}</>}>
      <button type="button" disabled={!!busy} onClick={() => { setSel(new Set()); setSure(false); }} style={darkGhost}>Clear</button>
      <button type="button" className="ec-cta" disabled={!!busy} onClick={() => (sure ? approveBatches() : setSure(true))} onBlur={() => setSure(false)}
        style={{ ...btn.primary, height: 34, borderRadius: 8, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
        {busy ? <><Spinner size={12} />{busy}</> : sure ? `Tap again · approve ${inr(sum(chosenReqs))}`
          : chosenReqs.length === 1 ? `Approve 1 bill · ${inr(sum(chosenReqs))}` : `Approve ${chosen.length === 1 ? "this batch" : `${chosen.length} batches`} · ${inr(sum(chosenReqs))}`}
      </button>
      {sure && !busy && <span style={{ flexBasis: "100%", fontSize: 12, color: "#d0d5dd" }}>This books the bills for Accounts to pay — it cannot be undone.</span>}
    </PickBar>
  );
  const sheet = open && <BatchSheet conn={conn} batch={open} desk={desk} onClose={(changed) => { setOpen(null); if (changed) onChanged?.(); }}
    onDone={(m) => { setOpen(null); onDone?.(m); }} onError={onError} />;
  const empty = <div style={{ ...card, borderRadius: 12, padding: "28px 16px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>No batch waits on you.</div>;

  // desktop: the batches as one table
  if (desk) {
    const tableOf = (list, live) => (
      <div style={{ ...card, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            {live && <th style={{ ...TH, width: 44 }}><GroupBox ids={list.map((b) => b.id)} picked={sel} setPicked={setSel} disabled={!!busy} label="Tick every batch" /></th>}
            {["Batch", "Sent by", "Sent", "Bills", "People", "Teams", "Needs a look", "Amount", ""].map((h, i) => <th key={i} style={{ ...TH, textAlign: i >= 3 && i !== 8 ? "right" : "left" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {list.map((b) => {
              const rs = live ? waitingIn(b) : b.requests;
              const lk = looks(rs);
              const on = sel.has(b.id);
              return (
                <tr key={b.id} onClick={() => setOpen(b)} style={{ cursor: "pointer", background: on ? "#f5f8ff" : undefined }} className="ec-row">
                  {live && <td style={TD} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Tick ${b.id}`} disabled={!!busy} checked={on} style={CHK}
                      onChange={(e) => setSel((s) => { const x = new Set(s); if (e.target.checked) x.add(b.id); else x.delete(b.id); return x; })} />
                  </td>}
                  <td style={{ ...TD, fontWeight: 600 }}>{b.id}</td>
                  <td style={TD}>{b.by}</td>
                  <td style={{ ...TD, color: "#475467" }}>{when(b.created)}</td>
                  <td style={{ ...TD, textAlign: "right", ...tabNum }}>{rs.length}</td>
                  <td style={{ ...TD, textAlign: "right", ...tabNum }}>{people(rs)}</td>
                  <td style={{ ...TD, textAlign: "right", ...tabNum }}>{teamsOf(rs)}</td>
                  <td style={{ ...TD, textAlign: "right", color: lk ? "#b54708" : "#98a2b3", fontWeight: lk ? 600 : 400, ...tabNum }}>{lk || "–"}</td>
                  <td style={{ ...TD, textAlign: "right", fontWeight: 700, ...tabNum }}>{inr(sum(rs))}</td>
                  <td style={{ ...TD, textAlign: "right" }}>
                    {live
                      ? <button type="button" className="ec-ghost" onClick={(e) => { e.stopPropagation(); setOpen(b); }} style={{ ...btn.ghost, height: 32, padding: "0 14px", borderRadius: 8, fontSize: 12.5 }}>Open</button>
                      : <span style={{ fontSize: 12.5, color: "#067647", fontWeight: 600 }}>Decided {when(b.decidedOn)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
    const wReqs = waiting.flatMap(waitingIn);
    const figs = [["Waiting for your approval", inr(sum(wReqs)), true], ["Batches", String(waiting.length)], ["Bills", String(wReqs.length)], ["Needs a look", String(looks(wReqs))]];
    return (
      <>
        <div style={{ ...card, borderRadius: 12, display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}>
          {figs.map(([l, v, lead], i) => (
            <div key={l} style={{ padding: "14px 18px", borderLeft: i ? "1px solid #f2f4f7" : 0, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: lead ? "#1d4ed8" : "#667085" }}>{l}</span>
              <b style={{ fontSize: lead ? 24 : 18, fontWeight: 700, letterSpacing: "-0.01em", color: l === "Needs a look" && v !== "0" ? "#b54708" : "#0b1220", ...tabNum }}>{v}</b>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
          <b style={{ fontSize: 14 }}>Waiting for you</b>
          {waiting.length > 1 && <span style={{ fontSize: 12.5, color: "#667085" }}>Tick batches to approve several at once, or open one to decide team by team.</span>}
        </div>
        {waiting.length ? tableOf(waiting, true) : empty}
        {listBar}
        {done.length > 0 && <>
          <button type="button" onClick={() => setShowDone((v) => !v)} style={{ alignSelf: "flex-start", border: 0, background: "transparent", padding: "6px 0 0", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#0b1220" }}>
            Decided <span style={{ color: "#8a93a3", fontWeight: 500, fontSize: 13 }}>· last 30 days · {showDone ? "hide" : "show"}</span>
          </button>
          {showDone && tableOf(done, false)}
        </>}
        {sheet}
      </>
    );
  }

  // phone: one card per batch, with a tick box
  const cardOf = (b, live) => {
    const rs = live ? waitingIn(b) : b.requests;
    const on = sel.has(b.id);
    return (
      <div key={b.id} style={{ ...card, display: "flex", alignItems: "stretch", overflow: "hidden", boxShadow: on ? "0 0 0 1.5px #2563eb" : live ? "0 0 0 1.5px #f79009" : card.boxShadow }}>
        {live && (
          <label style={{ display: "grid", placeItems: "center", padding: "0 4px 0 14px", cursor: "pointer" }} aria-label={`Tick ${b.id}`}>
            <input type="checkbox" disabled={!!busy} checked={on} style={CHK} onChange={(e) => setSel((s) => { const x = new Set(s); if (e.target.checked) x.add(b.id); else x.delete(b.id); return x; })} />
          </label>
        )}
        <button type="button" onClick={() => setOpen(b)} style={{ flex: 1, minWidth: 0, padding: 14, display: "flex", flexDirection: "column", gap: 6, border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%" }}>
            <b style={{ flex: 1, minWidth: 0, fontSize: 14.5, ...ell }}>From {b.by}</b>
            <b style={{ fontSize: 16, ...tabNum }}>{inr(sum(rs))}</b>
          </span>
          <span style={{ fontSize: 12.5, color: "#5b6576" }}>
            {live ? `${plural(rs.length, "bill")} · ${people(rs)} ${people(rs) === 1 ? "person" : "people"} · ${teamsOf(rs)} ${teamsOf(rs) === 1 ? "team" : "teams"}${looks(rs) ? ` · ${looks(rs)} need a look` : ""}` : `${plural(b.count, "bill")} · decided ${when(b.decidedOn)}`}
          </span>
          <span style={{ fontSize: 12, color: "#8a93a3" }}>{b.id} · sent {when(b.created)}</span>
        </button>
      </div>
    );
  };
  return (
    <>
      {!waiting.length && empty}
      {waiting.length > 0 && (
        <span style={{ fontSize: 13, color: "#5b6576" }}>
          {plural(waiting.length, "batch").replace("batchs", "batches")} · {inr(sum(waiting.flatMap(waitingIn)))} to approve
        </span>
      )}
      {waiting.length > 0 && <div style={{ display: "grid", gap: 8 }}>{waiting.map((b) => cardOf(b, true))}</div>}
      {listBar}
      {done.length > 0 && (
        <>
          <button type="button" onClick={() => setShowDone((v) => !v)} style={{ alignSelf: "flex-start", border: 0, background: "transparent", padding: "6px 2px 0", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "#344054" }}>
            {showDone ? "Hide" : "Show"} {done.length} decided <span style={{ color: "#8a93a3", fontWeight: 500 }}>· last 30 days</span>
          </button>
          {showDone && <div style={{ display: "grid", gap: 8 }}>{done.map((b) => cardOf(b, false))}</div>}
        </>
      )}
      {sheet}
    </>
  );
}

function BatchSheet({ conn, batch, desk, onClose, onDone, onError }) {
  const [reqs, setReqs] = useState(batch.requests);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [back, setBack] = useState(null); // [ids] being sent back
  const [note, setNote] = useState("");
  const [sure, setSure] = useState("");
  const [changed, setChanged] = useState(false);
  const [preview, setPreview] = useState(null);
  const live = batch.status === "waiting";
  const w = reqs.filter((r) => r.status === "waiting");
  const pickedReqs = w.filter((r) => picked.has(r.id));
  const backReqs = back ? reqs.filter((r) => back.includes(r.id)) : [];
  const live$ = (rs) => sum(rs.filter((r) => r.status !== "rejected"));
  // Team (the seat's department) > employee (18 Nov 2026)
  const byTeam = [...reqs.reduce((m, r) => {
    const t = r.team || "No team";
    if (!m.has(t)) m.set(t, new Map());
    const ps = m.get(t);
    if (!ps.has(r.employee)) ps.set(r.employee, { id: r.employee, name: r.employeeName, hq: r.hq, list: [] });
    ps.get(r.employee).list.push(r);
    return m;
  }, new Map()).entries()]
    .map(([name, ps]) => ({ name, people: [...ps.values()].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => (a.name === "No team") - (b.name === "No team") || a.name.localeCompare(b.name));
  const waitIds = (rs) => rs.filter((r) => r.status === "waiting" && !serviceHeld(r)).map((r) => r.id);
  const close = () => (busy ? null : onClose(changed));
  // what is left after a partial decision: the batch stays open for the rest
  const after = (next, msg) => {
    setReqs(next);
    setPicked(new Set());
    setChanged(true);
    if (!next.some((r) => r.status === "waiting")) onDone(msg);
    else setInfo(msg);
  };

  const sendBack = async () => {
    if (!note.trim()) return setError("Say why — the employee sees it and can fix and send it again.");
    setError("");
    const ids = [...back];
    let next = reqs;
    let n = 0;
    for (const id of ids) {
      setBusy(`Sending back ${n + 1} of ${ids.length}…`);
      try {
        await decideSettlement(conn, id, "Reject", note.trim());
        next = next.map((r) => (r.id === id ? { ...r, status: "rejected", note: note.trim() } : r));
        n += 1;
      } catch (e) {
        setError(`${n} sent back; stopped at one bill: ${e.message}`);
        break;
      }
    }
    setBusy("");
    setBack(null);
    setNote("");
    if (n) after(next, `${plural(n, "bill")} sent back to the employee${n === 1 ? "" : "s"}.`);
  };
  const approvePicked = async () => {
    setSure("");
    setError("");
    const rs = pickedReqs;
    setBusy(`Approving ${plural(rs.length, "bill")}…`);
    try {
      const m = await approveSettlements(conn, rs.map((r) => r.id));
      const skip = new Set(m.skipped);
      const next = reqs.map((r) => (picked.has(r.id) && !skip.has(r.id) ? { ...r, status: "approved" } : r));
      after(next, `Approved ${plural(m.approved, "bill")} · ${inr(sum(rs.filter((r) => !skip.has(r.id))))} — booked; Accounts pays them.`);
    } catch (e) {
      setError(e.message);
      onError?.(e.message);
    }
    setBusy("");
  };
  const approveAll = async () => {
    setSure("");
    setError("");
    setBusy("Approving…");
    try {
      const m = await approveCeoBatch(conn, batch.id);
      onDone(`Approved ${plural(m.approved, "bill")} · ${inr(m.amount)} — booked; Accounts pays them`);
    } catch (e) {
      setError(e.message);
      onError?.(e.message);
      setBusy("");
    }
  };

  // the approve buttons ask for a second tap: the CEO's approval books the bills
  const two = (key, run, idle, armed) => (
    <button type="button" className="ec-cta" disabled={!!busy}
      onClick={() => (sure === key ? run() : setSure(key))} onBlur={() => setSure((x) => (x === key ? "" : x))}
      style={{ ...btn.primary, flex: 1.4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {busy ? <><Spinner />{busy}</> : sure === key ? armed : idle}
    </button>
  );
  const footer = !live || !w.length ? <button type="button" className="ec-ghost" onClick={close} style={{ ...btn.ghost, flex: 1 }}>Close</button>
    : back ? <>
      <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => { setBack(null); setError(""); }} style={{ ...btn.ghost, flex: 1 }}>Back</button>
      <button type="button" disabled={!!busy} onClick={sendBack} style={{ ...btn.primary, flex: 1.4, background: "#d92d20" }}>{busy || `Send ${backReqs.length === 1 ? "this bill" : plural(backReqs.length, "bill")} back`}</button>
    </> : pickedReqs.length ? <>
      <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => { setBack(pickedReqs.map((r) => r.id)); setNote(""); setError(""); setInfo(""); }}
        style={{ ...btn.ghost, flex: 1, color: "#b42318", borderColor: "#fda29b" }}>Send back {pickedReqs.length}</button>
      {two("picked", approvePicked, `Approve ${pickedReqs.length} · ${inr(sum(pickedReqs))}`, `Tap again · approve ${inr(sum(pickedReqs))}`)}
    </> : two("all", approveAll, w.length === 1 ? `Approve 1 bill · ${inr(sum(w))}` : `Approve all ${plural(w.length, "bill")} · ${inr(sum(w))}`,
      w.length === 1 ? `Tap again · approve ${inr(sum(w))}` : `Tap again · approve all ${inr(sum(w))}`);
  // the same wrapper always, so the armed button keeps its focus; the note
  // under it says what the second tap does (23 Nov 2026)
  const footerNoted = live && w.length && !back ? (
    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>{footer}</span>
      {sure && !busy && <span role="status" style={{ fontSize: 12, color: "#5b6576", textAlign: "center" }}>This books the bills for Accounts to pay — it cannot be undone.</span>}
    </span>
  ) : footer;
  const nTeams = new Set(w.map((r) => r.team || "No team")).size;

  return (
    <>
      <Sheet title={`Batch from ${batch.by}`} sub={`${batch.id} · sent ${when(batch.created)}`} onClose={close} maxWidth={desk ? 760 : 640} body="#f4f5f7" footer={footerNoted}>
        <div style={{ padding: desk ? 18 : 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {error && <Note>{error}</Note>}
          {info && !back && <div style={{ ...card, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#067647", fontWeight: 600, background: "#ecfdf3", boxShadow: "0 0 0 1px #abefc6" }}>{info}</div>}
          {back ? (
            <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={label}>Send back · {plural(backReqs.length, "bill")} · {inr(sum(backReqs))}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflow: "auto" }}>
                {backReqs.map((r) => (
                  <span key={r.id} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                    <b style={{ flex: "none" }}>{r.employeeName}</b>
                    <span style={{ flex: 1, minWidth: 0, color: "#475467", ...ell }}>{r.kind === "cash" ? `Advance · ${r.purpose}` : r.bills[0]?.title || "Bill"}</span>
                    <span style={tabNum}>{inr(r.amount)}</span>
                  </span>
                ))}
              </div>
              <textarea className="ecs-in" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? Each employee sees this and can fix and send it again."
                style={{ height: "auto", minHeight: 80, padding: "10px 12px", fontSize: 14, resize: "vertical" }} />
            </div>
          ) : (
            // one summary line, not tiles (23 Nov 2026)
            <span style={{ fontSize: 13.5, color: "#344054", lineHeight: 1.5 }}>
              <b style={{ fontSize: 15, ...tabNum }}>{inr(sum(w))}</b> · {plural(w.length, "bill")} · {people(w)} {people(w) === 1 ? "person" : "people"} · {plural(nTeams, "team")} · {looks(w)
                ? <b style={{ color: "#b54708" }}>{looks(w)} {looks(w) === 1 ? "needs" : "need"} a look</b>
                : "none need a look"}
            </span>
          )}
          {live && !back && w.length > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#5b6576", flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, paddingRight: 4, cursor: "pointer", fontWeight: 600, color: "#344054" }}>
                <GroupBox ids={waitIds(reqs)} picked={picked} setPicked={setPicked} disabled={!!busy} label="Tick all" />Tick all
              </label>
              {pickedReqs.length ? `${plural(pickedReqs.length, "bill")} ticked — approve or send back just those; the rest stays here.` : "Approve all at once, or tick a team, a person or single bills to decide just those."}
            </span>
          )}
          {!back && byTeam.map((t) => {
            const tAll = t.people.flatMap((p) => p.list);
            return (
              <section key={t.name} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 2px 0" }}>
                  {live && <GroupBox ids={waitIds(tAll)} picked={picked} setPicked={setPicked} disabled={!!busy} label={`Tick all of ${t.name}`} />}
                  <b style={{ flex: 1, minWidth: 0, fontSize: 15, ...ell }}>{t.name}
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#8a93a3" }}> · {t.people.length} {t.people.length === 1 ? "person" : "people"}</span></b>
                  <b style={{ fontSize: 14, ...tabNum }}>{inr(live$(tAll))}</b>
                </span>
                {t.people.map((p) => (
                  <div key={p.id} style={{ ...card, padding: "2px 14px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12 }}>
                      {live && <GroupBox ids={waitIds(p.list)} picked={picked} setPicked={setPicked} disabled={!!busy} label={`Tick all of ${p.name}'s bills`} />}
                      <b style={{ flex: 1, minWidth: 0, fontSize: 14, ...ell }}>{p.name}{p.hq ? <span style={{ fontWeight: 500, color: "#8a93a3" }}> · {p.hq}</span> : null}</b>
                      {p.list.every((r) => r.status === "rejected")
                        ? <span style={{ fontSize: 12.5, fontWeight: 600, color: "#b42318" }}>Sent back</span>
                        : <b style={{ fontSize: 13.5, ...tabNum }}>{inr(live$(p.list))}</b>}
                    </span>
                    {p.list.map((r, i) => {
                      const b = r.bills[0];
                      const f = billFile(b?.bill);
                      const gone = r.status === "rejected";
                      const ok = r.status === "approved";
                      const can = live && r.status === "waiting";
                      const held = serviceHeld(r);
                      return (
                        <div key={r.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: i ? "1px solid #eef1f5" : 0, alignItems: "center", opacity: gone ? 0.55 : 1 }}>
                          {live && (can
                            ? <input type="checkbox" aria-label={`Tick ${b?.title || kindWord(r)}`} disabled={!!busy || held} title={held ? HELD_NOTE : undefined} checked={picked.has(r.id)} style={CHK}
                              onChange={(e) => setPicked((s) => { const x = new Set(s); if (e.target.checked) x.add(r.id); else x.delete(r.id); return x; })} />
                            : <span style={{ width: 17, flex: "none" }} />)}
                          {r.kind === "cash"
                            ? <span style={{ width: 40, height: 48, borderRadius: 8, background: "#f4f0ff", color: "#6d28d9", display: "grid", placeItems: "center", flex: "none" }}><Icon d={IC.wallet} size={16} /></span>
                            : f ? <BillThumb conn={conn} file={f} w={40} h={48} onOpen={() => setPreview(f)} />
                              : <span style={{ width: 40, height: 48, borderRadius: 8, background: "#f2f4f7", display: "grid", placeItems: "center", color: "#98a2b3", flex: "none" }}><Icon d={IC.file} size={15} /></span>}
                          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <b style={{ fontSize: 13.5, ...ell }}>{r.kind === "cash" ? `Advance · ${r.purpose}` : b?.title || "Bill"}</b>
                              {b && <CheckBadge b={b} small />}
                              {b && <DupTag b={b} small />}
                            </span>
                            {/* the reason wraps to two lines instead of cutting off (23 Nov 2026) */}
                            <span style={{ fontSize: 12, color: "#5b6576", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{b ? shortDate(b.date) : ""}{b?.reason ? ` · ${b.reason}` : ""}</span>
                            {/* the settlement type, the doctor and the doctor service (23 Nov 2026) */}
                            <TypeInfo r={r} small />
                            {/* who approved it below the CEO, and what they said */}
                            {(() => {
                              const ups = (r.steps || []).filter((s) => s.decision === "Approved");
                              return ups.length > 0 && (
                                <span style={{ fontSize: 11.5, color: "#667085", lineHeight: 1.4 }}>
                                  Approved by {ups.map((s, j) => <span key={j}>{j ? " · " : ""}{s.name}{s.level ? ` (${s.level})` : ""}{s.note ? <i>: “{s.note}”</i> : null}</span>)}
                                </span>
                              );
                            })()}
                            {gone && <span style={{ fontSize: 12, fontWeight: 600, color: "#b42318" }}>Sent back: {r.note}</span>}
                            {ok && <span style={{ fontSize: 12, fontWeight: 600, color: "#067647" }}>Approved — booked for Accounts</span>}
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                            <b style={{ fontSize: 14, ...tabNum }}>{inr(r.amount)}</b>
                            {can && (
                              <button type="button" className="ec-link" disabled={!!busy} onClick={() => { setBack([r.id]); setNote(""); setError(""); setInfo(""); }}
                                style={{ minHeight: 44, minWidth: 44, margin: "0 -8px 0 0", border: 0, background: "transparent", padding: "0 8px", borderRadius: 8, color: "#b42318", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Send back</button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </Sheet>
      {preview && <FilePreview conn={conn} file={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
