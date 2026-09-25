// Every request, whatever its status (draft, submitted, cancelled).
export const TRAVEL_REQUESTS_QUERY = `
query TravelRequests($first: Int) {
  TravelRequests(first: $first) {
    edges {
      node {
        name
        docstatus
        travel_funding
        details_of_sponsor
        travel_proof
        description
        employee_name
        employee {
          name
          company_email
          first_name
          middle_name
          last_name
        }
        itinerary {
          travel_from
          travel_to
          mode_of_travel
          departure_date
          lodging_required
        }
      }
    }
  }
}
`;

export const SAVE_TRAVEL_REQUEST_MUTATION = `
mutation SaveTravelRequest($doc: String!) {
  saveDoc(doctype: "Travel Request", doc: $doc) {
    doc {
      name
    }
  }
}
`;

export const SAVE_TASK_MUTATION = `
mutation SaveTask($doc: String!) {
  saveDoc(doctype: "Task", doc: $doc) {
    doc {
      name
    }
  }
}
`;

// The Task is linked to its request only through the request ID written into
// the Task's description (Travel Request has no field for it).
export const PROCUREMENT_TASK_QUERY = `
query ProcurementTask($filter: [DBFilterInput!]) {
  Tasks(first: 1, filter: $filter) {
    edges {
      node {
        name
      }
    }
  }
}
`;

export const DELETE_DOC_MUTATION = `
mutation DeleteDoc($doctype: String!, $name: String!) {
  deleteDoc(doctype: $doctype, name: $name) {
    name
  }
}
`;
