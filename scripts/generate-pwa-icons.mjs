/**
 * Renders public/logo.svg into the PNG icons the install prompts need.
 *
 * Run after changing the logo:  node scripts/generate-pwa-icons.mjs
 *
 * SVG is not enough on its own. iOS ignores an SVG `apple-touch-icon` AND SVG
 * manifest icons outright, so an iPhone adding this app to the home screen was
 * getting a blank tile. Android accepts SVG but wants a maskable variant, or
 * the launcher crops the artwork to fit its own shape.
 *
 * Three treatments, because the platforms mask differently:
 *
 *   any       — full bleed on transparency. The logo is already a circle, so
 *               there is nothing to pad.
 *   maskable  — the launcher may crop to any shape and only guarantees the
 *               middle 80%, so the logo sits at 60% on an opaque tile.
 *   apple     — iOS composites transparency onto BLACK and rounds the corners
 *               itself, so this one must be opaque and slightly inset.
 */
import sharp from "sharp";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");
const svg = readFileSync(path.join(publicDir, "logo.svg"));

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

async function icon(name, size, scale, background) {
  const inner = Math.round(size * scale);
  // density, not resize-from-47px: the source is 47px square, so rasterising
  // at its natural size and scaling up would ship a blurred 512px icon.
  const logo = await sharp(svg, { density: Math.ceil((72 * inner) / 47) })
    .resize(inner, inner)
    .png()
    .toBuffer();

  const offset = Math.round((size - inner) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(path.join(publicDir, name));

  console.log(`${name}  ${size}x${size}`);
}

await icon("apple-touch-icon.png", 180, 0.82, WHITE);
await icon("icon-192.png", 192, 1, CLEAR);
await icon("icon-512.png", 512, 1, CLEAR);
await icon("icon-192-maskable.png", 192, 0.6, WHITE);
await icon("icon-512-maskable.png", 512, 0.6, WHITE);
