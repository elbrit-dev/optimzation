import {
  GOOGLE_CALENDAR,
  SAVE_GOOGLE_CALENDAR,
} from "@calendar/components/calendar/google-auth/queries";

// Host-owned route — lives in root pages/ so `npm run copy-shared` never
// touches it. It only imports queries.js, which IS part of the synced shared
// module, so it stays in step with upstream automatically.
//
// Pages Router equivalent of Elbrit's app/api/google-calendar/connect/route.js.

async function erpGraphql(query, variables, erpUrl, authToken) {
  const response = await fetch(erpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `token ${authToken}`,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }

  try {
    const { code, email, authToken, erpUrl } = req.body || {};

    const redirectUri = `${process.env.APP_URL}/google-callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return res.status(500).json({ success: false, tokenData });
    }

    // Get primary calendar
    const calendarResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    const calendarData = await calendarResponse.json();

    const primary = calendarData.items?.find((item) => item.primary);

    const googleCalendarId = primary?.id;

    // Verify document exists
    const existing = await erpGraphql(
      GOOGLE_CALENDAR,
      { name: email },
      erpUrl,
      authToken
    );

    if (!existing?.data?.GoogleCalendar?.name) {
      throw new Error(`Google Calendar doc not found for ${email}`);
    }

    // Update DocType
    const doc = {
      name: email,
      enable: 1,
      authorization_code: code,
      refresh_token: tokenData.refresh_token,
      google_calendar_id: googleCalendarId,
    };

    await erpGraphql(
      SAVE_GOOGLE_CALENDAR,
      { doc: JSON.stringify(doc) },
      erpUrl,
      authToken
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({ success: false, message: error.message });
  }
}
