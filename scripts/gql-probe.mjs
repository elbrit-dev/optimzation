/**
 * Probe the doctor page's ERP reads over GraphQL, field by field.
 *
 * WHY IT EXISTS: the question this answers is whether the five doctor reads can
 * be collapsed into ONE GraphQL document. That is not a style question. In
 * frappe_graphql a single unresolvable field 400s the WHOLE document, so one
 * combined query makes every section of the page share one failure: the hero,
 * the totals, the trend and the table all go blank together. The page is built
 * REST-first with a per-doctype GraphQL fallback precisely to avoid that.
 *
 * So this runs each root field ON ITS OWN, then runs them combined, and prints
 * both. If every part succeeds alone and the combined query also succeeds, the
 * merge is safe for this doctor. If a part fails alone, the combined query
 * cannot work at all -- and the per-part run is what names the culprit, which a
 * combined 400 never does.
 *
 *   node scripts/gql-probe.mjs DR-56679
 *   node scripts/gql-probe.mjs DR-56679 --target ERP
 *
 * Needs NEXT_PUBLIC_GRAPHQL_ENDPOINT_<TARGET> and the matching
 * NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_<TARGET> in .env (see the block at its end).
 * Reads .env itself so it does not need Next running.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * .env here has been written as UTF-16LE with no BOM before now, which
 * `toString()` turns into "N\0E\0X\0T..." and every regex then misses. Sniff a
 * NUL in the first bytes rather than trusting a BOM.
 */
function loadEnv(file) {
  let buf;
  try { buf = readFileSync(join(ROOT, file)); } catch { return {}; }
  const utf16 = buf.length > 1 && buf.includes(0, 0, Math.min(buf.length, 64));
  const txt = utf16 ? buf.toString("utf16le") : buf.toString("utf8");
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.local"), ...process.env };

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const doctor = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--target");

const target = (flag("--target", env.ERP_TARGET || env.NEXT_PUBLIC_GRAPHQL_DEFAULT_ENDPOINT || "UAT")).toUpperCase();
const endpoint = env["NEXT_PUBLIC_GRAPHQL_ENDPOINT_" + target];
const token = env["NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_" + target];

if (!doctor) {
  console.error("usage: node scripts/gql-probe.mjs <LEAD-ID> [--target ERP|UAT]");
  process.exit(2);
}
if (!endpoint || !token) {
  console.error(
    "Missing credentials for target " + target + ".\n" +
    "  NEXT_PUBLIC_GRAPHQL_ENDPOINT_" + target + " = " + (endpoint ? "set" : "EMPTY") + "\n" +
    "  NEXT_PUBLIC_GRAPHQL_AUTH_TOKEN_" + target + " = " + (token ? "set" : "EMPTY") + "\n" +
    "Paste both into .env (the block at its end), then re-run."
  );
  process.exit(2);
}

/*
 * A stored token may already carry the scheme ("token k:s"). Sending
 * "token " + token on top of that gives "token token k:s", which ERP rejects
 * with "Authentication required to access GraphQL schema" -- a message that
 * blames the schema and says nothing about the header that actually caused it.
 * lib/erpServer.js guards the same trap.
 */
const authHeader = /^token\s/i.test(token) ? token : "token " + token;

const url = endpoint.replace(/\/+$/, "").replace(/(\/api(?:\/method)?\/graphql|\/graphql)\/?$/i, "")
  + "/api/method/graphql";

/** One field per entry, so a failure names itself instead of taking the rest down. */
const PARTS = {
  Lead: `Lead(name: $name) {
    name lead_name first_name city custom_category__name custom_category1__name
    custom_specialty__name custom_speciality email_id customer__name
    custom_latitude custom_longitude custom_address_created
    notes { name added_by__name added_on note }
    territory { name territory_name }
    custom_role_profile {
      role_profile_list__name department__name hq__name
      role_profile_list { custom_employee_id { employee_name employee } }
    }
  }`,

  // Filtered on link_name, which is a Dynamic Link column and NOT a field on
  // Address. If frappe_graphql cannot reach through the child table this is the
  // part that proves it.
  Addresses: `Addresses(first: 10, filter: {fieldname: "link_name", operator: EQ, value: $name}) {
    edges { node { name address_title address_line1 city state pincode
      links { link_doctype__name link_name__name link_title } } }
  }`,

  // event_participants is the ONLY proof a visit happened -- the parent's own
  // `attending` is never written, so a selection without this reports every
  // planned call as made.
  Events: `Events(first: 1000, filter: {fieldname: "custom_doctor", operator: EQ, value: $name}) {
    edges { node { name subject status starts_on custom_pob_given
      custom_employee_id__name custom_department__name attending
      event_participants { reference_docname__name attending custom_visit_time custom_is_force_visit }
    } }
  }`,

  DoctorServices: `DoctorServices(first: 1000, filter: {fieldname: "doctor", operator: EQ, value: $name}) {
    edges { node { name service_amount service_date date service_name__name
      department__name role_profile__name hq__name workflow_state__name } }
  }`,

  // custom_total_amount on the PARENT is what the item rows are reconciled
  // against; without it the Unassigned remainder cannot be computed and the
  // headline total stops tying out.
  DoctorSupports: `DoctorSupports(first: 1000, filter: {fieldname: "doctor", operator: EQ, value: $name}) {
    edges { node { name date custom_total_amount custom_total_qty
      item_table { amount brand item__name qty rate
        custom_department__name custom_hq__name custom_role_profile__name } } }
  }`,

  // FILTERED on custom_doctorvisit -- a Link to the LEAD despite the name.
  // custom_event is the only attribution path for a POB (event -> visit ->
  // employee), so it is selected even though nothing displays it directly.
  Quotations: `Quotations(first: 1000, filter: {fieldname: "custom_doctorvisit", operator: EQ, value: $name}) {
    edges { node { name transaction_date customer_name total_qty grand_total status
      custom_event__name custom_doctorvisit__name
      items { item_code__name item_name qty rate net_amount } } }
  }`,
};

async function run(label, body) {
  const started = Date.now();
  let res, json;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ query: body, variables: { name: doctor } }),
    });
    json = await res.json();
  } catch (err) {
    return { label, ok: false, ms: Date.now() - started, why: "network: " + err.message };
  }
  const ms = Date.now() - started;
  const data = json?.data ?? json?.message?.data ?? null;
  const errors = json?.errors ?? json?.message?.errors ?? null;
  if (errors?.length) {
    return { label, ok: false, ms, status: res.status, why: errors.map((e) => e.message).join(" | ").slice(0, 300) };
  }
  if (!res.ok) return { label, ok: false, ms, status: res.status, why: "HTTP " + res.status };
  const counts = {};
  for (const [k, v] of Object.entries(data || {})) {
    counts[k] = Array.isArray(v?.edges) ? v.edges.length : v ? 1 : 0;
  }
  return { label, ok: true, ms, status: res.status, counts };
}

