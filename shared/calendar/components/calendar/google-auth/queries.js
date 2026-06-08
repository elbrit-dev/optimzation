export const GOOGLE_CALENDAR_BY_USER = `
query GoogleCalendars($first: Int, $filter: [DBFilterInput]) {
  GoogleCalendars(first: $first, filter: $filter) {
    edges {
      node {
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