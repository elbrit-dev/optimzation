/**
 * Pulls a payslip PDF from the ERP through our own route, so what downloads is
 * the document Frappe prints from the desk rather than a rebuilt lookalike.
 *
 * The ERP endpoint and token stay server-side; the browser only ever calls
 * /api/erp/print.
 */

export const ERP_PRINT_ENDPOINT = "/api/erp/print";

/** Salary Slip docnames look like "Sal Slip/E00004/00028"; month labels never do. */
function asDocname(value) {
  const text = String(value || "").trim();
  return text.includes("/") ? text : "";
}

/**
 * Works out how to address a slip from whatever the payload happens to carry:
 * a docname if one is there, otherwise the month label the row displays, which
 * the route resolves against the employee's own slips.
 */
export function slipRequestParams(slip) {
  const docname = asDocname(slip?.name) || asDocname(slip?.subtitle) || asDocname(slip?.id);
  const month = String(slip?.month || slip?.title || "").trim();

  const params = {};
  if (docname) params.name = docname;
  if (month) params.month = month;
  if (!docname && !month) params.latest = "1";
  return params;
}

/** A stable per-slip key, so only the row being downloaded shows a spinner. */
export function slipKey(slip) {
  const params = slipRequestParams(slip);
  return params.name || params.month || "latest";
}

function saveBlob(blob, filename) {
  if (typeof window === "undefined") return;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function fileNameFor(slip, employee) {
  const label = String(slip?.month || slip?.title || "payslip")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const who = String(employee || "employee")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${who}-${label || "payslip"}-payslip.pdf`;
}

/**
 * Downloads one payslip. Throws with the ERP's own message so the caller can
 * put it in front of the user instead of failing silently.
 */
export async function downloadErpPayslip({ slip, employee, endpointKey, latest = false }) {
  if (!employee) {
    throw new Error("This profile has no ERP employee id, so the payslip cannot be fetched.");
  }

  const params = new URLSearchParams({ doctype: "Salary Slip", employee });
  const slipParams = latest ? { latest: "1" } : slipRequestParams(slip);
  for (const [key, value] of Object.entries(slipParams)) params.set(key, value);
  if (endpointKey) params.set("endpointKey", endpointKey);

  const response = await fetch(`${ERP_PRINT_ENDPOINT}?${params}`);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `The payslip could not be downloaded (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  if (!blob.size) throw new Error("The ERP returned an empty payslip.");

  // The server names the file after the docname it actually fetched, so the
  // filename cannot claim a month the PDF does not contain.
  saveBlob(blob, serverFileName(response) || fileNameFor(slip, employee));
}

/** Reads the filename the route put in Content-Disposition, if any. */
function serverFileName(response) {
  const header = response.headers.get("content-disposition") || "";
  const match = /filename="?([^"';]+)"?/i.exec(header);
  return match ? match[1].trim() : "";
}
