// Links are read as plain names (`employee__name`), never as nested objects.
// A nested `employee { … }` reads the Employee record itself, and an approver
// is shared leaves of people outside their own Employee permission (e.g. RBM
// Bishnu approves an Aura & Proxima BE). That one refused read errors the whole
// query, and the approver saw no leaves at all.
export const LEAVE_QUERY = `
query LeaveApplications($first: Int) {
  LeaveApplications(first: $first) {
    edges {
      node {
        name
        from_date
        to_date
        half_day
        half_day_date
        total_leave_days
        description
        posting_date
        status
        custom_attachement
        leave_approver__name
        leave_approver_name
        custom_escalation_approver__name
        leave_balance
        employee_name
        employee__name
        leave_type__name
      }
    }
  }
}
`

export const LEAVE_TYPES_QUERY = `
query LeaveTypes($first: Int!) {
  LeaveTypes(first: $first) {
    edges {
      node {
        name
      }
    }
  }
}
`;

export const LEAVE_ALLOCATIONS_QUERY = `
query LeaveAllocationsByEmployee(
  $first: Int!
  $filters: [DBFilterInput!]
) {
  LeaveAllocations(first: $first, filter: $filters) {
    edges {
      node {
        leave_type__name
        total_leaves_allocated
        from_date
        to_date
      }
    }
  }
}
`;
export const LEAVE_APPLICATIONS_QUERY = `
query LeaveApplications($first: Int!, $filters: [DBFilterInput!]) {
  LeaveApplications(first: $first, filter: $filters) {
    edges {
      node {
        leave_type__name
        total_leave_days
        from_date
      }
    }
  }
}
`;


// Probationary Leave: who is on probation and since when (see
// lib/calendar/probationLeave.js).
export const EMPLOYEE_PROBATION_QUERY = `
query EmployeeProbation($filters: [DBFilterInput!]) {
  Employees(first: 1, filter: $filters) {
    edges {
      node {
        name
        employment_type__name
        date_of_joining
      }
    }
  }
}
`;

// Approved leave with the dates and half day, so each day lands in its month.
export const LEAVE_APPLICATION_DAYS_QUERY = `
query LeaveApplicationDays($first: Int!, $filters: [DBFilterInput!]) {
  LeaveApplications(first: $first, filter: $filters) {
    edges {
      node {
        name
        from_date
        to_date
        half_day
        half_day_date
        total_leave_days
      }
    }
  }
}
`;

export const SAVE_LEAVE_APPLICATION_MUTATION = `
mutation SaveEvent($doc: String!) {
  saveDoc(doctype: "Leave Application", doc: $doc) {
    doc {
      name
    }
  }
}
`;
export const UPDATE_LEAVE_STATUS_MUTATION = `
mutation UpdateLeaveStatus(
  $name: String!
  $value: DOCFIELD_VALUE_TYPE!
) {
  setValue(
    doctype: "Leave Application"
    name: $name
    fieldname: "status"
    value: $value
  ) {
    name
  }
}
`;


export const UPDATE_LEAVE_ATTACHMENT_MUTATION = `
mutation UpdateLeaveAttachment(
  $name: String!
  $value: DOCFIELD_VALUE_TYPE!
) {
  setValue(
    doctype: "Leave Application"
    name: $name
    fieldname: "custom_attachement"
    value: $value
  ) {
    name
  }
}
`;
