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
        fsl_is_force_visit:custom_is_force_visit
        custom_force_visit_reason
        reference_doctype {
          name
        }
        reference_docname__name
        fsl_role_id :custom_role_id {
          name
        }
        owner {
          name
          full_name
          email
        }
         fsl_territory__name:custom_hq_territory__name
          event_participants {
          reference_doctype__name
          kly_lat_long:custom_lat__long
          reference_docname__name
          attending
          email
          kly_role_id:custom_role_id {
              name
            }
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
        custom_subject
        custom_assigned_to {
          employee__name
        }
      }
    }
  }
}
`;
export const ELBRIT_ROLEID = `
query RoleProfiles($first: Int) {
  RoleProfiles(first: $first) {
    edges {
      node {
      role_profile
      custom_department {
        department_name
        lft
        rgt
        parent_department__name
      }
      parent_role_profile {
        name
        is_group
      }
    }
    }
  }
}`
export function normalizeRoleProfiles(data) {
	return {
		ElbritRoleIDS: {
			edges:
				data?.RoleProfiles?.edges?.map(({ node }) => ({
					node: {
						lft: node?.custom_department?.lft ?? null,

						rgt: node?.custom_department?.rgt ?? null,

						role_id: node?.role_profile ?? null,

						sales_team__name:
							node?.custom_department?.department_name ?? null,

						parent_elbrit_role_id__name:
							node?.parent_role_profile?.name ?? null,

						is_group:
							node?.parent_role_profile?.is_group ?? false,
					},
				})) ?? [],
		},
	};
}
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
        custom_last_mrp
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
        custom_latitude__longitude
        city
        custom_speciality
        email_id
        notes {
          name
          note
          creation
          idx
          doctype
          creation
          modified
        }
        custom_category_3
        custom_category_2
        custom_category_1
        territory__name
      }
    }
  }
}
`
export const QUOTATIONS_BY_NAMES_QUERY = `
query Quotations(
  $first: Int!
  $filters: [DBFilterInput!]
) {
  Quotations(first: $first, filter: $filters) {
    edges {
      node {
        name
        items {
          item_code { name }
          qty
          rate
          amount
        }
      }
    }
  }
}
`;
export const CUSTOMER_QUERY = `
query Customers($first: Int) {
  Customers(first: $first) {
    edges {
      node {
       name
      }
    }
  }
}
`
export const GET_TODO_COMMENTS = `
query GetTodoComments($referenceName: String!) {
  Comments(
    first: 100
    filter: [
      { fieldname: "reference_doctype", operator: EQ, value: "ToDo" }
      { fieldname: "reference_name", operator: EQ, value: $referenceName }
      { fieldname: "comment_type", operator: EQ, value: "Comment" }
    ]
  ) {
    edges {
      node {
        name
        content
        comment_by
        comment_email
        creation
      }
    }
  }
}
`;

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

