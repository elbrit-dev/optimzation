// lib/adapters/employee-to-calendar-user.js

export function mapEmployeesToCalendarUsers(employees = []) {
    return employees.map((emp) => ({
      id: emp.name,          // ⬅ used everywhere already
      name: emp.employee_name,        // ⬅ what you want to display
      // user_id is the actual ERP User a DocShare must reference, so it comes
      // first; company_email can be a different address that is not a User at
      // all (ds.rajanna@ vs the rajanna.abm@ login), and sharing to it fails.
      email: emp.user_id || emp.company_email,
      role: emp.designation?.name ?? null,
      status: "Active",
      leave_approver:emp.leave_approver?.name ?? null,
      roleId:emp.role_id
    }));
  }
  