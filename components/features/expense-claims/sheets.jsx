"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ATTACH_ACCEPT, checkClaim, checkFile, extractBill, fetchClaim, fetchOpenClaim, invalidateClaims, requestAdvance, retryOnConflict, saveClaim,
  uploadClaimFile, warmBillReader,
} from "./data/claimsApi";
import { IC, Icon, Note, Sheet, Spinner, btn, ell, tabNum } from "./ui";
import { inr, isoDay, ledger, shortDate } from "./model";

/* The settlement sheets (Miscellaneous), in the app's theme:
 *
 *   BillSheet  "Add a bill" -- the AI bill check form: what it was for, a
 *              photo of the bill (Docling reads it: an unreadable photo is
 *              refused and nothing is saved; it fills only the general title),
 *              the amount and the date the person types from the bill.
 *              "Check my bill" adds it to the person's open claim; in the
 *              background the AI compares the bill (Docling's read + the
 *              photo) with what they typed: 90+ is Verified and counts,
 *              anything else goes to Accounts to check. No reporting officer.
 *   CashSheet  "Request cash" -- an Employee Advance for Accounts to approve
 *              and pay. Someone owed money asks for exactly that ("Settle").
 *              Paying it closes the open claim: its bills come out of the
 *              cash first, the rest is theirs to spend.
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
const SCAN = "M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10";

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

/* What the AI check made of the new bill. */
/* Saved; the check runs in the background (nobody waits for the AI). */
const CHECKING = { ok: false, title: "Bill saved", text: "The AI is checking it in the background — it shows Verified, or goes to Accounts, in a minute. You can add the next bill now." };


