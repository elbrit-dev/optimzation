import { format,startOfDay, endOfDay  } from "date-fns";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";

export function mapFormToErpTodo(values, resolvers) {
  const employeeId = values.allocated_to

  const email = resolvers.getEmployeeEmailById(employeeId);

  if (!email) {
    throw new Error("Unable to resolve employee email");
  }

  return {
    doctype: "ToDo",
    description: values.description || values.title,
    status: values.todoStatus,
    priority: values.priority,
    date: format(values.endDate, "yyyy-MM-dd"),
    allocated_to: email,
    assigned_by: LOGGED_IN_USER.id,
    docstatus: 0,
  };
}
  export function mapErpTodoToCalendar(todo) {
    const start = startOfDay(new Date(`${todo.date}T00:00:00`));
    const end = endOfDay(new Date(`${todo.date}T00:00:00`));
  
    return {
      erpName: todo.name,
      title: `To Do List-${todo.name}`,
      description: todo.description,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      tags: "Todo List",
      color: "orange",
      isTodo: true,
      status: todo.status,
      priority: todo.priority,
      allocated_to:todo.allocated_to__name || todo.allocated_to,
    };
  }
  
  
  