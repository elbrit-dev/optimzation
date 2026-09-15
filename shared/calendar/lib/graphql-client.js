import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";

// Every ERP call the calendar makes goes through this function, so it is the one
// place that can answer "what is actually slow?" on a real phone on a real
// network. Each call logs its duration under the `[erp]` prefix — filter the
// console by that to see the whole conversation with ERP in order.
//
// The duration on a FAILURE is the useful one. "Failed to fetch" is the browser
// reporting that the request never produced a response, and it says nothing
// about why. The elapsed time does:
//   ~60s   — a gateway/proxy killed the request (nginx proxy_read_timeout and
//            friends). The problem is server-side: ERP took too long to answer.
//   <1s    — CORS, DNS, TLS or no connectivity. The request never reached ERP.
const SLOW_REQUEST_MS = 3000;

// `mutation SaveEvent(...)` -> "SaveEvent". Falls back to the operation keyword
// so an anonymous query still says something useful.
function describeOperation(query) {
  const named = /\b(query|mutation)\s+(\w+)/.exec(query ?? "");
  if (named) return named[2];
  return /^\s*mutation\b/.test(query ?? "") ? "mutation" : "query";
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export async function graphqlRequest(query,
  variables = {}
) {
  const { erpUrl, authToken } = AUTH_CONFIG;
  if (!erpUrl || !authToken) {
    throw new Error("Missing ERP auth configuration");
  }

  const operation = describeOperation(query);
  const startedAt = now();
  const elapsedMs = () => Math.round(now() - startedAt);

  let res;
  try {
    res = await fetch(erpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${authToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    // No response at all. See the note above on what the timing means.
    console.error(
      `[erp] ${operation} FAILED after ${elapsedMs()}ms — no response (${error?.message ?? error})`
    );
    throw error;
  }

  const responseMs = elapsedMs();

  if (responseMs >= SLOW_REQUEST_MS) {
    console.warn(`[erp] ${operation} took ${responseMs}ms (HTTP ${res.status})`);
  } else {
    console.debug(`[erp] ${operation} ${responseMs}ms (HTTP ${res.status})`);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error("Invalid response from ERP GraphQL");
  }

  if (!res.ok || json.errors?.length) {
    let message = null;
  
    // 1️⃣ Frappe server messages (highest priority)
    if (json?._server_messages) {
      try {
        const outer = JSON.parse(json._server_messages);
  
        if (outer?.length) {
          const inner = JSON.parse(outer[0]);
  
          message = inner?.message?.replace(
            /<[^>]*>/g,
            ""
          );
        }
      } catch (e) {
        console.error(
          "Failed parsing _server_messages",
          e
        );
      }
    }
  
    // 2️⃣ GraphQL message
    if (!message && json.errors?.length) {
      message = json.errors[0].message;
    }
  
    // 3️⃣ API message
    if (!message && json?.message) {
      message = json.message;
    }
  
    // 4️⃣ fallback
    if (!message) {
      message = `HTTP ${res.status}`;
    }

    console.error(
      `[erp] ${operation} rejected after ${responseMs}ms (HTTP ${res.status}): ${message}`
    );

    throw new Error(message);
  }

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return json.data;
}
