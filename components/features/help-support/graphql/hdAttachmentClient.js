import { clearHelpDeskGraphQLCache } from "./graphqlClient";
import { HD_TICKET_DOCTYPE } from "./hdTicketFields";

// Frappe's `uploadFile` mutation follows the GraphQL multipart request spec:
// an `operations` field holding the query and variables (with the file slot
// null), a `map` pointing a form field at that slot, and the file itself.
// Same shape the calendar uses for leave medical certificates.
const UPLOAD_FILE_MUTATION = `
  mutation UploadFile(
    $file: Upload!
    $attached_to_doctype: String
    $attached_to_name: String
    $is_private: Boolean
  ) {
    uploadFile(
      file: $file
      attached_to_doctype: $attached_to_doctype
      attached_to_name: $attached_to_name
      is_private: $is_private
    ) {
      name
      file_url
      file_name
    }
  }
`;

export const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set(ATTACHMENT_ACCEPT.split(","));

export function describeFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Returns an error message, or null when the file is acceptable. */
export function validateAttachment(file) {
  if (!file) return "No file selected.";
  if (!ALLOWED_TYPES.has(file.type)) {
    return `${file.name}: only images and PDFs can be attached.`;
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return `${file.name} is ${describeFileSize(file.size)} — the limit is ${describeFileSize(ATTACHMENT_MAX_BYTES)}.`;
  }
  return null;
}

function resolveConfig(config = {}) {
  const endpointUrl = config.endpointUrl || config.url || "";
  const authToken = config.authToken || config.token || "";
  if (!endpointUrl || !authToken) {
    throw new Error("Help Support GraphQL endpoint and token must be passed as props.");
  }
  return { endpointUrl, authToken };
}

/** Attach one file to an existing HD Ticket. */
export async function uploadHDTicketAttachment(file, ticketName, graphqlConfig) {
  if (!file || !ticketName) return null;

  const { endpointUrl, authToken } = resolveConfig(graphqlConfig);
  const formData = new FormData();

  formData.append(
    "operations",
    JSON.stringify({
      query: UPLOAD_FILE_MUTATION,
      variables: {
        file: null,
        attached_to_doctype: HD_TICKET_DOCTYPE,
        attached_to_name: ticketName,
        is_private: true,
      },
    })
  );
  formData.append("map", JSON.stringify({ "0": ["variables.file"] }));
  formData.append("0", file);

  // No Content-Type header: the browser has to set the multipart boundary.
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { Authorization: authToken },
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.errors?.length) {
    const message =
      payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
      `Upload failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  const uploaded = payload.data?.uploadFile;
  if (!uploaded?.file_url) throw new Error(`${file.name} was not stored by the ERP.`);

  return { name: uploaded.name, fileUrl: uploaded.file_url, fileName: uploaded.file_name || file.name };
}

/**
 * Attach every file to the ticket. One failure must not lose the others, so
 * each is reported individually and the caller decides what to surface.
 */
export async function uploadHDTicketAttachments(files, ticketName, graphqlConfig) {
  const list = Array.from(files || []);
  if (!list.length || !ticketName) return { uploaded: [], failed: [] };

  const uploaded = [];
  const failed = [];

  for (const file of list) {
    try {
      const result = await uploadHDTicketAttachment(file, ticketName, graphqlConfig);
      if (result) uploaded.push(result);
    } catch (error) {
      failed.push({ fileName: file.name, message: error?.message || "Upload failed." });
    }
  }

  if (uploaded.length) clearHelpDeskGraphQLCache();
  return { uploaded, failed };
}
