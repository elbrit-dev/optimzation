"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addClaimComment, applyAction, fetchMe, fetchQueue, makeConn, saveSanctioned } from "./data/claimsApi";
import { loggedUser } from "../support-report/data/erpClient";
import { MON, dateOf, inr, shortDate, spanOf, typeColor } from "./model";
import { CSS, Chip, FONT_HREF, FilePreview, IC, Icon, Note, RiskBadge, Sheet, Spinner, billFile, btn, card, ell, label, tabNum } from "./ui";

/* Expense claims waiting on the signed-in person, and the buttons to move
 * them on. One component, two jobs:
 *
 *   mode "approve"  reporting officer: claims in "Waiting for Approval" whose
 *                   expense_approver is them -> Approve / Reject (with a
 *                   reason). After Approve the ERP routes it: AI score 90+
 *                   is verified and goes to payroll, the rest go to review.
 *   mode "verify"   verifier (Sathishkumar): claims "In Review" -> may lower
 *                   a row's sanctioned amount, then Verify (payroll entry is
 *                   made) or Reject.
 *   mode "auto"     the views the signed-in person has, from their token:
 *                   everyone gets "To approve"; the verifiers (verifiers
 *                   prop) also get "To verify"; the IT role profile gets
 *                   BOTH as an overview -- every waiting claim, not just
 *                   their own -- and may act only where the ERP lets them
 *                   (a claim's own approver approves, a verifier verifies).
 *   ?view=approve / ?view=verify (the ring nav tiles) picks the tab.
 *
 * Everything is done as the signed-in user with their own ERP token; the
 * ERP's workflow decides whether they may (only the claim's approver can
 * approve it, only the verifier can verify). */

const MODES = {
  approve: { state: "Waiting for Approval", title: "Claims to approve", yes: "Approve", empty: "Nothing waiting for your approval." },
  verify: { state: "In Review", title: "Claims to verify", yes: "Verify", empty: "Nothing waiting to be verified." },
};

