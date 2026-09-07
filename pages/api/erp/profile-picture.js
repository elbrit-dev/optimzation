// pages/api/erp/profile-picture.js
//
// GET  reads the picture the ERP currently holds for a user, so the avatar shows
//      what is in the ERP without anyone binding a prop to it.
// POST saves a new one. Two steps, because Frappe stores the bytes and the
//      reference separately: `uploadFile` writes a File doc, then `saveDoc`
//      points the User's `user_image` (and, when an Employee docname comes with
//      the request, that Employee's `image`) at the returned file URL.
//
// This runs server-side so the endpoint and token are read from env here rather
// than passed in from Studio the way HelpSupport does it.

import {
  absoluteFileUrl,
  erpConfig,
  isSameOrigin,
  runGraphQL,
} from "../../../lib/erpServer";

// `modified` rides along as a cache-buster: Frappe can hand back a file URL it
// has reused, and without a changing query string the browser would keep
// showing the image it already cached.
// The plural/filter form, matching every other query in this codebase - the
// singular `User(name:)` shape is not used anywhere here, so it is not assumed
// to exist. `user_image`, `image` and `modified` are plain scalars, not Links,
// so they need no `__name` qualifier (see the note in employee.graphql.js).
const USER_IMAGE_QUERY = `
  query ProfilePicture($user: String!) {
    Users(first: 1, filter: [{ fieldname: "name", operator: EQ, value: $user }]) {
      edges {
        node {
          name
          user_image
          modified
        }
      }
    }
  }
`;

const USER_AND_EMPLOYEE_IMAGE_QUERY = `
  query ProfilePictureWithEmployee($user: String!, $employee: String!) {
    Users(first: 1, filter: [{ fieldname: "name", operator: EQ, value: $user }]) {
      edges {
        node {
          name
          user_image
          modified
        }
      }
    }
    Employees(first: 1, filter: [{ fieldname: "name", operator: EQ, value: $employee }]) {
      edges {
        node {
          name
          image
          modified
        }
      }
    }
  }
`;

const UPLOAD_FILE_MUTATION = `
  mutation UploadProfilePicture(
    $file: Upload!
    $attached_to_doctype: String
    $attached_to_name: String
    $fieldname: String
    $is_private: Boolean
  ) {
    uploadFile(
      file: $file
      attached_to_doctype: $attached_to_doctype
      attached_to_name: $attached_to_name
      fieldname: $fieldname
      is_private: $is_private
    ) {
      name
      file_url
      file_name
    }
  }
`;

const SAVE_USER_IMAGE_MUTATION = `
  mutation SaveUserImage($doc: String!) {
    saveDoc(doctype: "User", doc: $doc) {
      doc {
        name
      }
    }
  }
`;

const SAVE_EMPLOYEE_IMAGE_MUTATION = `
  mutation SaveEmployeeImage($doc: String!) {
    saveDoc(doctype: "Employee", doc: $doc) {
      doc {
        name
      }
    }
  }
`;

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_DECODED_BYTES = 5 * 1024 * 1024;

// The client crops to a small square before posting, so the body stays well
// under this. The headroom is only there so an unexpectedly large crop fails
// with our own message rather than Next's 413.
export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

/**
 * The multipart GraphQL request spec: `operations` holds the query with the file
 * slot left null, `map` points a form field at that slot, and the field carries
 * the bytes. Same shape as the help desk attachment upload.
 */
async function uploadFile({ buffer, mimeType, fileName, user }, { endpointUrl, authToken }) {
  const formData = new FormData();

  formData.append(
    "operations",
    JSON.stringify({
      query: UPLOAD_FILE_MUTATION,
      variables: {
        file: null,
        attached_to_doctype: "User",
        attached_to_name: user,
        // Links the File to the field, so the ERP shows it as the user's image
        // rather than a loose attachment. The saveDoc below then makes the
        // reference explicit instead of relying on that side effect.
        fieldname: "user_image",
        // An avatar has to load in a plain <img>, with no ERP session behind it.
        is_private: false,
      },
    })
  );
  formData.append("map", JSON.stringify({ 0: ["variables.file"] }));
  formData.append("0", new Blob([buffer], { type: mimeType }), fileName);

  // No Content-Type header - fetch has to set the multipart boundary itself.
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { Authorization: authToken },
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length || payload.exc_type) {
    throw new Error(readErpError(payload, response.status));
  }

  const uploaded = payload.data?.uploadFile;
  if (!uploaded?.file_url) throw new Error("The ERP accepted the upload but returned no file URL.");
  return uploaded;
}

/** Splits a `data:image/jpeg;base64,…` URL into bytes plus its declared type. */
function decodeDataUrl(dataUrl) {
  const match = /^data:([a-z0-9.+/-]+);base64,([\s\S]+)$/i.exec(String(dataUrl || "").trim());
  if (!match) return { error: "The image was not sent as a base64 data URL." };

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    return { error: `${mimeType} is not an accepted image type.` };
  }

  let buffer;
  try {
    buffer = Buffer.from(match[2], "base64");
  } catch {
    return { error: "The image data could not be decoded." };
  }

  if (!buffer.length) return { error: "The image data was empty." };
  if (buffer.length > MAX_DECODED_BYTES) {
    return { error: `The image is ${Math.round(buffer.length / 1024)} KB - the limit is 5 MB.` };
  }

  return { buffer, mimeType };
}

