import React from "react";
import { readSegmentState, segmentRing } from "./ringGeometry";

/**
 * HomeNavRings — the home-screen quick-action nav row, as Instagram-style story rings.
 *
 * One tile per action category (Approval / Visit / Secondary / Gift / Service). Each tile
 * carries three independent signals plus two list-level rules:
 *   1. RING     — split into one SEGMENT PER EVENT; green = done, red = pending. A category
 *                 with no work at all draws a solid green ring ("all clear").
 *   2. BADGE    — the absolute pending count, top-right. Hidden when nothing is pending.
 *   3. SUB      — when the next one is due ("due 4:00 pm" / "due tomorrow" / "all clear").
 *                 Red is reserved for the SINGLE most urgent category, so it stays a signal.
 *   4. ORDER    — soonest deadline first; fully-cleared categories sink to the end.
 *   5. CLEARED  — green ring + green disc, muted (not disabled — still tappable).
 *
 * Drop it straight onto a Plasmic page and bind `data`. Nothing else to assemble in Studio.
 *
 * DATA (`data` prop) — tolerant of shape. It accepts any of:
 *   - an array of categories        [ {...}, {...} ]
 *   - a GraphQL connection          { edges: [{ node }] }
 *   - a wrapper object              { categories: [...] } | { items: [...] } | { rows: [...] }
 *   - an object keyed by category   { apr: {...}, vis: {...} }
 *
 * Each category is read with these fields (first alias found wins):
 *   key      key | id | code | type                  — stable id, also picks the icon
 *   label    label | name | title                    — the caption
 *   icon     icon                                    — approval|visit|secondary|gift|service
 *   events   events | items | tasks                  — one entry per event; done-ness read from
 *                                                      done | completed | is_done | isDone, or a
 *                                                      status string containing done/complete/approved
 *   segments segments | done                         — OR pass the booleans directly
 *   total + pending                                  — OR just the two counts, and we build the
 *                                                      segments for you
 *   dueAt    dueAt | due | due_date | dueDate | next_due   — ISO string or Date, drives ORDER
 *   dueLabel dueLabel | sub | subLabel               — overrides the computed "due ..." text
 *
 * Anything missing degrades quietly: no events -> "all clear"; no dueAt -> no sort key (sinks
 * below dated categories); unknown key -> a neutral clock icon.
 *
 * `onSelect` fires with the whole normalised category so you can route from Studio.
 *
 * Note on SSR: the relative due text ("due 4:00 pm" / "due tomorrow") depends on the current
 * clock and timezone, so it is computed AFTER mount to avoid a hydration mismatch. Pass an
 * explicit `dueLabel` in the data if you need it painted on the first frame.
 */

const STYLE_ID = "elbrit-home-nav-rings-styles";

