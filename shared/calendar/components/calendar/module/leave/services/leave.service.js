import { graphqlRequest } from "@calendar/lib/graphql-client";
import { AUTH_CONFIG } from "@calendar/components/auth/calendar-users";
import { getCached } from "@calendar/lib/data-cache";
import { LEAVE_ALLOCATIONS_QUERY, LEAVE_APPLICATIONS_QUERY, LEAVE_QUERY, LEAVE_TYPES_QUERY, SAVE_LEAVE_APPLICATION_MUTATION, UPDATE_LEAVE_ATTACHMENT_MUTATION, UPDATE_LEAVE_STATUS_MUTATION } from "@calendar/components/calendar/module/leave/graphql/leave.query";
import { clearLeaveCache, getCachedLeaveBalance, getLeaveCacheKey, setCachedLeaveBalance } from "@calendar/components/calendar/module/leave/cache/leave-cache";
import { mapErpLeaveToCalendar } from "@calendar/components/calendar/module/leave/mappers/leave.mapper";
import { clearEventCache } from "@calendar/lib/calendar/event-cache";
import { clearCached } from "@calendar/lib/data-cache";
import { normalizeStatus } from "@calendar/components/calendar/helpers";
import {
  enqueueDocShareSync,
  syncDocShares,
} from "@calendar/components/calendar/module/event/services/docshare.service";

// ERP's Leave Application `status` field is a Select whose only valid values are
// the Title-Case options "Open" | "Approved" | "Rejected" | "Cancelled". Sending
// an upper-cased value (e.g. "REJECTED") is refused by ERP with a ValidationError
// ("Status cannot be 'REJECTED'. It should be one of ..."), which is exactly why
// leave rejection was failing. Keep these Title-Case to match the field options.
const ERP_LEAVE_STATUS_MAP = {
  open: "Open",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  canceled: "Cancelled",
};

function normalizeLeaveStatusValue(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return ERP_LEAVE_STATUS_MAP[normalized] ?? String(status ?? "").trim();
}

// Frappe returns validation failures as HTTP 417 with the human-readable reason
// buried in `_server_messages` (a JSON string whose items are themselves JSON
// strings like {"message": "...", "title": "..."}) or in `exception`. Surfacing
// only `HTTP 417` hides *why* a leave write was refused (e.g. "Insufficient
// leave balance for Leave Type Casual Leave"), so pull out the real text.
function extractErpError(json) {
  if (!json) return null;

  const stripHtml = (value) =>
    String(value).replace(/<[^>]*>/g, "").trim();

  const serverMessages = json._server_messages;
  if (serverMessages) {
    try {
      const parsed = JSON.parse(serverMessages);
      const messages = (Array.isArray(parsed) ? parsed : [parsed])
        .map((item) => {
          try {
            const obj = typeof item === "string" ? JSON.parse(item) : item;
            return obj?.message ?? (typeof obj === "string" ? obj : null);
          } catch {
            return typeof item === "string" ? item : null;
          }
        })
        .map((message) => (message ? stripHtml(message) : null))
        .filter(Boolean);

      if (messages.length) return messages.join(" ");
    } catch {
      /* fall through to other fields */
    }
  }

  if (json.exception || json.exc_type) {
    // e.g. "frappe.exceptions.ValidationError: <reason>"
    return stripHtml(json.exception || json.exc_type).split("\n")[0];
  }

  return json.message ? stripHtml(json.message) : null;
}

function getErpBaseUrl() {
  const { erpUrl } = AUTH_CONFIG;

  if (!erpUrl) {
    throw new Error("Missing ERP auth configuration");
  }

  return erpUrl
    .replace(/(\/api(?:\/method)?\/graphql|\/graphql)\/?$/i, "")
    .replace(/\/$/, "");
}

