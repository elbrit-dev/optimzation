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

export const SAVE_COMMENT = `
mutation SaveComment($doc: String!) {
  saveDoc(doctype: "Comment", doc: $doc) {
    doc {
      name
    }
  }
}
`;

export const SAVE_EVENT_TODO = `
mutation SaveEvent($doc: String!) {
  saveDoc(doctype: "ToDo", doc: $doc) {
    doc {
      name
    }
  }
}
`;