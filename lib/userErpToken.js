/**
 * The signed-in person's OWN ERP token, for calls to our API routes that act on
 * their behalf (/api/erp/print, /api/erp/profile-picture). Sent as the
 * `x-erp-token` header, the same convention /api/erp/claim-file uses.
 *
 * A token bound on the component wins; otherwise the one the login flow left in
 * localStorage "token" ("token key:secret" or "key:secret" - the server accepts
 * either). While impersonating, that is the impersonated person's token, so the
 * routes act as them - the same as every other ERP call the page makes.
 *
 * See SECURITY_PERM_V2.md.
 */
export function userErpToken(explicit) {
  const bound = String(explicit ?? "").trim();
  if (bound) return bound;
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem("token") || "").trim();
  } catch {
    return "";
  }
}

/** Headers carrying the caller's token, or {} when there is none to send. */
export function userErpTokenHeaders(explicit) {
  const token = userErpToken(explicit);
  return token ? { "x-erp-token": token } : {};
}
