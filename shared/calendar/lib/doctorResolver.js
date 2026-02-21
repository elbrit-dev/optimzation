import { useMemo } from "react";

export function useDoctorResolvers(doctorOptions = []) {
    return useMemo(() => {
      const idToDoctor = new Map();
  
      doctorOptions.forEach((d) => {
        if (!d?.value) return;
        idToDoctor.set(d.value, d);
      });
  
      return {
        getDoctorNameById(id) {
          return idToDoctor.get(id)?.label ?? null;
        },
  
        getDoctorCityById(id) {
          return idToDoctor.get(id)?.city ?? null;
        },
       
        getDoctorFieldById(id, field) {
          return idToDoctor.get(id)?.[field] ?? null;
        },
      };
    }, [doctorOptions]);
  }
  