import { useMemo } from "react";

export function useEmployeeResolvers(employeeOptions = []) {
  return useMemo(() => {
    const emailToId = new Map();
    const idToEmail = new Map();
    const idToName = new Map();
    const emailToName = new Map();
    const idToEmployeeMap = new Map(); // ✅ FULL OBJECT MAP

    for (const e of employeeOptions) {
      if (!e) continue;

      if (e.value) {
        idToName.set(e.value, e.label);
        idToEmployeeMap.set(e.value, e); // ✅ store full object
      }

      if (e.email) {
        const normalizedEmail = e.email.toLowerCase();

        emailToId.set(normalizedEmail, e.value);
        idToEmail.set(e.value, normalizedEmail);
        emailToName.set(normalizedEmail, e.label);
      }
    }

    return {
      getEmployeeIdByEmail(email) {
        return email
          ? emailToId.get(email.toLowerCase()) || null
          : null;
      },

      getEmployeeEmailById(id) {
        return id ? idToEmail.get(id) || null : null;
      },

      getEmployeeNameById(id) {
        return id ? idToName.get(id) || null : null;
      },

      getEmployeeFieldById(id, field) {
        return id ? idToEmployeeMap.get(id)?.[field] ?? null : null;
      },

      getEmployeeNameByEmail(email) {
        return email
          ? emailToName.get(email.toLowerCase()) || null
          : null;
      },
    };
  }, [employeeOptions]);
}

