import { HD_TICKET_DOCTYPE, HD_TICKET_GRAPHQL_NAME } from "./hdTicketFields";

// Link fields are read through their "__name" scalars only. Selecting the nested
// document ({ name }) makes Frappe defer-resolve the linked doc, which needs read
// permission on that doctype — on User links that fails the whole query with
// "GraphQL deferred execution failed to complete" for anyone but an admin token.
export const HD_TICKETS_QUERY = `
query HDTickets($first: Int!, $after: String, $filters: [DBFilterInput!]) {
  ${HD_TICKET_GRAPHQL_NAME}(first: $first, after: $after, filter: $filters, sortBy: { field: CREATION, direction: DESC }) {
    edges {
      node {
        name
        subject
        raised_by
        ticket_type__name
        agent_group__name
        status__name
        priority__name
        template__name
        sla__name
        status_category
        summary
        description
        key
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
        owner__name
        content
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
        allocated_to__name
        reference_type
        reference_name
        status
      }
    }
  }
}
`;

// The customer-facing thread. In Frappe Helpdesk the public conversation lives in
// Communication (Received = from the requester, Sent = from an agent), while
// HD Ticket Comment is the agents' internal note channel that requesters never see.
export const HD_TICKET_COMMUNICATIONS_QUERY = `
query HDTicketCommunications($ticketName: String!) {
  Communications(
    first: 100
    filter: [
      { fieldname: "reference_doctype", operator: EQ, value: "HD Ticket" }
      { fieldname: "reference_name", operator: EQ, value: $ticketName }
    ]
  ) {
    edges {
      node {
        name
        subject
        content
        sender
        sender_full_name
        sent_or_received
        communication_medium
        creation
      }
    }
  }
}
`;

export const SAVE_HD_TICKET_COMMUNICATION_MUTATION = `
mutation SaveHDTicketCommunication($doc: String!) {
  saveDoc(doctype: "Communication", doc: $doc) {
    doc {
      name
    }
  }
}
`;

// Tickets allocated to one user. Frappe ANDs its filters and has no OR, so "raised by
// me or assigned to me" needs this second lookup merged with the raised_by fetch.
export const HD_MY_TICKET_ASSIGNMENTS_QUERY = `
query HDMyTicketAssignments($first: Int!, $user: String!) {
  ToDoes(
    first: $first
    filter: [
      { fieldname: "reference_type", operator: EQ, value: "HD Ticket" }
      { fieldname: "allocated_to", operator: EQ, value: $user }
    ]
  ) {
    edges {
      node {
        name
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
