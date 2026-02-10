import { useMemo } from "react";

export function useEmployeeResolvers(employeeOptions = []) {
  return useMemo(() => {
    const emailToId = new Map();
    const idToEmail = new Map();

    for (const e of employeeOptions) {
      if (e && e.email && e.value) {
        emailToId.set(e.email, e.value);
        idToEmail.set(e.value, e.email);
      }
    }

    return {
      getEmployeeIdByEmail(email) {
        return email ? emailToId.get(email) || null : null;
      },

      getEmployeeEmailById(id) {
        return id ? idToEmail.get(id) || null : null;
      },
    };
  }, [employeeOptions]);
}
