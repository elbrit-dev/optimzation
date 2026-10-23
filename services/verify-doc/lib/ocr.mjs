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

export async function doclingMarkdown(doc, { fetchImpl = fetch } = {}) {
  const form = new FormData();
  form.append("files", new Blob([Buffer.from(doc.data, "base64")], { type: doc.mimeType }), doc.name || "document");
  form.append("to_formats", "md");
  form.append("do_ocr", "true");
  const res = await fetchImpl(`${config.doclingUrl}/v1/convert/file`, {
    method: "POST",
    headers: { "X-Api-Key": config.doclingKey },
    body: form,
    signal: AbortSignal.timeout(config.doclingTimeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status !== "success") throw new Error(`Docling answered ${res.status} ${json.status || ""} ${json.detail || ""}`.trim());
  return String(json.document?.md_content || "").trim();
}

/* documents as loadDocuments made them -> what the model will be given. */
export async function applyOcr(documents, deps = {}) {
  const mode = config.ocrMode;
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
