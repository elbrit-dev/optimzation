// pages/api/erp/print.js
//
// Streams a document's PDF straight out of the ERP, so a payslip downloaded
// here is byte-for-byte the one Frappe produces when you print it from the desk
// - rather than a lookalike rebuilt in this app.
//
// No `format` is sent unless the caller names one, which is what makes the
// output match: Frappe then resolves the print format exactly as the desk does.
//
// The rows on the payslips table carry only display text ("July 2026"), so a
// docname is resolved here from the employee plus that month.

import { erpConfig, runGraphQL } from "../../../lib/erpServer";

// Only doctypes listed here can be printed. Without this the route would
// happily render any document in the ERP to anyone who can reach it.
const PRINTABLE = {
  "Salary Slip": {
    // Resolution fields for the month lookup.
    dateField: "start_date",
    employeeField: "employee",
  },
};

// `employee` itself is deliberately not selected: it is a Link, and selecting a
// Link unqualified makes Frappe defer-resolve the whole doc and fail the query
// (see the note in help-support/graphql/employee.graphql.js). The filter already
// guarantees every row belongs to this employee.
const SALARY_SLIPS_QUERY = `
  query SalarySlipsForEmployee($employee: String!) {
    SalarySlips(
      first: 60
      filter: [{ fieldname: "employee", operator: EQ, value: $employee }]
    ) {
      edges {
        node {
          name
          start_date
          end_date
          docstatus
        }
      }
    }
  }
`;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/**
 * Reads "July 2026", "Jul 2026" or "2026-07" into { year, month }. Returns null
 * when the label carries no month, so the caller can fall back to the latest.
 */
export function parseMonthLabel(label) {
  const text = String(label || "").trim().toLowerCase();
  if (!text) return null;

  const iso = /(20\d{2})-(0[1-9]|1[0-2])/.exec(text);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };

  const year = /(20\d{2})/.exec(text);
  if (!year) return null;

  const monthIndex = MONTHS.findIndex((name) => text.includes(name.slice(0, 3)));
  if (monthIndex < 0) return null;

  return { year: Number(year[1]), month: monthIndex + 1 };
}

/** Newest first, so "latest" and the month match read off the same ordering. */
function byStartDateDesc(a, b) {
  return String(b.start_date || "").localeCompare(String(a.start_date || ""));
}

function matchesMonth(node, wanted) {
  const date = String(node.start_date || "");
  const [year, month] = date.split("-");
  return Number(year) === wanted.year && Number(month) === wanted.month;
}

function isEmployeeId(value) {
  // Employee docnames here look like E00004 / HR-EMP-00001 - never a path.
  return /^[A-Za-z0-9][A-Za-z0-9\-_/]{0,139}$/.test(value) && !value.includes("..");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const doctype = String(req.query.doctype || "Salary Slip").trim();
  if (!PRINTABLE[doctype]) {
    return res.status(400).json({ error: `${doctype || "That doctype"} cannot be printed from here.` });
  }

  const employee = String(req.query.employee || "").trim();
  if (!employee || !isEmployeeId(employee)) {
    return res.status(400).json({ error: "A valid employee id is required." });
  }

  const requestedName = String(req.query.name || "").trim();
  const month = String(req.query.month || "").trim();
  const wantLatest = String(req.query.latest || "") === "1";
  const format = String(req.query.format || "").trim();

  let erp;
  try {
    erp = erpConfig(String(req.query.endpointKey || "").trim());
  } catch (error) {
    console.error("Print: ERP config missing", error);
    return res.status(500).json({ error: error?.message || "The ERP connection is not configured." });
  }

  // Always resolve against the employee's own slips, so a guessed docname
  // cannot pull down somebody else's payslip.
  let slips;
  try {
    const data = await runGraphQL(SALARY_SLIPS_QUERY, { employee }, erp);
    slips = (data?.SalarySlips?.edges || []).map((edge) => edge.node).filter(Boolean);
  } catch (error) {
    console.error("Print: slip lookup failed", error);
    return res.status(502).json({ error: error?.message || "The ERP would not list the payslips." });
  }

  if (!slips.length) {
    return res.status(404).json({ error: "This employee has no payslips in the ERP." });
  }

  slips.sort(byStartDateDesc);

  // Name first when the caller has one, then the month label, then the latest.
  // A name that matches nothing falls through to the month rather than failing:
  // the payload's docname can go stale, but the month it displays cannot.
  let target = requestedName ? slips.find((slip) => slip.name === requestedName) || null : null;

  if (!target && !wantLatest && month) {
    const wanted = parseMonthLabel(month);
    target = wanted ? slips.find((slip) => matchesMonth(slip, wanted)) || null : null;
    if (!target) {
      return res.status(404).json({ error: `No payslip was found for ${month}.` });
    }
  }

  if (!target && (wantLatest || (!requestedName && !month))) {
    target = slips[0];
  }

  if (!target) {
    return res.status(404).json({ error: "That payslip does not belong to this employee." });
  }

  const url = new URL(`${new URL(erp.endpointUrl).origin}/api/method/frappe.utils.print_format.download_pdf`);
  url.searchParams.set("doctype", doctype);
  url.searchParams.set("name", target.name);
  url.searchParams.set("no_letterhead", "0");
  // Left unset unless asked: Frappe then picks the same format the desk would.
  if (format) url.searchParams.set("format", format);

  let response;
  try {
    response = await fetch(url, { headers: { Authorization: erp.authToken } });
  } catch (error) {
    console.error("Print: download failed", error);
    return res.status(502).json({ error: "The ERP could not be reached for the PDF." });
  }

  const contentType = response.headers.get("content-type") || "";
  const body = Buffer.from(await response.arrayBuffer());

  // Frappe answers a failed print with HTML or JSON, not a PDF - passing that
  // through as a .pdf would hand the user a file that will not open.
  if (!response.ok || !contentType.includes("pdf")) {
    console.error("Print: ERP returned a non-PDF", response.status, contentType, body.toString("utf8").slice(0, 400));
    return res.status(502).json({ error: "The ERP did not return a PDF for that payslip." });
  }

  const filename = `${target.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(body.length));
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(body);
}
