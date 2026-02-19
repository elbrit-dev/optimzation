import { Calendar, Clock, Text, User } from "lucide-react";
import { resolveDisplayValueFromEvent } from "@calendar/lib/calendar/resolveDisplay";

const ICONS = {
  owner: User,
  date: Calendar,
  datetime: Clock,
  text: Text,
};

export function EventDetailsFields({ event, config, use24HourFormat }) {
  if (!config?.details?.fields) return null;
  // const participants =
  //   event?.participants?.filter(
  //     (x) => x.type === "Employee"
  //   ) || [];
  return (
    <div className="space-y-4">
      {config.details.fields.map((field) => {
        const Icon = ICONS[field.type] ?? Text;
        const value = resolveDisplayValueFromEvent({
          event,
          field,
          use24HourFormat,
        });
        if (!value) return null;
        return (
          <div key={field.key} className="flex items-start gap-2">
            <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{field.label}</p>

              {/* 1️⃣ Description */}
              {field.key === "description" && (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: value }}
                />
              )}

              {/* 2️⃣ Employee Table */}
              {/* {field.key === "employee" && (
                <div className="mt-2 overflow-x-auto">
                  <ParticipantsTable participants={participants} />
                </div>
              )} */}

              {/* 3️⃣ Default Value (only if not description or employee) */}
              {field.key !== "description" &&
                field.key !== "employee" && (
                  <p className="text-sm text-muted-foreground">
                    {value}
                  </p>
                )}
            </div>

          </div>
        );
      })}
    </div>
  );
}

// function ParticipantsTable({ participants }) {
//   return (
//     <div className="w-full overflow-hidden">
//       <table className="w-full table-fixed border border-border text-sm">
//         <thead className="bg-muted">
//           <tr>
//             <th className="w-1/4 md:w-1/4 border p-2 md:px-3 md:py-2 text-left">
//               Employee
//             </th>

//             <th className="w-1/4 md:w-1/6 border p-2 md:px-3 md:py-2 text-center">
//               Visited
//             </th>

//             <th className="w-1/4 md:w-7/12 border p-2 md:px-3 md:py-2 text-left">
//               Location
//             </th>
//           </tr>
//         </thead>

//         <tbody>
//           {participants?.length ? (
//             participants.map((participant, index) => (
//               <tr key={index} className="border-t">
//                 <td className="w-1/4 md:w-1/4 border p-2 md:px-3 md:py-2 break-words">
//                   {participant.name || "-"}
//                 </td>

//                 <td className="w-1/4 md:w-1/6 border p-2 md:px-3 md:py-2 text-center">
//                   {participant.attending || "No"}
//                 </td>

//                 <td className="w-1/4 md:w-7/12 border p-2 md:px-3 md:py-2 break-all font-mono text-xs">
//                   {participant.kly_lat_long || "-"}
//                 </td>
//               </tr>
//             ))
//           ) : (
//             <tr>
//               <td
//                 colSpan={3}
//                 className="px-3 py-2 text-center text-muted-foreground"
//               >
//                 No participants found
//               </td>
//             </tr>
//           )}
//         </tbody>
//       </table>
//     </div>
//   );
// }
