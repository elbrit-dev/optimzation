/* Everything the service reads from its environment (apphosting.yaml). */

function clients(raw) {
  // VERIFY_DOC_CLIENTS = {"elbrit-app": "<long random key>", ...}
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.error("VERIFY_DOC_CLIENTS is not valid JSON -- no client can call the service.");
    return {};
  }
}

const list = (raw, fallback) =>
  String(raw || fallback)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const config = {
  port: Number(process.env.PORT) || 8080,
  geminiKey: process.env.GEMINI_API_KEY || "",
  model: process.env.GEMINI_MODEL || "gemini-2.5-pro",
  // Which model reads: "openrouter" (OPENROUTER_API_KEY + OPENROUTER_MODEL, any
  // model OpenRouter offers) or "gemini" (Google's API directly). Default:
  // OpenRouter when its key is set.
  provider: String(process.env.MODEL_PROVIDER || (process.env.OPENROUTER_API_KEY ? "openrouter" : "gemini")).toLowerCase(),
  openrouterKey: process.env.OPENROUTER_API_KEY || "",
  openrouterModel: process.env.OPENROUTER_MODEL || "openai/gpt-6-luna",
  // OCR before the model (lib/ocr.mjs): "vision" (the model reads the image),
  // "docling" (only Docling's text) or "both" (text + image).
  ocrMode: String(process.env.OCR_MODE || "vision").toLowerCase(),
  doclingUrl: String(process.env.DOCLING_URL || "https://docling-serve-42ppaqlnqq-as.a.run.app").replace(/\/+$/, ""),
  doclingKey: process.env.DOCLING_API_KEY || "",
  doclingTimeoutMs: Number(process.env.DOCLING_TIMEOUT_MS) || 150000,
  clients: clients(process.env.VERIFY_DOC_CLIENTS),
  // Exact hosts, or ".example.com" for any subdomain.
  allowedHosts: list(process.env.ALLOWED_DOC_HOSTS, "erp.elbrit.org,uat.elbrit.org,firebasestorage.googleapis.com"),
  // Signed-in users: their Firebase login must be for this project, and
  // their ERP token must be live on this ERP.
  firebaseProject: process.env.FIREBASE_PROJECT_ID || "elbrit-sso-d01d9",
  // Off: a Firebase login is enough. "true": also demand a live ERP token.
  requireErpToken: String(process.env.REQUIRE_ERP_TOKEN || "").toLowerCase() === "true",
  erpUrl: String(process.env.ERP_URL || "https://erp.elbrit.org").replace(/\/+$/, ""),
  // Browser origins allowed to call it directly (CORS).
  allowedOrigins: list(
    process.env.ALLOWED_ORIGINS,
    "https://app.elbrit.org,https://app-uat.elbrit.org,https://app-uat--elbrit-sso-d01d9.asia-southeast1.hosted.app,https://app-prod--elbrit-sso-d01d9.asia-southeast1.hosted.app,http://localhost:3000",
  ),
  ratePerMinute: Number(process.env.RATE_PER_MINUTE) || 30,
  maxDocs: 10,
  maxDocBytes: 15 * 1024 * 1024,
  maxBodyBytes: 30 * 1024 * 1024,
  fetchTimeoutMs: 20000,
  modelTimeoutMs: 90000,
};
