import { zodResolver } from "@hookform/resolvers/zod";
import { addMinutes, differenceInCalendarDays, set } from "date-fns";
import { useEffect, useMemo, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { TAG_IDS, TAGS } from "@calendar/components/calendar/mocks";
import { mapFormToErpEvent } from "@calendar/services/event-to-erp-graphql";
import { saveDocToErp, saveEvent, fetchEmployeeLeaveBalance, saveLeaveApplication, updateLeaveAttachment, updateLeadDob } from "@calendar/services/event.service";
import { useWatch } from "react-hook-form";
import { LeaveTypeCards } from "@calendar/components/calendar/leave/LeaveTypeCards";
import { Form, FormControl, FormField, } from "@calendar/components/ui/form";
import { Input } from "@calendar/components/ui/input";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalTrigger, } from "@calendar/components/ui/responsive-modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@calendar/components/ui/select";
import { RHFFieldWrapper, RHFComboboxField, RHFDateTimeField, InlineCheckboxField, FormFooter, } from "@calendar/components/calendar/form-fields";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { useDisclosure } from "@calendar/components/calendar/hooks";
import { eventSchema } from "@calendar/components/calendar/schemas";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { loadParticipantOptionsByTag } from "@calendar/lib/participants";
import { TimePicker } from "@calendar/components/ui/TimePicker";
import { mapFormToErpTodo, mapErpTodoToCalendar } from "@calendar/services/todo-to-erp-graphql";
import { mapErpLeaveToCalendar, mapFormToErpLeave } from "@calendar/services/leave-to-erp";
import { useEmployeeResolvers } from "@calendar/lib/employeeResolver";
import { uploadLeaveMedicalCertificate } from "@calendar/lib/file.service";
import { fetchItems } from "@calendar/services/participants.service";
import { getAvailableItems, normalizeMeetingTimes, normalizeNonMeetingDates, resolveLatLong, showFirstFormErrorAsToast, showFormErrorsAsToast, syncPobItemRates, updatePobRow } from "@calendar/lib/helper";
import { Button } from "@calendar/components/ui/button";
import { resolveDisplayValueFromEvent } from "@calendar/lib/calendar/resolveDisplay";
import { useAuth } from "@calendar/components/auth/auth-context";
import { Textarea } from "@calendar/components/ui/textarea";
import Tiptap from "@calendar/components/ui/TodoWysiwyg";