// Spoken form of each segment state, for the tile's aria-label.
const STATE_WORDS = {
  done: "complete",
  waiting: "in progress",
  none: "not started",
  rejected: "rejected",
};

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .enav{--enav-th:5px;--enav-size:62px;--enav-ink:#0f172a;--enav-ink2:#64748b;
      --enav-good:#16a34a;--enav-good-bg:#f0fdf4;--enav-bad:#dc2626;
      --enav-accent:#2563eb;--enav-accent-bg:#eff6ff;--enav-track:#f1f5f9;
      position:relative;width:100%;box-sizing:border-box;
      font:400 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}
    .enav *{box-sizing:border-box}
    /* Centred while everything fits, left-aligned once it scrolls — a stretched row of three
       tiles reads as a broken layout, and a centred row you can scroll hides its first tile. */
    .enav-scroll{display:flex;align-items:flex-start;justify-content:center;gap:18px;
      padding:2px 12px 12px;
      overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch}
    .enav-scroll::-webkit-scrollbar{display:none}
    /* Only fades when there is genuinely more to reach — see the overflow observer below. */
    .enav.is-overflowing .enav-scroll{justify-content:flex-start;
      -webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent);
      mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent)}

    .enav-tile{flex:0 0 auto;min-width:70px;display:flex;flex-direction:column;align-items:center;gap:5px;
      padding:2px 0 0;background:none;border:0;cursor:pointer;font-family:inherit;color:inherit;
      border-radius:14px;transition:opacity .12s,transform .12s}
    .enav-tile:hover{transform:translateY(-1px)}
    .enav-tile:focus-visible{outline:2px solid var(--enav-accent);outline-offset:3px}
    .enav-tile.is-cleared{opacity:.7}
    .enav-tile[disabled]{cursor:default}
    .enav-tile[disabled]:hover{transform:none}

    .enav-ringwrap{position:relative;flex:none;width:var(--enav-size);height:var(--enav-size)}
    .enav-ring{position:absolute;inset:0;border-radius:50%;
      -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - var(--enav-th)),#000 calc(100% - var(--enav-th) + .5px));
      mask:radial-gradient(farthest-side,transparent calc(100% - var(--enav-th)),#000 calc(100% - var(--enav-th) + .5px))}
    .enav-disc{position:absolute;inset:calc(var(--enav-th) + 2px);border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:var(--enav-accent-bg);color:var(--enav-accent)}
    .enav-tile.is-cleared .enav-disc{background:var(--enav-good-bg);color:var(--enav-good)}

    .enav-badge{position:absolute;top:-2px;right:-2px;min-width:20px;height:20px;padding:0 5px;
      border-radius:10px;background:var(--enav-bad);border:2px solid #fff;color:#fff;
      font-size:11px;font-weight:800;line-height:1;display:flex;align-items:center;justify-content:center;
      font-variant-numeric:tabular-nums}

    .enav-label{font-size:11.5px;font-weight:700;color:var(--enav-ink);white-space:nowrap}
    .enav-sub{font-size:10.5px;font-weight:600;margin-top:-3px;color:var(--enav-ink2);white-space:nowrap}
    .enav-sub.is-urgent{color:var(--enav-bad)}
    .enav-sub.is-clear{color:var(--enav-good)}

    .enav-empty{padding:18px 16px;text-align:center;font-size:12.5px;color:var(--enav-ink2)}

    @media (prefers-reduced-motion:reduce){
      .enav-tile,.enav-tile:hover{transition:none;transform:none}
    }
  `;
  document.head.appendChild(el);
}

/* ---------------------------------------------------------------- icons */

const ICONS = {
  approval: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.8 2.8L16.5 9" />
    </>
  ),
  visit: (
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 9v11h14V9" />
      <path d="M12 12v5M9.5 14.5h5" />
    </>
  ),
  secondary: (
    <>
      <path d="M4 6h12M4 12h12M4 18h8" />
      <circle cx="19" cy="16" r="3.4" />
      <path d="M19 14.6v1.4l1 1" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v8h14v-8M12 8v12M12 8s-4 0-4-3a2 2 0 0 1 4 0M12 8s4 0 4-3a2 2 0 0 0-4 0" />
    </>
  ),
  service: (
    <path d="M12 5.5L8.5 9a2.5 2.5 0 0 0 3.5 3.5L15.5 9M2 8l5-4 5 4M12 8l5-4 5 4M4.5 9.5V15l4 3M19.5 9.5V15l-5 4-3-2" />
  ),
  fallback: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l2.5 2" />
    </>
  ),
};

// Short codes used by the mock data / ERP shorthand.
const ICON_ALIASES = {
  apr: "approval",
  approvals: "approval",
  vis: "visit",
  visits: "visit",
  doctorvisit: "visit",
  sec: "secondary",
  srv: "service",
  gifts: "gift",
};

function pickIcon(name) {
  const k = String(name || "").toLowerCase().replace(/[\s_-]/g, "");
  return ICONS[k] || ICONS[ICON_ALIASES[k]] || ICONS.fallback;
}

/* ------------------------------------------------------- normalisation */

const first = (obj, keys) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
};

function toRows(data) {
  if (!data) return [];
  if (Array.isArray(data)) {
    // Either an array of categories, or an array of GraphQL edges.
    return data.map((r) => (r && r.node ? r.node : r)).filter(Boolean);
  }
  if (typeof data !== "object") return [];
  const nested = first(data, ["categories", "items", "rows", "data", "edges", "nodes"]);
  if (nested) return toRows(nested);
  // A plain object keyed by category id — carry the key down as a fallback id.
  const vals = Object.entries(data)
    .filter(([, v]) => v && typeof v === "object")
    .map(([k, v]) => (v.key || v.id ? v : { ...v, key: k }));
  return vals.length ? vals : [];
}

function isDone(ev) {
  if (ev === true || ev === false) return ev;
  if (!ev || typeof ev !== "object") return false;
  const flag = first(ev, ["done", "completed", "is_done", "isDone", "complete"]);
  if (typeof flag === "boolean") return flag;
  const status = String(first(ev, ["status", "state", "workflow_state", "status__name"]) || "").toLowerCase();
  if (!status) return Boolean(flag);
  return /done|complete|approved|closed|submitted/.test(status);
}

function normalise(row, index) {
  const key = String(first(row, ["key", "id", "code", "type"]) ?? `c${index}`);
  const label = String(first(row, ["label", "name", "title"]) ?? key);

  // Segments, in order of preference:
  //   sections[]  one per sub-tab, tri-state    <- the primary shape
  //   segments[] / events[]  one per record, done/not-done   (legacy)
  //   total + pending counts
  let segments;
  let sections = null;
  const sectionRows = first(row, ["sections", "tabs", "groups"]);
  const explicit = first(row, ["segments", "done"]);
  const events = first(row, ["events", "items", "tasks"]);

  if (Array.isArray(sectionRows)) {
    sections = sectionRows.map((s, i) => ({
      label: String(first(s || {}, ["label", "name", "title", "key"]) ?? `s${i + 1}`),
      state: readSegmentState(s),
      count: Number(first(s || {}, ["count", "pending", "total"]) ?? 0) || 0,
    }));
    segments = sections.map((s) => s.state);
  } else if (Array.isArray(explicit)) {
    segments = explicit.map(isDone);
  } else if (Array.isArray(events)) {
    segments = events.map(isDone);
  } else {
    const total = Number(first(row, ["total", "count_total", "totalCount"]) ?? 0);
    const pending = Number(first(row, ["pending", "count", "pending_count", "pendingCount"]) ?? 0);
    const n = Math.max(total, pending);
    segments = n > 0 ? Array.from({ length: n }, (_, i) => i < n - pending) : [];
  }

  // Anything that isn't finished counts as outstanding — amber sections included, since
  // "waiting on someone" is still work in the queue.
  const unfinished = segments.filter((s) => readSegmentState(s) !== "done").length;
  // A section ring's badge is a record count, not a section count: three amber tabs are not
  // "3 to do". Take the counts the mapper supplied, and fall back to the section count only
  // when it gave none.
  const badgeOverride = first(row, ["badge", "pendingCount", "count"]);
  const sectionCount = sections ? sections.reduce((a, s) => a + s.count, 0) : 0;
  const pending =
    badgeOverride !== undefined
      ? Number(badgeOverride) || 0
      : sections
      ? sectionCount || unfinished
      : unfinished;

  const dueRaw = first(row, ["dueAt", "due", "due_date", "dueDate", "next_due", "nextDue"]);
  const dueAt = dueRaw ? new Date(dueRaw) : null;
  const validDue = dueAt && !isNaN(dueAt.getTime()) ? dueAt : null;

  return {
    key,
    label,
    icon: first(row, ["icon"]) ?? key,
    segments,
    sections,
    total: segments.length,
    pending,
    hasWork: segments.length > 0,
    cleared: unfinished === 0,
    dueAt: validDue,
    dueLabel: first(row, ["dueLabel", "sub", "subLabel"]),
    href: first(row, ["href", "link", "route", "url"]),
    raw: row,
  };
}

/* ------------------------------------------------------- due formatting */

function formatDue(date, locale) {
  if (!date) return "";
  const now = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(now)) / 86400000);

  if (days < 0) return "overdue";
  if (days === 0) {
    // All-day work lands on 00:00:00, and "due 12:00 am" reads as a bug rather than a deadline.
    if (date.getHours() === 0 && date.getMinutes() === 0) return "due today";
    const t = date
      .toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
      .toLowerCase()
      .replace(/\s/g, " ");
    return `due ${t}`;
  }
  if (days === 1) return "due tomorrow";
  if (days <= 6) return `due ${date.toLocaleDateString(locale, { weekday: "short" })}`;
  return `due ${date.toLocaleDateString(locale, { day: "numeric", month: "short" })}`;
}

/* --------------------------------------------------------------- main */

export default function HomeNavRings({
  data,
  sortByDue = true,
  showBadge = true,
  showDue = true,
  dimCleared = true,
  size = 62,
  thickness = 5,
  gapDeg = 5,
  maxSegments = 10,
  accentColor = "#2563eb",
  accentBg = "#eff6ff",
  doneColor = "#16a34a",
  pendingColor = "#dc2626",
  waitingColor = "#f59e0b",
  stateColors,
  allClearText = "all clear",
  allDoneText = "all done",
  emptyText = "Nothing queued for today.",
  locale = "en-IN",
  onSelect,
  className,
  style,
}) {
  ensureStyles();

  // The relative due text depends on "now", so hold it back until after hydration.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const scrollRef = React.useRef(null);
  const [overflowing, setOverflowing] = React.useState(false);

  const cats = React.useMemo(() => {
    const rows = toRows(data).map(normalise);
    if (!sortByDue) return rows;
    // Soonest first; anything cleared, or with no date, sinks below the dated work.
    return rows.slice().sort((a, b) => {
      if (a.cleared !== b.cleared) return a.cleared ? 1 : -1;
      const av = a.dueAt ? a.dueAt.getTime() : Infinity;
      const bv = b.dueAt ? b.dueAt.getTime() : Infinity;
      return av - bv;
    });
  }, [data, sortByDue]);

  // The first pending category is the one that earns the red sub-label.
  const urgentKey = React.useMemo(() => {
    const u = cats.find((c) => !c.cleared);
    return u ? u.key : null;
  }, [cats]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => setOverflowing(el.scrollWidth - el.clientWidth > 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cats.length]);

  const rootStyle = {
    "--enav-size": `${size}px`,
    "--enav-th": `${thickness}px`,
    "--enav-accent": accentColor,
    "--enav-accent-bg": accentBg,
    "--enav-good": doneColor,
    "--enav-bad": pendingColor,
    ...style,
  };

  if (!cats.length) {
    return (
      <div className={["enav", className].filter(Boolean).join(" ")} style={rootStyle}>
        <div className="enav-empty">{emptyText}</div>
      </div>
    );
  }

  return (
    <div
      className={["enav", overflowing ? "is-overflowing" : "", className].filter(Boolean).join(" ")}
      style={rootStyle}
    >
      <div className="enav-scroll" ref={scrollRef}>
        {cats.map((c) => {
          // Order matters. An explicit label always wins; the cleared states are clock-free
          // and safe to paint on the server. A computed "due ..." has to wait for mount, and
          // we hold a blank line rather than show "N pending" — that duplicates the badge and
          // would visibly flip to the due time a frame later.
          const sub = c.dueLabel
            ? c.dueLabel
            : !c.hasWork
            ? allClearText
            : c.cleared
            ? allDoneText
            : c.dueAt
            ? mounted
              ? formatDue(c.dueAt, locale)
              : " "
            : `${c.pending} pending`;

          const subClass = c.cleared ? "is-clear" : c.key === urgentKey ? "is-urgent" : "";
          const tappable = Boolean(onSelect);

          return (
            <button
              key={c.key}
              type="button"
              className={[
                "enav-tile",
                dimCleared && !c.hasWork ? "is-cleared" : "",
                c.cleared ? "is-cleared" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!tappable}
              onClick={tappable ? () => onSelect(c) : undefined}
              // Colour is the only carrier of a section's state, so spell it out for anyone
              // who can't see it.
              aria-label={[
                c.label,
                c.cleared ? sub : `${c.pending} pending, ${sub}`,
                c.sections
                  ? c.sections
                      .map((s) => `${s.label} ${STATE_WORDS[s.state] || s.state}`)
                      .join(", ")
                  : null,
              ]
                .filter(Boolean)
                .join(". ")}
            >
              <span className="enav-ringwrap">
                <span
                  className="enav-ring"
                  style={{
                    background: segmentRing(c.segments, {
                      doneColor,
                      pendingColor,
                      waitingColor,
                      stateColors,
                      gapDeg,
                      maxSegments,
                    }),
                  }}
                />
                <span className="enav-disc">
                  <svg
                    width={Math.round(size * 0.32)}
                    height={Math.round(size * 0.32)}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {pickIcon(c.icon)}
                  </svg>
                </span>
                {showBadge && c.pending > 0 && (
                  <span className="enav-badge">{c.pending > 99 ? "99+" : c.pending}</span>
                )}
              </span>
              <span className="enav-label">{c.label}</span>
              {showDue && sub && <span className={["enav-sub", subClass].filter(Boolean).join(" ")}>{sub}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}