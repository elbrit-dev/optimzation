"use client";

import { useState } from "react";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { Button } from "@calendar/components/ui/button";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { isBefore, startOfDay } from "date-fns";
import { TAG_IDS, TAGS } from "@calendar/components/calendar/constants";
import { motion, AnimatePresence } from "framer-motion";
import {Plus,
  Building2, Users, Cake,Calendar, Stethoscope, ListChecks, HelpCircle,
} from "lucide-react";

export const ICON_MAP = {
  [TAG_IDS.LEAVE]: Calendar,                // Time off / out of office
  [TAG_IDS.HQ_TOUR_PLAN]: Building2,     // Office / headquarters visit
  [TAG_IDS.MEETING]: Users,              // Group discussion
  // [TAG_IDS.BIRTHDAY]: Cake,              // Celebration
  [TAG_IDS.DOCTOR_VISIT_PLAN]: Stethoscope, // Medical appointment
  [TAG_IDS.TODO_LIST]: ListChecks,       // Tasks / checklist
  [TAG_IDS.OTHER]: HelpCircle,           // Uncategorized / miscellaneous
};

export default function MobileAddEventBar({ date: propDate }) {
  const { selectedDate } = useCalendar();
  const [showTags, setShowTags] = useState(false);

  const date = propDate || selectedDate || new Date();

  const isPastDate = isBefore(
    startOfDay(date),
    startOfDay(new Date())
  );

  if (isPastDate) return null;

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
        <div className="mx-4 mb-4 flex items-center justify-between rounded-xl border bg-background p-2 shadow-lg">
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
                  {TAGS.map((tag, index) => {
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
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"
              onClick={() => setShowTags((v) => !v)}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
