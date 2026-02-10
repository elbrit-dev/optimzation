import { PARTICIPANT_SOURCE_BY_TAG } from "@calendar/components/calendar/mocks";
import {
  fetchEmployees,fetchDoctors,fetchHQTerritories
} from "@calendar/services/participants.service";
import { getCached } from "@calendar/lib/participants-cache"
/**
 * Fetch employee / sales partner options based on selected tag
 */
export async function loadParticipantOptionsByTag({
  tag,
  employeeOptions,
  hqTerritoryOptions,
  doctorOptions,
  setEmployeeOptions,
  setDoctorOptions,
  setHqTerritoryOptions,
}) {
  if (!tag) return;

  const sources = PARTICIPANT_SOURCE_BY_TAG[tag] || [];

  if (sources.includes("EMPLOYEE") && employeeOptions.length === 0) {
    const employees = await getCached("EMPLOYEE", fetchEmployees);
    setEmployeeOptions(employees);
  }

  if (sources.includes("DOCTOR") && doctorOptions.length === 0) {
    const doctors = await getCached("DOCTOR", fetchDoctors);
    setDoctorOptions(doctors);
  }

  if (
    sources.includes("HQ_TERRITORY") &&
    hqTerritoryOptions.length === 0
  ) {
    const hqs = await getCached("HQ_TERRITORY", fetchHQTerritories);
    setHqTerritoryOptions(hqs);
  }
}