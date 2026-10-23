/* multipart/form-data, for callers that send the file itself (Postman's
 * form-data, an HTML form):
 *
 *   file      one or more file parts -- each becomes a document
 *   request   a text part holding the JSON body ({ fields, rules, context,
 *             bands }, documents optional -- the files are added to it)
 *
 * Small and strict: no streaming (the body is already size-capped), parts
 * split on the boundary from the Content-Type header. */

import { DocError } from "./documents.mjs";

export function isMultipart(contentType) {
  return /^multipart\/form-data/i.test(String(contentType || ""));
}

export function parseMultipart(buf, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!boundary) throw new DocError("form-data without a boundary.");
  const delim = Buffer.from("--" + (boundary[1] || boundary[2]).trim());
  const parts = [];
  let pos = buf.indexOf(delim);
  while (pos >= 0) {
    let start = pos + delim.length;
    if (buf.slice(start, start + 2).toString() === "--") break; // closing delimiter
    if (buf.slice(start, start + 2).toString() === "\r\n") start += 2;
    const next = buf.indexOf(delim, start);
    if (next < 0) break;
    const part = buf.slice(start, next - 2); // drop the CRLF before the next delimiter
    const split = part.indexOf("\r\n\r\n");
    if (split >= 0) {
      const head = part.slice(0, split).toString("utf8");
      const data = part.slice(split + 4);
      const disp = /content-disposition:[^\r\n]*/i.exec(head)?.[0] || "";
      parts.push({
        name: /\bname="([^"]*)"/i.exec(disp)?.[1] || "",
        filename: /\bfilename="([^"]*)"/i.exec(disp)?.[1] || null,
        type: /content-type:\s*([^\r\n;]+)/i.exec(head)?.[1]?.trim() || "",
        data,
      });
    }
    pos = next;
  }
  return parts;
}

/* form-data -> the same JSON body /v1/verify takes. */
export function bodyFromMultipart(buf, contentType) {
  const parts = parseMultipart(buf, contentType);
  const reqPart = parts.find((p) => p.filename == null && p.name === "request");
  let body = {};
  if (reqPart) {
    try {
      body = JSON.parse(reqPart.data.toString("utf8"));
    } catch {
      throw new DocError('The "request" part is not valid JSON.');
    }
  }
  const files = parts.filter((p) => p.filename != null && p.data.length);
  body.documents = [
    ...(Array.isArray(body.documents) ? body.documents : []),
    ...files.map((f) => ({ data: f.data.toString("base64"), mimeType: f.type, name: f.filename })),
  ];
  return body;
}
