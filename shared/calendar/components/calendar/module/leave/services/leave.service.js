import { graphqlRequest } from "@calendar/lib/graphql-client";
import { getCached } from "@calendar/lib/data-cache";
import { LEAVE_ALLOCATIONS_QUERY, LEAVE_APPLICATIONS_QUERY, LEAVE_QUERY, SAVE_LEAVE_APPLICATION_MUTATION, UPDATE_LEAVE_ATTACHMENT_MUTATION, UPDATE_LEAVE_STATUS_MUTATION } from "@calendar/components/calendar/module/leave/graphql/leave.query";
import { clearLeaveCache, getCachedLeaveBalance, getLeaveCacheKey, setCachedLeaveBalance } from "@calendar/components/calendar/module/leave/cache/leave-cache";
import { mapErpLeaveToCalendar } from "@calendar/components/calendar/module/leave/mappers/leave.mapper";
import { clearEventCache } from "@calendar/lib/calendar/event-cache";
import { clearCached } from "@calendar/lib/data-cache";
import {
  enqueueDocShareSync,
  syncDocShares,
} from "@calendar/components/calendar/module/event/services/docshare.service";


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
  
    const data = await graphqlRequest(
      UPDATE_LEAVE_STATUS_MUTATION,
      {
        name: leaveName,
        value: newStatus,
      }
    );
  
    if (!data?.setValue?.name) {
      throw new Error("Failed to update leave status");
    }
  
    // Clear all relevant caches
    clearEventCache();
    clearCached(["LEAVE_APPLICATIONS"]);
    clearLeaveCache();
  
    return true;
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
    { fieldname: "status", operator: "EQ", value: "Approved" },
    { fieldname: "docstatus", operator: "EQ", value: "1" },
  ];
  
  const getLeavePendingFilters = (employeeId) => [
    { fieldname: "employee", operator: "EQ", value: employeeId },
    { fieldname: "status", operator: "EQ", value: "Open" },
  ];
  
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
  
    const [allocRes, usedRes, pendingRes] = await Promise.all([
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
    ]);
  
    const balance = {};
  
    allocRes.LeaveAllocations.edges.forEach(({ node }) => {
      balance[node.leave_type__name] = {
        allocated: node.total_leaves_allocated,
        used: 0,
        pending: 0,
      };
    });
  
    usedRes.LeaveApplications.edges.forEach(({ node }) => {
      if (balance[node.leave_type__name]) {
        balance[node.leave_type__name].used += node.total_leave_days;
      }
    });
  
    pendingRes.LeaveApplications.edges.forEach(({ node }) => {
      if (balance[node.leave_type__name]) {
        balance[node.leave_type__name].pending += node.total_leave_days;
      }
    });
  
    Object.values(balance).forEach((b) => {
      b.available = b.allocated - b.used - b.pending;
    });
  
    setCachedLeaveBalance(cacheKey, balance);
    return balance;
  }
