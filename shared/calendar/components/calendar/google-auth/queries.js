export const GOOGLE_CALENDAR_BY_USER = `
query GoogleCalendars($first: Int, $filter: [DBFilterInput]) {
  GoogleCalendars(first: $first, filter: $filter) {
    edges {
      node {
        name
        calendar_name
        google_calendar_id
        refresh_token
        enable
        authorization_code
        user__name
      }
    }
  }
}
`;

export const SAVE_GOOGLE_CALENDAR = `
mutation SaveGoogleCalendar($doc: String!) {
  saveDoc(
    doctype: "Google Calendar",
    doc: $doc
  ) {
    doc {
      name
    }
  }
}
`;
export const GOOGLE_CALENDAR = `
query GoogleCalendar($name: String!) {
  GoogleCalendar(name: $name) {
    name
    calendar_name
    google_calendar_id
    refresh_token
    enable
    authorization_code
  }
}
`;