"use client";

import { useState, useMemo } from "react";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { Button } from "@calendar/components/ui/button";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { isBefore, startOfDay, endOfDay } from "date-fns";
import { TAG_IDS, getAvailableTags } from "@calendar/components/calendar/constants";
import { motion, AnimatePresence } from "framer-motion";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { resolveLoggedInRoleId, resolveOwnHqOptions } from "@calendar/lib/employeeHeirachy";
import { doctorVisitBlockReason, isEmployeeOnApprovedLeave } from "@calendar/lib/calendar/leaveDay";
import { TRAVEL_MODES, canUseTravelRequest, normalizeTravelMode, resolveTravelRequester } from "@calendar/components/calendar/module/travel-request/helpers/travel-request.helper";
import {
  Plus,
  Building2, Users, Cake, Calendar, Stethoscope, ListChecks, HelpCircle, Plane, Car, Hotel,
} from "lucide-react";

export const ICON_MAP = {
  [TAG_IDS.LEAVE]: Calendar,                // Time off / out of office
  [TAG_IDS.HQ_TOUR_PLAN]: Building2,     // Office / headquarters visit
  [TAG_IDS.MEETING]: Users,              // Group discussion
  // [TAG_IDS.BIRTHDAY]: Cake,              // Celebration
  [TAG_IDS.DOCTOR_VISIT_PLAN]: Stethoscope, // Medical appointment
  [TAG_IDS.TODO_LIST]: ListChecks,       // Tasks / checklist
  [TAG_IDS.TRAVEL_REQUEST]: Plane,       // Flight / cab / hotel request
  [TAG_IDS.OTHER]: HelpCircle,           // Uncategorized / miscellaneous
};

const TRAVEL_MODE_ICON_MAP = {
  [TRAVEL_MODES.FLIGHT]: Plane,
  [TRAVEL_MODES.TAXI]: Car,
  [TRAVEL_MODES.HOTEL]: Hotel,
};

// A travel request shows what is being booked; everything else, its type.
export function getEventIcon(event) {
  if (event?.tags === TAG_IDS.TRAVEL_REQUEST) {
    return TRAVEL_MODE_ICON_MAP[normalizeTravelMode(event.travelMode)] ?? ICON_MAP[TAG_IDS.TRAVEL_REQUEST];
  }
  return ICON_MAP[event?.tags];
}

