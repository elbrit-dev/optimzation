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

  if (!res.ok) {
    throw new Error(json?.message || `HTTP ${res.status}`);
  }

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return json.data;
}
