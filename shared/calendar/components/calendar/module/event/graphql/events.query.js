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
        status
        event_category
        fsl_is_force_visit:custom_is_force_visit
        custom_force_visit_reason
        reference_doctype__name
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
          custom_latitude
          custom_longitude
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
        city
        custom_latitude
        custom_longitude
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
export const SAVE_EVENT_MUTATION = `
mutation SaveEvent($doc: String!) {
  saveDoc(doctype: "Event", doc: $doc) {
    doc {
      name
    }
  }
}
`;

export const SAVE_EVENT_QUOTATION = `
mutation SaveEvent($doc: String!) {
  saveDoc(doctype: "Quotation", doc: $doc) {
    doc {
      name
    }
  }
}
`

