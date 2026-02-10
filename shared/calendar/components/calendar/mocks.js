import { COLORS } from "@calendar/components/calendar/constants";
import { USE_MOCK_DATA } from "@calendar/components/calendar/config";
import { CALENDAR_USERS } from "@calendar/components/auth/calendar-users";

/* =========================================================
   USERS
========================================================= */

/* =========================================================
   TAGS
========================================================= */
export const TAG_IDS = {
  LEAVE: "Leave",
  HQ_TOUR_PLAN: "HQ Tour Plan",
  DOCTOR_VISIT_PLAN: "Doctor Visit plan",
  BIRTHDAY: "Birthday",
  TODO_LIST: "Todo List",
  MEETING: "Meeting",
  OTHER: "Other",
};

export const TAGS = [
  { id: TAG_IDS.LEAVE, label: "Leave" },
  { id: TAG_IDS.HQ_TOUR_PLAN, label: "HQ Tour Plan" },
  { id: TAG_IDS.DOCTOR_VISIT_PLAN, label: "DR Tour Plan" },
  { id: TAG_IDS.BIRTHDAY, label: "DR Birthday" },
  { id: TAG_IDS.TODO_LIST, label: "Todo List" },
  { id: TAG_IDS.MEETING, label: "Meeting" },
  { id: TAG_IDS.OTHER, label: "Other" },
];
export const PARTICIPANT_SOURCE_BY_TAG = {
  [TAG_IDS.LEAVE]: ["EMPLOYEE"],
  [TAG_IDS.HQ_TOUR_PLAN]: ["HQ_TERRITORY"],
  [TAG_IDS.MEETING]: ["EMPLOYEE"],
  [TAG_IDS.BIRTHDAY]: ["DOCTOR"],
  [TAG_IDS.DOCTOR_VISIT_PLAN]: ["EMPLOYEE", "DOCTOR"],
  [TAG_IDS.TODO_LIST]: ["EMPLOYEE"],
  [TAG_IDS.OTHER]: ["EMPLOYEE", "DOCTOR"],
};


/* =========================================================
   MOCK GENERATOR
========================================================= */

const randomBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const pickRandomUser = () =>
  CALENDAR_USERS[randomBetween(0, CALENDAR_USERS  .length - 1)];

const pickRandomTag = () =>
  TAGS[randomBetween(0, TAGS.length - 1)].id;

const EVENT_TITLES = [
  "Business meeting",
  "Team stand-up",
  "Client presentation",
  "Code review",
  "Sprint planning",
  "Deployment",
];

const mockGenerator = () => {
  if (!USE_MOCK_DATA) return [];

  const result = [];
  let id = 1;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 7);

  for (let i = 0; i < 40; i++) {
    const start = new Date(startDate);
    start.setDate(start.getDate() + randomBetween(0, 60));
    start.setHours(randomBetween(9, 18), 0, 0);

    const end = new Date(start);
    end.setMinutes(start.getMinutes() + randomBetween(30, 90));

    result.push({
      id: id++,                  // UI-only
      erpName: null,             // 🚫 mock ≠ ERP
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      title: EVENT_TITLES[randomBetween(0, EVENT_TITLES.length - 1)],
      description: "Mock event",
      color: COLORS[randomBetween(0, COLORS.length - 1)],
      tags: pickRandomTag(),
      user: pickRandomUser(),
      isReadOnly: true,          // 🔒 prevents editing
    });
  }

  return result;
};

export const CALENDAR_ITEMS_MOCK = mockGenerator();
