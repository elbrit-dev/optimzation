"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import { graphqlRequest } from "@calendar/lib/graphql-client";
import { getEndpointConfigFromUrlKeyAsync } from "@/app/graphql-playground/constants";

// The POB popup drags in the calendar's form kit, its ERP services and the item
// master. The detail page renders fine without any of it, so it loads the first
// time somebody presses Add POB.
const DoctorPobDialog = dynamic(() => import("./DoctorPobDialog"), { ssr: false });

/**
 * DoctorDetail — the WHOLE doctor detail page as ONE code component.
 *
 * Deliberately not the product-detail shape. There, ten registered components
 * (ProductHero, DosageCard, MechanismCard …) are assembled in Studio, and every
 * page that wants the product detail has to rebuild that stack. Here the page
 * IS the component: drop it, bind the doctor row, done. Sections are switched
 * with booleans instead of being separate components, so a page can never end
 * up half-assembled and there is no ordering to get wrong.
 *
 * WHAT IT RENDERS, top to bottom
 *   1. Masthead      — monogram, salutation + name, speciality, qualification,
 *                      doctor code (copyable), status, HQ · city, grade badge,
 *                      and the action row (Add POB, call, WhatsApp, mail,
 *                      directions, open in ERP).
 *   2. Stat strip    — POB value, POB count + last POB, divisions covering,
 *                      notes on file. Lifted so it straddles the masthead edge.
 *   3. Business      — POB history: a month-by-month value chart, the products
 *                      this doctor's POBs actually carry (ranked), and the
 *                      quotation ledger itself.
 *   4. Coverage      — the (division, HQ, beat code) rows from the doctor's own
 *                      custom_role_profile child table, as real pairings.
 *   5. Classification— grade + the C1 investment/return locator, C2, C3.
 *   6. Notes         — the CRM Note child table as a timeline, HTML stripped.
 *   7. Contact       — phones/e-mail (ERP's "0" placeholders suppressed),
 *                      city/state/country, coordinates + directions.
 *   8. Record        — id, company, owner-side timestamps.
 *
 * DATA — two ways in, and they compose
 *   `data`   ONE doctor row, in whatever shape the page already holds: the row
 *            itself, a GraphQL edge ({ node }), or a single-row connection. A
 *            list row is enough to paint the masthead immediately.
 *   `enrich` The list query carries none of the qualification, phones, notes or
 *            POB history a detail page is for. With enrich on (the default) the
 *            component fetches the full Lead by name plus the doctor's POB
 *            Quotations, through the same ERP endpoint resolution the POB popup
 *            uses. Every fetch is additive: the bound row still wins for fields
 *            it holds, and a failed fetch leaves the page rendering the row
 *            rather than showing an error.
 *
 * Both ERP reads use a retry ladder rather than one query. frappe_graphql fails
 * the WHOLE request for a single unknown field, and Link fields differ between
 * instances in whether they expose `x__name` or a nested `x { name }` — so a
 * rich shape is tried first and a lean shape is the fallback. A section with no
 * data says so in words; nothing spins forever.
 *
 * The accent colour is derived from the speciality, the same way DoctorCard
 * derives its chip colour, so opening a card feels like the same object
 * expanding rather than arriving at an unrelated screen.
 */

/* ------------------------------------------------------------------ *
 * Row reading — identical rules to DoctorCard, so a row that renders  *
 * as a card renders here without re-mapping any field.                *
 * ------------------------------------------------------------------ */

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
    out.push({ department, hq: hq || null, beat: beat || null });
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
        at: entry?.creation ?? entry?.modified ?? null,
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

const SECTION_KEYS = ["business", "coverage", "classification", "notes", "contact", "record"];
const ACTION_KEYS = ["pob", "note", "call", "whatsapp", "email", "directions"];

/**
 * Sections that want the wider column on a desktop layout. Everything else
 * goes in the narrow column, each in the order the caller listed it.
 */
const WIDE_SECTIONS = new Set(["business", "notes"]);

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
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.\-]/g, ""));
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
const LEAD_QUERIES = [
  `
query DoctorDetail($name: String!) {
  Lead(name: $name) {
    name
    salutation
    first_name
    middle_name
    last_name
    lead_name
    title
    status
    custom_doctor_code
    custom_specialty__name
    custom_speciality
    custom_qualification__name
    custom_category__name
    custom_category1__name
    custom_category2__name
    custom_category3__name
    mobile_no
    whatsapp_no
    phone
    email_id
    city
    state
    country__name
    territory__name
    company__name
    custom_latitude
    custom_longitude
    custom_address_created
    creation
    modified
    notes { name note creation modified idx }
    custom_role_profile { role_profile_list__name department__name hq__name }
  }
}
`,
  `
query DoctorDetail($name: String!) {
  Lead(name: $name) {
    name
    salutation
    first_name
    lead_name
    status
    custom_doctor_code
    custom_specialty__name
    custom_speciality
    custom_qualification
    custom_category
    custom_category1
    custom_category2
    custom_category3
    mobile_no
    whatsapp_no
    phone
    email_id
    city
    state
    country
    territory
    company
    custom_latitude
    custom_longitude
    creation
    modified
    notes { name note creation idx }
    custom_role_profile { role_profile_list department hq }
  }
}
`,
  `
query DoctorDetail($name: String!) {
  Lead(name: $name) {
    name
    lead_name
    first_name
    city
    email_id
    custom_specialty__name
    custom_speciality
    custom_category__name
    custom_category1__name
    custom_category2__name
    custom_category3__name
    custom_latitude
    custom_longitude
    territory__name
    notes { name note creation idx }
    custom_role_profile { role_profile_list__name department__name hq__name }
  }
}
`,
];

