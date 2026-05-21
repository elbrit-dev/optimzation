console.log = (...args) => console.error(...args);

// plasmic MCP server — drop this into your scripts/ folder
// Run with: node scripts/mcp-server.js

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "dotenv";

// Loads your existing .env.local just like Next.js does
config({ path: ".env.local" });
config({ path: ".env" });

const PROJECT_ID    = process.env.NEXT_PUBLIC_PLASMIC_PROJECT_ID   || process.env.PLASMIC_PROJECT_ID   || "";
const PROJECT_TOKEN = process.env.NEXT_PUBLIC_PLASMIC_PROJECT_TOKEN || process.env.PLASMIC_PROJECT_TOKEN || "";
const CMS_ID           = process.env.PLASMIC_CMS_ID            || "";
const CMS_PUBLIC_TOKEN = process.env.PLASMIC_CMS_PUBLIC_TOKEN  || "";
const CMS_SECRET_TOKEN = process.env.PLASMIC_CMS_SECRET_TOKEN  || "";

const CODEGEN_BASE = "https://codegen.plasmic.app/api/v1";
const CMS_BASE     = "https://data.plasmic.app/api/v1";

const projectHeaders = {
  "x-plasmic-api-project-tokens": `${PROJECT_ID}:${PROJECT_TOKEN}`,
  "Content-Type": "application/json",
};

const cmsHeaders = (write = false) => ({
  "x-plasmic-api-cms-tokens": `${CMS_ID}:${write ? CMS_SECRET_TOKEN : CMS_PUBLIC_TOKEN}`,
  "Content-Type": "application/json",
});

async function plasmicFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Plasmic API ${res.status}: ${text}`);
  }
  return res.json();
}

const server = new McpServer({ name: "plasmic-mcp", version: "1.0.0" });

// ─── PROJECT ──────────────────────────────────────────────────────────────────

server.tool(
  "get_project_info",
  "List all components and pages in the Plasmic project",
  {},
  async () => {
    const data = await plasmicFetch(
      `${CODEGEN_BASE}/loader/v2/sites/${PROJECT_ID}`,
      { headers: projectHeaders }
    );
    const components = (data.components || []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.isPage ? "page" : "component",
      path: c.path ?? null,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify({ projectId: PROJECT_ID, components }, null, 2) }],
    };
  }
);

server.tool(
  "get_project_model",
  "Get full Plasmic project model — components, variants, pages",
  { mode: z.enum(["preview", "published"]).default("preview") },
  async ({ mode }) => {
    const data = await plasmicFetch(
      `${CODEGEN_BASE}/loader/v2/sites/${PROJECT_ID}?mode=${mode}`,
      { headers: projectHeaders }
    );
    const summary = {
      components: (data.components || []).map((c) => ({
        id: c.id,
        name: c.name,
        isPage: c.isPage,
        path: c.path,
        variants: (c.variants || []).map((v) => v.name),
      })),
      globalVariants: data.globalGroups || [],
      imageCount: (data.imageAssets || []).length,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }
);

server.tool(
  "render_component",
  "Render a Plasmic component or page as HTML",
  {
    componentName: z.string().describe("Name of the Plasmic component or page"),
    mode: z.enum(["preview", "published"]).default("preview"),
    hydrate: z.boolean().default(true),
  },
  async ({ componentName, mode, hydrate }) => {
    const params = new URLSearchParams();
    if (hydrate) { params.set("hydrate", "1"); params.set("embedHydrate", "1"); }
    const url = `${CODEGEN_BASE}/loader/html/${mode}/${PROJECT_ID}/${encodeURIComponent(componentName)}?${params}`;
    const data = await plasmicFetch(url, { headers: projectHeaders });
    return {
      content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── CMS ──────────────────────────────────────────────────────────────────────

server.tool(
  "cms_list_items",
  "List items from a Plasmic CMS table",
  {
    tableId: z.string().describe("CMS table/model ID"),
    limit: z.number().default(20),
    offset: z.number().default(0),
    draft: z.boolean().default(false),
  },
  async ({ tableId, limit, offset, draft }) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (draft) params.set("draft", "1");
    const data = await plasmicFetch(
      `${CMS_BASE}/cms/databases/${CMS_ID}/tables/${tableId}/rows?${params}`,
      { headers: cmsHeaders(false) }
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "cms_get_item",
  "Get a single CMS item by row ID",
  {
    tableId: z.string(),
    rowId: z.string(),
  },
  async ({ tableId, rowId }) => {
    const data = await plasmicFetch(
      `${CMS_BASE}/cms/databases/${CMS_ID}/tables/${tableId}/rows/${rowId}`,
      { headers: cmsHeaders(false) }
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "cms_create_item",
  "Create a new item in a Plasmic CMS table",
  {
    tableId: z.string().describe("CMS table/model ID"),
    fields: z.record(z.unknown()).describe("Item field values"),
    publish: z.boolean().default(false),
  },
  async ({ tableId, fields, publish }) => {
    const row = { data: fields, ...(publish ? { publishedAt: new Date().toISOString() } : {}) };
    const data = await plasmicFetch(
      `${CMS_BASE}/cms/databases/${CMS_ID}/tables/${tableId}/rows`,
      { method: "POST", headers: cmsHeaders(true), body: JSON.stringify({ rows: [row] }) }
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "cms_update_item",
  "Update an existing CMS item",
  {
    tableId: z.string(),
    rowId: z.string(),
    fields: z.record(z.unknown()),
    publish: z.boolean().default(false),
  },
  async ({ tableId, rowId, fields, publish }) => {
    const body = { data: fields, ...(publish ? { publishedAt: new Date().toISOString() } : {}) };
    const data = await plasmicFetch(
      `${CMS_BASE}/cms/databases/${CMS_ID}/tables/${tableId}/rows/${rowId}`,
      { method: "PATCH", headers: cmsHeaders(true), body: JSON.stringify(body) }
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "cms_delete_item",
  "Delete a CMS item",
  {
    tableId: z.string(),
    rowId: z.string(),
  },
  async ({ tableId, rowId }) => {
    await plasmicFetch(
      `${CMS_BASE}/cms/databases/${CMS_ID}/tables/${tableId}/rows/${rowId}`,
      { method: "DELETE", headers: cmsHeaders(true) }
    );
    return { content: [{ type: "text", text: `Deleted item ${rowId} from table ${tableId}.` }] };
  }
);

server.tool(
  "cms_count_items",
  "Count items in a Plasmic CMS table",
  { tableId: z.string() },
  async ({ tableId }) => {
    const data = await plasmicFetch(
      `${CMS_BASE}/cms/databases/${CMS_ID}/tables/${tableId}/count`,
      { headers: cmsHeaders(false) }
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ─── START ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Plasmic MCP server running ✓");