async function erpJsonRequest(path, { method = "GET", body } = {}) {
  const { authToken } = AUTH_CONFIG;

  if (!authToken) {
    throw new Error("Missing ERP auth configuration");
  }

  const response = await fetch(`${getErpBaseUrl()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `token ${authToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    throw new Error("Invalid response from ERP");
  }

  if (!response.ok) {
    throw new Error(
      extractErpError(json) || `HTTP ${response.status}`
    );
  }

  if (json?.exc || json?.exception) {
    throw new Error(extractErpError(json) || "ERP request failed");
  }

  return json;
}

async function fetchLeaveApplicationSnapshot(leaveName) {
  const response = await erpJsonRequest(
    `/api/resource/Leave Application/${encodeURIComponent(leaveName)}`
  );

  return response?.data ?? null;
}

async function updateLeaveApplicationResource(leaveName, payload) {
  await erpJsonRequest(
    `/api/resource/Leave Application/${encodeURIComponent(leaveName)}`,
    {
      method: "PUT",
      body: payload,
    }
  );
}

async function saveLeaveApplicationDoc(doc) {
  await erpJsonRequest("/api/method/frappe.client.save", {
    method: "POST",
    body: {
      doc: JSON.stringify(doc),
    },
  });
}

async function submitLeaveApplication(doc) {
  await erpJsonRequest("/api/method/frappe.client.submit", {
    method: "POST",
    body: {
      doc: JSON.stringify(doc),
    },
  });
}

// Applies a "Leave Approval" workflow transition action (e.g. "Reject"). Unlike
// a direct status write — which the workflow silently reverts — this is the
// sanctioned way to move `status`, exactly what the desk does when the approver
// clicks the action button.
async function applyLeaveWorkflowAction(snapshot, action) {
  await erpJsonRequest(
    "/api/method/frappe.model.workflow.apply_workflow",
    {
      method: "POST",
      body: {
        doc: JSON.stringify(snapshot),
        action,
      },
    }
  );
}

// In the active "Leave Approval" workflow both "Approved" and "Rejected" are
// SUBMITTED states (docstatus 1). So both are finalised the same, proven way the
// approval has always worked: set the status, then submit. Rejection used to fail
// only because it skipped this submit step.
const STATUSES_REQUIRING_SUBMIT = new Set(["Approved", "Rejected"]);

async function readVerifiedLeaveStatus(leaveName) {
  const snapshot = await fetchLeaveApplicationSnapshot(leaveName);

  return {
    snapshot,
    currentStatus: normalizeLeaveStatusValue(snapshot?.status),
  };
}

async function attemptGraphqlLeaveStatusUpdate(leaveName, statusValue) {
  const data = await graphqlRequest(
    UPDATE_LEAVE_STATUS_MUTATION,
    {
      name: leaveName,
      value: statusValue,
    }
  );

  if (!data?.setValue?.name) {
    throw new Error("Failed to update leave status");
  }
}

export async function saveLeaveApplication(doc, options = {}) {
    const data = await graphqlRequest(SAVE_LEAVE_APPLICATION_MUTATION, {
      doc: JSON.stringify(doc),
    });
  
    if (!data?.saveDoc?.doc?.name) {
      throw new Error("Failed to create Leave Application");
    }

    if (options.shareWithUserIds?.length) {
      const shareOptions = {
        skipExistingCheck: options.skipExistingShareCheck,
      };

      if (options.deferShareSync !== false) {
        void enqueueDocShareSync(
          "Leave Application",
          data.saveDoc.doc.name,
          options.shareWithUserIds,
          shareOptions
        );
      } else {
        await syncDocShares(
          "Leave Application",
          data.saveDoc.doc.name,
          options.shareWithUserIds,
          shareOptions
        );
      }
    }

    clearEventCache();
    clearCached(["LEAVE_APPLICATIONS"]);
    clearLeaveCache();
    return data.saveDoc.doc;
  }
  export async function fetchAllLeaveApplications() {
    return getCached("LEAVE_APPLICATIONS", async () => {
      const data = await graphqlRequest(LEAVE_QUERY, {
        first: 500,
      });
  
      return data.LeaveApplications.edges
        .map(edge => mapErpLeaveToCalendar(edge.node))
        .filter(Boolean);
    });
  }
  export async function updateLeaveAttachment(leaveName, fileUrl) {
    if (!leaveName || !fileUrl) return;
  
    const data = await graphqlRequest(
      UPDATE_LEAVE_ATTACHMENT_MUTATION,
      {
        name: leaveName,
        value: fileUrl,
      }
    );
  
  if (!data?.setValue?.name) {
    throw new Error("Failed to update leave attachment");
  }
  clearEventCache();
  clearCached(["LEAVE_APPLICATIONS"]);
  clearLeaveCache();
  return true;
}
  export async function updateLeaveStatus(leaveName, newStatus) {
    if (!leaveName || !newStatus) {
      throw new Error("Invalid leave update payload");
    }

    const targetStatus = normalizeLeaveStatusValue(newStatus);

    // Rejection can't be done by writing the status field: the "Leave Approval"
    // workflow reverts a direct "Rejected" write (even followed by submit) back
    // to "Open". It only accepts the move via the workflow's "Reject" ACTION —
    // exactly what the desk fires. Approval, by contrast, works fine via the
    // setValue + submit flow below, so it's left untouched.
    if (targetStatus === "Rejected") {
      const { snapshot } = await readVerifiedLeaveStatus(leaveName);
      if (!snapshot) {
        throw new Error("Leave Application not found");
      }

      await applyLeaveWorkflowAction(snapshot, "Reject");

      const verification = await readVerifiedLeaveStatus(leaveName);
      if (verification.currentStatus === "Rejected") {
        clearEventCache();
        clearCached(["LEAVE_APPLICATIONS"]);
        clearLeaveCache();
        return normalizeStatus(verification.currentStatus);
      }

      throw new Error('Leave status was not updated to "Rejected".');
    }

    // Approved is finalised by "set status, then submit" — the proven approval
    // flow, unchanged.
    const needsSubmit = STATUSES_REQUIRING_SUBMIT.has(targetStatus);
    let lastError = null;

    try {
      await attemptGraphqlLeaveStatusUpdate(leaveName, targetStatus);
      const verification = await readVerifiedLeaveStatus(leaveName);

      // Approved/Rejected aren't final until the doc is submitted (docstatus 1).
      const stillNeedsSubmit =
        needsSubmit &&
        Number(verification.snapshot?.docstatus ?? 0) !== 1;

      if (verification.currentStatus === targetStatus && !stillNeedsSubmit) {
        clearEventCache();
        clearCached(["LEAVE_APPLICATIONS"]);
        clearLeaveCache();
        return normalizeStatus(verification.currentStatus);
      }
    } catch (error) {
      lastError = error;
    }

    const verification = await readVerifiedLeaveStatus(leaveName);
    let snapshot = verification.snapshot;

    if (needsSubmit && snapshot && Number(snapshot.docstatus ?? 0) !== 1) {
      try {
        // Submit with the target status forced onto the doc so the submit both
        // moves the workflow state and finalises it (docstatus 1) — identical to
        // how an approval lands at Approved + docstatus 1.
        await submitLeaveApplication({ ...snapshot, status: targetStatus });
        const postSubmitVerification =
          await readVerifiedLeaveStatus(leaveName);

        snapshot = postSubmitVerification.snapshot;
        if (postSubmitVerification.currentStatus === targetStatus) {
          clearEventCache();
          clearCached(["LEAVE_APPLICATIONS"]);
          clearLeaveCache();
          return normalizeStatus(postSubmitVerification.currentStatus);
        }
      } catch (error) {
        lastError = error;
      }
    }

    try {
      await updateLeaveApplicationResource(leaveName, {
        status: targetStatus,
      });

      const resourceVerification =
        await readVerifiedLeaveStatus(leaveName);

      snapshot = resourceVerification.snapshot;
      if (resourceVerification.currentStatus === targetStatus) {
        clearEventCache();
        clearCached(["LEAVE_APPLICATIONS"]);
        clearLeaveCache();
        return normalizeStatus(resourceVerification.currentStatus);
      }
    } catch (error) {
      lastError = error;
    }

    if (snapshot) {
      try {
        await saveLeaveApplicationDoc({
          ...snapshot,
          status: targetStatus,
        });

        const savedVerification =
          await readVerifiedLeaveStatus(leaveName);

        if (savedVerification.currentStatus === targetStatus) {
          clearEventCache();
          clearCached(["LEAVE_APPLICATIONS"]);
          clearLeaveCache();
          return normalizeStatus(savedVerification.currentStatus);
        }
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("Failed to update leave status");
  }
// ---------------------------------------------
// Leave Filters
// ---------------------------------------------
const getLeaveAllocationFilters = (employeeId) => [
    { fieldname: "employee", operator: "EQ", value: employeeId },
    { fieldname: "docstatus", operator: "EQ", value: "1" },
  ];
  
const getLeaveUsedFilters = (employeeId) => [
    { fieldname: "employee", operator: "EQ", value: employeeId },
    { fieldname: "status", operator: "EQ", value: "APPROVED" },
    { fieldname: "docstatus", operator: "EQ", value: "1" },
  ];
  
const getLeavePendingFilters = (employeeId) => [
    { fieldname: "employee", operator: "EQ", value: employeeId },
    { fieldname: "status", operator: "EQ", value: "OPEN" },
  ];

const LEAVE_WITHOUT_PAY_NAMES = new Set([
  "Leave Without Pay",
  "LWP",
]);

export async function fetchLeaveTypes() {
  return getCached("LEAVE_TYPES", async () => {
    const data = await graphqlRequest(LEAVE_TYPES_QUERY, {
      first: 100,
    });

    return (
      data?.LeaveTypes?.edges
        ?.map(({ node }) => node?.name)
        .filter(Boolean) ?? []
    );
  });
}
  
  /* =====================================================
     EMPLOYEE LEAVE BALANCE (WITH CACHE)
  ===================================================== */
  export async function fetchEmployeeLeaveBalance(employeeId) {
    const cacheKey = getLeaveCacheKey(employeeId);
    const cached = getCachedLeaveBalance(cacheKey);
  
    // ⏱ 5-minute TTL
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return cached.data;
    }
  
    const [allocRes, usedRes, pendingRes, leaveTypes] = await Promise.all([
      graphqlRequest(LEAVE_ALLOCATIONS_QUERY, {
        first: 20,
        filters: getLeaveAllocationFilters(employeeId),
      }),
      graphqlRequest(LEAVE_APPLICATIONS_QUERY, {
        first: 100,
        filters: getLeaveUsedFilters(employeeId),
      }),
      graphqlRequest(LEAVE_APPLICATIONS_QUERY, {
        first: 100,
        filters: getLeavePendingFilters(employeeId),
      }),
      fetchLeaveTypes(),
    ]);
  
    const balance = {};
    const allocationEdges =
      allocRes?.LeaveAllocations?.edges ?? [];
    const usedEdges =
      usedRes?.LeaveApplications?.edges ?? [];
    const pendingEdges =
      pendingRes?.LeaveApplications?.edges ?? [];

    leaveTypes.forEach((leaveTypeName) => {
      balance[leaveTypeName] = {
        allocated: 0,
        used: 0,
        pending: 0,
        available: 0,
        isLeaveWithoutPay:
          LEAVE_WITHOUT_PAY_NAMES.has(leaveTypeName),
      };
    });
  
    // An employee is re-allocated leave each period, so ERP returns BOTH the
    // expired allocation and the current one for the same leave type (e.g.
    // Privilege Leave: 8 for 2025-11..2026-03, then 6 for 2026-04..2027-03).
    // Only the allocation whose window covers TODAY is valid — otherwise the UI
    // shows last period's number (8 instead of 6). ERP dates are date-only, so
    // ISO "YYYY-MM-DD" strings compare correctly with plain <=.
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const isCurrentAllocation = (node) =>
      node?.from_date &&
      node?.to_date &&
      node.from_date <= todayStr &&
      todayStr <= node.to_date;

    // Current-period window per leave type (summed if several current
    // allocations overlap), used to both set `allocated` and to scope which
    // used/pending leaves count toward it.
    const currentPeriodByType = {};
    allocationEdges.forEach(({ node }) => {
      const type = node.leave_type__name;
      if (!type || !isCurrentAllocation(node)) return;

      const existing = currentPeriodByType[type];
      currentPeriodByType[type] = {
        allocated:
          (existing?.allocated ?? 0) + (node.total_leaves_allocated ?? 0),
        from:
          existing && existing.from < node.from_date
            ? existing.from
            : node.from_date,
        to:
          existing && existing.to > node.to_date ? existing.to : node.to_date,
      };
    });

    Object.entries(currentPeriodByType).forEach(([type, info]) => {
      if (balance[type]) balance[type].allocated = info.allocated;
    });

    // A used/pending leave only counts if it falls inside its type's current
    // allocation window — otherwise last period's approved leaves would be
    // subtracted from this period's allocation.
    const fallsInCurrentPeriod = (node) => {
      const info = currentPeriodByType[node.leave_type__name];
      return (
        info &&
        node.from_date &&
        node.from_date >= info.from &&
        node.from_date <= info.to
      );
    };

    usedEdges.forEach(({ node }) => {
      if (balance[node.leave_type__name] && fallsInCurrentPeriod(node)) {
        balance[node.leave_type__name].used += node.total_leave_days ?? 0;
      }
    });

    pendingEdges.forEach(({ node }) => {
      if (balance[node.leave_type__name] && fallsInCurrentPeriod(node)) {
        balance[node.leave_type__name].pending += node.total_leave_days ?? 0;
      }
    });
  
    Object.values(balance).forEach((b) => {
      b.available = b.allocated - b.used - b.pending;
    });
  
    setCachedLeaveBalance(cacheKey, balance);
    return balance;
  }
