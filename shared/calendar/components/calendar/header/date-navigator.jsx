import { formatDate } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@calendar/components/ui/badge";
import { cn } from "@calendar/lib/utils";
import { Button } from "@calendar/components/ui/button";
import {
    buttonHover,
    transition,
} from "@calendar/components/calendar/animations";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { startTransition } from "react";
import {
    getEventsCount,
    navigateDate,
    rangeText,
} from "@calendar/components/calendar/helpers";

const MotionButton = motion.create(Button);
const MotionBadge = motion.create(Badge);

export function DateNavigator({
    view,
    events
}) {
    const { selectedDate, setSelectedDate, setView, setMobileLayer } = useCalendar();

    const isYearView = view === "year";

    const month = formatDate(selectedDate, "MMMM");
    const year = selectedDate.getFullYear();

    const eventCount = useMemo(
        () => getEventsCount(events, selectedDate, view),
        [events, selectedDate, view]
    );

    const handlePrevious = () =>
        startTransition(() => {
            setSelectedDate(navigateDate(selectedDate, view, "previous"));
        });

    const handleNext = () =>
        startTransition(() => {
            setSelectedDate(navigateDate(selectedDate, view, "next"));
        });

    return (
        <div className="space-y-0.5">
            <div className="flex items-center gap-2">
                <div className="md:hidden flex items-center gap-1">
                    <MotionButton
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={handlePrevious}
                        variants={buttonHover}
                        whileHover="hover"
                        whileTap="tap">
                        <ChevronLeft className="h-4 w-4" />
                    </MotionButton>
                    <MotionButton
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={handleNext}
                        variants={buttonHover}
                        whileHover="hover"
                        whileTap="tap">
                        <ChevronRight className="h-4 w-4" />
                    </MotionButton>
                </div>
                <motion.button
                    type="button"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={transition}
                    disabled={isYearView}
                    className={cn(
                      "text-sm md:text-lg font-semibold block md:hidden",
                      !isYearView && "cursor-pointer"
                    )}
                    onClick={() =>
                        startTransition(() => {
                          setView("year");
                          setMobileLayer("year");
                        })
                      }                      
                >
                    {month} {year}
                </motion.button>

                <motion.span
                    className="text-sm md:text-lg font-semibold hidden md:block"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={transition}>
                    {month} {year}
                </motion.span>
                <div className="md:block hidden">
                    <AnimatePresence mode="wait" initial={false}>
                        <MotionBadge
                            key={`${selectedDate.toISOString()}-${view}`}
                            variant="secondary"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            // exit={{ scale: 0.8, opacity: 0 }}
                            transition={transition}
                        >
                            {eventCount} events
                        </MotionBadge>
                    </AnimatePresence>
                </div>
            </div>
            <div className="md:flex hidden items-center gap-2">
                <MotionButton
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handlePrevious}
                    variants={buttonHover}
                    whileHover="hover"
                    whileTap="tap">
                    <ChevronLeft className="h-4 w-4" />
                </MotionButton>

                <motion.p
                    className="md:block hidden text-sm text-muted-foreground"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={transition}>
                    {rangeText(view, selectedDate)}
                </motion.p>

                <MotionButton
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleNext}
                    variants={buttonHover}
                    whileHover="hover"
                    whileTap="tap">
                    <ChevronRight className="h-4 w-4" />
                </MotionButton>
            </div>
        </div>
    );
}
