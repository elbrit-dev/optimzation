import { format, startOfDay, endOfDay } from "date-fns";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { TAG_IDS } from "@calendar/components/calendar/constants";
import { normalizeChecklistFromERP, normalizeChecklistToERP } from "@calendar/components/calendar/helpers";

export function mapFormToErpTodo(values, resolvers,options = {}) {
  const selected = values.allocated_to;
  const { erpName } = options;
  let email = null;

  if (selected?.email) {
    email = selected.email;
  } else if (selected?.value) {
    email = resolvers.getEmployeeEmailById(selected.value);
  } else if (typeof selected === "string") {
    email = resolvers.getEmployeeEmailById(selected);
  }

  if (!email) {
    throw new Error("Unable to resolve employee email");
  }

  const customAssignedTo = Array.isArray(values.assignedTo)
    ? values.assignedTo.map((empId) => ({
        employee: empId,
      }))
    : [];

  const doc = {
    doctype: "ToDo",
    custom_subject:values.title,
    description: normalizeChecklistToERP(
      values.description || values.title
    ),
    status: values.status,
    priority: values.priority,
    date: format(values.endDate, "yyyy-MM-dd"),
    allocated_to: email,
    assigned_by: LOGGED_IN_USER.id,
    custom_assigned_to: customAssignedTo,
    docstatus: 0,
  };

  // ✅ IMPORTANT: include name if editing
  if (erpName) {
    doc.name = erpName;
  }

  return doc;
}
export function mapErpTodoToCalendar(todo) {
  if (!todo?.date) {
    console.warn("Invalid todo date:", todo);
    return null;
  }

  const baseDate = new Date(todo.date);

  if (isNaN(baseDate.getTime())) {
    console.warn("Unparseable todo date:", todo.date);
    return null;
  }

  const start = startOfDay(baseDate);
  const end = endOfDay(baseDate);

  // Normalize assignedTo
  const assignedTo =
  todo?.custom_assigned_to?.length
    ? todo.custom_assigned_to.map((emp) =>
        emp.employee ?? emp.employee__name ?? null
      ).filter(Boolean)
    : [];

  return {
    erpName: todo.name,
    title: todo.custom_subject || todo.title,
    description: normalizeChecklistFromERP(todo.description),
    // description: todo.description,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    tags: TAG_IDS.TODO_LIST,
    color: "orange",
    isTodo: true,
    status:
      todo.status?.charAt(0) +
      todo.status?.slice(1).toLowerCase(),
    priority:
      todo.priority?.charAt(0) +
      todo.priority?.slice(1).toLowerCase(),
    allocated_to:
      todo.allocated_to__name || todo.allocated_to,
    assignedTo
  };
}

