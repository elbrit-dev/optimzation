import {
    startOfDay,
    endOfDay,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
  } from "date-fns";
  
  export function resolveCalendarRange(view, date) {
    switch (view) {
      case "day":
        return { start: startOfDay(date), end: endOfDay(date) };
  
      case "week":
        return { start: startOfWeek(date), end: endOfWeek(date) };
  
      case "month":
        return { start: startOfMonth(date), end: endOfMonth(date) };
  
      // case "year4":
      //   return {
      //     start: new Date(date.getFullYear() - 2, 0, 1),
      //     end: new Date(date.getFullYear() + 2, 11, 31),
      //   };
  
      case "agenda":
      default:
        return {
          start: new Date(2025, 0, 1),
          end: new Date(2100, 11, 31),
        };
    }
  }
  