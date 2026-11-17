"use client";

/* Paying settlements (17 Nov 2026) -- step 3 of the booking flow.
 *
 * A bill the CEO approved is booked as an Expense Claim payable to the
 * employee; an approved cash request as an Employee Advance. Here:
 *   Accounts   "To pay": one row per employee (their bills + cash advance),
 *              tick and "Send to the CEO" -> a batch. After the CEO approves:
 *              download the bank file, pay at the bank, enter the UTR, "Mark
 *              paid" -> one Payment Entry per employee; everything turns Paid.
 *   CEO        approves (or sends back) each batch before money goes out.
 *   IT         reads both.
 * Payment runs have no fixed day (the user): Accounts runs one whenever. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { cancelBatch, createBatch, decideBatch, fetchBatches, fetchDue, markBatchPaid } from "./data/claimsApi";
import { inr, shortDate } from "./model";
import { BillThumb, FilePreview, IC, Icon, Note, Sheet, Spinner, billFile, btn, card, ell, label, tabNum } from "./ui";

const STATUS = {
  waiting: { text: "With the CEO", fg: "#b54708", bg: "#fffaeb" },
  approved: { text: "Approved — to pay", fg: "#1d4ed8", bg: "#eef3fe" },
  rejected: { text: "Sent back", fg: "#b42318", bg: "#fef3f2" },
  paid: { text: "Paid", fg: "#067647", bg: "#ecfdf3" },
  cancelled: { text: "Cancelled", fg: "#667085", bg: "#f2f4f7" },
};
const Pill = ({ s }) => {
  const x = STATUS[s] || STATUS.waiting;
  return <span style={{ flex: "none", fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 99, color: x.fg, background: x.bg, whiteSpace: "nowrap" }}>{x.text}</span>;
};
const when = (s) => {
  const d = new Date(String(s || "").replace(" ", "T"));
  return isNaN(d) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short" });
};
const mask = (ac) => (ac ? `••${String(ac).slice(-4)}` : "");
const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/* the bank's bulk-upload file: one line per employee still to be paid */
function bankFile(b) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Name", "Account number", "IFSC", "Bank", "Amount", "Narration"]];
  for (const l of b.lines) if (!l.paid) rows.push([l.name, l.bankAc, l.ifsc, l.bank, l.amount.toFixed(2), `Elbrit settlement ${b.id}`]);
  const blob = new Blob([rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${b.id}-bank-file.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function PaymentsPanel({ conn, role, desk, onDone, onError }) {
  const [due, setDue] = useState(null);
  const [batches, setBatches] = useState(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState(role.ceo && !role.accounts ? "batches" : "due");
  const [picked, setPicked] = useState(() => new Set());
  const [open, setOpen] = useState(() => new Set());
  const [busy, setBusy] = useState("");
  const [sheet, setSheet] = useState(null); // a batch
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [d, b] = await Promise.all([role.accounts || role.it ? fetchDue(conn) : Promise.resolve(null), fetchBatches(conn)]);
      setDue(d);
      setBatches(b);
    } catch (e) {
      setErr(e.message);
    }
  }, [conn, role.accounts, role.it]);
  useEffect(() => { load(); }, [load, tick]);
  const refresh = () => setTick((t) => t + 1);

  const employees = due?.employees || [];
  const chosen = employees.filter((e) => picked.has(e.employee));
  const chosenTotal = chosen.reduce((s, e) => s + e.total, 0);
  const waiting = (batches || []).filter((b) => b.status === "waiting");
  const toPay = (batches || []).filter((b) => b.status === "approved");
  const grid = { display: "grid", gridTemplateColumns: desk ? "repeat(auto-fill,minmax(340px,1fr))" : "minmax(0,1fr)", gap: 8 };

  const send = async () => {
    setBusy("Sending to the CEO…");
    try {
      const b = await createBatch(conn, chosen.map((e) => e.employee));
      setPicked(new Set());
      onDone?.(`Sent to the CEO: ${b?.count || chosen.length} ${chosen.length === 1 ? "employee" : "employees"} · ${inr(b?.amount ?? chosenTotal)}`);
      setTab("batches");
      refresh();
    } catch (e) {
      onError?.(e.message);
    }
    setBusy("");
  };

  const tabs = [
    ...(role.accounts || role.it ? [{ k: "due", t: "To pay", n: employees.length }] : []),
    { k: "batches", t: role.ceo ? "Batches" : "Batches", n: role.ceo ? waiting.length : toPay.length + waiting.length },
  ];

  return (
    <>
      {err && <Note>{err}</Note>}
      {tabs.length > 1 && (
        <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "#e9ecf1", alignSelf: "flex-start" }}>
          {tabs.map((x) => (
            <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} onClick={() => setTab(x.k)}
              style={{ height: 34, padding: "0 12px", borderRadius: 9, border: 0, background: tab === x.k ? "#fff" : "transparent", boxShadow: tab === x.k ? "0 1px 2px rgba(16,24,40,.12)" : "none", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              {x.t} <span style={{ color: x.n ? "#b54708" : "#8a93a3" }}>{x.n}</span>
            </button>
          ))}
        </div>
      )}

      {(due === null && (role.accounts || role.it)) || batches === null ? (
        <div aria-busy="true" style={{ ...card, height: 140, display: "grid", placeItems: "center" }}><Spinner size={22} /></div>
      ) : tab === "due" ? (
        <>
          {!employees.length ? (
            <div style={{ ...card, padding: "28px 16px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>Nothing to pay — every approved bill is paid or in a batch.</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ flex: 1, fontSize: 13, color: "#5b6576" }}>{employees.length} {employees.length === 1 ? "employee" : "employees"} · {inr(employees.reduce((s, e) => s + e.total, 0))} approved by the CEO, not paid yet</span>
                {role.accounts && (
                  <button type="button" className="ec-ghost" onClick={() => setPicked(picked.size === employees.length ? new Set() : new Set(employees.map((e) => e.employee)))} style={{ ...btn.ghost, height: 34, fontSize: 12.5 }}>
                    {picked.size === employees.length ? "Clear" : "Select all"}
                  </button>
                )}
              </div>
              <div style={grid}>
                {employees.map((e) => {
                  const isOpen = open.has(e.employee);
                  return (
                    <div key={e.employee} style={{ ...card, padding: 0, overflow: "hidden", boxShadow: picked.has(e.employee) ? "0 0 0 1.5px #2563eb" : card.boxShadow }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
                        {role.accounts && (
                          <input type="checkbox" aria-label={`Pay ${e.name}`} checked={picked.has(e.employee)}
                            onChange={(ev) => setPicked((s) => { const n = new Set(s); if (ev.target.checked) n.add(e.employee); else n.delete(e.employee); return n; })}
                            style={{ width: 18, height: 18, accentColor: "#2563eb", flex: "none" }} />
                        )}
                        <button type="button" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(e.employee)) n.delete(e.employee); else n.add(e.employee); return n; })}
                          style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, border: 0, background: "transparent", textAlign: "left", cursor: "pointer", padding: 0 }}>
                          <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <b style={{ flex: 1, minWidth: 0, fontSize: 14, ...ell }}>{e.name}</b>
                            <b style={{ fontSize: 15, ...tabNum }}>{inr(e.total)}</b>
                          </span>
                          <span style={{ fontSize: 12, color: "#5b6576" }}>
                            {e.claims.length ? `${e.claims.length} ${e.claims.length === 1 ? "bill" : "bills"}` : ""}{e.claims.length && e.advances.length ? " · " : ""}{e.advances.length ? `${e.advances.length === 1 ? "cash advance" : `${e.advances.length} cash advances`}` : ""}
                            {!e.hasBank && <b style={{ color: "#b42318", fontWeight: 600 }}> · no bank details in ERP</b>}
                          </span>
                        </button>
                      </div>
                      {isOpen && (
                        <div style={{ borderTop: "1px solid #eef1f5", padding: "4px 14px 10px" }}>
                          {e.claims.map((c) => {
                            const f = billFile(c.bill);
                            return (
                              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                                {f ? <BillThumb conn={conn} file={f} w={34} h={42} onOpen={() => setPreview(f)} /> : <span style={{ width: 34, height: 42, borderRadius: 7, background: "#f2f4f7", display: "grid", placeItems: "center", color: "#98a2b3" }}><Icon d={IC.file} size={14} /></span>}
                                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, ...ell }}>{c.title}</span>
                                  <span style={{ fontSize: 11.5, color: "#8a93a3" }}>{shortDate(c.date)} · {c.id}</span>
                                </span>
                                <span style={{ fontSize: 13, fontWeight: 700, ...tabNum }}>{inr(c.amount)}</span>
                              </div>
                            );
                          })}
                          {e.advances.map((a) => (
                            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                              <span style={{ width: 34, height: 34, borderRadius: 9, background: "#f4f0ff", color: "#6d28d9", display: "grid", placeItems: "center" }}><Icon d={IC.wallet} size={15} /></span>
                              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                                <span style={{ fontSize: 13, fontWeight: 600, ...ell }}>Cash advance · {a.purpose}</span>
                                <span style={{ fontSize: 11.5, color: "#8a93a3" }}>{shortDate(a.date)} · {a.id}</span>
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 700, ...tabNum }}>{inr(a.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {role.accounts && picked.size > 0 && (
                <div style={{ position: "sticky", bottom: desk ? 16 : 84, zIndex: 5, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14, background: "#101828", color: "#fff", boxShadow: "0 8px 24px rgba(16,24,40,.25)" }}>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{picked.size} {picked.size === 1 ? "employee" : "employees"} · {inr(chosenTotal)}</span>
                  <button type="button" disabled={!!busy} onClick={send} style={{ ...btn.primary, height: 38, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {busy ? <><Spinner size={12} />{busy}</> : "Send to the CEO"}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {role.ceo && !waiting.length && <div style={{ ...card, padding: "22px 16px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>No payment batch waits on you.</div>}
          {!role.ceo && !(batches || []).length && <div style={{ ...card, padding: "22px 16px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>No payment batches yet.</div>}
          <div style={grid}>
            {(batches || []).map((b) => (
              <button key={b.id} type="button" onClick={() => setSheet(b)}
                style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 6, border: 0, textAlign: "left", cursor: "pointer", boxShadow: (role.ceo && b.status === "waiting") || (role.accounts && b.status === "approved") ? "0 0 0 1.5px #f79009" : card.boxShadow }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%" }}>
                  <b style={{ flex: 1, fontSize: 14.5 }}>{b.count} {b.count === 1 ? "employee" : "employees"}</b>
                  <b style={{ fontSize: 16, ...tabNum }}>{inr(b.amount)}</b>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                  <span style={{ flex: 1, fontSize: 12, color: "#8a93a3", ...ell }}>{b.id} · made {when(b.created)}{b.paidOn ? ` · paid ${when(b.paidOn)}` : ""}</span>
                  <Pill s={b.status} />
                </span>
                {b.status === "rejected" && b.note && <span style={{ fontSize: 12, color: "#b42318" }}>{b.note}</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {sheet && <BatchSheet conn={conn} batch={sheet} role={role} banks={due?.banks || []} defaultBank={due?.defaultBank || ""} desk={desk}
        onClose={() => setSheet(null)} onDone={(m) => { setSheet(null); onDone?.(m); refresh(); }} />}
      {preview && <FilePreview conn={conn} file={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function BatchSheet({ conn, batch: b, role, banks, defaultBank, desk, onClose, onDone }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [bank, setBank] = useState(b.bankAccount || defaultBank || banks[0] || "");
  const [date, setDate] = useState(todayIso());
  const [utr, setUtr] = useState("");
  const [utrs, setUtrs] = useState({});
  const unpaid = useMemo(() => b.lines.filter((l) => !l.paid), [b]);
  const ceoAct = role.ceo && b.status === "waiting";
  const pay = role.accounts && b.status === "approved";
  const canCancel = role.accounts && ["waiting", "approved", "rejected"].includes(b.status) && !b.lines.some((l) => l.paid);

  const run = async (what, fn, msg) => {
    setError("");
    setBusy(what);
    try {
      await fn();
      onDone(msg);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  };
  const approve = () => run("Approving…", () => decideBatch(conn, b.id, "Approve"), `Approved: ${b.count} ${b.count === 1 ? "employee" : "employees"} · ${inr(b.amount)} — Accounts can pay now`);
  const reject = () => {
    if (!note.trim()) return setError("Say why it is sent back — Accounts sees it.");
    return run("Sending back…", () => decideBatch(conn, b.id, "Reject", note.trim()), "Sent back to Accounts");
  };
  const markPaid = () => {
    if (!utr.trim() && !unpaid.some((l) => String(utrs[l.employee] || "").trim())) return setError("Enter the bank reference (UTR) of the payment.");
    return run("Recording the payment…", () => markBatchPaid(conn, b.id, { bank, date, utr: utr.trim(), utrs }), `Paid: ${b.id} — the bills are marked paid`);
  };

  const footer = ceoAct ? (rejecting ? <>
    <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => { setRejecting(false); setError(""); }} style={{ ...btn.ghost, flex: 1 }}>Back</button>
    <button type="button" disabled={!!busy} onClick={reject} style={{ ...btn.primary, flex: 1.4, background: "#d92d20" }}>{busy || "Send back"}</button>
  </> : <>
    <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => setRejecting(true)} style={{ ...btn.ghost, flex: 1, color: "#b42318" }}>Send back</button>
    <button type="button" className="ec-cta" disabled={!!busy} onClick={approve} style={{ ...btn.primary, flex: 1.4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{busy ? <><Spinner />{busy}</> : `Approve ${inr(b.amount)}`}</button>
  </>) : pay ? <>
    <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => bankFile(b)} style={{ ...btn.ghost, flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon d={IC.dl} size={15} />Bank file</button>
    <button type="button" className="ec-cta" disabled={!!busy} onClick={markPaid} style={{ ...btn.primary, flex: 1.4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{busy ? <><Spinner />{busy}</> : "Mark paid"}</button>
  </> : <button type="button" className="ec-ghost" onClick={onClose} style={{ ...btn.ghost, flex: 1 }}>Close</button>;

  return (
    <Sheet title={`Payment batch · ${inr(b.amount)}`} sub={`${b.id} · ${b.count} ${b.count === 1 ? "employee" : "employees"} · made ${when(b.created)}`} onClose={busy ? () => {} : onClose} maxWidth={desk ? 680 : 640} body="#f4f5f7" footer={footer}>
      <div style={{ padding: desk ? 18 : 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {error && <Note>{error}</Note>}
        <span style={{ alignSelf: "flex-start" }}><Pill s={b.status} /></span>
        {b.status === "rejected" && b.note && <Note>Sent back: {b.note}</Note>}
        {rejecting && (
          <textarea className="ecs-in" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is it sent back? Accounts sees this."
            style={{ height: "auto", minHeight: 80, padding: "10px 12px", fontSize: 14, resize: "vertical" }} />
        )}
        {pay && (
          <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={label}>After paying at the bank</span>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12.5, color: "#475467" }}>Paid from</span>
              <select className="ecs-in" value={bank} onChange={(e) => setBank(e.target.value)} style={{ height: 40, padding: "0 10px", fontSize: 13.5 }}>
                {[...new Set([bank, ...banks].filter(Boolean))].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label style={{ flex: "1 1 150px", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12.5, color: "#475467" }}>Date</span>
                <input className="ecs-in" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} style={{ height: 40, padding: "0 10px", fontSize: 13.5 }} />
              </label>
              <label style={{ flex: "2 1 220px", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12.5, color: "#475467" }}>UTR / bank reference (for all)</span>
                <input className="ecs-in" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="e.g. the bulk-upload reference" style={{ height: 40, padding: "0 10px", fontSize: 13.5 }} />
              </label>
            </div>
            <span style={{ fontSize: 12, color: "#8a93a3" }}>Paid one by one? Put each UTR on its line below; a blank line takes the common one.</span>
          </div>
        )}
        <div style={{ ...card, padding: "2px 14px" }}>
          {b.lines.map((l, i) => (
            <div key={l.employee} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 0", borderTop: i ? "1px solid #eef1f5" : 0 }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <b style={{ flex: 1, minWidth: 0, fontSize: 13.5, ...ell }}>{l.name}</b>
                <b style={{ fontSize: 14, ...tabNum }}>{inr(l.amount)}</b>
              </span>
              <span style={{ fontSize: 12, color: "#5b6576" }}>
                {l.claims.length ? `${l.claims.length} ${l.claims.length === 1 ? "bill" : "bills"}` : ""}{l.claims.length && l.advances.length ? " · " : ""}{l.advances.length ? "cash advance" : ""}
                {" · "}{l.bankAc ? `${l.bank || "Bank"} ${mask(l.bankAc)} · ${l.ifsc}` : <b style={{ color: "#b42318", fontWeight: 600 }}>no bank details in ERP</b>}
              </span>
              {l.paid ? (
                <span style={{ fontSize: 12, fontWeight: 600, color: "#067647" }}><Icon d={IC.check} size={12} sw={3} /> Paid · UTR {l.utr}</span>
              ) : pay ? (
                <input className="ecs-in" value={utrs[l.employee] || ""} onChange={(e) => setUtrs((s) => ({ ...s, [l.employee]: e.target.value }))} placeholder={utr ? `UTR (blank = ${utr})` : "UTR for this employee"}
                  aria-label={`UTR for ${l.name}`} style={{ height: 36, padding: "0 10px", fontSize: 13 }} />
              ) : null}
            </div>
          ))}
        </div>
        {canCancel && (
          <button type="button" className="ec-link" disabled={!!busy} onClick={() => run("Cancelling…", () => cancelBatch(conn, b.id), `Cancelled ${b.id} — its bills are back in To pay`)}
            style={{ alignSelf: "flex-start", border: 0, background: "transparent", color: "#b42318", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "4px 2px" }}>
            Cancel this batch
          </button>
        )}
      </div>
    </Sheet>
  );
}
