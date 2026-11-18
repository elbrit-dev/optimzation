"use client";

/* The CEO's batches (18 Nov 2026, management: the chain ends with the CEO,
 * who decides on BATCHES). The approver right before him -- the GM; the SM
 * where no GM is above -- sends the bills they approve as one batch per
 * send. Here the CEO opens a batch: its bills by team, then employee, each with its
 * photo and risk; he may send single bills back (with a reason, the rep sees
 * it), then approves the rest in one tap. His approval is final: the bills
 * are booked in the ledger and Accounts pays them with no further approval. */

import { useState } from "react";
import { approveCeoBatch, decideSettlement } from "./data/claimsApi";
import { inr, shortDate } from "./model";
import { BillThumb, FilePreview, IC, Icon, Note, RiskBadge, Sheet, Spinner, billFile, btn, card, ell, label, tabNum } from "./ui";

const when = (s) => {
  const d = new Date(String(s || "").replace(" ", "T"));
  return isNaN(d) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};
const waitingIn = (b) => b.requests.filter((r) => r.status === "waiting");
const people = (rs) => new Set(rs.map((r) => r.employee)).size;

export function CeoBatches({ conn, data, desk, onDone, onError, onChanged }) {
  const [open, setOpen] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const waiting = data.batches.filter((b) => b.status === "waiting");
  const done = data.batches.filter((b) => b.status !== "waiting");
  const grid = { display: "grid", gridTemplateColumns: desk ? "repeat(auto-fill,minmax(340px,1fr))" : "minmax(0,1fr)", gap: 8 };
  const cardOf = (b) => {
    const w = waitingIn(b);
    const amt = (b.status === "waiting" ? w : b.requests).reduce((s, r) => s + r.amount, 0);
    return (
      <button key={b.id} type="button" onClick={() => setOpen(b)}
        style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 6, border: 0, textAlign: "left", cursor: "pointer", boxShadow: b.status === "waiting" ? "0 0 0 1.5px #f79009" : card.boxShadow }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%" }}>
          <b style={{ flex: 1, minWidth: 0, fontSize: 14.5, ...ell }}>From {b.by}</b>
          <b style={{ fontSize: 16, ...tabNum }}>{inr(amt)}</b>
        </span>
        <span style={{ fontSize: 12.5, color: "#5b6576" }}>
          {b.status === "waiting" ? `${w.length} ${w.length === 1 ? "bill" : "bills"} · ${people(w)} ${people(w) === 1 ? "employee" : "employees"}` : `${b.count} ${b.count === 1 ? "bill" : "bills"} · decided ${when(b.decidedOn)}`}
        </span>
        <span style={{ fontSize: 12, color: "#8a93a3" }}>{b.id} · sent {when(b.created)}</span>
      </button>
    );
  };
  return (
    <>
      {!waiting.length && <div style={{ ...card, padding: "28px 16px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>No batch waits on you.</div>}
      {waiting.length > 0 && (
        <span style={{ fontSize: 13, color: "#5b6576" }}>
          {waiting.length} {waiting.length === 1 ? "batch" : "batches"} · {inr(waiting.reduce((s, b) => s + waitingIn(b).reduce((x, r) => x + r.amount, 0), 0))} to approve
        </span>
      )}
      {waiting.length > 0 && <div style={grid}>{waiting.map(cardOf)}</div>}
      {done.length > 0 && (
        <>
          <button type="button" onClick={() => setShowDone((v) => !v)} style={{ alignSelf: "flex-start", border: 0, background: "transparent", padding: "6px 2px 0", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "#344054" }}>
            {showDone ? "Hide" : "Show"} {done.length} decided <span style={{ color: "#8a93a3", fontWeight: 500 }}>· last 30 days</span>
          </button>
          {showDone && <div style={grid}>{done.map(cardOf)}</div>}
        </>
      )}
      {open && <BatchSheet conn={conn} batch={open} desk={desk} onClose={() => setOpen(null)}
        onSentBack={() => onChanged?.()}
        onDone={(m) => { setOpen(null); onDone?.(m); }} onError={onError} />}
    </>
  );
}

function BatchSheet({ conn, batch, desk, onClose, onSentBack, onDone, onError }) {
  const [reqs, setReqs] = useState(batch.requests);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [back, setBack] = useState(null); // the request being sent back
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(null);
  const live = batch.status === "waiting";
  const w = reqs.filter((r) => r.status === "waiting");
  const amount = w.reduce((s, r) => s + r.amount, 0);
  // Team (the seat's department) > employee (18 Nov 2026)
  const live$ = (rs) => rs.filter((r) => r.status !== "rejected").reduce((s, r) => s + r.amount, 0);
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

  const sendBack = async () => {
    if (!note.trim()) return setError("Say why it is sent back — the employee sees it.");
    setError("");
    setBusy("Sending back…");
    try {
      await decideSettlement(conn, back.id, "Reject", note.trim());
      setReqs((rs) => rs.map((r) => (r.id === back.id ? { ...r, status: "rejected", note: note.trim() } : r)));
      setBack(null);
      setNote("");
      onSentBack?.();
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };
  const approve = async () => {
    setError("");
    setBusy("Approving…");
    try {
      const m = await approveCeoBatch(conn, batch.id);
      onDone(`Approved ${m.approved} ${m.approved === 1 ? "bill" : "bills"} · ${inr(m.amount)} — booked; Accounts pays them`);
    } catch (e) {
      setError(e.message);
      onError?.(e.message);
      setBusy("");
    }
  };

  const footer = !live ? <button type="button" className="ec-ghost" onClick={onClose} style={{ ...btn.ghost, flex: 1 }}>Close</button>
    : back ? <>
      <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => { setBack(null); setError(""); }} style={{ ...btn.ghost, flex: 1 }}>Back</button>
      <button type="button" disabled={!!busy} onClick={sendBack} style={{ ...btn.primary, flex: 1.4, background: "#d92d20" }}>{busy || "Send this bill back"}</button>
    </> : (
      <button type="button" className="ec-cta" disabled={!!busy || !w.length} onClick={approve} style={{ ...btn.primary, flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {busy ? <><Spinner />{busy}</> : w.length ? `Approve ${w.length} ${w.length === 1 ? "bill" : "bills"} · ${inr(amount)}` : "Nothing left to approve"}
      </button>
    );

  return (
    <>
      <Sheet title={`Batch from ${batch.by}`} sub={`${batch.id} · sent ${when(batch.created)}`} onClose={busy ? () => {} : onClose} maxWidth={desk ? 720 : 640} body="#f4f5f7" footer={footer}>
        <div style={{ padding: desk ? 18 : 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {error && <Note>{error}</Note>}
          {live && !back && <span style={{ fontSize: 12.5, color: "#5b6576" }}>Send back any bill on its own; the rest are approved together. Your approval books them for Accounts to pay.</span>}
          {back && (
            <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={label}>Send back · {back.employeeName}</span>
              <b style={{ fontSize: 13.5 }}>{back.bills[0]?.title || back.purpose || "Bill"} · {inr(back.amount)}</b>
              <textarea className="ecs-in" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? The employee sees this and can fix and send it again."
                style={{ height: "auto", minHeight: 80, padding: "10px 12px", fontSize: 14, resize: "vertical" }} />
            </div>
          )}
          {!back && byTeam.map((t) => (
            <section key={t.name} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 2px 0" }}>
                <b style={{ flex: 1, minWidth: 0, fontSize: 15, ...ell }}>{t.name}
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#8a93a3" }}> · {t.people.length} {t.people.length === 1 ? "person" : "people"}</span></b>
                <b style={{ fontSize: 14, ...tabNum }}>{inr(live$(t.people.flatMap((p) => p.list)))}</b>
              </span>
          {t.people.map((p) => (
            <div key={p.id} style={{ ...card, padding: "2px 14px" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 8, paddingTop: 12 }}>
                <b style={{ flex: 1, minWidth: 0, fontSize: 14, ...ell }}>{p.name}{p.hq ? <span style={{ fontWeight: 500, color: "#8a93a3" }}> · {p.hq}</span> : null}</b>
                <b style={{ fontSize: 13.5, ...tabNum }}>{inr(live$(p.list))}</b>
              </span>
              {p.list.map((r, i) => {
                const b = r.bills[0];
                const f = billFile(b?.bill);
                const gone = r.status === "rejected";
                return (
                  <div key={r.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: i ? "1px solid #eef1f5" : 0, alignItems: "center", opacity: gone ? 0.55 : 1 }}>
                    {r.kind === "cash"
                      ? <span style={{ width: 40, height: 48, borderRadius: 8, background: "#f4f0ff", color: "#6d28d9", display: "grid", placeItems: "center", flex: "none" }}><Icon d={IC.wallet} size={16} /></span>
                      : f ? <BillThumb conn={conn} file={f} w={40} h={48} onOpen={() => setPreview(f)} />
                        : <span style={{ width: 40, height: 48, borderRadius: 8, background: "#f2f4f7", display: "grid", placeItems: "center", color: "#98a2b3", flex: "none" }}><Icon d={IC.file} size={15} /></span>}
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <b style={{ fontSize: 13.5, ...ell }}>{r.kind === "cash" ? `Cash · ${r.purpose}` : b?.title || "Bill"}</b>
                        {b && b.risk && <RiskBadge ai={{ risk: b.risk }} small />}
                      </span>
                      <span style={{ fontSize: 12, color: "#5b6576", ...ell }}>{b ? shortDate(b.date) : ""}{b?.reason ? ` · ${b.reason}` : ""}</span>
                      {gone && <span style={{ fontSize: 12, fontWeight: 600, color: "#b42318" }}>Sent back: {r.note}</span>}
                      {r.status === "approved" && <span style={{ fontSize: 12, fontWeight: 600, color: "#067647" }}>Approved</span>}
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <b style={{ fontSize: 14, ...tabNum }}>{inr(r.amount)}</b>
                      {live && r.status === "waiting" && (
                        <button type="button" className="ec-link" disabled={!!busy} onClick={() => { setBack(r); setNote(""); setError(""); }}
                          style={{ border: 0, background: "transparent", padding: 0, color: "#b42318", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Send back</button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
            </section>
          ))}
        </div>
      </Sheet>
      {preview && <FilePreview conn={conn} file={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
