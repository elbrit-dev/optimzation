/* Getting the documents a caller sent into something the model can read.
 *
 *   { url, headers? }            fetched over https from an allowed host only
 *                                (ALLOWED_DOC_HOSTS); `headers` may carry an
 *                                Authorization for private files (an ERP
 *                                token) and nothing else; redirects refused
 *   { data, mimeType, name? }    base64 bytes sent in the request
 *
 * Photos and PDFs go to the model as they are. Spreadsheets (.xlsx) and
 * CSV/text are turned into text first (xlsx.mjs), so their numbers are read
 * exactly rather than looked at. Nothing is stored. */

import { config } from "./config.mjs";
import { xlsxToText } from "./xlsx.mjs";

export class DocError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const MEDIA = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "application/pdf"]);
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TEXT = new Set(["text/csv", "text/plain", "text/tab-separated-values"]);

function sniff(buf, declared, name) {
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.subarray(4, 12).toString("latin1").startsWith("ftyphei") || buf.subarray(4, 12).toString("latin1").startsWith("ftypmif")) return "image/heic";
  if (buf[0] === 0x50 && buf[1] === 0x4b) return XLSX;
  const ext = String(name || "").split("?")[0].split(".").pop().toLowerCase();
  if (ext === "csv") return "text/csv";
  if (ext === "tsv") return "text/tab-separated-values";
  const d = String(declared || "").split(";")[0].trim().toLowerCase();
  if (TEXT.has(d)) return d;
  if (ext === "txt") return "text/plain";
  return d || "application/octet-stream";
}

function hostAllowed(host) {
  const h = host.toLowerCase();
  return config.allowedHosts.some((a) => h === a || (a.startsWith(".") && h.endsWith(a)));
}

async function fetchUrl(doc) {
  let u;
  try {
    u = new URL(doc.url);
  } catch {
    throw new DocError(`Not a valid URL: ${doc.url}`);
  }
  if (u.protocol !== "https:") throw new DocError("Documents must be fetched over https.");
  if (!hostAllowed(u.hostname)) throw new DocError(`Host ${u.hostname} is not allowed. Send the file as data, or ask for the host to be added.`);
  const headers = {};
  const auth = doc.headers?.Authorization || doc.headers?.authorization;
  if (auth) headers.Authorization = String(auth);
  const res = await fetch(u, { headers, redirect: "manual", signal: AbortSignal.timeout(config.fetchTimeoutMs) });
  if (res.status >= 300 && res.status < 400) throw new DocError(`${u.pathname}: the host redirected (often a login page) -- check the access token.`, 422);
  if (!res.ok) throw new DocError(`${u.pathname}: the host answered HTTP ${res.status}.`, 422);
  const type = res.headers.get("content-type") || "";
  if (type.includes("text/html")) throw new DocError(`${u.pathname}: the host sent a web page, not a file.`, 422);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > config.maxDocBytes) throw new DocError(`${u.pathname} is larger than ${config.maxDocBytes / 1048576} MB.`, 413);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, declared: type, name: decodeURIComponent(u.pathname.split("/").pop() || "") };
}

/* -> [{ kind: "media", mimeType, data(base64), name } | { kind: "text", text, name }] */
export async function loadDocuments(list) {
  if (!Array.isArray(list) || !list.length) throw new DocError("Send at least one document.");
  if (list.length > config.maxDocs) throw new DocError(`At most ${config.maxDocs} documents per request.`);
  const out = [];
  for (const [i, doc] of list.entries()) {
    let buf;
    let declared;
    let name = doc.name;
    if (doc.url) {
      const got = await fetchUrl(doc);
      buf = got.buf;
      declared = got.declared;
      name = name || got.name;
    } else if (doc.data) {
      buf = Buffer.from(String(doc.data), "base64");
      declared = doc.mimeType;
    } else throw new DocError(`Document ${i + 1} has neither url nor data.`);
    if (!buf.length) throw new DocError(`Document ${i + 1} is empty.`, 422);
    if (buf.length > config.maxDocBytes) throw new DocError(`Document ${i + 1} is larger than ${config.maxDocBytes / 1048576} MB.`, 413);
    const mime = sniff(buf, declared, name);
    const label = name || `document ${i + 1}`;
    if (MEDIA.has(mime)) out.push({ kind: "media", mimeType: mime, data: buf.toString("base64"), name: label });
    else if (mime === XLSX) {
      try {
        out.push({ kind: "text", text: xlsxToText(buf), name: label });
      } catch (e) {
        throw new DocError(`${label}: ${e.message}`, 422);
      }
    } else if (TEXT.has(mime)) out.push({ kind: "text", text: buf.toString("utf8").slice(0, 400000), name: label });
    else throw new DocError(`${label}: ${mime} is not supported. Send a photo, PDF, .xlsx or CSV.`, 415);
  }
  return out;
}
