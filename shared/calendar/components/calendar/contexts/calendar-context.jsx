"use client";;
import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useLocalStorage } from "@calendar/components/calendar/hooks";
import { fetchAllCustomers, fetchEventsByRange } from "@calendar/components/calendar/module/event/services/event.service";
import { resolveCalendarRange } from "@calendar/lib/calendar/range";
import { ELBRIT_ROLEID, EMPLOYEES_QUERY, normalizeRoleProfiles } from "@calendar/components/calendar/module/event/graphql/events.query";
import { mapEmployeesToCalendarUsers } from "@calendar/components/calendar/module/event/services/employee-to-calendar-user";
import { graphqlRequest } from "@calendar/lib/graphql-client";
import { resolveVisibleEmployeeIds, resolveVisibleRoleIds } from "@calendar/lib/employeeHeirachy";
import { STATUS, TAG_IDS, TAGS } from "@calendar/components/calendar/constants";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { useEmployeeResolvers } from "@calendar/lib/employeeResolver";

const DEFAULT_SETTINGS = {
	badgeVariant: "colored",
	view: "day",
	use24HourFormat: true,
	agendaModeGroupBy: "date",
};

const CalendarContext = createContext({});

export function CalendarProvider({
	children,
	events,
	badge = "colored",
	view = "day"
}) {
	const [settings, setSettings] = useLocalStorage("calendar-settings", {
		...DEFAULT_SETTINGS,
		badgeVariant: badge,
		view: view,
	});
	const [mobileMode, setMobileMode] = useState("expanded");
	const [badgeVariant, setBadgeVariantState] = useState(settings.badgeVariant);
	const [currentView, setCurrentViewState] = useState(settings.view);
	const [use24HourFormat, setUse24HourFormatState] = useState(settings.use24HourFormat);
	const [agendaModeGroupBy, setAgendaModeGroupByState] = useState(settings.agendaModeGroupBy);
	const [selectedDate, setSelectedDate] = useState(new Date());
	const [selectedUserId, setSelectedUserId] = useState("all");
	const [selectedColors, setSelectedColors] = useState([]);
	const [selectedStatuses, setSelectedStatuses] = useState([]);
	const [allEvents, setAllEvents] = useState(events || []);
	// const [filteredEvents, setFilteredEvents] = useState(events || []);
	const [notifications, setNotifications] = useState([]);
	const [users, setUsers] = useState([]);
	const [usersLoading, setUsersLoading] = useState(true);
	const [employeeOptions, setEmployeeOptions] = useState([]);
	const [doctorOptions, setDoctorOptions] = useState([]);
	const [hqTerritoryOptions, setHqTerritoryOptions] = useState([]);
	const [elbritRoleEdges, setElbritRoleEdges] = useState([]);
	const [elbritRoleLoading, setElbritRoleLoading] = useState(true);
	const [customerOptions, setCustomerOptions] = useState([]);
	const [eventListDate, setEventListDate] = useState(null);
	const [activeDate, setActiveDate] = useState(null);
	const isEventListOpen = eventListDate !== null;
	const [mobileLayer, setMobileLayer] = useState("month-expanded");
	const [showOnlyApprovedLeaves, setShowOnlyApprovedLeaves] = useState(false);
	const [showOnlyTodoList, setShowOnlyTodoList] = useState(false);
	const updateSettings = (newPartialSettings) => {
		setSettings({
			...settings,
			...newPartialSettings,
		});
	};
	const employeeEmailToId = useMemo(() => {
		const map = new Map();
		for (const u of users) {
			if (u.email && u.id) {
				map.set(u.email?.toLowerCase(),u.id ); // email → Employee ID
			}
		}
		return map;
	}, [users]);


	const setBadgeVariant = (variant) => {
		setBadgeVariantState(variant);
		updateSettings({ badgeVariant: variant });
	};

	const setView = (newView) => {
		setCurrentViewState(newView);
		updateSettings({ view: newView });
	};

	const toggleTimeFormat = () => {
		const newValue = !use24HourFormat;
		setUse24HourFormatState(newValue);
		updateSettings({ use24HourFormat: newValue });
	};

	const setAgendaModeGroupBy = (groupBy) => {
		setAgendaModeGroupByState(groupBy);
		updateSettings({ agendaModeGroupBy: groupBy });
	};

	const filterEventsBySelectedColors = (color) => {
		const isColorSelected = selectedColors.includes(color);

		const newColors = isColorSelected
			? selectedColors.filter((c) => c !== color)
			: [...selectedColors, color];

		setSelectedColors(newColors);
	};
	const filterEventsBySelectedStatus = (status) => {
		const normalized = status.toLowerCase();

		const isSelected =
			selectedStatuses.includes(normalized);

		const newStatuses = isSelected
			? selectedStatuses.filter(
				(s) => s !== normalized
			)
			: [...selectedStatuses, normalized];

		setSelectedStatuses(newStatuses);
	};
	const filterEventsBySelectedUser = (userId) => {
		setSelectedUserId(userId);
	};


	const handleSelectDate = (date) => {
		if (!date) return;
		setSelectedDate(date);
	};

	const addEvent = (event) => {
		const normalized = {
			...event,
			startDate: new Date(event.startDate).toISOString(),
			endDate: new Date(event.endDate).toISOString(),
		};
		setAllEvents((prev) => [...prev, normalized]);
		// setFilteredEvents((prev) => [...prev, normalized]);
	};

	const updateEvent = (updatedEvent) => {
		if (!updatedEvent.erpName) {
			console.warn("Attempted to update event without erpName", updatedEvent);
			return;
		}

		const normalized = {
			...updatedEvent,
			startDate: new Date(updatedEvent.startDate).toISOString(),
			endDate: new Date(updatedEvent.endDate).toISOString(),
		};

		setAllEvents((prev) =>
			prev.map((e) =>
				e.erpName === normalized.erpName ? normalized : e
			)
		);
	};


	const removeEvent = (erpName) => {
		if (!erpName) return;

		setAllEvents(prev => prev.filter(e => e.erpName !== erpName));
		// setFilteredEvents(prev => prev.filter(e => e.erpName !== erpName));
	};


	const clearFilter = () => {
		// setFilteredEvents(allEvents);
		setSelectedColors([]);
		setSelectedStatuses([]);
		setSelectedUserId("all");
	};
	useEffect(() => {
		let cancelled = false;

		async function hydrateFromGraphql() {
			const { start, end } = resolveCalendarRange(currentView, selectedDate);

			try {
				const events = await fetchEventsByRange(
					start,
					end,
					currentView
				);
				if (!cancelled) {
					setAllEvents(events);
					// setFilteredEvents(events);

				}
			} catch (err) {
				console.error("Failed to fetch events", err);
			}
		}

		hydrateFromGraphql();

		return () => {
			cancelled = true;
		};
	}, [currentView, selectedDate]);


	useEffect(() => {
		let cancelled = false;

		async function hydrateEmployees() {
			try {
				const data = await graphqlRequest(EMPLOYEES_QUERY, {
					first: 1000,
				});

				const employees =
					data?.Employees?.edges?.map(e => e.node) ?? [];

				const mappedUsers = mapEmployeesToCalendarUsers(employees);

				if (!cancelled) {
					setUsers(mappedUsers);
					setUsersLoading(false);
				}

			} catch (err) {
				console.error("Failed to fetch employees", err);
				setUsersLoading(false);
			}
		}

		hydrateEmployees();
		return () => {
			cancelled = true;
		};
	}, []);
	useEffect(() => {
		let cancelled = false;

		async function hydrateElbritRoles() {
			try {
				const rawData = await graphqlRequest(ELBRIT_ROLEID, {
					first: 1000,
				});

				const data = normalizeRoleProfiles(rawData);

				const edges = data?.ElbritRoleIDS?.edges ?? [];
				if (!cancelled) {
					setElbritRoleEdges(edges);
					setElbritRoleLoading(false);
				}
			} catch (err) {
				console.error("❌ Failed to fetch ElbritRoleIDS", err);
				setElbritRoleLoading(false);
			}
		}

		hydrateElbritRoles();

		return () => {
			cancelled = true;
		};
	}, []);
	const getEventEmployeeIds = (event) => {
		const ids = new Set();
	  
		// ERP Events
		if (event.event_participants?.length) {
		  event.event_participants.forEach((p) => {
			if (
			  p.reference_doctype === "Employee" &&
			  p.reference_docname
			) {
			  ids.add(p.reference_docname);
			}
		  });
		}
	  
		// fallback employees
		if (event.employees) {
		  if (Array.isArray(event.employees)) {
			event.employees.forEach((id) => ids.add(id));
		  } else {
			ids.add(event.employees);
		  }
		}
	  
		// Leave
		if (event.tags === TAG_IDS.LEAVE) {
		  if (event.employee) {
			ids.add(event.employee);
		  }
	  
		  if (event.leave_approver) {
			const approverId =
			  employeeEmailToId.get(
				event.leave_approver.toLowerCase()
			  );
	  
			if (approverId) {
			  ids.add(approverId);
			}
		  }
		}
	  
		// Todo allocated_to
		if (
		  event.tags === TAG_IDS.TODO_LIST &&
		  event.allocated_to
		) {
		  const allocatedEmployeeId =
			employeeEmailToId.get(
			  event.allocated_to.toLowerCase()
			);
	  
		  if (allocatedEmployeeId) {
			ids.add(allocatedEmployeeId);
		  }
		}
	  
		// Todo assignedTo
		if (
		  event.tags === TAG_IDS.TODO_LIST &&
		  event.assignedTo?.length
		) {
		  event.assignedTo.forEach((id) => ids.add(id));
		}
	  
		return [...ids];
	  };

	  const employeeRoleMap = useMemo(() => {
		const map = new Map();
	  
		users.forEach((u) => {
		  map.set(u.id, u.roleId);
		});
	  
		return map;
	  }, [users]);
	  const getEventRoleIds = (event) => {
		const roleIds = new Set();
	  
		const employeeIds = getEventEmployeeIds(event);
	  
		employeeIds.forEach((id) => {
		  const roleId = employeeRoleMap.get(id);
	  
		  if (roleId) {
			roleIds.add(roleId);
		  }
		});
	  
		return [...roleIds];
	  };
	useEffect(() => {
		let cancelled = false;

		async function hydrateCustomers() {
			try {
				const customers = await fetchAllCustomers();

				const normalized = (customers ?? []).map((name) => ({
					label: name,
					value: name,
				}));

				if (!cancelled) {
					setCustomerOptions(normalized);
				}
			} catch (err) {
				console.error("Failed to fetch customers", err);
			}
		}

		hydrateCustomers();

		return () => {
			cancelled = true;
		};
	}, []);
	const visibleRoleIds = useMemo(() => {
		if (elbritRoleLoading) return [];
		return resolveVisibleRoleIds(elbritRoleEdges);
	}, [elbritRoleEdges, elbritRoleLoading]);

	const allowedEmployeeIds = useMemo(() => {
		if (usersLoading || elbritRoleLoading) return [];
		return resolveVisibleEmployeeIds(elbritRoleEdges, users);
	}, [users, usersLoading, elbritRoleEdges, elbritRoleLoading]);

	const filteredEvents = useMemo(() => {
		if (usersLoading || elbritRoleLoading) {
			return allEvents; // temporarily show everything
		}
		if (!allEvents?.length) return [];
		// 🔴 HARD BYPASS FOR ADMIN
		if (LOGGED_IN_USER?.roleId === "Admin") {
			let result = allEvents;
			// Still apply user dropdown
			if (selectedUserId !== "all") {
				result = result.filter(event => {
					const eventEmployeeIds = getEventEmployeeIds(event);
					return eventEmployeeIds.includes(selectedUserId);
				});
			}

			// Still apply color filter
			if (selectedColors.length) {
				result = result.filter(event =>
					selectedColors.includes(event.color || "blue")
				);
			}
			if (selectedStatuses.length) {
				result = result.filter((event) =>
					selectedStatuses.includes(
						event.status?.trim()?.toLowerCase()
					)
				);
			}
			return result;
		}

		// 👇 Non-admin logic below
		let result = allEvents;
		result = result.filter(event => {
			const eventRoleIds = getEventRoleIds(event);
		  
			const roleMatch =
			  eventRoleIds.some(roleId =>
				visibleRoleIds.includes(roleId)
			  );
		  
			const eventEmployeeIds =
			  getEventEmployeeIds(event);
		  
			const employeeMatch =
			  eventEmployeeIds.some(id =>
				allowedEmployeeIds.includes(id)
			  );
		  
			return roleMatch || employeeMatch;
		  });
		if (selectedUserId !== "all") {
			result = result.filter(event => {
				const eventEmployeeIds = getEventEmployeeIds(event);
				return eventEmployeeIds.includes(selectedUserId);
			});
		}

		if (selectedColors.length) {
			result = result.filter(event =>
				selectedColors.includes(event.color || "blue")
			);
		}
		if (selectedStatuses.length) {
			result = result.filter(event =>
				selectedStatuses.includes(
					event.status?.trim()?.toLowerCase()
				)
			);
		}
		return result;

	}, [
		allEvents,
		visibleRoleIds,
		allowedEmployeeIds,
		selectedUserId,
		selectedColors, selectedStatuses
	]);
	const employeeResolvers = useEmployeeResolvers(employeeOptions);
	useEffect(() => {
		const leaveNotifications = filteredEvents
			.filter(
				(event) =>
					event.tags === TAG_IDS.LEAVE &&
					event.status?.toLowerCase() === STATUS.OPEN.toLowerCase() &&
					event.leave_approver === LOGGED_IN_USER.email
			)
			.map((leave) => ({
				id: leave.erpName,
				title: "Leave Approval Pending",
				message: `${employeeResolvers.getEmployeeNameById(leave.employee) ??
					leave.employee
					} applied for ${leave.leaveType}`,
				createdAt: leave.startDate,
				isRead: false,
				leave,
			}));

		setNotifications(leaveNotifications);
	}, [filteredEvents, employeeResolvers]);
	const value = {
		selectedDate,
		setSelectedDate: handleSelectDate,
		selectedUserId,
		setSelectedUserId,
		badgeVariant,
		setBadgeVariant,
		users,
		usersLoading,
		selectedColors,
		notifications,
		setNotifications,
		filterEventsBySelectedColors,
		selectedStatuses,
		setSelectedStatuses,
		filterEventsBySelectedStatus,
		filterEventsBySelectedUser,
		events: filteredEvents,
		view: currentView,
		use24HourFormat,
		toggleTimeFormat,
		setView,
		agendaModeGroupBy,
		setAgendaModeGroupBy,
		addEvent,
		updateEvent,
		removeEvent,
		clearFilter,
		mobileMode,
		setMobileMode,
		eventListDate,
		setEventListDate,
		isEventListOpen,
		activeDate, setActiveDate, mobileLayer,
		setMobileLayer,
		employeeOptions,
		doctorOptions,
		hqTerritoryOptions,
		setEmployeeOptions,
		setDoctorOptions,
		setHqTerritoryOptions,
		elbritRoleEdges, allowedEmployeeIds,
		elbritRoleLoading, customerOptions, setCustomerOptions,
		showOnlyApprovedLeaves,
		setShowOnlyApprovedLeaves, showOnlyTodoList, setShowOnlyTodoList
	};

	return (
		<CalendarContext.Provider value={value}>
			{children}
		</CalendarContext.Provider>
	);
}

export function useCalendar() {
	const context = useContext(CalendarContext);
	if (!context)
		throw new Error("useCalendar must be used within a CalendarProvider.");
	return context;
}
