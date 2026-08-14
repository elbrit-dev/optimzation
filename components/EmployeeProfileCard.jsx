import React from "react";
import { Mail, IdCard, MapPin, Network, Copy, Check } from "lucide-react";

/**
 * EmployeeProfileCard — an identity card for one employee.
 *
 * Built for the home-page profile drawer (tap the header avatar): one card for the
 * logged-in user, another for their manager. Deliberately SHORT — a few fields worth
 * reading at a glance, not everything the employee record carries.
 *
 * Header: avatar (an uploaded/data-URI image, or the initial on a tinted circle),
 * the employee name, the designation, and a status line ("● Active · HQ-Chennai").
 * Body: three labelled rows, each with a COPY button — company email, employee code,
 * reports-to.
 * Footer: a single primary action ("View profile").
 *
 * Every field is its OWN prop — there is no single `data` object to bind. Wire each
 * one straight off the employee record:
 *   name          <- employee_name           ("Janardhanan A")
 *   designation   <- designation__name        ("Zonal Sales Manager")
 *   status        <- status                   ("ACTIVE" — cased for display)
 *   hq            <- fsl_hq__name             ("HQ-Chennai")
 *   email         <- company_email
 *   employeeCode  <- employee / name          ("E00004")
 *   reportsTo     <- reports_to.employee_name (or its designation)
 *   avatarUrl     <- userAvatar               (the data:image/svg+xml avatar)
 *   initial       <- Initial                  ("J" — auto-derived from name if empty)
 *
 * The seat code (role_id / custom_role_profile__name) is NOT shown by default — it says
 * the same thing as the HQ in the header, and "HQ-Chennai" reads better than
 * "SM-Aura_CHN_CBE_MDU_KER". Bind `territory` only if you want the raw code instead
 * (then clear `hq` so the two don't repeat each other).
 *
 * Rows with an empty value hide themselves, so the card never shows a blank field —
 * that's also how you drop a row you don't want (leave its prop empty).
 *
 * Status tone (`statusTone`, default "auto") is derived from the status TEXT:
 * "active" → green, "inactive"/"suspended" → amber, "left" → grey. Pass a tone to override.
 *
 * Copying: `showCopy` puts a copy button on each row; it copies the raw value and
 * flashes a tick, and also fires `onCopy(field, value)` where `field` is the row key
 * ("email" | "employeeCode" | "territory" | "reportsTo").
 *
 * The email is a mailto: link by default (`linkEmail`) — it keeps the row's styling and
 * swallows its own click, so it never triggers the card click.
 */

