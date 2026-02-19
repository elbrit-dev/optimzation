import { TAG_IDS } from "@calendar/components/calendar/constants";
import { saveEvent } from "@calendar/services/event.service";

export function resolveDoctorVisitState(event, loggedInUserId) {
  if (event.tags !== TAG_IDS.DOCTOR_VISIT_PLAN) {
    return {
      isDoctorVisit: false,
      isParticipant: false,
      needsLocation: false,
      hasVisited: false,
    };
  }

  const participant = event.participants?.find(
    (p) =>
      p.type === "Employee" &&
      String(p.id) === String(loggedInUserId)
  );

  const isParticipant = Boolean(participant);

  const needsLocation =
    isParticipant && !participant?.kly_lat_long;

  const hasVisited =
    isParticipant &&
    participant?.kly_lat_long &&
    participant?.attending === "Yes";

  return {
    isDoctorVisit: true,
    isParticipant,
    needsLocation,
    hasVisited,
    participant,
  };
}

export async function submitDoctorVisitLocation({
  event,
  loggedInUserId,
  removeEvent,
  addEvent,
}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latLong = `${pos.coords.latitude},${pos.coords.longitude}`;

        const updatedParticipants =
          event.event_participants.map((p) =>
            p.reference_doctype === "Employee" &&
            String(p.reference_docname) === String(loggedInUserId)
              ? {
                  ...p,
                  kly_lat_long: latLong,
                  attending: "Yes",
                }
              : p
          );

        await saveEvent({
          name: event.erpName,
          event_participants: updatedParticipants,
        });

        removeEvent(event.erpName);

        addEvent({
          ...event,
          event_participants: updatedParticipants,
          participants: event.participants.map((p) =>
            p.type === "Employee" &&
            String(p.id) === String(loggedInUserId)
              ? {
                  ...p,
                  kly_lat_long: latLong,
                  attending: "Yes",
                }
              : p
          ),
        });

        resolve(true);
      },
      reject,
      { timeout: 20000 }
    );
  });
}
