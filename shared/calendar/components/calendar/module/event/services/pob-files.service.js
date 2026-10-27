"use client";

/**
 * Files on a POB.
 *
 * A POB is a Quotation, and its photos and PDFs are ERP `File` docs attached to
 * that Quotation, private — the way bills hang on an Expense Claim (see
 * components/features/expense-claims/data/claimsApi.js). They belong to the
 * whole POB, never to an item line. The same rules as bills: photos and PDFs,
 * 10 MB each, as many as are needed. The rules are copied rather than imported
 * because the calendar module does not reach into components/features.
 *
 * Reads and writes go out with the signed-in user's own token (AUTH_CONFIG),
 * so ERP decides who may see or remove a file. Private files cannot be fetched
 * cross-origin, so previews go through /api/erp/claim-file like the bills do.
 */

import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import { graphqlRequest } from "@calendar/lib/graphql-client";
import { uploadFileToDoc } from "@calendar/lib/file.service";

const POB_DOCTYPE = "Quotation";

export const ATTACH_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";
export const ATTACH_MAX = 10 * 1024 * 1024;

export function checkFile(file) {
  if (!ATTACH_ACCEPT.split(",").includes(file.type)) return `${file.name}: only photos and PDFs can be attached.`;
  if (file.size > ATTACH_MAX) return `${file.name} is over 10 MB.`;
  return null;
}

export function fileKind(name) {
  const ext = String(name || "").split("?")[0].split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "heic"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

export const sizeLabel = (b) =>
  !b ? "" : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1048576).toFixed(1) + " MB";

/** A file's bytes, through our own route with the user's token. */
export async function fetchPobFileBlob(fileUrl) {
  const params = new URLSearchParams({ endpoint: AUTH_CONFIG.erpUrl, path: fileUrl });
  const res = await fetch(`/api/erp/claim-file?${params}`, {
    headers: { "x-erp-token": AUTH_CONFIG.authToken },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `The file could not be opened (HTTP ${res.status}).`);
  }
  return res.blob();
}

const FILES_QUERY = `
  query PobFiles($f: [DBFilterInput]) {
    Files(first: 100, filter: $f) { edges { node { name file_name file_url is_private file_size creation } } }
  }
`;

const DELETE_FILE_MUTATION = `
  mutation DeletePobFile($name: String!) { deleteDoc(doctype: "File", name: $name) { name } }
`;

const eq = (fieldname, value) => ({ fieldname, operator: "EQ", value });

export async function fetchPobFiles(quotationName) {
  if (!quotationName) return [];
  const data = await graphqlRequest(FILES_QUERY, {
    f: [eq("attached_to_doctype", POB_DOCTYPE), eq("attached_to_name", quotationName)],
  });
  return (data?.Files?.edges ?? [])
    .map(({ node }) => ({
      id: node.name,
      name: node.file_name || String(node.file_url || "").split("/").pop(),
      url: node.file_url,
      size: Number(node.file_size) || 0,
      creation: node.creation,
      kind: fileKind(node.file_name || node.file_url),
    }))
    .sort((a, b) => String(a.creation).localeCompare(String(b.creation)));
}

/** An empty set of changes: files picked to add, saved files to remove. */
export const EMPTY_POB_FILE_CHANGES = Object.freeze({ added: [], removed: [] });

export const hasPobFileChanges = (changes) =>
  !!changes && (changes.added.length > 0 || changes.removed.length > 0);

/**
 * Apply the picked changes to a saved POB.
 *
 * Runs after the Quotation is saved (a file needs a record to hang on). Each
 * file goes on its own, so one that fails does not stop the rest, and the POB
 * itself is already safe in ERP. Returns the names of whatever did not land.
 */
export async function savePobFiles(quotationName, changes) {
  const failed = [];
  if (!quotationName || !hasPobFileChanges(changes)) return { failed };

  for (const file of changes.removed) {
    try {
      await graphqlRequest(DELETE_FILE_MUTATION, { name: file.id });
    } catch (error) {
      console.error("Failed to remove POB file", file.name, error);
      failed.push(`${file.name} (not removed)`);
    }
  }

  for (const file of changes.added) {
    try {
      const uploaded = await uploadFileToDoc({
        file,
        doctype: POB_DOCTYPE,
        docname: quotationName,
        erpUrl: AUTH_CONFIG.erpUrl,
        authToken: AUTH_CONFIG.authToken,
        isPrivate: true,
      });
      if (!uploaded?.fileUrl) throw new Error(`${file.name} was not stored by the ERP.`);
    } catch (error) {
      console.error("Failed to upload POB file", file.name, error);
      failed.push(file.name);
    }
  }

  return { failed };
}

/** One line for the toast when some files did not land. */
export const describeFailedPobFiles = (failed) =>
  `POB saved, but ${failed.length === 1 ? "this file" : "these files"} did not go up: ${failed.join(", ")}. Open the POB and attach again.`;
