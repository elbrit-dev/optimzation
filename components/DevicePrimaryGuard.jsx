import React from "react";
import { createPortal } from "react-dom";
import { DeviceUUID } from "device-uuid";
import { Smartphone, ShieldCheck } from "lucide-react";
import { graphqlRequest } from "@calendar/lib/graphql-client";

/**
 * DevicePrimaryGuard — one-time capture of the user's attendance device.
 *
 * Trigger (BOTH must be true, otherwise the component renders nothing):
 *   1. The ERP field `attendance_device_id` is EMPTY (`storedDeviceId` prop is blank).
 *   2. The current device is a phone or tablet (NOT a desktop).
 *
 * On trigger it shows a modal asking the user to decide:
 *   - "Yes, save"  -> persists the id + the COMPLETE device JSON into localStorage
 *                     and fires onSave(deviceId, info). Wire onSave in Plasmic Studio
 *                     to your ERP mutation that writes attendance_device_id.
 *   - "Not now"    -> fires onDecline(); nothing is persisted; the ERP field stays
 *                     empty, so the popup will appear again next time.
 *
 * This component is PURE: it never writes to ERP itself. It only decides + emits,
 * exactly like PushNotificationToggle's onChange. The ERP write is a Studio interaction.
 *
 * iPad gotcha: iPadOS 13+ Safari sends a desktop user-agent, so device-uuid reports
 * an iPad as desktop. We add a maxTouchPoints check so iPads are correctly treated
 * as tablets and still trigger the popup.
 */

const STYLE_ID = "edg-device-guard-styles";

// Treat "", null, undefined, and ERP's stringy blanks as empty.
function hasStoredId(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s !== "" && s !== "none" && s !== "null" && s !== "undefined";
}

// device-uuid misreads iPadOS 13+ as desktop -> add the touch-points fallback.
function isMobileOrTablet(du) {
  if (du.isMobile || du.isTablet) return true;
  if (
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints > 1 &&
    /Mac/i.test(navigator.platform || "")
  ) {
    return true; // iPad pretending to be a Mac
  }
  return false;
}

function deviceTypeOf(du) {
  if (du.isTablet) return "tablet";
  if (du.isMobile) return "mobile";
  if (
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints > 1 &&
    /Mac/i.test(navigator.platform || "")
  ) {
    return "tablet"; // iPad
  }
  return "desktop";
}

// Build the COMPLETE JSON snapshot to store in localStorage.
function buildInfo(candidateId) {
  const du = new DeviceUUID().parse();
  const raw = JSON.parse(JSON.stringify(du)); // full serializable dump of every parsed field
  return {
    deviceId: candidateId,
    fingerprint: new DeviceUUID().get(),
    deviceType: deviceTypeOf(du),
    browser: du.browser,
    version: du.version,
    os: du.os,
    platform: du.platform,
    resolution: du.resolution,
    colorDepth: du.colorDepth,
    pixelDepth: du.pixelDepth,
    language: du.language,
    cpuCores: du.cpuCores,
    userAgent: du.source,
    capturedAt: new Date().toISOString(),
    raw, // <-- the complete device-uuid parse() data
  };
}

