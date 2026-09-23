"use client";;
import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from "react";
import { endOfYear, startOfYear } from "date-fns";
import { useLocalStorage } from "@calendar/components/calendar/hooks";
import { fetchEventsByRange } from "@calendar/components/calendar/module/event/services/event.service";
import { invalidateCalendarData } from "@calendar/lib/calendar/invalidate";
import { useCalendarLiveSync } from "@calendar/lib/calendar/useCalendarLiveSync";
import { resolveCalendarRange } from "@calendar/lib/calendar/range";
import { isLeafRole, resolveLoggedInRoleId, resolveVisibleEmployeeIds, resolveVisibleRoleIds } from "@calendar/lib/employeeHeirachy";
import { useEmployeeResolvers } from "@calendar/lib/employeeResolver";
import { fetchCalendarBootstrapData } from "@calendar/components/calendar/contexts/calendar-context/bootstrapping";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import {
	buildEmployeeEmailToId,
	buildEmployeeRoleMap,
	buildLeaveNotifications,
	filterCalendarEvents,
} from "@calendar/components/calendar/contexts/calendar-context/selectors";
import { applyDoctorVisitTeamTitles, createTeamNameResolver } from "@calendar/lib/calendar/doctor-visit-title";
import { VISIT_FILTER } from "@calendar/lib/calendar/visit-filter";
import { resolveEnabledTagIds, TAG_IDS } from "@calendar/components/calendar/constants";
import { useAuth } from "@calendar/components/auth/auth-context";
import { toast } from "sonner";

const DEFAULT_SETTINGS = {
	badgeVariant: "colored",
	view: "day",
	use24HourFormat: true,
	agendaModeGroupBy: "date",
};
const RECENT_SYNC_GRACE_MS = 30 * 1000;

// Writes used to be parked in localStorage and drained in the background. A
// phone that was carrying items when that queue was removed would otherwise
// just lose them with no trace, and the user would keep believing those visits
// were saved. They were never in ERP — nothing can recover them — so say so
// once, clearly, and clear the keys.
const LEGACY_QUEUE_KEYS = [
	"calendar-submission-queue:v1",
	"calendar-submission-queue:v1:lock",
];

function discardLegacySubmissionQueue() {
	if (typeof window === "undefined") return 0;

	let abandonedCount = 0;

	try {
		const raw = window.localStorage.getItem(LEGACY_QUEUE_KEYS[0]);
		const parsed = raw ? JSON.parse(raw) : null;
		abandonedCount = Array.isArray(parsed) ? parsed.length : 0;
		LEGACY_QUEUE_KEYS.forEach((key) => window.localStorage.removeItem(key));
	} catch (error) {
		console.error("Failed to clear the legacy submission queue", error);
	}

	return abandonedCount;
}

