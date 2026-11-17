"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ATTACH_ACCEPT, checkClaim, checkFile, extractBill, fetchClaim, fetchOpenClaim, invalidateClaims, requestCashThroughChain, retryOnConflict, saveClaim, sendBillsForApproval,
  uploadClaimFile,
} from "./data/claimsApi";
import { IC, Icon, Note, Sheet, Spinner, btn, ell, tabNum } from "./ui";
import { inr, isoDay, ledger, shortDate } from "./model";
import { waitingOn } from "./settlement";

/* The settlement sheets (Miscellaneous), in the app's theme:
 *
 *   BillSheet  "Add a bill" -- the AI bill check form: what it was for, a
 *              photo of the bill (read once on attach -- Cloudflare Gemma 4,
 *              then Clairic + Clef Flash: title, amount and date;
 *              not-a-bill or unreadable is refused and nothing is saved),
 *              which the person checks and corrects only if needed.
 *              Every bill -- food too -- goes on the settlement claim.
 *              "Check my bill" adds it to the person's open claim; in the
 *              background plain code compares that read with what they sent
 *              (total, date, bill type; each read 90%+ sure) and the bill is
 *              Checked (score 100, or 40 with the reasons). The person then
 *              sends Checked bills up the approval chain from Settlements
 *              (16 Nov 2026). No AI runs again. The form explains none of
 *              this (user, 16 Nov 2026).
 *   CashSheet  "Request cash" -- an Employee Advance, approved up the chain
 *              (BE > ABM > RBM > SM/ZSM > GM > CEO, 16 Nov 2026); the CEO's
 *              approval makes it Verified (nothing more for now).
 *
 * Both end on a success view. */

const CSS = `
.ecs-in{width:100%;height:52px;border-radius:14px;border:1.5px solid #e1e5ec;background:#fff;padding:0 14px;font-size:16px;outline:none;transition:border-color .15s,box-shadow .15s}
.ecs-in:focus,.ecs-in:focus-within{border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,.14)}
.ecs-drop{transition:border-color .15s,background .15s}
@media (hover:hover) and (pointer:fine){.ecs-drop:hover{border-color:#2563eb!important;background:#f5f8ff!important}}
@keyframes ecs-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
`;
const lbl = { fontSize: 13, fontWeight: 600, color: "#344054" };
const hint = { fontSize: 12.5, color: "#8a93a3" };

/* The success view, inside the sheet. */
function Done({ title, amount, sub, lines, ai }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "28px 20px 8px", textAlign: "center" }}>
      <span style={{ width: 84, height: 84, borderRadius: "50%", background: ai && !ai.ok ? "#fffaeb" : "#ecfdf3", color: ai && !ai.ok ? "#b54708" : "#067647", display: "grid", placeItems: "center", animation: "ecs-pop .5s cubic-bezier(.2,.8,.2,1)", marginBottom: 6 }}><Icon d={ai && !ai.ok ? IC.eye : IC.check} size={40} sw={2.4} /></span>
      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{title}</span>
      {amount != null && <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.1, ...tabNum }}>{inr(amount)}</span>}
      {sub && <span style={{ fontSize: 14, color: "#5b6576", lineHeight: 1.45, maxWidth: 420 }}>{sub}</span>}
      {lines?.length > 0 && (
        <div style={{ width: "100%", background: "#fff", borderRadius: 16, boxShadow: "0 0 0 1px #e4e7ec", padding: "4px 16px", margin: "6px 0", textAlign: "left" }}>
          {lines.map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", fontSize: 14, borderTop: i ? "1px solid #eef1f5" : 0 }}>
              <span style={{ color: "#5b6576", minWidth: 0, ...ell }}>{k}</span><b style={{ ...tabNum, whiteSpace: "nowrap" }}>{v}</b>
            </div>
          ))}
        </div>
      )}
      {ai && <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600, color: ai.ok ? "#067647" : "#b54708", lineHeight: 1.4 }}><Icon d={ai.ok ? IC.shield : IC.eye} size={15} />{ai.text}</span>}
    </div>
  );
}