function useWidth(ref) {
  const [w, setW] = useState(1024);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export const VERIFIERS = ["sathish.admin@elbrit.org"];

export default function ClaimApprovals({ url, token, mode = "auto", verifiers = VERIFIERS, overviewRoleProfile = "IT", className, onCountChange }) {
  const rootRef = useRef(null);
  const w = useWidth(rootRef);
  const desk = w >= 900;
  const conn = useMemo(() => {
    try {
      return url && token ? makeConn({ url, token }) : null;
    } catch {
      return null;
    }
  }, [url, token]);

  const [lists, setLists] = useState({ status: "loading" });
  // The ring nav tiles link here with ?view=approve / ?view=verify.
  const [tab, setTab] = useState(() => {
    if (mode !== "auto") return mode;
    const v = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("view") : null;
    return v === "verify" ? "verify" : "approve";
  });
  const [fromLink] = useState(() => typeof window !== "undefined" && /[?&]view=/.test(window.location.search));
  const [open, setOpen] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!conn) return setLists({ status: "idle" });
    setLists((s) => ({ ...s, status: s.approve || s.verify ? "ready" : "loading" }));
    try {
      const me = await loggedUser(conn);
      const profile = await fetchMe(conn).then((e) => e.roleProfile).catch(() => "");
      const overview = !!overviewRoleProfile && profile === overviewRoleProfile;
      const verifier = (verifiers || []).includes(me);
      // A reporting officer keeps read access to claims they approved, so
      // "In Review" is only ever listed for the verifiers and the overview.
      const want = mode === "auto" ? ["approve", ...(verifier || overview ? ["verify"] : [])] : [mode];
      const out = { overview, verifier };
      await Promise.all(
        want.map(async (m) => {
          out[m] = await fetchQueue(conn, { state: MODES[m].state, approver: m === "approve" && !overview ? me : null }).catch((e) => {
            out[m + "Error"] = e.message;
            return [];
          });
        }),
      );
      setLists({ status: "ready", me, ...out });
    } catch (e) {
      setLists({ status: "error", error: e.message });
    }
  }, [conn, mode, verifiers, overviewRoleProfile]);

  useEffect(() => { load(); }, [load, tick]);

  const visible = mode === "auto" ? ["approve", ...(lists.verify ? ["verify"] : [])] : [mode];
  useEffect(() => {
    if (lists.status === "ready" && tab === "verify" && mode === "auto" && !lists.verify) setTab("approve");
  }, [lists, tab, mode]);
  // Who may act on a claim: approve = its own approver; verify = a verifier.
  const canAct = (c, kind) => (kind === "verify" ? !!lists.verifier : !!lists.me && c.approver === lists.me);
  useEffect(() => {
    // Jump to the tab with work -- unless the link asked for a view.
    if (mode !== "auto" || lists.status !== "ready" || fromLink) return;
    if (!(lists[tab] || []).length && (lists[tab === "approve" ? "verify" : "approve"] || []).length) setTab(tab === "approve" ? "verify" : "approve");
  }, [lists, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = mode === "auto" ? tab : mode;
  const claims = lists[current] || [];
  useEffect(() => {
    onCountChange?.((lists.approve || []).length + (lists.verify || []).length);
  }, [lists, onCountChange]);

  const groups = useMemo(() => {
    const m = new Map();
    for (const c of claims) {
      const k = c.employeeName || c.employee || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(c);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [claims]);
  const total = claims.reduce((s, c) => s + c.claimed, 0);
  const lowRisk = claims.filter((c) => c.ai?.risk === "Low" && canAct(c, current));

  const say = (m, tone = "ok") => {
    setToast({ m, tone });
    setTimeout(() => setToast(null), 3500);
  };
  const done = (m) => {
    setOpen(null);
    setPicked(new Set());
    say(m);
    setTick((t) => t + 1);
  };

  const bulkApprove = async () => {
    const ids = [...picked];
    let ok = 0;
    const failed = [];
    for (const id of ids) {
      try {
        await applyAction(conn, id, MODES[current].yes);
        ok += 1;
      } catch (e) {
        failed.push(`${id}: ${e.message}`);
      }
    }
    if (failed.length) say(`${ok} done, ${failed.length} failed -- ${failed[0]}`, "error");
    else done(`${ok} ${ok === 1 ? "claim" : "claims"} ${current === "approve" ? "approved" : "verified"}`);
    setTick((t) => t + 1);
  };

  const pad = desk ? 28 : 14;
  return (
    <div ref={rootRef} className={"ec-root" + (className ? " " + className : "")} style={{ background: "#f4f5f7", width: "100%", minHeight: "100%" }}>
      <link rel="stylesheet" href={FONT_HREF} />
      <style>{CSS}</style>
      <main style={{ padding: pad, display: "flex", flexDirection: "column", gap: 14, maxWidth: 1400, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: desk ? 24 : 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{mode === "auto" ? "Expense approvals" : MODES[mode].title}</span>
            <span style={{ fontSize: 13, color: "#5b6576" }}>
              {lists.status === "ready" ? `${claims.length} ${claims.length === 1 ? "claim" : "claims"} · ${inr(total)}` : " "}
            </span>
          </div>
          <button type="button" className="ec-ghost" onClick={() => setTick((t) => t + 1)} style={{ ...btn.ghost, height: 38, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon d={IC.hist} size={15} />Refresh</button>
        </header>

        {mode === "auto" && (
          <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "#e9ecf1", alignSelf: "flex-start" }}>
            {visible.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={tab === m} onClick={() => { setTab(m); setPicked(new Set()); }} style={{ height: 36, padding: "0 14px", borderRadius: 9, border: 0, background: tab === m ? "#fff" : "transparent", boxShadow: tab === m ? "0 1px 2px rgba(16,24,40,.12)" : "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {m === "approve" ? "To approve" : "To verify"} <span style={{ color: "#8a93a3" }}>{(lists[m] || []).length}</span>
              </button>
            ))}
          </div>
        )}

        {lists.status === "idle" && <Note tone="info">Pass the ERP GraphQL URL and the signed-in user&rsquo;s token.</Note>}
        {lists.status === "error" && <Note>{lists.error}</Note>}
        {lists[current + "Error"] && <Note>{lists[current + "Error"]}</Note>}
        {lists.status === "loading" && <div aria-busy="true" style={{ ...card, height: 180, display: "grid", placeItems: "center" }}><Spinner size={24} /></div>}

        {lists.status === "ready" && (
          <>
            {claims.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {lowRisk.length > 0 && (
                  <button type="button" className="ec-ghost" onClick={() => setPicked(new Set(lowRisk.map((c) => c.id)))} style={{ ...btn.ghost, height: 36, fontSize: 13 }}>
                    Select {lowRisk.length} low-risk
                  </button>
                )}
                {picked.size > 0 && <>
                  <button type="button" className="ec-cta" onClick={bulkApprove} style={{ ...btn.primary, height: 36, fontSize: 13 }}>{MODES[current].yes} {picked.size} selected</button>
                  <button type="button" className="ec-ghost" onClick={() => setPicked(new Set())} style={{ ...btn.ghost, height: 36, fontSize: 13 }}>Clear</button>
                </>}
              </div>
            )}
            {!claims.length && <div style={{ ...card, padding: "36px 16px", textAlign: "center", fontSize: 14, color: "#5b6576" }}>{MODES[current].empty}</div>}
            {groups.map(([who, cs]) => (
              <section key={who} style={{ ...card, padding: desk ? "14px 16px" : 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 700, ...ell }}>{who}</span>
                  <span style={{ fontSize: 13, color: "#5b6576", ...tabNum }}>{cs.length} · {inr(cs.reduce((s, c) => s + c.claimed, 0))}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: desk ? "repeat(auto-fill,minmax(340px,1fr))" : "minmax(0,1fr)", gap: 8 }}>
                  {cs.map((c) => (
                    <QueueCard key={c.id} claim={c} canPick={canAct(c, current)} picked={picked.has(c.id)} onPick={(on) => setPicked((s) => { const n = new Set(s); if (on) n.add(c.id); else n.delete(c.id); return n; })} onOpen={() => setOpen(c)} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>

      {open && <ReviewSheet conn={conn} claim={open} kind={current} canAct={canAct(open, current)} desk={desk} onClose={() => setOpen(null)} onDone={done} />}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: desk ? 32 : 96, transform: "translateX(-50%)", zIndex: 95, maxWidth: "calc(100vw - 32px)", padding: "11px 18px", borderRadius: 10, background: toast.tone === "error" ? "#b42318" : "#101828", color: "#fff", fontSize: 13, fontWeight: 500 }}>{toast.m}</div>
      )}
    </div>
  );
}

function QueueCard({ claim: c, canPick, picked, onPick, onOpen }) {
  const byType = {};
  for (const l of c.lines) byType[l.type] = (byType[l.type] || 0) + l.amount;
  const missingBills = c.isAdvance ? 0 : c.lines.filter((l) => !l.bill).length;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: 12, background: picked ? "#eef3fe" : "#f7f8fa", boxShadow: picked ? "0 0 0 1px #b2c8f7" : "none" }}>
      {canPick ? <input type="checkbox" aria-label={`Select ${c.id}`} checked={picked} onChange={(e) => onPick(e.target.checked)} style={{ marginTop: 3, width: 17, height: 17, accentColor: "#2563eb", flex: "none" }} /> : <span style={{ width: 17, flex: "none" }} />}
      <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7, border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          <span style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {c.isAdvance ? <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#f4f0ff", color: "#5b21b6" }}>Advance</span> : <RiskBadge ai={c.ai} small />}
            {!c.isAdvance && !c.ai && <span style={{ fontSize: 11, fontWeight: 600, color: "#8a93a3" }}>Not checked by AI</span>}
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, ...tabNum }}>{inr(c.claimed)}</span>
        </span>
        {!canPick && c.status === "Waiting for Approval" && c.approver && <span style={{ fontSize: 11.5, fontWeight: 600, color: "#b54708", ...ell }}>Waiting on {c.approver}</span>}
        <span style={{ fontSize: 12, color: "#5b6576", ...ell }}>{c.id} · {spanOf(c.lines)} · {c.lines.length} {c.lines.length === 1 ? "row" : "rows"}{c.advanceOf ? ` · from ${c.advanceOf}` : ""}</span>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(byType).map(([t, v]) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 8px", borderRadius: 7, background: typeColor(t).bg, color: typeColor(t).fg, fontSize: 11.5, fontWeight: 600 }}>{t} <span style={{ color: "#0b1220", ...tabNum }}>{inr(v)}</span></span>
          ))}
          {missingBills > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: "#b42318" }}>{missingBills} without bill</span>}
        </span>
      </button>
    </div>
  );
}

