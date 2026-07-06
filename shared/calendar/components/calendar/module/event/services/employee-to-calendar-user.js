// lib/adapters/employee-to-calendar-user.js

export function mapEmployeesToCalendarUsers(employees = []) {
    return employees.map((emp) => ({
      id: emp.name,          // ⬅ used everywhere already
      name: emp.employee_name,        // ⬅ what you want to display
      // Field employees (e.g. BEs) often have an empty company_email but a valid
      // user_id — the actual ERP User the DocShare must reference. Fall back to it
      // so hierarchy/manual DocShare sharing works for them, not just managers.
      email: emp.company_email || emp.user_id,
      role: emp.designation?.name ?? null,
      status: "Active",
      leave_approver:emp.leave_approver?.name ?? null,
      roleId:emp.role_id
    }));
  }
  