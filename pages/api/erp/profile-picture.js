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

import { getEndpoints, getTokens } from "../../../lib/graphql-endpoints";

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

/** Turns Frappe's `_server_messages` / GraphQL errors into one readable line. */
function readErpError(payload, status) {
  if (payload?._server_messages) {
    try {
      const messages = JSON.parse(payload._server_messages);
      const first = messages?.[0] ? JSON.parse(messages[0]) : null;
      if (first?.message) return String(first.message).replace(/<[^>]*>/g, "").trim();
    } catch {
      // Fall through to the GraphQL errors.
    }
  }

  if (payload?.errors?.length) {
    return payload.errors.map((error) => error.message).filter(Boolean).join("; ");
  }

  if (payload?.exc_type) return `ERP rejected the change (${payload.exc_type}).`;

  return payload?.message || `ERP request failed with HTTP ${status}`;
}

/**
 * Frappe wants `Authorization: token key:secret`. The env vars are written both
 * ways across environments, so the scheme is added when it is missing rather
 * than assumed either way.
 */
function authHeader(token) {
  const value = String(token || "").trim();
  if (!value) return "";
  return /^(token|bearer|basic)\s/i.test(value) ? value : `token ${value}`;
}

/**
 * Reads env by computed name. Writing `process.env.NEXT_PUBLIC_X` directly gets
 * the value inlined into the build output, which would bake an ERP credential
 * into a chunk and make rotating it a rebuild; an index defeats that, the same
 * way lib/graphql-endpoints does by walking process.env.
 */
function readEnv(name) {
  return process.env[name] || "";
}

/**
 * lib/graphql-endpoints only matches the suffixed `NEXT_PUBLIC_GRAPHQL_ENDPOINT_{KEY}`
 * form, but the deployed env sets the bare `NEXT_PUBLIC_GRAPHQL_ENDPOINT` and
 * `NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN`. Those are folded in here as the unnamed ("")
 * endpoint, so a single-ERP deployment needs no key at all.
 */
function discoverErp() {
  const endpoints = { ...getEndpoints() };
  const tokens = { ...getTokens() };

  const bareEndpoint = readEnv("NEXT_PUBLIC_GRAPHQL_ENDPOINT");
  const bareToken = readEnv("NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN");
  if (!endpoints[""] && bareEndpoint) endpoints[""] = bareEndpoint;
  if (!tokens[""] && bareToken) tokens[""] = bareToken;

  return { endpoints, tokens };
}

/**
 * The endpoint key is the {KEY} half of NEXT_PUBLIC_GRAPHQL_ENDPOINT_{KEY}, but
 * a whole variable name is the obvious thing to paste into a field asking for
 * one - so the prefix is stripped instead of being rejected. Pasting the bare
 * variable name leaves nothing behind, which reads as "use the default".
 */
function normalizeEndpointKey(key) {
  return String(key || "")
    .trim()
    .toUpperCase()
    .replace(/^NEXT_PUBLIC_GRAPHQL_(?:ENDPOINT|AUTH_TOKEN)_?/, "")
    .replace(/^_+|_+$/g, "");
}

/**
 * The endpoint comes from the same env convention the rest of the app reads -
 * NEXT_PUBLIC_GRAPHQL_ENDPOINT_{KEY} with NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_{KEY} -
 * so a picture is written to the instance the profile was read from. `key` lets
 * the caller name that instance; without one, the default endpoint is used.
 * ERP_GRAPHQL_URL / ERP_GRAPHQL_TOKEN stay as a fallback for local setups.
 */
function erpConfig(key) {
  const { endpoints, tokens } = discoverErp();
  // Read straight from the maps rather than through getEndpointConfig: the
  // unnamed endpoint's key is "", and that helper treats a falsy key as absent.
  const keys = Object.keys(endpoints).filter((name) => endpoints[name]);
  const pick = (name) => ({ endpointUrl: endpoints[name], authToken: authHeader(tokens[name]) });

  const wanted = normalizeEndpointKey(key);

  // A named key is never guessed at - writing an avatar to the wrong instance
  // is exactly the prod/UAT mixup that should be an error, not a fallback.
  if (wanted) {
    const match = keys.find((name) => name.toUpperCase() === wanted);
    if (!match) {
      const known = keys.filter(Boolean).join(", ") || "none (only an unnamed endpoint)";
      throw new Error(`"${key}" is not a configured ERP endpoint key. Configured keys: ${known}.`);
    }
    const named = pick(match);
    if (!named.authToken) throw new Error(`No NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_${match} is set.`);
    return named;
  }

  const preferred = readEnv("NEXT_PUBLIC_GRAPHQL_DEFAULT_ENDPOINT");
  const chosen = preferred && endpoints[preferred] ? preferred : keys[0];
  if (chosen !== undefined) {
    const config = pick(chosen);
    if (config.endpointUrl && config.authToken) return config;
  }

  const endpointUrl = process.env.ERP_GRAPHQL_URL || "";
  const authToken = authHeader(process.env.ERP_GRAPHQL_TOKEN);
  if (!endpointUrl || !authToken) {
    throw new Error(
      "No ERP endpoint is configured. Set NEXT_PUBLIC_GRAPHQL_ENDPOINT_{KEY} with NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_{KEY}, or ERP_GRAPHQL_URL with ERP_GRAPHQL_TOKEN."
    );
  }
  return { endpointUrl, authToken };
}

/** Frappe returns `/files/…`; the browser needs the ERP origin in front of it. */
function absoluteFileUrl(fileUrl, endpointUrl) {
  if (!fileUrl) return "";
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  try {
    return new URL(fileUrl, new URL(endpointUrl).origin).toString();
  } catch {
    return fileUrl;
  }
}

async function runGraphQL(query, variables, { endpointUrl, authToken }) {
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authToken },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length || payload.exc_type) {
    throw new Error(readErpError(payload, response.status));
  }
  return payload.data;
}

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

/**
 * Blocks a picture change posted from another site. This is NOT a substitute for
 * checking who is asking: the route still takes the target user id on trust, so
 * anyone who can load the app can set any ERP user's picture. Closing that needs
 * a verified session (a Firebase ID token checked here, with the target read
 * from the token rather than the body).
 */
function isSameOrigin(req) {
  const source = req.headers.origin || req.headers.referer;
  if (!source) return true; // Same-origin fetches may send neither header.

  const host = req.headers.host;
  if (!host) return false;

  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
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
