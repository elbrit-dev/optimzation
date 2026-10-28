/* OCR before the model reads: Docling (Elbrit's own converter on Google Cloud,
 * project elbrit-services) turns a photo or PDF into clean Markdown text.
 *
 *   OCR_MODE=vision   (default) the model looks at the image itself
 *   OCR_MODE=docling  the model gets ONLY Docling's text -- cheaper tokens,
 *                     the picture stays in our cloud; weaker on handwriting
 *   OCR_MODE=both     Docling's text AND the image -- the model uses the text
 *                     and can still check the picture (handwritten additions)
 *
 * Spreadsheets / CSV are already text and skip Docling. If Docling fails or
 * times out (its GPU sleeps when idle: the first call can take 1-2 minutes),
 * the image is used as it is -- a check never fails because OCR did. */

import { config } from "./config.mjs";

/* Docling's own layout, as lines: every text piece it read (json_content.texts,
 * also those it filed under a picture -- md_content drops them), grouped into
 * rows by where they sit on the page, left to right. A receipt's "CASH" and
 * "950.00" share a row; md_content lists them apart, with the till line between. */
export function rowsFromDocling(js) {
  const items = [];
  for (const t of js?.texts || []) {
    const p = t.prov?.[0];
    const b = p?.bbox;
    const text = String(t.text || "").trim();
    if (!text || !b) continue;
    const up = b.coord_origin === "TOPLEFT" ? -1 : 1;     // make bigger = higher on the page
    const y1 = up * b.t, y2 = up * b.b;
    items.push({ text, l: b.l, top: Math.max(y1, y2), bot: Math.min(y1, y2), page: p.page_no || 1 });
  }
  items.sort((a, b) => a.page - b.page || b.top - a.top);
  const rows = [];
  for (const it of items) {
    const h = it.top - it.bot;
    // Same row as the row's first piece (not any piece: slanted photos would chain rows).
    const row = rows.find((r) => r.page === it.page && ((o) => Math.min(o.top, it.top) - Math.max(o.bot, it.bot) >= 0.5 * Math.min(h, o.top - o.bot))(r.items[0]));
    if (row) row.items.push(it);
    else rows.push({ page: it.page, items: [it] });
  }
  const topOf = (r) => Math.max(...r.items.map((i) => i.top));
  rows.sort((a, b) => a.page - b.page || topOf(b) - topOf(a));
  return rows.map((r) => r.items.sort((a, b) => a.l - b.l).map((i) => i.text).join("  ")).join("\n");
}

/* One document -> Docling's text: its rows (above) when it sends its JSON,
 * else its markdown. */
export async function doclingMarkdown(doc, { fetchImpl = fetch } = {}) {
  const form = new FormData();
  form.append("files", new Blob([Buffer.from(doc.data, "base64")], { type: doc.mimeType }), doc.name || "document");
  form.append("to_formats", "md");
  form.append("to_formats", "json");
  form.append("do_ocr", "true");
  const res = await fetchImpl(`${config.doclingUrl}/v1/convert/file`, {
    method: "POST",
    headers: { "X-Api-Key": config.doclingKey },
    body: form,
    signal: AbortSignal.timeout(config.doclingTimeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status !== "success") throw new Error(`Docling answered ${res.status} ${json.status || ""} ${json.detail || ""}`.trim());
  return (rowsFromDocling(json.document?.json_content) || String(json.document?.md_content || "")).trim();
}

/* documents as loadDocuments made them -> what the model will be given. */
/* `vision` from the caller skips Docling for that request only (a quick read
 * while someone waits: Docling's sleeping GPU can add 30-75 s). */
export async function applyOcr(documents, deps = {}, only) {
  const mode = only === "vision" ? "vision" : config.ocrMode;
  if (mode === "vision" || !config.doclingKey) return { documents, ocr: null };
  const out = [];
  const used = [];
  const texts = [];
  for (const d of documents) {
    if (d.kind !== "media") {
      out.push(d);
      continue;
    }
    try {
      const md = await doclingMarkdown(d, deps);
      if (!md) throw new Error("Docling found no text");
      const text = { kind: "text", name: `${d.name} (OCR text)`, text: md };
      if (mode === "both") out.push(text, d);
      else out.push(text);
      used.push({ document: d.name, chars: md.length });
      texts.push(documents.length > 1 ? `### ${d.name}\n${md}` : md);
    } catch (e) {
      console.warn(JSON.stringify({ at: "ocr", document: d.name, error: e.message }));
      out.push(d); // fall back to the image
      used.push({ document: d.name, error: e.message });
    }
  }
  // text: what Docling extracted, returned to the caller (capped) so it can be
  // seen and kept -- the claims check stores it in the row's bill details.
  return { documents: out, ocr: { mode, docling: used, text: texts.join("\n\n").slice(0, 20000) || null } };
}

/* Wake Docling ahead of a read (POST /v1/warm, sent when a bill form opens):
 * its GPU sleeps when idle and takes 30-75 s to start, so starting it while
 * the person takes the photo hides most of that. Any request starts it; one
 * wake-up per few minutes is enough, and nothing waits on it. */
let warmAt = 0;
export function wakeDocling({ fetchImpl = fetch } = {}) {
  if (!config.doclingKey || Date.now() - warmAt < 5 * 60 * 1000) return false;
  warmAt = Date.now();
  fetchImpl(`${config.doclingUrl}/health`, { headers: { "X-Api-Key": config.doclingKey }, signal: AbortSignal.timeout(config.doclingTimeoutMs) })
    .then((r) => console.log(JSON.stringify({ at: "warm", status: r.status, ms: Date.now() - warmAt })))
    .catch((e) => {
      warmAt = 0;
      console.warn(JSON.stringify({ at: "warm", error: e.message }));
    });
  return true;
}
