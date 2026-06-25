import { graphqlRequest } from "@calendar/lib/graphql-client";
import {
  DOC_SHARES_BY_EVENT_QUERY,
  SAVE_DOC_SHARE_MUTATION,
} from "@calendar/components/calendar/module/event/graphql/events.query";
import { ERP_DOC_SHARE_FIELDS } from "@calendar/components/calendar/module/event/graphql/field-config";

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

  await Promise.all(
    missingUserIds.map((userId) =>
      graphqlRequest(SAVE_DOC_SHARE_MUTATION, {
        doc: JSON.stringify({
          [ERP_DOC_SHARE_FIELDS.user]: userId,
          [ERP_DOC_SHARE_FIELDS.shareDoctype]: doctype,
          [ERP_DOC_SHARE_FIELDS.shareName]: documentName,
          read: 1,
          write: 1,
          share: 0,
          notify_by_email: 0,
        }),
      })
    )
  );

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
