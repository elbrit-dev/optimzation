/* End to end through the HTTP server, with Google, the ERP and Gemini faked. */
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";

process.env.GEMINI_API_KEY = "test-gemini";
process.env.VERIFY_DOC_CLIENTS = JSON.stringify({ "elbrit-app": "client-secret-123" });
const { makeServer } = await import("../server.mjs");
const { config } = await import("../lib/config.mjs");

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PROJECT = "elbrit-sso-d01d9";

function idToken(claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(JSON.stringify({ alg: "RS256", kid: "k1" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: "uid-42", iat: now, auth_time: now, exp: now + 3600, ...claims }),
  ).toString("base64url");
  const sig = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}

const reading = {
  document: { readable: true, kind: "receipt", language: "en" },
  fields: [
    { key: "amount", value: "₹500.00", confidence: 0.97 },
    { key: "date", value: "21/10/2026", confidence: 0.9 },
  ],
  tables: [],
  rules: [{ index: 0, pass: true, reason: "Printed receipt" }],
  summary: "A fuel receipt.",
};

const calls = [];
async function fakeFetch(url, opts = {}) {
  url = String(url);
  calls.push(url);
  if (url.includes("securetoken@system")) {
    return new Response(JSON.stringify({ k1: publicKey.export({ type: "spki", format: "pem" }) }), { headers: { "cache-control": "max-age=3600" } });
  }
  if (url.includes("get_logged_user")) {
    return opts.headers.Authorization === "token good:erp"
      ? new Response(JSON.stringify({ message: "be1@elbrit.org" }))
      : new Response(JSON.stringify({ exc_type: "AuthenticationError" }), { status: 401 });
  }
  if (url.includes("generativelanguage")) {
    const body = JSON.parse(opts.body);
    assert.ok(!body.contents[0].parts[0].text.includes("500"), "the expected amount must not reach the model");
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reading) }] } }], usageMetadata: { totalTokenCount: 1234 } }));
  }
  throw new Error("unexpected fetch " + url);
}

const BODY = {
  documents: [{ data: Buffer.from("%PDF-1.4 fake").toString("base64"), mimeType: "application/pdf", name: "bill.pdf" }],
  context: "Expense claim",
  fields: { amount: { type: "number", expected: 500, weight: 70 }, date: { type: "date", expected: "2026-10-21", weight: 30 } },
  rules: ["Must be a printed receipt"],
};

