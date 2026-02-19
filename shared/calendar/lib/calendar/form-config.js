import { TAG_IDS } from "@calendar/components/calendar/constants";

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
    fixedColor: "red",
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
      fields: [
        { key: "startDate", label: "Start Date", type: "date" },
        { key: "endDate", label: "End Date", type: "date" },
        { key: "leaveType", label: "Leave Type", type: "text" },
        { key: "status", label: "Status", type: "text" },
        { key: "leave_approver", label: "Leave Approver", type: "text" },
        { key: "description", label: "Reason", type: "text" },
      ],
    },
  },

  [TAG_IDS.HQ_TOUR_PLAN]: {
    hide: [
      "title",
      "color",
      "doctor",
      "description", "allocated_to"
    ],
    show: ["startDate", "endDate", "hqTerritory"],
    required: ["startDate", "hqTerritory"],
    forceAllDay: true,
    dateOnly: true,
    ui: {
      lockTagOnEdit: true,
      showTags: false,
      allowDelete: () => true,
      allowEdit: () => true,
    },
    editReadOnly: {
      fields: [
        { key: "hqTerritory", label: "HQTerrioty", type: "hqTerritory" },
      ],
    },
    autoTitle: (
      { hqTerritory, employees } = {},
      { employeeOptions = [] } = {}
    ) => {
      if (!hqTerritory || !employees) return null;

      const empId = Array.isArray(employees) ? employees[0] : employees;
      const emp = employeeOptions.find(e => e.value === empId);

      if (!emp) return null;

      return `${hqTerritory}-${emp.label.replace(/\s+/g, "-")}`;
    },
    fixedColor: "purple",
    details: {
      fields: [
        { key: "startDate", label: "Start Date", type: "date" },
        { key: "endDate", label: "End Date", type: "date" },
        { key: "hqTerritory", label: "HQ Territory", type: "text" },
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

    fixedColor: "blue",
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
        { key: "employee", label: "Employee", type: "employee" },
      ],
    },
    employee: {
      multiselect: true,
      autoSelectLoggedIn: false,
    },
  },

  // [TAG_IDS.BIRTHDAY]: {
  //   hide: [
  //     "title",
  //     "endDate",
  //     "description",
  //     "employees",
  //     "color", "allocated_to"
  //   ],
  //   show: ["startDate", "doctor"],
  //   required: ["startDate", "doctor"],
  //   dateOnly: true,

  //   fixedColor: "yellow",
  //   forceAllDay: true,
  //   ui: {
  //     lockTagOnEdit: true,
  //     showTags: false,
  //     allowDelete: () => true,
  //     allowEdit: () => true,
  //   },
  //   editReadOnly: {
  //     fields: [
  //       { key: "doctor", label: "Doctor", type: "doctor" },
  //     ],
  //   },
  //   details: {
  //     fields: [
  //       { key: "startDate", label: "Birthday", type: "date" },
  //       { key: "doctor", label: "Doctor", type: "doctor" },
  //     ],
  //   },
  //   autoTitle: (
  //     { doctor } = {},
  //     { doctorOptions } = {}
  //   ) => {
  //     if (!doctor) return "Birthday";

  //     const selectedDoctor = doctorOptions?.find(
  //       (d) => d.value === doctor
  //     );

  //     if (!selectedDoctor) return "Birthday";

  //     const doctorName = selectedDoctor.label.replace(/\s+/g, "");
  //     const doctorCode = selectedDoctor.value;

  //     return `BD-${doctorName}-${doctorCode}`;
  //   },

  // },

  [TAG_IDS.DOCTOR_VISIT_PLAN]: {
    hide: [
      "title",
      "endDate",
      "description",
      "color", "allocated_to"
    ],
    show: ["startDate", "doctor"],
    required: ["startDate", "doctor"],
    dateOnly: true,
    labels: {
      startDate: "Date",
    },
    ui: {
      lockTagOnEdit: true,
      showTags: false,
      allowDelete: (event) =>
        !(
          event.attending === "Yes" ||
          event.pob_given === "Yes" ||
          (Array.isArray(event.fsl_doctor_item) &&
            event.fsl_doctor_item.length > 0)
        ),
      allowEdit: () => true,
      primaryEditAction: {
        label: "Visit Now",
        type: "success",
        setOnEdit: {
          attending: "Yes",
        },
      },

    },

    editReadOnly: {
      fields: [
        { key: "doctor", label: "Doctor", type: "doctor" },
        { key: "startDate", label: "Date", type: "date" },
      ],
    },
    fixedColor: "blue",
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
      location: {
        key: "kly_lat_long",
        label: "Latitude & Longitude",
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
        { key: "employee", label: "Participants", type: "employee" },
      ],
    },
  },

  [TAG_IDS.TODO_LIST]: {
    hide: [
      "startDate",
      "doctor",
      "color", "title", "employees"
    ],
    show: ["endDate", "description", "priority", "allocated_to"],
    required: ["allocated_to"],
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
    fixedColor: "orange",
    employee: {
      multiselect: false,
    },
    todo: {
      assignedToSelfByDefault: true,
      allowMultipleAssignees: true,
    },
    details: {
      fields: [
        { key: "endDate", label: "Due Date", type: "date" },
        { key: "status", label: "Status", type: "text" },
        { key: "priority", label: "Priority", type: "text" },
        { key: "allocated_to", label: "Allocated To", type: "allocated_to" },
        { key: "description", label: "Description", type: "text" },
      ],
    },
  },
  Other: {
    hide: ["color", "allocated_to"],
    show: ["title", "startDate", "endDate", "employees", "doctor"],
    required: ["title", "startDate", "employees"],
    dateOnly: true,
    fixedColor: "teal",
    details: {
      fields: [
        { key: "startDate", label: "Start Date", type: "date" },
        { key: "endDate", label: "End Date", type: "date" },
        { key: "doctor", label: "Doctor", type: "doctor" },
        { key: "employee", label: "Participants", type: "employee" },
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
    doctor: {
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

    fixedColor: "blue",
  },
};
