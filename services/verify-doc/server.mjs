/* verify-doc: a document check any Elbrit app can call.
 *
 *   GET  /health     liveness, and whether a model key is configured
 *   POST /v1/verify   { documents, fields, rules?, context?, bands? }
 *                     -> { score, risk, fields, rules, summary, document, meta }
 *
 * Only Elbrit callers get in (lib/auth.mjs): a signed-in user (Firebase ID
 * token; the ERP token too when REQUIRE_ERP_TOKEN is on) or an Elbrit server
 * (client key). Browsers are
 * allowed only from ALLOWED_ORIGINS. See README.md for the contract. */

import { createServer } from "node:http";
import { allow, identify } from "./lib/auth.mjs";
import { config } from "./lib/config.mjs";
import { verify } from "./lib/verify.mjs";

function corsHeaders(req) {
  const origin = String(req.headers.origin || "").toLowerCase();
  if (!origin || !config.allowedOrigins.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": req.headers.origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-ERP-Token",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function send(req, res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...corsHeaders(req),
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > config.maxBodyBytes) {
        reject(Object.assign(new Error(`Request is larger than ${config.maxBodyBytes / 1048576} MB.`), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function makeServer(deps = {}) {
  return createServer(async (req, res) => {
    const path = (req.url || "").split("?")[0];
    if (req.method === "OPTIONS") {
      const h = corsHeaders(req);
      res.writeHead(Object.keys(h).length ? 204 : 403, h);
      return res.end();
    }
    if (req.method === "GET" && path === "/health") return send(req, res, 200, { ok: true, model: config.model, modelKey: !!config.geminiKey });
    if (path !== "/v1/verify") return send(req, res, 404, { error: "Not found." });
    if (req.method !== "POST") return send(req, res, 405, { error: "Use POST." });
    if (req.headers.origin && !Object.keys(corsHeaders(req)).length) return send(req, res, 403, { error: "This site may not call the service." });

    const started = Date.now();
    let who = null;
    try {
      const id = await identify(req.headers, deps);
      who = id.kind === "client" ? `client:${id.name}` : `user:${id.uid}:${id.erpUser}`;
      if (!allow(who)) return send(req, res, 429, { error: "Too many checks in a minute -- try again shortly." });
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(req, res, 400, { error: "Body is not valid JSON." });
      }
      const out = await verify(body, deps);
      console.log(JSON.stringify({ at: "verify", who, ms: Date.now() - started, docs: out.meta.documents, score: out.score, risk: out.risk, tokens: out.meta.tokens }));
      return send(req, res, 200, out);
    } catch (e) {
      const status = e.status || (e.name === "TimeoutError" ? 504 : 500);
      console.error(JSON.stringify({ at: "verify", who, ms: Date.now() - started, status, error: e.message }));
      return send(req, res, status, { error: status === 500 ? "Something went wrong reading the documents." : e.message });
    }
  });
}

if (process.argv[1] && /server\.mjs$/.test(process.argv[1])) {
  makeServer().listen(config.port, () => console.log(`verify-doc listening on :${config.port} (model ${config.model})`));
}
