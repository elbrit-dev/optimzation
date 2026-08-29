// Everything that pulls in @react-pdf/renderer lives behind this module so the
// whole thing can be code-split into one lazily loaded chunk.
import React from "react";
import { pdf } from "@react-pdf/renderer";
import { PayslipDocument, PayslipRegisterDocument } from "./PayslipDocument";
import { DocumentRecordDocument, ProfileDocument } from "./ProfileDocument";
import { DEFAULT_COMPANY } from "./chrome";
import { registerPdfFonts } from "./theme";

// A Plasmic prop that has never been filled in often carries "" rather than
// being absent entirely (e.g. company.logoUrl left blank in the Profile prop
// editor). Treat that the same as unset so it can't silently blank out a
// default the caller never meant to override.
function withCompany(company) {
  const provided = Object.fromEntries(
    Object.entries(company || {}).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
  return { ...DEFAULT_COMPANY, ...provided };
}

async function toBlob(element, fontBasePath) {
  registerPdfFonts(fontBasePath);
  return pdf(element).toBlob();
}

export function renderProfile(data, { fontBasePath } = {}) {
  return toBlob(<ProfileDocument data={data} company={withCompany(data.company)} />, fontBasePath);
}

export function renderPayslip(slip, data, { fontBasePath } = {}) {
  return toBlob(
    <PayslipDocument
      slip={slip}
      employee={data.employee}
      account={data.accountDetails}
      company={withCompany(data.company)}
    />,
    fontBasePath
  );
}

export function renderPayslipRegister(data, { fontBasePath } = {}) {
  return toBlob(
    <PayslipRegisterDocument
      payslips={data.payslips}
      employee={data.employee}
      company={withCompany(data.company)}
    />,
    fontBasePath
  );
}

export function renderDocumentRecord(doc, data, { fontBasePath } = {}) {
  return toBlob(
    <DocumentRecordDocument doc={doc} employee={data.employee} company={withCompany(data.company)} />,
    fontBasePath
  );
}
