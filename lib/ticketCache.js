/**
 * localStorage cache for "does this person already have a ticket open?".
 *
 * Why it exists: the answer is needed the instant the sheet opens, but it comes
 * from an ERP round trip. Cached, the sheet renders immediately from the last
 * known answer and refreshes behind it — stale-while-revalidate.
 *
 * The cache is a rendering shortcut, never the authority:
 *   - A cached ticket may have been resolved since. Every read is revalidated,
 *     and a server answer of "none" clears the entry — otherwise someone whose
 *     problem was fixed would be stuck looking at a closed ticket, unable to
 *     report the next one.
 *   - The submit route dedupes server-side regardless, so a wrong cache costs
 *     one wasted tap at worst. It can never create a duplicate or lose a report.
 *
 * Every access is wrapped: Safari in private mode throws on setItem, storage
 * can be full, and another version of the app may have left unparseable JSON.
 * A caching layer that can break the form it is speeding up is not worth having.
 */

const PREFIX = "elbritOne.helpTicket.";

/** How long before we bother ERP again. Short — ticket status is the point. */
export const TICKET_TTL_MS = 5 * 60 * 1000;

/**
 * Keyed by variant AND employee: one device can be used by more than one person
 * (shared demo phones are common in the field), and the login variant asks for
 * an ID by hand. Neither should ever see the other's ticket.
 */
export function ticketCacheKey(variant, employeeId) {
  return `${PREFIX}${variant}.${String(employeeId || "").toUpperCase()}`;
}

/** @returns {{ticket: object|null, at: number}|null} */
export function readTicketCache(key) {
  if (typeof window === "undefined" || !key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.at !== "number") return null;
    // `ticket: null` is a real, cacheable answer — "we checked, there is none".
    return { ticket: parsed.ticket ?? null, at: parsed.at };
  } catch {
    return null;
  }
}

export function writeTicketCache(key, ticket, now = Date.now()) {
  if (typeof window === "undefined" || !key) return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ ticket: ticket ?? null, at: now })
    );
  } catch {
    /* full, or private mode — the form works fine without the cache */
  }
}

export function isFresh(entry, now = Date.now()) {
  return Boolean(entry) && now - entry.at < TICKET_TTL_MS;
}