/**
 * The doctor's POB history.
 *
 * A POB is written as a plain Quotation carrying the doctor in
 * `custom_doctorvisit` (Link -> Lead), so that field is the whole join. Rich
 * shape first (items, customer, territory, the visit it came from), then a lean
 * shape that gives up the line items but keeps the ledger — a Quotation Item
 * field name differing between instances must not cost the section entirely.
 */
const POB_QUERIES = [
  `
query DoctorPobs($first: Int!, $filters: [DBFilterInput!]) {
  Quotations(first: $first, filter: $filters) {
    edges {
      node {
        name
        transaction_date
        creation
        status
        grand_total
        customer_name
        territory__name
        custom_event__name
        items { item_name qty rate amount }
      }
    }
  }
}
`,
  `
query DoctorPobs($first: Int!, $filters: [DBFilterInput!]) {
  Quotations(first: $first, filter: $filters) {
    edges {
      node {
        name
        transaction_date
        creation
        status
        grand_total
        customer_name
      }
    }
  }
}
`,
];

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
function useDoctorEnrichment(doctorId, { enabled, pobLimit, pobsGiven, erpUrl, authToken, erpTarget }) {
  const [lead, setLead] = useState(null);
  const [pobs, setPobs] = useState(null);
  const [loadingLead, setLoadingLead] = useState(false);
  const [loadingPobs, setLoadingPobs] = useState(false);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || !doctorId) {
      setLead(null);
      setPobs(null);
      setError(null);
      return undefined;
    }

    // A doctor switched mid-flight must not have the previous doctor's reply
    // land on top of it.
    let live = true;
    const fetchPobs = !Array.isArray(pobsGiven);
    setLoadingLead(true);
    setLoadingPobs(fetchPobs);
    setError(null);
    setLead(null);
    setPobs(null);

    (async () => {
      try {
        await ensureErpAuth({ erpUrl, authToken, erpTarget });
      } catch (authError) {
        if (!live) return;
        setError(authError?.message || "Couldn't reach ERP");
        setLoadingLead(false);
        setLoadingPobs(false);
        return;
      }

      if (!fetchPobs) setLoadingPobs(false);

      firstSuccessful(LEAD_QUERIES, { name: doctorId }, (d) => d?.Lead ?? null)
        .then((value) => {
          if (live) setLead(value);
        })
        .catch((leadError) => {
          if (!live) return;
          console.warn("DoctorDetail: couldn't load the full Lead", leadError);
          setError((prev) => prev || leadError?.message || "Couldn't load this doctor from ERP");
        })
        .finally(() => {
          if (live) setLoadingLead(false);
        });

      if (!fetchPobs) return;

      firstSuccessful(
        POB_QUERIES,
        {
          first: Math.max(1, Number(pobLimit) || 200),
          filters: [
            { fieldname: "custom_doctorvisit", operator: "EQ", value: doctorId },
          ],
        },
        (d) => d?.Quotations?.edges ?? null
      )
        .then((edges) => {
          if (live) setPobs((edges ?? []).map((edge) => edge?.node).filter(Boolean));
        })
        .catch((pobError) => {
          if (!live) return;
          console.warn("DoctorDetail: couldn't load POB history", pobError);
          setPobs([]);
        })
        .finally(() => {
          if (live) setLoadingPobs(false);
        });
    })();

    return () => {
      live = false;
    };
  }, [enabled, doctorId, pobLimit, pobsGiven, erpUrl, authToken, erpTarget, nonce]);

  return { lead, pobs, loadingLead, loadingPobs, error, refresh };
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
        value: toNumber(node?.grand_total),
        customer: node?.customer_name ?? "",
        territory: pick(node, "territory__name", ["territory"]),
        event: pick(node, "custom_event__name", ["custom_event"]),
        items: Array.isArray(node?.items)
          ? node.items
              .map((item) => ({
                label:
                  pick(item, "item_name", ["item_code__name", "item_code", "item"]) || "",
                qty: toNumber(item?.qty),
                amount: toNumber(item?.amount),
              }))
              .filter((item) => item.label)
          : [],
      };
    })
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));

  const total = rows.reduce((sum, r) => sum + (Number.isFinite(r.value) ? r.value : 0), 0);
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
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
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

  return { rows, total, count: rows.length, last, products, months: chart };
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

/* ------------------------------------------------------------------ *
 * Styles                                                             *
 *                                                                     *
 * Injected once and prefixed, the way the product-detail family does  *
 * it, rather than Tailwind utilities: this page has to look the same  *
 * inside the Studio canvas, which does not load the app's stylesheet, *
 * and the masthead/chart/locator want gradients and grid templates    *
 * that would be a wall of arbitrary-value classes.                    *
 * ------------------------------------------------------------------ */

