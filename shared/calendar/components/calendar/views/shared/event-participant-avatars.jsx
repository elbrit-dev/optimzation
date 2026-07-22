import { useMemo } from "react";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { getAvatarColorBySeed, getFirstLetters } from "@calendar/components/calendar/helpers";
import { Avatar, AvatarFallback, AvatarImage } from "@calendar/components/ui/avatar";
import { AvatarGroup } from "@calendar/components/ui/avatar-group";
import { cn } from "@calendar/lib/utils";

function buildParticipantIds(event) {
  const ids = [];

  if (event?.ownerEmployeeId) {
    ids.push(String(event.ownerEmployeeId));
  }

  event?.participants?.forEach((participant) => {
    if (participant?.type === "Employee" && participant?.id) {
      ids.push(String(participant.id));
    }
  });

  return [...new Set(ids)];
}

export function EventParticipantAvatars({
  event,
  max = 1,
  className,
  avatarClassName,
}) {
  const { users = [] } = useCalendar();

  const participants = useMemo(() => {
    const userMap = new Map(
      users.map((user) => [String(user.id), user])
    );

    return buildParticipantIds(event)
      .map((id) => {
        const user = userMap.get(id);

        return {
          id,
          name: user?.name ?? id,
          picturePath: user?.picturePath ?? null,
        };
      });
  }, [event, users]);

  if (!participants.length) {
    return null;
  }

  return (
    <AvatarGroup className={cn("shrink-0", className)} max={max}>
      {participants.map((participant) => (
        <Avatar
          key={participant.id}
          className={cn("size-5 text-[10px]", avatarClassName)}
          title={participant.name}
        >
          <AvatarImage
            src={participant.picturePath ?? undefined}
            alt={participant.name}
          />
          <AvatarFallback
            className={cn(
              "text-[10px] font-semibold text-white",
              getAvatarColorBySeed(participant.name || participant.id)
            )}
          >
            {getFirstLetters(participant.name)}
          </AvatarFallback>
        </Avatar>
      ))}
    </AvatarGroup>
  );
}
