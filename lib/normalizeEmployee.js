/**
 * Flattens whatever a page binds to LoginHelpForm's `employee` prop into the
 * four values the form needs: id, fullName, designation, phone.
 *
 * Deliberately permissive, because the same person arrives in three different
 * shapes depending on where you got them:
 *
 *   1. The app's `$ctx.layoutData` — the usual one. A GraphQL projection where
 *      LINK fields carry a `__name` suffix: `designation__name`, not
 *      `designation`. Miss that and the designation silently goes blank.
 *   2. A raw ERP Employee REST doc — where `name` IS the Employee ID (E00004)
 *      and `employee_name` is the person. That collision is handled here
 *      rather than in every calling page.
 *   3. A hand-built {id, name, designation, phone}.
 *
 * `name` is only used as an ID fallback, never as the person's name — in both
 * ERP shapes it holds the Employee ID.
 */
export function normalizeEmployee(employee) {
  const e = employee && typeof employee === "object" ? employee : {};
  const str = (v) => String(v ?? "").trim();
  const first = (...values) => {
    for (const value of values) {
      const s = str(value);
      if (s) return s;
    }
    return "";
  };

  return {
    id: first(e.employeeId, e.employee, e.id, e.name),
    fullName: first(e.employeeName, e.employee_name, e.fullName, e.full_name),
    designation: first(e.designation__name, e.designation, e.designation_name),
    phone: first(e.phone, e.cell_number, e.mobile, e.mobile_no, e.fsl_whatsapp_number),
  };
}
