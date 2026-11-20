/**
 * Server-only bill reader (5 Nov 2026): Cloudflare Workers AI, System One
 * models only -- no Docling, no Laya, no verify-doc.
 *
 *   Gemma 4      the bill -> its few fields as a small JSON, thinking always
 *                off (16 Nov 2026; was toMarkdown): a photo, a PDF's own text
 *                (copied out in the browser) or a scanned PDF's page pictures
 *   (code)       that answer -> typed values (20 Nov 2026: read in plain
 *                code, dates by lib/billDates.js -- see readMarkdown)
 *   Clairic      only for a value the code cannot place, at most 15 s
 *   Clef Flash   that answer -> the bill's title (one of TITLES)
 *
 * The models run ONCE, when the bill is attached (/api/claims/read-bill). The
 * read is signed here (HMAC) and travels with the bill; the check after the
 * bill is saved (/api/claims/check) is plain code -- compareBill -- on the
 * signed read against what the person submitted. No AI runs twice.
 *
 * ⚠️ Never import from a component: it reads CLOUDFLARE_AI_TOKEN.
 */
import crypto from "node:crypto";
import { billDate } from "./billDates";

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

/* Only what a bill is checked on (16 Nov 2026) -- the trip rules (type, date,
   a hotel's nights, total), the duplicate fingerprint (GSTIN or vendor, bill
   no, date, total) and the claim row. Item lines, tax and discount were read
   too and nothing used them; dropping them is what makes a read fast. Each
   kind of bill needs:
     hotel  vendor, bill_no, check_in, check_out, total (date = the bill date,
            else the check-out date)
     food   vendor, bill_no, date, total
     fuel   vendor (the pump), bill_no, date, total
     toll   vendor (the plaza), bill_no, date, total
   gstin wherever it is printed. */
const FIELDS = {
  vendor: { type: "text", instructions: "Name of the business that issued the bill (hotel, restaurant, fuel station, toll plaza, Ola, Uber, airline). Null if not stated." },
  gstin: { type: "text", instructions: "Vendor GSTIN (15 characters). Null if not printed." },
  bill_no: { type: "text", instructions: "Bill, invoice, receipt, CRN or booking number, copied exactly including any prefix such as CRN or INV." },
  date: { type: "date", instructions: "Date of the bill or trip; for a hotel bill with no separate bill date, the check-out date. Indian format day/month/year. Keep the year exactly as printed." },
  // hotel bills (the planner's stay check, 12 Nov 2026): the nights it covers
  check_in: { type: "date", instructions: "Hotel or lodge check-in / arrival date, Indian format day/month/year. Null if this is not a room stay or no arrival date is printed." },
  check_out: { type: "date", instructions: "Hotel or lodge check-out / departure date, Indian format day/month/year. Null if this is not a room stay or no departure date is printed." },
  total: { type: "number", decimals: 2, unit: "INR", instructions: "Final amount paid -- the grand total, including any rounding, handling or delivery fee and any handwritten correction; not the cash received or the balance returned." },
};

/* the read's dates, placed in code from Gemma's copy (readMarkdown) */
const DATE_FIELDS = ["date", "check_in", "check_out"];

/* The bill's title on the claim; "Not a bill" refuses the photo. Every kind
   is a settlement bill. Under 20 options. Clef is asked to pick one, but
   since 16 Nov 2026 the TYPE is Gemma's (GEMMA_KIND, see readMarkdown). */
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

