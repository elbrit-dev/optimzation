const ALLOWED_REDIRECT_ORIGINS = (process.env.NEXT_PUBLIC_ALLOWED_REDIRECT_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Guards against an open redirect: the `redirect` query param on /login is
// attacker-controllable, so only bounce to origins we explicitly trust
// (the other Multi-Zone-split apps sharing this Firebase project's auth).
export function getSafeRedirect(redirectParam) {
  if (!redirectParam) return null;

  try {
    const url = new URL(redirectParam);
    return ALLOWED_REDIRECT_ORIGINS.includes(url.origin) ? url.href : null;
  } catch {
    return null;
  }
}
