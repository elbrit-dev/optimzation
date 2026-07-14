import {
  ERP_DOCTOR_FIELDS,
  ERP_EMPLOYEE_FIELDS,
  ERP_EVENT_FIELDS,
  ERP_ROLE_PROFILE_FIELDS,
} from "@calendar/components/calendar/module/event/graphql/field-config";

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
        event_type
        event_category
        pob_given:${ERP_EVENT_FIELDS.pobGivenRead}
        role_profile:${ERP_EVENT_FIELDS.roleProfileRead}
        custom_doctor__name:${ERP_EVENT_FIELDS.doctorRead}
        doctor_latitude:${ERP_EVENT_FIELDS.doctorLatitudeRead}
        doctor_longitude:${ERP_EVENT_FIELDS.doctorLongitudeRead}
        custom_employee_id:${ERP_EVENT_FIELDS.ownerEmployeeRead} {
          name
          company_email
          user_id:user_id__name
          first_name
          middle_name
          last_name
        }
        reference_doctype__name
        reference_docname__name
        google_meet_link
        custom_hq__name:${ERP_EVENT_FIELDS.hqRead}
        event_participants {
          reference_doctype__name
          custom_latitude
          custom_longitude
          custom_distance:${ERP_EVENT_FIELDS.participantDistanceRead}
          custom_visit_time:${ERP_EVENT_FIELDS.participantVisitTimeRead}
          custom_is_force_visit:${ERP_EVENT_FIELDS.participantForceVisitRead}
          custom_force_visit_reason:${ERP_EVENT_FIELDS.participantForceVisitReasonRead}
          reference_docname__name
          attending
          email
          role_profile:${ERP_EVENT_FIELDS.participantRoleProfileRead} {
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
      role_id:${ERP_ROLE_PROFILE_FIELDS.roleId}
      is_group
      custom_department {
        department_name
        lft
        rgt
        parent_department__name
      }
      parent_role_id:${ERP_ROLE_PROFILE_FIELDS.parentRole} {
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
						role_id: node?.role_id ?? null,
						sales_team__name:
							node?.custom_department?.department_name ?? null,
						parent_elbrit_role_id__name:
							node?.parent_role_id?.name ?? null,
						is_group: node?.is_group ?? false,
					},
				})) ?? [],
		},
	};
}
export const EMPLOYEES_QUERY = `
query GetEmployees($first: Int!, $filters: [DBFilterInput!]) {
  Employees(
    first: $first
    filter: $filters
  ) {
    edges {
      node {
        name
        employee_name
        company_email
        user_id:user_id__name
        idx
        leave_approver {
          name
        }
        designation{
        name
        }
        role_id:${ERP_EMPLOYEE_FIELDS.roleId}
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
        custom_department_details {
          valid_from
          valid_to
          elbrit_department__name
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
export const DOCTOR_QUERY = `
query Doctors($first: Int,$filter: [DBFilterInput]) {
  Leads(first: $first,filter: $filter) {
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
        custom_category3__name
        custom_category2__name
        custom_category1__name
        territory__name:${ERP_DOCTOR_FIELDS.territory}
      }
    }
  }
}
`

export const DOC_SHARES_BY_EVENT_QUERY = `
query DocSharesByEvent($first: Int!, $filters: [DBFilterInput!]) {
  DocShares(first: $first, filter: $filters) {
    edges {
      node {
        name
        user {
          name
        }
      }
    }
  }
}
`;
export const DOC_SHARES_BY_USER_QUERY = `
query DocSharesByUser($first: Int!, $filters: [DBFilterInput!]) {
  DocShares(first: $first, filter: $filters) {
    edges {
      node {
        name
        share_name:share_name__name
      }
    }
  }
}
`;
export const QUOTATIONS_BY_NAMES_QUERY = `
query Quotations(
  $first: Int!
  $filters: [DBFilterInput!]
) {
  Quotations(first: $first, filter: $filters) {
    edges {
      node {
        name
        creation
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
query Customers($first: Int, $filters: [DBFilterInput!]) {
  Customers(first: $first, filter: $filters) {
    edges {
      node {
       name
       territory__name
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
export const SAVE_DOC_SHARE_MUTATION = `
mutation SaveDocShare($doc: String!) {
  saveDoc(doctype: "DocShare", doc: $doc) {
    doc {
      name
    }
  }
}
`;
