// pages/api/field-expenses/my-days.js
//
// GET ?month=YYYY-MM&endpoint=<ERP GraphQL URL>
//     header x-erp-token: the signed-in user's ERP token
//
// The planner's Field layer (days, visits, TA and DA) comes from the Field
// expenses console, as the console has it: nothing is recomputed here. See
// lib/fieldExpensesConsole.js.
//
// The ERP is asked one thing only: who the token belongs to. That user's
// Employee record decides whose days are returned. A query parameter naming an
// employee would let anyone read anyone's GPS and pay.

import { allowedErpHosts } from "../../../lib/erpServer";
import { consoleMonth } from "../../../lib/fieldExpensesConsole";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const authHeader = (token) => (/^(token|bearer)\s/i.test(token) ? token : `token ${token}`);

/* The ERP user behind the token, then their Employee code. */
async function employeeFor(origin, token) {
  const headers = { Authorization: authHeader(token), Accept: "application/json" };
  const who = await fetch(`${origin}/api/method/frappe.auth.get_logged_user`, { headers, redirect: "manual" });
  if (!who.ok) return { status: who.status === 401 || who.status === 403 || (who.status >= 300 && who.status < 400) ? 401 : 502 };
  const user = (await who.json())?.message;
  if (!user || user === "Guest") return { status: 401 };

  const q = new URLSearchParams({
    filters: JSON.stringify([["user_id", "=", user]]),
    fields: JSON.stringify(["name"]),
    limit_page_length: "1",
  });
  const emp = await fetch(`${origin}/api/resource/Employee?${q}`, { headers, redirect: "manual" });
  if (!emp.ok) return { status: 502 };
  const code = (await emp.json())?.data?.[0]?.name;
  return code ? { code, user } : { status: 404, user };
}


export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  res.setHeader("Cache-Control", "private, no-store");

  const token = String(req.headers["x-erp-token"] || "").trim();
  const month = String(req.query?.month || "").trim();
  let origin;
  try {
    const url = new URL(String(req.query?.endpoint || ""));
    if (!allowedErpHosts().has(url.host.toLowerCase())) throw new Error("host");
    origin = url.origin;
      } catch {
    return res.status(400).json({ error: "That ERP is not one this app talks to." });
  }
  if (!token) return res.status(401).json({ error: "Sign in again to see your TA/DA." });
  if (!MONTH.test(month)) return res.status(400).json({ error: "Month must look like 2026-10." });

  let who;
  try {
    who = await employeeFor(origin, token);
  } catch (error) {
    console.error("Field expenses: ERP unreachable", error);
    return res.status(502).json({ error: "The ERP could not be reached." });
  }
  if (who.status === 401) return res.status(401).json({ error: "Sign in again to see your TA/DA." });
  if (who.status === 404) return res.status(404).json({ error: "No Employee record is linked to your login." });
  if (who.status) return res.status(502).json({ error: "The ERP could not confirm who you are." });

  try {
    const data = await consoleMonth(month, who.code);
    if (!data) return res.status(404).json({ error: `TA/DA for ${month} is not in the Field expenses console yet.`, code: "no-month" });
    return res.status(200).json(data);
  } catch (error) {
    console.error("Field expenses: console unreachable", error);
    return res.status(502).json({ error: "The Field expenses console could not be reached." });
  }
}