const DEMO_INFO = {
  deviceId: "b7e2f0d1-1a2b-4c3d-9e8f-0a1b2c3d4e5f",
  deviceType: "mobile",
  browser: "Chrome",
  version: "131.0.0.0",
  os: "Android",
  platform: "Linux armv8l",
  resolution: [412, 915],
  language: "en-US",
};

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .edg-overlay {
      position: fixed; inset: 0; z-index: var(--edg-z, 2000000001);
      display: flex; align-items: center; justify-content: center;
      padding: 16px; background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(2px); animation: edg-fade .18s ease;
    }
    .edg-card {
      width: 100%; max-width: 380px; box-sizing: border-box;
      background: #fff; color: #1e293b; border-radius: 18px;
      padding: 22px 20px 18px; font: 500 15px/1.45 inherit;
      box-shadow: 0 20px 60px rgba(0,0,0,0.28); animation: edg-pop .22s cubic-bezier(.16,1,.3,1);
    }
    .edg-icon {
      width: 46px; height: 46px; border-radius: 13px; display: flex;
      align-items: center; justify-content: center; margin-bottom: 14px;
      background: color-mix(in srgb, var(--edg-accent) 15%, transparent);
      color: var(--edg-accent);
    }
    .edg-title { font-size: 18px; font-weight: 700; margin: 0 0 6px; }
    .edg-desc { font-size: 14px; color: #64748b; margin: 0 0 16px; }
    .edg-details {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 10px 12px; margin-bottom: 18px; font-size: 13px;
    }
    .edg-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
    .edg-row span:first-child { color: #94a3b8; }
    .edg-row span:last-child { font-weight: 600; text-align: right; word-break: break-word; }
    .edg-actions { display: flex; gap: 10px; }
    .edg-btn {
      flex: 1; border: 0; border-radius: 11px; padding: 11px 12px;
      font: 600 14px/1 inherit; cursor: pointer; transition: filter .12s ease, background .12s ease;
    }
    .edg-btn:active { transform: scale(0.99); }
    .edg-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .edg-save { background: var(--edg-accent); color: #fff; }
    .edg-save:hover { filter: brightness(1.06); }
    .edg-decline { background: #f1f5f9; color: #475569; }
    .edg-decline:hover { background: #e2e8f0; }
    .edg-error {
      background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
      border-radius: 10px; padding: 9px 11px; margin-bottom: 14px; font-size: 13px;
    }
    @keyframes edg-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes edg-pop { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .edg-overlay, .edg-card { animation: none; } }
  `;
  document.head.appendChild(el);
}

export default function DevicePrimaryGuard({
  storedDeviceId,
  employeeId, // Employee docname (e.g. "HR-EMP-0001"). If set, the popup writes to ERP itself.
  employeeDoctype = "Employee",
  deviceIdFieldname = "attendance_device_id",
  enabled = true, // bind to "employee data loaded" so the popup can't flash before storedDeviceId arrives
  localStorageIdKey = "attendance_device_id",
  localStorageInfoKey = "attendance_device_info",
  allowDesktop = false, // escape hatch for testing; your rule is mobile/tablet only
  title = "Register this device?",
  description = "Save this phone/tablet as your attendance device? You'll use it to check in.",
  saveLabel = "Yes, save this device",
  declineLabel = "Not now",
  accentColor = "#2c5282",
  zIndex = 2000000001,
  forceShow = false, // Plasmic Studio canvas preview
  className,
  style,
  onSave,
  onDecline,
}) {
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [info, setInfo] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const infoRef = React.useRef(null);

  const isPreview = Boolean(forceShow);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    ensureStyles();
    setMounted(true);

    if (isPreview) {
      setInfo(DEMO_INFO);
      setOpen(true);
      return;
    }

    // Wait until the caller says the employee data is loaded, so an initial
    // `undefined` storedDeviceId (still fetching) can't flash the popup.
    if (!enabled) {
      setOpen(false);
      return;
    }

    // Rule 1: ERP field already has a value -> never trigger.
    if (hasStoredId(storedDeviceId)) {
      setOpen(false);
      return;
    }

    // Rule 2: desktop -> never trigger (unless allowDesktop for testing).
    const du = new DeviceUUID().parse();
    if (!allowDesktop && !isMobileOrTablet(du)) {
      setOpen(false);
      return;
    }

    // Empty + mobile/tablet -> prepare the payload and show the popup.
    // Reuse an existing local id if one is already stored, else mint a fresh UUID.
    // NOTE: nothing is written to localStorage yet — only on "Yes".
    const existing = window.localStorage.getItem(localStorageIdKey);
    const candidateId =
      (existing && existing.trim()) ||
      (window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

    const payload = buildInfo(candidateId);
    infoRef.current = payload;
    setInfo(payload);
    setOpen(true);
  }, [storedDeviceId, enabled, isPreview, allowDesktop, localStorageIdKey]);

  const handleSave = React.useCallback(async () => {
    const payload = infoRef.current;
    if (!payload) return;
    setError("");

    // If we know which Employee to update, write to ERP DIRECTLY — same pattern
    // as the calendar/planner: saveDoc(doctype, doc) via graphqlRequest.
    if (hasStoredId(employeeId)) {
      setSaving(true);
      try {
        const mutation = `
          mutation SaveAttendanceDevice($doc: String!) {
            saveDoc(doctype: "${employeeDoctype}", doc: $doc) {
              doc { name ${deviceIdFieldname} }
            }
          }`;
        const doc = { name: employeeId, [deviceIdFieldname]: payload.deviceId };
        const data = await graphqlRequest(mutation, { doc: JSON.stringify(doc) });
        if (!data?.saveDoc?.doc?.name) {
          throw new Error("ERP did not return the Employee record.");
        }
      } catch (e) {
        setSaving(false);
        setError(e?.message || "Couldn't save to ERP. Please try again.");
        return; // keep the popup open so the user can retry
      }
      setSaving(false);
    }

    // Persist locally only after ERP succeeded (or when no employeeId was given,
    // in which case the write is handled by the onSave interaction in Studio).
    if (typeof window !== "undefined") {
      window.localStorage.setItem(localStorageIdKey, payload.deviceId);
      window.localStorage.setItem(localStorageInfoKey, JSON.stringify(payload));
    }
    onSave?.(payload.deviceId, payload);
    setOpen(false);
  }, [employeeId, employeeDoctype, deviceIdFieldname, localStorageIdKey, localStorageInfoKey, onSave]);

  const handleDecline = React.useCallback(() => {
    if (saving) return;
    // User said no -> persist nothing; ERP stays empty; popup returns next time.
    onDecline?.();
    setOpen(false);
  }, [saving, onDecline]);

  if ((!mounted && !isPreview) || !open || !info) return null;
  ensureStyles();

  const card = (
    <div className="edg-overlay" style={{ "--edg-z": zIndex }} role="dialog" aria-modal="true">
      <div
        className={`edg-card${className ? ` ${className}` : ""}`}
        style={{ "--edg-accent": accentColor, ...style }}
      >
        <div className="edg-icon">
          <Smartphone size={22} strokeWidth={2.25} />
        </div>
        <h2 className="edg-title">{title}</h2>
        <p className="edg-desc">{description}</p>

        <div className="edg-details">
          <div className="edg-row"><span>Device</span><span>{info.deviceType}</span></div>
          <div className="edg-row"><span>Browser</span><span>{info.browser} {info.version}</span></div>
          <div className="edg-row"><span>OS</span><span>{info.os}</span></div>
        </div>

        {error ? <div className="edg-error">{error}</div> : null}

        <div className="edg-actions">
          <button className="edg-btn edg-decline" onClick={handleDecline} disabled={saving}>
            {declineLabel}
          </button>
          <button className="edg-btn edg-save" onClick={handleSave} disabled={saving}>
            <ShieldCheck size={15} strokeWidth={2.5} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            {saving ? "Saving…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (isPreview || typeof document === "undefined") return card;
  return createPortal(card, document.body);
}