/* Why a photo is refused on attach (extractBill's kind). */
const WRONG = {
  handwritten: { title: "Not the correct attachment — this is a handwritten bill", text: "Only printed bills are accepted. Ask the shop for a printed bill or receipt and take a photo of that." },
  not_a_bill: { title: "Not the correct attachment — this is not a bill", text: "Take a photo of the printed bill or receipt itself, with the amount and date clear." },
  unreadable: { title: "Not the correct attachment — the bill could not be read", text: "Take a clear, well-lit photo of the whole printed bill and try again." },
  failed: { title: "The bill could not be checked", text: "The AI check did not answer. Choose the photo again in a moment." },
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
  useEffect(() => { warmBillReader(); }, []); // Docling starts while the photo is taken
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);

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
    setRead({ busy: true });
    extractBill(conn, f, "Miscellaneous")
      .then((x) => {
        // Handwritten, not a bill or unreadable is refused here. No verdict on a readable
        // bill (an older verify-doc) goes through: the check on send still caps a
        // handwritten bill and sends it to Accounts.
        const wrong = x.kind === "handwritten" || x.kind === "not_a_bill" ? x.kind : !x.readable ? "unreadable" : null;
        if (wrong) return setRead((r) => (r?.busy ? { busy: false, wrong } : r));
        // The amount and date are the person's own: never filled from the read
        // (Docling misreads handwriting). The check after submit compares them.
        setRead((r) => (r?.busy ? { busy: false } : r));
        const what = String(x.what || x.vendor || "").trim();
        if (what) setTitle((t) => t || what.charAt(0).toUpperCase() + what.slice(1, 60));
      })
      .catch(() => setRead((r) => (r?.busy ? { busy: false, wrong: "failed" } : r)));
  };

  const missing = !title.trim() ? "Say what it was for"
    : !file ? "Add a photo of the printed bill"
    : read?.wrong ? WRONG[read.wrong].title
    : !amt ? "Enter the bill amount" : "";
  const submit = async () => {
    setTried(true);
    if (missing) return setError(missing);
    setError("");
    const toLine = (l) => ({ id: l.id, type: l.type, sub: "", date: l.date, note: l.note, amount: l.amount, bill: l.bill });
    const mine = (bill, id) => ({ id, type: "Miscellaneous", sub: "", date, note: title.trim(), amount: amt, bill });
    let name, row, before, waiting = [];
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
      const url = (await uploadClaimFile(conn, name, file)).file_url;
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
    // The check runs on its own: the person is not held up. Whatever it decides
    // reaches the page through onChecked (a bill it misses stays "Checking" and
    // goes along with the next bill's check).
    checkClaim(conn, name, [row, ...waiting])
      .catch((e) => console.warn("[expense-claims] background check:", e.message))
      .finally(() => { invalidateClaims(conn, me.id); onChecked?.(); });
    invalidateClaims(conn, me.id);
    setBusy("");
    const v = CHECKING;
    setDone({
      name, v,
      lines: [
        [`${title.trim()} · ${shortDate(date)}`, inr(amt)],
        v.ok ? (after >= 0 ? ["In hand now", inr(after)] : ["Owed to you", inr(-after)]) : ["Counts", "once verified"],
      ],
    });
  };

  const close = () => (done ? onSaved?.({ name: done.name, verified: done.v.ok, message: done.v.title }) : onClose?.());
  const footer = done ? (
    <button type="button" className="ec-cta" onClick={close} style={{ ...btn.primary, flex: 1, height: 50, borderRadius: 14, fontSize: 16 }}>Done</button>
  ) : (
    <>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 12, color: "#5b6576" }}>{!amt ? (now >= 0 ? "In hand now" : "Owed to you now") : after >= 0 ? "In hand after this" : "Owed to you after this"}</span>
        <b style={{ fontSize: 22, letterSpacing: "-0.02em", color: (amt ? after : now) < 0 ? "#b42318" : "#0b1220", ...tabNum }}>{inr(Math.abs(amt ? after : now))}</b>
      </div>
      <button type="button" className="ec-cta" disabled={!!busy} onClick={submit} style={{ ...btn.primary, height: 50, padding: "0 22px", borderRadius: 14, fontSize: 15.5, display: "flex", alignItems: "center", gap: 8, opacity: missing && tried ? 0.55 : 1 }}>
        {busy ? <><Spinner size={14} />{busy}</> : <><Icon d={IC.shield} size={18} />Check my bill</>}
      </button>
    </>
  );

  return (
    <Sheet title={done ? "" : "Add a bill"} sub={done ? null : "Take a photo of your printed bill — we check it for you."}
      chips={done ? null : <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#1d4ed8" }}><Icon d={SCAN} size={13} />AI bill check</span>}
      onClose={close} desktop="dialog" maxWidth={520} footer={footer}>
      <style>{CSS}</style>
      {done ? <Done title={done.v.title} amount={amt} lines={done.lines} ai={{ ok: done.v.ok, text: done.v.text }} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: desk ? "18px 24px 20px" : "14px 16px 18px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={lbl}>What was it for</span>
            <input className="ecs-in" placeholder="e.g. Fuel – Salem trip, Team lunch" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} style={{ borderColor: tried && !title.trim() ? "#f04438" : undefined }} />
          </label>

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
                <span style={{ fontSize: 15, fontWeight: 700 }}>Take a photo of your printed bill</span>
                <span style={hint}>Keep the amount and date clear</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2, padding: "3px 10px", borderRadius: 99, background: "#fffaeb", color: "#b54708", fontSize: 12, fontWeight: 700 }}><Icon d={IC.file} size={12} />Printed bills only — no handwritten bills</span>
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
                <span style={{ fontSize: 13, color: "#7a271a", lineHeight: 1.45 }}>{WRONG[read.wrong].text} Nothing has been saved.</span>
              </span>
            </div>
          ) : null}

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
          <span style={{ ...hint, marginTop: -8 }}>Type the total and the date exactly as on the bill</span>

          <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 14, background: "#f7f8fa" }}>
            <span style={{ color: "#1d4ed8", display: "flex", flex: "none", marginTop: 1 }}><Icon d={IC.shield} size={18} /></span>
            <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <b style={{ fontSize: 13.5 }}>What happens next?</b>
              <span style={{ fontSize: 13, color: "#5b6576", lineHeight: 1.45 }}>Only printed bills are accepted — a handwritten bill or any other photo is refused. The AI compares the bill with what you entered: a match is verified at once and counts straight away; anything unusual goes to Accounts to check — never rejected silently.</span>
            </span>
          </div>
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
      name = await requestAdvance(conn, { employee: me.id, amount: amt, purpose: what.trim(), date: isoDay(today) });
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
      {done ? <Done title="Cash requested" amount={amt} sub={`${what.trim()} · Accounts approve it and pay you. Your next verified bills come out of it first — the rest is yours to spend.`} /> : (
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
            <span style={{ fontSize: 13, color: "#5b6576", lineHeight: 1.45 }}>Accounts approve it and pay you. Bills you have added since your last cash come out of it first; what is left is yours to spend.</span>
          </div>
          {error && <Note>{error}</Note>}
        </div>
      )}
    </Sheet>
  );
}
