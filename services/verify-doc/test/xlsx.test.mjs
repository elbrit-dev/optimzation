import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { xlsxToText } from "../lib/xlsx.mjs";

/* A minimal ZIP writer, just enough to build an .xlsx in memory. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const data = deflateRawSync(Buffer.from(text));
    const raw = Buffer.from(text);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test("reads shared strings, numbers and inline strings by sheet", () => {
  const buf = zip({
    "xl/workbook.xml": '<workbook><sheets><sheet name="Sept &amp; stock" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": "<sst><si><t>Item</t></si><si><t>Sales</t></si><si><r><t>AURA </t></r><r><t>10 TAB</t></r></si></sst>",
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>120</v></c></row>' +
      '<row r="3"><c r="A3" t="inlineStr"><is><t>ZEFRA</t></is></c><c r="B3"><v>30</v></c></row></sheetData></worksheet>',
  });
  const text = xlsxToText(buf);
  assert.equal(text, "### Sheet: Sept & stock\nItem\tSales\nAURA 10 TAB\t\t120\nZEFRA\t30");
});

test("refuses things that are not spreadsheets", () => {
  assert.throws(() => xlsxToText(Buffer.from("hello")), /not a valid/i);
});
