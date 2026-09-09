"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import doctorDetailStyles from "./DoctorDetail.styles";
import { Activity, ArrowUpRight, Building2, CalendarDays, ChevronDown, ClipboardList, MapPin, Package, Search, Users, Wallet } from "lucide-react";

import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import { graphqlRequest } from "@calendar/lib/graphql-client";
import { getEndpointConfigFromUrlKeyAsync } from "@/app/graphql-playground/constants";

// The POB popup drags in the calendar's form kit, its ERP services and the item
// master. The detail page renders fine without any of it, so it loads the first
// time somebody presses Add POB.
const DoctorPobDialog = dynamic(() => import("./DoctorPobDialog"), { ssr: false });

/** Doctor profile with independently loaded business, visits and contact data.
 * Accepts a Lead row or the complete { Lead, Addresses, Events, Quotations }
 * query result. Existing field mappings, actions and POB callbacks stay intact.
 */

/** Unwrap edge/connection/array wrappers down to the ONE row inside. */
function normalizeRow(data) {
  if (data == null) return null;
  if (Array.isArray(data)) return normalizeRow(data[0]);
  if (typeof data !== "object") return null;
  if (data.node && typeof data.node === "object") return normalizeRow(data.node);
  if (Array.isArray(data.edges)) return normalizeRow(data.edges[0]);
  if (Array.isArray(data.nodes)) return normalizeRow(data.nodes[0]);
  return data;
}

/**
 * Unwrap a LIST the same way — a plain array, a GraphQL connection
 * ({ edges: [{ node }] }), or { nodes: [] }. Returns null (not []) when there
 * is nothing list-shaped at all, so "the caller gave me none" stays
 * distinguishable from "the caller gave me an empty list".
 */
function normalizeConnection(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeRow(entry)).filter(Boolean);
  }
  if (typeof value !== "object") return null;
  if (Array.isArray(value.edges)) {
    return value.edges.map((edge) => normalizeRow(edge)).filter(Boolean);
  }
  if (Array.isArray(value.nodes)) {
    return value.nodes.map((node) => normalizeRow(node)).filter(Boolean);
  }
  return null;
}

/**
 * Read a field whether the row is flattened ("territory__name") or nested
 * ({ territory: { name } }), tolerating a scalar Link value at the parent.
 */
function readField(row, key) {
  if (!row || !key) return undefined;
  if (row[key] != null) return row[key];
  const parts = String(key).includes("__") ? String(key).split("__") : String(key).split(".");
  let cursor = row;
  for (const part of parts) {
    if (cursor == null) return undefined;
    if (typeof cursor !== "object") return cursor;
    cursor = cursor[part];
  }
  return cursor;
}

/** First non-empty value among the configured field and its known aliases. */
function pick(row, field, aliases) {
  const keys = [field, ...(aliases ?? [])].filter(Boolean);
  for (const key of keys) {
    const value = readField(row, key);
    if (value == null) continue;
    const text =
      typeof value === "object"
        ? (value.name ?? value.territory_name ?? value.label ?? value.value ?? "")
        : value;
    const trimmed = String(text).trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Same as `pick`, but across the enriched Lead first and the bound row second. */
function pickBoth(primary, fallback, field, aliases) {
  return pick(primary, field, aliases) || pick(fallback, field, aliases);
}

const SALUTATIONS = new Set([
  "dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "miss", "prof", "prof.",
]);

/** "Dr Meenakshi R" -> "MR", "Dr Shanmugam" -> "S" (the salutation never counts). */
function initialsOf(name) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !SALUTATIONS.has(w.toLowerCase()));
  if (words.length === 0) return "?";
  return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");
}

/** "Elbrit Trichy - ELPL" -> "Elbrit Trichy" (drop the trailing company abbr). */
function stripCompanySuffix(text) {
  return String(text ?? "").trim().replace(/\s+-\s+[A-Za-z]{2,8}$/, "").trim();
}

/**
 * The (division, HQ, beat) rows behind the coverage table.
 *
 * `custom_role_profile` is a real pairing — "Aura & Proxima Kerala AT
 * HQ-Kottayam" — so it is kept as rows here rather than flattened into chips
 * the way the list card shows it. The POB popup needs the same pairing, and
 * takes it straight off this list instead of going back to ERP.
 */
