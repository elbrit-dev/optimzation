import { zodResolver } from "@hookform/resolvers/zod";
import { addMinutes, differenceInCalendarDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { isEmployeeOnApprovedLeave } from "@calendar/lib/calendar/leaveDay";
import { buildEventDefaultValues, TAG_IDS, TAGS } from "@calendar/components/calendar/constants";
import { mapFormToErpEvent } from "@calendar/components/calendar/module/event/mappers/event-to-erp";
import {
	fetchAllCustomers,
	fetchCustomersByTerritory,
	fetchGoogleCalendarStatus,
} from "@calendar/components/calendar/module/event/services/event.service";
import { useWatch } from "react-hook-form";
import { LeaveTypeCards } from "@calendar/components/calendar/leave/LeaveTypeCards";
import { Form, FormControl, FormField, } from "@calendar/components/ui/form";
import { Input } from "@calendar/components/ui/input";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalTrigger, } from "@calendar/components/ui/responsive-modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@calendar/components/ui/select";
import { RHFFieldWrapper, RHFComboboxField, RHFDateTimeField, InlineCheckboxField, FormFooter, RHFHQCardSelector, } from "@calendar/components/calendar/form-fields";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { RHFDoctorCardSelector } from "@calendar/components/RHFDoctorCardSelector";
import { useDisclosure, useSubmissionRouter } from "@calendar/components/calendar/hooks";
import { eventSchema } from "@calendar/components/calendar/schemas";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { loadParticipantOptionsByTag } from "@calendar/lib/participants";
import { TimePicker } from "@calendar/components/ui/TimePicker";
import { enrichTodoOwner, mapErpTodoToCalendar, mapFormToErpTodo } from "@calendar/components/calendar/module/todo/mappers/todo.mapper";
import { calculateTotalLeaveDays, mapErpLeaveToCalendar, mapFormToErpLeave } from "@calendar/components/calendar/module/leave/mappers/leave.mapper";
import { useEmployeeResolvers } from "@calendar/lib/employeeResolver";
import {
	fetchDoctorsByTerritory,
	fetchItemsByDepartment,
	searchDoctors,
	searchEmployees,
} from "@calendar/components/calendar/module/event/services/master-data.service";
import { buildParticipantsWithDetails, getAvailableItems, normalizeMeetingTimes, normalizeNonMeetingDates, resolveLatLong, showFirstFormErrorAsToast, syncPobItemRates, updatePobRow } from "@calendar/lib/helper";
import { Button } from "@calendar/components/ui/button";
import { MapPin, Video } from "lucide-react";
import { resolveDisplayValueFromEvent } from "@calendar/lib/calendar/resolveDisplay";
import Tiptap from "@calendar/components/calendar/module/todo/components/TodoWysiwyg";
import { mapDoctorVisitToQuotation } from "@calendar/components/calendar/module/event/mappers/quotation-to-erp";
import { calculateDistanceKm, findOverlappingHqEvent, getDisabledHqDates } from "@calendar/components/calendar/helpers";
import { useDoctorResolvers } from "@calendar/lib/doctorResolver";
import { DoctorNotesSection } from "../module/event/components/DoctorNotesSection";
import TodoComments from "@calendar/components/calendar/module/todo/components/TodoCommentsSection";
import { ErrorBoundary } from "@calendar/components/ui/error-boundary";
import { Textarea } from "@calendar/components/ui/textarea";
import { fetchEmployeeLeaveBalance } from "@calendar/components/calendar/module/leave/services/leave.service";
import { isLeafRole, resolveLoggedInRoleId, resolveSuperiorShareUserIds } from "@calendar/lib/employeeHeirachy";
import { enqueueSubmission } from "@calendar/lib/calendar/submission-queue";
import { fetchDocSharesByDocument } from "@calendar/components/calendar/module/event/services/docshare.service";
import { cn } from "@calendar/lib/utils";

// Head-office teams that are allowed to apply for Half Day leave. Field-sales
// users (BE/ABM/RBM/SM role profiles) do not get Half Day. Matched as a whole
// segment of the role profile name (e.g. "IT-...", "...-HR-..."), so update this
// list if the HO role-profile naming differs.
const HEAD_OFFICE_ROLE_KEYWORDS = ["IT", "MIS", "HR", "PMT", "DESIGN"];

function isHeadOfficeRole(roleId) {
	if (!roleId) return false;
	const segments = String(roleId)
		.toUpperCase()
		.split(/[^A-Z0-9]+/)
		.filter(Boolean);
	return segments.some((segment) => HEAD_OFFICE_ROLE_KEYWORDS.includes(segment));
}