const STYLE_ID = "elbrit-doctor-detail-styles";

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    /* Neutrals are warm / red-biased so they belong to the Elbrit red rather
       than sitting next to it as a borrowed cool grey. --dtx-deep and its
       lighter step are set per instance from the resolved accent. */
    .dtx-root {
      box-sizing: border-box; width: 100%; max-width: 100%;
      font-family: var(--dtx-font, system-ui, -apple-system, "Segoe UI", sans-serif);
      color: #211311; background: #f6f2f1;
      --dtx-ink: #211311;
      --dtx-ink-2: #4a3532;
      --dtx-mute: #9c8a86;
      --dtx-slate: #6b5b58;
      --dtx-line: #e6dcda;
      --dtx-line-soft: #f0e8e6;
      --dtx-card: #ffffff;
      --dtx-card-2: #fbf7f6;
      /* Status tones deliberately avoid red: red IS the brand here, so a red
         "Lost" pill beside a red Add POB button reads as one system shouting.
         Each pill also carries a mark and a word, so state never rests on
         colour alone. */
      --dtx-good: #17724a;
      --dtx-good-soft: #e4f2ea;
      --dtx-good-line: #bedecc;
      --dtx-warn: #8f5a0c;
      --dtx-warn-soft: #fbf2e6;
      --dtx-warn-line: #ebd9bb;
      --dtx-void: #5a4a47;
      --dtx-void-soft: #f0eae9;
      --dtx-void-line: #ddd1cf;
      -webkit-font-smoothing: antialiased;
    }
    .dtx-root *, .dtx-root *::before, .dtx-root *::after { box-sizing: border-box; }
    .dtx-root h1, .dtx-root h2, .dtx-root h3, .dtx-root p, .dtx-root dl,
    .dtx-root dd, .dtx-root dt, .dtx-root ul, .dtx-root li, .dtx-root figure {
      margin: 0; padding: 0;
    }
    .dtx-root ul { list-style: none; }
    /* Colour is deliberately NOT reset here. This selector is one class plus
       one type, so it out-specifies every single-class rule below it, and an
       inherited colour made the primary action white-on-white. Each button
       states its own instead. */
    .dtx-root button { font: inherit; }

    /* ---------------- masthead ---------------- */
    .dtx-mast {
      position: relative; overflow: hidden;
      padding: 26px 28px 62px 28px;
      background:
        radial-gradient(120% 140% at 88% -10%, rgba(255,255,255,.18) 0%, rgba(255,255,255,0) 55%),
        linear-gradient(126deg, var(--dtx-deep, #2e100d) 0%, var(--dtx-deep-2, #6b1712) 55%, var(--dtx-accent, #d92c24) 100%);
      color: #fdf4f3;
    }
    .dtx-mast--compact { padding: 18px 16px 56px 16px; }
    /* A hairline of the accent along the top edge ties the page to the card
       the reader clicked to get here. */
    .dtx-mast::before {
      content: ""; position: absolute; inset: 0 0 auto 0; height: 2px;
      background: #fff; opacity: .5;
    }
    .dtx-back {
      display: inline-flex; align-items: center; gap: 7px;
      margin-bottom: 18px; padding: 5px 11px 5px 8px;
      font-size: 12.5px; font-weight: 600;
      color: rgba(255,255,255,.82);
      background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.16);
      border-radius: 999px; cursor: pointer;
      transition: background .15s ease, color .15s ease;
    }
    .dtx-back:hover { background: rgba(255,255,255,.18); color: #fff; }

    .dtx-identity { display: flex; gap: 18px; align-items: flex-start; }
    .dtx-mono {
      flex: 0 0 auto;
      width: 66px; height: 66px; border-radius: 20px;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: 800; letter-spacing: -.02em;
      color: #fff;
      background: rgba(255,255,255,.13);
      border: 1px solid rgba(255,255,255,.22);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.18);
    }
    .dtx-mono--compact { width: 52px; height: 52px; border-radius: 16px; font-size: 19px; }
    .dtx-idbody { min-width: 0; flex: 1; }
    .dtx-eyebrow {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
      color: rgba(255,255,255,.62);
    }
    .dtx-name {
      margin-top: 7px;
      font-size: 30px; font-weight: 800; letter-spacing: -.022em; line-height: 1.12;
      overflow-wrap: anywhere;
    }
    .dtx-name--compact { font-size: 22px; }
    .dtx-sub {
      display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
      margin-top: 10px; font-size: 13px; color: rgba(255,255,255,.78);
    }
    .dtx-dot { width: 3px; height: 3px; border-radius: 999px; background: rgba(255,255,255,.4); }
    .dtx-spec {
      padding: 3px 10px; border-radius: 7px;
      font-size: 11.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
      color: #fff; background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.2);
    }
    .dtx-codebtn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 3px 9px; border-radius: 7px; cursor: pointer;
      font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums;
      color: rgba(255,255,255,.9);
      background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.18);
      transition: background .15s ease;
    }
    .dtx-codebtn:hover { background: rgba(255,255,255,.2); }
    .dtx-codebtn--done { color: #b8f5dc; border-color: rgba(184,245,220,.4); }

    /* the grade, sat opposite the name */
    .dtx-grade {
      flex: 0 0 auto; text-align: center; min-width: 86px;
      padding: 11px 14px 12px 14px; border-radius: 14px;
      background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.2);
    }
    .dtx-grade-label {
      font-size: 9.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
      color: rgba(255,255,255,.6);
    }
    .dtx-grade-value { margin-top: 3px; font-size: 25px; font-weight: 800; letter-spacing: -.02em; }

    /* ---------------- actions ---------------- */
    .dtx-actions { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 20px; }
    .dtx-act {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 8px 14px; border-radius: 10px; cursor: pointer;
      font-size: 13px; font-weight: 650; text-decoration: none;
      color: rgba(255,255,255,.92);
      background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.18);
      transition: background .15s ease, transform .15s ease, border-color .15s ease;
    }
    .dtx-act:hover { background: rgba(255,255,255,.2); border-color: rgba(255,255,255,.32); transform: translateY(-1px); }
    .dtx-act:active { transform: translateY(0); }
    .dtx-act--primary {
      color: var(--dtx-deep, #2e100d); background: #fff; border-color: #fff; font-weight: 700;
      box-shadow: 0 6px 18px -8px rgba(0,0,0,.5);
    }
    .dtx-act--primary:hover { background: #fff; color: var(--dtx-deep, #2e100d); }
    /* An action the record cannot support: still shown, still named, plainly
       not pressable. */
    .dtx-act--off { opacity: .42; cursor: default; }
    .dtx-act--off:hover { background: rgba(255,255,255,.10); border-color: rgba(255,255,255,.18); transform: none; }

    /* ---------------- body & stat strip ---------------- */
    .dtx-body { padding: 0 28px 28px 28px; }
    .dtx-body--compact { padding: 0 14px 20px 14px; }

    /* Lifted so it straddles the masthead edge — the page reads as one object
       with a header, not as a banner with a table under it. */
    .dtx-stats {
      position: relative; margin-top: -40px;
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
      background: var(--dtx-card); border: 1px solid var(--dtx-line);
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 14px 34px -22px rgba(15,23,41,.42);
    }
    .dtx-stats--compact { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: -42px; }
    .dtx-stat { padding: 15px 17px; border-left: 1px solid var(--dtx-line-soft); min-width: 0; }
    .dtx-stat:first-child { border-left: none; }
    .dtx-stats--compact .dtx-stat:nth-child(odd) { border-left: none; }
    .dtx-stats--compact .dtx-stat:nth-child(n+3) { border-top: 1px solid var(--dtx-line-soft); }
    .dtx-stat-label {
      font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
      color: var(--dtx-mute);
    }
    .dtx-stat-value {
      margin-top: 6px; font-size: 22px; font-weight: 800; letter-spacing: -.02em;
      color: var(--dtx-deep, #2e100d); white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .dtx-stat-value--compact { font-size: 18px; }
    .dtx-stat-sub {
      margin-top: 3px; font-size: 11.5px; color: var(--dtx-mute);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* ---------------- section grid ---------------- */
    .dtx-grid {
      margin-top: 20px; display: grid; gap: 18px;
      grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
      align-items: start;
    }
    .dtx-grid--compact { grid-template-columns: minmax(0, 1fr); gap: 14px; margin-top: 16px; }
    .dtx-col { display: grid; gap: 18px; align-content: start; min-width: 0; }
    .dtx-grid--compact .dtx-col { gap: 14px; }

    .dtx-card {
      background: var(--dtx-card); border: 1px solid var(--dtx-line);
      border-radius: 16px; overflow: hidden;
    }
    .dtx-head {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 17px; border-bottom: 1px solid var(--dtx-line-soft);
    }
    .dtx-head h3 {
      font-size: 12px; font-weight: 700; letter-spacing: .085em; text-transform: uppercase;
      color: var(--dtx-ink-2);
    }
    .dtx-count {
      margin-left: auto; padding: 2px 8px; border-radius: 999px;
      font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
      color: var(--dtx-ink-accent, #a81c16); background: var(--dtx-soft, #fcedec);
    }
    .dtx-pad { padding: 16px 17px; }
    .dtx-empty {
      padding: 22px 17px; font-size: 12.5px; line-height: 1.55; color: var(--dtx-mute);
    }
    .dtx-empty b { display: block; margin-bottom: 3px; font-weight: 650; color: var(--dtx-ink-2); }

    /* skeleton — a shape, so the layout does not jump when data lands */
    .dtx-skel {
      height: 11px; border-radius: 5px; background: var(--dtx-line-soft);
      animation: dtx-pulse 1.3s ease-in-out infinite;
    }
    @keyframes dtx-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
    @media (prefers-reduced-motion: reduce) {
      .dtx-skel { animation: none; }
      .dtx-act:hover, .dtx-row-link:hover { transform: none; }
    }

    /* ---------------- definition rows ---------------- */
    .dtx-defs { display: grid; gap: 0; }
    .dtx-def {
      display: flex; gap: 14px; align-items: baseline;
      padding: 10px 17px; border-top: 1px solid var(--dtx-line-soft);
      font-size: 13px;
    }
    .dtx-def:first-child { border-top: none; }
    .dtx-def dt {
      flex: 0 0 38%; max-width: 150px;
      font-size: 11.5px; font-weight: 600; color: var(--dtx-mute);
    }
    .dtx-def dd {
      flex: 1; min-width: 0; font-weight: 600; color: var(--dtx-ink);
      overflow-wrap: anywhere;
    }
    .dtx-def dd a { color: var(--dtx-ink-accent, #a81c16); text-decoration: none; font-weight: 650; }
    .dtx-def dd a:hover { text-decoration: underline; }
    .dtx-def dd small { display: block; margin-top: 2px; font-size: 11px; font-weight: 500; color: var(--dtx-mute); }

    /* ---------------- tables ---------------- */
    .dtx-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .dtx-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .dtx-table th {
      padding: 9px 17px; text-align: left; white-space: nowrap;
      font-size: 10px; font-weight: 700; letter-spacing: .085em; text-transform: uppercase;
      color: var(--dtx-mute); background: #fbfcfe;
      border-bottom: 1px solid var(--dtx-line-soft);
    }
    .dtx-table td {
      padding: 11px 17px; border-bottom: 1px solid var(--dtx-line-soft);
      color: var(--dtx-ink); vertical-align: top;
    }
    .dtx-table tr:last-child td { border-bottom: none; }
    .dtx-table .dtx-num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
    .dtx-table .dtx-id { font-variant-numeric: tabular-nums; font-weight: 650; white-space: nowrap; }
    .dtx-table tfoot td {
      padding: 11px 17px; background: #fbfcfe; font-weight: 800; color: var(--dtx-deep, #2e100d);
      border-top: 1px solid var(--dtx-line);
    }

    /* ---------------- stacked ledger (compact) ----------------
       A five-column table on a phone pushes VALUE — the one figure a rep is
       actually here for — off the right edge behind a horizontal scroll. So on
       a narrow container the same rows are stacked instead, with the amount
       kept on the first line beside the date. */
    .dtx-ledger { display: grid; }
    .dtx-led {
      display: grid; gap: 3px;
      padding: 12px 17px; border-top: 1px solid var(--dtx-line-soft);
    }
    .dtx-led:first-child { border-top: none; }
    .dtx-led-top {
      display: flex; align-items: baseline; gap: 10px;
      font-size: 13px; font-weight: 700; color: var(--dtx-ink);
    }
    .dtx-led-top span { flex: 1; min-width: 0; }
    .dtx-led-top b { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .dtx-led-mid {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      font-size: 12px; color: var(--dtx-ink-2);
    }
    .dtx-led-mid span { min-width: 0; overflow-wrap: anywhere; }
    .dtx-led-sub {
      font-size: 11px; color: var(--dtx-mute); font-variant-numeric: tabular-nums;
    }
    .dtx-led-total {
      display: flex; justify-content: space-between; gap: 10px;
      padding: 12px 17px; background: #fbfcfe;
      border-top: 1px solid var(--dtx-line);
      font-size: 12.5px; font-weight: 800; color: var(--dtx-deep, #2e100d);
    }
    .dtx-led-total b { font-variant-numeric: tabular-nums; }

    .dtx-pill {
      display: inline-block; padding: 2px 8px; border-radius: 6px;
      font-size: 10.5px; font-weight: 700; letter-spacing: .03em; white-space: nowrap;
    }
    /* A mark plus the word, so status never rests on colour — and none of
       these is red, which belongs to the brand. */
    .dtx-pill::before { margin-right: 3px; font-size: 9px; }
    .dtx-pill--draft { color: var(--dtx-warn); background: var(--dtx-warn-soft); border: 1px solid var(--dtx-warn-line); }
    .dtx-pill--draft::before { content: "○"; }
    .dtx-pill--open { color: var(--dtx-ink-2); background: var(--dtx-line-soft); border: 1px solid var(--dtx-line); }
    .dtx-pill--open::before { content: "○"; }
    .dtx-pill--won { color: var(--dtx-good); background: var(--dtx-good-soft); border: 1px solid var(--dtx-good-line); }
    .dtx-pill--won::before { content: "✓"; }
    .dtx-pill--lost { color: var(--dtx-void); background: var(--dtx-void-soft); border: 1px solid var(--dtx-void-line); }
    .dtx-pill--lost::before { content: "×"; }
    .dtx-pill--soft { color: var(--dtx-ink-2); background: var(--dtx-line-soft); border: 1px solid var(--dtx-line); }
    .dtx-pill--accent { color: var(--dtx-ink-accent, #a81c16); background: var(--dtx-soft, #fcedec); }

    /* ---------------- POB month chart ---------------- */
    .dtx-chart { display: flex; align-items: flex-end; gap: 7px; height: 132px; padding: 4px 0 0 0; }
    .dtx-bar-wrap {
      flex: 1 1 0; min-width: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: flex-end; height: 100%; gap: 6px;
    }
    .dtx-bar-val {
      font-size: 9.5px; font-weight: 700; color: var(--dtx-ink-2);
      font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .dtx-bar {
      width: 100%; max-width: 44px; min-height: 3px; border-radius: 5px 5px 2px 2px;
      background: linear-gradient(180deg, var(--dtx-accent, #d92c24) 0%, var(--dtx-deep, #6b1712) 100%);
    }
    /* A month with no POB keeps its slot: the gap is the finding, so the stub
       has to be tall enough to see rather than a hairline. */
    .dtx-bar--empty { background: var(--dtx-line); min-height: 6px; }
    .dtx-bar-label {
      font-size: 10px; font-weight: 650; color: var(--dtx-mute); white-space: nowrap;
    }
    .dtx-chart-foot {
      display: flex; justify-content: space-between; gap: 10px;
      margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--dtx-line-soft);
      font-size: 11.5px; color: var(--dtx-mute);
    }
    .dtx-chart-foot b { color: var(--dtx-ink); font-weight: 700; }

    /* ---------------- ranked products ---------------- */
    .dtx-rank { display: grid; gap: 11px; }
    .dtx-rank-row { display: grid; gap: 5px; }
    .dtx-rank-top {
      display: flex; align-items: baseline; gap: 10px;
      font-size: 12.5px; font-weight: 650; color: var(--dtx-ink);
    }
    .dtx-rank-top span:first-child { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .dtx-rank-top b { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .dtx-rank-top small { font-size: 11px; font-weight: 500; color: var(--dtx-mute); white-space: nowrap; }
    .dtx-rank-track { height: 6px; border-radius: 999px; background: var(--dtx-line-soft); overflow: hidden; }
    .dtx-rank-fill {
      height: 100%; border-radius: 999px; min-width: 3px;
      background: linear-gradient(90deg, var(--dtx-accent, #d92c24), var(--dtx-deep, #6b1712));
    }

    /* ---------------- classification locator ---------------- */
    .dtx-matrix { display: flex; gap: 14px; align-items: stretch; }
    .dtx-matrix--compact { flex-direction: column; }
    .dtx-matrix-figure { flex: 0 0 auto; }
    .dtx-matrix-legend { flex: 1; min-width: 0; display: grid; gap: 8px; align-content: center; }
    .dtx-matrix-note {
      font-size: 11.5px; line-height: 1.5; color: var(--dtx-mute);
    }
    .dtx-matrix-note b { color: var(--dtx-ink); font-weight: 700; }

    /* ---------------- notes timeline ---------------- */
    .dtx-notes { display: grid; gap: 0; }
    .dtx-note {
      position: relative; padding: 13px 17px 13px 38px;
      border-top: 1px solid var(--dtx-line-soft);
    }
    .dtx-note:first-child { border-top: none; }
    /* the rail and its node, drawn rather than imaged so it scales with text */
    .dtx-note::before {
      content: ""; position: absolute; left: 23px; top: 0; bottom: 0; width: 1px;
      background: var(--dtx-line);
    }
    .dtx-note:first-child::before { top: 18px; }
    .dtx-note:last-child::before { bottom: auto; height: 18px; }
    .dtx-note::after {
      content: ""; position: absolute; left: 19.5px; top: 16px;
      width: 8px; height: 8px; border-radius: 999px;
      background: var(--dtx-accent, #d92c24);
      box-shadow: 0 0 0 3px var(--dtx-card);
    }
    .dtx-note-when {
      font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
      color: var(--dtx-mute);
    }
    .dtx-note-text {
      margin-top: 4px; font-size: 13px; line-height: 1.55; color: var(--dtx-ink);
      white-space: pre-wrap; overflow-wrap: anywhere;
    }

    /* ---------------- footer ---------------- */
    .dtx-foot {
      display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center;
      margin-top: 18px; padding: 0 2px;
      font-size: 11.5px; color: var(--dtx-mute);
    }
    .dtx-foot b { color: var(--dtx-ink-2); font-weight: 650; }
    .dtx-foot a { margin-left: auto; color: var(--dtx-ink-accent, #a81c16); text-decoration: none; font-weight: 650; }
    .dtx-foot a:hover { text-decoration: underline; }

    .dtx-warn {
      display: flex; gap: 9px; align-items: flex-start;
      margin-top: 18px; padding: 11px 14px;
      font-size: 12px; line-height: 1.5; color: #7c4a06;
      background: #fffbeb; border: 1px solid #fde68a; border-radius: 11px;
    }
    .dtx-warn button {
      margin-left: auto; padding: 3px 10px; border-radius: 7px; cursor: pointer;
      font-size: 11.5px; font-weight: 700; color: #7c4a06;
      background: #fef3c7; border: 1px solid #fcd34d; white-space: nowrap;
    }
  `;
  document.head.appendChild(el);
}

/* ------------------------------------------------------------------ *
 * Icons — inline so the component carries no icon dependency.         *
 * ------------------------------------------------------------------ */

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
      <div className="dtx-head">
        <h3>{title}</h3>
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

const STATUS_TONE = { draft: "draft", open: "open", ordered: "won", won: "won", lost: "lost", expired: "lost" };

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
        {months.map((m) => {
          const pct = peak > 0 ? Math.max(3, Math.round((m.value / peak) * 100)) : 3;
          return (
            <div
              className="dtx-bar-wrap"
              key={m.key}
              title={`${m.label} ${m.year} — ${fmtMoney(m.value, currency)} across ${m.count} POB${m.count === 1 ? "" : "s"}`}
            >
              <span className="dtx-bar-val">{m.value > 0 ? fmtMoneyShort(m.value, currency) : ""}</span>
              <div
                className={`dtx-bar ${m.value > 0 ? "" : "dtx-bar--empty"}`}
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

export default function DoctorDetail({
  data,
  doctorId: doctorIdProp,

  mode = "auto",
  breakpoint = 860,

  fieldMap,

  sections: sectionsProp,
  actions: actionsProp,
  accent = "brand",

  enrich = true,
  pobLimit = 200,
  pobs: pobsProp,
  currency = "₹",

  erpTarget,
  erpUrl,
  authToken,

  showBackButton = false,
  backLabel = "All doctors",
  showStats = true,

  matrixAxisY = "Axis I",
  matrixAxisX = "Axis R",

  addPobLabel = "Add POB",
  linkPobToDoctor = false,
  employee,

  onBack,
  onCopyCode,
  onPobSaved,
  onAddNote,

  className = "",
  style,
}) {
  ensureStyles();
  const [wrapRef, compact] = useContainerMode(mode, breakpoint);
  const [copied, setCopied] = useState(false);
  const [pobOpen, setPobOpen] = useState(false);

  const row = useMemo(() => normalizeRow(data), [data]);

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

  const boundCode = pick(row, fields.code, ["name", "custom_doctor_code", "value", "code"]);
  const doctorId = String(doctorIdProp ?? "").trim() || boundCode;

  // A page that already holds this doctor's quotations can hand them over and
  // the component skips that fetch entirely; anything else is fetched as usual.
  const pobsGiven = useMemo(() => normalizeConnection(pobsProp), [pobsProp]);

  const {
    lead,
    pobs: pobsFetched,
    loadingLead,
    loadingPobs,
    error,
    refresh,
  } = useDoctorEnrichment(doctorId, {
    enabled: !!enrich,
    pobLimit,
    pobsGiven,
    erpUrl,
    authToken,
    erpTarget,
  });

  const pobs = pobsGiven ?? pobsFetched;

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
  const landline = realPhone(pickBoth(lead, row, "phone", []));
  const email = realEmail(pickBoth(lead, row, "email_id", ["email"]));

  const lat = realCoord(pickBoth(lead, row, "custom_latitude", []));
  const lng = realCoord(pickBoth(lead, row, "custom_longitude", []));
  const hasGeo = lat != null && lng != null;
  const mapsHref = hasGeo ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : "";

  // Coverage and notes come from whichever side actually holds the child table:
  // the list row carries role profiles, the enriched Lead carries both.
  const roleRows = useMemo(() => {
    const fromLead = readRoleRows(lead, "custom_role_profile");
    return fromLead.length ? fromLead : readRoleRows(row, fields.roles);
  }, [lead, row, fields.roles]);

  const notes = useMemo(() => {
    const fromLead = readNotes(lead);
    return fromLead.length ? fromLead : readNotes(row);
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

  const enriching = enrich && (loadingLead || loadingPobs);

  /* --- stat tiles ----------------------------------------------- */

  const stats = [
    {
      label: "POB value",
      value: pobKnown ? fmtMoneyShort(pob.total, currency) : "—",
      sub: pobKnown
        ? pob.count
          ? `across ${pob.count} POB${pob.count === 1 ? "" : "s"}`
          : "nothing raised yet"
        : enriching
          ? "loading…"
          : "not loaded",
    },
    {
      label: "Last POB",
      value: pob.last?.at ? fmtDate(pob.last.at) : pobKnown ? "Never" : "—",
      sub: pob.last?.at
        ? `${relTime(pob.last.at)}${pob.last.value ? ` · ${fmtMoneyShort(pob.last.value, currency)}` : ""}`
        : pobKnown
          ? "no POB on record"
          : "",
    },
    {
      label: "Divisions covering",
      value: divisions.length ? fmtNum(divisions.length) : "—",
      sub: divisions.length ? divisions.slice(0, 2).join(", ") : "no role profile rows",
    },
    {
      label: "Notes on file",
      value: notes.length ? fmtNum(notes.length) : "—",
      sub: notes.length ? `last ${relTime(notes[0].at)}` : "nothing recorded",
    },
  ];

  /* --- actions -------------------------------------------------- */

  const actions = useMemo(() => {
    const phone = String(mobile || "").replace(/\s/g, "");
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
        label: phone ? "Call" : "Call · no number",
        icon: <Icon.Phone />,
        href: phone ? `tel:${phone}` : "",
        why: phone ? "" : "ERP holds no mobile number for this doctor",
      },
      whatsapp: {
        key: "whatsapp",
        label: wa ? "WhatsApp" : "WhatsApp · no number",
        icon: <Icon.Chat />,
        href: wa ? `https://wa.me/${wa}` : "",
        external: true,
        why: wa ? "" : "ERP holds no mobile or WhatsApp number for this doctor",
      },
      email: {
        key: "email",
        label: email ? "E-mail" : "E-mail · none on record",
        icon: <Icon.Mail />,
        href: email ? `mailto:${email}` : "",
        why: email ? "" : "ERP holds no e-mail address for this doctor",
      },
      directions: {
        key: "directions",
        label: hasGeo ? "Directions" : "Directions · no location",
        icon: <Icon.Pin />,
        href: mapsHref,
        external: true,
        why: hasGeo ? "" : "This doctor's coordinates were never captured",
      },
    };
    return wanted.map((key) => spec[key]).filter(Boolean);
  }, [
    wanted,
    addPobLabel,
    onAddNote,
    lead,
    row,
    code,
    name,
    mobile,
    whatsapp,
    email,
    hasGeo,
    mapsHref,
  ]);

  /* --- masthead ------------------------------------------------- */

  const masthead = (
    <header className={`dtx-mast ${compact ? "dtx-mast--compact" : ""}`}>
      {showBackButton ? (
        <button type="button" className="dtx-back" onClick={() => onBack?.({ doctor: lead ?? row, code })}>
          <Icon.Back />
          {backLabel}
        </button>
      ) : null}

      <div className="dtx-identity">
        <div className={`dtx-mono ${compact ? "dtx-mono--compact" : ""}`}>{initialsOf(name)}</div>

        <div className="dtx-idbody">
          <div className="dtx-eyebrow">
            <span>Doctor</span>
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

          <h1 className={`dtx-name ${compact ? "dtx-name--compact" : ""}`}>{name || "Unnamed doctor"}</h1>

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
            {status ? <span>{status}</span> : null}
          </div>
        </div>

        {grade && !compact ? (
          <div className="dtx-grade">
            <div className="dtx-grade-label">Grade</div>
            <div className="dtx-grade-value">{grade}</div>
          </div>
        ) : null}
      </div>

      {/* Actions come from the `actions` list, in its order. An action the
          record cannot support is shown DIMMED AND LABELLED rather than
          dropped: "Call · no number" tells the reader the number is missing,
          where a silently absent button leaves them wondering. Add POB and
          Add a note are always supportable, so they never dim. */}
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

  const businessSection = (
    <Section key="business" title="POB history" count={pobKnown && pob.count ? pob.count : undefined}>
      {!pobKnown && loadingPobs ? (
        <Loading lines={4} />
      ) : !pob.count ? (
        <Empty
          headline="No POB recorded against this doctor"
          body={
            enrich
              ? "A POB shows up here once a Quotation carries this doctor in its DoctorVisit field. POBs raised without that link — the direct-POB default — are not traceable to a doctor and cannot appear."
              : "Enrichment is off, so no POB history was fetched."
          }
        />
      ) : (
        <>
          {pob.months.length > 1 ? <MonthChart months={pob.months} currency={currency} /> : null}

          {pob.products.length ? (
            <div className="dtx-pad" style={{ borderTop: "1px solid var(--dtx-line-soft)" }}>
              <div className="dtx-stat-label" style={{ marginBottom: 12 }}>
                What this doctor's POBs carry
              </div>
              <div className="dtx-rank">
                {pob.products.slice(0, 6).map((p) => {
                  const peak = pob.products[0].amount || 1;
                  return (
                    <div className="dtx-rank-row" key={p.label}>
                      <div className="dtx-rank-top">
                        <span>{p.label}</span>
                        <small>{fmtNum(p.qty)} units</small>
                        <b>{fmtMoney(p.amount, currency)}</b>
                      </div>
                      <div className="dtx-rank-track">
                        <div
                          className="dtx-rank-fill"
                          style={{ width: `${Math.max(3, Math.round((p.amount / peak) * 100))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div style={{ borderTop: "1px solid var(--dtx-line-soft)" }}>
            {compact ? (
              <>
                <div className="dtx-ledger">
                  {pob.rows.slice(0, 12).map((r) => (
                    <div className="dtx-led" key={r.id}>
                      <div className="dtx-led-top">
                        <span>{fmtDate(r.at) || "Undated"}</span>
                        <b>{fmtMoney(r.value, currency)}</b>
                      </div>
                      <div className="dtx-led-mid">
                        <span>{r.customer || "No customer"}</span>
                        <StatusPill value={r.status} />
                      </div>
                      <div className="dtx-led-sub">
                        {[r.id, r.territory].filter(Boolean).join("  ·  ")}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="dtx-led-total">
                  <span>
                    {pob.rows.length > 12 ? `Showing 12 of ${pob.rows.length} — total across all` : "Total"}
                  </span>
                  <b>{fmtMoney(pob.total, currency)}</b>
                </div>
              </>
            ) : (
              <div className="dtx-scroll">
                <table className="dtx-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Quotation</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th className="dtx-num">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pob.rows.slice(0, 12).map((r) => (
                      <tr key={r.id}>
                        <td className="dtx-id">
                          {fmtDate(r.at) || "—"}
                          {r.territory ? (
                            <small style={{ display: "block", fontWeight: 500, color: "var(--dtx-mute)" }}>
                              {r.territory}
                            </small>
                          ) : null}
                        </td>
                        <td className="dtx-id">{r.id}</td>
                        <td>{r.customer || "—"}</td>
                        <td>
                          <StatusPill value={r.status} />
                        </td>
                        <td className="dtx-num">{fmtMoney(r.value, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>
                        {pob.rows.length > 12 ? `Showing 12 of ${pob.rows.length} — total across all` : "Total"}
                      </td>
                      <td className="dtx-num">{fmtMoney(pob.total, currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Section>
  );

  const notesSection = (
    <Section key="notes" title="Notes" count={notes.length || undefined}>
      {!notes.length && loadingLead ? (
        <Loading lines={3} />
      ) : !notes.length ? (
        <Empty
          headline="No notes on this doctor"
          body="Notes written on a doctor visit land in the Lead's own notes table and appear here, newest first."
        />
      ) : (
        <div className="dtx-notes">
          {notes.map((note) => (
            <article className="dtx-note" key={note.id}>
              <div className="dtx-note-when">
                {fmtDate(note.at) || `Note ${note.idx}`}
                {note.at ? ` · ${relTime(note.at)}` : ""}
              </div>
              <p className="dtx-note-text">{note.text}</p>
            </article>
          ))}
        </div>
      )}
    </Section>
  );

  const coverageSection = (
    <Section key="coverage" title="Coverage" count={roleRows.length || undefined}>
      {!roleRows.length && loadingLead ? (
        <Loading lines={2} />
      ) : !roleRows.length ? (
        <Empty
          headline="No division is mapped to this doctor"
          body="Coverage comes from the doctor's Role Profile rows, which pair a division with an HQ. Without one, a POB has no department to price items against."
        />
      ) : (
        <div className="dtx-scroll">
          <table className="dtx-table">
            <thead>
              <tr>
                <th>Division</th>
                <th>HQ</th>
                <th>Beat</th>
              </tr>
            </thead>
            <tbody>
              {roleRows.map((r) => (
                <tr key={`${r.department}|${r.hq}|${r.beat}`}>
                  <td style={{ fontWeight: 650 }}>{r.department || "—"}</td>
                  <td>{r.hq || "—"}</td>
                  <td className="dtx-id" style={{ color: "var(--dtx-mute)" }}>{r.beat || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );

  const classificationRows = [
    { label: "Grade", value: grade },
    { label: `${matrixAxisY} / ${matrixAxisX}`, value: cat1 },
    { label: "Coverage class", value: cat2 },
    { label: "Focus list", value: cat3 },
  ].filter((r) => r.value);

  const classificationSection =
    classificationRows.length || loadingLead ? (
      <Section key="classification" title="Classification">
        {!classificationRows.length && loadingLead ? (
          <Loading lines={2} />
        ) : (
          <>
            {matrix ? (
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
                      . ERP stores only the code, so the axis names are set on this component — rename
                      them and the grid relabels itself.
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
    <Section key="contact" title="Contact & location">
      {contactRows.some((r) => r.value) ? (
        <Defs rows={contactRows} />
      ) : loadingLead ? (
        <Loading lines={3} />
      ) : (
        <Empty
          headline="No reachable contact detail"
          body="ERP holds 0 in the phone columns for bulk-imported doctors, and those are treated as blank here rather than shown as a number to dial."
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
    coverage: coverageSection,
    classification: classificationSection,
    notes: notesSection,
    contact: contactSection,
    record: recordSection,
  };
  const chosen = sections.map((key) => [key, byKey[key]]).filter(([, node]) => node);
  const wideCol = chosen.filter(([key]) => WIDE_SECTIONS.has(key));
  const narrowCol = chosen.filter(([key]) => !WIDE_SECTIONS.has(key));

  return (
    <>
      <div ref={wrapRef} className={`dtx-root ${className}`} style={accentVars}>
        {masthead}

        <div className={`dtx-body ${compact ? "dtx-body--compact" : ""}`}>
          {showStats ? (
            <div className={`dtx-stats ${compact ? "dtx-stats--compact" : ""}`}>
              {stats.map((s) => (
                <div className="dtx-stat" key={s.label}>
                  <div className="dtx-stat-label">{s.label}</div>
                  <div className={`dtx-stat-value ${compact ? "dtx-stat-value--compact" : ""}`}>{s.value}</div>
                  {s.sub ? <div className="dtx-stat-sub">{s.sub}</div> : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* The ERP read is additive — the page is already usable from the bound
              row — so a failure is a dismissible strip, never a blank screen. */}
          {error ? (
            <div className="dtx-warn" role="status">
              <span>
                Showing what the list already loaded. ERP wouldn&apos;t hand over the rest: {error}
              </span>
              <button type="button" onClick={refresh}>
                Retry
              </button>
            </div>
          ) : null}

          {chosen.length > 0 ? (
            <div
              className={`dtx-grid ${compact ? "dtx-grid--compact" : ""}`}
              // With everything in one column there is no second track to
              // reserve, so a section list of only wide (or only narrow)
              // entries does not leave an empty half.
              style={
                !compact && (wideCol.length === 0 || narrowCol.length === 0)
                  ? { gridTemplateColumns: "minmax(0, 1fr)" }
                  : undefined
              }
            >
              {compact ? (
                <div className="dtx-col">{chosen.map(([, node]) => node)}</div>
              ) : (
                <>
                  {wideCol.length > 0 ? (
                    <div className="dtx-col">{wideCol.map(([, node]) => node)}</div>
                  ) : null}
                  {narrowCol.length > 0 ? (
                    <div className="dtx-col">{narrowCol.map(([, node]) => node)}</div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <div className="dtx-foot">
            <span>
              ERP Lead <b>{code || "—"}</b>
            </span>
            {enriching ? <span>Loading detail from ERP…</span> : null}
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
