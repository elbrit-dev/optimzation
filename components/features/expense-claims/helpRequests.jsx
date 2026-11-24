"use client";

/* The rep's settlement help requests (24 Nov 2026, the user): a card in the
   Settlements page's Highlights opens this sheet. It only SHOWS the requests
   the rep raised (they are raised from the Add-a-bill form's "Something wrong
   with this bill? Help") -- no raising here. A request opens as a thread:
   where it stands (Raised -> Team replied -> Resolved), what the rep asked,
   the team's replies, and a reply bar at the bottom while it is open.
   ERP: Server Script "Field Trip Help API" (action=settle / reply). */
import { useEffect, useRef, useState } from "react";
import { replyBillHelp } from "./data/claimsApi";
import { IC, Icon, Note, Sheet, Spinner, ell } from "./ui";
import { shortDate } from "./model";

export const HELP_STATE = {
  raised: { label: "Raised", fg: "#1d4ed8", bg: "#eef3fe", icon: "help" },
  replied: { label: "Team replied", fg: "#b54708", bg: "#fffaeb", icon: "help" },
  done: { label: "Resolved", fg: "#067647", bg: "#ecfdf3", icon: "check" },
};
const CSS = `
.ehr-row{transition:background .12s}
.ehr-row:hover{background:#f8fafc!important}
.ehr-row:focus-visible,.ehr-send:focus-visible,.ehr-back:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
.ehr-in{flex:1;min-width:0;max-height:120px;resize:none;border:0;outline:none;background:transparent;font:inherit;font-size:15px;line-height:1.45;color:#0b1220;padding:10px 0}
.ehr-box:focus-within{box-shadow:0 0 0 1.5px #2563eb,0 0 0 4px rgba(37,99,235,.12)!important}`;

const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || "")) ? shortDate(String(s).slice(0, 10)) : "");
// "2026-11-24 15:40:00" -> "24 Nov, 3:40 pm"
const when = (s) => {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ""));
  if (!m) return day(s);
  const h = +m[2];
  return `${shortDate(m[1])}, ${h % 12 || 12}:${m[3]} ${h < 12 ? "am" : "pm"}`;
};
const initials = (n) => String(n || "?").split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

const Tag = ({ state }) => {
  const s = HELP_STATE[state] || HELP_STATE.raised;
  return (
    <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, padding: "3px 9px 3px 7px", borderRadius: 99, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.fg }} />{s.label}
    </span>
  );
};

