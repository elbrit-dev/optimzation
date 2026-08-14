import React from "react";

/**
 * ActionButton — one icon + label row, the kind that stacks at the bottom of the
 * profile drawer ("Help Desk", "Logout") or in any menu/settings list.
 *
 * The icons are BUILT IN as inline SVG (`icon` is a dropdown of ~40 ready ones —
 * see ICONS below), so a page never has to source an icon: pick "Headphones" for
 * Help Desk, "Logout" for Logout, and so on. Nothing external is fetched, and the
 * icon inherits `iconColor` / `iconSize`. Need one that isn't in the list? Drop any
 * element into the `iconSlot` and it replaces the built-in icon.
 *
 * Click: `onClick(value)` fires with this button's `value`, so several buttons can
 * share one handler and tell themselves apart. Set `href` instead (or as well) to
 * render a real link — handy for mailto:, tel: and external pages. `loading` swaps
 * the icon for a spinner and blocks further clicks; `disabled` dims and blocks it.
 *
 * Looks:
 *   variant "plain"    — borderless row (the drawer look, default)
 *           "outlined" — its own bordered card
 *           "soft"     — tinted background block
 *   tone    "default"  — accent icon + dark label (default)
 *           "primary"  — accent icon + accent label
 *           "danger"   — red icon + red label (Logout, Delete)
 * `iconColor` / `labelColor` override whatever the tone picked.
 */

