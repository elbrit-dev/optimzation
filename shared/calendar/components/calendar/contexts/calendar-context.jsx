"use client";;
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { useLocalStorage } from "@calendar/components/calendar/hooks";
import { fetchEventsByRange } from "@calendar/components/calendar/module/event/services/event.service";
import { resolveCalendarRange } from "@calendar/lib/calendar/range";
import { resolveLoggedInRoleId, resolveVisibleEmployeeIds, resolveVisibleRoleIds } from "@calendar/lib/employeeHeirachy";
import { useEmployeeResolvers } from "@calendar/lib/employeeResolver";
import { fetchCalendarBootstrapData } from "@calendar/components/calendar/contexts/calendar-context/bootstrapping";
import {
	buildEmployeeEmailToId,
	buildEmployeeRoleMap,
	buildLeaveNotifications,
	filterCalendarEvents,
} from "@calendar/components/calendar/contexts/calendar-context/selectors";
import {
	discardQueuedSubmission,
	mergeServerEventsWithQueuedEvents,
	processSubmissionQueue,
	pruneSubmissionQueueOnStartup,
	requeueFailedSubmissions,
	subscribeSubmissionQueue,
} from "@calendar/lib/calendar/submission-queue";
import { useAuth } from "@calendar/components/auth/auth-context";
import { toast } from "sonner";

const DEFAULT_SETTINGS = {
	badgeVariant: "colored",
	view: "day",
	use24HourFormat: true,
	agendaModeGroupBy: "date",
};
const RECENT_SYNC_GRACE_MS = 30 * 1000;

function mergeFetchedEventsWithRecent(existingEvents = [], fetchedEvents = []) {
	const fetchedIds = new Set(
		fetchedEvents
			.map((event) => event?.erpName)
			.filter(Boolean)
	);
	const now = Date.now();
	const recentSyncedEvents = existingEvents.filter((event) => {
		if (!event?.erpName || fetchedIds.has(event.erpName)) {
			return false;
		}

		const justSyncedAt = event.__justSyncedAt ?? null;
		if (!justSyncedAt) {
			return false;
		}

		return now - justSyncedAt < RECENT_SYNC_GRACE_MS;
	});

	return [...fetchedEvents, ...recentSyncedEvents];
}

function normalizeCalendarEventState(event) {
	if (!event) return event;

	const startDate = new Date(event.startDate);
	const endDate = new Date(event.endDate ?? event.startDate);
	const safeEndDate =
		Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())
			? endDate
			: endDate < startDate
				? startDate
				: endDate;

	return {
		...event,
		id: event.id ?? event.erpName,
		startDate: startDate.toISOString(),
		endDate: safeEndDate.toISOString(),
	};
}

const CalendarContext = createContext({});

