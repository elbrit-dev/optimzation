/**
 * Posts a cropped picture at the ERP write route. The ERP endpoint and token
 * live in server env (ERP_GRAPHQL_URL / ERP_GRAPHQL_TOKEN), so the browser only
 * ever talks to our own API route.
 */

export const PROFILE_PICTURE_ENDPOINT = "/api/erp/profile-picture";

/**
 * Profile payloads may carry `/files/avatar.jpg` straight out of the ERP. Those
 * need the ERP origin in front of them before an <img> can load them; anything
 * already absolute, or a data URL, is left alone.
 */
export function resolvePictureUrl(url, baseUrl) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^(https?:|data:|blob:)/i.test(value)) return value;

  const base = String(baseUrl || "").trim();
  if (!base) return value;

  try {
    return new URL(value, new URL(base).origin).toString();
  } catch {
    return value;
  }
}

/**
 * @returns {Promise<{ fileUrl: string, warning?: string }>}
 */
export async function saveProfilePicture({ dataUrl, user, employee, endpointKey }) {
  if (!dataUrl) throw new Error("There is no image to save.");
  if (!user) throw new Error("This profile has no ERP user id, so the picture cannot be saved.");

  const response = await fetch(PROFILE_PICTURE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataUrl,
      user,
      ...(employee ? { employee } : {}),
      // Names the ERP instance, so the write lands where the profile was read.
      ...(endpointKey ? { endpointKey } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || `Saving the picture failed with HTTP ${response.status}`);
  }
  if (!payload?.fileUrl) {
    throw new Error("The picture was uploaded but no image URL came back.");
  }

  return { fileUrl: payload.fileUrl, warning: payload.warning || "" };
}
