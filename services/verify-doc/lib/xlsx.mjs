/* Excel (.xlsx) to plain text tables, with no dependencies. An .xlsx is a ZIP
 * of XML parts; this reads the ZIP directory, inflates the parts it needs
 * (workbook, shared strings, each sheet) and writes every sheet out as
 * tab-separated rows. The cells are then exact -- the model only has to
 * understand the layout, not read pixels.
 *
 * Limits: values only (no formulas, styles or merged cells); date cells come
 * out as Excel serial numbers, which parse.mjs understands. */

import { inflateRawSync } from "node:zlib";

const MAX_ROWS_PER_SHEET = 2000;
const MAX_COLS = 60;

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file (no ZIP directory).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Corrupt .xlsx directory.");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    files.set(name, { method, size, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return (name) => {
    const f = files.get(name);
    if (!f) return null;
    const start = f.local + 30 + buf.readUInt16LE(f.local + 26) + buf.readUInt16LE(f.local + 28);
    const data = buf.subarray(start, start + f.size);
    if (f.method === 0) return data.toString("utf8");
    if (f.method === 8) return inflateRawSync(data).toString("utf8");
    throw new Error(`Unsupported .xlsx compression (${f.method}).`);
  };
}

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

const texts = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

function colIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] || "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function xlsxToText(buf) {
  const read = unzip(buf);
  const shared = [];
  const sst = read("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(texts(m[1]));

  const workbook = read("xl/workbook.xml") || "";
  const rels = read("xl/_rels/workbook.xml.rels") || "";
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1], /Target="([^"]+)"/.exec(m[0])?.[1]]));
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: decode(/name="([^"]*)"/.exec(m[0])?.[1] || "Sheet"),
    path: (() => {
      const t = target.get(/r:id="([^"]+)"/.exec(m[0])?.[1]) || "";
      return t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
    })(),
  }));

  const out = [];
  for (const sheet of sheets) {
    const xml = read(sheet.path);
    if (!xml) continue;
    const lines = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (lines.length >= MAX_ROWS_PER_SHEET) break;
      const cells = [];
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const body = c[2] || "";
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const idx = ref ? colIndex(ref) : cells.length;
        if (idx >= MAX_COLS) continue;
        const type = /t="([^"]+)"/.exec(attrs)?.[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value = "";
        if (type === "s") value = shared[+v] ?? "";
        else if (type === "inlineStr") value = texts(body);
        else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
        else value = v != null ? decode(v) : "";
        cells[idx] = value.replace(/[\t\r\n]+/g, " ").trim();
      }
      if (cells.some((x) => x)) lines.push(Array.from(cells, (x) => x ?? "").join("\t"));
    }
    if (lines.length) out.push(`### Sheet: ${sheet.name}\n${lines.join("\n")}`);
  }
  if (!out.length) throw new Error("The spreadsheet has no data.");
  return out.join("\n\n");
}
