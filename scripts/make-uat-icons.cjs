// Makes the app-uat copies of the app icons: the same logo with an orange
// "UAT" pill, so the test app and Elbrit One look different on a phone.
// Reads public/<icon>.png, writes public/uat/<icon>.png. Run again after a
// logo change:   node scripts/make-uat-icons.cjs
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const PUBLIC = path.join(__dirname, "..", "public");
const OUT = path.join(PUBLIC, "uat");

// Pill box as fractions of the icon. Maskable icons get cropped by the phone
// to a circle/squircle (safe zone = middle 80%), so their pill sits higher
// and narrower to stay inside it.
const ICONS = [
  { file: "icon-192.png", box: { x: 0.18, y: 0.72, w: 0.64, h: 0.24 } },
  { file: "icon-512.png", box: { x: 0.18, y: 0.72, w: 0.64, h: 0.24 } },
  { file: "apple-touch-icon.png", box: { x: 0.18, y: 0.72, w: 0.64, h: 0.24 } },
  { file: "icon-192-maskable.png", box: { x: 0.29, y: 0.64, w: 0.42, h: 0.16 } },
  { file: "icon-512-maskable.png", box: { x: 0.29, y: 0.64, w: 0.42, h: 0.16 } },
];

function pillSvg(size, { x, y, w, h }) {
  const px = (v) => Math.round(v * size);
  const border = Math.max(2, Math.round(size * 0.012));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect x="${px(x)}" y="${px(y)}" width="${px(w)}" height="${px(h)}" rx="${px(h / 2)}"
        fill="#EA580C" stroke="#FFFFFF" stroke-width="${border}"/>
  <text x="${px(x + w / 2)}" y="${px(y + h / 2)}" dy="0.36em" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="700"
        font-size="${px(h * 0.66)}" letter-spacing="${px(h * 0.04)}" fill="#FFFFFF">UAT</text>
</svg>`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const { file, box } of ICONS) {
    const src = path.join(PUBLIC, file);
    const { width } = await sharp(src).metadata();
    await sharp(src)
      .composite([{ input: pillSvg(width, box) }])
      .png()
      .toFile(path.join(OUT, file));
    console.log("public/uat/" + file);
  }
})();