const line = (r) =>
  (r.ok ? "  OK  " : "  FAIL") + "  " + r.label.padEnd(16) +
  String(r.ms + "ms").padStart(7) + "  " +
  (r.ok ? JSON.stringify(r.counts) : r.why);

console.log("target   " + target);
console.log("endpoint " + url);
console.log("doctor   " + doctor);
console.log("\nEACH ROOT FIELD ON ITS OWN");
const solo = [];
for (const [label, body] of Object.entries(PARTS)) {
  const r = await run(label, `query P($name: String!) { ${body} }`);
  solo.push(r);
  console.log(line(r));
}

console.log("\nALL OF THEM IN ONE DOCUMENT");
const combined = await run("combined", `query P($name: String!) { ${Object.values(PARTS).join("\n")} }`);
console.log(line(combined));

const brokenAlone = solo.filter((r) => !r.ok).map((r) => r.label);
console.log("\nVERDICT");
if (brokenAlone.length) {
  console.log("  " + brokenAlone.length + " field(s) fail on their own: " + brokenAlone.join(", "));
  console.log("  A combined query cannot include those, and a combined 400 would");
  console.log("  not have told you which one was at fault.");
} else if (!combined.ok) {
  console.log("  Every field works alone but the combined document fails.");
  console.log("  That is the single-point-of-failure this script exists to catch.");
} else {
  console.log("  Every field works alone AND combined, for this doctor.");
  console.log("  Note what that does and does not prove: one bad Link field on any");
  console.log("  future selection still takes the whole document down, and a reader");
  console.log("  without Doctor Service permission is the case to test next.");
}
