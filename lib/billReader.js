/**
 * Server-only bill reader (5 Nov 2026): Cloudflare Workers AI, System One
 * models only -- no Docling, no Laya, no verify-doc.
 *
 *   toMarkdown   the photo / PDF -> Markdown (OCR, tables, an image description)
 *   Clairic      that Markdown -> typed values with a confidence each
 *   Clef Flash   that Markdown -> the bill's title (one of TITLES)
 *
 * The models run ONCE, when the bill is attached (/api/claims/read-bill). The
 * read is signed here (HMAC) and travels with the bill; the check after the
 * bill is saved (/api/claims/check) is plain code -- compareBill -- on the
 * signed read against what the person submitted. No AI runs twice.
 *
 * ⚠️ Never import from a component: it reads CLOUDFLARE_AI_TOKEN.
 */
import crypto from "node:crypto";

const env = (name) => (process.env[name] || "").trim();
const ACCOUNT = () => env("CLOUDFLARE_ACCOUNT_ID") || "8f9bef7f528cdc6f7ddb49283821c82a";
const TOKEN = () => env("CLOUDFLARE_AI_TOKEN");
// The read's signature key: its own secret if set, else the Cloudflare token
// (server-only either way).
const SIGN_KEY = () => env("CLAIMS_READ_SECRET") || TOKEN();

export const billReaderOn = () => !!TOKEN();

/* A field is trusted only at or above this confidence (the user's rule). */
export const MIN_CONFIDENCE = 0.9;
/* Round-off on a bill (539.99 -> 540): the total may differ by this much. */
export const TOTAL_SLACK = 1;

const FIELDS = {
  vendor: { type: "text", instructions: "Name of the business that issued the bill (store, restaurant, Ola, Uber, fuel station, airline). Null if not stated." },
  gstin: { type: "text", instructions: "Vendor GSTIN (15 characters). Null if not printed." },
  bill_no: { type: "text", instructions: "Bill, invoice, receipt, CRN or booking number, copied exactly including any prefix such as CRN or INV." },
  date: { type: "date", instructions: "Date of the bill or trip. Indian format day/month/year (3/8/26 = 3 August 2026). Keep the year exactly as printed." },
  // hotel bills (the planner's stay check, 12 Nov 2026): the nights it covers
  check_in: { type: "date", instructions: "Hotel or lodge check-in / arrival date, Indian format day/month/year. Null if this is not a room stay or no arrival date is printed." },
  check_out: { type: "date", instructions: "Hotel or lodge check-out / departure date, Indian format day/month/year. Null if this is not a room stay or no departure date is printed." },
  item_names: { type: "list", items: "text", instructions: "Only lines that charge money with an amount: product, service, fare or fee lines. Exclude discounts, taxes, totals, payment lines, addresses, place names and people's names." },
  item_qty: { type: "list", items: "number", instructions: "Quantity for each charged line, same order as item_names. Use 1 if no quantity is shown." },
  item_amounts: { type: "list", items: "number", instructions: "Amount for each charged line, same order as item_names." },
  discount: { type: "number", decimals: 2, unit: "INR", instructions: "Total discount as a positive number. Null if none." },
  tax: { type: "number", decimals: 2, unit: "INR", instructions: "Total tax (GST, CGST plus SGST, IGST). Null if none." },
  total: { type: "number", decimals: 2, unit: "INR", instructions: "Final amount paid, including any rounding, handling or delivery fee and any handwritten correction." },
};

/* The bill's title on the claim (Clef picks one); "Not a bill" refuses the
   photo. Every kind is a settlement bill. Under 20 options. */
export const TITLES = {
  "Food bill": "restaurant, hotel food, meals, snacks, tea, canteen, food delivery",
  "Cab bill": "Ola, Uber, Rapido, taxi or cab ride",
  "Auto bill": "auto rickshaw ride",
  "Fuel bill": "petrol, diesel or CNG",
  "Hotel bill": "room stay or lodging",
  "Train ticket": "railway ticket",
  "Bus ticket": "bus ticket",
  "Flight ticket": "air ticket or boarding pass",
  "Toll": "highway toll or FASTag",
  "Parking": "parking fee",
  "Courier": "courier or postage",
  "Stationery": "stationery, printing or photocopy",
  "Medicine": "pharmacy or medicine",
  "Mobile recharge": "mobile or data recharge",
  "Other bill": "any other bill, receipt, ticket or invoice",
  "Not a bill": "not a bill or receipt: a selfie, a person, a product, a chat screenshot, a blank page",
};

async function cf(path, init) {
  const { signal, ...rest } = init;
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT()}${path}`, {
    ...rest,
    headers: { Authorization: `Bearer ${TOKEN()}`, ...(init.headers || {}) },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const msg = (json.errors || []).map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    throw new Error(`Cloudflare ${path.split("/").pop()}: ${msg}`);
  }
  return json.result;
}

/* The upload as it came in (multipart with a "files" part) -> Markdown. */
function run(model, input) {
  return cf(`/ai/run/@cf/cloudflare/${model}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
}

export async function toMarkdown(body, contentType) {
  const out = await cf("/ai/tomarkdown", { method: "POST", headers: { "Content-Type": contentType }, body });
  return String((Array.isArray(out) ? out[0] : out)?.data || "").trim();
}

