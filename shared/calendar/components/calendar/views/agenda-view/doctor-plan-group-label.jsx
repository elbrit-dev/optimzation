import { Stethoscope } from "lucide-react";

export function getPlanOwnerId(event) {
  return String(event?.ownerEmployeeId ?? event?.owner?.id ?? "unknown");
}

export function getPlanGroupKey(event) {
  return `${event?.hqTerritory || "No-HQ"}::${getPlanOwnerId(event)}`;
}

export function resolvePlanCreatorName(events, users = []) {
  const ownerEvent = events.find(
    (event) =>
      event?.ownerFullName ||
      event?.owner?.fullName ||
      event?.ownerEmployeeId ||
      event?.owner?.id
  );
  const ownerId = getPlanOwnerId(ownerEvent);

  return (
    ownerEvent?.ownerFullName ||
    ownerEvent?.owner?.fullName ||
    users.find((user) => String(user.id) === ownerId)?.name ||
    (ownerId !== "unknown" ? ownerId : "Unknown")
  );
}

export function DoctorPlanGroupLabel({ hqName, doctorCount, creatorName }) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 text-[11px] leading-4 sm:text-xs">
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {hqName || "No-HQ"}
      </span>
      <span>-{doctorCount}-</span>
      <Stethoscope
        aria-label="Doctor"
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
      />
      <span>-Plan-</span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{creatorName}</span>
    </span>
  );
}
