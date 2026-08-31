"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, RotateCw, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@calendar/components/ui/avatar";
import { Button } from "@calendar/components/ui/button";
import { Input } from "@calendar/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@calendar/components/ui/select";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import GoogleCalendarConnect from "@calendar/components/calendar/google-auth";
import { getAvatarColorBySeed, getFirstLetters } from "@calendar/components/calendar/helpers";
import { roleCodeFromProfile } from "@calendar/lib/meetingRoles";
import { resolveVisibleEmployeeIds } from "@calendar/lib/employeeHeirachy";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { cn } from "@calendar/lib/utils";

const MOBILE_LAYER_MAP = {
  month: "month-expanded",
  week: "week",
  agenda: "agenda",
};

const VIEW_OPTIONS = [
  { label: "Agenda", value: "agenda" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

const ROLE_TAB_ORDER = ["everyone", "BE", "ABM", "RBM"];

function buildDepartmentMap(elbritRoleEdges = []) {
  const nextMap = new Map();

  elbritRoleEdges.forEach(({ node }) => {
    if (!node?.role_id) return;
    nextMap.set(node.role_id, node.sales_team__name ?? null);
  });

  return nextMap;
}

// An empty selection is the calendar's "no employee filter" state, which shows
// every calendar the user is allowed to see.
function formatViewingLabel(selectedUsers) {
  if (selectedUsers.length === 0) return "Everyone";
  if (selectedUsers.length === 1) return selectedUsers[0].name;
  if (selectedUsers.length === 2) {
    return `${selectedUsers[0].name}, ${selectedUsers[1].name}`;
  }
  return `${selectedUsers[0].name} +${selectedUsers.length - 1}`;
}

export function MobileSchedulerSidebarContent({ open, onClose }) {
  const {
    view,
    setView,
    setMobileLayer,
    users = [],
    usersLoading,
    selectedUserId,
    filterEventsBySelectedUser,
    elbritRoleEdges,
    elbritRoleLoading,
    pendingSyncCount,
    retryPendingSync,
    isRetryingSync,
  } = useCalendar();

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  // Role tab is a list filter only — it never changes who is selected.
  const [activeRoleTab, setActiveRoleTab] = useState("everyone");
  // Single source of truth for the draft selection. Empty = everyone.
  const [draftSelectedIds, setDraftSelectedIds] = useState([LOGGED_IN_USER.id]);
  const wasOpenRef = useRef(false);
  // Once the user has changed the draft, the committed filter must not overwrite it.
  const hasEditedRef = useRef(false);

  const visibleUsers = useMemo(() => {
    if (usersLoading || elbritRoleLoading) return [];
    const allowedEmployeeIds = resolveVisibleEmployeeIds(elbritRoleEdges, users);
    return users.filter((user) => allowedEmployeeIds.includes(user.id));
  }, [elbritRoleEdges, elbritRoleLoading, users, usersLoading]);

  const departmentByRoleId = useMemo(
    () => buildDepartmentMap(elbritRoleEdges),
    [elbritRoleEdges]
  );

  const enrichedUsers = useMemo(() => {
    return visibleUsers.map((user) => ({
      ...user,
      department: departmentByRoleId.get(user.roleId) ?? null,
      roleCode: roleCodeFromProfile(user.roleId ?? user.role) ?? "OTHER",
    }));
  }, [departmentByRoleId, visibleUsers]);

  const departmentOptions = useMemo(() => {
    return [...new Set(enrichedUsers.map((user) => user.department).filter(Boolean))].sort(
      (left, right) => left.localeCompare(right)
    );
  }, [enrichedUsers]);

  const roleCounts = useMemo(() => {
    const counts = { everyone: enrichedUsers.length, BE: 0, ABM: 0, RBM: 0 };
    enrichedUsers.forEach((user) => {
      if (counts[user.roleCode] != null) counts[user.roleCode] += 1;
    });
    return counts;
  }, [enrichedUsers]);

  const selectedIdSet = useMemo(
    () => new Set(draftSelectedIds),
    [draftSelectedIds]
  );

  const quickSwitchUsers = useMemo(() => {
    const selectedSet = selectedIdSet;
    const sorted = [...enrichedUsers].sort((left, right) => {
      const leftSelected = selectedSet.has(left.id) ? 1 : 0;
      const rightSelected = selectedSet.has(right.id) ? 1 : 0;
      if (leftSelected !== rightSelected) return rightSelected - leftSelected;
      if (left.id === LOGGED_IN_USER.id) return -1;
      if (right.id === LOGGED_IN_USER.id) return 1;
      return (left.name || "").localeCompare(right.name || "");
    });
    return sorted.slice(0, 5);
  }, [selectedIdSet, enrichedUsers]);

  const filteredUsers = useMemo(() => {
    let nextUsers = enrichedUsers;

    if (activeRoleTab !== "everyone") {
      nextUsers = nextUsers.filter((user) => user.roleCode === activeRoleTab);
    }

    if (departmentFilter !== "all") {
      nextUsers = nextUsers.filter((user) => user.department === departmentFilter);
    }

    const query = search.trim().toLowerCase();
    if (!query) return nextUsers;

    return nextUsers.filter((user) => (
      user.name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query) ||
      user.role?.toLowerCase().includes(query) ||
      user.department?.toLowerCase().includes(query) ||
      user.roleId?.toLowerCase().includes(query)
    ));
  }, [activeRoleTab, departmentFilter, enrichedUsers, search]);

  const selectedUsers = useMemo(
    () => enrichedUsers.filter((user) => selectedIdSet.has(user.id)),
    [selectedIdSet, enrichedUsers]
  );

  const allFilteredSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((user) => selectedIdSet.has(user.id));

  // Mirror the committed filter into the draft until the user touches it. The
  // calendar applies its default filter only once employees finish loading, so
  // on a slow connection that lands while the sheet is already open — the old
  // unconditional mirror then wiped whatever had just been tapped.
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      hasEditedRef.current = false;
      return;
    }

    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setActiveRoleTab("everyone");
      setSearch("");
      setDepartmentFilter("all");
    }

    if (hasEditedRef.current) return;

    setDraftSelectedIds(
      Array.isArray(selectedUserId) ? [...selectedUserId] : []
    );
  }, [open, selectedUserId]);

  const isUserSelected = (userId) => selectedIdSet.has(userId);

  const setSelection = (updater) => {
    hasEditedRef.current = true;
    setDraftSelectedIds(updater);
  };

  const selectSingleUser = (userId) => {
    setSelection([userId]);
  };

  // Plain add/remove: no silent substitutions, so a tap always does exactly
  // what it looks like. Deselecting everyone lands on "Everyone" (no filter).
  const toggleUser = (userId) => {
    setSelection((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const applyRoleTab = (roleCode) => {
    setActiveRoleTab(roleCode);
  };

  const toggleAllFiltered = () => {
    const filteredIds = filteredUsers.map((user) => user.id);

    setSelection((prev) => {
      if (allFilteredSelected) {
        const filteredSet = new Set(filteredIds);
        return prev.filter((id) => !filteredSet.has(id));
      }

      return [...new Set([...prev, ...filteredIds])];
    });
  };

  const handleSelectEveryone = () => {
    setSelection([]);
  };

  const handleReset = () => {
    setSelection([LOGGED_IN_USER.id]);
    setActiveRoleTab("everyone");
    setSearch("");
    setDepartmentFilter("all");
  };

  const handleDone = () => {
    filterEventsBySelectedUser(draftSelectedIds);
    onClose?.();
  };

  const handleViewChange = (nextView) => {
    setView(nextView);
    setMobileLayer(MOBILE_LAYER_MAP[nextView]);
  };

  const isEveryoneSelected = draftSelectedIds.length === 0;
  // Selected ids can outrun the loaded employee list, so fall back to a count
  // instead of reading as "Everyone" while names are still resolving.
  const viewingLabel =
    !isEveryoneSelected && selectedUsers.length === 0
      ? `${draftSelectedIds.length} selected`
      : formatViewingLabel(selectedUsers);
  const viewingCount = isEveryoneSelected
    ? enrichedUsers.length
    : draftSelectedIds.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="border-b border-slate-100 px-3 pb-2 pt-1">
        <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1">
          {VIEW_OPTIONS.map((option) => {
            const isActive = view === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleViewChange(option.value)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition",
                  isActive && "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-2">
        <section className="space-y-2.5">
          <div>
            <p className="text-sm font-medium text-slate-400">Quick switch</p>
            <div className="mt-2 flex gap-2 overflow-x-auto overflow-y-visible px-1 py-1">
              {quickSwitchUsers.map((user) => {
                const isSelected = isUserSelected(user.id);

                return (
                  <button
                    key={user.id}
                    type="button"
                    aria-pressed={isSelected}
                    title={`View only ${user.name}`}
                    onClick={() => selectSingleUser(user.id)}
                    className="flex min-w-[54px] flex-col items-center gap-1"
                  >
                    <span
                      className={cn(
                        "flex size-12 items-center justify-center rounded-full p-[3px]",
                        isSelected
                          ? "border-2 border-blue-500 bg-white"
                          : "border-2 border-transparent bg-transparent"
                      )}
                    >
                      <Avatar className="size-full border border-white/20">
                        <AvatarImage src={user.picturePath ?? undefined} alt={user.name} />
                        <AvatarFallback
                          className={cn(
                            "text-xs font-semibold text-white",
                            getAvatarColorBySeed(user.name || user.id)
                          )}
                        >
                          {getFirstLetters(user.name)}
                        </AvatarFallback>
                      </Avatar>
                    </span>
                    <span className="max-w-[54px] truncate text-center text-xs text-slate-700">
                      {user.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-b border-slate-100">
            <div className="flex gap-4 overflow-x-auto">
              {ROLE_TAB_ORDER.filter((code) => roleCounts[code] > 0).map((code) => {
                const isActive = activeRoleTab === code;
                const label = code === "everyone" ? "Everyone" : code;

                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => applyRoleTab(code)}
                    className={cn(
                      "relative flex items-center gap-2 pb-2 text-sm font-medium transition",
                      isActive ? "text-blue-600" : "text-slate-500"
                    )}
                  >
                    <span>{label}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        isActive
                          ? "bg-blue-50 text-blue-600"
                          : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {roleCounts[code]}
                    </span>
                    {isActive ? (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="grid grid-cols-[minmax(0,1fr)_128px] gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search people..."
                  className="h-10 rounded-xl border-slate-200 pl-10 text-sm shadow-none"
                />
              </div>

              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="h-10 rounded-xl border-slate-200 text-sm shadow-none">
                  <SelectValue placeholder="All depts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All depts</SelectItem>
                  {departmentOptions.map((department) => (
                    <SelectItem key={department} value={department}>
                      {department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Role tabs, search and department only narrow this list; selection
                changes happen here, so a tap never silently rewrites it. */}
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 text-xs leading-5 text-slate-400">
                Tap a person to add or remove them. Tabs and search only filter
                this list.
              </p>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 rounded-lg px-2 text-xs font-medium text-blue-600 hover:bg-blue-50"
                  disabled={filteredUsers.length === 0}
                  onClick={toggleAllFiltered}
                >
                  {allFilteredSelected
                    ? "Deselect all"
                    : `Select all (${filteredUsers.length})`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 rounded-lg px-2 text-xs font-medium text-slate-500"
                  disabled={isEveryoneSelected}
                  onClick={handleSelectEveryone}
                >
                  Everyone
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            {usersLoading || elbritRoleLoading ? (
              <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500">
                Loading people...
              </div>
            ) : null}

            {!usersLoading && !elbritRoleLoading && filteredUsers.length === 0 ? (
              <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500">
                No people found
              </div>
            ) : null}

            {filteredUsers.map((user) => {
              const isSelected = isUserSelected(user.id);

              return (
                <button
                  key={user.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => toggleUser(user.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition",
                    isSelected ? "bg-blue-50" : "hover:bg-slate-50"
                  )}
                >
                  <Avatar className="size-9">
                    <AvatarImage src={user.picturePath ?? undefined} alt={user.name} />
                    <AvatarFallback
                      className={cn(
                        "text-sm font-semibold text-white",
                        getAvatarColorBySeed(user.name || user.id)
                      )}
                    >
                      {getFirstLetters(user.name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
                    <p className="truncate text-xs text-slate-400">
                      {[user.role, user.department].filter(Boolean).join(" · ") || user.email}
                    </p>
                  </div>

                  {isSelected ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-xs font-medium text-blue-600">Viewing</span>
                      <span className="flex size-7 items-center justify-center rounded-lg bg-blue-600 text-white">
                        <Check className="size-3.5" />
                      </span>
                    </div>
                  ) : (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Plus className="size-3.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5">
        <div className="rounded-[22px] bg-slate-950 px-3 py-2 text-white shadow-lg">
          <div className="flex items-center gap-2">
            <Avatar className="size-8">
              <AvatarFallback className="bg-sky-700 text-xs font-semibold text-white">
                {isEveryoneSelected ? "ALL" : getFirstLetters(viewingLabel)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-400">Now viewing</p>
              <p className="truncate text-sm font-semibold">{viewingLabel}</p>
              <p className="text-xs text-slate-400">
                {viewingCount} {viewingCount === 1 ? "calendar" : "calendars"}
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              className="h-7 rounded-lg px-2 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white"
              title="View only my calendar"
              onClick={handleReset}
            >
              Just me
            </Button>
            <Button
              type="button"
              className="h-7 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
              onClick={handleDone}
            >
              Done
            </Button>
          </div>
        </div>

        <div className="mt-1.5 space-y-1.5">
          <GoogleCalendarConnect className="w-full justify-center rounded-xl text-sm" />
          {pendingSyncCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full rounded-xl border-slate-200 text-sm font-medium"
              onClick={retryPendingSync}
              disabled={isRetryingSync}
            >
              <RotateCw className={cn("mr-2 size-4", isRetryingSync && "animate-spin")} />
              {isRetryingSync ? "Retrying..." : `Retry Sync (${pendingSyncCount})`}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
