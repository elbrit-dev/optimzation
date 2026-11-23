// pages/api/survey/read-file.js
//
// POST multipart { response, question, file_url, text?, page* }
//      x-erp-endpoint: <the survey's ERP origin>
//      x-erp-token:    <the rep's own ERP token>
//
// 23 Nov 2026: a survey File upload question with an AI schema. Right after the
// rep's file is stored in the ERP (as the rep, private), the app sends its file
// url here. This server:
//   1. finds who the rep is from their own token;
//   2. asks the ERP (as the app's service account, survey_ai_read step=schema)
//      for the question's schema -- the ERP checks the response is the rep's
//      and the file was uploaded by the rep;
//   3. reads the file with Gemma 4 against that schema (lib/fileReader.js): a
//      photo is fetched from the ERP here; a PDF comes as its text, or its
//      page pictures, copied out in the browser;
//   4. keeps the read on the response (survey_ai_read step=save). Only this
//      server can write a read -- the rep never sees or sends one.
// -> { readable: true } | { readable: false, reason } (the rep is asked for a
//    clearer file) | { skipped } (no AI on this question, or the reader is off)
// The rep is told nothing else. If the AI itself fails, the failure is kept
// for Survey Center ("couldn't read it") and the rep is not bothered.

import { allowedErpHosts } from "../../../lib/erpServer";
import { fileReaderOn, readFile, toJpeg, FILE_MODEL } from "../../../lib/fileReader";
import { limiter } from "../../../lib/limit";

const aiSlot = limiter(Number(process.env.SURVEY_READ_PARALLEL) || 6);

export const config = { api: { bodyParser: false } };
const MAX = 8 * 1024 * 1024; // a PDF's text and up to 5 page pictures (the file itself is fetched from the ERP)
const FILE_MAX = 20 * 1024 * 1024;
const tokenHeader = (t) => (/^(token|bearer)\s/i.test(t) ? t : `token ${t}`);
const env = (name) => (process.env[name] || "").trim();

async function rawBody(req) {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX) throw Object.assign(new Error("Too big."), { status: 413 });
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

/* The app's service account for THIS ERP (the same host the rep is on), from the
   deployment's endpoint + token pairs -- never mixed across ERPs. Every pair on
   that host is tried; the first the ERP accepts is used (and remembered).
   -> { auth, as } | { tried: [suffixes] } */
const serviceCache = new Map();
async function serviceFor(origin) {
  if (serviceCache.has(origin)) return serviceCache.get(origin);
  const host = new URL(origin).host.toLowerCase();
  const tried = [];
  for (const t of ["ERP", "UAT", "NEW", ""]) {
    const url = env(t ? `NEXT_PUBLIC_GRAPHQL_ENDPOINT_${t}` : "NEXT_PUBLIC_GRAPHQL_ENDPOINT");
    const token = env(t ? `NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_${t}` : "NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN");
    if (!url || !token) continue;
    let same = false;
    try {
      same = new URL(url).host.toLowerCase() === host;
    } catch {
      /* a malformed env value */
    }
    if (!same) continue;
    const auth = tokenHeader(token);
    const r = await fetch(`${origin}/api/method/frappe.auth.get_logged_user`, { headers: { Authorization: auth, Accept: "application/json" }, redirect: "manual" }).catch(() => null);
    const who = r?.ok ? (await r.json().catch(() => ({}))).message : null;
    if (who && who !== "Guest") {
      const found = { auth, as: who };
      serviceCache.set(origin, found);
      return found;
    }
    tried.push(`${t || "(default)"}: ${r ? `HTTP ${r.status}` : "unreachable"}`);
  }
  return { tried };
}

