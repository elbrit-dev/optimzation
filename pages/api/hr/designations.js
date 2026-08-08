import {
  erpFetch,
  erpBaseUrl,
  rateLimit,
  callerIp,
  resolveErpCredentials,
} from "../../../lib/erpServer";

/**
 * The Designation list, for the login-help form's dropdown.
 *
 * POST rather than GET purely so the ERP routing (and possibly a token) travels
 * in the body — a credential in a query string ends up in access logs.
 *
 * PUBLIC endpoint, pre-login by definition. Job titles are not sensitive, and
 * this returns nothing but names — no employees, no counts, no per-person data.
 *
 * POST { erpTarget?, erpUrl?, authToken? } -> { designations: string[] }
 */

// Designations change maybe twice a year, and every visitor who opens the form
// would otherwise hit ERP. Cached per ERP host so prod and UAT don't share.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const limit = rateLimit(`designations:${callerIp(req)}`, { max: 30, windowMs: 60_000 });
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({ error: "Too many requests" });
  }

  try {
    const creds = resolveErpCredentials({
      url: req.body?.erpUrl,
      token: req.body?.authToken,
      target: req.body?.erpTarget,
    });

    const cacheKey = erpBaseUrl(creds);
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, max-age=600");
      return res.status(200).json({ designations: hit.designations, cached: true });
    }

    const json = await erpFetch("/api/resource/Designation", {
      creds,
      query: {
        fields: ["name"],
        limit_page_length: 0, // 0 = no limit; there are ~85 and the list must be complete
        order_by: "name asc",
      },
    });

    const designations = (json?.data ?? [])
      .map((row) => String(row?.name ?? "").trim())
      .filter(Boolean);

    cache.set(cacheKey, { at: Date.now(), designations });

    res.setHeader("Cache-Control", "public, max-age=600");
    return res.status(200).json({ designations });
  } catch (err) {
    const isConfig = err?.name === "ErpConfigError";
    console.error(
      `[hr/designations] ${isConfig ? "CONFIG" : "ERP"} failure:`,
      err?.message,
      err?.status ? `(HTTP ${err.status})` : ""
    );

    // Never fail the form over this — the field falls back to free text.
    return res.status(200).json({
      designations: [],
      degraded: true,
      code: isConfig ? "config" : "erp",
      ...(process.env.LOGIN_HELP_DEBUG === "1" ? { debug: err?.message } : {}),
    });
  }
}
