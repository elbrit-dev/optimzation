/**
 * TEMPLATE. Copy to `auth-secrets.mjs` (same folder, drop the `.example`) then:
 *
 *     node tools/auth-audit-dashboard/set-password.mjs --generate
 *
 * The real `auth-secrets.mjs` is gitignored because it holds live secrets: the
 * password derivation and, more importantly, the session signing key — anyone
 * with that key can mint a valid session.
 *
 * With the values left empty the auth layer DENIES EVERYONE. That is deliberate:
 * a fresh deploy is locked, not open.
 */

const env = (name) => {
  const v = typeof process !== 'undefined' ? process.env?.[name] : undefined
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

export const AUTH = {
  /** base64url PBKDF2-SHA256 of the password. Empty = locked, nobody gets in. */
  get passwordHash() { return env('AUTH_PASSWORD_HASH') || '' },
  /** base64url random salt, regenerated whenever the password is set. */
  get salt() { return env('AUTH_PASSWORD_SALT') || '' },
  /**
   * The SECOND login: sales report only. Set with
   *     node set-password.mjs --report "their password"
   * Empty means that role does not exist and nobody can hold it.
   */
  /**
   * Login IDs. NOT secrets — they select which login is being attempted, and are
   * compared case-insensitively. A blank ID is accepted for the admin password.
   */
  get adminUserId() { return env('AUTH_USER_ID') || 'admin' },
  get reportUserId() { return env('REPORT_USER_ID') || 'elbrit' },
  get reportPasswordHash() { return env('REPORT_PASSWORD_HASH') || '' },
  get reportSalt() { return env('REPORT_PASSWORD_SALT') || '' },
  iterations: 210000,
  /** HMAC key for session cookies. Rotating it invalidates all sessions. */
  get sessionSecret() { return env('AUTH_SESSION_SECRET') || '' },
  /** How long a login lasts. */
  sessionHours: 12,
}
