import * as Sentry from "@sentry/nextjs";

/* The ERP employee behind the session, as Sentry tags on everything sent from
   here on: errors, replays and the visit location reports. Most field staff
   sign in by phone, so without this a report only says which Firebase account
   it came from. Search `employee:E00930`, `employee.name:"Venkatesan Raja"`
   or `employee.login:venkatesan930.be@elbrit.org`. No DSN: a no-op. */
const sent = {};

export function tagSentryEmployee(fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (!value || sent[key] === value) continue;
    sent[key] = value;
    try {
      Sentry.setTag(key, String(value));
    } catch {
      // Telemetry must never break the calendar.
    }
  }
}
