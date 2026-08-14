import { clearHelpDeskGraphQLCache, executeHelpDeskGraphQL, executeHelpDeskMethod } from "./graphqlClient";
import {
  HD_ARTICLE_CATEGORIES_QUERY,
  HD_ARTICLE_COMMENTS_QUERY,
  HD_ARTICLES_QUERY,
  SAVE_HD_ARTICLE_COMMENT_MUTATION,
} from "./hdKnowledge.graphql";
import { mapHDArticleCategoriesResponse, mapHDArticleCommentsResponse, mapHDArticlesResponse } from "./hdKnowledgeMapper";

export async function fetchHDArticles({ first = 50, after = null, graphqlConfig } = {}) {
  const data = await executeHelpDeskGraphQL(HD_ARTICLES_QUERY, { first, after }, { cache: true, config: graphqlConfig });
  return mapHDArticlesResponse(data, graphqlConfig);
}

export async function fetchHDArticleCategories({ first = 50, after = null, articles = [], graphqlConfig } = {}) {
  const data = await executeHelpDeskGraphQL(HD_ARTICLE_CATEGORIES_QUERY, { first, after }, { cache: true, config: graphqlConfig });
  return mapHDArticleCategoriesResponse(data, articles);
}

export async function fetchHelpSupportDashboard({
  ticketFirst = 50,
  articleFirst = 50,
  categoryFirst = 50,
  fetchTickets,
  ticketFilters = null,
  graphqlConfig,
} = {}) {
  const [tickets, articles] = await Promise.all([
    fetchTickets ? fetchTickets({ first: ticketFirst, filters: ticketFilters, graphqlConfig }) : Promise.resolve([]),
    fetchHDArticles({ first: articleFirst, graphqlConfig }),
  ]);
  const categories = await fetchHDArticleCategories({ first: categoryFirst, articles, graphqlConfig });

  return { tickets, articles, categories };
}

export async function fetchHDArticleComments(articleName, graphqlConfig) {
  if (!articleName) return [];
  const data = await executeHelpDeskGraphQL(
    HD_ARTICLE_COMMENTS_QUERY,
    { referenceName: articleName },
    { cache: true, config: graphqlConfig }
  );
  return mapHDArticleCommentsResponse(data);
}

export async function saveHDArticleComment(articleName, comment, context = {}) {
  if (!articleName) throw new Error("Article name is required.");
  if (!comment?.trim()) throw new Error("Comment is required.");
  const doc = {
    comment_type: "Comment",
    reference_doctype: "HD Article",
    reference_name: articleName,
    content: comment.trim(),
    comment_email: context.user?.email || context.user?.username || "",
    comment_by: context.user?.name || context.user?.email || "User",
  };
  const data = await executeHelpDeskGraphQL(
    SAVE_HD_ARTICLE_COMMENT_MUTATION,
    { doc: JSON.stringify(doc) },
    { config: context.graphqlConfig }
  );
  clearHelpDeskGraphQLCache();
  return data?.saveDoc?.doc?.name;
}

export async function toggleHDArticleLike(articleName, liked, graphqlConfig) {
  if (!articleName) throw new Error("Article name is required.");
  await executeHelpDeskMethod(
    "frappe.desk.like.toggle_like",
    { doctype: "HD Article", name: articleName, add: liked ? "Yes" : "No" },
    { config: graphqlConfig }
  );
  clearHelpDeskGraphQLCache();
  return liked;
}
