import { Avatar, AvatarFallback, AvatarImage } from "@calendar/components/ui/avatar";
import { AvatarGroup } from "@calendar/components/ui/avatar-group";
import { Checkbox } from "@calendar/components/ui/checkbox";
import { Input } from "@calendar/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@calendar/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@calendar/components/ui/select";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { useEffect, useState, useMemo } from "react";
import {resolveVisibleEmployeeIds} from "@calendar/lib/employeeHeirachy";
import { cn } from "@calendar/lib/utils";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";

function EmployeeFilterList({
  users,
  checkedIds,
  onToggleUser,
  showEmail = false,
  showAvatar = false,
  showAllOption = true,
  isAllChecked = false,
  onToggleAll,
  className,
}) {
  return (
    <div className={cn("space-y-1", className)}>
      {showAllOption ? (
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-muted"
          onClick={onToggleAll}
        >
          <Checkbox checked={isAllChecked} />
          <div className="min-w-0">
            <p className="text-sm font-medium">All</p>
          </div>
        </button>
      ) : null}

      {users.map((user) => {
        const checked = checkedIds.includes(user.id);

        return (
          <button
            key={user.id}
            type="button"
            className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition hover:bg-muted"
            onClick={() => onToggleUser(user.id)}
          >
            <Checkbox
              checked={checked}
              className="mt-0.5"
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={() => onToggleUser(user.id)}
            />

            {showAvatar ? (
              <Avatar className="size-6">
                <AvatarImage
                  src={user.picturePath ?? undefined}
                  alt={user.name}
                />
                <AvatarFallback className="text-xxs">
                  {user.name?.[0]}
                </AvatarFallback>
              </Avatar>
            ) : null}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {user.name}
              </p>
              {showEmail && user.email ? (
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function UserSelect({ mode = "popover" }) {
  const {
    users = [],
    usersLoading,
    selectedUserId,
    filterEventsBySelectedUser,elbritRoleEdges,
    elbritRoleLoading,
  } = useCalendar();

  // UI-only checkbox state
  const [checkedIds, setCheckedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [designationFilter, setDesignationFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  useEffect(() => {
    if (mode === "inline" && (!Array.isArray(selectedUserId) || selectedUserId.length === 0)) {
      filterEventsBySelectedUser([LOGGED_IN_USER.id]);
      return;
    }

    setCheckedIds(Array.isArray(selectedUserId) ? selectedUserId : []);
  }, [filterEventsBySelectedUser, mode, selectedUserId]);

  const isAllChecked = checkedIds.length === 0;

  const toggleAll = () => {
    setCheckedIds([]);
    filterEventsBySelectedUser([]);
  };

  const toggleUser = (id) => {
    setCheckedIds((prev) => {
      let next;

      if (prev.includes(id)) {
        next = prev.filter((v) => v !== id);
      } else {
        next = [...prev, id];
      }

      if (mode === "inline" && next.length === 0) {
        next = [LOGGED_IN_USER.id];
      }

      filterEventsBySelectedUser(next);

      return next;
    });
  };

  // 🔒 Trigger shows only first 4
  // const visibleUsers = users.slice(0, 4);
  const visibleUsers = useMemo(() => {
  
    if (usersLoading || elbritRoleLoading) return [];
  
    const allowedEmployeeIds =
      resolveVisibleEmployeeIds(elbritRoleEdges, users);
  
  
    return users.filter(u => allowedEmployeeIds.includes(u.id));
  }, [
    users,
    usersLoading,
    elbritRoleEdges,
    elbritRoleLoading,
  ]);

  const departmentByRoleId = useMemo(() => {
    const nextMap = new Map();

    elbritRoleEdges?.forEach(({ node }) => {
      if (!node?.role_id) return;
      nextMap.set(node.role_id, node.sales_team__name ?? null);
    });

    return nextMap;
  }, [elbritRoleEdges]);

  const enrichedVisibleUsers = useMemo(() => {
    return visibleUsers.map((user) => ({
      ...user,
      department: departmentByRoleId.get(user.roleId) ?? null,
    }));
  }, [departmentByRoleId, visibleUsers]);

  const designationOptions = useMemo(() => {
    return [...new Set(enrichedVisibleUsers.map((user) => user.role).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
  }, [enrichedVisibleUsers]);

  const departmentOptions = useMemo(() => {
    return [...new Set(enrichedVisibleUsers.map((user) => user.department).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
  }, [enrichedVisibleUsers]);
  
  
  // 🔍 Filtered users for popover
  // const filteredUsers = useMemo(() => {
  //   if (!search.trim()) return users;

  //   const q = search.toLowerCase();
  //   return users.filter((u) =>
  //     u.name?.toLowerCase().includes(q) ||
  //     u.email?.toLowerCase().includes(q)
  //   );
  // }, [users, search]);
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return enrichedVisibleUsers.filter((user) => {
      const matchesSearch =
        !q ||
        user.name?.toLowerCase().includes(q) ||
        user.email?.toLowerCase().includes(q) ||
        user.role?.toLowerCase().includes(q) ||
        user.roleId?.toLowerCase().includes(q) ||
        user.department?.toLowerCase().includes(q);

      const matchesDesignation =
        designationFilter === "all" || user.role === designationFilter;

      const matchesDepartment =
        departmentFilter === "all" || user.department === departmentFilter;

      return matchesSearch && matchesDesignation && matchesDepartment;
    });
  }, [
    departmentFilter,
    designationFilter,
    enrichedVisibleUsers,
    search,
  ]);

  if (usersLoading) {
    return (
      <div className="w-full rounded-md border px-3 py-2 text-sm text-muted-foreground">
        Loading employees…
      </div>
    );
  }

  if (mode === "inline") {
    return (
      <div className="w-full rounded-lg bg-background">
        <div className="p-2 pb-1">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search employees..."
            className="h-9"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 px-2 pb-1 sm:grid-cols-2">
          <Select
            value={designationFilter}
            onValueChange={setDesignationFilter}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Filter by designation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All designations</SelectItem>
              {designationOptions.map((designation) => (
                <SelectItem key={designation} value={designation}>
                  {designation}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={departmentFilter}
            onValueChange={setDepartmentFilter}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Filter by department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departmentOptions.map((department) => (
                <SelectItem key={department} value={department}>
                  {department}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="max-h-[90vh] hide-scrollbar overflow-y-auto p-2 pt-1">
          <EmployeeFilterList
            users={filteredUsers}
            checkedIds={checkedIds}
            onToggleUser={toggleUser}
            showEmail
            showAllOption={false}
          />

          {filteredUsers.length === 0 && (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              No employees found
            </p>
          )}
        </div>
      </div>
    );
  }

  const triggerUsers = visibleUsers.slice(0, 4);
  return (
    <Popover>
      {/* 🔒 Trigger */}
      <PopoverTrigger asChild>
        <div className="w-full inline-flex items-center justify-between rounded-md border border-input bg-background bg-white px-3 py-1 text-sm shadow-sm cursor-pointer">
          <AvatarGroup className="flex items-center" max={4}>
            {triggerUsers.map((user) => (
              <Avatar key={user.id} className="size-5 text-xxs">
                <AvatarImage
                  src={user.picturePath ?? undefined}
                  alt={user.name}
                />
                <AvatarFallback className="text-xxs">
                  {user.name?.[0]}
                </AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>

          {/* caret */}
          <svg
            className="ml-2 h-4 w-4 opacity-50"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        avoidCollisions={false}
        portalled={false}
        className="p-2 w-[var(--radix-popover-trigger-width)] md:w-[250px]"
      >
        {/* 🔍 Search (sticky) */}
        <div className="sticky top-0 z-10 bg-background bg-white pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="w-full rounded-md border border-input px-2 py-1 text-sm"
          />
        </div>

        {/* 🔽 Scrollable area */}
        <div className="max-h-64 overflow-y-auto">
          <EmployeeFilterList
            users={filteredUsers}
            checkedIds={checkedIds}
            isAllChecked={isAllChecked}
            onToggleAll={toggleAll}
            onToggleUser={toggleUser}
            showAvatar
            showAllOption
          />

          {filteredUsers.length === 0 && (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              No employees found
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