export function AddEditEventDialog({ children, event, defaultTag, forceValues, startDate: initialStartDate }) {
	const { isOpen, onClose, onOpen } = useDisclosure();
	const { employeeOptions,
		allEmployeeOptions,
		doctorOptions, events, allEvents,
		hqTerritoryOptions,
		setEmployeeOptions, territoryDoctors, setTerritoryDoctors,
		setDoctorOptions, customerOptions, setCustomerOptions, selectedDate, allowedEmployeeIds,
		setHqTerritoryOptions, users, elbritRoleEdges } = useCalendar();
	const isEditing = !!event;
	const [leaveBalance, setLeaveBalance] = useState(null);
	const [leaveLoading, setLeaveLoading] = useState(false);
	const employeeResolvers = useEmployeeResolvers(allEmployeeOptions);
	const { getEmployeeIdByEmail } = useEmployeeResolvers(allEmployeeOptions);
	const doctorResolvers = useDoctorResolvers(doctorOptions);
	const [itemOptions, setItemOptions] = useState([]);
	const [isResolvingLocation, setIsResolvingLocation] = useState(false);
	const [distanceKm, setDistanceKm] = useState(null);
	const endDateTouchedRef = useRef(false); // existing
	const [showReason, setShowReason] = useState(false);
	const [googleCalendarEnabled, setGoogleCalendarEnabled] = useState(false);
	const [meetingMode, setMeetingMode] = useState("physical");
	const [employeeSearchLoading, setEmployeeSearchLoading] = useState(false);
	const [doctorSearchLoading, setDoctorSearchLoading] = useState(false);
	const lastEmployeeSearchRef = useRef("");
	const lastDoctorSearchRef = useRef("");
	const form = useForm({
		resolver: zodResolver(eventSchema),
		mode: "onChange",
		defaultValues: buildEventDefaultValues({ event, defaultTag }),
	});

	const startDate = useWatch({ control: form.control, name: "startDate" });
	const endDate = useWatch({ control: form.control, name: "endDate" });
	const allDay = useWatch({ control: form.control, name: "allDay" });
	const leaveType = useWatch({ control: form.control, name: "leaveType", });
	const leavePeriod = useWatch({ control: form.control, name: "leavePeriod", });
	const { doctor, employees, hqTerritory, tags: selectedTag, attending, enableGoogleMeet } = useWatch({ control: form.control });
	const pobGiven = useWatch({ control: form.control, name: "pob_given", });
	const customer = useWatch({ control: form.control, name: "customer", });
	const pobItems = useWatch({ control: form.control, name: "fsl_doctor_item" });
	const currentLatitude = useWatch({ control: form.control, name: "custom_latitude" });
	const currentLongitude = useWatch({ control: form.control, name: "custom_longitude" });
	const initialStartDateTs = initialStartDate
		? initialStartDate.getTime()
		: null;
	const selectedDateTs = selectedDate
		? new Date(selectedDate).getTime()
		: null;
	useEffect(() => {
		syncPobItemRates(form, pobItems, itemOptions);
	}, [pobItems, itemOptions]);

	const tagConfig = TAG_FORM_CONFIG[selectedTag] ?? TAG_FORM_CONFIG.DEFAULT;
	const shouldShowTags =
		!isEditing || tagConfig.ui?.lockTagOnEdit !== true;

	const isMulti = tagConfig?.employee?.multiselect === true;
	const isFieldVisible = (field) => {
		if (tagConfig.show) return tagConfig.show.includes(field);
		if (tagConfig.hide) return !tagConfig.hide.includes(field);
		return true;
	};
	useEffect(() => {
		if (!isOpen || selectedTag !== TAG_IDS.MEETING) return;

		const nextMode = isEditing
			? event?.enableGoogleMeet
				? "virtual"
				: "physical"
			: form.getValues("enableGoogleMeet")
				? "virtual"
				: "physical";

		setMeetingMode(nextMode);
	}, [event?.enableGoogleMeet, form, isEditing, isOpen, selectedTag]);
	useEffect(() => {
		if (selectedTag !== TAG_IDS.MEETING) return;
		if (!allDay || !enableGoogleMeet) return;

		form.setValue("enableGoogleMeet", false, {
			shouldDirty: true,
			shouldValidate: true,
		});
		toast.error("All-day meetings cannot have Google Meet enabled.");
	}, [allDay, enableGoogleMeet, form, selectedTag]);
	useEffect(() => {
		if (!isEditing) return;
		const doctorId = Array.isArray(event?.doctor)
			? event.doctor[0]
			: event?.doctor;
		if (!doctorId) return;

		if (!currentLatitude || !currentLongitude) {
			setDistanceKm(null);
			setShowReason(false);
			return;
		}

		const doctor = {
			custom_latitude:
				event?.doctorLatitude ??
				doctorResolvers.getDoctorFieldById(
					doctorId,
					"custom_latitude"
				),
			custom_longitude:
				event?.doctorLongitude ??
				doctorResolvers.getDoctorFieldById(
					doctorId,
					"custom_longitude"
				),
		};

		if (!doctor?.custom_latitude || !doctor?.custom_longitude) {
			setDistanceKm(null);
			setShowReason(false);
			return;
		}

		const doctorLat = parseFloat(doctor.custom_latitude);
		const doctorLng = parseFloat(doctor.custom_longitude);
		const visitLat = parseFloat(currentLatitude);
		const visitLng = parseFloat(currentLongitude);

		if (
			isNaN(doctorLat) ||
			isNaN(doctorLng) ||
			isNaN(visitLat) ||
			isNaN(visitLng)
		) {
			setDistanceKm(null);
			setShowReason(false);
			return;
		}

		const dist = calculateDistanceKm(
			doctorLat,
			doctorLng,
			visitLat,
			visitLng
		);

		setDistanceKm(dist);
		form.setValue("distanceKm", dist, {
			shouldDirty: true,
			shouldValidate: false,
		});

		// 🔴 FORCE VISIT when outside 500m
		const isForceVisit = dist > 0.5;

		form.setValue("forceVisit", isForceVisit, {
			shouldDirty: true,
			shouldValidate: true,
		});

		setShowReason(isForceVisit);

		if (isForceVisit) {
			toast.warning(
				"Employee location is outside 500 meters from doctor. Force Visit reason required."
			);
		}

	}, [currentLatitude, currentLongitude, doctorResolvers, event?.doctor, isEditing]);
	const hasValidLocation =
		Number(currentLatitude) !== 0 &&
		Number(currentLongitude) !== 0 &&
		currentLatitude != null &&
		currentLongitude != null;

	const shouldShowRequestLocation =
		selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN &&
		!hasValidLocation &&
		!isResolvingLocation;
	const getFieldLabel = (field, fallback) => {
		return tagConfig.labels?.[field] ?? fallback;
	};
	const reset = fields =>
		Object.entries(fields).forEach(([name, defaultValue]) =>
			form.resetField(name, { defaultValue })
		);

	const resetFieldsOnTagChange = () => {
		endDateTouchedRef.current = false;
		reset({
			employees: undefined, doctor: isDoctorMulti ? [] : undefined,
			status: "Open", priority: "Medium", title: "",
			enableGoogleMeet: false,
		});
		// ❌ HQ is REQUIRED for this tag — never reset it
		if (selectedTag !== TAG_IDS.HQ_TOUR_PLAN) {
			reset({ hqTerritory: "", });
		}

		if (selectedTag !== TAG_IDS.LEAVE) {
			reset({
				leaveType: undefined,
				leavePeriod: "Full",
				medicalAttachment: undefined,
			});
		}
	};

	useEffect(() => {
		if (!isOpen) return;
		if (!isEditing) return;
		if (!forceValues) return;

		Object.entries(forceValues).forEach(([key, value]) => {
			form.setValue(key, value, {
				shouldDirty: false,
				shouldValidate: false,
			});
		});
	}, [isOpen, isEditing, forceValues]);

	const leaveDays = useMemo(() => {
		if (selectedTag !== TAG_IDS.LEAVE) return 0;
		if (!startDate || !endDate) return 0;

		return calculateTotalLeaveDays(
			startDate,
			endDate,
			leavePeriod === "Half"
		);
	}, [selectedTag, startDate, endDate, leavePeriod]);
	const selectedLeaveBalance = useMemo(() => {
		if (!leaveType) return null;
		return leaveBalance?.[leaveType] ?? null;
	}, [leaveBalance, leaveType]);
	const isLeaveWithoutPaySelected =
		selectedLeaveBalance?.isLeaveWithoutPay === true;
	const hasInsufficientLeaveBalance =
		selectedTag === TAG_IDS.LEAVE &&
		!isLeaveWithoutPaySelected &&
		Boolean(selectedLeaveBalance) &&
		leaveDays > 0 &&
		Number(selectedLeaveBalance.available ?? 0) < leaveDays;
	const hasExistingPobItems =
		Array.isArray(event?.fsl_doctor_item) &&
		event.fsl_doctor_item.length > 0;
	const hasExistingPobDecision =
		selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN &&
		isEditing &&
		(Number(event?.pob_given) === 1 ||
			hasExistingPobItems);
	const canCurrentParticipantEditPob =
		!hasExistingPobDecision;
	const doctorDetails = useMemo(() => {
		const doctorId = Array.isArray(event?.doctor)
			? event.doctor[0]
			: event?.doctor;
		if (!doctorId) return null;

		return {
			doctorId,
			doctorNotes:
				doctorResolvers.getDoctorFieldById(
					doctorId,
					"notes"
				) ?? [],
		};
	}, [event?.doctor, doctorResolvers]);
	const mergeOptionsByValue = (currentOptions, nextOptions) => {
		const optionMap = new Map();

		[...(currentOptions ?? []), ...(nextOptions ?? [])].forEach((option) => {
			if (option?.value) {
				optionMap.set(option.value, option);
			}
		});

		return Array.from(optionMap.values());
	};
	const ensureDoctorOptionsAvailable = (doctorValue) => {
		if (!doctorValue) return;

		const normalizedDoctors = Array.isArray(doctorValue)
			? doctorValue
			: [doctorValue];
		const doctorRecords = normalizedDoctors
			.map((doctor) => {
				if (typeof doctor === "object" && doctor?.value) {
					return doctor;
				}

				return doctorOptions.find(
					(option) => option.value === doctor
				);
			})
			.filter(Boolean);

		if (!doctorRecords.length) return;

		setDoctorOptions((currentOptions) =>
			mergeOptionsByValue(currentOptions, doctorRecords)
		);
	};
	const handleEmployeeSearch = useCallback(async (search) => {
		const normalizedSearch = search?.trim() ?? "";
		if (normalizedSearch.length < 2) {
			lastEmployeeSearchRef.current = "";
			return;
		}
		if (lastEmployeeSearchRef.current === normalizedSearch) return;
		lastEmployeeSearchRef.current = normalizedSearch;

		setEmployeeSearchLoading(true);
		try {
			const results = await searchEmployees(normalizedSearch);
			setEmployeeOptions((currentOptions) =>
				mergeOptionsByValue(currentOptions, results)
			);
		} finally {
			setEmployeeSearchLoading(false);
		}
	}, [setEmployeeOptions]);
	const handleDoctorSearch = useCallback(async (search) => {
		const normalizedSearch = search?.trim() ?? "";
		if (normalizedSearch.length < 2) {
			lastDoctorSearchRef.current = "";
			return;
		}
		if (lastDoctorSearchRef.current === normalizedSearch) return;
		lastDoctorSearchRef.current = normalizedSearch;

		setDoctorSearchLoading(true);
		try {
			const results = await searchDoctors({
				search: normalizedSearch,
				territory: hqTerritory,
			});
			setDoctorOptions((currentOptions) =>
				mergeOptionsByValue(currentOptions, results)
			);
		} finally {
			setDoctorSearchLoading(false);
		}
	}, [hqTerritory, setDoctorOptions]);
	const currentUserRoleId = useMemo(() => {
		if (LOGGED_IN_USER.roleId) {
			return LOGGED_IN_USER.roleId;
		}

		return (
			users.find((user) => user.id === LOGGED_IN_USER.id)?.roleId ??
			users.find(
				(user) =>
					user.email &&
					LOGGED_IN_USER.email &&
					user.email.toLowerCase() === LOGGED_IN_USER.email.toLowerCase()
			)?.roleId ??
			allEmployeeOptions.find(
				(employee) => employee.value === LOGGED_IN_USER.id
			)?.roleId ??
			allEmployeeOptions.find(
				(employee) =>
					employee.email &&
					LOGGED_IN_USER.email &&
					employee.email.toLowerCase() === LOGGED_IN_USER.email.toLowerCase()
			)?.roleId ??
			null
		);
	}, [allEmployeeOptions, users]);
	const resolvedLoggedInRoleId = useMemo(
		() => resolveLoggedInRoleId(users) ?? currentUserRoleId,
		[currentUserRoleId, users]
	);
	const isLeafHierarchyUser = useMemo(
		() => isLeafRole(elbritRoleEdges, resolvedLoggedInRoleId),
		[elbritRoleEdges, resolvedLoggedInRoleId]
	);
	const loggedInEmployeeHqTerritory = useMemo(() => {
		const matchById = allEmployeeOptions.find(
			(employee) => String(employee.value) === String(LOGGED_IN_USER.id)
		);
		if (matchById?.hqTerritory) return matchById.hqTerritory;

		const matchByEmail = allEmployeeOptions.find(
			(employee) =>
				employee.email &&
				LOGGED_IN_USER.email &&
				employee.email.toLowerCase() === LOGGED_IN_USER.email.toLowerCase()
		);
		if (matchByEmail?.hqTerritory) return matchByEmail.hqTerritory;

		if (hqTerritoryOptions.length === 1) {
			return hqTerritoryOptions[0]?.value ?? null;
		}

		return null;
	}, [allEmployeeOptions, hqTerritoryOptions]);
	// Half Day leave is only for head-office teams (IT/MIS/HR/PMT/Design).
	// Use the reliable role (custom_role_profile via the employee list), not the
	// host-supplied me.roleId which can be stale.
	const isHeadOfficeUser = useMemo(
		() => isHeadOfficeRole(resolvedLoggedInRoleId),
		[resolvedLoggedInRoleId]
	);
	// Meeting/Todo employee picker: show ALL employees, exactly like the Share
	// dialog (which uses `allEmployeeOptions`). This was previously scoped to the
	// logged-in user's department subtree via `resolveDepartmentRoleIds`, which
	// made the picker a smaller list than Share's. The employee query itself is
	// already unrestricted (active employees only), so no client filter is needed.
	const employeePickerOptions = useMemo(
		() => {
			const departmentByRoleId = new Map();

			elbritRoleEdges?.forEach(({ node }) => {
				if (!node?.role_id) return;
				departmentByRoleId.set(node.role_id, node.sales_team__name ?? null);
			});

			return allEmployeeOptions.map((employee) => ({
				...employee,
				department: departmentByRoleId.get(employee.roleId) ?? null,
			}));
		},
		[allEmployeeOptions, elbritRoleEdges]
	);
	const employeeDesignationOptions = useMemo(
		() =>
			[
				...new Set(
					employeePickerOptions
						.map((employee) => employee.role)
						.filter(Boolean)
				),
			].sort((left, right) => left.localeCompare(right)),
		[employeePickerOptions]
	);
	const employeeDepartmentOptions = useMemo(
		() =>
			[
				...new Set(
					employeePickerOptions
						.map((employee) => employee.department)
						.filter(Boolean)
				),
			].sort((left, right) => left.localeCompare(right)),
		[employeePickerOptions]
	);
	const employeePickerFilters = useMemo(
		() => ({
			facets: [
				{
					id: "role",
					label: "Designation",
					options: employeeDesignationOptions,
					getValue: (option) => option.role,
				},
				{
					id: "department",
					label: "Department",
					options: employeeDepartmentOptions,
					getValue: (option) => option.department,
				},
			].filter((facet) => facet.options.length > 0),
		}),
		[employeeDepartmentOptions, employeeDesignationOptions]
	);
	const meetingAttendanceEmployees = useMemo(() => {
		if (selectedTag !== TAG_IDS.MEETING || !isEditing) return [];

		const selectedEmployeeIds = (
			Array.isArray(employees) ? employees : employees ? [employees] : []
		)
			.map((employee) =>
				typeof employee === "object"
					? employee?.value ?? employee?.id ?? null
					: employee
			)
			.filter(Boolean)
			.map(String);

		const existingParticipants = event?.participants ?? [];

		return selectedEmployeeIds.map((employeeId) => {
			const employeeOption = employeePickerOptions.find(
				(option) => String(option.value) === employeeId
			);
			const existingParticipant = existingParticipants.find(
				(participant) =>
					participant.type === "Employee" &&
					String(participant.id) === employeeId
			);

			return {
				id: employeeId,
				name: employeeOption?.label ?? existingParticipant?.name ?? employeeId,
				attending: existingParticipant?.attending ?? "",
			};
		});
	}, [employeePickerOptions, employees, event?.participants, isEditing, selectedTag]);
	const shareUsers = useMemo(() => {
		if (users.length) {
			return users;
		}

		return allEmployeeOptions.map((employee) => ({
			id: employee.value,
			email: employee.email ?? null,
			roleId: employee.roleId ?? null,
		}));
	}, [allEmployeeOptions, users]);
	useEffect(() => {
		const isHQTourPlan = event?.tags === TAG_IDS.HQ_TOUR_PLAN;
		if (!isEditing) return;
		if (!event?.erpName) return;
		if (!isHQTourPlan) return;

		const fetchShares = async () => {
			const shares = await fetchDocSharesByDocument("Event", event.erpName);
			const shareEmployeeEmail = shares.map(x => x?.user?.name)
			const shareEmployeeIds = shareEmployeeEmail
				.map((x) => getEmployeeIdByEmail(x))
			form.setValue("shareEmployees", shareEmployeeIds, {
				shouldDirty: false,
				shouldValidate: true,
			});
		};

		fetchShares();
	}, [event?.erpName, event?.tags, isEditing]);
	const superiorUserIds = useMemo(() => {
		if (isEditing) return [];
		if (!currentUserRoleId) return [];
		return resolveSuperiorShareUserIds(
			elbritRoleEdges,
			shareUsers,
			currentUserRoleId
		).filter((userId) => userId !== LOGGED_IN_USER.email);
	}, [currentUserRoleId, elbritRoleEdges, isEditing, shareUsers]);
	const currentUserDepartment = useMemo(() => {
		if (!resolvedLoggedInRoleId) return null;

		return (
			elbritRoleEdges?.find(
				({ node }) => node?.role_id === resolvedLoggedInRoleId
			)?.node?.sales_team__name ?? null
		);
	}, [elbritRoleEdges, resolvedLoggedInRoleId]);
	const isAutoShareableTag = (tag) => tag !== TAG_IDS.LEAVE;
	const collectManualShareEmails = (values) => {
		const emails = new Set();
		const value = values.shareEmployees;
		if (!value) return [];

		(Array.isArray(value) ? value : [value]).forEach((employee) => {
			if (!employee) return;
			const email =
				typeof employee === "object"
					? employee.email
					: allEmployeeOptions.find((opt) => opt.value === employee)?.email;
			if (email && email !== LOGGED_IN_USER.email) {
				emails.add(email);
			}
		});

		return [...emails];
	};
	const collectParticipantShareEmails = (values) => {
		const emails = new Set();
		const participantValues = values.employees
			? Array.isArray(values.employees)
				? values.employees
				: [values.employees]
			: [];

		participantValues.forEach((employee) => {
			if (!employee) return;

			const email =
				typeof employee === "object"
					? employee.email
					: allEmployeeOptions.find((opt) => opt.value === employee)?.email;

			if (email && email !== LOGGED_IN_USER.email) {
				emails.add(email);
			}
		});

		return [...emails];
	};
	const getShareUserIds = (values) =>
		isAutoShareableTag(values.tags)
			? Array.from(
					new Set(
						[
							...superiorUserIds.filter(Boolean),
							...collectParticipantShareEmails(values),
							...(values.tags === TAG_IDS.HQ_TOUR_PLAN
								? collectManualShareEmails(values)
								: []),
						].filter(Boolean)
					)
				)
			: [];
	useEffect(() => {
		if (!startDate || !endDate) return;

		if (endDate < startDate) {
			form.setValue("endDate", startDate, {
				shouldDirty: true,
				shouldValidate: true,
			});
		}
	}, [startDate, endDate]);
	const requiresMedical = useMemo(() => {
		if (selectedTag !== TAG_IDS.LEAVE) return false;
		if (leaveType !== "Sick Leave") return false;

		const threshold =
			tagConfig.leave?.medicalCertificateAfterDays ?? 2;

		return leaveDays > threshold;
	}, [selectedTag, leaveType, leaveDays, tagConfig]);
	useEffect(() => {
		if (!requiresMedical && !isEditing) {
			form.setValue("medicalAttachment", undefined, {
				shouldDirty: false,
				shouldValidate: false,
			});
		}
	}, [requiresMedical, isEditing, form]);

	const isDoctorMulti = tagConfig.doctor?.multiselect === true;

	useEffect(() => {
		if (!isOpen) return;
		if (isEditing) return;

		resetFieldsOnTagChange();
		// ✅ CLEAR TITLE IF TAG HIDES IT
		if (tagConfig.hide?.includes("title")) {
			form.setValue("title", "", {
				shouldDirty: false,
				shouldValidate: false,
			});
		}
	}, [selectedTag]);

	/* ---------------------------------------------
	  Fetch POB ITEMS
	--------------------------------------------- */
	useEffect(() => {
		if (!isEditing) return;
		if (selectedTag !== TAG_IDS.DOCTOR_VISIT_PLAN) return;
		if (Number(pobGiven) !== 1) return;
		if (itemOptions.length) return;

		fetchItemsByDepartment(currentUserDepartment).then(setItemOptions);
	}, [currentUserDepartment, isEditing, itemOptions.length, pobGiven, selectedTag]);

	/* ---------------------------------------------
	  RESET POB ITEMS
	--------------------------------------------- */
	useEffect(() => {
		if (Number(pobGiven) !== 1) {
			form.setValue("fsl_doctor_item", [], {
				shouldDirty: true,
			});
		}
	}, [pobGiven]);

	/* ---------------------------------------------
		   Half day logic
		--------------------------------------------- */
	useEffect(() => {
		if (leavePeriod !== "Half") {
			form.setValue("halfDayDate", undefined, {
				shouldDirty: false,
				shouldValidate: false,
			});
			form.setValue("halfDayPosition", "FIRST_DAY", {
				shouldDirty: false,
				shouldValidate: false,
			});
		}
	}, [leavePeriod]); // 🔧 LEAVE HALF DAY FIX
	/* ---------------------------------------------
		   Longitude and latitude
		--------------------------------------------- */

	useEffect(() => {
		if (!isEditing) return;
		// Only act when the edit form is actually open — this dialog also mounts
		// (closed) behind the event-details popup, and we must not fetch device
		// location then or it spams a geolocation toast on every detail open.
		if (!isOpen) return;
		// Location is only relevant to Doctor Visit Plans (force-visit distance).
		if (selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN) {
			resolveLatLong(form, isEditing, toast);
		}
	}, [isEditing, isOpen, selectedTag]);
	/* ---------------------------------------------
	  Load Calendar Google Calendar 
	--------------------------------------------- */
	useEffect(() => {
		async function loadGoogleStatus() {
			const calendar = await fetchGoogleCalendarStatus(
				LOGGED_IN_USER.email
			);

			setGoogleCalendarEnabled(
				calendar?.enable === 1 &&
				!!calendar?.refresh_token &&
				!!calendar?.google_calendar_id
			);
		}

		loadGoogleStatus();
	}, []);
	const handleRequestLocation = async () => {
		try {
			setIsResolvingLocation(true);

			resolveLatLong(form, isEditing, toast);

		} finally {
			setIsResolvingLocation(false);
		}
	};


	/* ---------------------------------------------
	   Leave Balance Fetching
	--------------------------------------------- */
	useEffect(() => {
		if (!isOpen || selectedTag !== TAG_IDS.LEAVE) return;
		let alive = true;
		setLeaveLoading(true);

		fetchEmployeeLeaveBalance(LOGGED_IN_USER.id)
			.then((data) => {
				if (!alive) return;
				setLeaveBalance(data);
			})
			.catch((err) => {
				console.error("Leave balance error", err);
				setLeaveBalance({});
			})
			.finally(() => {
				if (alive) setLeaveLoading(false);
			});

		return () => {
			alive = false;
		};
	}, [isOpen, selectedTag]);

	/* ---------------------------------------------
	   TODO: FORCE START DATE = NOW (HIDDEN)
	--------------------------------------------- */
	useEffect(() => {
		if (selectedTag !== TAG_IDS.TODO_LIST) return;
		if (isEditing) return;

		const now = new Date();

		form.setValue("startDate", now, {
			shouldDirty: false,
			shouldValidate: false,
		});
	}, [selectedTag]);

	/* ---------------------------------------------
	   LOAD PARTICIPANTS (UNCHANGED)
	--------------------------------------------- */
	useEffect(() => {
		if (!isOpen || !event?.participants?.length) return;
		if (!employeePickerOptions.length && !doctorOptions.length) return;

		const employeeIds = event.participants
			.filter(p => p.type === "Employee")
			.map(p => String(p.id));

		const doctorIds = event?.doctor
			? (Array.isArray(event.doctor) ? event.doctor : [event.doctor]).map((id) => String(id))
			: [];

		/* ---------- Employees ---------- */
		if (employeeIds.length) {
			const employeeValues = employeeIds
				.map(id => employeePickerOptions.find(o => o.value === id))
				.filter(Boolean);

			form.setValue(
				"employees",
				tagConfig.employee?.multiselect
					? employeeValues
					: employeeValues[0],
				{ shouldDirty: false }
			);
		}

		/* ---------- Doctors ---------- */
		if (doctorIds.length) {
			const doctorValues = doctorIds.map((id) => {
				return (
					doctorOptions.find((option) => option.value === id) ??
					id
				);
			});

			form.setValue(
				"doctor",
				tagConfig.doctor?.multiselect
					? doctorValues
					: doctorValues[0],
				{ shouldDirty: false }
			);
		}
	}, [
		isOpen,
		event?.participants,
		employeePickerOptions,
		doctorOptions,
	]);
	useEffect(() => {
		if (!isOpen || selectedTag !== TAG_IDS.MEETING || !isEditing) return;

		const currentValues = Array.isArray(form.getValues("meetingAttendance"))
			? form.getValues("meetingAttendance")
			: [];
		const currentMap = new Map(
			currentValues
				.filter((entry) => entry?.employeeId)
				.map((entry) => [String(entry.employeeId), entry.attending ?? ""])
		);

		const nextAttendance = meetingAttendanceEmployees.map((participant) => ({
			employeeId: participant.id,
			attending:
				currentMap.get(String(participant.id)) ??
				participant.attending ??
				"",
		}));

		const hasChanged =
			JSON.stringify(currentValues) !== JSON.stringify(nextAttendance);

		if (hasChanged) {
			form.setValue("meetingAttendance", nextAttendance, {
				shouldDirty: false,
				shouldValidate: false,
			});
		}
	}, [form, isEditing, isOpen, meetingAttendanceEmployees, selectedTag]);

	/* ---------------------------------------------
	   FORCE ALL-DAY CHECKBOX ONLY
	   ❌ No time/date mutation
	--------------------------------------------- */
	useEffect(() => {
		if (!tagConfig?.forceAllDay) return;

		// 1️⃣ Force allDay checkbox
		if (form.getValues("allDay") !== true) {
			form.setValue("allDay", true, {
				shouldDirty: false,
				shouldValidate: false,
			});
		}
	}, [selectedTag, startDate]);

	/* --------------------------------------------------
	   RESET FORM
	-------------------------------------------------- */
	// const initialDefaultsRef = useRef(form.getValues());

	useEffect(() => {
		if (!isOpen || isEditing) return;

		const now = new Date();

		const baseDate =
			(initialStartDateTs != null
				? new Date(initialStartDateTs)
				: null) ??
			(selectedDateTs != null
				? new Date(selectedDateTs)
				: null) ??
			now;

		const currentValues = form.getValues();
		endDateTouchedRef.current = false;

		form.reset({
			...currentValues,
			startDate: baseDate,
			endDate: tagConfig.dateOnly
				? baseDate
				: addMinutes(baseDate, 60),
			tags: selectedTag,
		});
	}, [isOpen, selectedTag, isEditing, initialStartDateTs, selectedDateTs]);

	/* --------------------------------------------------
	   AUTO TITLE (SAFE)
	-------------------------------------------------- */
	useEffect(() => {
		if (isEditing) return;
		if (!tagConfig.autoTitle) return;

		const values = form.getValues();
		const nextTitle = tagConfig.autoTitle(values, {
			doctorOptions,
			employeeOptions: employeePickerOptions,
		});

		if (!nextTitle) return;

		if (values.title !== nextTitle) {
			form.setValue("title", nextTitle, {
				shouldDirty: false,
				shouldValidate: true, // 🔑 REQUIRED
			});
		}
	}, [selectedTag, hqTerritory, doctor, employees, doctorOptions, employeePickerOptions, isEditing,]);

	/* --------------------------------------------------
	   AUTO SELECT LOGGED IN USER
	-------------------------------------------------- */
	useEffect(() => {
		if (!selectedTag) return;

		loadParticipantOptionsByTag({ tag: selectedTag, employeeOptions: employeePickerOptions, hqTerritoryOptions, doctorOptions, setEmployeeOptions, setHqTerritoryOptions, setDoctorOptions, });

		// 🔒 ABSOLUTE GUARD
		if (isEditing) return;

		if (!tagConfig.employee?.autoSelectLoggedIn) return;

		const loggedInEmployee =
			employeePickerOptions.find(
				(e) => e.value === LOGGED_IN_USER.id
			);

		if (!loggedInEmployee) return;

		const value = tagConfig.employee.multiselect
			? [loggedInEmployee]
			: loggedInEmployee;

		form.setValue("employees", value, { shouldDirty: false });
	}, [selectedTag, employeePickerOptions]);

	/* ---------------------------------------------
   NON-MEETING DATE LOGIC (MEETING-LIKE)
   ✅ FIX – guarded writes only
--------------------------------------------- */
	useEffect(() => {
		if (isEditing) return;
		normalizeNonMeetingDates(
			form,
			startDate,
			selectedTag,
			endDateTouchedRef.current
		);
	}, [form, isEditing, selectedTag, startDate]);
	/* ---------------------------------------------
   MEETING TIME LOGIC (MERGED)
--------------------------------------------- */
	useEffect(() => {
		if (selectedTag !== TAG_IDS.MEETING) return;

		normalizeMeetingTimes(
			form,
			startDate,
			allDay,
			endDateTouchedRef.current
		);
	}, [startDate, allDay]);

	const buildDoctorVisitTitle = (doctorId, values) => {
		const doc = doctorOptions.find(d => d.value === doctorId);
		if (!doc) return values.title || "DV";

		const doctorName = doc.label.replace(/\s+/g, "");
		const ownerName = (
			event?.ownerFullName ||
			LOGGED_IN_USER.name ||
			"Emp"
		).replace(/\s+/g, "");

		return `${doctorName}-Visit-${ownerName}`;
	};
	const createLocalEventId = (prefix = "local-event") =>
		`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const resetAndCloseDialog = () => {
		endDateTouchedRef.current = false;
		reset({
			title: "", description: "", employees: undefined,
			doctor: isDoctorMulti ? [] : undefined,
			status: "Open",
			priority: "Medium", attending: undefined, customer: undefined,
			pob_given: undefined,
			fsl_doctor_item: [], forceVisit: false,
			custom_force_visit_reason: "", leaveType: undefined,
			leavePeriod: "Full",
			halfDayDate: undefined,
			halfDayPosition: "FIRST_DAY",
			medicalAttachment: undefined, allocated_to: undefined,
			assignedTo: [], custom_latitude: undefined, custom_longitude: undefined,
			hqTerritory: "",
			allDay: false,
		});
		onClose();
	};
	const finalize = (message) => {
		toast.success(message);
		resetAndCloseDialog();
	};
	const finalizeQueued = (message) => {
		toast.info(message);
		resetAndCloseDialog();
	};
	function normalizePobItemsForUI(items = []) {
		return items.map(row => ({
			item__name:
				typeof row.item__name === "string"
					? row.item__name
					: row.item?.name ?? "",
			qty: Number(row.qty),
			rate: Number(row.rate),
			amount: Number(row.amount),
		}));
	}


	const normalizeDoctorValueForEvent = (doctorValue, tagConfig) => {
		if (!doctorValue) return undefined;

		const normalizeOne = (value) => {
			if (typeof value === "object" && value !== null) {
				return value.value ?? value.code ?? value.name ?? undefined;
			}
			return value;
		};

		if (tagConfig.doctor?.multiselect) {
			const values = (Array.isArray(doctorValue)
				? doctorValue
				: [doctorValue])
				.map(normalizeOne)
				.filter(Boolean);
			return values.length ? values : undefined;
		}

		return normalizeOne(
			Array.isArray(doctorValue) ? doctorValue[0] : doctorValue
		);
	};
	const resolveDoctorCoordinateValue = (doctorValue, field) => {
		if (!doctorValue) return null;

		const oneDoctor = Array.isArray(doctorValue)
			? doctorValue[0]
			: doctorValue;

		if (typeof oneDoctor === "object" && oneDoctor !== null) {
			const value = oneDoctor[field];
			const numericValue = Number(value);
			return Number.isNaN(numericValue) ? null : numericValue;
		}

		const numericValue = Number(
			doctorResolvers.getDoctorFieldById(oneDoctor, field)
		);
		return Number.isNaN(numericValue) ? null : numericValue;
	};
	const buildCalendarEvent = ({
		event,
		values,
		erpDoc,
		savedName,
		tagConfig,
		employeeOptions,
		doctorOptions,
		ownerEmployeeIdOverride,
		ownerEmailOverride,
		ownerFullNameOverride,
	}) => {
		const shouldBeGreen =
			values.tags === TAG_IDS.DOCTOR_VISIT_PLAN &&
			erpDoc.status === "Completed";
		const normalizedStartDate = new Date(
			values.startDate ?? event?.startDate ?? new Date()
		);
		const fallbackEndDate = new Date(
			event?.endDate ?? values.endDate ?? values.startDate ?? new Date()
		);
		const resolvedEndDate =
			values.tags === TAG_IDS.DOCTOR_VISIT_PLAN &&
			erpDoc.status === "Completed"
				? new Date(String(erpDoc.ends_on).replace(" ", "T"))
				: fallbackEndDate;
		const normalizedEndDate =
			resolvedEndDate < normalizedStartDate
				? normalizedStartDate
				: resolvedEndDate;

		const calendarEvent = {
			...(event ?? {}),
			erpName: savedName,
			id: event?.id ?? savedName,
			title: values.title,
			description: values.description,
			startDate: normalizedStartDate.toISOString(),
			endDate: normalizedEndDate.toISOString(),
			color: shouldBeGreen ? "green" : tagConfig.fixedColor,
			tags: values.tags,
			allDay: values.allDay ?? event?.allDay ?? false,
			ownerEmployeeId: ownerEmployeeIdOverride,
			ownerEmail: ownerEmailOverride,
			ownerFullName: ownerFullNameOverride,
			owner: ownerEmployeeIdOverride
				? {
					id: ownerEmployeeIdOverride,
					email: ownerEmailOverride,
					fullName:
						ownerFullNameOverride ?? ownerEmployeeIdOverride,
				}
				: undefined,
			hqTerritory: values.hqTerritory || "",
			doctor: normalizeDoctorValueForEvent(values.doctor, tagConfig),
			doctorLatitude:
				resolveDoctorCoordinateValue(values.doctor, "custom_latitude") ??
				event?.doctorLatitude ??
				null,
			doctorLongitude:
				resolveDoctorCoordinateValue(values.doctor, "custom_longitude") ??
				event?.doctorLongitude ??
				null,
			roleId: values.roleId,
			forceVisit: values.forceVisit ?? false,
			custom_force_visit_reason:
				values.custom_force_visit_reason ?? "",
			distanceKm: values.distanceKm ?? null,
			event_participants: erpDoc.event_participants,
			attending: values.attending,
			participants: buildParticipantsWithDetails(
				erpDoc.event_participants,
				{ employeeOptions, doctorOptions }
			),
			status:
				values.tags === TAG_IDS.DOCTOR_VISIT_PLAN
					? erpDoc.status
					: event?.status,
		};

		if (values.tags === TAG_IDS.DOCTOR_VISIT_PLAN) {
			if (Number(values.pob_given) === 1 && Array.isArray(values.fsl_doctor_item)) {
				calendarEvent.fsl_doctor_item =
					normalizePobItemsForUI(values.fsl_doctor_item);
				calendarEvent.pob_given = 1;
			} else if (Number(values.pob_given) === 0) {
				calendarEvent.fsl_doctor_item = [];
				calendarEvent.pob_given = 0;
			} else {
				calendarEvent.fsl_doctor_item = event?.fsl_doctor_item ?? [];
				calendarEvent.pob_given = event?.pob_given;
			}
		}
		return calendarEvent;
	};
	useEffect(() => {
		if (!isOpen) return;
		if (!isEditing) return;
		if (!event?.allocated_to) return;
		if (!employeePickerOptions.length) return;

		// allocated_to is EMAIL
		const email = event.allocated_to.toLowerCase();

		// Resolve employee ID from email
		const employeeId =
			employeeResolvers.getEmployeeIdByEmail(email);

		if (!employeeId) return;

		// Find matching option object
		const employeeOption =
			employeePickerOptions.find(
				(opt) => opt.value === employeeId
			);

		if (!employeeOption) return;

		// Set full option object in form
		form.setValue("allocated_to", employeeOption, {
			shouldDirty: false,
		});
	}, [
		isOpen,
		isEditing,
		event?.allocated_to,
		employeePickerOptions,
	]);
	// ----------------------------------------------------
	// RULE B: Doctor Visit Plan tab only visible
	// if user has HQ Tour Plan for selected date
	// ----------------------------------------------------
	const matchedHqEvent = useMemo(() => {
		if (!startDate || !events?.length) return null;

		const selectedDay = startOfDay(new Date(startDate));

		return events.find((ev) => {
			if (ev.tags !== TAG_IDS.HQ_TOUR_PLAN) return false;

			const isParticipant = ev.participants?.some(
				(p) => p.id === LOGGED_IN_USER.id
			);

			if (!isParticipant) return false;

			const planStart = startOfDay(new Date(ev.startDate));
			const planEnd = endOfDay(new Date(ev.endDate));

			return selectedDay >= planStart && selectedDay <= planEnd;
		});
	}, [events, startDate]);

	const doctorVisitHqTerritory =
		matchedHqEvent?.hqTerritory ??
		(isLeafHierarchyUser ? loggedInEmployeeHqTerritory : null);
	const hasValidHqTourPlan = !!matchedHqEvent;
	const canCreateDoctorVisitDirectly =
		isLeafHierarchyUser && Boolean(loggedInEmployeeHqTerritory);
	const canUseDoctorVisitTag =
		hasValidHqTourPlan || canCreateDoctorVisitDirectly;
	const shouldHideHqTourPlanTag = canCreateDoctorVisitDirectly;
	useEffect(() => {
		if (!isOpen || isEditing) return;

		if (selectedTag === TAG_IDS.HQ_TOUR_PLAN && shouldHideHqTourPlanTag) {
			form.setValue("tags", TAG_IDS.DOCTOR_VISIT_PLAN, {
				shouldDirty: false,
				shouldValidate: true,
			});
			return;
		}

		if (selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN && !canUseDoctorVisitTag) {
			form.setValue("tags", TAG_IDS.LEAVE, {
				shouldDirty: false,
				shouldValidate: true,
			});
		}
	}, [
		canUseDoctorVisitTag,
		form,
		isEditing,
		isOpen,
		selectedTag,
		shouldHideHqTourPlanTag,
	]);
	useEffect(() => {
		if (selectedTag !== TAG_IDS.DOCTOR_VISIT_PLAN) return;
		if (!doctorVisitHqTerritory) return;

		const currentHq = form.getValues("hqTerritory");
		if (currentHq === doctorVisitHqTerritory) return;

		form.setValue("hqTerritory", doctorVisitHqTerritory, {
			shouldDirty: true,
			shouldValidate: true,
		});
	}, [doctorVisitHqTerritory, form, selectedTag]);
	// ----------------------------------------------------
	// Show only those doctor whose territory matches with the hq 
	// ----------------------------------------------------
	useEffect(() => {
		if (
			selectedTag !== TAG_IDS.DOCTOR_VISIT_PLAN ||
			!hqTerritory
		) {
			setTerritoryDoctors([]);
			return;
		}
		fetchDoctorsByTerritory(hqTerritory)
			.then(setTerritoryDoctors);
	}, [hqTerritory, selectedTag]);
	// ----------------------------------------------------
	// Disabled dates for HQ Tour Plan (logged-in user only)
	// Prevent selecting dates where HQ already exists
	// ----------------------------------------------------

	const disabledHqDates = useMemo(
		() =>
			getDisabledHqDates(
				events,
				allowedEmployeeIds
			),
		[events, allowedEmployeeIds]
	);

	useEffect(() => {
		if (!customer) {
			form.setValue("pob_given", undefined, { shouldDirty: true });
			form.setValue("fsl_doctor_item", [], { shouldDirty: true });
		}
	}, [customer]);
	useEffect(() => {
		if (
			!isEditing ||
			selectedTag !== TAG_IDS.DOCTOR_VISIT_PLAN ||
			Number(pobGiven) !== 1
		) {
			return;
		}

		const territoryName = hqTerritory || event?.hqTerritory;
		if (!territoryName) {
			setCustomerOptions([]);
			return;
		}

		let cancelled = false;
		fetchAllCustomers()
			.then((customers) => {
				if (cancelled) return;
				const narrowedCustomers = customers
					.filter((customer) => customer.territory === territoryName)
					.map((customer) => ({
						label: customer.name,
						value: customer.name,
						territory: customer.territory ?? null,
					}));

				setCustomerOptions(narrowedCustomers);
			})
			.catch((error) => {
				console.error("Failed to fetch accessible customers", error);
				if (!cancelled) {
					setCustomerOptions([]);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [
		event?.hqTerritory,
		hqTerritory,
		isEditing,
		pobGiven,
		selectedTag,
		setCustomerOptions,
	]);
	const isMutationPending = form.formState.isSubmitting;
	useEffect(() => {
		if (typeof window === "undefined" || !isMutationPending) return;

		const handleBeforeUnload = (browserEvent) => {
			browserEvent.preventDefault();
			browserEvent.returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [isMutationPending]);

	const handleDialogOpenChange = (nextOpen) => {
		if (!nextOpen && isMutationPending) return;
		if (nextOpen) {
			// Central guard for EVERY entry point that opens this form (header,
			// day-cell click, mobile add): if the user is on an APPROVED leave on
			// the target day, don't open — creating an event is pointless then.
			if (
				!isEditing &&
				isEmployeeOnApprovedLeave(
					allEvents,
					LOGGED_IN_USER.id,
					initialStartDate ?? selectedDate
				)
			) {
				toast.error("You're on leave on this day");
				return;
			}
			onOpen();
			return;
		}
		onClose();
	};
	const handleDefaultEvent = async (values) => {
		const normalizedDoctorValue =
			values.tags === TAG_IDS.DOCTOR_VISIT_PLAN &&
				(!values.doctor ||
					(Array.isArray(values.doctor) && !values.doctor.length))
				? event?.doctor
				: values.doctor;
		const normalizedValues = {
			...values,
			doctor: normalizedDoctorValue,
		};
		let quotationName =
			event?.reference_docname || null;
		let quotationDoc = null;

		// Only for Doctor Visit Plan
		if (
			normalizedValues.tags === TAG_IDS.DOCTOR_VISIT_PLAN &&
			canCurrentParticipantEditPob &&
			Number(normalizedValues.pob_given) === 1
		) {
			const selectedDoctor = Array.isArray(normalizedValues.doctor)
				? normalizedValues.doctor[0]
				: normalizedValues.doctor;
			const doctorId =
				typeof selectedDoctor === "object"
					? selectedDoctor?.value
					: selectedDoctor;

			quotationDoc =
				mapDoctorVisitToQuotation({
					values: normalizedValues,
					doctorId,
					existingName: quotationName,
					eventName: event?.erpName,
				});
			quotationName = quotationDoc.name ?? quotationName;
		}
		const erpDoc = mapFormToErpEvent(normalizedValues, {
			erpName: event?.erpName,
			employeeResolvers,
			doctorResolvers,
			existingEventParticipants: event?.event_participants ?? [],
			existingEndDate: event?.endDate ?? null,
			googleCalendar:
				googleCalendarEnabled
					? LOGGED_IN_USER.email
					: "IT Elbrit"
		});

		if (quotationName) {
			erpDoc.reference_doctype = "Quotation";
			erpDoc.reference_docname = quotationName;
		}
		const calendarEvent = buildCalendarEvent({
			event,
			values: normalizedValues,
			erpDoc,
			savedName: event?.erpName ?? createLocalEventId("local-event"),
			tagConfig,
			employeeOptions: employeePickerOptions,
			doctorOptions,
			ownerEmployeeIdOverride:
				event?.ownerEmployeeId || LOGGED_IN_USER.id,
			ownerEmailOverride:
				event?.ownerEmail || LOGGED_IN_USER.email,
			ownerFullNameOverride:
				event?.ownerFullName || LOGGED_IN_USER.name,
		});
		ensureDoctorOptionsAvailable(normalizedValues.doctor);
		await enqueueSubmission({
			kind: "event",
			replaceQueueId: event?.__localQueueId ?? null,
			targetErpName: event?.erpName ?? null,
			optimisticEvent: calendarEvent,
			payload: {
				erpDoc,
				quotationDoc,
				saveOptions: {
					shareWithUserIds: getShareUserIds(values),
					deferShareSync: false,
					skipExistingShareCheck: !event?.erpName,
				},
			},
		});

		finalizeQueued(
			isEditing
				? "Event queued for sync"
				: "Event queued for sync"
		);
	};
	const handleDoctorVisitPlan = async (values) => {
		const normalizedDoctors = (Array.isArray(values.doctor)
			? values.doctor
			: [values.doctor]
		).map((d) =>
			typeof d === "object"
				? d
				: doctorOptions.find((o) => o.value === d) ?? d
		);

		const totalDoctors = normalizedDoctors.length;
		const results = await Promise.allSettled(
			normalizedDoctors.map(async (doctor) => {
				const doctorId =
					typeof doctor === "object" ? doctor.value : doctor;
				const computedTitle = buildDoctorVisitTitle(doctorId, values);

				const enrichedValues = {
					...values,
					title: computedTitle,
					doctor,
				};
				ensureDoctorOptionsAvailable(doctor);
				const erpDoc = mapFormToErpEvent(enrichedValues, {
					employeeResolvers,
					doctorResolvers,
					googleCalendar:
						googleCalendarEnabled
							? LOGGED_IN_USER.email
							: "IT Elbrit"
				});

				const optimisticEventId = createLocalEventId(
					`local-doctor-visit-${doctorId}`
				);
				const optimisticEvent = buildCalendarEvent({
					values: enrichedValues,
					erpDoc,
					savedName: optimisticEventId,
					tagConfig,
					employeeOptions: employeePickerOptions,
					doctorOptions,
					ownerEmployeeIdOverride: LOGGED_IN_USER.id,
					ownerEmailOverride: LOGGED_IN_USER.email,
					ownerFullNameOverride: LOGGED_IN_USER.name,
				});
				await enqueueSubmission({
					kind: "event",
					targetErpName: null,
					optimisticEvent,
					payload: {
						erpDoc,
						quotationDoc: null,
						saveOptions: {
							shareWithUserIds: superiorUserIds,
							deferShareSync: false,
							skipExistingShareCheck: true,
						},
					},
				});
				return optimisticEventId;
			})
		);

		const successCount = results.filter(
			(result) => result.status === "fulfilled"
		).length;
		const failedCount = totalDoctors - successCount;

		if (failedCount === 0) {
			finalizeQueued(
				`${successCount} Doctor Visit event${successCount > 1 ? "s" : ""} queued for sync`
			);
			return;
		}

		if (successCount > 0) {
			toast.error(
				`Created ${successCount} of ${totalDoctors} Doctor Visit events`
			);
			return;
		}

		toast.error("Failed to create Doctor Visit events");
	};

	const handleLeave = async (values) => {
		try {
			const totalLeaveDays = calculateTotalLeaveDays(
				values.startDate,
				values.endDate,
				values.leavePeriod === "Half"
			);

			if (
				values.leaveType === "Casual Leave" &&
				totalLeaveDays > 3
			) {
				toast.error("Casual Leave cannot be longer than 3");
				return;
			}

			const currentLeaveBalance =
				leaveBalance?.[values.leaveType] ?? null;
			const isLeaveWithoutPay =
				currentLeaveBalance?.isLeaveWithoutPay === true;
			const availableLeaveBalance = Number(
				currentLeaveBalance?.available ?? 0
			);

			if (
				!isLeaveWithoutPay &&
				currentLeaveBalance &&
				availableLeaveBalance <= 0
			) {
				toast.error(
					`${values.leaveType} balance is zero. Leave cannot be applied.`
				);
				return;
			}

			if (
				!isLeaveWithoutPay &&
				currentLeaveBalance &&
				leaveDays > availableLeaveBalance
			) {
				toast.error(
					`${values.leaveType} balance is insufficient for ${leaveDays} day${leaveDays === 1 ? "" : "s"}.`
				);
				return;
			}

			if (requiresMedical && !values.medicalAttachment) {
				toast.error("Medical certificate required");
				return;
			}

			const leaveDoc = mapFormToErpLeave(values, {
				erpName: event?.erpName,
			});
			delete leaveDoc.custom_attachement;

			// No DocShare for leave — the approval workflow already routes the
			// application to the leave approver, so sharing is redundant (and the
			// approver may lack "Share" permission, which would fail the save).
			const calendarLeave = mapErpLeaveToCalendar({
				...leaveDoc,
				name: event?.erpName ?? createLocalEventId("local-leave"),
				employee_name: LOGGED_IN_USER.name,
				color: "#DC2626",
			});

			await enqueueSubmission({
				kind: "leave",
				replaceQueueId: event?.__localQueueId ?? null,
				targetErpName: event?.erpName ?? null,
				optimisticEvent: calendarLeave,
				payload: {
					leaveDoc,
					saveOptions: {
						erpName: event?.erpName,
					},
					medicalAttachment: values.medicalAttachment,
				},
			});
			finalizeQueued(
				isEditing
					? "Leave queued for sync"
					: "Leave queued for sync"
			);

		} catch (error) {
			console.error("Leave submission error:", error);

			// 🔥 Extract GraphQL error message if available
			const message =
				error?.response?.errors?.[0]?.message ||
				error?.message ||
				"Something went wrong while applying leave.";

			toast.error(message);
		}
	};
	const handleTodo = async (values) => {
		const todoDoc = mapFormToErpTodo(values, employeeResolvers, {
			erpName: event?.erpName,
		});

		const calendarTodo = enrichTodoOwner(
			mapErpTodoToCalendar({
				...todoDoc,
				name: event?.erpName ?? createLocalEventId("local-todo"),
			}),
			employeeResolvers
		);

		await enqueueSubmission({
			kind: "todo",
			replaceQueueId: event?.__localQueueId ?? null,
			targetErpName: event?.erpName ?? null,
			optimisticEvent: calendarTodo,
			payload: {
				todoDoc,
				saveOptions: {
					shareWithUserIds: getShareUserIds(values),
					deferShareSync: false,
					skipExistingShareCheck: !event?.erpName,
				},
			},
		});

		finalizeQueued(
			isEditing
				? "Todo queued for sync"
				: "Todo queued for sync"
		);
	};
	const onInvalid = (errors) => {
		const shown = showFirstFormErrorAsToast(errors);
		if (!shown) {
			toast.error("Please fill in all required fields before submitting.");
		}
	};
	const submitHandlers = useSubmissionRouter({
		isEditing,
		handleLeave,
		handleTodo,
		handleDoctorVisitPlan,
		handleDefaultEvent,
	});

	// ----------------------------------------------------
	// FINAL SUBMIT HANDLER (HQ validation guard)
	// ----------------------------------------------------

	const onSubmit = async (values) => {
		try {
			const handler =
				submitHandlers[values.tags] ||
				submitHandlers.default;
			if (
				values.tags === TAG_IDS.HQ_TOUR_PLAN
			) {
				const conflict =
					findOverlappingHqEvent({
						events,
						startDate: values.startDate,
						endDate: values.endDate,
						allowedEmployeeIds,
						currentEventId:
							event?.erpName,
						hqTerritory: values.hqTerritory,
					});

				if (conflict) {
					toast.error(
						`An HQ Tour Plan for ${values.hqTerritory || "this HQ"} already exists on the selected date.`
					);

					return;
				}
			}

			// A doctor can't be visited twice on the same day. Different doctors
			// on the same day, or the same doctor on different days, are fine.
			if (values.tags === TAG_IDS.DOCTOR_VISIT_PLAN) {
				const selectedDay = startOfDay(new Date(values.startDate)).getTime();
				const selectedDoctorIds = (
					Array.isArray(values.doctor) ? values.doctor : [values.doctor]
				)
					.map((d) => (typeof d === "object" ? d?.value : d))
					.filter(Boolean);

				const clash = events.find((ev) => {
					if (ev.tags !== TAG_IDS.DOCTOR_VISIT_PLAN) return false;
					if (event?.erpName && ev.erpName === event.erpName) return false;
					if (
						startOfDay(new Date(ev.startDate)).getTime() !== selectedDay
					)
						return false;
					const evDoctorIds = (
						Array.isArray(ev.doctor) ? ev.doctor : [ev.doctor]
					).filter(Boolean);
					return selectedDoctorIds.some((id) => evDoctorIds.includes(id));
				});

				if (clash) {
					toast.error(
						"A visit for this doctor is already planned on the selected day."
					);
					return;
				}
			}

			await handler(values);
		} catch (error) {
			console.error("Submit error:", error);

			const message =
				error?.response?.errors?.[0]?.message ||
				error?.graphQLErrors?.[0]?.message ||
				error?.message ||
				"Something went wrong. Please try again.";

			toast.error(message);
		}
	};

	const editReadOnlyKeys = useMemo(() => {
		if (!isEditing) return [];
		return tagConfig.editReadOnly?.fields?.map(f => f.key) ?? [];
	}, [isEditing, tagConfig]);

	const isEditReadOnlyField = (key) =>
		isEditing && editReadOnlyKeys.includes(key);
	const enrichedEvent = useMemo(() => {
		if (!event) return null;

		return {
			...event,
			_employeeOptions: employeeOptions,
			_doctorOptions: doctorOptions,
		};
	}, [event, employeeOptions, doctorOptions]);
	const shouldHideDateGrid =
		isEditing && selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN;
	const isDoctorVisitWithoutLocation =
		isEditing &&
		selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN &&
		!hasValidLocation;
	const isSubmitDisabled = isMutationPending;
	return (
		<Modal open={isOpen} onOpenChange={handleDialogOpenChange}>
			<ModalTrigger asChild>{children}</ModalTrigger>

			<ModalContent className=" max-h-[90vh] min-h-[70vh] flex flex-col overflow-scroll">
				<ModalHeader>
					<ModalTitle>{isEditing ? "Edit Event" : "Add Event"}</ModalTitle>
					{/* <ModalDescription /> */}
				</ModalHeader>

				<Form {...form} >
					<form
						id="event-form"
						onSubmit={form.handleSubmit(onSubmit, onInvalid)}
						className="grid gap-4"
					>
						{/* ================= TAGS ================= */}
						{shouldShowTags && (
							<FormField
								control={form.control}
								name="tags"
								render={({ field }) => (
									<div className="flex flex-wrap gap-2">
										{TAGS.filter((tag) => {
											if (tag.id === TAG_IDS.HQ_TOUR_PLAN) {
												return !shouldHideHqTourPlanTag;
											}
											if (tag.id === TAG_IDS.DOCTOR_VISIT_PLAN) {
												return canUseDoctorVisitTag;
											}
											return true;
										}).map((tag) => (
											<button
												key={tag.id}
												type="button"
												disabled={isEditing && tagConfig.ui?.lockTagOnEdit}
												onClick={() => {
													form.setValue("description", "");
													field.onChange(tag.id);
												}}
												className={`px-4 py-1 rounded-full ${field.value === tag.id
													? "bg-primary text-white"
													: "bg-muted"
													} ${isEditing ? "cursor-default" : ""}`}
											>
												{tag.label}
											</button>
										))}
									</div>
								)}
							/>
						)}
						{isEditing && tagConfig.editReadOnly?.fields?.length > 0 && (
							<div className="space-y-4">
								{tagConfig.editReadOnly.fields.map((field) => (
									<div key={field.key}>
										<p className="text-sm font-medium">{field.label}</p>
										<p className="text-sm text-muted-foreground">
											{resolveDisplayValueFromEvent({
												event: enrichedEvent,
												field,
											})}
										</p>
									</div>
								))}
							</div>
						)}

						{/* ================= LEAVE TYPE ================= */}
						{selectedTag === TAG_IDS.LEAVE && (
							<FormField
								control={form.control}
								name="leaveType"
								render={({ field, fieldState }) => (
									<RHFFieldWrapper
										label="Leave Type"
										error={fieldState.error?.message}
									>
										<LeaveTypeCards
											balance={leaveBalance}
											loading={leaveLoading}
											value={field.value}
											onChange={field.onChange}
										/>
										{field.value && leaveBalance?.[field.value] && (
											<div className="mt-2 space-y-1 text-sm text-muted-foreground">
												<div>
													{leaveBalance[field.value].isLeaveWithoutPay ? (
														"Leave Without Pay is always selectable."
													) : (
														<>
															Balance: {leaveBalance[field.value].available} /{" "}
															{leaveBalance[field.value].allocated}
														</>
													)}
												</div>
											</div>
										)}
									</RHFFieldWrapper>
								)}
							/>
						)}

						{/* ================= TITLE ================= */}
						{!tagConfig.hide?.includes("title") && (
							<FormField
								control={form.control}
								name="title"
								render={({ field, fieldState }) => (
									<RHFFieldWrapper
										label="Title"
										error={fieldState.error?.message}
									>
										<FormControl>
											<Input placeholder="Enter title" {...field} />
										</FormControl>
									</RHFFieldWrapper>
								)}
							/>
						)}
						{/* ================= MEETING ================= */}
						{selectedTag === TAG_IDS.MEETING ? (
							<>
									<RHFDateTimeField
										control={form.control}
										form={form}
										name="startDate"
										label="Date"
										hideTime
									/>

									<div
										className={cn(
											"grid gap-3 grid-cols-1"
										)}
									>
										<FormField
											control={form.control}
											name="allDay"
											render={({ field }) => (
												<InlineCheckboxField
													label="All day"
													checked={field.value}
													onChange={field.onChange}
												/>
											)}
										/>
									</div>

									<div className="space-y-2">
										<div className="space-y-2">
											<p className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
												Meeting type
											</p>
											<div className="inline-flex rounded-md border border-input bg-background p-1">
												<button
													type="button"
													className={cn(
														"inline-flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-medium transition",
														meetingMode === "physical"
															? "bg-primary text-primary-foreground"
															: "text-foreground hover:bg-muted"
													)}
													onClick={() => {
														setMeetingMode("physical");
														form.setValue("enableGoogleMeet", false, {
															shouldDirty: true,
															shouldValidate: false,
														});
													}}
												>
													<MapPin className="size-4" />
													Physical
												</button>
												<button
													type="button"
													className={cn(
														"inline-flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-medium transition",
														meetingMode === "virtual"
															? "bg-primary text-primary-foreground"
															: "text-foreground hover:bg-muted"
													)}
													onClick={() => {
														setMeetingMode("virtual");
													}}
												>
													<Video className="size-4" />
													Virtual
												</button>
											</div>
										</div>
									</div>

									{meetingMode === "physical" && (
										<FormField
											control={form.control}
											name="meetingLocation"
											render={({ field, fieldState }) => (
												<RHFFieldWrapper
													label="Location / venue"
													error={fieldState.error?.message}
												>
													<FormControl>
														<Input
															placeholder="Enter meeting location"
															{...field}
															value={field.value ?? ""}
														/>
													</FormControl>
												</RHFFieldWrapper>
											)}
										/>
									)}

									{meetingMode === "virtual" && !isEditing && (
										<FormField
											control={form.control}
											name="enableGoogleMeet"
											render={({ field }) => (
												<div className="space-y-1">
													<InlineCheckboxField
														label="Enable Google Meet"
														checked={Boolean(field.value)}
														onChange={(checked) => {
															if (allDay && checked) {
																toast.error("All-day meetings cannot have Google Meet enabled.");
																field.onChange(false);
																return;
															}
															field.onChange(checked);
														}}
													/>
													{allDay && (
														<p className="text-xs text-red-600">
															All-day meetings cannot have Google Meet enabled
														</p>
													)}
												</div>
											)}
										/>
									)}

								{!allDay && (
									<div className="grid grid-cols-2 gap-3">
										<FormField
											control={form.control}
											name="startDate"
											render={({ field }) => (
												<RHFFieldWrapper label="Start Time">
													<TimePicker
														value={field.value}
														onChange={field.onChange}
														use24Hour={false}
													/>
												</RHFFieldWrapper>
											)}
										/>

										<FormField
											control={form.control}
											name="endDate"
											render={({ field }) => (
												<RHFFieldWrapper label="End Time">
													<TimePicker
														value={field.value}
														minTime={startDate}
														use24Hour={false}
														onChange={(date) => {
															endDateTouchedRef.current = true;
															field.onChange(date);
														}}
													/>
												</RHFFieldWrapper>
											)}
										/>
									</div>
								)}
							</>
						) : !shouldHideDateGrid && (
							<div
								className={`grid gap-3 ${(isFieldVisible("startDate") &&
									isFieldVisible("endDate")) ||
									selectedTag === TAG_IDS.TODO_LIST
									? "grid-cols-2"
									: "grid-cols-1"
									}`}
							>
								{isFieldVisible("startDate") &&
									!isEditReadOnlyField("startDate") && (
										<RHFDateTimeField
											control={form.control}
											form={form}
											name="startDate"
											label="Date"
											hideTime
											/* Doctor Tour Plan restriction */
											minDate={
												selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN &&
												matchedHqEvent &&
												!canCreateDoctorVisitDirectly
													? startOfDay(new Date(matchedHqEvent.startDate))
													: undefined
											}

											maxDate={
												selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN &&
												matchedHqEvent &&
												!canCreateDoctorVisitDirectly
													? endOfDay(new Date(matchedHqEvent.endDate))
													: undefined
											}
											disabledDates={
												selectedTag === TAG_IDS.HQ_TOUR_PLAN ? disabledHqDates : []
											}
										/>
									)}

								{isFieldVisible("endDate") && (
									<RHFDateTimeField control={form.control} form={form} name="endDate" label={getFieldLabel("endDate", "End Date")} hideTime={tagConfig.dateOnly}
										onChange={(date) => {
											endDateTouchedRef.current = true;
											form.setValue("endDate", date);
										}}
									/>
								)}
								{selectedTag === TAG_IDS.LEAVE && leaveType && leaveDays > 0 && (
									<div
										className={cn(
											"col-span-full -mt-1 text-sm text-muted-foreground",
											hasInsufficientLeaveBalance && "text-destructive"
										)}
									>
										Leave request is for {leaveDays} day
										{leaveDays === 1 ? "" : "s"} of {leaveType}.
									</div>
								)}

								{selectedTag === TAG_IDS.TODO_LIST && (
									<FormField
										control={form.control}
										name="priority"
										render={({ field, fieldState }) => (
											<RHFFieldWrapper
												label="Priority"
												error={fieldState.error?.message}
											>
												<Select
													value={field.value}
													onValueChange={field.onChange}
												>
													<SelectTrigger>
														<SelectValue placeholder="Select priority" />
													</SelectTrigger>
													<SelectContent>
														{["High", "Medium", "Low"].map((p) => (
															<SelectItem key={p} value={p}>
																{p}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</RHFFieldWrapper>
										)}
									/>
								)}
						{selectedTag === TAG_IDS.TODO_LIST && isEditing && (
							<FormField
								control={form.control}
								name="status"
										render={({ field, fieldState }) => (
											<RHFFieldWrapper
												label="Status"
												error={fieldState.error?.message}
											>
												<Select
													value={field.value}
													onValueChange={field.onChange}
												>
													<SelectTrigger>
														<SelectValue placeholder="Select status" />
													</SelectTrigger>

													<SelectContent>
														{["Open", "Closed", "Cancelled"].map((status) => (
															<SelectItem key={status} value={status}>
																{status}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</RHFFieldWrapper>
										)}
									/>
								)}
							</div>
						)}
						{selectedTag === TAG_IDS.HQ_TOUR_PLAN && !isEditing && (
							<FormField
								control={form.control}
								name="shareEmployees"
								render={({ field }) => (
									<RHFFieldWrapper label="Shared With">
										<RHFComboboxField
											{...field}
											options={employeePickerOptions}
											multiple
											placeholder="Select employees"
											searchPlaceholder="Search employee"
											onSearch={handleEmployeeSearch}
											loading={employeeSearchLoading}
											filters={employeePickerFilters}
										/>
									</RHFFieldWrapper>
								)}
							/>
						)}
						{/* ================= HQ TERRITORY ================= */}
						{selectedTag === TAG_IDS.HQ_TOUR_PLAN &&
							!isEditReadOnlyField("hqTerritory") && (
								<FormField
									control={form.control}
									name="hqTerritory"
									render={({ field }) => (
										<RHFFieldWrapper label="HQ Territory">
											<RHFHQCardSelector
												control={form.control}
												name="hqTerritory"
												options={hqTerritoryOptions}
											// label="HQ"
											/>
										</RHFFieldWrapper>
									)}
								/>
							)}

						{/* ================= DOCTOR ================= */}
						{!tagConfig.hide?.includes("doctor") &&
							!isEditReadOnlyField("doctor") && (
								<FormField
									control={form.control}
									name="doctor"
									render={({ field }) => (
										<RHFFieldWrapper label="Doctor">
											{selectedTag == TAG_IDS.DOCTOR_VISIT_PLAN ? <RHFDoctorCardSelector
												value={field.value}
												onChange={field.onChange}
												options={territoryDoctors}
												hqTerritory={hqTerritory}
												multiple={isDoctorMulti}
											/> :
												<RHFComboboxField
													{...field}
													options={doctorOptions}
													multiple={isDoctorMulti}
													placeholder="Select doctors"
													searchPlaceholder="Search doctor"
													onSearch={handleDoctorSearch}
													loading={doctorSearchLoading}
												/>}

										</RHFFieldWrapper>
									)}
								/>
							)}

						{/* ================= EMPLOYEES ================= */}
						{!tagConfig.hide?.includes("employees") &&
							(!tagConfig.employee?.autoSelectLoggedIn ||
								tagConfig.employee?.multiselect) && (
								<FormField
									control={form.control}
									name="employees"

									render={({ field }) => (
										<RHFFieldWrapper label={"Employees"}>
											<RHFComboboxField {...field} options={employeePickerOptions} multiple={isMulti} placeholder="Select employees" searchPlaceholder="Search employee"
												onSearch={handleEmployeeSearch}
												loading={employeeSearchLoading}
												filters={employeePickerFilters}
											/>
										</RHFFieldWrapper>
									)}
								/>
							)}
						{selectedTag === TAG_IDS.MEETING && isEditing && meetingAttendanceEmployees.length > 0 && (
							<FormField
								control={form.control}
								name="meetingAttendance"
								render={({ field }) => {
									const attendanceValues = Array.isArray(field.value) ? field.value : [];
									const attendanceMap = new Map(
										attendanceValues
											.filter((entry) => entry?.employeeId)
											.map((entry) => [String(entry.employeeId), entry.attending ?? ""])
									);

									const updateAttendance = (employeeId, attendingValue) => {
										const nextValue = meetingAttendanceEmployees.map((participant) => ({
											employeeId: participant.id,
											attending:
												String(participant.id) === String(employeeId)
													? attendingValue
													: attendanceMap.get(String(participant.id)) ?? "",
										}));
										field.onChange(nextValue);
									};

									return (
										<RHFFieldWrapper label="Attendance">
											<div className="space-y-2 rounded-md border p-3">
												{meetingAttendanceEmployees.map((participant) => (
													<div
														key={participant.id}
														className="flex items-center justify-between gap-3"
													>
														<div className="min-w-0">
															<p className="truncate text-sm font-medium">
																{participant.name}
															</p>
														</div>
														<Select
															value={attendanceMap.get(String(participant.id)) ?? ""}
															onValueChange={(value) =>
																updateAttendance(participant.id, value)
															}
														>
															<SelectTrigger className="w-[140px]">
																<SelectValue placeholder="Mark" />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="Yes">Present</SelectItem>
																<SelectItem value="No">Absent</SelectItem>
																<SelectItem value="Maybe">Maybe</SelectItem>
															</SelectContent>
														</Select>
													</div>
												))}
											</div>
										</RHFFieldWrapper>
									);
								}}
							/>
						)}
						{/* ================= Allocated ================= */}
						{!tagConfig.hide?.includes("allocated_to") &&
							(!tagConfig.employee?.autoSelectLoggedIn ||
								tagConfig.employee?.multiselect) && (
								<FormField
									control={form.control}
									name="allocated_to"

									render={({ field }) => (
										<RHFFieldWrapper label={"Assigned To"}>
											<RHFComboboxField {...field} options={employeePickerOptions} multiple={isMulti} placeholder="Select employees" searchPlaceholder="Search employee"
												onSearch={handleEmployeeSearch}
												loading={employeeSearchLoading}
												filters={employeePickerFilters}
											/>
										</RHFFieldWrapper>
									)}
								/>
							)}

						{/* ================= ASSIGNED TO ================= */}
						{selectedTag === TAG_IDS.TODO_LIST && (
							<FormField
								control={form.control}
								name="assignedTo"
								render={({ field }) => (
									<RHFFieldWrapper label="Visible To">
										<RHFComboboxField {...field} options={employeePickerOptions} multiple placeholder="Select employees" searchPlaceholder="Search employee"
											onSearch={handleEmployeeSearch}
											loading={employeeSearchLoading}
											filters={employeePickerFilters}
										/>
									</RHFFieldWrapper>
								)}
							/>
						)}
						{/* ================= HALF DAY ================= */}
						{selectedTag === TAG_IDS.LEAVE && isHeadOfficeUser && (
							<FormField
								control={form.control}
								name="leavePeriod"
								render={({ field }) => (
									<InlineCheckboxField
										label="Half Day"
										checked={field.value === "Half"}
										onChange={(checked) =>
											field.onChange(checked ? "Half" : "Full")
										}
									/>
								)}
							/>
						)}
						

						{selectedTag === TAG_IDS.LEAVE && isHeadOfficeUser && leavePeriod === "Half" && (
							<FormField
								control={form.control}
								name="halfDayPosition"
								render={({ field, fieldState }) => (
									<RHFFieldWrapper
										label="Which half day"
										error={fieldState.error?.message}
									>
										<Select
											value={field.value ?? "FIRST_DAY"}
											onValueChange={field.onChange}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select half day" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="FIRST_DAY">
													First day — second half
												</SelectItem>
												<SelectItem value="LAST_DAY">
													Last day — first half
												</SelectItem>
											</SelectContent>
										</Select>
									</RHFFieldWrapper>
								)}
							/>
						)}

						{/* ================= MEDICAL ATTACHMENT ================= */}
						{selectedTag === TAG_IDS.LEAVE && requiresMedical && (
							<FormField
								control={form.control}
								name="medicalAttachment"
								render={({ field, fieldState }) => (
									<RHFFieldWrapper
										label="Medical Certificate"
										error={fieldState.error?.message}
									>
										<Input
											type="file"
											onChange={(e) =>
												field.onChange(e.target.files?.[0])
											}
										/>
										{typeof field.value === "string" && field.value ? (
											<a
												href={field.value}
												target="_blank"
												rel="noreferrer"
												className="mt-2 text-sm text-blue-600 underline break-all"
											>
												Current attachment
											</a>
										) : null}
									</RHFFieldWrapper>
								)}
							/>
						)}
						{/* ================= LOCATION ================= */}
						{isEditing && selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN && (
							<div>
								<p className="text-sm font-medium">
									Location
								</p>
								<p className="text-sm text-muted-foreground">
									{currentLatitude && currentLongitude
										? `${currentLatitude}, ${currentLongitude}`
										: "Location not captured"}
								</p>
							</div>
						)}
						{isEditing && selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN && (
							<div className="mt-2 space-y-1">
								<p className="text-sm font-medium">Distance</p>

								<p className="text-sm text-muted-foreground">
									{distanceKm !== null
										? distanceKm.toFixed(3) + " km"
										: "Capture location to calculate distance"}
								</p>

								{distanceKm !== null && distanceKm <= 0.5 && (
									<p className="text-sm text-green-600 font-medium">
										Within 500 meters — Normal Visit
									</p>
								)}

								{distanceKm !== null && distanceKm > 0.5 && (
									<p className="text-sm text-red-600 font-medium">
										Outside 500 meters — Force Visit Required
									</p>
								)}
							</div>
						)}
						{isEditing && selectedTag == TAG_IDS.DOCTOR_VISIT_PLAN && showReason && (
							<div className="mt-2 space-y-1">
								<FormField
									control={form.control}
									name="custom_force_visit_reason"
									render={({ field }) => (
										<RHFFieldWrapper label={"Force Visit Reason"}>
											<Textarea content={field.value} onChange={field.onChange} />
											{/* <Tiptap
											content={field.value}
											onChange={field.onChange}
										/> */}
										</RHFFieldWrapper>
									)}
								/>
							</div>
						)}

						{/* ================= POB QUESTION ================= */}
						{isEditing &&
							selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN && (
								<>
									{hasExistingPobDecision &&
										!canCurrentParticipantEditPob && (
											<p className="text-sm text-muted-foreground">
												POB has already been captured for this visit. Remaining participants can only mark Visit.
											</p>
										)}
									<FormField
										control={form.control}
										name="pob_given"
										render={({ field }) => (
											<RHFFieldWrapper label="Is POB Given ?">
												<div className="flex gap-6">
													<label className="flex items-center gap-2">
														<input
															type="radio"
															value="1"
															checked={Number(field.value) === 1}
															disabled={!canCurrentParticipantEditPob}
															onChange={() => field.onChange(1)}
														/>
														<span>Yes</span>
													</label>

													<label className="flex items-center gap-2">
														<input
															type="radio"
															value="0"
															checked={Number(field.value) === 0}
															disabled={!canCurrentParticipantEditPob}
															onChange={() => field.onChange(0)}
														/>
														<span>No</span>
													</label>
												</div>
											</RHFFieldWrapper>
										)}
									/>
								</>
							)}
						{/* ================= CUSTOMER ================= */}
						{isEditing &&
							selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN &&
							Number(pobGiven) === 1 &&
							canCurrentParticipantEditPob && (
								<FormField
									control={form.control}
									name="customer"
									render={({ field }) => (
										<RHFFieldWrapper label="Customer">
											<RHFComboboxField
												{...field}
												options={customerOptions}
												multiple={false}
												placeholder="Select Customer"
												searchPlaceholder="Search customer"
											/>
										</RHFFieldWrapper>
									)}
								/>
							)}
						{/* ================= POB ================= */}
						{isEditing &&
							selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN &&
							Number(pobGiven) === 1 &&
							customer &&
							canCurrentParticipantEditPob && (
								<div className="space-y-4">
									<h4 className="font-medium">POB Details</h4>

									{/* ✅ HEADER (ONLY ONCE) */}
									<div className="grid grid-cols-[1fr_100px_120px_40px] gap-3 text-sm font-medium text-muted-foreground">
										<span>Item</span>
										<span>Qty</span>
										<span>Amount</span>
										<span></span>
									</div>

									{/* ✅ ROWS */}
									{(pobItems ?? []).map((row, index) => (
										<div
											key={index}
											className="grid grid-cols-[1fr_100px_120px_40px] gap-3 items-end"
										>
											{/* Item */}
											<RHFComboboxField
												name={`fsl_doctor_item.${index}.item__name`}
												options={getAvailableItems(
													itemOptions,
													pobItems,
													row.item__name
												)}
												tagsDisplay={false}
												multiple={false}
												placeholder="Select Item"
											/>

											{/* Qty */}
											<Input
												type="number"
												min={1}
												value={row.qty}
												onChange={(e) => {
													const qty = Number(e.target.value);
													updatePobRow(form, index, { qty });
												}}
											/>

											{/* Amount */}
											<Input value={row.amount} disabled />

											{/* Remove */}
											<Button
												type="button"
												variant="ghost"
												size="icon"
												onClick={() => {
													const items = [...form.getValues("fsl_doctor_item")];
													items.splice(index, 1);
													form.setValue("fsl_doctor_item", items, {
														shouldDirty: true,
													});
												}}
											>
												✕
											</Button>
										</div>
									))}

									{/* Add Item */}
									<Button
										type="button"
										onClick={() => {
											const items = form.getValues("fsl_doctor_item") ?? [];
											form.setValue(
												"fsl_doctor_item",
												[...items, { item__name: "", qty: 1, rate: 0, amount: 0 }],
												{ shouldDirty: true }
											);
										}}
									>
										+ Add Item
									</Button>
								</div>
							)}
						{/* ================= Notes ================= */}
						{isEditing &&
							selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN &&
							doctorDetails?.doctorId && (
								<DoctorNotesSection
									doctorId={doctorDetails.doctorId}
									notes={doctorDetails.doctorNotes}
									setDoctorOptions={setDoctorOptions}
								/>
							)}
						{/* ================= DESCRIPTION ================= */}
						{!tagConfig.hide?.includes("description") && (
							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<RHFFieldWrapper label={tagConfig.labels?.description ?? "Description"}>
										<Tiptap
											key={selectedTag}
											content={field.value}
											onChange={field.onChange}
										/>
									</RHFFieldWrapper>
								)}
							/>
						)}
						{selectedTag === TAG_IDS.TODO_LIST && event?.erpName && (
							<ErrorBoundary>
								<TodoComments todoName={event.erpName} />
							</ErrorBoundary>
						)}
					</form>
				</Form>

				<div className="pt-4 flex mt-auto justify-end">
					<FormFooter
						isEditing={isEditing}
						disabled={isSubmitDisabled}
						showCaptureLocation={shouldShowRequestLocation}
						showSubmit={!isDoctorVisitWithoutLocation}
						onCaptureLocation={handleRequestLocation}
						isResolvingLocation={isResolvingLocation}
						onSubmit={form.handleSubmit(onSubmit, onInvalid)}
					/>
				</div>
			</ModalContent>
		</Modal>
	);
}