async function erpCall(origin, auth, method, args) {
  const r = await fetch(`${origin}/api/method/${method}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(args),
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.exc_type || j.exception) {
    let msg = null;
    try {
      msg = JSON.parse(JSON.parse(j._server_messages)[0]).message;
    } catch {
      /* none */
    }
    throw Object.assign(new Error(String(msg || j.exception || `HTTP ${r.status}`).replace(/<[^>]*>/g, "").slice(0, 300)), { status: r.status });
  }
  return j.message;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const userErp = String(req.headers["x-erp-token"] || "").trim();
  const type = String(req.headers["content-type"] || "");
  if (!userErp) return res.status(401).json({ error: "Sign in again." });
  if (!/^multipart\/form-data/i.test(type)) return res.status(400).json({ error: "Send it as a form." });
  let origin;
  try {
    const url = new URL(String(req.headers["x-erp-endpoint"] || ""));
    if (!allowedErpHosts().has(url.host.toLowerCase())) throw new Error("host");
    origin = url.origin;
  } catch {
    return res.status(400).json({ error: "That ERP is not one this app talks to." });
  }
  if (!fileReaderOn()) return res.status(200).json({ skipped: "reader off" });
  const svc = await serviceFor(origin);
  if (!svc.auth) {
    console.warn("survey read-file: no working service account for", origin, svc.tried);
    return res.status(200).json({ skipped: `no working service account for this ERP (${svc.tried.join("; ") || "none set"})` });
  }
  const service = svc.auth;

  let form;
  try {
    form = await new Request("http://local/", { method: "POST", headers: { "content-type": type }, body: await rawBody(req) }).formData();
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.status === 413 ? "Too big." : "Could not read the request." });
  }
  const response = String(form.get("response") || "").slice(0, 140);
  const question = String(form.get("question") || "").slice(0, 140);
  const fileUrl = String(form.get("file_url") || "").slice(0, 500);
  if (!response || !question || !/^\/(private\/)?files\//.test(fileUrl)) return res.status(400).json({ error: "Missing response, question or file." });

  // 1. who the rep is (their own token)
  let user;
  try {
    const r = await fetch(`${origin}/api/method/frappe.auth.get_logged_user`, { headers: { Authorization: tokenHeader(userErp), Accept: "application/json" }, redirect: "manual" });
    user = (await r.json().catch(() => ({}))).message;
    if (!r.ok || !user || user === "Guest") throw new Error("login");
  } catch {
    return res.status(401).json({ error: "Sign in again." });
  }
  const base = { response, question, file_url: fileUrl, user };

  // 2. the question's schema (the ERP checks the response and the file are the rep's)
  let info;
  try {
    info = await erpCall(origin, service, "survey_ai_read", { ...base, step: "schema" });
  } catch (e) {
    return res.status(e.status === 403 || e.status === 417 ? 403 : 502).json({ error: e.message });
  }
  if (!info || info.skip || !info.schema) return res.status(200).json({ skipped: "no AI on this question" });

  // 3. read it
  const save = (read) => erpCall(origin, service, "survey_ai_read", { ...base, step: "save", read: JSON.stringify(read) });
  let read;
  try {
    read = await aiSlot(async () => {
      const text = typeof form.get("text") === "string" ? form.get("text").trim() : "";
      const pages = form.getAll("page").filter((p) => p && typeof p.arrayBuffer === "function").slice(0, 5);
      if (/\.pdf$/i.test(fileUrl)) {
        if (text) return readFile({ schema: info.schema, label: info.label, text });
        if (pages.length) return readFile({ schema: info.schema, label: info.label, jpegs: await Promise.all(pages.map(async (p) => toJpeg(Buffer.from(await p.arrayBuffer())))) });
        return { readable: false, reason: "This PDF could not be opened.", fields: {}, model: FILE_MODEL, ms: 0 };
      }
      if (!/\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp)$/i.test(fileUrl)) return null; // Word, Excel…: not read
      const f = await fetch(`${origin}${encodeURI(fileUrl).replace(/%25/g, "%")}`, { headers: { Authorization: tokenHeader(userErp) }, redirect: "manual", signal: AbortSignal.timeout(30000) });
      if (!f.ok) throw new Error(`the file could not be fetched from the ERP (HTTP ${f.status})`);
      const bytes = Buffer.from(await f.arrayBuffer());
      if (bytes.length > FILE_MAX) throw new Error("the file is over 20 MB");
      let jpeg;
      try {
        jpeg = await toJpeg(bytes);
      } catch {
        return { readable: false, reason: "This image could not be opened.", fields: {}, model: FILE_MODEL, ms: 0 };
      }
      return readFile({ schema: info.schema, label: info.label, jpegs: [jpeg] });
    });
  } catch (e) {
    // the AI failed: kept for Survey Center, the rep is not bothered
    await save({ error: String(e.message || e).slice(0, 300), model: FILE_MODEL }).catch(() => {});
    return res.status(200).json({ readable: true });
  }
  if (!read) return res.status(200).json({ skipped: "not a photo or PDF" });

  // 4. keep it on the response
  try {
    await save(read);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
  return res.status(200).json(read.readable ? { readable: true } : { readable: false, reason: read.reason });
}
