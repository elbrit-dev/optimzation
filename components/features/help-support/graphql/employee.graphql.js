// Employee lookup that backs the department-restricted knowledge base collections.
// Link fields are read through their "__name" scalars only — see the note in
// hdTicket.graphql.js. `user_id` is a Link to User, so selecting it unqualified would
// defer-resolve a User doc and fail the whole query for non-admin tokens.
export const EMPLOYEE_BY_USER_QUERY = `
query EmployeeByUser($user: String!) {
  Employees(
    first: 1
    filter: [
      { fieldname: "user_id", operator: EQ, value: $user }
    ]
  ) {
    edges {
      node {
        name
        employee_name
        status
        department__name
      }
    }
  }
}
`;
