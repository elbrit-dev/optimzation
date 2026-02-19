export const EVENTS_BY_RANGE_QUERY = `
query EventsByRange(
  $first: Int!
  $after: String
  $filters: [DBFilterInput!]
) {
  Events(first: $first, after: $after, filter: $filters) {
    edges {
      node {
        name
        subject
        description
        starts_on
        ends_on
        color
        all_day
        event_category
        attending
        fsl_role_id {
          name
        }
        owner {
          name
          full_name
          email
        }
         fsl_territory__name
          event_participants {
          reference_doctype__name
          kly_lat_long
          reference_docname__name
          attending
        }
          fsl_doctor_item {
          amount
          item__name
          qty
          rate
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;
export const TODO_LIST_QUERY = `
query ToDoes($first: Int!) {
  ToDoes(first: $first) {
    edges {
      node {
        name
        description
        date
        priority
        status
        allocated_to__name
      }
    }
  }
}
`;
export const ELBRIT_ROLEID=`
query ElbritRoleIDS($first: Int) {
  ElbritRoleIDS(first: $first) {
    edges {
      node {
        lft
        rgt
        role_id
        sales_team__name
        parent_elbrit_role_id__name
        is_group
      }
    }
  }
}`
export const EMPLOYEES_QUERY = `
query GetEmployees($first: Int!) {
  Employees(
    first: $first
  ) {
    edges {
      node {
        name
        employee_name
        company_email
        idx
        leave_approver {
          name
        }
        designation{
        name
        }
        role_id
      }
    }
  }
}
`;
export const ITEMS_QUERY = `
query Items(
  $first: Int!
  $after: String
  $filters: [DBFilterInput!]
) {
  Items(first: $first, after: $after, filter: $filters) {
    edges {
      node {
        item_code
        item_name
        whg_last_pts
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;


export const DOCTOR_QUERY = `
query Doctors($first: Int) {
  Leads(first: $first) {
    edges {
      node {
        name
        lead_name
        fsl_lat_lon
      }
    }
  }
}
`

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
        fsl_attach
        leave_approver {
          name
        }
        leave_approver_name
        leave_balance
        employee_name
        employee {
          name
        }
        leave_type__name
      }
    }
  }
}
`

export const HQ_TERRITORIES_QUERY = `
query GetHQTerritories($first: Int!){
  Territorys(first: $first)  {
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