async function markdownText(jpeg, name, signal) {
  const form = new FormData();
  form.append("files", new Blob([jpeg], { type: "image/jpeg" }), String(name || "bill").replace(/\.\w+$/, "") + ".jpg");
  const out = await cf("/ai/tomarkdown", { method: "POST", body: form, signal });
  return String((Array.isArray(out) ? out[0] : out)?.data || "").trim();
}

/* The upload (multipart, a "files" part) -> the bill's text, through
   toMarkdown always (13 Nov 2026: a faster vision transcription was tried
   side by side and dropped -- on a real, cluttered phone photo it copied the
   wrong total and date, which toMarkdown read right; speed is no use if
   Clairic and Clef are handed the wrong text). A photo is turned upright
   (EXIF) and fitted inside 1280 x 720 -- the size toMarkdown shrinks every
   image to anyway, so what it reads is the same -- and only that small JPEG
   goes to Cloudflare; a PDF goes as it came. -> { md, via, ms } */
export async function billText(body, contentType) {
  let file = null;
  try {
    file = (await new Request("http://local/", { method: "POST", headers: { "content-type": contentType }, body }).formData()).get("files");
  } catch {
    file = null;
  }
  const t0 = Date.now();
  if (file && /^image\//.test(file.type || "") && typeof file.arrayBuffer === "function") {
    try {
      const sharp = (await import("sharp")).default;
      const jpeg = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({ width: 1280, height: 720, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      return { md: await markdownText(jpeg, file.name), via: "tomarkdown-small", ms: Date.now() - t0 };
    } catch (e) {
      console.warn("bill reader: small-photo toMarkdown failed, sending the upload as it came:", e.message);
    }
  }
  return { md: await toMarkdown(body, contentType), via: "tomarkdown", ms: Date.now() - t0 };
}


/* Markdown -> { values, confidence, title, titleConfidence }. Clairic and
   Clef side by side (each well under a second warm). */
export async function readMarkdown(md) {
  const [x, c] = await Promise.all([
    run("clairic", { model: "clairic", state: md, fields: FIELDS }),
    run("clef-flash", {
      model: "clef-flash",
      state: md,
      questions: { title: { type: "choice", instructions: "What kind of expense bill is this?", criteria: TITLES } },
    }),
  ]);
  const values = {}, confidence = {};
  for (const k of Object.keys(FIELDS)) {
    const a = x?.answers?.[k] || {};
    values[k] = a.value ?? null;
    confidence[k] = typeof a.confidence === "number" ? a.confidence : null;
  }
  const t = c?.answers?.title || {};
  const notBill = t.probabilities?.["Not a bill"];
  return {
    values, confidence, title: t.choice || null, titleConfidence: typeof t.confidence === "number" ? t.confidence : null,
    billProbability: typeof notBill === "number" ? 1 - notBill : null,
  };
}

// Every key at every level, sorted (a replacer array would drop nested keys).
const canon = (o) => (Array.isArray(o) ? `[${o.map(canon).join(",")}]`
  : o && typeof o === "object" ? `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`
  : JSON.stringify(o ?? null));
export function signRead(read) {
  return crypto.createHmac("sha256", SIGN_KEY()).update(canon(read)).digest("hex");
}
export function readIsSigned(read, sig) {
  if (!read || typeof sig !== "string" || !SIGN_KEY()) return false;
  const want = Buffer.from(signRead(read), "hex"), got = Buffer.from(sig, "hex");
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/* The background check, plain code: each field the person submitted against
   the read. ok = same value AND the read's confidence >= MIN_CONFIDENCE.
   -> { ok, checks: [{ field, submitted, read, confidence, ok, why }] } */
export function compareBill(read, submitted) {
  const r = read || {}, v = r.values || {}, conf = r.confidence || {};
  // Every bill is a settlement bill (Food included, 11 Nov 2026): the third
  // check is only that the photo IS a bill -- sure = 1 - P("Not a bill").
  const isBill = typeof r.billProbability === "number" ? r.billProbability : r.titleConfidence;
  const checks = [
    {
      field: "total",
      submitted: submitted.amount,
      read: v.total,
      confidence: conf.total,
      match: typeof v.total === "number" && Math.abs(Number(submitted.amount) - v.total) <= TOTAL_SLACK,
    },
    { field: "date", submitted: submitted.date, read: v.date, confidence: conf.date, match: !!v.date && String(v.date) === String(submitted.date) },
    {
      field: "bill",
      submitted: "a bill",
      read: r.title ? (r.title === "Not a bill" ? "not a bill" : "a bill") : null,
      confidence: isBill,
      match: !!r.title && r.title !== "Not a bill",
    },
  ].map((c) => {
    const sure = typeof c.confidence === "number" && c.confidence >= MIN_CONFIDENCE;
    const ok = c.match && sure;
    const why = ok ? null
      : c.field === "bill" ? (c.match ? `not sure the photo is a bill (${Math.round((c.confidence || 0) * 100)}%)` : "the photo does not look like a bill")
      : !c.match ? (c.read == null ? `the bill's ${c.field.replace("_", " ")} could not be read` : `${c.field.replace("_", " ")} on the bill is ${c.read}, entered ${c.submitted}`)
      : `the ${c.field.replace("_", " ")} read is not sure enough (${Math.round((c.confidence || 0) * 100)}%)`;
    return { ...c, ok, why };
  });
  return { ok: checks.every((c) => c.ok), checks };
}
