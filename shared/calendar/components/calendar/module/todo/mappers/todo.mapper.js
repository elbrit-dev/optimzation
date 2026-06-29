import { format,startOfDay, endOfDay } from "date-fns";
import { DEFAULT_COLORS, TAG_IDS } from "@calendar/components/calendar/constants";
import { normalizeChecklistFromERP,normalizeChecklistToERP } from "@calendar/components/calendar/module/todo/helpers/checklist.helper";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { normalizeStatus } from "@calendar/components/calendar/helpers";

export function mapErpTodoToCalendar(todo) {
  const ownerEmployeeId = todo.assigned_by ?? undefined;
  const ownerFullName =
    todo.ownerFullName ??
    todo.owner?.fullName ??
    undefined;
  const ownerEmail =
    todo.ownerEmail ??
    todo.owner?.email ??
    undefined;

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
    title: todo.custom_subject || todo.title || "Todo List",
    description: normalizeChecklistFromERP(todo.description),
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    tags: TAG_IDS.TODO_LIST,
    color: DEFAULT_COLORS.TODO,
    isTodo: true,
    status:normalizeStatus(todo.status),
    priority:
      todo.priority?.charAt(0) +
      todo.priority?.slice(1).toLowerCase(),
    ownerEmployeeId,
    ownerFullName,
    ownerEmail,
    owner: ownerEmployeeId
      ? {
          id: ownerEmployeeId,
          email: ownerEmail,
          fullName: ownerFullName,
        }
      : undefined,
    allocated_to:
      todo.allocated_to__name || todo.allocated_to,
    assignedTo
  };
}

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

export function enrichTodoOwner(todo, resolvers) {
  if (!todo?.ownerEmployeeId || !resolvers) {
    return todo;
  }

  const ownerFullName =
    todo.ownerFullName ??
    resolvers.getEmployeeNameById(todo.ownerEmployeeId) ??
    undefined;
  const ownerEmail =
    todo.ownerEmail ??
    resolvers.getEmployeeEmailById(todo.ownerEmployeeId) ??
    undefined;

  return {
    ...todo,
    ownerFullName,
    ownerEmail,
    owner: {
      id: todo.ownerEmployeeId,
      email: ownerEmail,
      fullName: ownerFullName,
    },
  };
}
