import { DEFAULT_COLORS, TAG_IDS } from "@calendar/components/calendar/constants";
import { startOfDay, isBefore } from "date-fns";
export const TAG_FORM_CONFIG = {
  [TAG_IDS.LEAVE]: {
    hide: [
      "title",
      "color",
      "doctor", "allocated_to"
    ],
    show: ["startDate", "endDate", "description", "leaveType"],
    required: ["startDate", "endDate", "leaveType"],
    dateOnly: true,
    fixedColor: DEFAULT_COLORS.EVENT,
    autoTitle: () => "Leave",
    employee: {
      autoSelectLoggedIn: true,
      multiselect: false,
    },
    labels: {
      description: "Reason",
    },    
    leave: {
      approvalRequired: true,
      medicalCertificateAfterDays: 2,
    },
    ui: {
      lockTagOnEdit: true,
      showTags: false,
      allowDelete: (event) => event.status !== "APPROVED",
      allowEdit: (event) => event.status !== "APPROVED",
    },
    details: {
      layout: [
        {
          columns: 2,
          fields: ["startDate", "status"],
        },
        {
          columns: 1,
          fields: ["owner"],
        },
        {
          columns: 1,
          fields: ["leave_approver"],
        },
        {
          columns: 1,
          fields: ["description"],
        },
        {
          columns: 1,
          fields: ["attachment"],
        },
      ],
    
      fields: {
        // startDate: { label: "Start Date", type: "date" },
        // status: { label: "Status", type: "text" },
        owner: { label: "Request By", type: "owner" },
        leave_approver: { label: "Approved By", type: "leave_approver" },
        description: { label: "Reason", type: "text" },
        attachment: { label: "Attached File", type: "file" },
      },
    }
    
  },

  [TAG_IDS.HQ_TOUR_PLAN]: {
    hide: [
      "title",
      "color",
      "doctor",
      "description", "allocated_to"
    ],
    show: ["startDate",  "hqTerritory","endDate"],
    // required: ["startDate","endDate"],
    required: ["startDate","endDate", "hqTerritory"],
    forceAllDay: true,
    dateOnly: true,
    ui: {
      lockTagOnEdit: true,
      showTags: false,
      allowDelete: (event) =>
        !isBefore(
          startOfDay(new Date(event.startDate)),
          startOfDay(new Date())
        ),
      
      allowEdit: (event) =>
        !isBefore(
          startOfDay(new Date(event.startDate)),
          startOfDay(new Date())
        ),
    },
    editReadOnly: {
      fields: [
        { key: "startDate", label: "Start Date", type: "date" },
        { key: "endDate", label: "End Date", type: "date" },
        { key: "hqTerritory", label: "HQTerrioty", type: "hqTerritory" },
        { key: "description", label: "Description", type: "text" },
      ],
    },
    autoTitle: (
      { hqTerritory, employees } = {},
      { employeeOptions = [] } = {}
    ) => {
      if (!hqTerritory || !employees) return null;
    
      const employeeValue = Array.isArray(employees)
        ? employees[0]
        : employees;
    
      const empId =
        typeof employeeValue === "object"
          ? employeeValue?.value
          : employeeValue;
    
      const emp =
        typeof employeeValue === "object"
          ? employeeValue
          : employeeOptions.find(
              (e) => e.value === empId
            );
    
      if (!emp) return null;
    
      return `${hqTerritory}-${emp.label.replace(/\s+/g, "-")}`;
    },
    fixedColor: DEFAULT_COLORS.HQ_TOUR_PLAN,
    details: {
      fields: [
        { key: "startDate", label: "Start Date", type: "date" },
        { key: "endDate", label: "End Date", type: "date" },
        { key: "owner", label: "Created by", type: "owner" },
        { key: "hqTerritory", label: "HQ Territory", type: "text" },
        { key: "description", label: "Description", type: "text" },
      ],
    },
    employee: {
      autoSelectLoggedIn: true,
      multiselect: false,
    },
  },

  [TAG_IDS.MEETING]: {
    hide: ["color", "doctor", "allocated_to"],
    show: ["title", "startDate", "endDate", "employees", "allDay", "description"],
    required: ["title", "startDate", "endDate", "employees"],
    dateRange: true,

    fixedColor: DEFAULT_COLORS.EVENT,
    ui: {
      lockTagOnEdit: true,
      showTags: false,
      allowDelete: () => true,
      allowEdit: () => true,
    },
    time: {
      defaultDurationMinutes: 60,
      allowAllDay: true,
    },
    details: {
      fields: [
        { key: "startDate", label: "Start Date", type: "date" },
        { key: "endDate", label: "End Date", type: "date" },
        { key: "owner", label: "Created by", type: "owner" },
        { key: "employee", label: "Employee", type: "employee" },
        { key: "description", label: "Description", type: "text" },
      ],
    },
    employee: {
      multiselect: true,
      autoSelectLoggedIn: false,
    },
  },

  [TAG_IDS.DOCTOR_VISIT_PLAN]: {
    hide: [
      "title",
      "endDate",
      "description",
      "color", "allocated_to"
    ],
    // show: ["startDate", "doctor"],
    required: ["startDate"],
    required: ["startDate", "doctor"],
    dateOnly: true,
    labels: {
      startDate: "Date",
    },
    ui: {
      lockTagOnEdit: true,
      showTags: false,
      allowDelete: (event) => {
        const isPast = isBefore(
          startOfDay(new Date(event.startDate)),
          startOfDay(new Date())
        );
      
        if (isPast) return false;
      
        return !(
          event.attending === "Yes" ||
          event.pob_given === "Yes" ||
          (Array.isArray(event.fsl_doctor_item) &&
            event.fsl_doctor_item.length > 0)
        );
      },
      
      allowEdit: (event) => {
        const isPast = isBefore(
          startOfDay(new Date(event.startDate)),
          startOfDay(new Date())
        );
      
        return !isPast;
      },
    },

    editReadOnly: {
      fields: [
        { key: "doctor", label: "Doctor", type: "doctor" },
        { key: "startDate", label: "Date", type: "date" },
      ],
    },
    fixedColor: DEFAULT_COLORS.EVENT,
    forceAllDay: true,
    employee: {
      autoSelectLoggedIn: true,
      multiselect: false,
    },
    doctor: {
      multiselect: true,
    },
    editOnly: {
      visit: {
        key: "attending",
        label: "Visited",
        type: "checkbox",
      },
    
      latitude: {
        key: "custom_latitude",
        label: "Latitude",
        type: "info",
        dependsOn: "attending",
      },
    
      longitude: {
        key: "custom_longitude",
        label: "Longitude",
        type: "info",
        dependsOn: "attending",
      },
    
      pob: {
        question: {
          key: "pob_given",
          label: "Did POB Given ?",
          type: "radio",
          options: ["Yes", "No"],
        },
    
        items: {
          key: "fsl_doctor_item",
          multiple: true,
          showWhen: (values) => values.pob_given === "Yes",
        },
      },
    },
    details: {
      fields: [
        { key: "startDate", label: "Start Date", type: "date" },
        { key: "doctor", label: "Doctor", type: "doctor" },
        { key: "owner", label: "Created by", type: "owner" },
        { key: "employee", label: "Participants", type: "employee" },
        { key: "description", label: "Description", type: "text" },
      ],
    },
  },

  [TAG_IDS.TODO_LIST]: {
    hide: [
      "startDate",
      "doctor",
      "color",  "employees"
    ],
    show: ["endDate", "description", "priority", "allocated_to","title",],
    required: ["allocated_to","title",],
    dateOnly: true,
    labels: {
      startDate: "From Date",
      endDate: "Due Date",
    },
    ui: {
      lockTagOnEdit: true,
      showTags: false,
      allowDelete: () => true,
      allowEdit: () => true,
    },
    fixedColor: DEFAULT_COLORS.TODO,
    employee: {
      multiselect: false,
    },
    todo: {
      assignedToSelfByDefault: true,
      allowMultipleAssignees: true,
    },
    details: {
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "endDate", label: "Due Date", type: "date" },
        { key: "status", label: "Status", type: "text" },
        { key: "priority", label: "Priority", type: "text" },
        { key: "allocated_to", label: "Allocated To", type: "allocated_to" },
        { key: "description", label: "Description", type: "text" },
      ],
    },
  },
  Other: {
    hide: ["color", "allocated_to", "doctor"],
    show: ["title", "startDate", "endDate", "employees"],
    required: ["title", "startDate"],
    dateOnly: true,
    fixedColor: DEFAULT_COLORS.EVENT,
    details: {
      fields: [
        { key: "startDate", label: "Start Date", type: "date" },
        { key: "endDate", label: "End Date", type: "date" },
        { key: "owner", label: "Created by", type: "owner" },
        { key: "employee", label: "Participants", type: "employee" },
        { key: "description", label: "Description", type: "text" },
      ],
    },
    ui: {
      lockTagOnEdit: true,
      showTags: false,
      allowDelete: () => true,
      allowEdit: () => true,
    },
    employee: {
      multiselect: true,
    },
  },

  DEFAULT: {
    hide: ["color"],
    show: [
      "title",
      "startDate",
      "endDate",
      "description",
      "employees",
    ],
    ui: {
      lockTagOnEdit: false,
      showTags: false,
      allowEdit: () => true,
      allowDelete: () => true,
    },
    required: ["title", "startDate"],

    fixedColor: DEFAULT_COLORS.EVENT,
    details: {
      fields: [
        { key: "startDate", label: "Start Date", type: "date" },
        { key: "endDate", label: "End Date", type: "date" },
        { key: "owner", label: "Created by", type: "owner" },
        { key: "employee", label: "Participants", type: "employee" },
        { key: "description", label: "Description", type: "text" },
      ],
    },
  },
};
