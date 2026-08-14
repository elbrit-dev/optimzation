// Link fields use their "__name" scalars only — see the note in hdTicket.graphql.js.
// `author` is a User link, so selecting it nested breaks this query for non-admin tokens.
export const HD_ARTICLES_QUERY = `
query HDArticles($first: Int!, $after: String) {
  HDArticles(first: $first, after: $after) {
    edges {
      node {
        name
        title
        title_slug
        category__name
        author__name
        content
        published_on
        views
        status
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

export const HD_ARTICLE_CATEGORIES_QUERY = `
query HDArticleCategories($first: Int!, $after: String) {
  HDArticleCategorys(first: $first, after: $after) {
    edges {
      node {
        name
        category_name
        description
        icon
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

export const HD_ARTICLE_COMMENTS_QUERY = `
query HDArticleComments($referenceName: String!) {
  Comments(
    first: 100
    filter: [
      { fieldname: "reference_doctype", operator: EQ, value: "HD Article" }
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

export const SAVE_HD_ARTICLE_COMMENT_MUTATION = `
mutation SaveHDArticleComment($doc: String!) {
  saveDoc(doctype: "Comment", doc: $doc) {
    doc {
      name
    }
  }
}
`;
