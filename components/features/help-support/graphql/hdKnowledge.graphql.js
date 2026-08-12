export const HD_ARTICLES_QUERY = `
query HDArticles($first: Int!, $after: String) {
  HDArticles(first: $first, after: $after) {
    edges {
      node {
        name
        title
        title_slug
        category {
          name
        }
        category__name
        author {
          name
        }
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
