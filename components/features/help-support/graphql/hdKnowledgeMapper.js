import { formatIndiaDateTime } from "./dateTime";

function linkName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.name || value.value || "";
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAssetUrls(html, config = {}) {
  const baseUrl = config.endpointUrl?.replace(/\/api\/method\/graphql$/, "") || "";

  if (!baseUrl || !html) return html || "";
  return String(html)
    .replace(/(src|href)="\/files\//g, `$1="${baseUrl}/files/`)
    .replace(/(src|href)='\/files\//g, `$1='${baseUrl}/files/`);
}

export function mapHDArticleCategoryNode(node, articleCount = 0) {
  const createdAt = node.creation || "";
  const updatedAt = node.modified || "";

  return {
    id: node.name,
    name: node.category_name || node.name,
    description: node.description || "",
    icon: node.icon || "",
    count: articleCount,
    createdAt,
    createdAtLabel: formatIndiaDateTime(createdAt),
    updatedAt,
    updatedAtLabel: formatIndiaDateTime(updatedAt),
    raw: node,
  };
}

export function mapHDArticleNode(node, config = {}) {
  const categoryId = linkName(node.category) || node.category__name || "";
  const content = normalizeAssetUrls(node.content || "", config);
  const viewCount = Number(node.views) || 0;
  const summary = stripHtml(content).slice(0, 180);
  const publishedOn = node.published_on || "";
  const createdAt = node.creation || "";
  const updatedAt = node.modified || node.published_on || node.creation || "";

  return {
    id: node.name,
    title: node.title || node.name,
    slug: node.title_slug || "",
    categoryId,
    category: node.category__name || categoryId || "Knowledge base",
    author: node.author__name || linkName(node.author) || "",
    summary,
    body: summary,
    content,
    viewCount,
    views: `${viewCount} ${viewCount === 1 ? "view" : "views"}`,
    likeCount: Number(node.likes || node.like_count) || 0,
    comments: [],
    status: node.status || "",
    publishedOn,
    publishedOnLabel: formatIndiaDateTime(publishedOn),
    createdAt,
    createdAtLabel: formatIndiaDateTime(createdAt),
    updatedAt,
    updatedAtLabel: formatIndiaDateTime(updatedAt),
    raw: node,
  };
}

export function mapHDArticlesResponse(data, config = {}) {
  return data?.HDArticles?.edges?.map((edge) => mapHDArticleNode(edge.node, config)).filter(Boolean) || [];
}

export function mapHDArticleCategoriesResponse(data, articles = []) {
  const counts = articles.reduce((map, article) => {
    if (article.categoryId) map.set(article.categoryId, (map.get(article.categoryId) || 0) + 1);
    return map;
  }, new Map());

  return (
    data?.HDArticleCategorys?.edges
      ?.map((edge) => mapHDArticleCategoryNode(edge.node, counts.get(edge.node.name) || 0))
      .filter(Boolean) || []
  );
}

export function mapHDArticleCommentsResponse(data) {
  return (
    data?.Comments?.edges?.map((edge) => {
      const node = edge.node;
      return {
        id: node.name,
        author: node.comment_by || node.comment_email || "User",
        email: node.comment_email || "",
        time: formatIndiaDateTime(node.creation || ""),
        body: stripHtml(node.content || ""),
        raw: node,
      };
    }) || []
  );
}
