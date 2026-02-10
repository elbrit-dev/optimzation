import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function buildCalendarParticipants(values, employeeOptions, doctorOptions) {
  const participants = [];

  if (values.employees) {
    const employeeIds = Array.isArray(values.employees)
      ? values.employees
      : [values.employees];

    employeeIds.forEach(id => {
      const emp = employeeOptions.find(e => e.value === id);
      participants.push({
        type: "Employee",
        id,
        label: emp?.label || id,
      });
    });
  }

  if (values.doctor) {
    const doc = doctorOptions.find(d => d.value === values.doctor);
    participants.push({
      type: "Lead",
      id: values.doctor,
      label: doc?.label || values.doctor,
    });
  }

  return participants;
}