export default function MobileAddEventBar({ date: propDate }) {
  const {
    selectedDate,
    events,
    allEvents,
    users,
    allEmployeeOptions,
    elbritRoleEdges,
    hqTerritoryOptions,
    enabledTagIds,
    tagRoleLoading,
  } = useCalendar();
  const [showTags, setShowTags] = useState(false);

  const date = useMemo(
    () => propDate ?? selectedDate ?? new Date(),
    [propDate, selectedDate]
  );
  const matchedHqEvent = useMemo(() => {
    if (!date || !allEvents?.length) return null;

    const selectedDay = startOfDay(new Date(date));

    return allEvents.find((ev) => {
      if (ev.tags !== TAG_IDS.HQ_TOUR_PLAN) return false;

      const isParticipant = ev.participants?.some(
        (p) => p.id === LOGGED_IN_USER.id
      );

      if (!isParticipant) return false;

      const planStart = startOfDay(new Date(ev.startDate));
      const planEnd = endOfDay(new Date(ev.endDate));

      return (
        selectedDay >= planStart &&
        selectedDay <= planEnd
      );
    });
  }, [allEvents, date]);
  const resolvedLoggedInRoleId = useMemo(
    () => resolveLoggedInRoleId(users),
    [users]
  );
  const loggedInEmployeeHqTerritory = useMemo(() => {
    const matchById = allEmployeeOptions.find(
      (employee) => String(employee.value) === String(LOGGED_IN_USER.id)
    );
    if (matchById?.hqTerritory) return matchById.hqTerritory;

    const matchByEmail = allEmployeeOptions.find(
      (employee) =>
        employee.email &&
        LOGGED_IN_USER.email &&
        employee.email.toLowerCase() === LOGGED_IN_USER.email.toLowerCase()
    );
    if (matchByEmail?.hqTerritory) return matchByEmail.hqTerritory;

    if (hqTerritoryOptions.length === 1) {
      return hqTerritoryOptions[0]?.value ?? null;
    }

    return null;
  }, [allEmployeeOptions, hqTerritoryOptions]);

  // EVERY ROLE books DR Tour Plans and Other Work directly, the way a BE
  // always did: the HQ is picked on the DR form from the user's own team HQs
  // (see resolveOwnHqOptions), so there is no HQ Tour Plan step. Someone with
  // no HQ anywhere in their team still plans HQ first.
  const hasValidHqTourPlan = !!matchedHqEvent;
  const canCreateDoctorVisitDirectly =
    resolveOwnHqOptions(allEmployeeOptions, elbritRoleEdges, resolvedLoggedInRoleId, loggedInEmployeeHqTerritory).length > 0;
  // Only one HQ Tour Plan per person per day is allowed, and the form rejects a
  // second one on save. Once the day already has one, stop offering the tag
  // rather than offering it and then refusing it.
  const shouldHideHqTourPlanTag =
    canCreateDoctorVisitDirectly || hasValidHqTourPlan;

  // The "+" tags start from the types this deployment actually offers — the same
  // enabled/disabled rule (eventTypes / eventTypesMode) the event form applies —
  // and only then drop the ones this user/day can't create. Iterating raw TAGS
  // here was leaking disabled types onto the mobile bar.
  const availableTags = useMemo(() => {
    return getAvailableTags(enabledTagIds).filter((tag) => {
      // Whether the user is a BE isn't known until the role and HQ load; until
      // then offer neither HQ nor DR Tour Plan instead of the wrong one.
      if (
        tagRoleLoading &&
        (tag.id === TAG_IDS.HQ_TOUR_PLAN ||
          tag.id === TAG_IDS.DOCTOR_VISIT_PLAN ||
          tag.id === TAG_IDS.OTHER)
      ) {
        return false;
      }
      if (tag.id === TAG_IDS.HQ_TOUR_PLAN) return !shouldHideHqTourPlanTag;
      // Other Work follows the DR Tour Plan rule the form enforces: offered to
      // anyone with an HQ in their team, no HQ Tour Plan needed.
      if (tag.id === TAG_IDS.OTHER) {
        return hasValidHqTourPlan || canCreateDoctorVisitDirectly;
      }
      if (tag.id === TAG_IDS.DOCTOR_VISIT_PLAN) {
        // Not offered on a day with the user's own leave.
        if (doctorVisitBlockReason(allEvents, LOGGED_IN_USER.id, date)) return false;
        return hasValidHqTourPlan || canCreateDoctorVisitDirectly;
      }
      if (tag.id === TAG_IDS.TRAVEL_REQUEST) {
        return canUseTravelRequest(
          resolveTravelRequester(users, LOGGED_IN_USER),
          elbritRoleEdges
        );
      }
      return true;
    });
  }, [
    enabledTagIds,
    users,
    elbritRoleEdges,
    shouldHideHqTourPlanTag,
    hasValidHqTourPlan,
    canCreateDoctorVisitDirectly,
    tagRoleLoading,
    allEvents,
    date,
  ]);

  const isPastDate = isBefore(
    startOfDay(date),
    startOfDay(new Date())
  );

  if (isPastDate) return null;

  // Own approved leave on this day - same rule as the desktop header's Add
  // Event button, applied here to the mobile "+" bar as a whole.
  const isLeaveDay = isEmployeeOnApprovedLeave(
    allEvents,
    LOGGED_IN_USER.id,
    date
  );

  // Nothing left to create (every type disabled, or none allowed today) — the
  // "+" would open an empty menu, so it greys out like the leave-day case.
  const hasNoCreatableTag = availableTags.length === 0;

  return (
    <>
      {/* Blur background (BEHIND tags) */}
      <AnimatePresence>
        {showTags && (
          <motion.div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowTags(false)}
          />
        )}
      </AnimatePresence>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="mx-4 mb-4 flex items-center justify-between rounded-xl border bg-background bg-white p-2 shadow-lg">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {date.toLocaleDateString("en-US", { weekday: "long" })}
            </span>
            <span className="text-sm font-medium">
              {date.toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>

          {/* Plus + expanding tags */}
          <div className="relative">
            <AnimatePresence>
              {showTags && (
                <motion.div
                  className="absolute bottom-14 right-0 z-50 flex flex-col gap-3 items-end"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  {availableTags.map((tag, index) => {
                      const Icon = ICON_MAP[tag.id];

                      return (
                        <motion.div
                          key={tag.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                        >
                          <AddEditEventDialog
                            startDate={date}
                            defaultTag={tag.id}
                          >
                            <Button
                              className="flex items-center gap-3 rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-lg"
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <Icon className="h-4 w-4" />
                              {tag.label}
                            </Button>
                          </AddEditEventDialog>

                        </motion.div>
                      );
                    })}
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
              onClick={() => setShowTags((v) => !v)}
              disabled={isLeaveDay || hasNoCreatableTag}
              title={
                isLeaveDay
                  ? "You're on leave on this day"
                  : hasNoCreatableTag
                    ? "No event types available"
                    : undefined
              }
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