function readRoleRows(row, tagsField) {
  const raw = readField(row, tagsField);
  if (!Array.isArray(raw)) return [];

  const seen = new Set();
  const out = [];
  raw.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const department = stripCompanySuffix(
      pick(entry, "department__name", ["department", "department_name"])
    );
    const hq = pick(entry, "hq__name", ["hq", "territory__name", "territory"]);
    const beat = pick(entry, "role_profile_list__name", ["role_profile_list", "role_id"]);
    if (!department && !hq && !beat) return;
    const key = `${hq}|${department}|${beat}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ department, hq: hq || null, beat: beat || null,
      employee: pick(entry, "role_profile_list.custom_employee_id.employee_name", []),
      employeeId: pick(entry, "role_profile_list.custom_employee_id.employee", []),
    });
  });
  return out;
}

/**
 * The CRM notes, newest first.
 *
 * `note` is stored as HTML ("<p>Registration</p>") because ERP writes it
 * through a rich-text control, so it is flattened to text here — a detail page
 * must not hand ERP-authored markup to dangerouslySetInnerHTML.
 */
function readNotes(row) {
  const raw = readField(row, "notes");
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, i) => {
      if (!entry) return null;
      const text = stripHtml(typeof entry === "object" ? entry.note : entry);
      if (!text) return null;
      return {
        id: String(entry?.name ?? i),
        text,
        // `added_on` / `added_by` are only stamped on notes written through the
        // app; bulk-imported ones carry a row `creation` and nothing else, so
        // they would otherwise render with no date at all.
        at: entry?.added_on ?? entry?.creation ?? entry?.modified ?? null,
        author: pick(entry, "added_by__name", ["added_by"]),
        idx: Number(entry?.idx ?? i) || 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (toTime(b.at) ?? b.idx) - (toTime(a.at) ?? a.idx));
}

function stripHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------ *
 * List-shaped props                                                   *
 *                                                                     *
 * `sections` and `actions` each replace a handful of booleans. One     *
 * multi-select is easier to get right in Studio than six switches,     *
 * and it carries ORDER, which booleans cannot.                        *
 * ------------------------------------------------------------------ */

const SECTION_KEYS = ["business", "visits", "notes", "coverage", "contact", "classification", "record"];
const ACTION_KEYS = ["pob", "note", "call", "whatsapp", "email", "directions"];

/**
 * Sections that want the wider column on a desktop layout. Everything else
 * goes in the narrow column, each in the order the caller listed it.
 */
const WIDE_SECTIONS = new Set(["business", "visits", "notes"]);

/**
 * Normalise a multi-select prop.
 *
 * Studio can hand this over as an array, a comma-separated string, or an
 * object of booleans (which is what the old props effectively were, so a page
 * built against those still works). An unknown key is dropped rather than
 * throwing, and duplicates collapse while keeping first position.
 */
function readKeys(value, allowed, fallback) {
  if (value == null) return fallback;

  let list;
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === "string") {
    list = value.split(/[,\s]+/);
  } else if (typeof value === "object") {
    list = Object.keys(value).filter((key) => value[key]);
  } else {
    return fallback;
  }

  const seen = new Set();
  const out = [];
  list.forEach((entry) => {
    const key = String(entry ?? "").trim().toLowerCase();
    if (!key || seen.has(key) || !allowed.includes(key)) return;
    seen.add(key);
    out.push(key);
  });
  // An empty selection is a real choice ("show no sections"), so it is kept —
  // only a missing prop falls back to the default.
  return out;
}

/* ------------------------------------------------------------------ *
 * Formatting                                                          *
 * ------------------------------------------------------------------ */

function toTime(value) {
  if (!value) return null;
  // ERP hands back "2026-01-21 15:01:41.256931" — Safari refuses that, so the
  // space becomes a T and the microseconds are trimmed to milliseconds.
  const normalized =
    typeof value === "string"
      ? value.trim().replace(" ", "T").replace(/(\.\d{3})\d+$/, "$1")
      : value;
  const parsed = new Date(normalized);
  const t = parsed.getTime();
  return Number.isNaN(t) ? null : t;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(value) {
  const t = toTime(value);
  if (t == null) return "";
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "3 days ago" / "in 2 months" — the shape a rep reads a note timeline in. */
function relTime(value) {
  const t = toTime(value);
  if (t == null) return "";
  const diff = Date.now() - t;
  const abs = Math.abs(diff);
  const day = 86400000;
  const units = [
    [day * 365, "year"],
    [day * 30, "month"],
    [day * 7, "week"],
    [day, "day"],
    [3600000, "hour"],
    [60000, "minute"],
  ];
  for (const [size, label] of units) {
    if (abs >= size) {
      const n = Math.round(abs / size);
      const plural = n === 1 ? label : `${label}s`;
      return diff >= 0 ? `${n} ${plural} ago` : `in ${n} ${plural}`;
    }
  }
  return "just now";
}

function toNumber(value) {
  if (value == null || value === "") return NaN;
  const text = String(value).trim().replace(/[,₹\s]/g, "");
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) return NaN;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

/** ₹1,42,300 — Indian grouping, no decimals unless the amount needs them. */
function fmtMoney(value, currency = "₹") {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return "—";
  return (
    currency +
    n.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: n < 1000 && n % 1 ? 2 : 0,
    })
  );
}

/** ₹1.4L / ₹2.3Cr — for stat tiles and chart labels, where width is scarce. */
function fmtMoneyShort(value, currency = "₹") {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${currency}${(n / 1e7).toFixed(abs >= 1e8 ? 0 : 2)}Cr`;
  if (abs >= 1e5) return `${currency}${(n / 1e5).toFixed(abs >= 1e6 ? 0 : 2)}L`;
  if (abs >= 1000) return `${currency}${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return fmtMoney(n, currency);
}

function fmtNum(value) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN");
}

/**
 * ERP writes "0" into mobile_no / phone / whatsapp_no on bulk-imported doctors
 * where no number was known, so those columns are full of zeroes rather than
 * nulls. A detail page that printed them would be inviting a rep to dial 0.
 */
function realPhone(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  if (!digits || digits.length < 6) return "";
  if (/^0+$/.test(digits)) return "";
  return String(value).trim();
}

function realEmail(value) {
  const text = String(value ?? "").trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) ? text : "";
}

/** A coordinate ERP would actually accept — 0,0 means "never captured". */
function realCoord(value) {
  const n = toNumber(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

/* ------------------------------------------------------------------ *
 * Accent                                                             *
 * ------------------------------------------------------------------ */

/**
 * The Elbrit palette, taken off the logo rather than guessed.
 *
 * Sampling the logo animation frame by frame gives a white "e" on a single
 * red — #D92C24, which matches the #DC2627 already sitting in
 * public/logo.svg. There is no secondary brand hue, so every tint below is
 * derived from that one red, and the page's deep tone is a darkened brand red
 * instead of a borrowed navy.
 *
 * `ink` exists because #D92C24 on white is about 4.3:1 — fine behind a chart
 * bar or a filled button, short of comfortable for small type. Red TEXT uses
 * the darker step; the bright red stays on fills.
 */
const BRAND = {
  accent: "#D92C24",
  ink: "#A81C16",
  soft: "#FCEDEC",
  line: "#F3C9C6",
  deep: "#2E100D",
  deep2: "#6B1712",
};

/**
 * Speciality-derived accents, for pages that would rather every doctor carry
 * their own colour the way the list card's chip does. Picked deterministically
 * off the text, so one speciality keeps its colour across cards and reloads.
 */
const TONES = [
  { accent: "#7C3AED", ink: "#5B21B6", soft: "#F5F3FF", line: "#DDD6FE", deep: "#2E1065", deep2: "#4C1D95" },
  { accent: "#0E7C63", ink: "#0A5B49", soft: "#ECFDF5", line: "#A7F3D0", deep: "#052E26", deep2: "#0A5044" },
  { accent: "#0369A1", ink: "#075985", soft: "#F0F9FF", line: "#BAE6FD", deep: "#0C2A3F", deep2: "#0B4A6E" },
  { accent: "#B45309", ink: "#92400E", soft: "#FFFBEB", line: "#FDE68A", deep: "#3B1F06", deep2: "#78350F" },
  { accent: "#BE123C", ink: "#9F1239", soft: "#FFF1F2", line: "#FECDD3", deep: "#3F0716", deep2: "#881337" },
  { accent: "#0F766E", ink: "#115E59", soft: "#F0FDFA", line: "#99F6E4", deep: "#042F2A", deep2: "#134E4A" },
  { accent: "#4338CA", ink: "#3730A3", soft: "#EEF2FF", line: "#C7D2FE", deep: "#1E1B4B", deep2: "#312E81" },
];

function toneOf(text) {
  const value = String(text ?? "");
  if (!value) return TONES[6];
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  return TONES[hash % TONES.length];
}

/** "#abc" / "#aabbcc" -> [r, g, b]; anything else -> null. */
function parseHex(value) {
  const text = String(value ?? "").trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short) return short.slice(1).map((c) => parseInt(c + c, 16));
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
  if (long) return long.slice(1).map((c) => parseInt(c, 16));
  return null;
}

function mix(rgb, target, amount) {
  return (
    "#" +
    rgb
      .map((c) => Math.round(c + (target - c) * amount).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** A full accent set from one colour, so `accent` can just be a hex. */
function deriveAccent(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return {
    accent: mix(rgb, 0, 0),
    ink: mix(rgb, 0, 0.26),
    soft: mix(rgb, 255, 0.92),
    line: mix(rgb, 255, 0.7),
    deep: mix(rgb, 0, 0.82),
    deep2: mix(rgb, 0, 0.55),
  };
}

/**
 * `accent` is "brand" (the default), "speciality", or any hex. Anything
 * unrecognised falls back to the brand rather than rendering an uncoloured
 * page, so a typo in Studio is survivable.
 */
function resolveAccent(accent, speciality) {
  const value = String(accent ?? "").trim().toLowerCase();
  if (!value || value === "brand" || value === "elbrit") return BRAND;
  if (value === "speciality" || value === "specialty") return toneOf(speciality);
  return deriveAccent(accent) ?? BRAND;
}

/* ------------------------------------------------------------------ *
 * Classification                                                      *
 * ------------------------------------------------------------------ */

/**
 * `custom_category1` is a two-axis code — LILR / LIHR / HILR / HIHR — where the
 * first pair is the I axis and the second the R axis, each Low or High. The
 * locator below plots the doctor's cell on that 2x2 without asserting what the
 * axes are called: the axis NAMES are props (defaulting to Investment and
 * Return), because Category List stores the bare codes and nothing in ERP
 * records the expansion. Rename them in Studio to whatever the commercial team
 * calls them and the four cells relabel themselves.
 *
 * Only a legacy slice of doctors carries category1 at all, which is why this is
 * a panel and not the page's centrepiece — the panel simply does not render
 * when the code is absent or is not one of the four.
 */
const MATRIX_CODES = ["LILR", "LIHR", "HILR", "HIHR"];

function parseMatrixCode(code) {
  const text = String(code ?? "").trim().toUpperCase();
  if (!MATRIX_CODES.includes(text)) return null;
  return {
    code: text,
    // "HI" / "LI" then "HR" / "LR" — the letter before each axis initial.
    yHigh: text.startsWith("HI"),
    xHigh: text.slice(2).startsWith("H"),
  };
}

/* ------------------------------------------------------------------ *
 * ERP access — the endpoint resolution the POB popup already proved.  *
 * ------------------------------------------------------------------ */

/**
 * The stored token is a whole Authorization header value ("token key:secret"),
 * while the calendar's GraphQL client adds the scheme itself.
 */
function stripAuthScheme(token) {
  return String(token ?? "").trim().replace(/^(token|bearer)\s+/i, "");
}

const LIVE_ERP_TARGET = "ERP";

/**
 * Point the calendar's ERP client at an endpoint.
 *
 * On the calendar page AuthProvider has already done this and we must not
 * disturb it. On the doctor page nothing has, so resolve the live row from the
 * same global tokens the page's own data provider runs on. Named explicitly
 * rather than following /tokens' "default" flag, which is a convenience for the
 * query playground and points at whichever instance was last poked.
 */
async function ensureErpAuth({ erpUrl, authToken, erpTarget }) {
  const explicitToken = stripAuthScheme(authToken);
  if (erpUrl && explicitToken) {
    AUTH_CONFIG.erpUrl = String(erpUrl).trim();
    AUTH_CONFIG.authToken = explicitToken;
    return;
  }

  if (AUTH_CONFIG.erpUrl && AUTH_CONFIG.authToken) return;

  const config = await getEndpointConfigFromUrlKeyAsync(
    String(erpTarget || LIVE_ERP_TARGET).trim().toUpperCase()
  );
  const token = stripAuthScheme(config?.authToken);
  if (!config?.endpointUrl || !token) {
    throw new Error(
      "No ERP endpoint is configured for this page. Add a global token in /tokens, or bind ERP URL + Auth Token on the component."
    );
  }
  AUTH_CONFIG.erpUrl = config.endpointUrl;
  AUTH_CONFIG.authToken = token;
}

/**
 * The full Lead, richest shape first.
 *
 * Asked as `Lead(name:)` rather than a filtered `Leads` list because filtering
 * the list by name returns [] in frappe_graphql — the same reason the POB popup
 * fetches the doctor's roles this way.
 *
 * Three tiers, because one unknown field fails the entire request and Link
 * fields are not exposed identically on every instance: tier 1 asks for the
 * Link labels (`custom_qualification__name`, `country__name`), tier 2 drops to
 * the raw Link values, tier 3 asks only for the fields the list query already
 * proves exist. Whatever comes back is merged over the bound row.
 */
// Keep the confirmed schema as a fallback when optional contact fields differ.
const LEAD_FIELDS = `
  city first_name lead_name name custom_category1__name custom_category2__name
  custom_category3__name custom_address_created custom_latitude
  custom_latitude_and_longitude custom_longitude custom_specialty__name
  custom_speciality email_id custom_category__name
  notes { name added_by__name added_on note creation }
  territory { name territory_name }
  custom_role_profile {
    role_profile_list__name department__name hq__name
    role_profile_list { custom_employee_id { employee_name employee } }
  }
`;
const LEAD_QUERIES = [
  `query DoctorDetail($name: String!) { Lead(name: $name) {
    ${LEAD_FIELDS}
    custom_qualification__name mobile_no phone whatsapp_no status
    company__name creation modified
  } }`,
  `query DoctorDetail($name: String!) { Lead(name: $name) { ${LEAD_FIELDS} } }`,
];
const POB_FIELDS = `
  name address_display custom_event__name custom_doctorvisit__name
  customer_address__name customer_name valid_till
  territory__name total_qty transaction_date
  items { item_name net_amount ordered_qty qty rate taxable_value }
`;
const POB_QUERIES = [
  `query DoctorPobs($first: Int!, $name: String!) {
    Quotations(first: $first, filter: {fieldname: "custom_doctorvisit", operator: EQ, value: $name}) {
      edges { node { ${POB_FIELDS} status grand_total } }
    }
  }`,
  `query DoctorPobs($first: Int!, $name: String!) {
    Quotations(first: $first, filter: {fieldname: "custom_doctorvisit", operator: EQ, value: $name}) {
      edges { node { ${POB_FIELDS} } }
    }
  }`,
];
/**
 * Addresses are read over REST, not GraphQL, and that is deliberate.
 *
 * An Address is joined to its doctor through the `Dynamic Link` CHILD table
 * (link_doctype = "Lead", link_name = the Lead id) — there is no link_name
 * column on Address itself. frappe_graphql's DBFilterInput is
 * { fieldname, operator, value }, with nowhere to name a second doctype, so
 * that join cannot be expressed there at all. Frappe's REST list API can:
 * filters=[["Dynamic Link","link_name","=","DR-36661"]], verified against live
 * ERP. (Two more reasons the old query could not have worked: this schema
 * pluralises naively — Territorys, RoleProfiles — so the field is Addresss, not
 * Addresses; and link_name is itself a Dynamic Link, so link_name__name does
 * not resolve either.)
 *
 * Same credential as the GraphQL client, with the base URL derived from it the
 * way the calendar's own change probe does.
 */
const ADDRESS_FIELDS = [
  "name", "address_title", "address_type", "address_line1", "address_line2",
  "city", "county", "state", "pincode", "country", "phone", "email_id",
];

function erpRestBase() {
  const { erpUrl } = AUTH_CONFIG;
  if (!erpUrl) throw new Error("Missing ERP auth configuration");
  return erpUrl
    .replace(/(\/api(?:\/method)?\/graphql|\/graphql)\/?$/i, "")
    .replace(/\/$/, "");
}

async function fetchDoctorAddresses(doctorId) {
  const { authToken } = AUTH_CONFIG;
  if (!authToken) throw new Error("Missing ERP auth configuration");

  const params = new URLSearchParams({
    fields: JSON.stringify(ADDRESS_FIELDS),
    filters: JSON.stringify([
      ["Dynamic Link", "link_doctype", "=", "Lead"],
      ["Dynamic Link", "link_name", "=", doctorId],
    ]),
    limit_page_length: "10",
    // Both tables carry `modified`, so an unqualified order_by is ambiguous
    // once the child table is joined and Frappe answers 500.
    order_by: "`tabAddress`.`modified` desc",
  });

  const response = await fetch(erpRestBase() + "/api/resource/Address?" + params, {
    headers: { Accept: "application/json", Authorization: "token " + authToken },
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  const json = await response.json();
  return Array.isArray(json && json.data) ? json.data : [];
}
/**
 * Visit history.
 *
 * Two fields are deliberately NOT asked for.
 *
 * `custom_department` exists on Event but the app never writes it — there is no
 * department entry in the calendar's ERP_EVENT_FIELDS, and the
 * `custom_department { … }` blocks in events.query.js belong to RoleProfiles,
 * not Event. Reading it only ever produced a blank line; the doctor's own
 * role-profile rows are where their division actually lives.
 *
 * `attending` on the Event PARENT is not the attendance signal. Attendance is
 * written per participant (event-to-erp.js sets participant.attending), so the
 * parent's value is "" on real events. `event_participants` is requested
 * instead: it carries attending plus custom_visit_time, which is the pair the
 * calendar's own doctorVisitHistory uses to decide a visit was actually MADE
 * rather than merely planned.
 */
const VISIT_QUERY = `query DoctorVisits($name: String!) {
  Events(first: 1000, filter: {fieldname: "custom_doctor", operator: EQ, value: $name}) {
    edges { node {
      name event_type starts_on event_category custom_longitude custom_latitude
      custom_hq__name custom_force_visit_reason custom_employee_id__name
      custom_doctor__name subject status
      custom_pob_given custom_employee_id { employee_name employee } creation
      event_participants {
        reference_doctype__name reference_docname__name attending
        custom_visit_time custom_is_force_visit
      }
    } }
  }
}`;

/** Run a ladder of query shapes, returning the first that answers. */
async function firstSuccessful(queries, variables, extract) {
  let lastError = null;
  for (const query of queries) {
    try {
      const data = await graphqlRequest(query, variables);
      const value = extract(data);
      if (value != null) return value;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}

/**
 * Everything the bound row does not carry: the full Lead, and the POB ledger.
 *
 * Both are additive and independent — POBs failing must not blank the notes, so
 * they settle into separate state and each keeps its own error. Nothing is
 * cached here: a detail page is opened for one doctor at a time and a stale POB
 * total is worse than a second's wait.
 */
function useDoctorEnrichment(doctorId, { enabled, pobLimit, pobsGiven, visitsGiven, addressesGiven, erpUrl, authToken, erpTarget }) {
  const [result, setResult] = useState(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const requestKey = JSON.stringify([doctorId, enabled, erpUrl, authToken, erpTarget, nonce]);
  useEffect(() => {
    if (!enabled || !doctorId) return undefined;
    let live = true;
    // Each job is [key, run(variables), alreadySupplied]. Addresses run over
    // REST rather than through the GraphQL ladder — see fetchDoctorAddresses
    // for why that join cannot be expressed in GraphQL at all.
    const jobs = [
      ["lead", (vars) => firstSuccessful(LEAD_QUERIES, vars, (d) => d?.Lead ?? null), null],
      ["pobs", (vars) => firstSuccessful(POB_QUERIES, vars, (d) => normalizeConnection(d?.Quotations)), pobsGiven],
      ["visits", (vars) => firstSuccessful([VISIT_QUERY], vars, (d) => normalizeConnection(d?.Events)), visitsGiven],
      ["addresses", (vars) => fetchDoctorAddresses(vars.name), addressesGiven],
    ].filter(([, , given]) => !Array.isArray(given));
    setResult({ key: requestKey, loading: Object.fromEntries(jobs.map(([key]) => [key, true])), errors: {} });
    const update = (key, value, error) => {
      if (!live) return;
      setResult((prev) => ({ ...prev, [key]: value,
        loading: { ...prev.loading, [key]: false },
        errors: { ...prev.errors, [key]: error || null },
      }));
    };
    (async () => {
      try {
        await ensureErpAuth({ erpUrl, authToken, erpTarget });
      } catch {
        jobs.forEach(([key]) => update(key, null, true));
        return;
      }
      const variables = {
        name: doctorId,
        first: Math.max(1, Math.min(1000, Number(pobLimit) || 200)),
      };
      await Promise.all(jobs.map(async ([key, run]) => {
        try {
          const value = await run(variables);
          if (value == null) throw new Error("No result");
          update(key, value, null);
        } catch {
          update(key, null, true);
        }
      }));
    })();
    return () => { live = false; };
  }, [enabled, doctorId, pobLimit, pobsGiven, visitsGiven, addressesGiven, erpUrl, authToken, erpTarget, nonce, requestKey]);
  // Never paint a previous doctor's details during the render before effects run.
  const current = enabled && result?.key === requestKey ? result : null;
  const pending = !!enabled && !!doctorId && !current;
  return {
    lead: current?.lead, pobs: current?.pobs, visits: current?.visits, addresses: current?.addresses,
    loadingLead: pending || !!current?.loading.lead,
    loadingPobs: !pobsGiven && (pending || !!current?.loading.pobs),
    loadingVisits: !visitsGiven && (pending || !!current?.loading.visits),
    loadingAddresses: !addressesGiven && (pending || !!current?.loading.addresses),
    errors: current?.errors || {}, refresh,
  };
}

/**
 * Whether a visit actually HAPPENED, and when.
 *
 * A plan that nobody carried out is still an Event, so the date alone proves
 * nothing. The calendar marks a visit by stamping the EMPLOYEE participant
 * attending "Yes" with a `custom_visit_time`; that pair is the only evidence a
 * call was made, and it is what doctorVisitHistory keys on too. The parent
 * Event's own `attending` is never written and is not consulted.
 *
 * Returns { made, at, forced } — `at` is the latest participant stamp, so a
 * joint call reads as one visit at the time the last person arrived.
 */
function readVisitAttendance(visit) {
  const rows = Array.isArray(visit?.event_participants) ? visit.event_participants : [];
  const stamps = [];
  let forced = false;

  rows.forEach((row) => {
    const type = pick(row, "reference_doctype__name", ["reference_doctype"]);
    // Employee participants are the callers; a User row is the invitee copy.
    if (type && !/^employee$/i.test(type)) return;
    if (!/^(yes|true|1)$/i.test(String(row?.attending ?? "").trim())) return;
    const at = toTime(row?.custom_visit_time);
    if (at != null) stamps.push(at);
    if (row?.custom_is_force_visit === true || row?.custom_is_force_visit === 1) forced = true;
  });

  if (!stamps.length) return { made: false, at: null, forced };
  return { made: true, at: Math.max.apply(null, stamps), forced };
}

function itemValue(item) {
  for (const field of ["net_amount", "amount", "taxable_value"]) {
    const value = toNumber(item?.[field]);
    if (Number.isFinite(value)) return value;
  }
  return toNumber(item?.qty) * toNumber(item?.rate);
}

function addressText(address) {
  return [address.address_line1, address.address_line2, address.city, address.state, address.pincode, address.country__name].filter(Boolean).join(", ");
}

/* ------------------------------------------------------------------ *
 * POB analysis — the numbers the business panel is built from.        *
 * ------------------------------------------------------------------ */

/**
 * Turn the raw quotation list into what a rep is actually asking:
 * how much, how often, when last, in which months, and on which products.
 */
function analysePobs(pobs) {
  const rows = (pobs ?? [])
    .map((node) => {
      const when = node?.transaction_date || node?.creation || null;
      return {
        id: node?.name ?? "",
        at: when,
        time: toTime(when),
        status: node?.status ?? "",
        value: Number.isFinite(toNumber(node?.grand_total)) ? toNumber(node.grand_total)
          : (node?.items?.length && node.items.every((item) => Number.isFinite(itemValue(item)))
            ? node.items.reduce((total, item) => total + itemValue(item), 0) : NaN),
        estimated: !Number.isFinite(toNumber(node?.grand_total)),
        address: stripHtml(node?.address_display),
        validTill: node?.valid_till,
        customer: node?.customer_name ?? "",
        territory: pick(node, "territory__name", ["territory"]),
        event: pick(node, "custom_event__name", ["custom_event"]),
        items: Array.isArray(node?.items)
          ? node.items
              .map((item) => ({
                label:
                  pick(item, "item_name", ["item_code__name", "item_code", "item"]) || "",
                qty: toNumber(item?.qty),
                amount: itemValue(item),
                rate: toNumber(item?.rate),
                ordered: toNumber(item?.ordered_qty),
              }))
              .filter((item) => item.label)
          : [],
      };
    })
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));

  const unknownValues = rows.filter((r) => !Number.isFinite(r.value)).length;
  const total = rows.length && unknownValues === rows.length ? NaN : rows.reduce((sum, r) => sum + (Number.isFinite(r.value) ? r.value : 0), 0);
  const last = rows.find((r) => r.time != null) ?? null;

  // Products, ranked by the money behind them rather than by line count — one
  // ₹4,000 line matters more to a detailing conversation than four ₹90 ones.
  const byProduct = new Map();
  rows.forEach((row) => {
    row.items.forEach((item) => {
      const entry = byProduct.get(item.label) ?? { label: item.label, amount: 0, qty: 0, lines: 0 };
      entry.amount += Number.isFinite(item.amount) ? item.amount : 0;
      entry.qty += Number.isFinite(item.qty) ? item.qty : 0;
      entry.lines += 1;
      byProduct.set(item.label, entry);
    });
  });
  const products = [...byProduct.values()].sort((a, b) => b.amount - a.amount || b.qty - a.qty);

  // Months are built forward from the earliest POB to the latest so a gap reads
  // as a gap. A doctor with one POB gets one bar, not twelve empty ones.
  const months = [];
  const dated = rows.filter((r) => r.time != null);
  if (dated.length) {
    const first = new Date(dated[dated.length - 1].time);
    const lastDate = new Date(dated[0].time);
    const cursor = new Date(Math.max(new Date(first.getFullYear(), first.getMonth(), 1).getTime(), new Date(lastDate.getFullYear(), lastDate.getMonth() - 11, 1).getTime()));
    const end = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);
    const buckets = new Map();
    dated.forEach((row) => {
      const d = new Date(row.time);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const entry = buckets.get(key) ?? { value: 0, count: 0 };
      entry.value += Number.isFinite(row.value) ? row.value : 0;
      entry.count += 1;
      buckets.set(key, entry);
    });
    // Guard the walk: a corrupt date could otherwise run the loop forever.
    let guard = 0;
    while (cursor <= end && guard < 60) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
      const entry = buckets.get(key) ?? { value: 0, count: 0 };
      months.push({
        key,
        label: MONTHS[cursor.getMonth()],
        year: cursor.getFullYear(),
        value: entry.value,
        count: entry.count,
      });
      cursor.setMonth(cursor.getMonth() + 1);
      guard += 1;
    }
  }
  // Only the tail is charted — an older bar tells a rep nothing they can act on.
  const chart = months.slice(-12);

  return { rows, total, unknownValues, count: rows.length, last, products, months: chart };
}

/* ------------------------------------------------------------------ *
 * Layout mode — measure the component's own box, not the viewport, so *
 * the same instance works full-width, in a column, and on a phone.    *
 * ------------------------------------------------------------------ */

function useContainerMode(mode = "auto", breakpoint = 860) {
  const ref = useRef(null);
  const [width, setWidth] = useState(null);

  useEffect(() => {
    if (mode !== "auto") return undefined;
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    setWidth(el.getBoundingClientRect().width || null);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w != null) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const compact = mode === "mobile" || (mode === "auto" && width != null && width < breakpoint);
  return [ref, compact];
}

// Local icons keep existing action controls consistent with DoctorCard.

const ico = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };

const Icon = {
  Back: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" {...ico}><path d="M15 18l-6-6 6-6" /></svg>
  ),
  Copy: ({ done }) =>
    done ? (
      <svg viewBox="0 0 24 24" width="13" height="13" {...ico} strokeWidth="2.3"><path d="M20 6L9 17l-5-5" /></svg>
    ) : (
      <svg viewBox="0 0 24 24" width="13" height="13" {...ico}>
        <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" />
      </svg>
    ),
  Plus: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" {...ico} strokeWidth="2.3"><path d="M12 5v14M5 12h14" /></svg>
  ),
  Phone: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" {...ico}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  ),
  Chat: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" {...ico}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.6-4.8A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
    </svg>
  ),
  Mail: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" {...ico}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" /><path d="M3 6.5l9 6.2 9-6.2" />
    </svg>
  ),
  Note: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" {...ico}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9L20 9.5v9A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M14 4v6h6M8 14h8M8 17h5" />
    </svg>
  ),
  Pin: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" {...ico}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
};

/* ------------------------------------------------------------------ *
 * Small render pieces (kept local — this component IS the page)       *
 * ------------------------------------------------------------------ */

function Section({ title, count, children, id }) {
  return (
    <section className="dtx-card" id={id}>
      {/* Title, a hairline that takes the slack, then the count — the same
          head the product detail cards use, so the two pages read as one. */}
      <div className="dtx-head">
        <h2>{title}</h2>
        <i className="dtx-rule" aria-hidden="true" />
        {count != null ? <span className="dtx-count">{count}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ headline, body }) {
  return (
    <p className="dtx-empty">
      <b>{headline}</b>
      {body}
    </p>
  );
}

function Loading({ lines = 3 }) {
  return (
    <div className="dtx-pad" style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="dtx-skel" style={{ width: `${100 - i * 16}%` }} />
      ))}
    </div>
  );
}

function Defs({ rows }) {
  const shown = rows.filter((row) => row && row.value);
  if (!shown.length) return null;
  return (
    <dl className="dtx-defs">
      {shown.map((row) => (
        <div className="dtx-def" key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {row.href ? (
              <a href={row.href} target={row.external ? "_blank" : undefined} rel={row.external ? "noreferrer" : undefined}>
                {row.value}
              </a>
            ) : (
              row.value
            )}
            {row.sub ? <small>{row.sub}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const STATUS_TONE = { completed: "won", closed: "won", cancelled: "lost", canceled: "lost", draft: "draft", open: "open", ordered: "won", won: "won", lost: "lost", expired: "lost" };

function StatusPill({ value }) {
  if (!value) return null;
  const tone = STATUS_TONE[String(value).toLowerCase()] ?? "soft";
  return <span className={`dtx-pill dtx-pill--${tone}`}>{value}</span>;
}

/**
 * The month chart.
 *
 * Bars are scaled to the biggest month, and a month with no POB keeps its slot
 * as a flat grey stub — the gap is the finding, so it must be visible.
 */
function MonthChart({ months, currency }) {
  const peak = months.reduce((max, m) => Math.max(max, m.value), 0);
  const busiest = months.reduce((best, m) => (m.value > (best?.value ?? -1) ? m : best), null);
  const active = months.filter((m) => m.count > 0).length;

  return (
    <div className="dtx-pad">
      <div className="dtx-chart">
        {months.map((m, index) => {
          const pct = peak > 0 ? Math.max(3, Math.round((m.value / peak) * 100)) : 3;
          // Every bar in brand red made thirteen loud marks on a page whose
          // whole discipline is spending the accent once. The bars are ink and
          // only the LATEST month carries red — that is the one a rep can still
          // act on, and the peak is already named in the footer below.
          const latest = index === months.length - 1 && m.value > 0;
          return (
            <div
              className="dtx-bar-wrap"
              key={m.key}
              title={`${m.label} ${m.year} — ${fmtMoney(m.value, currency)} across ${m.count} POB${m.count === 1 ? "" : "s"}`}
            >
              {/* Whole rupees only: a bar label sat next to ₹3.1K should not
                  read ₹348.76 — mixed precision makes the axis look unruly. */}
              <span className="dtx-bar-val">{m.value > 0 ? fmtMoneyShort(Math.round(m.value), currency) : ""}</span>
              <div
                className={`dtx-bar ${m.value > 0 ? (latest ? "dtx-bar--latest" : "") : "dtx-bar--empty"}`}
                style={{ height: `${pct}%` }}
              />
              <span className="dtx-bar-label">{m.label}</span>
            </div>
          );
        })}
      </div>
      <div className="dtx-chart-foot">
        <span>
          Best month <b>{busiest && busiest.value > 0 ? `${busiest.label} ${busiest.year} · ${fmtMoneyShort(busiest.value, currency)}` : "—"}</b>
        </span>
        <span>
          Active in <b>{active} of {months.length}</b> months
        </span>
      </div>
    </div>
  );
}

/**
 * The C1 locator.
 *
 * Two letters per axis is a 2x2, so it is drawn as one — a code alone ("HILR")
 * tells a reader nothing, while a marked cell on a labelled grid tells them
 * where this doctor sits at a glance. The axis names come from props because
 * ERP stores only the codes.
 */
function MatrixLocator({ parsed, axisX, axisY, compact }) {
  const size = compact ? 168 : 178;
  const pad = 26;
  const cell = (size - pad) / 2;
  const activeCol = parsed.xHigh ? 1 : 0;
  const activeRow = parsed.yHigh ? 0 : 1; // row 0 is the top = High

  // The cell labels are ERP's OWN letters, read straight out of the code
  // ("HILR" -> I and R), never the first letter of the axis NAME — renaming an
  // axis to "Investment" must relabel the caption, not turn HILR into HALA.
  const letterY = parsed.code.charAt(1);
  const letterX = parsed.code.charAt(3);

  const cells = [
    { row: 0, col: 0, code: `H${letterY}L${letterX}` },
    { row: 0, col: 1, code: `H${letterY}H${letterX}` },
    { row: 1, col: 0, code: `L${letterY}L${letterX}` },
    { row: 1, col: 1, code: `L${letterY}H${letterX}` },
  ];

  return (
    <svg
      className="dtx-matrix-figure"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${parsed.code}: ${parsed.yHigh ? "high" : "low"} ${axisY}, ${parsed.xHigh ? "high" : "low"} ${axisX}`}
    >
      {cells.map((c) => {
        const on = c.row === activeRow && c.col === activeCol;
        return (
          <g key={c.code}>
            <rect
              x={pad + c.col * cell}
              y={c.row * cell}
              width={cell - 2}
              height={cell - 2}
              rx="9"
              fill={on ? "var(--dtx-accent, #d92c24)" : "var(--dtx-line-soft, #f0f2f7)"}
              stroke={on ? "var(--dtx-deep, #6b1712)" : "transparent"}
              strokeWidth="1"
            />
            <text
              x={pad + c.col * cell + (cell - 2) / 2}
              y={c.row * cell + (cell - 2) / 2 + 4}
              textAnchor="middle"
              fontSize="12"
              fontWeight="800"
              letterSpacing=".04em"
              fill={on ? "#fff" : "var(--dtx-mute, #7b879b)"}
            >
              {c.code}
            </text>
          </g>
        );
      })}

      {/* axes — named outside the grid so the cells stay uncluttered */}
      <text
        x="8" y={cell - 6} textAnchor="start"
        fontSize="9" fontWeight="700" letterSpacing=".1em"
        fill="var(--dtx-mute, #7b879b)"
        transform={`rotate(-90 8 ${cell - 6})`}
      >
        {String(axisY ?? "").toUpperCase()} →
      </text>
      <text
        x={pad} y={size - 6} textAnchor="start"
        fontSize="9" fontWeight="700" letterSpacing=".1em"
        fill="var(--dtx-mute, #7b879b)"
      >
        {String(axisX ?? "").toUpperCase()} →
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * The page                                                            *
 * ------------------------------------------------------------------ */