function mergeFetchedEventsWithRecent(
	existingEvents = [],
	fetchedEvents = [],
	recentlyDeleted = null
) {
	const now = Date.now();

	// A refetch that was already in flight when the user deleted something comes
	// back still listing that event — it was issued before ERP removed it.
	// Merging it would put the deleted event straight back on the calendar and
	// make a successful delete look like it did nothing. ERP is right; this list
	// is just older than the delete.
	const survivingFetchedEvents = recentlyDeleted?.size
		? fetchedEvents.filter((event) => {
			const deletedAt = recentlyDeleted.get(event?.erpName);
			return !deletedAt || now - deletedAt >= RECENT_SYNC_GRACE_MS;
		})
		: fetchedEvents;

	const fetchedIds = new Set(
		survivingFetchedEvents
			.map((event) => event?.erpName)
			.filter(Boolean)
	);
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

	return [...survivingFetchedEvents, ...recentSyncedEvents];
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
	view = "day",
	enableGoogleCalendarSync = false,
	eventTypes,
	eventTypesMode,
}) {
	const { erpUrl, authToken } = useAuth();
	// Event types this deployment offers (prop-driven; see resolveEnabledTagIds).
	const enabledTagIds = useMemo(
		() => resolveEnabledTagIds(eventTypes, eventTypesMode),
		[eventTypes, eventTypesMode]
	);
	const includeLeaves = enabledTagIds.includes(TAG_IDS.LEAVE);
	const includeTodos = enabledTagIds.includes(TAG_IDS.TODO_LIST);
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
	const [selectedUserId, setSelectedUserIdState] =  useState([]);
	const [hasInitializedUserFilter, setHasInitializedUserFilter] = useState(false);
	const [selectedColors, setSelectedColors] = useState([]);
	const [selectedStatuses, setSelectedStatuses] = useState([]);
	const [serverEvents, setServerEvents] = useState(events || []);
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
	const [agendaVisitFilter, setAgendaVisitFilter] = useState(VISIT_FILTER.ALL);
	const [territoryDoctors, setTerritoryDoctors] = useState([]);
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
	const setSelectedUserId = useCallback((userIds) => {
		setSelectedUserIdState(userIds);
		setHasInitializedUserFilter(true);
	}, []);
	const filterEventsBySelectedUser = useCallback((userIds) => {
		setSelectedUserId(userIds);
	}, [setSelectedUserId]);


	const handleSelectDate = (date) => {
		if (!date) return;
		setSelectedDate(date);
	};

	// `__justSyncedAt` holds a just-written document on screen for
	// RECENT_SYNC_GRACE_MS even if the next background refetch comes back without
	// it. ERP's list query can lag its own write by a moment, and without this
	// the event the user just saved would blink out of the calendar and look like
	// it had failed.
	const addEvent = (event) => {
		const normalized = normalizeCalendarEventState({
			...event,
			__justSyncedAt: Date.now(),
		});
		setServerEvents((prev) => [...prev, normalized]);
		// setFilteredEvents((prev) => [...prev, normalized]);
	};

	const updateEvent = (updatedEvent) => {
		if (!updatedEvent.erpName) {
			console.warn("Attempted to update event without erpName", updatedEvent);
			return;
		}

		const normalized = normalizeCalendarEventState({
			...updatedEvent,
			__justSyncedAt: Date.now(),
		});

		setServerEvents((prev) =>
			prev.map((e) =>
				e.erpName === normalized.erpName ? normalized : e
			)
		);
	};


	// erpName -> when it was deleted. Read by mergeFetchedEventsWithRecent so a
	// refetch issued before the delete cannot put the row back.
	const recentlyDeletedRef = useRef(new Map());

	const removeEvent = (erpName) => {
		if (!erpName) return;

		const tombstones = recentlyDeletedRef.current;
		const now = Date.now();
		tombstones.set(erpName, now);

		// Only the grace window matters; anything older has already been through
		// a full refetch, so keeping it would suppress a genuine re-creation of
		// the same document.
		tombstones.forEach((deletedAt, name) => {
			if (now - deletedAt >= RECENT_SYNC_GRACE_MS) {
				tombstones.delete(name);
			}
		});

		setServerEvents(prev => prev.filter(e => e.erpName !== erpName));
		// setFilteredEvents(prev => prev.filter(e => e.erpName !== erpName));
	};

	const refreshEvents = useCallback(async ({ force = false } = {}) => {
		const { start, end } = resolveCalendarRange(currentView, selectedDate);
		const nextEvents = await fetchEventsByRange(
			start,
			end,
			currentView,
			{ force, includeLeaves, includeTodos }
		);
		return nextEvents;
	}, [currentView, selectedDate, includeLeaves, includeTodos]);

	// Guards against an older, slower fetch landing after a newer one and
	// clobbering the current range's events.
	const reloadTokenRef = useRef(0);

	// The one way events get written into state. Every caller — mount hydration,
	// the Sync button, the background live refresh — goes through here so they
	// can't disagree about how results are merged.
	const reloadEvents = useCallback(async ({ force = false } = {}) => {
		const token = ++reloadTokenRef.current;
		const nextEvents = await refreshEvents({ force });

		if (token !== reloadTokenRef.current) {
			// A newer reload has already started; its result wins.
			return nextEvents;
		}

		setServerEvents((prev) =>
			mergeFetchedEventsWithRecent(
				prev,
				nextEvents,
				recentlyDeletedRef.current
			)
		);
		return nextEvents;
	}, [refreshEvents]);

	// Hard refresh for the manual "Sync" button. Drops every derived cache
	// (events, leave applications, todos, leave balances) and forces the fetch
	// past the in-flight dedupe, so one click always reaches ERP — no full-app
	// reload needed. Sync should refresh the full selected year so moving across
	// months inside that year reflects the latest ERP state immediately.
	// `broadcast: false` because we refetch right here.
	const syncCalendar = useCallback(async () => {
		invalidateCalendarData({ broadcast: false, reason: "manual-sync" });
		const token = ++reloadTokenRef.current;
		const anchorDate = selectedDate ?? new Date();

		const nextEvents = await fetchEventsByRange(
			startOfYear(anchorDate),
			endOfYear(anchorDate),
			"year",
			{ force: true, includeLeaves, includeTodos }
		);

		if (token !== reloadTokenRef.current) {
			return nextEvents;
		}

		setServerEvents((prev) =>
			mergeFetchedEventsWithRecent(
				prev,
				nextEvents,
				recentlyDeletedRef.current
			)
		);
		return nextEvents;
	}, [selectedDate]);

	const liveRefresh = useCallback(
		() => reloadEvents({ force: true }),
		[reloadEvents]
	);

	// Keeps this calendar in step with ERP with no user action: writes from this
	// browser land immediately, other users' writes within one probe interval.
	useCalendarLiveSync({
		refresh: liveRefresh,
		enabled: Boolean(erpUrl && authToken),
	});


	const clearFilter = () => {
		// setFilteredEvents(allEvents);
		setSelectedColors([]);
		setSelectedStatuses([]);
		setSelectedUserId([]);
	};
	useEffect(() => {
		reloadEvents().catch((err) => {
			console.error("Failed to fetch events", err);
		});
	}, [reloadEvents]);

	useEffect(() => {
		const abandonedCount = discardLegacySubmissionQueue();
		if (!abandonedCount) return;

		toast.error(
			`${abandonedCount} item${abandonedCount === 1 ? "" : "s"} left over from the old offline queue never reached ERP and ${abandonedCount === 1 ? "has" : "have"} been discarded. Please create ${abandonedCount === 1 ? "it" : "them"} again.`,
			{ duration: 15000 }
		);
	}, []);

	// Writes go straight to ERP and are awaited, so `serverEvents` only ever
	// holds documents ERP has actually stored. There is no second, local list of
	// not-yet-saved events to merge in — and so no way for the calendar to show
	// an event that does not exist, or to hide one that does.
	const resolveOwnerTeamName = useMemo(
		() => createTeamNameResolver(users, elbritRoleEdges),
		[users, elbritRoleEdges]
	);
	const allEvents = useMemo(
		() => applyDoctorVisitTeamTitles(serverEvents, resolveOwnerTeamName),
		[serverEvents, resolveOwnerTeamName]
	);
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
	useEffect(() => {
		if (usersLoading || elbritRoleLoading) return;
		if (hasInitializedUserFilter) return;

		const loggedInUserId =
			LOGGED_IN_USER.id ??
			users.find(
				(user) =>
					user.email &&
					LOGGED_IN_USER.email &&
					user.email.toLowerCase() === LOGGED_IN_USER.email.toLowerCase()
			)?.id ??
			null;

		if (!loggedInUserId) {
			setHasInitializedUserFilter(true);
			return;
		}

		setSelectedUserId([loggedInUserId]);
	}, [
		elbritRoleLoading,
		hasInitializedUserFilter,
		setSelectedUserId,
		users,
		usersLoading,
	]);
	// Leaf-role users (e.g. BEs) have no subordinates; ERP already scopes the
	// events they receive (own + DocShare-shared), so the hierarchy filter must
	// not narrow further and hide events shared down to them.
	const isCurrentUserLeaf = useMemo(() => {
		if (usersLoading || elbritRoleLoading) return false;
		return isLeafRole(elbritRoleEdges, resolveLoggedInRoleId(users));
	}, [elbritRoleEdges, elbritRoleLoading, users, usersLoading]);
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
			isCurrentUserLeaf,
			usersLoading,
			elbritRoleLoading,
			employeeRoleMap,
			employeeEmailToId,
			enabledTagIds,
		});
	}, [
		allEvents,
		visibleRoleIds,
		allowedEmployeeIds,
		isCurrentUserLeaf,
		selectedUserId,
		selectedColors,
		selectedStatuses,
		usersLoading,
		elbritRoleLoading,
		employeeRoleMap,
		employeeEmailToId,
		enabledTagIds,
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
		enabledTagIds,
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
		allEvents,
		view: currentView,
		use24HourFormat,
		toggleTimeFormat,
		setView,
		agendaModeGroupBy,
		setAgendaModeGroupBy,
		addEvent,
		updateEvent,
		removeEvent,
		refreshEvents: reloadEvents,
		syncCalendar,
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
		setShowOnlyApprovedLeaves, showOnlyTodoList, setShowOnlyTodoList,
		agendaVisitFilter, setAgendaVisitFilter,
		enableGoogleCalendarSync,
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
