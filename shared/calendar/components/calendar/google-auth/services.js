import { GOOGLE_CALENDAR, SAVE_GOOGLE_CALENDAR } from "@calendar/components/calendar/google-auth/queries";
import { graphqlRequest } from "@calendar/lib/graphql-client";

export async function getGoogleCalendar(name) {
  const data = await graphqlRequest(
    GOOGLE_CALENDAR,
    { name }
  );

  return data?.GoogleCalendar || null;
}

export async function saveGoogleCalendar(doc) {
  const data = await graphqlRequest(
    SAVE_GOOGLE_CALENDAR,
    {
      doc: JSON.stringify(doc),
    }
  );

  return data?.saveDoc?.doc;
}