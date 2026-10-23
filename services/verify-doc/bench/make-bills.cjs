/* Draws the benchmark bills (bench/bills/*) with a headless browser.
 * Fictional shops and numbers; the right answers are in bills.json.
 *   node bench/make-bills.cjs   (needs patchright -- see PATCHRIGHT below) */
const path = require("path");
const os = require("os");
const fs = require("fs");
const { pathToFileURL } = require("url");

const PATCHRIGHT = process.env.PATCHRIGHT || (() => {
  const ext = path.join(os.homedir(), ".vscode/extensions");
  const d = fs.readdirSync(ext).filter((x) => x.startsWith("danielsanmedium.dscodegpt-")).sort().pop();
  return path.join(ext, d, "standalone/node_modules/patchright");
})();
const { chromium } = require(PATCHRIGHT);

const OUT = path.join(__dirname, "bills");
const mono = "'Courier New',monospace";
const page = (inner, { tilt = -1, filter = "", bg = "#fffdf7", font = mono, width = 340 } = {}) => `<html><body style="margin:0;background:#d9d4ca;display:flex;justify-content:center;padding:28px">
<div style="width:${width}px;background:${bg};padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.3);transform:rotate(${tilt}deg);filter:${filter};color:#222;font:13px/1.5 ${font}">${inner}</div></body></html>`;
const hr = `<hr style="border:0;border-top:1px dashed #666">`;

const BILLS = {
  "01-fuel-clean.jpg": page(`<div style="text-align:center;font-weight:bold;font-size:16px">HINDUSTAN PETROLEUM</div>
<div style="text-align:center">SRI MURUGAN FUELS<br>GST Rd, Guindy, Chennai - 600032</div>${hr}
<div>Bill No : 004517 &nbsp; Pump : 03</div><div>Date : 20/10/2026 &nbsp;Time : 18:42</div>${hr}
<div>Product : PETROL</div><div>Rate/Ltr : Rs. 101.25</div><div>Volume : 4.44 Ltr</div>${hr}
<div style="font-size:16px;font-weight:bold">TOTAL AMOUNT : Rs. 450.00</div><div>Mode : UPI</div>`),

  "02-restaurant-gst.jpg": page(`<div style="text-align:center;font-weight:bold;font-size:16px">HOTEL SARAVANA BHAVAN</div>
<div style="text-align:center">Anna Nagar, Chennai</div>${hr}<div>Bill : 2231 &nbsp; Table : 7 &nbsp; Date: 18-10-2026</div>${hr}
<div>2 x Mini Meals ........ 380.00</div><div>2 x Ghee Roast ........ 260.00</div><div>3 x Filter Coffee ..... 180.00</div>${hr}
<div>Sub Total ............. 820.00</div><div>CGST 2.5% ............. 20.50</div><div>SGST 2.5% ............. 20.50</div>${hr}
<div style="font-size:16px;font-weight:bold">GRAND TOTAL : ₹ 861.00</div><div>Thank you! Visit again</div>`, { tilt: 1.2 }),

  "03-toll-faint.jpg": page(`<div style="text-align:center;font-weight:bold">NATIONAL HIGHWAYS AUTHORITY OF INDIA</div>
<div style="text-align:center">Toll Plaza: Paranur (NH-45)</div>${hr}<div>Ticket No: 88123917</div><div>Vehicle: TN09BX4471 &nbsp; Class: Car/Jeep</div>
<div>Journey: Single</div><div>Date/Time: 19-OCT-2026 07:12</div>${hr}<div style="font-weight:bold">Toll Fee : Rs 65/-</div><div>Paid via FASTag</div>`,
  { tilt: 4, filter: "contrast(.55) brightness(1.12)", width: 280 }),

  "04-cab-handwritten.jpg": page(`<div style="font-size:20px;text-align:center">RECEIPT</div>
<div style="margin-top:10px">Recd from: Mr. Sanjay</div><div>Trip: Guindy &rarr; Tambaram</div><div>Vehicle: TN 22 AK 9087 (Auto)</div>
<div style="margin-top:10px;font-size:22px">Rs 300/-</div><div>(Rupees Three Hundred only)</div><div style="margin-top:10px">Date: 17/10/26</div>
<div style="margin-top:16px;text-align:right">Sign: Murali</div>`,
  { tilt: -2.5, bg: "#f6f1df", font: "'Segoe Script','Comic Sans MS',cursive" }),

  "05-food-tamil.jpg": page(`<div style="text-align:center;font-weight:bold;font-size:16px">ஸ்ரீ அன்னபூர்ணா உணவகம்</div>
<div style="text-align:center">காஞ்சிபுரம்</div>${hr}<div>பில் எண்: 1188 &nbsp; தேதி: 16/10/2026</div>${hr}
<div>சாப்பாடு x 2 ......... 180</div><div>வடை x 2 ............. 40</div><div>டீ x 2 ............... 20</div>${hr}
<div style="font-size:16px;font-weight:bold">மொத்தம் : ₹ 240</div><div>நன்றி! மீண்டும் வருக</div>`, { font: "'Nirmala UI','Latha',sans-serif", tilt: 0.8 }),

  "07-fuel-blurry.jpg": page(`<div style="text-align:center;font-weight:bold;font-size:16px">INDIAN OIL</div><div style="text-align:center">KUMARAN AGENCIES, Vellore</div>${hr}
<div>Receipt : 77812 &nbsp; Nozzle : 2</div><div>Date : 15/10/2026 &nbsp; 09:05</div>${hr}<div>Product : HSD (Diesel)</div><div>Rate : 92.40 /L</div><div>Qty : 10.82 L</div>${hr}
<div style="font-size:16px;font-weight:bold">AMOUNT PAID : Rs. 1000.00</div><div>Cash</div>`, { tilt: -3, filter: "blur(.9px) contrast(.7)" }),

  "08-rent-receipt.jpg": page(`<div style="font-size:18px;font-weight:bold;text-align:center">RENT RECEIPT</div>
<div style="margin-top:10px">Received with thanks from Elbrit Lifesciences Pvt Ltd a sum of <b>Rs. 12,000/-</b> (Rupees Twelve Thousand only) towards rent of
office premises at No. 14, 2nd Street, Gandhipuram, Coimbatore for the month of October 2026.</div>
<div style="margin-top:12px">Date: 05.10.2026</div><div style="margin-top:20px;text-align:right">K. Palanisamy (Owner)</div>`,
  { tilt: 0.5, bg: "#fbfbf8", font: "Georgia,serif", width: 420 }),
};

