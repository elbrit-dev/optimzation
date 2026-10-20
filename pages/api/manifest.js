import { APP_ICON_DIR, APP_NAME } from "../../lib/appName";

// The PWA manifest, served at /manifest.webmanifest (next.config.mjs rewrite)
// so the installed app carries this site's name: "Elbrit One" on
// app.elbrit.org, "Elbrit UAT" on app-uat (its icons carry a "UAT" pill). It replaced the static
// public/manifest.webmanifest, which named both sites the same.
const MANIFEST = {
  name: APP_NAME,
  short_name: APP_NAME,
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#ffffff",
  description: "A Next.js app with Firebase auth, now installable as a PWA.",
  orientation: "any",
  icons: [
    { src: `${APP_ICON_DIR}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `${APP_ICON_DIR}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: `${APP_ICON_DIR}/icon-192-maskable.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: `${APP_ICON_DIR}/icon-512-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    { src: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
  ],
};

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(JSON.stringify(MANIFEST, null, 2));
}
