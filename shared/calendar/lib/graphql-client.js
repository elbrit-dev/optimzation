import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";

export async function graphqlRequest(query,
  variables = {}
) {
  const { erpUrl, authToken } = AUTH_CONFIG;
  if (!erpUrl || !authToken) {
    throw new Error("Missing ERP auth configuration");
  }
  const res = await fetch(erpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `token ${authToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

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
  
    throw new Error(message);
  }

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return json.data;
}