function Pagination({ page, count, size, onChange }) {
  const pages = Math.max(1, Math.ceil(count / size));
  return <div className="dtx-pagination">
    <span>{count ? `${page * size + 1}–${Math.min((page + 1) * size, count)} of ${count}` : "0 results"}</span>
    <div><button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>Previous</button>
      <button type="button" disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}>Next</button></div>
  </div>;
}

function PobPanel({ pob, known, loading, currency, compact, limit }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [allProducts, setAllProducts] = useState(false);
  const filtered = pob.rows.filter((r) => `${r.id} ${r.customer} ${r.items.map((i) => i.label).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 8) - 1));
  const netValues = pob.rows.some((r) => r.estimated);
  if (loading && !known) return <Section title="Quotations"><Loading lines={4} /></Section>;
  if (!known || !pob.count) return <Section title="Quotations"><Empty headline={known ? "Your next opportunity starts here" : "POB history unavailable"} body={known ? "No POBs are linked to this doctor yet. Use Add POB to capture an order opportunity." : "POB history could not be loaded from ERP. Retry above, or check this page’s ERP target."} /></Section>;
  return <div className="dtx-panel-stack">
    {pob.months.length > 2 ? <Section title="POB by month">
      <div className="dtx-pad"><MonthChart months={compact ? pob.months.slice(-6) : pob.months} currency={currency} /></div>
    </Section> : null}
    {pob.products.length ? <Section title="Products prescribed" count={pob.products.length}>
      <div className="dtx-pad"><div className="dtx-rank">
        {(allProducts ? pob.products : pob.products.slice(0, 5)).map((product) => <div className="dtx-rank-row" key={product.label}>
          <div className="dtx-rank-top">
            <span className="dtx-product-name">{product.label}</span>
            <small>{fmtNum(product.qty)} {product.qty === 1 ? "unit" : "units"}</small>
            <b>{fmtMoney(product.amount, currency)}</b>
          </div>
          {/* No bar. In a statement the right-aligned figures ARE the
              comparison — a track under each name was a second, weaker
              encoding of the same thing, it read as a red underline, and at
              these values every bar came out nearly full width. */}
        </div>)}
      </div>
      {pob.products.length > 5 ? <button type="button" className="dtx-more" onClick={() => setAllProducts(!allProducts)}>{allProducts ? "Show fewer" : `Show all ${pob.products.length}`}</button> : null}
      </div>
    </Section> : null}
    <Section title="Quotations" count={pob.count}>
      <div className="dtx-toolbar"><label className="dtx-search"><Search size={15} /><input aria-label="Search POBs" placeholder="Search customer, product or quotation…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></label></div>
      {filtered.slice(currentPage * 8, (currentPage + 1) * 8).map((r, index) => <details className="dtx-quotation" key={r.id || index}>
        <summary><span className="dtx-date-box">{r.time ? `${new Date(r.time).getDate()} ${MONTHS[new Date(r.time).getMonth()]}` : "—"}</span>
          <span className="dtx-quotation-main"><b>{r.customer || "Customer not specified"}</b><small>{r.id} · {fmtDate(r.at) || "Undated"}</small></span>
          <span className="dtx-quotation-right"><span>{fmtMoney(r.value, currency)}</span><StatusPill value={r.status || "Status not supplied"} /></span><ChevronDown size={16} className="dtx-chevron" /></summary>
        <div className="dtx-quotation-detail">
          {r.items.length ? <div className="dtx-scroll"><table className="dtx-table"><caption className="dtx-business-caption">Items in {r.id}</caption><thead><tr><th>Product</th><th className="dtx-num">Qty</th><th className="dtx-num">Rate</th><th className="dtx-num">Value</th></tr></thead><tbody>{r.items.map((item, i) => <tr key={`${item.label}-${i}`}><td>{item.label}{Number.isFinite(item.ordered) ? <div className="dtx-product-sub">{fmtNum(item.ordered)} ordered</div> : null}</td><td className="dtx-num">{fmtNum(item.qty)}</td><td className="dtx-num">{fmtMoney(item.rate, currency)}</td><td className="dtx-num">{fmtMoney(item.amount, currency)}</td></tr>)}</tbody></table></div> : <Empty headline="No item details supplied" />}
          <div className="dtx-quotation-meta">{r.territory ? <span>{r.territory}</span> : null}{r.event ? <span>Visit: {r.event}</span> : null}{r.validTill ? <span>Valid until {fmtDate(r.validTill)}</span> : null}{r.estimated ? <span>Value from item totals</span> : null}{r.address ? <p>{r.address}</p> : null}</div>
        </div>
      </details>)}
      {!filtered.length ? <Empty headline="No matching POBs" body="Try another customer, product or quotation number." /> : null}
      <Pagination page={currentPage} count={filtered.length} size={8} onChange={setPage} />
    </Section>
  </div>;
}

function VisitsPanel({ visits, known, loading, pobs, currency }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const filtered = visits.filter((visit) => {
    const upcoming = visit.time > Date.now() && !/cancel|completed|closed/i.test(visit.status || "");
    const matching = `${visit.subject || ""} ${visit.custom_hq__name || ""} ${pick(visit, "custom_employee_id.employee_name", ["custom_employee_id__name"])}`.toLowerCase().includes(search.toLowerCase());
    return matching && (filter === "all" || (filter === "upcoming" ? upcoming : visit.time != null && visit.time <= Date.now()));
  });
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 10) - 1));
  return <Section title="Visits" count={known ? visits.length : undefined}>
    {loading && !known ? <Loading lines={4} /> : !known || !visits.length ? <Empty headline={known ? "No visits on file" : "Visit history unavailable"} body="Recorded visits and upcoming appointments will appear here." /> : <>
      <div className="dtx-toolbar"><label className="dtx-search"><Search size={15} /><input aria-label="Search visits" placeholder="Search visits or team members…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></label>
        <select className="dtx-select" aria-label="Filter visits" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}><option value="all">All visits</option><option value="past">Past visits</option><option value="upcoming">Upcoming</option></select></div>
      <div className="dtx-notes">{filtered.slice(currentPage * 10, (currentPage + 1) * 10).map((visit, index) => {
        const linked = pobs.filter((pob) => pob.event && pob.event === visit.name);
        const lat = realCoord(visit.custom_latitude), lng = realCoord(visit.custom_longitude);
        const hasLocation = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
        const pobGiven = visit.custom_pob_given === true || visit.custom_pob_given === 1 || /^(yes|true|1)$/i.test(String(visit.custom_pob_given));
        const attendance = readVisitAttendance(visit);
        return <article className="dtx-note" key={visit.name || index}>
          <div className="dtx-note-when">{fmtDate(visit.starts_on) || "Date not recorded"}{visit.time != null ? ` · ${new Date(visit.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
          <div className="dtx-visit-title"><h3>{visit.subject || visit.event_category || "Doctor visit"}</h3><StatusPill value={visit.status} /></div>
          <div className="dtx-visit-meta"><span>{pick(visit, "custom_employee_id.employee_name", ["custom_employee_id__name"]) || "Team member not supplied"}</span>{visit.custom_hq__name ? <span>{visit.custom_hq__name}</span> : null}{visit.event_category ? <span>{visit.event_category}</span> : null}{attendance.made ? <span className="dtx-visit-made">Visited{attendance.at ? ` ${new Date(attendance.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</span> : visit.time != null && visit.time <= Date.now() ? <span className="dtx-visit-unmade">Not marked visited</span> : null}{attendance.forced ? <span className="dtx-visit-forced">Force visit</span> : null}</div>
          {visit.custom_force_visit_reason ? <p className="dtx-note-text">{stripHtml(visit.custom_force_visit_reason)}</p> : null}
          {linked.length || pobGiven ? <div className="dtx-visit-pob"><ClipboardList size={13} />{linked.length ? `${linked.length} linked POB${linked.length === 1 ? "" : "s"} · ${fmtMoney(linked.reduce((sum, row) => sum + (Number.isFinite(row.value) ? row.value : 0), 0), currency)}` : "POB recorded on visit"}</div> : null}
          {hasLocation ? <div><a className="dtx-text-link" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noreferrer">View visit location <ArrowUpRight size={14} /></a></div> : null}
        </article>;
      })}</div>
      {!filtered.length ? <Empty headline="No matching visits" body="Try a different search or visit filter." /> : null}
      <Pagination page={currentPage} count={filtered.length} size={10} onChange={setPage} />
      {visits.length >= 1000 ? <p className="dtx-empty">Showing 1,000 loaded visits. Older activity may not be included.</p> : null}
    </>}
  </Section>;
}

/* ------------------------------------------------------------------ *
 * Settled here rather than exposed as props                           *
 *                                                                     *
 * None of these is a per-page decision, so none of them earned a knob *
 * in Studio: they are house style or company-wide facts, and a page    *
 * wanting a different one would be a page disagreeing with the brand   *
 * or with ERP — a code change, not a checkbox.                         *
 * ------------------------------------------------------------------ */

const CURRENCY = "₹";
const ACCENT = "brand";
const BREAKPOINT = 860;
const ADD_POB_LABEL = "Add POB";
const BACK_LABEL = "All doctors";

/** Far above any real doctor's history; the ledger pages what comes down. */
const POB_LIMIT = 200;

/**
 * Whether a POB raised here writes the doctor into the Quotation's
 * custom_doctorvisit Link.
 *
 * OFF — and this is a migration flag, not a preference. ERP validates
 * DR-xxxxx against the Lead table of whichever instance the write lands on,
 * and a miss fails the whole save. The cost of leaving it off: a POB raised
 * here never shows in the history above, because custom_doctorvisit is
 * exactly what that history joins on. Turn it on here, once, after confirming
 * this endpoint holds the same Leads the doctor list is read from.
 */
const LINK_POB_TO_DOCTOR = false;

/**
 * Names for the two axes of the C1 code (LILR / LIHR / HILR / HIHR).
 *
 * ERP stores only the bare codes in Category List and records no expansion
 * anywhere, and the two plausible readings invert every cell: Investment /
 * Return makes HILR the WORST doctor, Potential / Rx-support makes him the
 * BIGGEST OPPORTUNITY. So the 2x2 locator stays hidden while these are
 * placeholders and the codes show as plain rows instead. Replace both with
 * the real names once the commercial team confirms them, and the locator
 * appears on its own.
 */
const MATRIX_AXIS_Y = "Axis I";
const MATRIX_AXIS_X = "Axis R";

export default function DoctorDetail({
  /** WHO to show — a Lead id ("DR-36661") or the row you already have. */
  doctor,
  /** WHO is acting. Needed by Add POB; there is no reliable way to read the
      signed-in user here, because AuthProvider only runs on the calendar. */
  employee,
  /** Which panels, in what order. Omit for all of them. */
  sections: sectionsProp,
  /** Which ERP to read — a row name in /tokens. Omit for live. */
  erpTarget,
  /** Navigate back. The back pill only appears when this is wired. */
  onBack,
  /** Open your own note composer. The action only appears when this is wired. */
  onAddNote,
  className = "",
  style,
}) {
  // Everything below used to be a prop. Re-bound here under the old names so
  // the rest of the component is untouched — see the constants above each for
  // why it is not a per-page decision.
  const currency = CURRENCY;
  const accent = ACCENT;
  const mode = "auto";
  const breakpoint = BREAKPOINT;
  const pobLimit = POB_LIMIT;
  const addPobLabel = ADD_POB_LABEL;
  const backLabel = BACK_LABEL;
  const linkPobToDoctor = LINK_POB_TO_DOCTOR;
  const matrixAxisY = MATRIX_AXIS_Y;
  const matrixAxisX = MATRIX_AXIS_X;
  const showStats = true;
  // The pill would be a dead control without somewhere to go.
  const showBackButton = !!onBack;
  // Always fetch: supplying the rows by hand was the plumbing this removed.
  const enrich = true;
  const fieldMap = undefined;
  const actionsProp = undefined;
  const pobsProp = undefined;
  const visitsProp = undefined;
  const addressesProp = undefined;
  const erpUrl = undefined;
  const authToken = undefined;
  const onCopyCode = undefined;
  const onPobSaved = undefined;

  const [wrapRef, compact] = useContainerMode(mode, breakpoint);
  const [copied, setCopied] = useState(false);
  const [pobOpen, setPobOpen] = useState(false);

  // One tolerant input: a list can pass currentItem straight through, and a
  // URL-driven page can pass the id as a string. The combined-query envelope
  // is gone with the rest of the plumbing — the component fetches its own.
  const row = useMemo(
    () => (typeof doctor === "string" ? null : normalizeRow(doctor)),
    [doctor]
  );
  const envelope = undefined;
  const [activeView, setActiveView] = useState("business");
  const tabsId = useId();

  // One object instead of six name props. Every entry has a working default,
  // so a normal page never touches this — it exists for a row whose columns
  // are named oddly.
  const fields = useMemo(
    () => ({
      name: "lead_name",
      code: "name",
      speciality: "custom_specialty__name",
      hq: "territory",
      city: "city",
      roles: "custom_role_profile",
      ...(fieldMap && typeof fieldMap === "object" ? fieldMap : {}),
    }),
    [fieldMap]
  );

  const sections = useMemo(
    () => readKeys(sectionsProp, SECTION_KEYS, SECTION_KEYS),
    [sectionsProp]
  );
  const wanted = useMemo(
    () => readKeys(actionsProp, ACTION_KEYS, ACTION_KEYS),
    [actionsProp]
  );

  const boundCode = typeof doctor === "string"
    ? doctor.trim()
    : pick(row, fields.code, ["name", "custom_doctor_code", "value", "code"]);
  const doctorId = boundCode;

  // A page that already holds this doctor's quotations can hand them over and
  // the component skips that fetch entirely; anything else is fetched as usual.
  const pobsGiven = useMemo(() => normalizeConnection(pobsProp ?? envelope?.Quotations), [pobsProp, envelope?.Quotations]);

  const visitsGiven = useMemo(() => normalizeConnection(visitsProp ?? envelope?.Events), [visitsProp, envelope?.Events]);
  const addressesGiven = useMemo(() => normalizeConnection(addressesProp ?? envelope?.Addresses), [addressesProp, envelope?.Addresses]);
  const {
    lead,
    pobs: pobsFetched,
    visits: visitsFetched,
    addresses: addressesFetched,
    loadingVisits, loadingAddresses, errors,
    loadingLead,
    loadingPobs,
    refresh,
  } = useDoctorEnrichment(doctorId, {
    enabled: !!enrich,
    pobLimit,
    pobsGiven, visitsGiven, addressesGiven,
    erpUrl,
    authToken,
    erpTarget,
  });

  const pobs = pobsGiven ?? pobsFetched;
  const addresses = addressesGiven ?? addressesFetched;
  const visits = visitsGiven ?? visitsFetched;
  const visitRows = useMemo(() => (visits ?? []).map((v) => ({ ...v, time: toTime(v.starts_on) }))
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0)), [visits]);
  const lastVisit = visitRows.find((v) => v.time != null && v.time <= Date.now() && !/cancel/i.test(v.status || ""));
  const nextVisit = [...visitRows].reverse().find((v) => v.time > Date.now() && !/cancel|closed|completed/i.test(v.status || ""));

  /* --- identity ------------------------------------------------- */

  const code = pick(lead, "name", ["custom_doctor_code"]) || doctorId || boundCode;
  const name =
    pickBoth(lead, row, fields.name, ["lead_name", "title", "first_name", "doctor_name", "label", "name"]) ||
    code;
  const speciality = pickBoth(lead, row, fields.speciality, [
    "custom_specialty__name",
    "custom_specialty",
    "custom_speciality",
    "speciality",
  ]);
  const qualification = pickBoth(lead, row, "custom_qualification__name", ["custom_qualification"]);
  const grade = pickBoth(lead, row, "custom_category__name", ["custom_category"]);
  const status = pickBoth(lead, row, "status", []);
  const hq = pickBoth(lead, row, fields.hq, ["territory", "territory__name", "custom_hq__name", "hq"]);
  const city = pickBoth(lead, row, fields.city, ["city"]);
  const state = pickBoth(lead, row, "state", []);
  const country = pickBoth(lead, row, "country__name", ["country"]);
  const company = pickBoth(lead, row, "company__name", ["company"]);

  const tone = useMemo(() => resolveAccent(accent, speciality || name), [accent, speciality, name]);

  const mobile = realPhone(pickBoth(lead, row, "mobile_no", ["mobile"]));
  const whatsapp = realPhone(pickBoth(lead, row, "whatsapp_no", []));
  const landline = realPhone(pickBoth(lead, row, "phone", [])) || (addresses ?? []).map((a) => realPhone(a.phone)).find(Boolean) || "";
  const email = realEmail(pickBoth(lead, row, "email_id", ["email"])) || (addresses ?? []).map((a) => realEmail(a.email_id)).find(Boolean) || "";

  const lat = realCoord(pickBoth(lead, row, "custom_latitude", []));
  const lng = realCoord(pickBoth(lead, row, "custom_longitude", []));
  const hasGeo = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const mapsQuery = hasGeo ? `${lat},${lng}` : addresses?.length ? addressText(addresses[0]) : "";
  const mapsHref = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : "";

  // Coverage and notes come from whichever side actually holds the child table:
  // the list row carries role profiles, the enriched Lead carries both.
  const roleRows = useMemo(() => {
    return Array.isArray(lead?.custom_role_profile) ? readRoleRows(lead, "custom_role_profile") : readRoleRows(row, fields.roles);
  }, [lead, row, fields.roles]);

  const notes = useMemo(() => {
    return Array.isArray(lead?.notes) ? readNotes(lead) : readNotes(row);
  }, [lead, row]);

  const divisions = useMemo(
    () => [...new Set(roleRows.map((r) => r.department).filter(Boolean))],
    [roleRows]
  );

  /* --- business ------------------------------------------------- */

  const pob = useMemo(() => analysePobs(pobs), [pobs]);
  const pobKnown = Array.isArray(pobs);

  /* --- classification ------------------------------------------- */

  const cat1 = pickBoth(lead, row, "custom_category1__name", ["custom_category1"]);
  const cat2 = pickBoth(lead, row, "custom_category2__name", ["custom_category2"]);
  const cat3 = pickBoth(lead, row, "custom_category3__name", ["custom_category3"]);
  const matrix = useMemo(() => parseMatrixCode(cat1), [cat1]);

  /* --- actions -------------------------------------------------- */

  const copyCode = useCallback(async () => {
    if (!code) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        // Older in-app webviews: the deprecated path is the only one available.
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
      onCopyCode?.({ code, doctor: lead ?? row });
    } catch {
      // Clipboard blocked (no permission / insecure origin) — leave it be.
    }
  }, [code, onCopyCode, lead, row]);

  const accentVars = {
    "--dtx-accent": tone.accent,
    // The accent as TEXT is the darker step: the bright brand red clears 4.3:1
    // on white, which is fine behind a bar or a filled button and short of
    // comfortable for small type.
    "--dtx-ink-accent": tone.ink,
    "--dtx-soft": tone.soft,
    "--dtx-line-accent": tone.line,
    "--dtx-deep": tone.deep,
    "--dtx-deep-2": tone.deep2,
    ...(style ?? {}),
  };

  const enriching = enrich && (loadingLead || loadingPobs || loadingVisits || loadingAddresses);

  /* --- stat tiles ----------------------------------------------- */

  // Vitals are the counts a reader scans, kept small and ruled. A count of
  // nothing still shows — "0 visits" is information — but it is not given the
  // same weight as the balance.
  const stats = [
    { label: "Visits", value: Array.isArray(visits) ? fmtNum(visitRows.length) : "—",
      sub: lastVisit ? `Last ${fmtDate(lastVisit.starts_on)}` : nextVisit ? `Next ${fmtDate(nextVisit.starts_on)}` : Array.isArray(visits) ? "None recorded" : "Unavailable" },
    { label: "Notes", value: fmtNum(notes.length),
      sub: notes.length ? relTime(notes[0].at) : "None written" },
    { label: "Divisions", value: divisions.length ? fmtNum(divisions.length) : loadingLead ? "—" : "0",
      sub: roleRows.length ? `${roleRows.length} beat${roleRows.length === 1 ? "" : "s"}` : "None mapped" },
    { label: "Products", value: pobKnown ? fmtNum(pob.products.length) : "—",
      sub: pobKnown ? (pob.unknownValues ? `${pob.unknownValues} POB without a value` : pob.products.length ? "Prescribed" : "None yet") : loadingPobs ? "Loading" : "Unavailable" },
  ];

  // The signature: the figure this page exists for, set in the divided strip
  // the product detail page uses for its price row. Each part owns a cell, so
  // the trend and the last-POB date keep their own baselines — as one flex row
  // they were aligned to a number 56px away and came apart at every width
  // between phone and desktop.
  const sparkMonths = (pob.months || []).length > 2 ? pob.months.slice(-8) : [];
  const sparkPeak = sparkMonths.reduce((max, month) => Math.max(max, month.value || 0), 0);
  const balance = (
    <div className="dtx-balance">
      <div className="dtx-balance-figure">
        <div className="dtx-label">Recorded POB</div>
        <div className="dtx-balance-value">{pobKnown ? fmtMoney(pob.total, currency) : "—"}</div>
        <div className="dtx-balance-sub">
          {pobKnown
            ? pob.count
              ? `Across ${pob.count} quotation${pob.count === 1 ? "" : "s"}${pob.unknownValues ? " · some values missing" : ""}`
              : "Nothing raised against this doctor yet"
            : loadingPobs ? "Loading from ERP…" : "History unavailable"}
        </div>
      </div>
      {sparkMonths.length > 1 ? (
        <div className="dtx-balance-cell">
          <div className="dtx-label">Trend</div>
          <div className="dtx-spark" role="img" aria-label={`POB by month, ${sparkMonths.length} months to ${sparkMonths[sparkMonths.length - 1].label}`}>
            {sparkMonths.map((month, index) => (
              <div
                key={month.key}
                className={`dtx-spark-bar ${month.value > 0 ? (index === sparkMonths.length - 1 ? "dtx-spark-bar--last" : "dtx-spark-bar--on") : ""}`}
                style={{ height: `${sparkPeak > 0 ? Math.max(4, Math.round((month.value / sparkPeak) * 100)) : 4}%` }}
                title={`${month.label} ${month.year} · ${fmtMoney(month.value, currency)}`}
              />
            ))}
          </div>
          <div className="dtx-balance-sub dtx-spark-cap">Last {sparkMonths.length} months</div>
        </div>
      ) : null}
      {pob.last?.at ? (
        <div className="dtx-balance-cell">
          <div className="dtx-label">Last POB</div>
          <div className="dtx-balance-cell-value">{fmtDate(pob.last.at)}</div>
          <div className="dtx-balance-sub">{relTime(pob.last.at)}</div>
        </div>
      ) : null}
    </div>
  );

  /* --- actions -------------------------------------------------- */

  const actions = useMemo(() => {
    const phone = String(mobile || landline || "").replace(/\s/g, "");
    const wa = String(whatsapp || mobile || "").replace(/[^0-9]/g, "");
    const spec = {
      pob: {
        key: "pob",
        label: addPobLabel,
        icon: <Icon.Plus />,
        primary: true,
        onClick: () => setPobOpen(true),
      },
      // Only offered when the page has actually wired it — a button that does
      // nothing is worse than no button.
      note: onAddNote
        ? {
            key: "note",
            label: "Add a note",
            icon: <Icon.Note />,
            onClick: () => onAddNote({ doctor: lead ?? row, code, name }),
          }
        : null,
      call: {
        key: "call",
        label: "Call",
        icon: <Icon.Phone />,
        href: phone ? `tel:${phone}` : "",
        why: phone ? "" : "ERP holds no mobile number for this doctor",
      },
      whatsapp: {
        key: "whatsapp",
        label: "WhatsApp",
        icon: <Icon.Chat />,
        href: wa ? `https://wa.me/${wa}` : "",
        external: true,
        why: wa ? "" : "ERP holds no mobile or WhatsApp number for this doctor",
      },
      email: {
        key: "email",
        label: "Email",
        icon: <Icon.Mail />,
        href: email ? `mailto:${email}` : "",
        why: email ? "" : "ERP holds no e-mail address for this doctor",
      },
      directions: {
        key: "directions",
        label: "Directions",
        icon: <Icon.Pin />,
        href: mapsHref,
        external: true,
        why: hasGeo ? "" : "This doctor's coordinates were never captured",
      },
    };
    return wanted.map((key) => spec[key]).filter((action) => action && (action.href || action.onClick));
  }, [
    wanted,
    addPobLabel,
    onAddNote,
    lead,
    row,
    code,
    name,
    mobile,
    landline,
    whatsapp,
    email,
    hasGeo,
    mapsHref,
  ]);

  /* --- masthead ------------------------------------------------- */

  const masthead = (
    <header className="dtx-mast">
      {showBackButton ? (
        <button type="button" className="dtx-back" onClick={() => onBack?.({ doctor: lead ?? row, code })}>
          <Icon.Back />
          {backLabel}
        </button>
      ) : null}

      <div className="dtx-identity">
        <div className="dtx-mono">{initialsOf(name)}</div>

        <div className="dtx-idbody">
          <div className="dtx-eyebrow">
            <span>Doctor profile</span>
            {hq ? (
              <>
                <i className="dtx-dot" />
                <span>{hq}</span>
              </>
            ) : null}
            {city && city.toLowerCase() !== String(hq).toLowerCase() ? (
              <>
                <i className="dtx-dot" />
                <span>{city}</span>
              </>
            ) : null}
          </div>

          <h1 className="dtx-name">{name || "Unnamed doctor"}</h1>

          <div className="dtx-sub">
            {speciality ? <span className="dtx-spec">{speciality}</span> : null}
            {qualification ? <span>{qualification}</span> : null}
            {code ? (
              <button
                type="button"
                className={`dtx-codebtn ${copied ? "dtx-codebtn--done" : ""}`}
                onClick={copyCode}
                title={copied ? "Copied" : "Copy doctor code"}
                aria-label={copied ? "Doctor code copied" : `Copy doctor code ${code}`}
              >
                <Icon.Copy done={copied} />
                {code}
              </button>
            ) : null}
            {status ? <StatusPill value={status} /> : null}
          </div>
        </div>

        {grade ? (
          <div className="dtx-grade">
            <div className="dtx-grade-label">Grade</div>
            <div className="dtx-grade-value">{grade}</div>
          </div>
        ) : null}
      </div>

      {actions.length > 0 ? (
        <div className="dtx-actions">
          {actions.map((action) =>
            action.href ? (
              <a
                key={action.key}
                className="dtx-act"
                href={action.href}
                target={action.external ? "_blank" : undefined}
                rel={action.external ? "noreferrer" : undefined}
              >
                {action.icon}
                {action.label}
              </a>
            ) : action.onClick ? (
              <button
                key={action.key}
                type="button"
                className={`dtx-act ${action.primary ? "dtx-act--primary" : ""}`}
                onClick={action.onClick}
              >
                {action.icon}
                {action.label}
              </button>
            ) : (
              <span
                key={action.key}
                className="dtx-act dtx-act--off"
                title={action.why}
                aria-disabled="true"
              >
                {action.icon}
                {action.label}
              </span>
            )
          )}
        </div>
      ) : null}
    </header>
  );

  /* --- sections ------------------------------------------------- */

  const businessSection = <PobPanel key={code} pob={pob} known={pobKnown} loading={loadingPobs} currency={currency} compact={compact} limit={pobLimit} />;
  const visitsSection = <VisitsPanel key={code} visits={visitRows} known={Array.isArray(visits)} loading={loadingVisits} pobs={pob.rows} currency={currency} />;

  const notesSection = (
    <Section key="notes" title="Notes" count={notes.length}>
      {!notes.length && loadingLead ? (
        <Loading lines={3} />
      ) : !notes.length ? (
        <Empty
          headline={errors.lead ? "Notes could not be loaded" : "No notes yet"}
          body="Observations and follow-ups recorded for this doctor appear here."
        />
      ) : (
        <div className="dtx-notes">
          {notes.map((note) => (
            <article className="dtx-note" key={note.id}>
              <div className="dtx-note-when">
                {fmtDate(note.at) || `Note ${note.idx}`}
                {note.author ? ` · ${note.author}` : ""}
              </div>
              <p className="dtx-note-text">{note.text}</p>
            </article>
          ))}
        </div>
      )}
    </Section>
  );

  const coverageSection = (
    <Section key="coverage" title="Coverage" count={roleRows.length}>
      {!roleRows.length && loadingLead ? <Loading lines={3} /> : !roleRows.length ?
        <Empty headline="No team assigned" body="Division and territory assignments will appear here." /> :
        <div className="dtx-coverage">{roleRows.map((r) => (
          <article className="dtx-team" key={`${r.department}|${r.hq}|${r.beat}`}>
            <h3>{r.department || "Division not specified"}</h3>
            <p>{r.hq || "HQ not specified"}</p>
            {r.employee ? <div className="dtx-assignee"><span className="dtx-avatar-small">{initialsOf(r.employee)}</span>{r.employee}</div> : null}
            {r.beat ? <small className="dtx-beat">{r.beat}</small> : null}
          </article>
        ))}</div>}
    </Section>
  );
  const classificationRows = [
    { label: "Grade", value: grade },
    { label: "Category 1", value: cat1 },
    { label: "Category 2", value: cat2 },
    { label: "Category 3", value: cat3 },
  ].filter((r) => r.value);

  const classificationSection =
    classificationRows.length || loadingLead ? (
      <Section key="classification" title="Classification">
        {!classificationRows.length && loadingLead ? (
          <Loading lines={2} />
        ) : (
          <>
            {matrix && matrixAxisY !== "Axis I" && matrixAxisX !== "Axis R" ? (
              <div className="dtx-pad">
                <div className={`dtx-matrix ${compact ? "dtx-matrix--compact" : ""}`}>
                  <MatrixLocator parsed={matrix} axisX={matrixAxisX} axisY={matrixAxisY} compact={compact} />
                  <div className="dtx-matrix-legend">
                    <span className="dtx-pill dtx-pill--accent" style={{ justifySelf: "start" }}>
                      {matrix.code}
                    </span>
                    <p className="dtx-matrix-note">
                      <b>
                        {matrix.yHigh ? "High" : "Low"} {String(matrixAxisY).toLowerCase()}
                      </b>
                      {" · "}
                      <b>
                        {matrix.xHigh ? "high" : "low"} {String(matrixAxisX).toLowerCase()}
                      </b>
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <Defs rows={classificationRows} />
          </>
        )}
      </Section>
    ) : null;

  const contactRows = [
    { label: "Mobile", value: mobile, href: mobile ? `tel:${mobile.replace(/\s/g, "")}` : "" },
    { label: "WhatsApp", value: whatsapp && whatsapp !== mobile ? whatsapp : "" },
    { label: "Landline", value: landline && landline !== mobile ? landline : "" },
    { label: "E-mail", value: email, href: email ? `mailto:${email}` : "" },
    {
      label: "Place",
      value: [city, state].filter(Boolean).join(", "),
      sub: country || "",
    },
    {
      label: "Coordinates",
      value: hasGeo ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "",
      href: mapsHref,
      external: true,
    },
  ];

  const contactSection = (
    <Section key="contact" title="Contact">
      {addresses?.length ? <div className="dtx-addresses">{addresses.map((a, index) => <article className="dtx-address" key={a.name || index}>
        <div className="dtx-address-title"><MapPin size={17} /><b>{a.address_title || a.address_type || "Practice address"}</b>{a.address_type ? <span className="dtx-pill dtx-pill--soft">{a.address_type}</span> : null}</div>
        <p>{addressText(a)}</p>
        <a className="dtx-text-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText(a))}`} target="_blank" rel="noreferrer">Get directions <ArrowUpRight size={14} /></a>
      </article>)}</div> : loadingAddresses ? <Loading lines={2} /> : null}
      {!mobile && !landline && !email && !loadingLead && !loadingAddresses ? <p className="dtx-contact-missing">No phone number or email on file.</p> : null}
      {contactRows.some((r) => r.value) ? (
        <Defs rows={contactRows} />
      ) : loadingLead ? (
        <Loading lines={3} />
      ) : (
        <Empty
          headline="No reachable contact detail"
          body="Add a phone number or email to make it easier to connect."
        />
      )}
    </Section>
  );

  const recordSection = (
    <Section key="record" title="Record">
      <Defs
        rows={[
          { label: "Lead ID", value: code },
          { label: "Doctor code", value: pickBoth(lead, row, "custom_doctor_code", []) },
          { label: "Company", value: company },
          { label: "Territory", value: hq },
          {
            label: "Created",
            value: fmtDate(pickBoth(lead, row, "creation", [])),
            sub: relTime(pickBoth(lead, row, "creation", [])),
          },
          {
            label: "Last changed",
            value: fmtDate(pickBoth(lead, row, "modified", [])),
            sub: relTime(pickBoth(lead, row, "modified", [])),
          },
        ]}
      />
    </Section>
  );

  // Render in the order the caller listed. On a desktop layout the wide
  // sections take the big column and the rest the narrow one, each keeping its
  // listed order; on a narrow container they are one stream.
  const byKey = {
    business: businessSection,
    visits: visitsSection,
    coverage: coverageSection,
    classification: classificationSection,
    notes: notesSection,
    contact: contactSection,
    record: recordSection,
  };
  const chosen = sections.map((key) => [key, byKey[key]]).filter(([, node]) => node);
  const wideCol = chosen.filter(([key]) => WIDE_SECTIONS.has(key));
  const narrowCol = chosen.filter(([key]) => !WIDE_SECTIONS.has(key));

  const selectedView = wideCol.some(([key]) => key === activeView) ? activeView : wideCol[0]?.[0];
  const tabLabels = { business: "POB overview", visits: "Visit history", notes: "Notes" };
  const tabCounts = { business: pobKnown ? pob.count : null, visits: Array.isArray(visits) ? visits.length : null, notes: notes.length };
  const failed = Object.entries(errors).filter(([, value]) => value).map(([key]) => ({ lead: "profile", pobs: "POBs", visits: "visits", addresses: "addresses" }[key]));

  return (
    <>
      <div ref={wrapRef} className={`dtx-root ${compact ? "dtx-root--compact" : ""} ${className}`} style={accentVars}>
        <style>{doctorDetailStyles}</style>
        {/* Everything scrollable lives in one port so the component behaves
            like any other block in a Plasmic stack: left at auto height it
            grows and the PAGE scrolls, given a height it scrolls itself. */}
        <div className="dtx-scrollport">
        {/* Identity and the POB strip are one white card; everything below
            sits on the light ground as separate cards. */}
        <div className="dtx-hero">
          {masthead}
          {showStats ? balance : null}
        </div>
        <div className="dtx-body">
          {showStats ? <div className="dtx-stats">
            {stats.map((stat) => <div className="dtx-stat" key={stat.label}>
              <span className="dtx-stat-label">{stat.label}</span>
              <div className="dtx-stat-value">{stat.value}</div><div className="dtx-stat-sub">{stat.sub}</div>
            </div>)}
          </div> : null}
          {failed.length ? <div className="dtx-warn" role="status"><span>Couldn’t load {failed.join(", ")}. Available details are still shown.</span><button type="button" onClick={refresh}>Retry</button></div> : null}
          {chosen.length ? <div className={`dtx-grid ${compact ? "dtx-grid--compact" : ""}`} style={!wideCol.length || !narrowCol.length ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined}>
            {wideCol.length ? <div className="dtx-col">
              <div className="dtx-tabs" role="tablist" aria-label="Doctor activity">
                {wideCol.map(([key], index) => <button key={key} type="button" role="tab" id={`${tabsId}-${key}`} aria-controls={`${tabsId}-panel-${key}`} aria-selected={selectedView === key} tabIndex={selectedView === key ? 0 : -1}
                  onClick={() => setActiveView(key)} onKeyDown={(event) => {
                    let next;
                    if (event.key === "ArrowRight") next = (index + 1) % wideCol.length;
                    if (event.key === "ArrowLeft") next = (index + wideCol.length - 1) % wideCol.length;
                    if (event.key === "Home") next = 0;
                    if (event.key === "End") next = wideCol.length - 1;
                    if (next != null) { event.preventDefault(); setActiveView(wideCol[next][0]); event.currentTarget.parentElement.children[next].focus(); }
                  }}>{tabLabels[key]}{tabCounts[key] != null ? <span>{tabCounts[key]}</span> : null}</button>)}
              </div>
              {wideCol.map(([key, node]) => <div key={key} role="tabpanel" id={`${tabsId}-panel-${key}`} aria-labelledby={`${tabsId}-${key}`} tabIndex={0} hidden={selectedView !== key}>{node}</div>)}
            </div> : null}
            {narrowCol.length ? <aside className="dtx-col dtx-sidebar" aria-label="Doctor information">{narrowCol.map(([, node]) => node)}</aside> : null}
          </div> : null}
          <div className="dtx-foot"><span>Doctor record <b>{code || "—"}</b></span>{enriching ? <span role="status">Updating details…</span> : null}</div>
        </div>
        </div>
      </div>

      {pobOpen ? (
        <DoctorPobDialog
          open={pobOpen}
          onOpenChange={setPobOpen}
          doctorId={code}
          doctorName={name}
          doctorHq={hq}
          doctorRoles={roleRows}
          linkDoctor={linkPobToDoctor}
          employee={employee}
          erpUrl={erpUrl}
          authToken={authToken}
          erpTarget={erpTarget}
          onSaved={(payload) => {
            // The POB just written is part of this doctor's history — refetch so
            // the ledger and the stat tiles agree with ERP straight away.
            refresh();
            onPobSaved?.(payload);
          }}
        />
      ) : null}
    </>
  );
}
