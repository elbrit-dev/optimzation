import { executeHelpDeskGraphQL } from "./graphqlClient";
import { HD_ARTICLE_CATEGORIES_QUERY, HD_ARTICLES_QUERY } from "./hdKnowledge.graphql";
import { mapHDArticleCategoriesResponse, mapHDArticlesResponse } from "./hdKnowledgeMapper";

export async function fetchHDArticles({ first = 50, after = null } = {}) {
  const data = await executeHelpDeskGraphQL(HD_ARTICLES_QUERY, { first, after }, { cache: true });
  return mapHDArticlesResponse(data);
}

export async function fetchHDArticleCategories({ first = 50, after = null, articles = [] } = {}) {
  const data = await executeHelpDeskGraphQL(HD_ARTICLE_CATEGORIES_QUERY, { first, after }, { cache: true });
  return mapHDArticleCategoriesResponse(data, articles);
}

export async function fetchHelpSupportDashboard({ ticketFirst = 50, articleFirst = 50, categoryFirst = 50, fetchTickets } = {}) {
  const [tickets, articles] = await Promise.all([
    fetchTickets ? fetchTickets({ first: ticketFirst }) : Promise.resolve([]),
    fetchHDArticles({ first: articleFirst }),
  ]);
  const categories = await fetchHDArticleCategories({ first: categoryFirst, articles });

  return { tickets, articles, categories };
}