function run(model, input) {
  return cf(`/ai/run/@cf/cloudflare/${model}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
}

/* A photo read by Gemma 4 (16 Nov 2026): toMarkdown took 14-30 s a photo.
   Gemma 4 writes back only the bill's few fields as a small JSON -- the same
   structure for every bill, with what each kind needs (FIELDS) -- which
   Clairic and Clef then score. 2-4 s a bill (writing out every item line, as
   it did first, took 3-10 s); every total, date, hotel night and type right
   on the 38 planner test bills, the 7 hard bench bills (faint, blurry,
   handwritten, Tamil) and a real faded biryani receipt (grand total 2810,
   not the 2790 received).
   THINKING IS ALWAYS OFF (enable_thinking: false): with it on, Gemma spends
   its whole answer reasoning and hands back no text. Every answer is checked
   strictly -- any reasoning in it, an answer cut short, or no text at all is
   a failed read (the bill is refused, "try again"); there is no fallback. */
const GEMMA = "@cf/google/gemma-4-26b-a4b-it";
const GEMMA_PROMPT = [
  "Read this bill and answer with only this JSON, values copied exactly as printed (null when not printed):",
  '{"kind": "hotel | food | fuel | toll | cab | auto | train | bus | flight | other | not a bill",',
  ' "vendor": "who issued it", "gstin": "vendor GSTIN", "bill_no": "bill / invoice / receipt number",',
  ' "date": "bill date", "check_in": "hotel check-in date", "check_out": "hotel check-out date", "total": 0,',
  ' "handwritten": false}',
  "What each kind needs:",
  "- hotel: vendor, bill_no, check_in, check_out, total; date = the bill date, else the check-out date",
  "- food: vendor, bill_no, date, total",
  "- fuel: vendor (the fuel station), bill_no, date, total",
  "- toll: vendor (the toll plaza), bill_no, date, total",
  "- any other bill: vendor, bill_no, date, total",
  "total is the grand total paid: with any handling or delivery fee and any handwritten correction; never the sub-total, the cash received or the balance returned.",
  "handwritten is true when the bill's amounts or items are written by hand with a pen -- even on a printed bill book or letterhead; false for a machine-printed, thermal-printed or computer-made bill.",
  "Dates as printed (Indian day/month/year). Do not calculate or guess anything.",
].join("\n");
/* What Gemma is given -- one of:
     jpegs  one photo, or a scanned PDF's pages in order (all in one request)
     text   a PDF's own text, copied out in the browser (pdf.js) -- exact, so
            nothing is guessed from a picture (16 Nov 2026: 18/18 test reads
            right, 2-4 s; Gemma on a picture of a text PDF misread bill numbers) */
async function gemmaText({ jpegs = [], text = "" }) {
  const intro = text
    ? GEMMA_PROMPT.replace("Read this bill", "Read this bill (the text copied out of a PDF bill, below)") + `\n\n--- the bill's text ---\n${text}`
    : jpegs.length > 1 ? `${GEMMA_PROMPT}\nThe ${jpegs.length} pictures are the pages of one bill, in order.` : GEMMA_PROMPT;
  const out = await cf(`/ai/run/${GEMMA}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: [
        { type: "text", text: intro },
        ...jpegs.map((j) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${j.toString("base64")}` } })),
      ] }],
      max_tokens: 400,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  const choice = out?.choices?.[0] || {};
  const reasoning = choice.message?.reasoning_content;
  const answer = String(choice.message?.content ?? out?.response ?? "").trim();
  if (reasoning) throw new Error("Cloudflare gemma: answered with thinking on");
  if (choice.finish_reason && choice.finish_reason !== "stop") throw new Error(`Cloudflare gemma: answer cut short (${choice.finish_reason})`);
  if (!answer) throw new Error("Cloudflare gemma: no text");
  return answer;
}

/* An image upload -> the small upright JPEG Gemma 4 is sent. */
async function gemmaJpeg(file) {
  const sharp = (await import("sharp")).default;
  return sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}

/* At most this many page pictures of a PDF are read (the browser sends no
   more), and this much of its text. */
const PDF_PAGES = 5;
const PDF_TEXT_MAX = 20000;

/* The upload -> the bill read by Gemma 4. Multipart:
     files  the bill (a photo or a PDF; stored by the route, not read here
            when it is a PDF)
     text   a PDF's own text, copied out in the browser
     page   a scanned PDF's pages as JPEGs (only when the PDF has no text)
   One AI for step 1 (16 Nov 2026; toMarkdown is gone):
     a photo        upright (EXIF), inside 1280 x 1280 -> Gemma 4
     a text PDF     its text -> Gemma 4
     a scanned PDF  its page pictures, all in one request -> Gemma 4
   A PDF that came with neither (the browser could not open it) is refused:
   take a photo of the bill instead. -> { md, via, ms } */