// Built-in icon set, as lucide's 24x24 stroke geometry: [tag, attrs][].
// Keys are what the `icon` prop offers; add a pair here to extend the dropdown
// (and mirror it in the plasmic-init options list so Studio shows it).
const ICONS = {
  headphones: [["path",{"d":"M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"}]],
  lifeBuoy: [["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"m4.93 4.93 4.24 4.24"}],["path",{"d":"m14.83 9.17 4.24-4.24"}],["path",{"d":"m14.83 14.83 4.24 4.24"}],["path",{"d":"m9.17 14.83-4.24 4.24"}],["circle",{"cx":"12","cy":"12","r":"4"}]],
  question: [["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"}],["path",{"d":"M12 17h.01"}]],
  chat: [["path",{"d":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"}]],
  phone: [["path",{"d":"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"}]],
  mail: [["path",{"d":"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"}],["rect",{"x":"2","y":"4","width":"20","height":"16","rx":"2"}]],
  send: [["path",{"d":"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"}],["path",{"d":"m21.854 2.147-10.94 10.939"}]],
  logout: [["path",{"d":"m16 17 5-5-5-5"}],["path",{"d":"M21 12H9"}],["path",{"d":"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"}]],
  user: [["path",{"d":"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"}],["circle",{"cx":"12","cy":"7","r":"4"}]],
  userSettings: [["path",{"d":"M10 15H6a4 4 0 0 0-4 4v2"}],["path",{"d":"m14.305 16.53.923-.382"}],["path",{"d":"m15.228 13.852-.923-.383"}],["path",{"d":"m16.852 12.228-.383-.923"}],["path",{"d":"m16.852 17.772-.383.924"}],["path",{"d":"m19.148 12.228.383-.923"}],["path",{"d":"m19.53 18.696-.382-.924"}],["path",{"d":"m20.772 13.852.924-.383"}],["path",{"d":"m20.772 16.148.924.383"}],["circle",{"cx":"18","cy":"15","r":"3"}],["circle",{"cx":"9","cy":"7","r":"4"}]],
  team: [["path",{"d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}],["path",{"d":"M16 3.128a4 4 0 0 1 0 7.744"}],["path",{"d":"M22 21v-2a4 4 0 0 0-3-3.87"}],["circle",{"cx":"9","cy":"7","r":"4"}]],
  settings: [["path",{"d":"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"}],["circle",{"cx":"12","cy":"12","r":"3"}]],
  bell: [["path",{"d":"M10.268 21a2 2 0 0 0 3.464 0"}],["path",{"d":"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"}]],
  calendar: [["path",{"d":"M8 2v4"}],["path",{"d":"M16 2v4"}],["rect",{"width":"18","height":"18","x":"3","y":"4","rx":"2"}],["path",{"d":"M3 10h18"}]],
  calendarCheck: [["path",{"d":"M8 2v4"}],["path",{"d":"M16 2v4"}],["rect",{"width":"18","height":"18","x":"3","y":"4","rx":"2"}],["path",{"d":"M3 10h18"}],["path",{"d":"m9 16 2 2 4-4"}]],
  clock: [["path",{"d":"M12 6v6l4 2"}],["circle",{"cx":"12","cy":"12","r":"10"}]],
  approvals: [["rect",{"width":"8","height":"4","x":"8","y":"2","rx":"1","ry":"1"}],["path",{"d":"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"}],["path",{"d":"m9 14 2 2 4-4"}]],
  report: [["path",{"d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"}],["path",{"d":"M14 2v5a1 1 0 0 0 1 1h5"}],["path",{"d":"M10 9H8"}],["path",{"d":"M16 13H8"}],["path",{"d":"M16 17H8"}]],
  sales: [["path",{"d":"M16 7h6v6"}],["path",{"d":"m22 7-8.5 8.5-5-5L2 17"}]],
  product: [["path",{"d":"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"}],["path",{"d":"M12 22V12"}],["polyline",{"points":"3.29 7 12 12 20.71 7"}],["path",{"d":"m7.5 4.27 9 5.15"}]],
  store: [["path",{"d":"M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"}],["path",{"d":"M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"}],["path",{"d":"M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"}]],
  doctor: [["path",{"d":"M11 2v2"}],["path",{"d":"M5 2v2"}],["path",{"d":"M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"}],["path",{"d":"M8 15a6 6 0 0 0 12 0v-3"}],["circle",{"cx":"20","cy":"10","r":"2"}]],
  location: [["path",{"d":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{"cx":"12","cy":"10","r":"3"}]],
  wallet: [["path",{"d":"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"}],["path",{"d":"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"}]],
  receipt: [["path",{"d":"M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"}],["path",{"d":"M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"}],["path",{"d":"M12 17.5v-11"}]],
  search: [["path",{"d":"m21 21-4.34-4.34"}],["circle",{"cx":"11","cy":"11","r":"8"}]],
  download: [["path",{"d":"M12 15V3"}],["path",{"d":"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["path",{"d":"m7 10 5 5 5-5"}]],
  upload: [["path",{"d":"M12 3v12"}],["path",{"d":"m17 8-5-5-5 5"}],["path",{"d":"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}]],
  sync: [["path",{"d":"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"}],["path",{"d":"M21 3v5h-5"}],["path",{"d":"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"}],["path",{"d":"M8 16H3v5"}]],
  lock: [["rect",{"width":"18","height":"11","x":"3","y":"11","rx":"2","ry":"2"}],["path",{"d":"M7 11V7a5 5 0 0 1 10 0v4"}]],
  shield: [["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{"d":"m9 12 2 2 4-4"}]],
  info: [["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 16v-4"}],["path",{"d":"M12 8h.01"}]],
  star: [["path",{"d":"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"}]],
  share: [["circle",{"cx":"18","cy":"5","r":"3"}],["circle",{"cx":"6","cy":"12","r":"3"}],["circle",{"cx":"18","cy":"19","r":"3"}],["line",{"x1":"8.59","x2":"15.42","y1":"13.51","y2":"17.49"}],["line",{"x1":"15.41","x2":"8.59","y1":"6.51","y2":"10.49"}]],
  home: [["path",{"d":"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"}],["path",{"d":"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"}]],
  dashboard: [["rect",{"width":"7","height":"9","x":"3","y":"3","rx":"1"}],["rect",{"width":"7","height":"5","x":"14","y":"3","rx":"1"}],["rect",{"width":"7","height":"9","x":"14","y":"12","rx":"1"}],["rect",{"width":"7","height":"5","x":"3","y":"16","rx":"1"}]],
  catalog: [["path",{"d":"M12 7v14"}],["path",{"d":"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"}]],
  add: [["path",{"d":"M5 12h14"}],["path",{"d":"M12 5v14"}]],
  trash: [["path",{"d":"M10 11v6"}],["path",{"d":"M14 11v6"}],["path",{"d":"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"}],["path",{"d":"M3 6h18"}],["path",{"d":"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"}]],
  externalLink: [["path",{"d":"M15 3h6v6"}],["path",{"d":"M10 14 21 3"}],["path",{"d":"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"}]],
  globe: [["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"}],["path",{"d":"M2 12h20"}]],
  moon: [["path",{"d":"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"}]],
};

const STYLE_ID = "elbrit-action-button-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .eab {
      box-sizing: border-box; display: flex; align-items: center; gap: 12px;
      width: 100%; padding: 11px 14px; margin: 0;
      border: none; border-radius: 10px; background: transparent;
      font: 500 15px/1.3 inherit; color: var(--eab-label, #1f2937);
      text-align: left; text-decoration: none; cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background .12s ease, color .12s ease, border-color .12s ease;
    }
    .eab:hover { background: var(--eab-hover, #f3f4f6); }
    .eab:active { background: color-mix(in srgb, var(--eab-hover, #f3f4f6) 70%, #000 4%); }
    .eab:focus-visible { outline: 2px solid var(--eab-icon, #2563eb); outline-offset: 1px; }
    .eab:disabled, .eab.eab-disabled { opacity: .5; cursor: not-allowed; background: transparent; }

    .eab-auto { width: auto; }
    .eab-center { justify-content: center; text-align: center; }

    /* variants */
    .eab-outlined { border: 1px solid #e5e7eb; }
    .eab-outlined:hover { border-color: color-mix(in srgb, var(--eab-icon, #2563eb) 40%, #e5e7eb); }
    .eab-soft { background: color-mix(in srgb, var(--eab-icon, #2563eb) 7%, #fff); }
    .eab-soft:hover { background: color-mix(in srgb, var(--eab-icon, #2563eb) 12%, #fff); }

    .eab-icon { flex: 0 0 auto; display: flex; align-items: center; color: var(--eab-icon, #2563eb); }
    .eab-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .eab-center .eab-label { flex: 0 1 auto; }

    .eab-badge {
      flex: 0 0 auto; box-sizing: border-box;
      min-width: 20px; height: 20px; padding: 0 6px;
      border-radius: 999px; background: var(--eab-icon, #2563eb); color: #fff;
      font-size: 11px; font-weight: 700; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .eab-chevron { flex: 0 0 auto; display: flex; align-items: center; color: #9ca3af; }

    .eab-spinner {
      flex: 0 0 auto; border-radius: 50%;
      border: 2px solid color-mix(in srgb, var(--eab-icon, #2563eb) 30%, transparent);
      border-top-color: var(--eab-icon, #2563eb);
      animation: eab-spin .7s linear infinite;
    }
    @keyframes eab-spin { to { transform: rotate(360deg); } }

    @media (prefers-reduced-motion: reduce) {
      .eab { transition: none; }
      .eab-spinner { animation-duration: 1.6s; }
    }
  `;
  document.head.appendChild(el);
}

// Tone presets. iconColor / labelColor override whatever is picked here.
const TONES = {
  default: { icon: "#2563eb", label: "#1f2937" },
  primary: { icon: "#2563eb", label: "#2563eb" },
  danger: { icon: "#dc2626", label: "#b91c1c" },
};

function BuiltInIcon({ name, size, strokeWidth }) {
  const nodes = ICONS[name] || ICONS.headphones;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {nodes.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

export default function ActionButton({
  label = "Help Desk",
  icon = "headphones",             // key of the built-in set (see ICONS)
  iconSlot,                       // any element — replaces the built-in icon
  iconSize = 20,
  iconStrokeWidth = 2,
  iconColor,                      // overrides the tone's icon colour
  labelColor,                     // overrides the tone's label colour

  variant = "plain",              // "plain" | "outlined" | "soft"
  tone = "default",               // "default" | "primary" | "danger"
  fullWidth = true,
  align = "left",                 // "left" | "center"
  hoverColor = "#f3f4f6",

  badge,                          // small pill on the right (e.g. an unread count)
  showChevron = false,            // right-hand ">" for rows that lead somewhere

  onClick,                        // (value) => void
  value,                          // handed back by onClick, so buttons can share a handler
  href,                           // renders a real link (mailto:, tel:, external page)
  newTab = false,
  disabled = false,
  loading = false,                // spinner in place of the icon; clicks blocked

  className,
  style,
}) {
  ensureStyles();

  const toneColors = TONES[tone] || TONES.default;
  const resolvedIconColor = iconColor || toneColors.icon;
  const blocked = disabled || loading;

  const cssVars = {
    "--eab-icon": resolvedIconColor,
    "--eab-label": labelColor || toneColors.label,
    "--eab-hover": hoverColor,
    ...style,
  };

  const cls = [
    "eab",
    variant === "outlined" ? "eab-outlined" : variant === "soft" ? "eab-soft" : "",
    fullWidth ? "" : "eab-auto",
    align === "center" ? "eab-center" : "",
    blocked ? "eab-disabled" : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = (e) => {
    if (blocked) {
      e.preventDefault();
      return;
    }
    onClick?.(value);
  };

  const badgeText = badge === null || badge === undefined || badge === "" ? "" : String(badge);

  const inner = (
    <>
      {loading ? (
        <span className="eab-spinner" style={{ width: iconSize, height: iconSize }} aria-hidden="true" />
      ) : (
        <span className="eab-icon">
          {iconSlot || <BuiltInIcon name={icon} size={iconSize} strokeWidth={iconStrokeWidth} />}
        </span>
      )}

      <span className="eab-label">{label}</span>

      {badgeText ? <span className="eab-badge">{badgeText}</span> : null}

      {showChevron ? (
        <span className="eab-chevron" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      ) : null}
    </>
  );

  if (href && !blocked) {
    return (
      <a
        className={cls}
        style={cssVars}
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        onClick={handleClick}
      >
        {inner}
      </a>
    );
  }

  return (
    <button type="button" className={cls} style={cssVars} disabled={blocked} onClick={handleClick}>
      {inner}
    </button>
  );
}