async function withServer(fn) {
  const server = makeServer({ fetchImpl: fakeFetch }).listen(0);
  await new Promise((r) => server.once("listening", r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

const post = (base, headers, body = BODY) =>
  fetch(`${base}/v1/verify`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

test("a signed-in user with a live ERP token gets a score", () =>
  withServer(async (base) => {
    const res = await post(base, { Authorization: `Bearer ${idToken()}`, "X-ERP-Token": "token good:erp", Origin: "https://app.elbrit.org" });
    const out = await res.json();
    assert.equal(res.status, 200, JSON.stringify(out));
    assert.equal(res.headers.get("access-control-allow-origin"), "https://app.elbrit.org");
    assert.equal(out.score, 100);
    assert.equal(out.risk, "Low");
    assert.equal(out.rules[0].pass, true);
    assert.equal(out.meta.tokens, 1234);
    assert.match(out.summary, /Everything checked matches/);
  }));

test("a server with a client key gets in", () =>
  withServer(async (base) => {
    const res = await post(base, { Authorization: "Bearer client-secret-123" });
    assert.equal(res.status, 200);
  }));

test("a Firebase login alone is enough (ERP token check off by default)", () =>
  withServer(async (base) => {
    assert.equal(config.requireErpToken, false);
    assert.equal((await post(base, { Authorization: `Bearer ${idToken()}` })).status, 200);
  }));

test("with REQUIRE_ERP_TOKEN on, a live ERP token is demanded too", () =>
  withServer(async (base) => {
    config.requireErpToken = true;
    try {
      assert.equal((await post(base, { Authorization: `Bearer ${idToken()}` })).status, 403);
      assert.equal((await post(base, { Authorization: `Bearer ${idToken()}`, "X-ERP-Token": "token bad:erp" })).status, 403);
      assert.equal((await post(base, { Authorization: `Bearer ${idToken()}`, "X-ERP-Token": "token good:erp" })).status, 200);
    } finally {
      config.requireErpToken = false;
    }
  }));

test("no token, wrong token, forged or foreign Firebase tokens are refused", () =>
  withServer(async (base) => {
    assert.equal((await post(base, {})).status, 401);
    assert.equal((await post(base, { Authorization: "Bearer nope" })).status, 401);
    assert.equal((await post(base, { Authorization: `Bearer ${idToken({ aud: "someone-else" })}`, "X-ERP-Token": "token good:erp" })).status, 401);
    assert.equal((await post(base, { Authorization: `Bearer ${idToken({ exp: 1000 })}`, "X-ERP-Token": "token good:erp" })).status, 401);
    const tampered = idToken().replace(/\.[^.]+\./, "." + Buffer.from(JSON.stringify({ aud: PROJECT, sub: "x" })).toString("base64url") + ".");
    assert.equal((await post(base, { Authorization: `Bearer ${tampered}`, "X-ERP-Token": "token good:erp" })).status, 401);
  }));

test("browsers from other sites are refused", () =>
  withServer(async (base) => {
    const res = await post(base, { Authorization: "Bearer client-secret-123", Origin: "https://evil.example" });
    assert.equal(res.status, 403);
    const pre = await fetch(`${base}/v1/verify`, { method: "OPTIONS", headers: { Origin: "https://app-uat.elbrit.org" } });
    assert.equal(pre.status, 204);
  }));

test("bad requests say what is wrong", () =>
  withServer(async (base) => {
    const res = await post(base, { Authorization: "Bearer client-secret-123" }, { documents: [], fields: {} });
    assert.equal(res.status, 400);
    const res2 = await post(base, { Authorization: "Bearer client-secret-123" }, { ...BODY, documents: [{ url: "https://evil.example/x.pdf" }] });
    assert.equal(res2.status, 400);
    assert.match((await res2.json()).error, /not allowed/);
  }));

test("form-data: a file part plus a request part (as Postman sends it)", () =>
  withServer(async (base) => {
    const form = new FormData();
    form.append("request", JSON.stringify({ fields: BODY.fields, rules: BODY.rules }));
    form.append("file", new Blob([Buffer.from("%PDF-1.4 fake")], { type: "application/pdf" }), "invoice.pdf");
    const res = await fetch(`${base}/v1/verify`, { method: "POST", headers: { Authorization: "Bearer client-secret-123" }, body: form });
    const out = await res.json();
    assert.equal(res.status, 200, JSON.stringify(out));
    assert.equal(out.meta.documents, 1);
    assert.equal(out.score, 100);
  }));

test("warm: a signed-in user wakes Docling at once, once per few minutes; strangers cannot", async () => {
  const before = config.doclingKey;
  config.doclingKey = "dk";
  const woke = [];
  const fetchImpl = async (url, opts) => {
    if (String(url).endsWith("/health")) {
      woke.push(opts.headers["X-Api-Key"]);
      return new Response("{}");
    }
    return fakeFetch(url, opts);
  };
  const server = makeServer({ fetchImpl }).listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const warm = (headers) => fetch(`${base}/v1/warm`, { method: "POST", headers });
  try {
    assert.equal((await warm({})).status, 401);
    const first = await warm({ Authorization: `Bearer ${idToken()}` });
    assert.equal(first.status, 202);
    assert.equal((await first.json()).warming, true);
    assert.equal((await (await warm({ Authorization: `Bearer ${idToken()}` })).json()).warming, false);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(woke, ["dk"]);
  } finally {
    server.close();
    config.doclingKey = before;
  }
});