/* Raised -> Team replied -> Resolved: a real sequence, so a step line */
function Steps({ t }) {
  const at = t.closed ? 2 : t.teamReplies ? 1 : 0;
  const steps = ["Raised", "Team replied", "Resolved"];
  return (
    <ol aria-label="Where it stands" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
      {steps.map((s, i) => {
        const done = i <= at;
        const now = i === at;
        return (
          <li key={s} aria-current={now ? "step" : undefined} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            {i > 0 && <span aria-hidden style={{ position: "absolute", zIndex: 0, top: 9, right: "50%", width: "100%", height: 2, background: i <= at ? "#2563eb" : "#e4e7ec" }} />}
            <span aria-hidden style={{ position: "relative", zIndex: 1, width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", background: done ? "#2563eb" : "#fff", boxShadow: done ? (now ? "0 0 0 4px rgba(37,99,235,.15)" : "none") : "inset 0 0 0 2px #d0d5dd", color: "#fff" }}>
              {done && <Icon d={IC.check} size={11} sw={3} />}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: now ? 700 : 500, color: done ? "#0b1220" : "#8a93a3", textAlign: "center" }}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Bubble({ mine, by, at, text }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", justifyContent: mine ? "flex-end" : "flex-start" }}>
      {!mine && <span aria-hidden style={{ flex: "none", marginTop: 24, width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", background: "#eef3fe", color: "#1d4ed8", fontSize: 11.5, fontWeight: 700 }}>{initials(by)}</span>}
      <div style={{ maxWidth: "82%", display: "flex", flexDirection: "column", gap: 4, alignItems: mine ? "flex-end" : "flex-start" }}>
        {!mine && <span style={{ fontSize: 12, fontWeight: 600, color: "#344054", paddingLeft: 4 }}>{by}</span>}
        <div style={{ padding: "10px 14px", fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
          borderRadius: mine ? "18px 18px 6px 18px" : "18px 18px 18px 6px", background: mine ? "#2563eb" : "#f2f4f7", color: mine ? "#fff" : "#0b1220" }}>{text || "—"}</div>
        <span style={{ fontSize: 11, color: "#8a93a3", padding: "0 4px" }}>{mine ? "You · " : ""}{when(at)}</span>
      </div>
    </div>
  );
}

/* The highlight card's numbers: "2 open" / "help · 1 replied" */
export function helpHighlight(list, onOpen) {
  if (!list?.length) return null;
  const open = list.filter((t) => !t.closed).length;
  const replied = list.filter((t) => t.state === "replied").length;
  return {
    key: "help", tone: replied ? "reward" : "field", onClick: onOpen,
    value: open ? `${open} open` : `${list.length} resolved`,
    label: replied ? `help · ${replied} replied` : `help ${list.length === 1 ? "request" : "requests"}`,
    tip: "Your help requests",
  };
}

export function HelpRequestsSheet({ conn, list, onClose, onChanged, desk }) {
  const [openName, setOpenName] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = openName ? list.find((x) => x.name === openName) : null;
  const endRef = useRef(null);
  const inRef = useRef(null);
  // a thread opens at its latest message
  useEffect(() => { if (t) endRef.current?.scrollIntoView({ block: "end" }); }, [openName, t?.replies.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // the reply box grows with what is typed (up to its max height)
  useEffect(() => { const el = inRef.current; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }, [text]);

  const send = async () => {
    if (busy || text.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      await replyBillHelp(conn, t.name, text);
      setText("");
      await onChanged?.();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };
  const ready = text.trim().length >= 2 && !busy;

  const footer = !t ? null : t.closed ? (
    <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, fontSize: 13, color: "#5b6576" }}>
      <Icon d={IC.check} size={14} />Resolved — raise a new request from the bill form if something is still wrong
    </span>
  ) : (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      {error && <Note>{error}</Note>}
      <div className="ehr-box" style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "2px 4px 2px 16px", borderRadius: 24, background: "#f8fafc", boxShadow: "0 0 0 1px #e4e7ec" }}>
        <textarea ref={inRef} className="ehr-in" rows={1} value={text} maxLength={1000} disabled={busy} aria-label="Reply to the team" placeholder="Reply to the team…"
          onChange={(e) => { setText(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && desk) { e.preventDefault(); send(); } }} />
        <button type="button" className="ehr-send" aria-label="Send reply" disabled={!ready} onClick={send}
          style={{ flex: "none", width: 40, height: 40, margin: "3px 0", borderRadius: "50%", border: 0, display: "grid", placeItems: "center", background: ready ? "#2563eb" : "#e4e7ec", color: ready ? "#fff" : "#98a2b3", cursor: ready ? "pointer" : "default", transition: "background .15s" }}>
          {busy ? <Spinner size={14} /> : <Icon d={IC.arrow} size={18} sw={2.4} />}
        </button>
      </div>
    </div>
  );

  return (
    <Sheet title={t ? t.title : "Help requests"}
      sub={t ? `${day(t.day) ? `Bill of ${day(t.day)} · ` : ""}raised ${day(t.created)}` : `${list.length} ${list.length === 1 ? "request" : "requests"} you raised on your bills`}
      chips={t ? <Tag state={t.state} /> : null}
      onClose={onClose} desktop="dialog" maxWidth={520} footer={footer}>
      <style>{CSS}</style>
      {!t ? (
        <div style={{ padding: desk ? "8px 12px 18px" : "6px 8px 16px" }}>
          {list.length ? list.map((x, i) => {
            const s = HELP_STATE[x.state] || HELP_STATE.raised;
            const last = x.replies[x.replies.length - 1];
            const preview = last ? `${last.mine ? "You" : last.by.split(" ")[0]}: ${last.text}` : x.asked;
            return (
              <button key={x.name} type="button" className="ehr-row" onClick={() => { setOpenName(x.name); setText(""); setError(""); }}
                style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 10px", border: 0, borderTop: i ? "1px solid #eef1f5" : 0, borderRadius: 12, background: "transparent", textAlign: "left", cursor: "pointer", font: "inherit", color: "#0b1220" }}>
                <span aria-hidden style={{ flex: "none", width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: s.bg, color: s.fg }}><Icon d={IC[s.icon]} size={18} /></span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <b style={{ flex: 1, minWidth: 0, fontSize: 14.5, ...ell }}>{x.title}</b>
                    <span style={{ flex: "none", fontSize: 11.5, color: "#8a93a3" }}>{day(last?.at || x.created)}</span>
                  </span>
                  <span style={{ fontSize: 13, color: x.state === "replied" ? "#0b1220" : "#5b6576", fontWeight: x.state === "replied" ? 600 : 400, ...ell }}>{preview || "—"}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                    <Tag state={x.state} />
                    {day(x.day) && <span style={{ fontSize: 11.5, color: "#8a93a3" }}>Bill of {day(x.day)}</span>}
                  </span>
                </span>
              </button>
            );
          }) : <Note tone="info" style={{ margin: 8 }}>No help requests yet. If something is wrong with a bill, tap “Help” on the bill form after adding its photo.</Note>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: desk ? "12px 24px 20px" : "10px 16px 18px" }}>
          <button type="button" className="ehr-back" onClick={() => setOpenName(null)}
            style={{ alignSelf: "flex-start", minHeight: 36, display: "flex", alignItems: "center", gap: 2, padding: "0 10px 0 4px", marginLeft: -4, borderRadius: 10, border: 0, background: "transparent", color: "#1d4ed8", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
            <Icon d={IC.back} size={16} />All requests
          </button>
          <div style={{ padding: "14px 10px 12px", borderRadius: 16, background: "#f8fafc" }}><Steps t={t} /></div>
          <div role="log" aria-label="Messages" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Bubble mine at={t.created} text={t.asked} />
            {t.replies.map((c, i) => <Bubble key={i} mine={c.mine} by={c.by} at={c.at} text={c.text} />)}
            {!t.closed && !t.teamReplies && (
              <span style={{ alignSelf: "center", fontSize: 12, color: "#8a93a3", padding: "4px 12px", borderRadius: 99, background: "#f2f4f7" }}>The expense team will reply here</span>
            )}
            <span ref={endRef} />
          </div>
        </div>
      )}
    </Sheet>
  );
}