const STYLE_ID = "elbrit-employee-profile-card-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .eep-card {
      box-sizing: border-box;
      display: flex; flex-direction: column;
      width: 100%; max-width: 100%;
      border-radius: 14px;
      border: 1px solid var(--eep-border, #e5e7eb);
      background: #ffffff;
      font: 400 13px/1.45 inherit; color: #1f2937;
      overflow: hidden;
      transition: box-shadow .12s ease, border-color .12s ease;
    }
    .eep-card.eep-clickable { cursor: pointer; }
    .eep-card.eep-clickable:hover {
      box-shadow: 0 2px 12px rgba(0,0,0,0.07);
      border-color: color-mix(in srgb, var(--eep-accent, #2563eb) 35%, #e5e7eb);
    }

    /* ---- header ---- */
    .eep-head { display: flex; align-items: center; gap: 14px; padding: 18px 18px 16px; }
    .eep-avatar {
      flex: 0 0 auto; box-sizing: border-box;
      width: 56px; height: 56px; border-radius: 50%;
      background: var(--eep-avatar-bg, #dbeafe);
      color: var(--eep-avatar-fg, #2563eb);
      display: flex; align-items: center; justify-content: center;
      font-size: 23px; font-weight: 600; line-height: 1;
      overflow: hidden; user-select: none;
    }
    .eep-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }

    .eep-ident { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .eep-name {
      font-size: 19px; font-weight: 700; color: #111827; line-height: 1.25;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .eep-designation {
      font-size: 13.5px; color: #6b7280;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .eep-statusline {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
      margin-top: 3px; font-size: 12.5px; min-width: 0;
    }
    .eep-status { display: inline-flex; align-items: center; gap: 5px; font-weight: 500; }
    .eep-status-dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .eep-status-active   { color: #16a34a; }
    .eep-status-inactive { color: #b45309; }
    .eep-status-left     { color: #6b7280; }
    .eep-sep { color: #d1d5db; }
    .eep-hq { color: #6b7280; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* ---- detail rows ---- */
    .eep-rows { display: flex; flex-direction: column; border-top: 1px solid var(--eep-border, #e5e7eb); }
    .eep-row {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 14px 11px 18px;
      border-bottom: 1px solid var(--eep-border, #e5e7eb);
    }
    .eep-row:last-child { border-bottom: none; }
    .eep-row-icon { flex: 0 0 auto; color: #9ca3af; display: flex; align-items: center; }
    .eep-row-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .eep-row-label { font-size: 11.5px; color: #9ca3af; line-height: 1.3; }
    .eep-row-value {
      font-size: 14px; color: #111827; line-height: 1.35;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .eep-row-value.eep-mono {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 13.5px; letter-spacing: -0.1px;
    }
    .eep-row-link { color: inherit; text-decoration: none; }
    .eep-row-link:hover { color: var(--eep-accent, #2563eb); text-decoration: underline; }

    .eep-copy {
      flex: 0 0 auto; box-sizing: border-box;
      width: 30px; height: 30px; padding: 0;
      border: none; border-radius: 8px; background: transparent;
      color: #9ca3af; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .12s ease, color .12s ease;
    }
    .eep-copy:hover { background: #f1f5f9; color: #475569; }
    .eep-copy:focus-visible { outline: 2px solid var(--eep-accent, #2563eb); outline-offset: 1px; }
    .eep-copy.eep-copied { color: #16a34a; }

    /* ---- extras slot + footer ---- */
    .eep-extra { padding: 14px 18px; border-top: 1px solid var(--eep-border, #e5e7eb); }
    /* the divider above the button comes from the footer, so it's there whether or not
       the extras slot is used (the last row deliberately drops its own bottom border) */
    .eep-foot { padding: 16px 18px 18px; border-top: 1px solid var(--eep-border, #e5e7eb); }
    .eep-btn {
      box-sizing: border-box; min-width: 128px;
      padding: 11px 20px; border: none; border-radius: 9px;
      background: var(--eep-accent, #2563eb); color: #fff;
      font: 600 14px/1 inherit; cursor: pointer;
      transition: filter .12s ease, opacity .12s ease;
    }
    .eep-btn.eep-btn-full { width: 100%; }
    .eep-btn:hover { filter: brightness(0.95); }
    .eep-btn:active { filter: brightness(0.9); }
    .eep-btn:focus-visible { outline: 2px solid #fff; outline-offset: -3px; }
    .eep-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: none; }

    @media (prefers-reduced-motion: reduce) {
      .eep-card, .eep-copy, .eep-btn { transition: none; }
    }
  `;
  document.head.appendChild(el);
}

// Trim a value and treat null/undefined/"" as absent, so an empty field hides its row.
function clean(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s === "null" || s === "undefined" ? "" : s;
}

// ERP stores the status upper-cased ("ACTIVE"); show it as "Active".
function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s\-/])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

// Tone from the status TEXT, used while statusTone is "auto" (the default).
//   "ACTIVE" -> active (green) | "Inactive"/"Suspended" -> inactive (amber) | "Left" -> left (grey)
function deriveTone(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("active") && !s.includes("inactive")) return "active";
  if (s.includes("inactive") || s.includes("suspend")) return "inactive";
  if (s.includes("left") || s.includes("resign")) return "left";
  return "active";
}

// First letter of the name, used when neither avatarUrl nor initial is given.
function initialOf(name) {
  const s = clean(name);
  return s ? s[0].toUpperCase() : "";
}

// Copy to clipboard. The async Clipboard API needs a secure context, so fall back to
// a hidden textarea + execCommand for http:// hosts and older webviews.
function copyText(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text) {
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

export default function EmployeeProfileCard({
  // ---- identity (header) ----
  name = "Janardhanan A",              // employee_name
  designation = "Zonal Sales Manager", // designation__name
  status = "ACTIVE",                   // status — displayed title-cased
  statusTone = "auto",                 // "auto" | "active" | "inactive" | "left"
  hq = "HQ-Chennai",                   // fsl_hq__name
  avatarUrl,                           // userAvatar (data URI or any image URL)
  initial,                             // Initial — falls back to the first letter of `name`
  avatarBg = "#dbeafe",
  avatarColor = "#2563eb",

  // ---- detail rows (each hides itself when its value is empty) ----
  email = "janardhanan@elbrit.org",    // company_email
  emailLabel = "Company email",
  employeeCode = "E00004",             // employee / name
  employeeCodeLabel = "Employee code",
  territory = "",                      // role_id / custom_role_profile__name — OPT-IN: same data as `hq`
  territoryLabel = "Territory",
  reportsTo = "Vice President – Sales", // reports_to.employee_name (or its designation)
  reportsToLabel = "Reports to",

  // ---- behaviour ----
  showCopy = true,                     // copy button on every row
  onCopy,                              // (field, value) => void
  linkEmail = true,                    // render the email as a mailto: link
  onCardClick,                         // (value) => void — click the card body
  value,                               // id handed back by onCardClick / used as a key

  // ---- footer action ----
  showButton = true,
  buttonLabel = "View profile",
  onViewProfile,                       // (value) => void
  fullWidthButton = false,
  disabled = false,

  // ---- theming ----
  accentColor = "#2563eb",

  children,                            // extra content between the rows and the button
  className,
  style,
}) {
  ensureStyles();

  const tone = statusTone && statusTone !== "auto" ? statusTone : deriveTone(status);
  const statusText = clean(status) ? titleCase(clean(status)) : "";
  const hqText = clean(hq);

  const [copied, setCopied] = React.useState(null);
  const timer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = React.useCallback(
    (field, text) => {
      copyText(text);
      onCopy?.(field, text);
      setCopied(field);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1400);
    },
    [onCopy]
  );

  // The four rows, in display order. `href` makes the value a link; `mono` is for codes.
  const rows = [
    { field: "email", label: emailLabel, value: clean(email), icon: Mail, href: linkEmail ? `mailto:${clean(email)}` : null },
    { field: "employeeCode", label: employeeCodeLabel, value: clean(employeeCode), icon: IdCard, mono: true },
    { field: "territory", label: territoryLabel, value: clean(territory), icon: MapPin, mono: true },
    { field: "reportsTo", label: reportsToLabel, value: clean(reportsTo), icon: Network },
  ].filter((r) => r.value);

  const canNavigate = !!onCardClick && !disabled;
  const cardClass = ["eep-card", canNavigate ? "eep-clickable" : "", className || ""].filter(Boolean).join(" ");

  const cssVars = {
    "--eep-accent": accentColor,
    "--eep-avatar-bg": avatarBg,
    "--eep-avatar-fg": avatarColor,
    ...style,
  };

  const avatarInitial = clean(initial) || initialOf(name);

  return (
    <div
      className={cardClass}
      style={cssVars}
      onClick={canNavigate ? () => onCardClick(value) : undefined}
    >
      <div className="eep-head">
        <div className="eep-avatar">
          {clean(avatarUrl) ? (
            <img className="eep-avatar-img" src={avatarUrl} alt={clean(name) || "Employee"} />
          ) : (
            avatarInitial
          )}
        </div>

        <div className="eep-ident">
          {clean(name) ? (
            <span className="eep-name" title={clean(name)}>
              {name}
            </span>
          ) : null}
          {clean(designation) ? (
            <span className="eep-designation" title={clean(designation)}>
              {designation}
            </span>
          ) : null}
          {statusText || hqText ? (
            <div className="eep-statusline">
              {statusText ? (
                <span className={`eep-status eep-status-${tone}`}>
                  <span className="eep-status-dot" aria-hidden="true" />
                  {statusText}
                </span>
              ) : null}
              {statusText && hqText ? <span className="eep-sep" aria-hidden="true">·</span> : null}
              {hqText ? (
                <span className="eep-hq" title={hqText}>
                  {hqText}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {rows.length ? (
        <div className="eep-rows">
          {rows.map((r) => {
            const Icon = r.icon;
            const isCopied = copied === r.field;
            return (
              <div className="eep-row" key={r.field}>
                <span className="eep-row-icon" aria-hidden="true">
                  <Icon size={17} strokeWidth={1.9} />
                </span>
                <div className="eep-row-body">
                  <span className="eep-row-label">{r.label}</span>
                  <span className={`eep-row-value ${r.mono ? "eep-mono" : ""}`} title={r.value}>
                    {r.href ? (
                      <a
                        className="eep-row-link"
                        href={r.href}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.value}
                      </a>
                    ) : (
                      r.value
                    )}
                  </span>
                </div>
                {showCopy ? (
                  <button
                    type="button"
                    className={`eep-copy ${isCopied ? "eep-copied" : ""}`}
                    aria-label={isCopied ? `${r.label} copied` : `Copy ${r.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(r.field, r.value);
                    }}
                  >
                    {isCopied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} strokeWidth={1.9} />}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {children ? <div className="eep-extra">{children}</div> : null}

      {showButton ? (
        <div className="eep-foot">
          <button
            type="button"
            className={`eep-btn ${fullWidthButton ? "eep-btn-full" : ""}`}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onViewProfile?.(value);
            }}
          >
            {buttonLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
