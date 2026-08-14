import { HD_TICKET_DOCTYPE, HD_TICKET_GRAPHQL_NAME } from "./hdTicketFields";

export const HD_TICKETS_QUERY = `
query HDTickets($first: Int!, $after: String, $filters: [DBFilterInput!]) {
  ${HD_TICKET_GRAPHQL_NAME}(first: $first, after: $after, filter: $filters, sortBy: { field: CREATION, direction: DESC }) {
    edges {
      node {
        name
        owner {
          name
        }
        owner__name
        modified_by {
          name
        }
        modified_by__name
        subject
        raised_by
        ticket_type {
          name
        }
        ticket_type__name
        agent_group {
          name
        }
        agent_group__name
        status {
          name
        }
        status__name
        priority {
          name
        }
        priority__name
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

export const HD_TICKET_OPTIONS_QUERY = `
query HDTicketOptions($first: Int!) {
  HDTicketTypes(first: $first) {
    edges {
      node {
        name
        description
        disabled
        priority {
          name
        }
        priority__name
      }
    }
  }
  HDTicketPrioritys(first: $first) {
    edges {
      node {
        name
        description
        disabled
        integer_value
      }
    }
  }
  HDTicketStatuses(first: $first) {
    edges {
      node {
        name
      }
    }
  }
}
`;

export const HD_VIEWS_QUERY = `
query HDViews($first: Int!, $filters: [DBFilterInput!]) {
  HDViews(first: $first, filter: $filters) {
    edges {
      node {
        name
        label
        icon
        is_default
        is_customer_portal
        is_standard
        type
        dt {
          name
        }
        dt__name
        route_name
        pinned
        public
        filters
        order_by
        columns
        rows
        group_by_field
      }
    }
  }
}
`;

export const HD_TICKET_COMMENTS_QUERY = `
query HDTicketComments($ticketName: String!) {
  HDTicketComments(
    first: 100
    filter: [
      { fieldname: "reference_ticket", operator: EQ, value: $ticketName }
    ]
  ) {
    edges {
      node {
        name
        owner {
          name
        }
        owner__name
        content
        commented_by {
          name
        }
        commented_by__name
        creation
        is_pinned
        reference_ticket__name
      }
    }
  }
}
`;

export const HD_TICKET_ASSIGNMENTS_QUERY = `
query HDTicketAssignments($first: Int!) {
  ToDoes(
    first: $first
    filter: [
      { fieldname: "reference_type", operator: EQ, value: "HD Ticket" }
    ]
  ) {
    edges {
      node {
        name
        allocated_to {
          name
        }
        allocated_to__name
        reference_type
        reference_name
        status
      }
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

export const SAVE_HD_TICKET_COMMENT_MUTATION = `
mutation SaveHDTicketComment($doc: String!) {
  saveDoc(doctype: "HD Ticket Comment", doc: $doc) {
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
