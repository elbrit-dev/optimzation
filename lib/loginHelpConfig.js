import { erpFetch } from "./erpServer";

/**
 * Shared config for the login-help / report form's two routes.
 *
 * Lives outside the handlers because /api/hr/ticket-status has to look in the
 * SAME project the submit route would file into — otherwise it reports "no
 * ticket open", the form offers to send, and the submit route then refuses as
 * a duplicate.
 *
 * All confirmed against ERP: "LoginIssue" is BUG-0002, "BUGS - IT" is
 * PROJ-0011, hr@elbrit.org and vishnuk.mis@elbrit.org are both enabled Users.
 */
const VARIANT_DEFAULTS = {
  login: {
    project: "LoginIssue",
    assignee: "hr@elbrit.org",
    subject: (id, name) => `Cannot log in: ${id}${name ? ` — ${name}` : ""}`,
  },
  "in-app": {
    project: "BUGS - IT",
    // NOTE: vishnuk.mis@elbrit.org, with the k — "vishnu.mis@elbrit.org" does
    // not exist as an ERP User. A wrong address here fails quietly (assignment
    // errors are swallowed so they can't lose the ticket), leaving reports
    // filed but unassigned and unnoticed.
    assignee: "vishnuk.mis@elbrit.org",
    // The gist leads so support can triage the ERP list view without opening
    // each ticket; the reporter trails it in one bracketed piece, so the line
    // doesn't read as three separate headings.
    subject: (id, name, gist) => {
      const who = name ? `${name} (${id})` : id;
      return `${gist || "App issue"} — ${who}`;
    },
  },
};

export function variantDefaults(variant) {
  return VARIANT_DEFAULTS[variant === "in-app" ? "in-app" : "login"];
}

export function pick(...values) {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * Accepts a project ID ("BUG-0002") or a human project_name ("LoginIssue") so
 * the prop can hold whichever the team quotes. Returns null if it can't be
 * resolved — the Task is still created, just unfiled, because losing the ticket
 * is worse than misfiling it.
 */
export async function resolveProject(setting, creds) {
  if (!setting) return null;

  try {
    if (/^(PROJ|BUG)-/i.test(setting)) return setting;

    const json = await erpFetch("/api/resource/Project", {
      creds,
      query: {
        filters: [["project_name", "=", setting]],
        fields: ["name"],
        limit_page_length: 1,
      },
    });
    return json?.data?.[0]?.name ?? null;
  } catch (err) {
    console.error("[login-help] project resolve failed", err?.message);
    return null;
  }
}

/**
 * What to put at the front of an in-app ticket subject, now that the form asks
 * for no description at all.
 *
 * Their own words if there are any; otherwise the first thing the browser
 * actually complained about, which is usually a better subject line than
 * anything a person under pressure would have typed.
 */
export function summarizeProblem(note, diagnostics) {
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 70);

  if (note) return clean(note);

  const logs = Array.isArray(diagnostics?.logs) ? diagnostics.logs : [];
  const firstError = logs.find((l) =>
    ["error", "uncaught", "unhandled-rejection"].includes(String(l?.level))
  );
  return firstError ? clean(firstError.text) : "";
}