/* Why a photo is refused on attach (extractBill's kind). */
const WRONG = {
  not_a_bill: { title: "Not the correct attachment — this is not a bill", text: "Take a photo of the printed bill or receipt itself, with the amount and date clear." },
  unreadable: { title: "Not the correct attachment — the bill could not be read", text: "Take a clear, well-lit photo of the whole printed bill and try again." },
  failed: { title: "The bill could not be checked", text: "The AI check did not answer. Choose the photo again in a moment." },
  // 17 Nov 2026: the same register as the planner's trip bills
  duplicate: { title: "This bill was already claimed", text: "A bill can be claimed once — here or on a trip." },
};

/* Money in short, for the footer: +in hand / −owed on the open claim. */
const signed = (L) => L.balance - (L.over - L.owedClosed);

export function BillSheet({ conn, me, claims = [], advances = [], today = new Date(), onClose, onSaved, onChecked, desk }) {
  const todayIso = isoDay(today);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso);
  const [file, setFile] = useState(null);
  const [thumb, setThumb] = useState(null);
  const [read, setRead] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState(null);
  const pick = useRef(null);
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);
  // A handwritten bill (16 Nov 2026, as on the planner): why only a
  // handwritten bill, and the payment proof -- or "Paid in cash".
  const [why, setWhy] = useState("");
  const [cash, setCash] = useState(false);
  const [proof, setProof] = useState(null);
  const [proofThumb, setProofThumb] = useState(null);
  const proofPick = useRef(null);
  useEffect(() => () => { if (proofThumb) URL.revokeObjectURL(proofThumb); }, [proofThumb]);
  const pickProof = (f) => {
    const err = checkFile(f);
    if (err) return setError(err);
    setError("");
    setProof(f);
    setProofThumb(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  const L = useMemo(() => ledger(claims, advances), [claims, advances]);
  const now = signed(L);
  const amt = Number(amount) || 0;
  const after = now - amt;

  const attach = (f) => {
    const err = checkFile(f);
    if (err) return setError(err);
    setError("");
    setFile(f);
    setThumb(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setRead({ busy: true, file: f });
    // The one AI run (Gemma 4 -> Clairic + Clef Flash; 16 Nov 2026): title,
    // amount and date come off the bill; the person checks them,
    // changes any if needed, and sends. The signed read goes along to the check.
    extractBill(conn, f)
      .then((x) => {
        const wrong = x.kind === "not_a_bill" ? "not_a_bill" : !x.readable ? "unreadable" : x.duplicate ? "duplicate" : null;
        if (wrong) return setRead((r) => (r?.busy && r.file === f ? { busy: false, wrong, why: x.duplicate || "" } : r));
        const what = String(x.what || x.vendor || "").trim();
        setTitle(what ? what.charAt(0).toUpperCase() + what.slice(1, 60) : "");
        setAmount(x.amount ? String(x.amount) : "");
        setDate(x.date && x.date <= todayIso ? x.date : todayIso);
        setRead((r) => (r?.busy && r.file === f ? { busy: false, filled: !!(x.amount || x.date || what), signed: x.signed || null, manual: !!x.skipped, handwritten: !!x.handwritten } : r));
      })
      .catch(() => setRead((r) => (r?.busy && r.file === f ? { busy: false, wrong: "failed" } : r)));
  };

  const missing = !file ? "Add a photo of the bill"
    : read?.busy ? "Wait a moment — the bill is being read"
    : read?.wrong ? WRONG[read.wrong].title
    : !title.trim() ? "Say what it was for"
    : !amt ? "Enter the bill amount"
    : read?.handwritten && why.trim().length < 5 ? "Say why you have only a handwritten bill"
    : read?.handwritten && !cash && !proof ? "Add the payment proof — or tick “Paid in cash”" : "";
  const submit = async () => {
    setTried(true);
    if (missing) return setError(missing);
    setError("");
    const toLine = (l) => ({ id: l.id, type: l.type, sub: "", date: l.date, note: l.note, amount: l.amount, bill: l.bill });
    const mine = (bill, id) => ({ id, type: "Miscellaneous", sub: "", date, note: title.trim(), amount: amt, bill });
    let name, row, before, waiting = [], proofUrl = null;
    try {
      setBusy("Saving…");
      // Onto the LATEST open claim: another bill (or its background check) may
      // have saved it a moment ago -- then read it again and retry. Two first
      // bills at once: the second finds the claim the first just opened.
      name = await retryOnConflict(async () => {
        const open = await fetchOpenClaim(conn, me.id);
        before = new Set((open?.lines || []).map((l) => l.id));
        return saveClaim(conn, { claim: open || undefined, employee: me.id, postingDate: open?.posting || todayIso, remark: open?.remark || "", running: true, lines: [...(open ? open.lines.map(toLine) : []), mine("")] });
      }, /already has an open claim/i);
      setBusy("Uploading the bill…");
      // the bill and its payment proof (the approvers open it too) side by side
      const [up, upProof] = await Promise.all([
        uploadClaimFile(conn, name, file),
        read?.handwritten && !cash && proof ? uploadClaimFile(conn, name, proof) : null,
      ]);
      const url = up.file_url;
      if (upProof) proofUrl = upProof.file_url;
      await retryOnConflict(async () => {
        const fresh = await fetchClaim(conn, name);
        row = row || fresh.lines.filter((l) => !before.has(l.id) && !l.bill && l.note === title.trim() && l.amount === amt && l.date === date).pop()?.id;
        if (!row) throw new Error("The bill was saved but could not be found again to attach its photo.");
        // Older bills still "Checking" (a check that never ran) go along with this one.
        waiting = fresh.lines.filter((l) => l.id !== row && l.bill && (l.state || "Checking") === "Checking").map((l) => l.id);
        await saveClaim(conn, { claim: fresh, employee: me.id, postingDate: fresh.posting, remark: fresh.remark, running: true, lines: fresh.lines.map((l) => (l.id === row ? mine(url, row) : toLine(l))) });
      });
    } catch (e) {
      setBusy("");
      if (name) invalidateClaims(conn, me.id);
      return setError(e.message);
    }
    // The score (16 Nov 2026, user): Gemma is near perfect, so the form only
    // fills in what it read and the person changes anything wrong. The score
    // -- what was sent against what was read -- is worked out here, quietly
    // (plain code, no AI), and shown only to the approvers with the risk. The
    // person is told nothing about it. If it fails, the bill stays "Checking"
    // and is scored when it is sent for approval.
    setBusy("Saving…");
    let scored = false;
    try {
      const hand = read?.handwritten ? { why: why.trim(), cash, proof: cash ? null : proofUrl } : undefined;
      await checkClaim(conn, name, [row, ...waiting], read?.signed ? { [row]: { ...read.signed, hand } } : undefined);
      scored = true;
    } catch (e) {
      console.warn("[expense-claims] bill score:", e.message);
    }
    // ...and sent for approval right away (16 Nov 2026, user: no second step).
    // Just this bill -- one sent back stays with the rep until it is fixed.
    // If this fails, the Settlements page offers "Send for approval" for it.
    let sent = null;
    if (scored) {
      setBusy("Sending for approval…");
      sent = await sendBillsForApproval(conn, [row]).catch((e) => { console.warn("[expense-claims] send:", e.message); return null; });
    }
    invalidateClaims(conn, me.id);
    onChecked?.();
    setBusy("");
    const first = sent?.requests?.[0];
    const lines = [[`${title.trim()} · ${shortDate(date)}`, inr(amt)]];
    if (first && waitingOn(first)) lines.push(["Now", waitingOn(first).replace(/^with/, "With")]);
    setDone({ name, sent: !!first, lines });
  };

  const close = () => (done ? onSaved?.({ name: done.name, message: done.sent ? "Sent for approval" : "Bill added" }) : onClose?.());
  const footer = done ? (
    <button type="button" className="ec-cta" onClick={close} style={{ ...btn.primary, flex: 1, height: 50, borderRadius: 14, fontSize: 16 }}>Done</button>
  ) : (
    <>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 12, color: "#5b6576" }}>{!amt ? (now >= 0 ? "In hand now" : "Owed to you now") : after >= 0 ? "In hand after this" : "Owed to you after this"}</span>
        <b style={{ fontSize: 22, letterSpacing: "-0.02em", color: (amt ? after : now) < 0 ? "#b42318" : "#0b1220", ...tabNum }}>{inr(Math.abs(amt ? after : now))}</b>
      </div>
      <button type="button" className="ec-cta" disabled={!!busy} onClick={submit} style={{ ...btn.primary, height: 50, padding: "0 22px", borderRadius: 14, fontSize: 15.5, display: "flex", alignItems: "center", gap: 8, opacity: missing && tried ? 0.55 : 1 }}>
        {busy ? <><Spinner size={14} />{busy}</> : <><Icon d={IC.arrow} size={18} />Send for approval</>}
      </button>
    </>
  );

  return (
    <Sheet title={done ? "" : "Add a bill"} sub={done ? null : "Take a photo of your bill — the details fill in by themselves."}
      onClose={close} desktop="dialog" maxWidth={520} footer={footer}>
      <style>{CSS}</style>
      {done ? <Done title={done.sent ? "Sent for approval" : "Bill added"} amount={amt} lines={done.lines} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: desk ? "18px 24px 20px" : "14px 16px 18px" }}>
          <button type="button" className="ecs-drop" onClick={() => pick.current?.click()}
            style={{ display: "flex", flexDirection: file ? "row" : "column", alignItems: "center", justifyContent: "center", gap: file ? 12 : 6, width: "100%", minHeight: file ? 76 : 150, padding: file ? "10px 12px" : "18px 14px", borderRadius: 16, border: `1.5px ${file ? "solid" : "dashed"} ${read?.wrong ? "#f04438" : file ? "#12b76a" : tried && !file ? "#f04438" : "#b2c8f7"}`, background: read?.wrong ? "#fef3f2" : file ? "#f6fef9" : "#f5f8ff", color: "#0b1220", textAlign: file ? "left" : "center", cursor: "pointer" }}>
            {file ? (
              <>
                {thumb ? <img src={thumb} alt="" style={{ width: 54, height: 54, borderRadius: 10, objectFit: "cover", flex: "none", boxShadow: "0 0 0 1px #e4e7ec" }} />
                  : <span style={{ width: 54, height: 54, borderRadius: 10, flex: "none", display: "grid", placeItems: "center", background: "#fff", boxShadow: "0 0 0 1px #e4e7ec", color: "#475467" }}><Icon d={IC.file} size={22} /></span>}
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, ...ell }}>{file.name}</span>
                  <span style={{ fontSize: 12.5, color: read?.wrong ? "#b42318" : read?.busy ? "#475467" : "#067647", fontWeight: 600 }}>{read?.wrong ? (read.wrong === "failed" ? "Could not check it" : "Not the correct attachment") : read?.busy ? "Reading the bill…" : "Photo added"}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8" }}>{read?.wrong ? "Choose another" : "Change"}</span>
              </>
            ) : (
              <>
                <span style={{ color: "#2563eb", display: "flex", marginBottom: 4 }}><Icon d={IC.camera} size={30} /></span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Take a photo of your bill</span>
                <span style={hint}>Keep the amount and date clear</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1d4ed8", textDecoration: "underline", textUnderlineOffset: 3, marginTop: 4 }}>Choose photo</span>
              </>
            )}
          </button>
          <input ref={pick} type="file" accept={ATTACH_ACCEPT} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) attach(f); }} />
          {read?.wrong ? (
            <div role="alert" style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 14, background: "#fef3f2", color: "#b42318" }}>
              <span style={{ display: "flex", flex: "none", marginTop: 1 }}><Icon d={IC.x} size={18} sw={2.2} /></span>
              <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <b style={{ fontSize: 13.5 }}>{WRONG[read.wrong].title}</b>
                <span style={{ fontSize: 13, color: "#7a271a", lineHeight: 1.45 }}>{read.wrong === "duplicate" && read.why ? `${read.why} ` : ""}{WRONG[read.wrong].text} Nothing has been saved.</span>
              </span>
            </div>
          ) : null}

          {file && read?.busy && (
            <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 14, background: "#f5f8ff", color: "#1d4ed8", fontSize: 14, fontWeight: 600 }}>
              <Spinner size={16} />Reading the bill — title, amount and date fill in by themselves…
            </div>
          )}
          {file && !read?.busy && !read?.wrong && (
            <>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={lbl}>What was it for</span>
              <input className="ecs-in" placeholder="e.g. Fuel – Salem trip, Team lunch" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} style={{ borderColor: tried && !title.trim() ? "#f04438" : undefined }} />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <span style={lbl}>Bill amount</span>
                <span className="ecs-in" style={{ display: "flex", alignItems: "center", gap: 8, height: 58, borderColor: tried && !amt ? "#f04438" : undefined }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#475467" }}>₹</span>
                  <input inputMode="decimal" placeholder="0" aria-label="Bill amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", ...tabNum }} />
                </span>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <span style={lbl}>Bill date</span>
                <input type="date" className="ecs-in" max={todayIso} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ height: 58, fontSize: 15 }} />
              </label>
            </div>
            <span style={{ ...hint, marginTop: -8, color: read?.filled ? "#b54708" : hint.color }}>{read?.filled ? "Filled from the bill — change anything only if it is wrong" : read?.manual ? "Type the total and the date exactly as on the bill" : "Could not read these off the bill — type them exactly as on it"}</span>
            {read?.handwritten && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, borderRadius: 14, background: "#fffaeb", boxShadow: "0 0 0 1px #fedf89" }}>
                <b style={{ fontSize: 13.5, color: "#93370d" }}>This is a handwritten bill</b>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={lbl}>Why only a handwritten bill?</span>
                  <textarea className="ecs-in" rows={2} value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Local taxi — they give only handwritten bills"
                    style={{ height: "auto", minHeight: 64, padding: "10px 12px", fontSize: 14, resize: "vertical", borderColor: tried && why.trim().length < 5 ? "#f04438" : undefined }} />
                </label>
                <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={lbl}>Payment proof</span>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#344054", cursor: "pointer" }}>
                      <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#2563eb" }} />
                      Paid in cash
                    </label>
                  </span>
                  {cash ? (
                    <span style={{ fontSize: 12.5, color: "#5b6576" }}>No proof needed — paid in cash.</span>
                  ) : proof ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, background: "#f6fef9", boxShadow: "0 0 0 1px #abefc6" }}>
                      {proofThumb ? <img src={proofThumb} alt="Payment proof" style={{ width: 40, height: 48, borderRadius: 8, objectFit: "cover", flex: "none" }} /> : <Icon d={IC.file} size={18} />}
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "#067647", ...ell }}>{proof.name || "Payment proof"}</span>
                      <button type="button" onClick={() => proofPick.current?.click()} style={{ border: 0, background: "transparent", fontSize: 13, fontWeight: 600, color: "#1d4ed8", cursor: "pointer" }}>Change</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => proofPick.current?.click()}
                      style={{ minHeight: 46, borderRadius: 12, border: `1.5px dashed ${tried ? "#f04438" : "#b2c8f7"}`, background: "#f5f8ff", color: "#1d4ed8", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                      Add payment proof · GPay / UPI / bank screenshot
                    </button>
                  )}
                  <input ref={proofPick} type="file" accept={ATTACH_ACCEPT} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickProof(f); }} />
                </span>
              </div>
            )}

            </>
          )}

          {error && <Note>{error}</Note>}
        </div>
      )}
    </Sheet>
  );
}

