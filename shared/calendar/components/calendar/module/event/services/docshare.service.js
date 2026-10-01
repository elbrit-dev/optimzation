import { graphqlRequest } from "@calendar/lib/graphql-client";
import {
  DOC_SHARES_BY_EVENT_QUERY,
  DOC_SHARES_BY_USER_QUERY,
  SAVE_DOC_SHARE_MUTATION,
} from "@calendar/components/calendar/module/event/graphql/events.query";
import { ERP_DOC_SHARE_FIELDS } from "@calendar/components/calendar/module/event/graphql/field-config";

// Names of documents (of `doctype`) that ERP has shared with `userId`. Events are
// permission-scoped in ERP, so a shared event is returned by the events query but
// the client-side hierarchy filter would drop it (the recipient is neither owner
// nor participant). This lets those events be recognised and kept.
export async function fetchDocShareNamesForUser(userId, doctype = "Event") {
  if (!userId || !doctype) {
    return new Set();
  }

  const data = await graphqlRequest(DOC_SHARES_BY_USER_QUERY, {
    first: 500,
    filters: [
      {
        fieldname: ERP_DOC_SHARE_FIELDS.shareDoctype,
        operator: "EQ",
        value: doctype,
      },
      {
        fieldname: ERP_DOC_SHARE_FIELDS.user,
        operator: "EQ",
        value: userId,
      },
    ],
  });

  const names =
    data?.DocShares?.edges
      ?.map(({ node }) => node?.share_name)
      .filter(Boolean) ?? [];

  return new Set(names);
}

export async function fetchDocSharesByDocument(doctype, name) {
  if (!doctype || !name) {
    return [];
  }

  const data = await graphqlRequest(DOC_SHARES_BY_EVENT_QUERY, {
    first: 500,
    filters: [
      {
        fieldname: ERP_DOC_SHARE_FIELDS.shareDoctype,
        operator: "EQ",
        value: doctype,
      },
      {
        fieldname: ERP_DOC_SHARE_FIELDS.shareName,
        operator: "EQ",
        value: name,
      },
    ],
  });

  return data?.DocShares?.edges?.map(({ node }) => node) ?? [];
}

export async function syncDocShares(
  doctype,
  documentName,
  userIds = [],
  options = {}
) {
  const targetUserIds = [...new Set(userIds.filter(Boolean))];

  if (!doctype || !documentName || !targetUserIds.length) {
    return [];
  }

  let existingShares = [];
  let missingUserIds = targetUserIds;

  if (!options.skipExistingCheck) {
    existingShares = await fetchDocSharesByDocument(
      doctype,
      documentName
    );
    const existingUserIds = new Set(
      existingShares
        .map((share) => share?.user?.name)
        .filter(Boolean)
    );

    missingUserIds = targetUserIds.filter(
      (userId) => !existingUserIds.has(userId)
    );
  }

  if (!missingUserIds.length) {
    return existingShares;
  }

  // These writes update permissions for the same document. Sending all of
  // them concurrently makes Frappe transactions contend with one another and
  // can produce MySQL 1205 lock timeouts. A document normally has only a few
  // recipients, so serial writes are both cheap and substantially safer.
  //
  // One recipient ERP rejects (e.g. an address that is not a User) must not
  // cost the others their share: it used to throw out of this loop, so a BE's
  // event reached the SM ahead of a bad ABM address and never the RBM after it.
  // Every recipient is tried; failures are reported together afterwards.
  const failures = [];
  for (const userId of missingUserIds) {
    try {
      await graphqlRequest(SAVE_DOC_SHARE_MUTATION, {
        doc: JSON.stringify({
          [ERP_DOC_SHARE_FIELDS.user]: userId,
          [ERP_DOC_SHARE_FIELDS.shareDoctype]: doctype,
          [ERP_DOC_SHARE_FIELDS.shareName]: documentName,
          read: 1,
          write: 1,
          share: 0,
          notify_by_email: 0,
        }),
      });
    } catch (error) {
      failures.push({ userId, error });
    }
  }

  if (failures.length) {
    const error = new Error(
      `DocShare failed for ${failures.map((f) => f.userId).join(", ")} on ${doctype}:${documentName}: ${
        failures[0].error?.message ?? ""
      }`.trim()
    );
    error.failures = failures;
    throw error;
  }

  return fetchDocSharesByDocument(doctype, documentName);
}

export function enqueueDocShareSync(
  doctype,
  documentName,
  userIds = [],
  options = {}
) {
  return syncDocShares(doctype, documentName, userIds, options).catch(
    (error) => {
      console.error(
        `DocShare sync failed for ${doctype}:${documentName}`,
        error
      );
      return [];
    }
  );
}

export async function syncEventDocShares(
  eventName,
  userIds = [],
  options = {}
) {
  return syncDocShares("Event", eventName, userIds, options);
}
