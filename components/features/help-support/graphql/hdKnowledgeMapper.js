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

function normalizeAssetUrls(html) {
  const baseUrl =
    process.env.NEXT_PUBLIC_HELP_SUPPORT_ASSET_BASE_URL ||
    process.env.NEXT_PUBLIC_HELP_SUPPORT_GRAPHQL_ENDPOINT?.replace(/\/api\/method\/graphql$/, "") ||
    process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT_UAT?.replace(/\/api\/method\/graphql$/, "") ||
    "";

  if (!baseUrl || !html) return html || "";
  return String(html)
    .replace(/(src|href)="\/files\//g, `$1="${baseUrl}/files/`)
    .replace(/(src|href)='\/files\//g, `$1='${baseUrl}/files/`);
}

export function mapHDArticleCategoryNode(node, articleCount = 0) {
  return {
    id: node.name,
    name: node.category_name || node.name,
    description: node.description || "",
    icon: node.icon || "",
    count: articleCount,
    createdAt: node.creation || "",
    updatedAt: node.modified || "",
    raw: node,
  };
}

export function mapHDArticleNode(node) {
  const categoryId = linkName(node.category) || node.category__name || "";
  const content = normalizeAssetUrls(node.content || "");
  const viewCount = Number(node.views) || 0;
  const summary = stripHtml(content).slice(0, 180);

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
    status: node.status || "",
    publishedOn: node.published_on || "",
    createdAt: node.creation || "",
    updatedAt: node.modified || node.published_on || node.creation || "",
    raw: node,
  };
}

export function mapHDArticlesResponse(data) {
  return data?.HDArticles?.edges?.map((edge) => mapHDArticleNode(edge.node)).filter(Boolean) || [];
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
