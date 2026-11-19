/**
 * Posts a cropped picture at the ERP write route. The ERP endpoint and service
 * token live in server env, so the browser only ever talks to our own API
 * route - but it sends the signed-in person's own ERP token (x-erp-token) so
 * the route knows WHO is asking: reads need any valid sign-in, writes are only
 * for your own picture (or a System Manager). See SECURITY_PERM_V2.md.
 */

import { userErpTokenHeaders } from "../../../../lib/userErpToken";

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
 * Reads the picture the ERP currently holds. Returns "" when the user has none,
 * which is an answer rather than a failure - the avatar falls back to initials.
 *
 * @returns {Promise<string>}
 */
export async function fetchProfilePicture({ user, employee, endpointKey, token, signal }) {
  if (!user) return "";
  const authHeaders = userErpTokenHeaders(token);
  // Not signed in to the ERP: nothing to ask with. The avatar keeps initials.
  if (!authHeaders["x-erp-token"]) return "";

  const params = new URLSearchParams({ user });
  if (employee) params.set("employee", employee);
  if (endpointKey) params.set("endpointKey", endpointKey);

  const response = await fetch(`${PROFILE_PICTURE_ENDPOINT}?${params}`, {
    method: "GET",
    headers: authHeaders,
    signal,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Reading the picture failed with HTTP ${response.status}`);
  }

  return payload?.fileUrl || "";
}

/**
 * @returns {Promise<{ fileUrl: string, warning?: string }>}
 */
export async function saveProfilePicture({ dataUrl, user, employee, endpointKey, token }) {
  if (!dataUrl) throw new Error("There is no image to save.");
  if (!user) throw new Error("This profile has no ERP user id, so the picture cannot be saved.");
  const authHeaders = userErpTokenHeaders(token);
  if (!authHeaders["x-erp-token"]) {
    throw new Error("Your sign-in has expired. Sign in again to change your picture.");
  }

  const response = await fetch(PROFILE_PICTURE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
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
