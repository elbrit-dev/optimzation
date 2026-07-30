import { graphqlRequest } from "@calendar/lib/graphql-client";
import { mapErpTodoToCalendar } from "@calendar/components/calendar/module/todo/mappers/todo.mapper"
import { getCached } from "@calendar/lib/data-cache";
import { GET_TODO_COMMENTS, SAVE_COMMENT, SAVE_EVENT_TODO, TODO_LIST_QUERY } from "@calendar/components/calendar/module/todo/graphql/todo.query";
import { normalizeChecklistFromERP } from "@calendar/components/calendar/module/todo/helpers/checklist.helper";
import { invalidateCalendarData } from "@calendar/lib/calendar/invalidate";
import {
  enqueueDocShareSync,
  syncDocShares,
} from "@calendar/components/calendar/module/event/services/docshare.service";

export async function fetchAllTodoList() {
    return getCached("TODO_LIST", async () => {
      const data = await graphqlRequest(TODO_LIST_QUERY, {
        first: 500,
      });
      return data.ToDoes.edges
        .map(edge => mapErpTodoToCalendar(edge.node))
        .filter(Boolean);
    });
  }

  export async function fetchTodoComments(referenceName) {
    const res = await graphqlRequest(GET_TODO_COMMENTS, {
      referenceName,
    });
  
    const nodes = res?.Comments?.edges?.map(e => e.node) ?? [];
  
    // convert ERP → Tiptap
    return nodes.map((c) => ({
      ...c,
      content: normalizeChecklistFromERP(c.content),
    }));
  }

  export async function saveTodoComment(doc) {
    const data = await graphqlRequest(SAVE_COMMENT, {
      doc: JSON.stringify(doc),
    });
  
    if (!data?.saveDoc?.doc?.name) {
      throw new Error("ERP did not return Comment name");
    }
  
    return data.saveDoc.doc;
  }

  
export async function saveDocToErp(doc, options = {}) {
  const data = await graphqlRequest(SAVE_EVENT_TODO, {
    doc: JSON.stringify(doc),
  });

  if (!data?.saveDoc?.doc?.name) {
    throw new Error("ERP did not return document name");
  }

  if (options.shareWithUserIds?.length) {
    const shareOptions = {
      skipExistingCheck: options.skipExistingShareCheck,
    };

    if (options.deferShareSync !== false) {
      void enqueueDocShareSync(
        "ToDo",
        data.saveDoc.doc.name,
        options.shareWithUserIds,
        shareOptions
      );
    } else {
      await syncDocShares(
        "ToDo",
        data.saveDoc.doc.name,
        options.shareWithUserIds,
        shareOptions
      );
    }
  }

  // Must drop TODO_LIST too, not just the range cache — the range cache is
  // rebuilt from it, so clearing only the outer layer re-merged the same stale
  // todo list and a new/edited todo never showed up until a page reload.
  invalidateCalendarData({ reason: "todo:save" });
  return data.saveDoc.doc;
}
