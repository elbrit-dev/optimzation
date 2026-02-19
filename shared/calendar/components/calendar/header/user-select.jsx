import { Avatar, AvatarFallback, AvatarImage } from "@calendar/components/ui/avatar";
import { AvatarGroup } from "@calendar/components/ui/avatar-group";
import { Checkbox } from "@calendar/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@calendar/components/ui/popover";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { useEffect, useState, useMemo } from "react";
import {resolveVisibleEmployeeIds} from "@calendar/lib/employeeHeirachy";

export function UserSelect() {
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

  // 🔑 Default = ALL checked
  useEffect(() => {
    if (!selectedUserId) {
      setCheckedIds([]);
    }
  }, [selectedUserId]);

  const isAllChecked = checkedIds.length === 0;

  const toggleAll = () => {
    setCheckedIds([]);
    filterEventsBySelectedUser("all");
  };

  const toggleUser = (id) => {
    setCheckedIds((prev) => {
      let next;

      if (prev.includes(id)) {
        next = prev.filter((v) => v !== id);
      } else {
        next = [...prev, id];
      }

      filterEventsBySelectedUser(
        next.length ? next[next.length - 1] : "all"
      );

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
    if (!search.trim()) return visibleUsers;
  
    const q = search.toLowerCase();
    return visibleUsers.filter(
      u =>
        u.label?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
    );
  }, [visibleUsers, search]);

  if (usersLoading) {
    return (
      <div className="w-full rounded-md border px-3 py-2 text-sm text-muted-foreground">
        Loading employees…
      </div>
    );
  }
  const triggerUsers = visibleUsers.slice(0, 4);
  return (
    <Popover>
      {/* 🔒 Trigger */}
      <PopoverTrigger asChild>
        <div className="w-full inline-flex items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm cursor-pointer">
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
        <div className="sticky top-0 z-10 bg-background pb-2">
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
          {/* ✅ ALL */}
          <div
            className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-muted rounded-md"
            onClick={toggleAll}
          >
            <Checkbox checked={isAllChecked} />
            <span>All</span>
          </div>

          {/* 👤 EMPLOYEES */}
          {filteredUsers.map((user) => {
            const checked = checkedIds.includes(user.id);

            return (
              <div
                key={user.id}
                className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-muted rounded-md"
                onClick={() => toggleUser(user.id)}
              >
                <Checkbox checked={checked} />

                <Avatar className="size-6">
                  <AvatarImage
                    src={user.picturePath ?? undefined}
                    alt={user.name}
                  />
                  <AvatarFallback className="text-xxs">
                    {user.name?.[0]}
                  </AvatarFallback>
                </Avatar>

                <p className="truncate">{user.name}</p>
              </div>
            );
          })}

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