function ReviewSheet({ conn, claim: c, kind, canAct = true, desk, onClose, onDone }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [sanctioned, setSanctioned] = useState(() => Object.fromEntries(c.lines.map((l) => [l.id, String(l.sanctioned || l.amount)])));
  const [preview, setPreview] = useState(null);
  const verify = kind === "verify";
  const cut = c.lines.some((l) => Number(sanctioned[l.id]) !== l.amount);
  const sanctionedTotal = c.lines.reduce((s, l) => s + (Number(sanctioned[l.id]) || 0), 0);

  const yes = async () => {
    setError("");
    try {
      if (verify && cut) {
        const bad = c.lines.find((l) => !(Number(sanctioned[l.id]) >= 0) || Number(sanctioned[l.id]) > l.amount);
        if (bad) return setError(`Row ${bad.idx}: the sanctioned amount must be between 0 and ${inr(bad.amount)}.`);
        setBusy("Saving amounts…");
        await saveSanctioned(conn, c, Object.fromEntries(Object.entries(sanctioned).map(([k, v]) => [k, Number(v)])));
      }
      setBusy(verify ? "Verifying…" : "Approving…");
      await applyAction(conn, c.id, verify ? "Verify" : "Approve");
      onDone(`${c.id} ${verify ? "verified -- in next month's payroll" : "approved"}`);
    } catch (e) {
      setBusy("");
      setError(/modified after/i.test(e.message) ? "The claim changed while it was open. Refresh and try again." : e.message);
    }
  };
  const no = async () => {
    if (!reason.trim()) return setError("Say why it is rejected -- the employee sees this.");
    setError("");
    try {
      setBusy("Rejecting…");
      await addClaimComment(conn, c.id, reason.trim());
      await applyAction(conn, c.id, "Reject");
      onDone(`${c.id} rejected`);
    } catch (e) {
      setBusy("");
      setError(e.message);
    }
  };

  return (
    <Sheet
      title={`${c.employeeName || c.employee} · ${inr(c.claimed)}`}
      chips={<><Chip claim={c} /><RiskBadge ai={c.ai} /></>}
      sub={`${c.id} · ${spanOf(c.lines)}${c.posting ? " · filed " + shortDate(c.posting) : ""}`}
      onClose={busy ? () => {} : onClose}
      maxWidth={desk ? 900 : 640}
      body="#f4f5f7"
      footer={!canAct ? <>
        <span style={{ flex: 1, alignSelf: "center", fontSize: 13, color: "#5b6576" }}>{verify ? "Only the verifier can verify this claim." : `Only ${c.approver || "the reporting officer"} can approve this claim.`}</span>
        <button type="button" className="ec-ghost" onClick={onClose} style={btn.ghost}>Close</button>
      </> : rejecting ? <>
        <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => { setRejecting(false); setError(""); }} style={{ ...btn.ghost, flex: 1 }}>Back</button>
        <button type="button" disabled={!!busy} onClick={no} style={{ ...btn.primary, flex: 1.4, background: "#d92d20", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{busy ? <><Spinner />{busy}</> : "Reject claim"}</button>
      </> : <>
        <button type="button" className="ec-ghost" disabled={!!busy} onClick={() => setRejecting(true)} style={{ ...btn.ghost, flex: 1, color: "#b42318" }}>Reject</button>
        <button type="button" className="ec-cta" disabled={!!busy} onClick={yes} style={{ ...btn.primary, flex: 1.4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {busy ? <><Spinner />{busy}</> : verify ? `Verify ${inr(sanctionedTotal)}` : "Approve"}
        </button>
      </>}
    >
      <div style={{ padding: desk ? 18 : 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {c.ai?.summary && <Note tone={c.ai.risk === "Low" ? "ok" : "info"}><b>Bill check:</b> {c.ai.summary}</Note>}
        {!c.ai && !c.isAdvance && <Note tone="info">These bills have not been checked by the AI -- look at each one.</Note>}
        {c.isAdvance && <Note tone="info">Advance request -- no bills yet. {verify ? "Verify once the money is released to them." : "Approving sends it to be released."}</Note>}
        {c.advanceOf && <span style={{ fontSize: 12, fontWeight: 600, color: "#5b21b6" }}>Spent from advance {c.advanceOf} -- covered by its balance first, only the rest goes to payroll.</span>}
        {c.remark && <span style={{ fontSize: 13, color: "#475467" }}><b style={{ fontWeight: 600 }}>Remark:</b> {c.remark}</span>}
        {c.lines.map((l) => {
          const col = typeColor(l.type);
          const bill = billFile(l.bill);
          const dt = l.date ? dateOf(l.date) : null;
          return (
            <div key={l.id} style={{ ...card, padding: 12, display: "flex", flexDirection: "column", gap: 7, boxShadow: `0 0 0 1px #e4e7ec, inset 3px 0 0 ${col.c}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 9px", borderRadius: 7, background: col.bg, color: col.fg, fontSize: 12, fontWeight: 700 }}>{l.type}{l.sub ? ` · ${l.sub}` : ""}</span>
                {dt && <span style={{ fontSize: 12, color: "#5b6576" }}>{dt.getDate()} {MON[dt.getMonth()]}</span>}
                <RiskBadge ai={l.ai} small />
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 16, fontWeight: 700, ...tabNum }}>{inr(l.amount)}</span>
              </div>
              <span style={{ fontSize: 13.5, color: l.note ? "#344054" : "#8a93a3" }}>{l.note || "No description"}</span>
              {l.ai && (
                <span style={{ fontSize: 12, color: "#475467", display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span>Bill: <b style={tabNum}>{l.ai.amount != null ? inr(l.ai.amount) : "—"}</b></span>
                  {l.ai.date && <span>dated {shortDate(l.ai.date)}</span>}
                  {l.ai.vendor && <span style={ell}>{l.ai.vendor}</span>}
                  <span style={{ color: l.ai.risk === "Low" ? "#067647" : "#b54708" }}>{l.ai.reason}</span>
                </span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {bill ? (
                  <button type="button" className="ec-link" onClick={() => setPreview(bill)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid #d0d5dd", background: "#fff", color: "#1d4ed8", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Icon d={IC.eye} size={14} />View bill</button>
                ) : !c.isAdvance && <span style={{ fontSize: 12, fontWeight: 600, color: "#b42318" }}>No bill attached</span>}
                {verify && canAct && (
                  <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={label}>Sanction</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, height: 34, width: 120, padding: "0 8px", borderRadius: 8, border: "1px solid #d0d5dd", background: "#fff" }}>
                      <span style={{ color: "#8a93a3" }}>₹</span>
                      <input inputMode="decimal" value={sanctioned[l.id]} onChange={(e) => setSanctioned((s) => ({ ...s, [l.id]: e.target.value.replace(/[^\d.]/g, "") }))} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 14, fontWeight: 700, textAlign: "right", ...tabNum }} />
                    </span>
                  </label>
                )}
              </div>
            </div>
          );
        })}
        {rejecting && (
          <label style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={label}>Why is it rejected? · the employee sees this</span>
            <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fuel bill is for ₹400, not ₹500 -- please correct the amount" style={{ width: "100%", borderRadius: 10, border: "1px solid #d0d5dd", padding: 10, fontSize: 14, resize: "vertical" }} />
          </label>
        )}
        {error && <Note>{error}</Note>}
      </div>
      {preview && <FilePreview conn={conn} file={preview} onClose={() => setPreview(null)} />}
    </Sheet>
  );
}