export function AddEditEventDialog({ children, event, defaultTag, forceValues }) {
	const { isOpen, onClose, onToggle } = useDisclosure();
	const { erpUrl, authToken } = useAuth();
	const { addEvent, updateEvent, employeeOptions,
		doctorOptions,
		hqTerritoryOptions,
		setEmployeeOptions,
		setDoctorOptions,
		setHqTerritoryOptions, } = useCalendar();
	const isEditing = !!event;
	const [leaveBalance, setLeaveBalance] = useState(null);
	const [leaveLoading, setLeaveLoading] = useState(false);
	const employeeResolvers = useEmployeeResolvers(employeeOptions);
	const [itemOptions, setItemOptions] = useState([]);
	const endDateTouchedRef = useRef(false); // existing
	const initialDates = useMemo(() => {
		if (!event) {
			const now = new Date();
			return {
				startDate: now,
				endDate: addMinutes(now, 60),
			};
		}
		return {
			startDate: new Date(event.startDate),
			endDate: new Date(event.endDate),
		};
	}, [event]);
	const employeeParticipant = useMemo(() => {
		return event?.participants?.find(
			(p) => p.type === "Employee"
		);
	}, [event]);

	const form = useForm({
		resolver: zodResolver(eventSchema),
		mode: "onChange",
		defaultValues: {
			title: event?.title ?? "",
			description: event?.description ?? "",
			startDate: initialDates.startDate,
			endDate: initialDates.endDate,
			tags: event?.tags ?? defaultTag ?? "Other",
			hqTerritory: event?.hqTerritory ?? "",
			employees: event?.employees,
			doctor: event?.doctor,
			allocated_to: event?.allocated_to ?? "",
			leaveType: event?.leaveType ?? "Casual Leave",
			reportTo: event?.reportTo ?? "",
			medicalAttachment: event?.medicalAttachment ?? "",
			allDay: event?.allDay ?? false,
			todoStatus: "Open",
			priority: "Medium",
			leavePeriod: "Full",
			halfDayDate: event?.halfDayDate ?? "",
			approvedBy: event?.approvedBy ?? "",
			attending: employeeParticipant?.attending ?? "No",
			kly_lat_long: employeeParticipant?.kly_lat_long ?? "",
			pob_given: event?.pob_given ?? "No",
			fsl_doctor_item: event?.fsl_doctor_item ?? [],
		},
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
			todoStatus: "Open", priority: "Medium", title: "",
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
			resolveLatLong(form, attending, isEditing, toast);
		  }, [attending, isEditing]);
		

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

		if (form.getValues("allDay") !== true) {
			form.setValue("allDay", true, {
				shouldDirty: false,
				shouldValidate: false,
			});
		}
	}, [selectedTag]);

	/* --------------------------------------------------
	   RESET FORM
	-------------------------------------------------- */
	// const initialDefaultsRef = useRef(form.getValues());

	useEffect(() => {
		if (!isOpen || isEditing) return;

		const now = new Date();
		const currentValues = form.getValues();

		form.reset({
			...currentValues,               // ✅ keeps title
			startDate: now,
			endDate: addMinutes(now, 60),
			tags: selectedTag,
		});
	}, [isOpen, selectedTag, isEditing]);


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

		const value = tagConfig.employee.multiselect
			? [LOGGED_IN_USER.id]
			: LOGGED_IN_USER.id;

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
	const handleBirthday = async (values) => {
		if (!values.endDate) {
			values.endDate = values.startDate;
		}

		if (values.doctor) {
			const doctorId = Array.isArray(values.doctor)
				? values.doctor[0]
				: values.doctor;

			try {
				await updateLeadDob(doctorId, values.startDate);
			} catch (err) {
				console.error("Failed to update doctor DOB", err);
				toast.error("Failed to update Doctor DOB");
				return false;
			}
		}

		return true;
	};
	const handleLeave = async (values) => {
		if (requiresMedical && !values.medicalAttachment) {
			toast.error("Medical certificate required");
			return;
		}

		const leaveDoc = mapFormToErpLeave(values);
		delete leaveDoc.fsl_attach;

		const savedLeave = await saveLeaveApplication(leaveDoc);

		if (requiresMedical && values.medicalAttachment) {
			const uploadResult = await uploadLeaveMedicalCertificate(
				erpUrl, authToken,
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
	};
	const handleTodo = async (values) => {
		const todoDoc = mapFormToErpTodo(values, employeeResolvers);
		const savedTodo = await saveDocToErp(todoDoc);
		const calendarTodo = mapErpTodoToCalendar(
			{
				...todoDoc,
				name: savedTodo.name
			}
		);
		upsertCalendarEvent(calendarTodo);
		finalize("Todo saved");
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

			const erpDoc = mapFormToErpEvent(
				{
					...values,
					title: buildDoctorVisitTitle(doctorId, values),
					doctor: doctor,
				},
				{}
			);
			const savedEvent = await saveEvent(erpDoc);
			// console.log("ERP DOC", erpDoc)
			const calendarEvent = {
				erpName: savedEvent.name,
				title: buildDoctorVisitTitle(doctorId, values), description: values.description,
				startDate: erpDoc.starts_on, endDate: erpDoc.ends_on, color: tagConfig.fixedColor,
				tags: values.tags, owner: LOGGED_IN_USER.id,
				// 🔒 ERP truth
				event_participants: erpDoc.event_participants,
				attending: values.attending,
				// 👇 derived UI
				participants: erpDoc.event_participants.map(p => ({
					type: p.reference_doctype,
					id: p.reference_docname,
				})),
			};
			// console.log("Calendar Event", calendarEvent)
			if (
				values.pob_given === "Yes" &&
				Array.isArray(values.fsl_doctor_item)
			) {
				calendarEvent.fsl_doctor_item = normalizePobItemsForUI(
					values.fsl_doctor_item
				);

				calendarEvent.pob_given = "Yes";
			} else {
				calendarEvent.fsl_doctor_item = [];
				calendarEvent.pob_given = "No";
			}

			addEvent(calendarEvent);
		}

		finalize(`Created ${values.doctor.length} Doctor Visit events`);
	};
	const handleDefaultEvent = async (values) => {
		const erpDoc = mapFormToErpEvent(values, {
			erpName: event?.erpName,
		});
		// console.log("ERP DOC", erpDoc)
		const savedEvent = await saveEvent(erpDoc);
		const calendarEvent = {
			...(event ?? {}),
			erpName: savedEvent.name,
			title: values.title, description: values.description,
			startDate: erpDoc.starts_on, endDate: erpDoc.ends_on, color: tagConfig.fixedColor,
			tags: values.tags, owner: event ? event.owner : LOGGED_IN_USER.id,
			hqTerritory: values.hqTerritory || "",
			// 🔒 ERP truth
			event_participants: erpDoc.event_participants,
			attending: values.attending,
			// 👇 derived UI
			participants: erpDoc.event_participants.map(p => ({
				type: p.reference_doctype,
				id: p.reference_docname,
			})),
		};
		// console.log("Calendar Event", calendarEvent)
		if (
			values.tags === TAG_IDS.DOCTOR_VISIT_PLAN &&
			values.pob_given === "Yes" &&
			Array.isArray(values.fsl_doctor_item)
		) {
			calendarEvent.fsl_doctor_item = normalizePobItemsForUI(
				values.fsl_doctor_item
			);

			calendarEvent.pob_given = "Yes";
		} else if (values.tags === TAG_IDS.DOCTOR_VISIT_PLAN) {
			calendarEvent.fsl_doctor_item = [];
			calendarEvent.pob_given = "No";
		}

		upsertCalendarEvent(calendarEvent);
		finalize("Event saved");
	};
	const onInvalid = (errors) => {
		showFirstFormErrorAsToast(errors);
	};

	const onSubmit = async (values) => {
		/* ========= NORMALIZATION ========= */
		if (values.tags === TAG_IDS.BIRTHDAY) {
			const ok = await handleBirthday(values);
			if (!ok) return;
		}

		/* ========= TAG ROUTING ========= */
		switch (values.tags) {
			case TAG_IDS.LEAVE:
				await handleLeave(values);
				return;

			case TAG_IDS.TODO_LIST:
				await handleTodo(values);
				return;

			case TAG_IDS.DOCTOR_VISIT_PLAN:
				if (isEditing) {
					await handleDefaultEvent(values);
				} else if (Array.isArray(values.doctor) && values.doctor.length) {
					await handleDoctorVisitPlan(values);
				}
				return;

			default:
				await handleDefaultEvent(values);
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
										{TAGS.map((tag) => (
											<button
												key={tag.id}
												type="button"
												disabled={isEditing && tagConfig.ui?.lockTagOnEdit}
												onClick={() => field.onChange(tag.id)}
												className={`px-4 py-1 rounded-full ${field.value === tag.id
													? "bg-black text-white"
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

						{/* ================= HQ TERRITORY ================= */}
						{selectedTag === TAG_IDS.HQ_TOUR_PLAN &&
							!isEditReadOnlyField("hqTerritory") && (
								<FormField
									control={form.control}
									name="hqTerritory"
									render={({ field }) => (
										<RHFFieldWrapper label="HQ Territory">
											<RHFComboboxField  {...field} options={hqTerritoryOptions} placeholder="Select HQ Territory" />
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
											<RHFComboboxField
												{...field}
												options={doctorOptions}
												multiple={isDoctorMulti}
											/>
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
						) : (
							/* ================= NON-MEETING ================= */
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
											label={getFieldLabel("startDate", "Start Date")}
											hideTime={tagConfig.dateOnly}
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
							</div>
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
									<RHFFieldWrapper label="Visibled To">
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
						{/* ================= POB QUESTION ================= */}
						{isEditing &&
							selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN && attending === "Yes" && (
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

						{/* ================= POB ================= */}
						{isEditing &&
							selectedTag === TAG_IDS.DOCTOR_VISIT_PLAN &&
							pobGiven === "Yes" && (
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

						{/* ================= DESCRIPTION ================= */}
						{!tagConfig.hide?.includes("description") && (
							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<RHFFieldWrapper label="Description">
										<Tiptap
											content={field.value}
											onChange={field.onChange}
										/>
									</RHFFieldWrapper>
								)}
							/>
						)}
					</form>
				</Form>

				<div className="pt-4 flex mt-auto justify-end">
					<FormFooter
						isEditing={isEditing}
						disabled={form.formState.isSubmitting}
					/>
				</div>
			</ModalContent>
		</Modal>
	);
}