/** ERP User docnames are email addresses; Guest and Administrator are off limits. */
function validateUser(user) {
  const value = String(user || "").trim();
  if (!value) return { error: "The ERP user id is missing." };
  if (value.length > 140) return { error: "The ERP user id is not a valid user." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { error: "The ERP user id must be an email address." };
  }
  if (/^(guest|administrator)$/i.test(value.split("@")[0]) && !value.includes(".")) {
    return { error: "That ERP user cannot be changed from here." };
  }
  return { user: value };
}

function safeFileName(user, mimeType) {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const stem = user.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "user";
  return `profile-${stem}-${Date.now()}.${extension}`;
}

/** Appends the doc's `modified` so a reused file URL still busts the cache. */
function versioned(fileUrl, modified) {
  if (!fileUrl || !modified) return fileUrl;
  const separator = fileUrl.includes("?") ? "&" : "?";
  return `${fileUrl}${separator}v=${encodeURIComponent(String(modified))}`;
}

/**
 * Reads whatever picture the ERP holds right now. `User.user_image` is the one
 * the avatar is meant to mirror; `Employee.image` is only consulted when the
 * User has none, so an HR-uploaded photo still shows up.
 */
async function handleRead(req, res) {
  const validatedUser = validateUser(req.query?.user);
  if (validatedUser.error) return res.status(400).json({ error: validatedUser.error });
  const user = validatedUser.user;
  const employee = String(req.query?.employee || "").trim().slice(0, 140);

  let erp;
  try {
    erp = erpConfig(String(req.query?.endpointKey || "").trim());
  } catch (error) {
    console.error("Profile picture: ERP config missing", error);
    return res.status(500).json({ error: error?.message || "The ERP connection is not configured." });
  }

  let data;
  try {
    data = employee
      ? await runGraphQL(USER_AND_EMPLOYEE_IMAGE_QUERY, { user, employee }, erp)
      : await runGraphQL(USER_IMAGE_QUERY, { user }, erp);
  } catch (error) {
    console.error("Profile picture: read failed", error);
    return res.status(502).json({ error: error?.message || "The ERP would not return the picture." });
  }

  const userNode = data?.Users?.edges?.[0]?.node;
  const employeeNode = data?.Employees?.edges?.[0]?.node;
  const source = userNode?.user_image
    ? { url: userNode.user_image, modified: userNode.modified, from: "User.user_image" }
    : { url: employeeNode?.image || "", modified: employeeNode?.modified, from: "Employee.image" };

  // A user with no picture is a normal answer, not an error - the avatar keeps
  // showing initials. Not cached: the point is to notice ERP-side changes.
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    fileUrl: source.url ? versioned(absoluteFileUrl(source.url, erp.endpointUrl), source.modified) : "",
    source: source.url ? source.from : "",
  });
}

export default async function handler(req, res) {
  if (req.method === "GET") return handleRead(req, res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: "Cross-origin picture changes are not allowed." });
  }

  const validatedUser = validateUser(req.body?.user);
  if (validatedUser.error) return res.status(400).json({ error: validatedUser.error });
  const user = validatedUser.user;

  const decoded = decodeDataUrl(req.body?.dataUrl);
  if (decoded.error) return res.status(400).json({ error: decoded.error });

  const employee = String(req.body?.employee || "").trim().slice(0, 140);

  let erp;
  try {
    erp = erpConfig(String(req.body?.endpointKey || "").trim());
  } catch (error) {
    console.error("Profile picture: ERP config missing", error);
    return res.status(500).json({ error: error?.message || "The ERP connection is not configured." });
  }

  let uploaded;
  try {
    uploaded = await uploadFile(
      {
        buffer: decoded.buffer,
        mimeType: decoded.mimeType,
        fileName: safeFileName(user, decoded.mimeType),
        user,
      },
      erp
    );
  } catch (error) {
    console.error("Profile picture: upload failed", error);
    return res.status(502).json({ error: error?.message || "The ERP would not store the image." });
  }

  try {
    await runGraphQL(
      SAVE_USER_IMAGE_MUTATION,
      { doc: JSON.stringify({ name: user, user_image: uploaded.file_url }) },
      erp
    );
  } catch (error) {
    console.error("Profile picture: User update failed", error);
    return res.status(502).json({
      error: error?.message || "The image was stored but the ERP user was not updated.",
    });
  }

  // The Employee record is a nice-to-have mirror: HR screens read `image` from
  // there. A failure leaves the User picture correct, so it is only a warning.
  let warning = "";
  if (employee) {
    try {
      await runGraphQL(
        SAVE_EMPLOYEE_IMAGE_MUTATION,
        { doc: JSON.stringify({ name: employee, image: uploaded.file_url }) },
        erp
      );
    } catch (error) {
      console.error("Profile picture: Employee update failed", error);
      warning = "Your picture was saved, but the Employee record still shows the old one.";
    }
  }

  return res.status(200).json({
    fileUrl: absoluteFileUrl(uploaded.file_url, erp.endpointUrl),
    relativeUrl: uploaded.file_url,
    fileName: uploaded.file_name || "",
    ...(warning ? { warning } : {}),
  });
}
