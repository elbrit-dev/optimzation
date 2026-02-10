// lib/adapters/employee-to-calendar-user.js

export function mapEmployeesToCalendarUsers(employees = []) {
    return employees.map((emp) => ({
      id: emp.name,          // ⬅ used everywhere already
      name: emp.employee_name,        // ⬅ what you want to display
      email: emp.company_email,
      role: emp.designation?.name ?? null,
      status: "Active",
      roleId:emp.role_id
    }));
  }
  