export function CashSheet({ conn, me, claims = [], advances = [], today = new Date(), onClose, onSaved, desk }) {
  const L = useMemo(() => ledger(claims, advances), [claims, advances]);
  const owed = L.over;
  const [amount, setAmount] = useState("");
  const [what, setWhat] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const amt = Number(amount) || 0;
  const submit = async () => {
    if (!amt) return setError("Enter the amount");
    if (what.trim().length < 3) return setError("Say what it is for");
    setError("");
    let name;
    try {
      setBusy("Sending…");
      // up the approval chain (16 Nov 2026); the CEO's approval makes it Verified
      name = (await requestCashThroughChain(conn, { amount: amt, purpose: what.trim() }))?.id;
    } catch (e) {
      setBusy("");
      return setError(e.message);
    }
    invalidateClaims(conn, me.id);
    setBusy("");
    setDone({ name });
  };
  const close = () => (done ? onSaved?.({ name: done.name, message: "Cash requested" }) : onClose?.());
  const footer = done ? (
    <button type="button" className="ec-cta" onClick={close} style={{ ...btn.primary, flex: 1, height: 50, borderRadius: 14, fontSize: 16 }}>Done</button>
  ) : (
    <>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ fontSize: 12, color: "#5b6576" }}>Request</span><b style={{ fontSize: 22, letterSpacing: "-0.02em", ...tabNum }}>{inr(amt)}</b></div>
      <button type="button" className="ec-cta" disabled={!!busy} onClick={submit} style={{ ...btn.primary, height: 48, padding: "0 22px", borderRadius: 14, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>{busy ? <><Spinner size={14} />{busy}</> : "Request"}</button>
    </>
  );
  return (
    <Sheet title={done ? "" : "Request cash"} sub={done ? null : `In hand now: ${inr(L.balance)}`} onClose={close} desktop="dialog" maxWidth={520} footer={footer}>
      <style>{CSS}</style>
      {done ? <Done title="Cash requested" amount={amt} sub={`${what.trim()} · It goes to your managers for approval, up to the CEO, whose approval verifies it. Track it under Settlements.`} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: desk ? "16px 24px 20px" : "12px 16px 18px" }}>
          {/* Verified is final for now (nothing booked); Accounts settle what is owed
              later, so it is not something to ask for as cash. */}
          {owed > 0 && <Note tone="info">{inr(owed)} of verified bills is owed to you — Accounts settle it with you later, no need to ask for it. Request cash only for spending ahead.</Note>}
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={lbl}>Amount</span>
            <span className="ecs-in" style={{ display: "flex", alignItems: "center", gap: 8, height: 58 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "#475467" }}>₹</span>
              <input inputMode="decimal" placeholder="0" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 22, fontWeight: 800, ...tabNum }} />
            </span>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={lbl}>What for</span>
            <input className="ecs-in" placeholder="e.g. CME camp in Madurai" value={what} maxLength={140} onChange={(e) => setWhat(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 14, background: "#f7f8fa" }}>
            <span style={{ color: "#7c3aed", display: "flex", flex: "none", marginTop: 1 }}><Icon d={IC.wallet} size={18} /></span>
            <span style={{ fontSize: 13, color: "#5b6576", lineHeight: 1.45 }}>Your managers approve it, one after the other, up to the CEO — his approval verifies it.</span>
          </div>
          {error && <Note>{error}</Note>}
        </div>
      )}
    </Sheet>
  );
}
