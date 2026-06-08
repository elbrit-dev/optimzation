import { zodResolver } from "@hookform/resolvers/zod";
import { addMinutes, differenceInCalendarDays, startOfDay, endOfDay } from "date-fns";
import { useEffect, useMemo, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { buildEventDefaultValues, TAG_IDS, TAGS } from "@calendar/components/calendar/constants";
import { mapFormToErpEvent } from "@calendar/components/calendar/module/event/mappers/event-to-erp";
import { saveEvent, saveDocToQuotation } from "@calendar/components/calendar/module/event/services/event.service";
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
import { mapErpTodoToCalendar, mapFormToErpTodo } from "@calendar/components/calendar/module/todo/mappers/todo.mapper";
import { mapErpLeaveToCalendar, mapFormToErpLeave } from "@calendar/components/calendar/module/leave/mappers/leave.mapper";
import { useEmployeeResolvers } from "@calendar/lib/employeeResolver";
import { uploadLeaveMedicalCertificate } from "@calendar/lib/file.service";
import { fetchItems } from "@calendar/components/calendar/module/event/services/master-data.service";
import { buildParticipantsWithDetails, getAvailableItems, normalizeMeetingTimes, normalizeNonMeetingDates, resolveLatLong, showFirstFormErrorAsToast, syncPobItemRates, updatePobRow } from "@calendar/lib/helper";
import { Button } from "@calendar/components/ui/button";
import { resolveDisplayValueFromEvent } from "@calendar/lib/calendar/resolveDisplay";
import { useAuth } from "@calendar/components/auth/auth-context";
import Tiptap from "@calendar/components/calendar/module/todo/components/TodoWysiwyg";
import { mapDoctorVisitToQuotation } from "@calendar/components/calendar/module/event/mappers/quotation-to-erp";
import { calculateDistanceKm, parseLatLong } from "../helpers";
import { useDoctorResolvers } from "@calendar/lib/doctorResolver";
import { DoctorNotesSection } from "../module/event/components/DoctorNotesSection";
import TodoComments from "@calendar/components/calendar/module/todo/components/TodoCommentsSection";
import { Textarea } from "@calendar/components/ui/textarea";
import { fetchEmployeeLeaveBalance, saveLeaveApplication, updateLeaveAttachment } from "@calendar/components/calendar/module/leave/services/leave.service";
import { saveDocToErp } from "@calendar/components/calendar/module/todo/services/todo.service";

export function AddEditEventDialog({ children, event, defaultTag, forceValues, startDate: initialStartDate }) {
	const { isOpen, onClose, onToggle } = useDisclosure();
	const { erpUrl, authToken } = useAuth();
	const { addEvent, updateEvent, employeeOptions,
		doctorOptions, events,
		hqTerritoryOptions,
		setEmployeeOptions,
		setDoctorOptions, customerOptions, selectedDate, allowedEmployeeIds,
		setHqTerritoryOptions, } = useCalendar();
	const isEditing = !!event;
	const [leaveBalance, setLeaveBalance] = useState(null);
	const [leaveLoading, setLeaveLoading] = useState(false);
	const employeeResolvers = useEmployeeResolvers(employeeOptions);
	const doctorResolvers = useDoctorResolvers(doctorOptions);
	const [itemOptions, setItemOptions] = useState([]);
	const [isResolvingLocation, setIsResolvingLocation] = useState(false);
	const [distanceKm, setDistanceKm] = useState(null);
	const endDateTouchedRef = useRef(false); // existing
	const [showReason, setShowReason] = useState(false);
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
	const { doctor, employees, hqTerritory, tags: selectedTag, attending } = useWatch({ control: form.control });
	const pobGiven = useWatch({
		control: form.control,
		name: "pob_given",
	});
	const pobItems = useWatch({
		control: form.control,
		name: "fsl_doctor_item",
	});
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
	const currentLatitude = form.watch("custom_latitude");
	const currentLongitude = form.watch("custom_longitude");
	useEffect(() => {
		if (!isEditing) return;
		if (!event?.participants?.length) return;

		if (!currentLatitude || !currentLongitude) {
			setDistanceKm(null);
			setShowReason(false);
			return;
		}

		const doctor = event.participants.find((p) => p.type === "Lead");

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

	}, [currentLatitude, currentLongitude, event, isEditing]);
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
		reset({
			employees: undefined, doctor: isDoctorMulti ? [] : undefined,
			status: "Open", priority: "Medium", title: "", description: ""
		});
		// ❌ HQ is REQUIRED for this tag — never reset it
		if (selectedTag !== TAG_IDS.HQ_TOUR_PLAN) {
			reset({ hqTerritory: "" });
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

		// Half day is always 1 day logically
		if (leavePeriod === "Half") {
			const total =
				differenceInCalendarDays(endDate, startDate) + 1;
			return total - 0.5;
		}


		return differenceInCalendarDays(endDate, startDate) + 1;
	}, [selectedTag, startDate, endDate, leavePeriod]);
	const doctorDetails = useMemo(() => {
		const doctorRef = event?.participants?.find(
			(p) => p.type === "Lead"
		);

		const doctorId = doctorRef?.id;
		if (!doctorId) return null;

		return {
			doctorId,
			doctorNotes:
				doctorResolvers.getDoctorFieldById(
					doctorId,
					"notes"
				) ?? [],
		};
	}, [event?.participants, doctorResolvers]);
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
		if (!requiresMedical) {
			form.setValue("medicalAttachment", undefined, {
				shouldDirty: false,
				shouldValidate: false,
			});
		}
	}, [requiresMedical]);

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
		if (pobGiven !== "Yes") return;
		if (itemOptions.length) return;

		fetchItems().then(setItemOptions);
	}, [isEditing, pobGiven, selectedTag]);

	/* ---------------------------------------------
	  RESET POB ITEMS
	--------------------------------------------- */
	useEffect(() => {
		if (pobGiven !== "Yes") {
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
		}
	}, [leavePeriod]); // 🔧 LEAVE HALF DAY FIX
	/* ---------------------------------------------
		   Longitude and latitude
		--------------------------------------------- */

	useEffect(() => {
		if (!isEditing) return;

		// 📍 Doctor Visit Plan: capture endDate ONCE
		if (
			selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN &&
			attending === "Yes" &&
			!endDateTouchedRef.current
		) {
			form.setValue("endDate", new Date(), {
				shouldDirty: true,
				shouldValidate: true,
			});

			endDateTouchedRef.current = true;
		}

		// existing geo logic (unchanged)
		resolveLatLong(form, isEditing, toast);
	}, [isEditing]);

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
		 RESET MANUAL FLAG ONLY WHEN START DATE CHANGES
		 ✅ FIX – prevents overwriting manual edits
	  --------------------------------------------- */
	useEffect(() => {
		endDateTouchedRef.current = false;
	}, [startDate]);
	/* ---------------------------------------------
	   LOAD PARTICIPANTS (UNCHANGED)
	--------------------------------------------- */
	useEffect(() => {
		if (!isOpen || !event?.participants?.length) return;
		if (!employeeOptions.length && !doctorOptions.length) return;

		const employeeIds = event.participants
			.filter(p => p.type === "Employee")
			.map(p => String(p.id));

		const doctorIds = event.participants
			.filter(p => p.type === "Lead")
			.map(p => String(p.id));

		/* ---------- Employees ---------- */
		if (employeeIds.length) {
			const employeeValues = employeeIds
				.map(id => employeeOptions.find(o => o.value === id))
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
			const doctorValues = doctorIds
				.map(id => doctorOptions.find(o => o.value === id))
				.filter(Boolean);

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
		employeeOptions,
		doctorOptions,
	]);

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
			initialStartDate ??
			selectedDate ??
			now;

		const currentValues = form.getValues();

		form.reset({
			...currentValues,
			startDate: baseDate,
			endDate: tagConfig.dateOnly
				? baseDate
				: addMinutes(baseDate, 60),
			tags: selectedTag,
		});
	}, [isOpen, selectedTag, isEditing, initialStartDate, selectedDate]);

	/* --------------------------------------------------
	   AUTO TITLE (SAFE)
	-------------------------------------------------- */
	useEffect(() => {
		if (isEditing) return;
		if (!tagConfig.autoTitle) return;

		const values = form.getValues();
		const nextTitle = tagConfig.autoTitle(values, {
			doctorOptions,
			employeeOptions,
		});

		if (!nextTitle) return;

		if (values.title !== nextTitle) {
			form.setValue("title", nextTitle, {
				shouldDirty: false,
				shouldValidate: true, // 🔑 REQUIRED
			});
		}
	}, [selectedTag, hqTerritory, doctor, employees, doctorOptions, employeeOptions, isEditing,]);

	/* --------------------------------------------------
	   AUTO SELECT LOGGED IN USER
	-------------------------------------------------- */
	useEffect(() => {
		if (!selectedTag) return;

		loadParticipantOptionsByTag({ tag: selectedTag, employeeOptions, hqTerritoryOptions, doctorOptions, setEmployeeOptions, setHqTerritoryOptions, setDoctorOptions, });

		// 🔒 ABSOLUTE GUARD
		if (isEditing) return;

		if (!tagConfig.employee?.autoSelectLoggedIn) return;

		const loggedInEmployee =
			employeeOptions.find(
				(e) => e.value === LOGGED_IN_USER.id
			);

		if (!loggedInEmployee) return;

		const value = tagConfig.employee.multiselect
			? [loggedInEmployee]
			: loggedInEmployee;

		form.setValue("employees", value, { shouldDirty: false });
	}, [selectedTag]);

	/* ---------------------------------------------
   NON-MEETING DATE LOGIC (MEETING-LIKE)
   ✅ FIX – guarded writes only
--------------------------------------------- */
	useEffect(() => {
		normalizeNonMeetingDates(
			form,
			startDate,
			selectedTag,
			endDateTouchedRef.current
		);
	}, [startDate, selectedTag]);
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
		const empId = Array.isArray(values.employees)
			? values.employees[0]
			: values.employees;

		const emp = employeeOptions.find(e => e.value === empId);

		if (!doc) return values.title || "DV";

		const doctorName = doc.label.replace(/\s+/g, "");
		const employeeName = emp?.label?.replace(/\s+/g, "") ?? "Emp";

		return `${doctorName}-${employeeName}`;
	};
	const finalize = (message) => {
		toast.success(message);
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
			medicalAttachment: undefined, allocated_to: undefined,
			assignedTo: [], custom_latitude: undefined, custom_longitude:undefined,
			hqTerritory: "",
			allDay: false,
		});
		onClose();
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


	const upsertCalendarEvent = (calendarEvent) => {
		event ? updateEvent(calendarEvent) : addEvent(calendarEvent);
	};
	const buildCalendarEvent = ({
		event,
		values,
		erpDoc,
		savedName,
		tagConfig,
		employeeOptions,
		doctorOptions,
		ownerOverride,
	}) => {
		const shouldBeGreen =
			values.tags === TAG_IDS.DOCTOR_VISIT_PLAN &&
			values.attending === "Yes";

		const calendarEvent = {
			...(event ?? {}),
			erpName: savedName,
			title: values.title,
			description: values.description,
			startDate: erpDoc.starts_on,
			endDate: erpDoc.ends_on,
			color: shouldBeGreen ? "green" : tagConfig.fixedColor,
			tags: values.tags,
			owner: ownerOverride,
			hqTerritory: values.hqTerritory || "",
			event_participants: erpDoc.event_participants,
			attending: values.attending,
			participants: buildParticipantsWithDetails(
				erpDoc.event_participants,
				{ employeeOptions, doctorOptions }
			),
		};

		if (values.tags === TAG_IDS.DOCTOR_VISIT_PLAN) {
			if (values.pob_given === "Yes" && Array.isArray(values.fsl_doctor_item)) {
				calendarEvent.fsl_doctor_item =
					normalizePobItemsForUI(values.fsl_doctor_item);
				calendarEvent.pob_given = "Yes";
			} else {
				calendarEvent.fsl_doctor_item = [];
				calendarEvent.pob_given = "No";
			}
		}

		return calendarEvent;
	};
	useEffect(() => {
		if (!isOpen) return;
		if (!isEditing) return;
		if (!event?.allocated_to) return;
		if (!employeeOptions.length) return;

		// allocated_to is EMAIL
		const email = event.allocated_to.toLowerCase();

		// Resolve employee ID from email
		const employeeId =
			employeeResolvers.getEmployeeIdByEmail(email);

		if (!employeeId) return;

		// Find matching option object
		const employeeOption =
			employeeOptions.find(
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
		employeeOptions,
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
	const hasValidHqTourPlan = !!matchedHqEvent;
	useEffect(() => {
		if (selectedTag !== TAG_IDS.DOCTOR_VISIT_PLAN) return;
		if (!matchedHqEvent) return;

		const currentHq = form.getValues("hqTerritory");
		if (currentHq) return;

		form.setValue("hqTerritory", matchedHqEvent.hqTerritory, {
			shouldDirty: true,
			shouldValidate: true,
		});
	}, [selectedTag, matchedHqEvent]);

	// ----------------------------------------------------
	// Disabled dates for HQ Tour Plan (logged-in user only)
	// Prevent selecting dates where HQ already exists
	// ----------------------------------------------------

	const disabledHqDates = useMemo(() => {
		if (!events?.length) return [];

		const disabled = [];

		events.forEach((ev) => {
			if (ev.tags !== TAG_IDS.HQ_TOUR_PLAN) return;

			// ignore current editing event
			if (
				isEditing &&
				ev.erpName === event?.erpName
			) {
				return;
			}

			const isParticipant = ev.participants?.some(
				(p) => allowedEmployeeIds.includes(p.id)
			);

			if (!isParticipant) return;

			let current = startOfDay(
				new Date(ev.startDate)
			);

			const end = endOfDay(
				new Date(ev.endDate)
			);

			while (current <= end) {
				disabled.push(new Date(current));
				current.setDate(current.getDate() + 1);
			}
		});

		return disabled;
	}, [
		events,
		allowedEmployeeIds,
		isEditing,
		event,
	]);

	useEffect(() => {
		const customer = form.watch("customer");

		if (!customer) {
			form.setValue("pob_given", undefined, { shouldDirty: true });
			form.setValue("fsl_doctor_item", [], { shouldDirty: true });
		}
	}, [form.watch("customer")]);
	const handleDefaultEvent = async (values) => {
		let quotationName =
			event?.reference_docname || null;

		// Only for Doctor Visit Plan
		if (
			values.tags === TAG_IDS.DOCTOR_VISIT_PLAN &&
			values.pob_given === "Yes"
		) {
			const doctorId = values?.doctor[0]?.value;

			const quotationDoc =
				mapDoctorVisitToQuotation({
					values,
					doctorId,
					existingName: quotationName,
				});

			const savedQuotation =
				await saveDocToQuotation(quotationDoc);

			quotationName = savedQuotation.name;
			// quotationName = "SAL-QTN-2026-00001"
		}

		const erpDoc = mapFormToErpEvent(values, {
			erpName: event?.erpName,
			employeeResolvers,
			doctorResolvers,
		});

		if (quotationName) {
			erpDoc.reference_doctype = "Quotation";
			erpDoc.reference_docname = quotationName;
		}
		const savedEvent = await saveEvent(erpDoc);
		const calendarEvent = buildCalendarEvent({
			event,
			values,
			erpDoc,
			savedName: savedEvent.name,
			tagConfig,
			employeeOptions,
			doctorOptions,
			ownerOverride:
				event?.owner || LOGGED_IN_USER.id,
		});
		upsertCalendarEvent(calendarEvent);

		finalize("Event updated");
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

		for (const doctor of normalizedDoctors) {
			const doctorId =
				typeof doctor === "object" ? doctor.value : doctor;
			const computedTitle = buildDoctorVisitTitle(doctorId, values);

			const enrichedValues = {
				...values,
				title: computedTitle,
				doctor,
			};
			const erpDoc = mapFormToErpEvent(enrichedValues, {
				employeeResolvers,
				doctorResolvers,
			});
			
			const savedEvent = await saveEvent(erpDoc);

			const calendarEvent = buildCalendarEvent({
				values: enrichedValues,
				erpDoc,
				savedName: savedEvent.name,
				tagConfig,
				employeeOptions,
				doctorOptions,
				ownerOverride: LOGGED_IN_USER.id,
			});
			addEvent(calendarEvent);

		}
		finalize(`Created ${values.doctor.length} Doctor Visit events`);
	};

	const handleLeave = async (values) => {
		try {
			if (requiresMedical && !values.medicalAttachment) {
				toast.error("Medical certificate required");
				return;
			}

			const leaveDoc = mapFormToErpLeave(values);
			delete leaveDoc.custom_attachment;

			const savedLeave = await saveLeaveApplication(leaveDoc, {
				erpName: event?.erpName,
			});

			// 🚨 If backend returned null (GraphQL validation error case)
			if (!savedLeave) {
				toast.error("Failed to apply leave. Please try again.");
				return;
			}

			if (requiresMedical && values.medicalAttachment) {
				const uploadResult = await uploadLeaveMedicalCertificate(
					erpUrl,
					authToken,
					values,
					savedLeave.name
				);

				if (uploadResult?.fileUrl) {
					await updateLeaveAttachment(
						savedLeave.name,
						uploadResult.fileUrl
					);
				}
			}

			const calendarLeave = mapErpLeaveToCalendar({
				...leaveDoc,
				name: savedLeave.name,
				color: "#DC2626",
			});

			upsertCalendarEvent(calendarLeave);
			finalize("Leave applied successfully");

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

		const savedTodo = await saveDocToErp(todoDoc);

		const calendarTodo = mapErpTodoToCalendar({
			...todoDoc,
			name: savedTodo.name,
		});

		upsertCalendarEvent(calendarTodo);

		finalize("Todo saved");
	};
	const onInvalid = (errors) => {
		showFirstFormErrorAsToast(errors);
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
		const handler =
			submitHandlers[values.tags] || submitHandlers.default;

		await handler(values);
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
	const isSubmitDisabled = form.formState.isSubmitting;

	return (
		<Modal open={isOpen} onOpenChange={onToggle}>
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
											if (tag.id === TAG_IDS.DOCTOR_VISIT_PLAN) {
												return hasValidHqTourPlan;
											}
											return true;
										}).map((tag) => (
											<button
												key={tag.id}
												type="button"
												disabled={isEditing && tagConfig.ui?.lockTagOnEdit}
												onClick={() => field.onChange(tag.id)}
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
											<div className="mt-2 text-sm text-muted-foreground">
												Balance: {leaveBalance[field.value].available} /{" "}
												{leaveBalance[field.value].allocated}
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
												selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN && matchedHqEvent
													? startOfDay(new Date(matchedHqEvent.startDate))
													: undefined
											}

											maxDate={
												selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN && matchedHqEvent
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
												options={doctorOptions}
												multiple={isDoctorMulti}
											/> :
												<RHFComboboxField
													{...field}
													options={doctorOptions}
													multiple={isDoctorMulti}
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
											<RHFComboboxField {...field} options={employeeOptions} multiple={isMulti} placeholder="Select employees" searchPlaceholder="Search employee"
											/>
										</RHFFieldWrapper>
									)}
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
											<RHFComboboxField {...field} options={employeeOptions} multiple={isMulti} placeholder="Select employees" searchPlaceholder="Search employee"
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
										<RHFComboboxField {...field} options={employeeOptions} multiple placeholder="Select employees" searchPlaceholder="Search employee"
										/>
									</RHFFieldWrapper>
								)}
							/>
						)}
						{/* ================= HALF DAY ================= */}
						{selectedTag === TAG_IDS.LEAVE && (
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

						{selectedTag === TAG_IDS.LEAVE && leavePeriod === "Half" && (
							<RHFDateTimeField control={form.control} form={form} name="halfDayDate" label="Half Day Date" hideTime minDate={startDate} maxDate={endDate}
								onChange={(date) => {
									if (date < startDate || date > endDate) {
										toast.error(
											"Half Day date must be between From and To dates"
										);
										return;
									}
									form.setValue("halfDayDate", date);
								}}
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
									{form.watch("custom_latitude") && form.watch("custom_longitude")
										? `${form.watch("custom_latitude")}, ${form.watch("custom_longitude")}`
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
								<FormField
									control={form.control}
									name="pob_given"
									render={({ field }) => (
										<RHFFieldWrapper label="Did POB Given ?">
											<div className="flex gap-6">
												<label className="flex items-center gap-2">
													<input
														type="radio"
														value="Yes"
														checked={field.value === "Yes"}
														onChange={() => field.onChange("Yes")}
													/>
													<span>Yes</span>
												</label>

												<label className="flex items-center gap-2">
													<input
														type="radio"
														value="No"
														checked={field.value === "No"}
														onChange={() => field.onChange("No")}
													/>
													<span>No</span>
												</label>
											</div>
										</RHFFieldWrapper>
									)}
								/>
							)}
						{/* ================= CUSTOMER ================= */}
						{isEditing &&
							selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN &&
							pobGiven === "Yes" && (
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
							pobGiven === "Yes" && form.watch("customer") && (
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
									{(form.watch("fsl_doctor_item") ?? []).map((row, index) => (
										<div
											key={index}
											className="grid grid-cols-[1fr_100px_120px_40px] gap-3 items-end"
										>
											{/* Item */}
											<RHFComboboxField
												name={`fsl_doctor_item.${index}.item__name`}
												options={getAvailableItems(
													itemOptions,
													form.watch("fsl_doctor_item"),
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
											content={field.value}
											onChange={field.onChange}
										/>
									</RHFFieldWrapper>
								)}
							/>
						)}
						{selectedTag === TAG_IDS.TODO_LIST && event?.erpName && (
							<TodoComments todoName={event.erpName} />
						)}
					</form>
				</Form>

				<div className="pt-4 flex mt-auto justify-end">
					<FormFooter
						isEditing={isEditing}
						disabled={isSubmitDisabled}
						showCaptureLocation={shouldShowRequestLocation}
						onCaptureLocation={handleRequestLocation}
						isResolvingLocation={isResolvingLocation}
					/>
				</div>
			</ModalContent>
		</Modal>
	);
}
