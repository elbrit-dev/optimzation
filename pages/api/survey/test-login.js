// pages/api/survey/test-login.js
//
// POST JSON { response, question, url, login, password, ticket? }
//      x-erp-endpoint: <the survey's ERP origin>
//      x-erp-token:    <the rep's own ERP token>   (the app)
//   or ticket:         a one-time ticket from the ERP's own page (survey_login_test step=ticket; the ERP page has no token)
//
// 26 Nov 2026: the survey's Login question — "Test login". This server:
//   1. finds who the rep is (their token, or the ERP checks the ticket — survey_login_test step=check);
//   2. signs in to the website with the details (lib/loginTester.js), signs out, keeps nothing;
//   3. records the result in the ERP (survey_login_test step=save, as the app's service account) — the ERP accepts a
//      "verified" answer only when this record matches, so a result can't be made up in the browser.
// -> { result: "verified" | "not_verified", code, message }
// The ERP's own My Surveys page calls this from the browser, so its hosts are allowed (CORS).

import { allowedErpHosts } from "../../../lib/erpServer";
import { erpCall, serviceFor, userFromToken } from "../../../lib/surveyErp";
import { testLogin } from "../../../lib/loginTester";

const recent = new Map(); // user -> test times (a few tests a minute per person: each is a real sign-in)
const LIMIT = 6;
const WINDOW_MS = 10 * 60 * 1000;

function cors(req, res) {
  const o = String(req.headers.origin || "");
  try {
    if (o && allowedErpHosts().has(new URL(o).host.toLowerCase())) {
      res.setHeader("Access-Control-Allow-Origin", o);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-erp-endpoint, x-erp-token");
      res.setHeader("Access-Control-Max-Age", "600");
    }
  } catch {
    /* not a URL */
  }
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed." });
  }
  let origin;
  try {
    const url = new URL(String(req.headers["x-erp-endpoint"] || ""));
    if (!allowedErpHosts().has(url.host.toLowerCase())) throw new Error("host");
    origin = url.origin;
  } catch {
    return res.status(400).json({ error: "That ERP is not one this app talks to." });
  }
  const b = req.body && typeof req.body === "object" ? req.body : {};
  const url = String(b.url || "").trim().slice(0, 500);
  const login = String(b.login || "").trim().slice(0, 300);
  const password = String(b.password || "").slice(0, 300);
  if (!url || !login || !password) return res.status(400).json({ error: "Fill the website, login and password first." });

  const svc = await serviceFor(origin);
  if (!svc.auth) return res.status(503).json({ error: "The test can’t reach the ERP right now." });

  // 1. who is asking, and for which response / question
  let user;
  let response = String(b.response || "").slice(0, 140);
  let question = String(b.question || "").slice(0, 140);
  try {
    if (b.ticket) {
      const t = await erpCall(origin, svc.auth, "survey_login_test", { step: "check", ticket: String(b.ticket).slice(0, 80) });
      ({ user, response, question } = t || {});
    } else {
      user = await userFromToken(origin, String(req.headers["x-erp-token"] || "").trim());
    }
  } catch (e) {
    return res.status(403).json({ error: e.message || "Not allowed." });
  }
  if (!user || !response || !question) return res.status(401).json({ error: "Sign in again." });

  const now = Date.now();
  const mine = (recent.get(user) || []).filter((t) => now - t < WINDOW_MS);
  if (mine.length >= LIMIT) return res.status(429).json({ error: "Too many tests — wait a few minutes (each test is a real sign-in, and too many can lock the account)." });
  recent.set(user, [...mine, now]);

  // 2. the test (nothing is kept: not the password, not the session)
  const out = await testLogin({ url, login, password });

  // 3. the ERP keeps the result (without the password) for this response and question
  try {
    await erpCall(origin, svc.auth, "survey_login_test", { step: "save", response, question, user, url, login, result: out.result, code: out.code, message: out.message });
  } catch (e) {
    return res.status(200).json({ ...out, result: "not_verified", code: "error", message: `The result couldn’t be saved in the ERP (${e.message}). Try again.` });
  }
  return res.status(200).json({ result: out.result, code: out.code, message: out.message });
}
