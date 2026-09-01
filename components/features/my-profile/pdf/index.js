// Public surface for the profile screen. Each helper lazily pulls in the
// renderer chunk on first use, so @react-pdf/renderer costs nothing until
// somebody actually clicks a download.
import { downloadName, splitPeriod } from "./format";

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

const loadRenderer = () => import("./render");

function employeeSlug(data) {
  return downloadName(data?.employee?.employeeCode, "employee");
}

export async function downloadProfilePdf(data) {
  const { renderProfile } = await loadRenderer();
  const blob = await renderProfile(data);
  saveBlob(blob, `${employeeSlug(data)}-employee-profile.pdf`);
}

export async function downloadPayslipPdf(slip, data) {
  const { renderPayslip } = await loadRenderer();
  const blob = await renderPayslip(slip, data);
  const label = slip?.title || slip?.month || "payslip";
  saveBlob(blob, `${employeeSlug(data)}-${downloadName(label, "payslip")}-payslip.pdf`);
}

export async function downloadPayslipRegisterPdf(data) {
  const { renderPayslipRegister } = await loadRenderer();
  const blob = await renderPayslipRegister(data);
  saveBlob(blob, `${employeeSlug(data)}-payslip-register.pdf`);
}

export async function downloadDocumentPdf(doc, data) {
  // A real file wins over the generated record sheet.
  if (doc?.url) {
    saveBlobUrl(doc.url, `${employeeSlug(data)}-${downloadName(doc.name, "document")}.pdf`);
    return;
  }
  const { renderDocumentRecord } = await loadRenderer();
  const blob = await renderDocumentRecord(doc, data);
  saveBlob(blob, `${employeeSlug(data)}-${downloadName(doc.name, "document")}.pdf`);
}

function saveBlobUrl(url, filename) {
  if (typeof window === "undefined") return;
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Fill in the fields the ERP's Salary Slip carries but the table row does not.
 * When the row is the slip the preview panel is showing, take its full
 * earnings/deductions breakdown.
 */
export function slipFromRow(payslips, row) {
  const selected = payslips?.selectedSlip;
  const period = splitPeriod(row.period);

  if (selected && selected.title === row.month) {
    return { ...selected, month: row.month, period: row.period };
  }

  return {
    title: row.month,
    month: row.month,
    period: row.period,
    startDate: period.start,
    endDate: period.end,
    netPay: row.netPay,
    grossPay: row.gross,
    totalDeductions: row.deductions,
    meta: [
      { label: "Period", value: row.period },
      { label: "Status", value: row.status },
    ],
  };
}
