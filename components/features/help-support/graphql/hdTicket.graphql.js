import { HD_TICKET_DOCTYPE, HD_TICKET_GRAPHQL_NAME } from "./hdTicketFields";

export const HD_TICKETS_QUERY = `
query HDTickets($first: Int!, $after: String, $filters: [DBFilterInput!]) {
  ${HD_TICKET_GRAPHQL_NAME}(first: $first, after: $after, filter: $filters, sortBy: { field: CREATION, direction: DESC }) {
    edges {
      node {
        name
        subject
        raised_by
        ticket_type {
          name
        }
        agent_group {
          name
        }
        status {
          name
        }
        priority {
          name
        }
        status_category
        summary
        description
        template {
          name
        }
        key
        sla {
          name
        }
        response_by
        raised_outside_working_hours
        agreement_status
        resolution_by
        service_level_agreement_creation
        on_hold_since
        total_hold_time
        first_response_time
        first_responded_on
        avg_response_time
        last_agent_response
        last_customer_response
        resolution_details
        opening_date
        opening_time
        resolution_date
        resolution_time
        user_resolution_time
        creation
        modified
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

export const CREATE_HD_TICKET_MUTATION = `
mutation CreateHDTicket($doc: String!) {
  saveDoc(doctype: "${HD_TICKET_DOCTYPE}", doc: $doc) {
    doc {
      name
    }
  }
}
`;

export const UPDATE_HD_TICKET_MUTATION = `
mutation UpdateHDTicket($doc: String!) {
  saveDoc(doctype: "${HD_TICKET_DOCTYPE}", doc: $doc) {
    doc {
      name
    }
  }
}
`;

export const DELETE_HD_TICKET_MUTATION = `
mutation DeleteHDTicket($name: String!) {
  deleteDoc(doctype: "${HD_TICKET_DOCTYPE}", name: $name) {
    name
  }
}
`;