export function CalendarProvider({
	children,
	events,
	badge = "colored",
	view = "day"
}) {
	const { erpUrl, authToken } = useAuth();
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
	const [selectedUserId, setSelectedUserId] =  useState([]);
	const [selectedColors, setSelectedColors] = useState([]);
	const [selectedStatuses, setSelectedStatuses] = useState([]);
	const [serverEvents, setServerEvents] = useState(events || []);
	const [queueEvents, setQueueEvents] = useState([]);
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
	const [territoryDoctors, setTerritoryDoctors] = useState([]);
	const [isRetryingSync, setIsRetryingSync] = useState(false);
	const updateSettings = (newPartialSettings) => {
		setSettings({
			...settings,
			...newPartialSettings,
		});
	};
	const employeeEmailToId = useMemo(() => {
		return buildEmployeeEmailToId(users);
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
	const filterEventsBySelectedUser = (userIds) => {
		setSelectedUserId(userIds);
	};


	const handleSelectDate = (date) => {
		if (!date) return;
		setSelectedDate(date);
	};

	const addEvent = (event) => {
		const normalized = normalizeCalendarEventState(event);
		setServerEvents((prev) => [...prev, normalized]);
		// setFilteredEvents((prev) => [...prev, normalized]);
	};

	const updateEvent = (updatedEvent) => {
		if (!updatedEvent.erpName) {
			console.warn("Attempted to update event without erpName", updatedEvent);
			return;
		}

		const normalized = normalizeCalendarEventState(updatedEvent);

		setServerEvents((prev) =>
			prev.map((e) =>
				e.erpName === normalized.erpName ? normalized : e
			)
		);
	};


	const removeEvent = (erpName) => {
		if (!erpName) return;

		setServerEvents(prev => prev.filter(e => e.erpName !== erpName));
		// setFilteredEvents(prev => prev.filter(e => e.erpName !== erpName));
	};

	const refreshEvents = useCallback(async () => {
		const { start, end } = resolveCalendarRange(currentView, selectedDate);
		const nextEvents = await fetchEventsByRange(
			start,
			end,
			currentView
		);
		return nextEvents;
	}, [currentView, selectedDate]);


	const clearFilter = () => {
		// setFilteredEvents(allEvents);
		setSelectedColors([]);
		setSelectedStatuses([]);
		setSelectedUserId("all");
	};
	useEffect(() => {
		let cancelled = false;

		async function hydrateFromGraphql() {
			try {
				const events = await refreshEvents();
				if (!cancelled) {
					setServerEvents(events);
				}
			} catch (err) {
				console.error("Failed to fetch events", err);
			}
		}

		hydrateFromGraphql();

		return () => {
			cancelled = true;
		};
	}, [refreshEvents]);

	useEffect(() => {
		if (typeof window === "undefined") return;

		setQueueEvents(pruneSubmissionQueueOnStartup());

		const unsubscribe = subscribeSubmissionQueue((queue) => {
			setQueueEvents(queue);
		});

		return unsubscribe;
	}, []);

	const syncPendingSubmissions = useCallback(async () => {
		const { processedCount } = await processSubmissionQueue({
			erpUrl,
			authToken,
			onSuccess: async (queueItem, result) => {
				if (result?.removed) {
					setServerEvents((prev) =>
						prev.filter(
							(event) =>
								event.erpName !== result.name &&
								event.erpName !== queueItem.targetErpName
						)
					);
					return;
				}

				const syncedEvent =
					result?.calendarEvent ?? queueItem.optimisticEvent;
				const syncedEventWithMeta = syncedEvent
					? {
						...syncedEvent,
						__justSyncedAt: Date.now(),
					}
					: syncedEvent;

				setServerEvents((prev) => {
					const matchId =
						queueItem.targetErpName ??
						queueItem.optimisticEvent?.erpName ??
						syncedEventWithMeta?.erpName;
					const next = prev.filter(
						(event) =>
							event.erpName !== matchId &&
							event.erpName !== syncedEventWithMeta?.erpName
					);
					return syncedEventWithMeta
						? [...next, syncedEventWithMeta]
						: next;
				});
			},
			onError: async (queueItem, error, meta) => {
				if (meta?.retryable) return;

				if (queueItem.targetErpName) {
					discardQueuedSubmission({
						queueId: queueItem.id,
						erpName: queueItem.targetErpName,
					});
				}

				toast.error(
					error?.message ||
					`${queueItem.kind} sync failed. Item is still local and not saved to ERP.`
				);
			},
		});

		if (processedCount > 0) {
			try {
				const nextEvents = await refreshEvents();
				setServerEvents((prev) =>
					mergeFetchedEventsWithRecent(prev, nextEvents)
				);
			} catch (error) {
				console.error("Failed to refresh after queue sync", error);
			}
		}

		return processedCount;
	}, [authToken, erpUrl, refreshEvents]);

	const retryPendingSync = useCallback(async () => {
		setIsRetryingSync(true);

		try {
			requeueFailedSubmissions();
			const processedCount = await syncPendingSubmissions();

			if (processedCount > 0) {
				toast.success(`Retried sync for ${processedCount} item${processedCount === 1 ? "" : "s"}.`);
			} else {
				toast.info("No pending sync items found.");
			}
		} finally {
			setIsRetryingSync(false);
		}
	}, [syncPendingSubmissions]);

	useEffect(() => {
		if (typeof window === "undefined") return;

		let cancelled = false;

		const runQueue = async () => {
			const processedCount = await syncPendingSubmissions();
			if (cancelled) return;
			return processedCount;
		};

		runQueue();

		const handleOnline = () => {
			runQueue();
		};

		window.addEventListener("online", handleOnline);
		return () => {
			cancelled = true;
			window.removeEventListener("online", handleOnline);
		};
	}, [queueEvents, syncPendingSubmissions]);

	const allEvents = useMemo(() => {
		return mergeServerEventsWithQueuedEvents(
			serverEvents,
			queueEvents
		);
	}, [queueEvents, serverEvents]);
	const pendingSyncCount = useMemo(() => {
		return queueEvents.filter(
			(item) =>
				item.kind !== "delete" &&
				["pending", "syncing", "failed"].includes(item.status)
		).length;
	}, [queueEvents]);
	useEffect(() => {
		let cancelled = false;

		async function hydrateBootstrapData() {
			const {
				users: nextUsers,
				employeeOptions: nextEmployeeOptions,
				elbritRoleEdges: nextRoleEdges,
				customerOptions: nextCustomerOptions,
				errors,
			} = await fetchCalendarBootstrapData();

			if (cancelled) {
				return;
			}

			setUsers(nextUsers);
			setEmployeeOptions(nextEmployeeOptions);
			setElbritRoleEdges(nextRoleEdges);
			setCustomerOptions(nextCustomerOptions);
			setUsersLoading(false);
			setElbritRoleLoading(false);

			if (errors.employees) {
				console.error("Failed to fetch employees", errors.employees);
			}

			if (errors.roles) {
				console.error("Failed to fetch ElbritRoleIDS", errors.roles);
			}

			if (errors.customers) {
				console.error("Failed to fetch customers", errors.customers);
			}
		}

		hydrateBootstrapData();

		return () => {
			cancelled = true;
		};
	}, []);
	const employeeRoleMap = useMemo(() => {
		return buildEmployeeRoleMap(users);
	}, [users]);
	const visibleRoleIds = useMemo(() => {
		if (elbritRoleLoading || usersLoading) return [];
		return resolveVisibleRoleIds(elbritRoleEdges, resolveLoggedInRoleId(users));
	}, [elbritRoleEdges, elbritRoleLoading, users, usersLoading]);

	const allowedEmployeeIds = useMemo(() => {
		if (usersLoading || elbritRoleLoading) return [];
		return resolveVisibleEmployeeIds(elbritRoleEdges, users);
	}, [users, usersLoading, elbritRoleEdges, elbritRoleLoading]);
	const visibleEmployeeOptions = useMemo(() => {
		if (!employeeOptions.length) return [];
		if (!allowedEmployeeIds.length && !visibleRoleIds.length) return employeeOptions;

		const allowedIds = new Set(allowedEmployeeIds);
		const allowedRoles = new Set(visibleRoleIds);
		return employeeOptions.filter((employee) =>
			allowedIds.has(employee.value) ||
			(employee.roleId && allowedRoles.has(employee.roleId))
		);
	}, [employeeOptions, allowedEmployeeIds, visibleRoleIds]);

	const filteredEvents = useMemo(() => {
		return filterCalendarEvents({
			allEvents,
			selectedUserId,
			selectedColors,
			selectedStatuses,
			visibleRoleIds,
			allowedEmployeeIds,
			usersLoading,
			elbritRoleLoading,
			employeeRoleMap,
			employeeEmailToId,
		});
	}, [
		allEvents,
		visibleRoleIds,
		allowedEmployeeIds,
		selectedUserId,
		selectedColors,
		selectedStatuses,
		usersLoading,
		elbritRoleLoading,
		employeeRoleMap,
		employeeEmailToId,
	]);
	const employeeResolvers = useEmployeeResolvers(employeeOptions);
	useEffect(() => {
		setNotifications(
			buildLeaveNotifications(
				filteredEvents,
				employeeResolvers
			)
		);
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
		refreshEvents: async () => {
			const nextEvents = await refreshEvents();
			setServerEvents(nextEvents);
			return nextEvents;
		},
		pendingSyncCount,
		retryPendingSync,
		isRetryingSync,
		clearFilter,
		mobileMode,
		setMobileMode,
		eventListDate,
		setEventListDate,
		isEventListOpen,
		activeDate, setActiveDate, mobileLayer,
		setMobileLayer,
		employeeOptions: visibleEmployeeOptions,
		allEmployeeOptions: employeeOptions,
		doctorOptions,
		hqTerritoryOptions,
		setEmployeeOptions,
		setDoctorOptions,
		territoryDoctors,
		setTerritoryDoctors,
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
