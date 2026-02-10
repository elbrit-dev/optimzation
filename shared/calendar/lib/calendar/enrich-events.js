export function enrichEventsWithParticipants(
  events,
  employeeOptions,
  doctorOptions
) {
  return events.map(event => {
    if (!event.event_participants) return event;

    const participants = event.event_participants.map(p => {
      if (p.reference_doctype === "Employee") {
        const emp = employeeOptions.find(
          e => e.value === p.reference_docname
        );
        return {
          type: "Employee",
          id: p.reference_docname,
          name: emp?.label ?? p.reference_docname,
          attending: p.attending,
          kly_lat_long: p.kly_lat_long,
        };
      }

      if (p.reference_doctype === "Lead") {
        const doc = doctorOptions.find(
          d => d.value === p.reference_docname
        );
        return {
          type: "Lead",
          id: p.reference_docname,
          name: doc?.label ?? p.reference_docname,
          attending: p.attending,
          kly_lat_long: p.kly_lat_long,
        };
      }

      return null;
    }).filter(Boolean);

    return {
      ...event,
      participants, // 🔑 always UI-ready
    };
  });
}
