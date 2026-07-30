import { AUTH_CONFIG, LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";

// A "did anything change?" check that is cheap enough to run every few seconds.
//
// Refetching the whole calendar just to find out nothing moved is expensive: the
// events query is paginated and fans out into quotations, leaves, todos and doc
// shares. Instead we ask ERP for one aggregate row per watched doctype —
// `count(name)` plus `max(modified)` — which is ~60 bytes and lands in a single
// indexed query. Any create bumps the count, any edit bumps max(modified), and
// any delete drops the count, so all three are covered.
//
// Everything compared here is a *server-produced* string. There is deliberately
// no client clock involved: ERP stores naive datetimes in the site timezone, so
// comparing them against a browser-side ISO timestamp would be off by the UTC
// offset and report a change on every single tick.

const AGGREGATE_FIELDS = JSON.stringify([
  "count(name) as cnt",
  "max(modified) as latest",
]);

// Fallback for sites that refuse aggregate functions over REST. Loses
// delete-detection for anything that isn't the most recently touched row, but
// still catches every create and edit.
const LATEST_ROW_FIELDS = JSON.stringify(["name", "modified"]);

function getErpBaseUrl() {
  const { erpUrl } = AUTH_CONFIG;

  if (!erpUrl) {
    throw new Error("Missing ERP auth configuration");
  }

  return erpUrl
    .replace(/(\/api(?:\/method)?\/graphql|\/graphql)\/?$/i, "")
    .replace(/\/$/, "");
}

async function fetchProbeRow(doctype, params) {
  const { authToken } = AUTH_CONFIG;

  if (!authToken) {
    throw new Error("Missing ERP auth configuration");
  }

  const response = await fetch(
    `${getErpBaseUrl()}/api/resource/${encodeURIComponent(doctype)}?${params}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `token ${authToken}`,
      },
      // The whole point is to see fresh numbers — never let the browser or an
      // intermediary answer this from cache.
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const json = await response.json();
  return json?.data?.[0] ?? {};
}

function buildParams(fields, filters, extra = {}) {
  const params = new URLSearchParams({
    fields,
    limit_page_length: "1",
    ...extra,
  });

  if (filters?.length) {
    params.set("filters", JSON.stringify(filters));
  }

  return params;
}

async function probeDoctype(doctype, filters) {
  try {
    const row = await fetchProbeRow(
      doctype,
      buildParams(AGGREGATE_FIELDS, filters)
    );

    // An empty table legitimately answers `{cnt: 0, latest: null}`; a site that
    // rejected the aggregate fields answers with a normal row instead, so treat
    // a missing `cnt` as "aggregates unsupported" and fall through.
    if (row.cnt !== undefined && row.cnt !== null) {
      return `${row.cnt}@${row.latest ?? "-"}`;
    }
  } catch {
    /* fall through to the latest-row probe */
  }

  const row = await fetchProbeRow(
    doctype,
    buildParams(LATEST_ROW_FIELDS, filters, { order_by: "modified desc" })
  );

  return `${row.name ?? "-"}@${row.modified ?? "-"}`;
}

function buildWatchList() {
  const watched = [
    { key: "Event", doctype: "Event" },
    { key: "Leave Application", doctype: "Leave Application" },
    { key: "ToDo", doctype: "ToDo" },
  ];

  // New DocShare rows are how an event created by someone else becomes visible
  // to this user, and they don't touch the Event itself — without this a
  // freshly shared event would only surface on the next full refresh.
  if (LOGGED_IN_USER.email) {
    watched.push({
      key: "DocShare",
      doctype: "DocShare",
      filters: [["user", "=", LOGGED_IN_USER.email]],
    });
  }

  return watched;
}

/**
 * Reads one signature per watched doctype.
 *
 * @param {Record<string,string>|null} previous last signature, used to carry a
 *   value forward when its probe fails. A transient failure must not look like
 *   a change, or every network hiccup would trigger a full refetch.
 * @returns {Promise<Record<string,string>|null>} `null` when nothing could be
 *   read at all (offline, ERP down, bad token) — the caller should keep its
 *   previous signature and try again rather than treat that as "no change".
 */
export async function probeCalendarSignature(previous = null) {
  const watched = buildWatchList();

  const results = await Promise.all(
    watched.map(async ({ key, doctype, filters }) => {
      try {
        return [key, await probeDoctype(doctype, filters)];
      } catch {
        // Carry the last known value forward; `null` for a doctype we've never
        // successfully probed (e.g. no read permission) so it stays out of the
        // signature entirely.
        return [key, previous?.[key] ?? null];
      }
    })
  );

  const usable = results.filter(([, value]) => value !== null);

  if (!usable.length) {
    return null;
  }

  return Object.fromEntries(usable);
}

export function isSameCalendarSignature(a, b) {
  if (!a || !b) return false;

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}