export async function billText(body, contentType) {
  let form = null;
  try {
    form = await new Request("http://local/", { method: "POST", headers: { "content-type": contentType }, body }).formData();
  } catch {
    form = null;
  }
  const isFile = (f) => f && typeof f.arrayBuffer === "function";
  const file = form?.get("files");
  const t0 = Date.now();
  if (isFile(file) && /^image\//.test(file.type || "")) {
    return { md: await gemmaText({ jpegs: [await gemmaJpeg(file)] }), via: "gemma-4", ms: Date.now() - t0 };
  }
  const text = typeof form?.get("text") === "string" ? form.get("text").trim().slice(0, PDF_TEXT_MAX) : "";
  if (text) return { md: await gemmaText({ text }), via: "gemma-4-pdf-text", ms: Date.now() - t0 };
  const pages = (form?.getAll("page") || []).filter((p) => isFile(p) && /^image\//.test(p.type || "")).slice(0, PDF_PAGES);
  if (pages.length) return { md: await gemmaText({ jpegs: await Promise.all(pages.map(gemmaJpeg)) }), via: "gemma-4-pdf-pages", ms: Date.now() - t0 };
  throw Object.assign(new Error("This PDF could not be opened to read — take a photo of the bill instead."), { status: 422 });
}

/* Gemma's "kind" -> the title (TITLES) */
const GEMMA_KIND = {
  hotel: "Hotel bill", food: "Food bill", fuel: "Fuel bill", toll: "Toll", cab: "Cab bill", auto: "Auto bill",
  train: "Train ticket", bus: "Bus ticket", flight: "Flight ticket", other: "Other bill", "not a bill": "Not a bill",
};

/* Gemma's own answer, as JSON (it may come in a ```json fence) -> {} when it
   is not JSON. */
function gemmaJson(md) {
  const s = String(md || "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return {};
  try {
    return JSON.parse(s.slice(a, b + 1)) || {};
  } catch {
    return {};
  }
}

/* Gemma's answer, field by field, in plain code (20 Nov 2026) -- what
   Clairic used to do. Text as Gemma copied it; the total as a number ("Rs.
   2,525.00" too); the dates by lib/billDates.js. A field Gemma left out is
   null; one Gemma gave but the code cannot place is `undefined` -- only
   those go to Clairic. */
const blank = (x) => x == null || (typeof x === "string" && /^\s*(null|none|n\/a|-)?\s*$/i.test(x));
function gemmaField(k, x) {
  if (blank(x)) return null;
  if (DATE_FIELDS.includes(k)) return billDate(x) || undefined;
  if (FIELDS[k].type === "number") {
    if (typeof x === "number") return Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : undefined;
    const m = String(x).replace(/rs\.?|inr|₹|\/-|,|\s/gi, "").match(/^\d+(\.\d+)?$/);
    return m ? Math.round(Number(m[0]) * 100) / 100 : undefined;
  }
  return typeof x === "string" || typeof x === "number" ? String(x).trim() : undefined;
}

/* Clairic, for the few fields the code could not place: bounded, so a slow
   Clairic leaves them unread (the rep enters the bill) instead of holding
   the read -- tested 20 Nov 2026: 2-108 s a call, 6 at once. */
const CLAIRIC_WAIT = 15000;

/* Gemma's answer -> { values, confidence, title, titleConfidence,
   billProbability, handwritten }.
   THE VALUES ARE READ IN CODE (20 Nov 2026) from Gemma's JSON, each at
   confidence 1 -- Gemma is what reads the photo; Clairic only re-read
   Gemma's own text, and
     - gave no date at all when the day is 12 or less (01/10/2026, 3/10/26,
       12/10/2026 -- the day and month could be swapped; 25/10/2026 read),
       so every printed bill dated 1-12 of a month went to hand entry, and
       once read 3/10/26 as 3 August;
     - took 2-108 s a call (6 at once), past the 60 s limit at times, while
       Gemma took 1-5 s and Clef 0.2 s.
   Clairic is asked only for a field the code cannot place, or for all of
   them when Gemma's answer is not JSON (as before). Clef still runs beside
   it (the "is it a bill" check, below). `handwritten` straight from Gemma's
   JSON (16 Nov 2026: every handwritten bill is entered by hand, with the
   payment proof and the reason -- bill-rules.js). */
export async function readMarkdown(md) {
  const g = gemmaJson(md);
  const isJson = Object.keys(g).length > 0;
  const values = {}, confidence = {}, ask = {};
  for (const k of Object.keys(FIELDS)) {
    const v = isJson ? gemmaField(k, g[k]) : undefined;
    if (v === undefined) {
      ask[k] = FIELDS[k];
      values[k] = null;
      confidence[k] = null;
    } else {
      values[k] = v;
      confidence[k] = 1;
    }
  }
  const [x, c] = await Promise.all([
    Object.keys(ask).length
      ? cf("/ai/run/@cf/cloudflare/clairic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "clairic", state: md, fields: ask }),
          signal: isJson ? AbortSignal.timeout(CLAIRIC_WAIT) : undefined,
        }).catch((e) => {
          if (!isJson) throw e;
          console.warn("bill reader: Clairic did not answer for", Object.keys(ask).join(", "), "-", e?.message || e);
          return null;
        })
      : null,
    run("clef-flash", {
      model: "clef-flash",
      state: md,
      questions: { title: { type: "choice", instructions: "What kind of expense bill is this?", criteria: TITLES } },
    }),
  ]);
  for (const k of Object.keys(ask)) {
    const a = x?.answers?.[k] || {};
    values[k] = a.value ?? null;
    confidence[k] = typeof a.confidence === "number" ? a.confidence : null;
  }
  const t = c?.answers?.title || {};
  const notBill = typeof t.probabilities?.["Not a bill"] === "number" ? t.probabilities["Not a bill"] : null;
  /* THE TYPE IS GEMMA'S (16 Nov 2026): Gemma sees the bill; Clef sees only
     Gemma's answer and goes by words -- "HOTEL SRI KANNAPPA" (a dinner thali,
     Gemma: food 10/10) was a "Hotel bill" to Clef 4 times in 10, and 10/10
     once its options were spelled out. Clef still says how sure it is that
     this IS a bill: the type's confidence is 1 - P("Not a bill") (P itself
     when Gemma says it is not a bill), so a disagreement between the two
     comes out unsure and goes to hand entry, never through. No kind from
     Gemma -> Clef's own pick, as before. */
  const kind = GEMMA_KIND[String(g.kind || "").trim().toLowerCase()] || null;
  const title = kind || t.choice || null;
  const titleConfidence = kind && notBill != null ? (kind === "Not a bill" ? notBill : 1 - notBill)
    : typeof t.confidence === "number" ? t.confidence : null;
  return {
    values, confidence, title, titleConfidence,
    billProbability: notBill != null ? 1 - notBill : null,
    clefTitle: t.choice || null,
    handwritten: g.handwritten === true,
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
