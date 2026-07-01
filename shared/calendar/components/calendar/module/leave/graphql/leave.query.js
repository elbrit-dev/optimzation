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
        leave_approver {
          name
        }
        leave_approver_name
        leave_balance
        employee_name
        employee {
          name
          company_email
          first_name
          middle_name
          last_name
        }
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