const INVOICE = `<html><body style="font:14px Arial,sans-serif;color:#222;padding:40px">
<div style="display:flex;justify-content:space-between"><div style="font-size:22px;font-weight:bold">RideGo</div><div>Tax Invoice<br>Invoice No: RG-2026-10-55871</div></div>
<p>Ride date: <b>Oct 21, 2026</b><br>Pickup: Chennai Airport &nbsp; Drop: T. Nagar<br>Driver: S. Kumar &nbsp; Vehicle: TN 10 BB 2231</p>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="6">
<tr><td>Ride fare</td><td style="text-align:right">1,120.00</td></tr><tr><td>Airport fee</td><td style="text-align:right">66.20</td></tr>
<tr><td>GST 5%</td><td style="text-align:right">59.30</td></tr><tr><td><b>Total paid</b></td><td style="text-align:right"><b>₹ 1,245.50</b></td></tr></table>
<p>Paid by UPI. This is a computer generated invoice.</p></body></html>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ channel: "chromium", headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage({ viewport: { width: 520, height: 640 } });
  const tmp = path.join(OUT, "_tmp.html");
  for (const [name, html] of Object.entries(BILLS)) {
    fs.writeFileSync(tmp, html);
    await p.goto(pathToFileURL(tmp).href);
    await p.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 75 });
  }
  fs.writeFileSync(tmp, INVOICE);
  await p.goto(pathToFileURL(tmp).href);
  await p.pdf({ path: path.join(OUT, "06-cab-invoice.pdf"), format: "A5" });
  fs.unlinkSync(tmp);
  await b.close();
  console.log("bills written to", OUT);
})();
