"use client";

/**
 * The design's icons and its modal shell.
 *
 * Every icon is the design's own path data at its own stroke weight — they are
 * drawn rather than pulled from an icon set so the visit pin in the banner
 * ghost, the chip and the timeline are provably the same mark.
 */

import React, { useEffect, useRef } from "react";

const base = { fill: "none", stroke: "currentColor", strokeLinecap: "round" };

export const Icon = {
  visit: (p) => (
    <svg viewBox="0 0 24 24" width={p?.size ?? 13} height={p?.size ?? 13} strokeWidth={p?.w ?? 2} {...base} {...p?.rest}>
      <path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  ),
  pob: (p) => (
    <svg viewBox="0 0 24 24" width={p?.size ?? 13} height={p?.size ?? 13} strokeWidth={p?.w ?? 2} {...base} {...p?.rest}>
      <path d="M3 4.5h2.4l2.3 10.6h9.6l2.2-7.6H6.2" />
      <circle cx="9.5" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
    </svg>
  ),
  support: (p) => (
    <svg viewBox="0 0 24 24" width={p?.size ?? 13} height={p?.size ?? 13} strokeWidth={p?.w ?? 2} {...base} {...p?.rest}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  ),
  service: (p) => (
    <svg viewBox="0 0 24 24" width={p?.size ?? 13} height={p?.size ?? 13} strokeWidth={p?.w ?? 2} {...base} {...p?.rest}>
      <path d="M4 8.5h16v11H4zM2.5 8.5h19M12 8.5V20M8.5 8.5a2.6 2.6 0 1 1 3.5-2.4M15.5 8.5a2.6 2.6 0 1 0-3.5-2.4" />
    </svg>
  ),
  note: (p) => (
    <svg viewBox="0 0 24 24" width={p?.size ?? 13} height={p?.size ?? 13} strokeWidth={p?.w ?? 2} {...base} {...p?.rest}>
      <path d="M6 3.5h9l4 4v13H6z" />
      <path d="M14.5 3.5V8h4.5M9 12.5h6M9 16h4" />
    </svg>
  ),
  filter: (p) => (
    <svg viewBox="0 0 24 24" width={p?.size ?? 14} height={p?.size ?? 14} strokeWidth={p?.w ?? 2} {...base} {...p?.rest}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  ),
  table: (p) => (
    <svg viewBox="0 0 24 24" width={p?.size ?? 13} height={p?.size ?? 13} strokeWidth={p?.w ?? 2} {...base} {...p?.rest}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
    </svg>
  ),
  clock: (p) => (
    <svg viewBox="0 0 24 24" width={p?.size ?? 13} height={p?.size ?? 13} strokeWidth={p?.w ?? 2} {...base} {...p?.rest}>
      <path d="M12 7v5l3 2" />
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  ),
  pivot: (p) => (
    <svg viewBox="0 0 24 24" width={p?.size ?? 12} height={p?.size ?? 12} strokeWidth={p?.w ?? 2} {...base} {...p?.rest}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15M15 4.5v15" />
    </svg>
  ),
  person: (p) => (
    <svg viewBox="0 0 24 24" width={p?.size ?? 7} height={p?.size ?? 7} strokeWidth={p?.w ?? 2.8} {...base} {...p?.rest}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20c1.2-3.4 3.6-5 6.5-5s5.3 1.6 6.5 5" />
    </svg>
  ),
  calendar: (p) => (
    <svg viewBox="0 0 24 24" width={p?.size ?? 14} height={p?.size ?? 14} strokeWidth={p?.w ?? 2} {...base} {...p?.rest}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10.5h17" />
    </svg>
  ),
  list: (p) => (
    <svg viewBox="0 0 24 24" width={p?.size ?? 12} height={p?.size ?? 12} strokeWidth={p?.w ?? 2} {...base} {...p?.rest}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
};

/** The five metric identities, used by the banner, the chart and the timeline. */
export const TONE = {
  support: { label: "Support", hue: "#1e3a8a", tint: "#f4f7fd", bd: "#d7e0f5", icon: Icon.support },
  service: { label: "Service", hue: "#a02019", tint: "#fcedec", bd: "#f3c9c6", icon: Icon.service },
  pob: { label: "POB", hue: "#b45309", tint: "#fdf3e6", bd: "#f5d9b0", icon: Icon.pob },
  visit: { label: "Visits", hue: "#047857", tint: "#ecfdf5", bd: "#a7f3d0", icon: Icon.visit },
  note: { label: "Notes", hue: "#4b5563", tint: "#f3f4f6", bd: "#e5e7eb", icon: Icon.note },
};

/**
 * A modal that behaves like one.
 *
 * Escape closes it, the backdrop closes it, focus moves inside on open and
 * returns to whatever opened it on close, and Tab is trapped. The design draws
 * the box; none of this is visible, but a dialog that swallows the keyboard is
 * a dialog field staff cannot get out of one-handed.
 */
export function Sheet({ label, maxWidth = 440, onClose, children }) {
  const boxRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    restoreRef.current = typeof document !== "undefined" ? document.activeElement : null;
    const box = boxRef.current;
    if (box) {
      const first = box.querySelector(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      (first ?? box).focus?.();
    }
    const onKey = (event) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose?.(); return; }
      if (event.key !== "Tab" || !boxRef.current) return;
      const focusable = [...boxRef.current.querySelectorAll(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      )].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="dx-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="dx-sheet"
        style={{ maxWidth: maxWidth + "px" }}
      >
        <div className="dx-grab" aria-hidden="true"><i /></div>
        {children}
      </div>
    </div>
  );
}

export function SheetHead({ title, count, onClose, children }) {
  return (
    <div className="dx-sheet-head">
      {children}
      <h3>{title}</h3>
      {count ? <span className="dx-count">{count}</span> : null}
      <button type="button" className="dx-x" aria-label="Close" onClick={onClose}>✕</button>
    </div>
  );
}

export function Empty({ children }) {
  return <div className="dx-empty">{children}</div>;
}

export function Skeleton({ h = 12, w = "100%", style }) {
  return <div className="dx-skeleton" style={{ height: h, width: w, ...style }} aria-hidden="true" />;
}
