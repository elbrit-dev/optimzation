import { z } from "zod";
import { differenceInCalendarDays } from "date-fns";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { TAG_IDS } from "@calendar/components/calendar/mocks";

/* =====================================================
   POB ITEM SCHEMA
===================================================== */
const pobItemSchema = z
  .object({
    item__name: z
      .union([
        z.string(),
        z.object({
          value: z.string(),
          label: z.string(),
        }),
      ])
      .transform((v) => (typeof v === "string" ? v : v.value)),

    qty: z.number().min(1),
    rate: z.number().min(0),
    amount: z.number(),
  })
  .superRefine((row, ctx) => {
    const expected = row.qty * row.rate;

    if (row.amount !== expected) {
      ctx.addIssue({
        path: ["amount"],
        message: "Amount must be qty × rate",
        code: z.ZodIssueCode.custom,
      });
    }
  });

/* =====================================================
   EVENT SCHEMA
===================================================== */
export const eventSchema = z
  .object({
    title: z.string().optional().or(z.literal("")),
    tags: z.string(),

    startDate: z.date(),
    endDate: z.date().optional(),

    description: z.string().optional(),
    color: z.string().optional(),

    employees: z.any().optional(),
    doctor: z.any().optional(),
    allocated_to:z.any().optional(),
    hqTerritory: z.string().optional(),

    allDay: z.boolean().optional(),

    /* ---------- Leave ---------- */
    leaveType: z.string().optional(),
    leavePeriod: z.enum(["Full", "Half"]).optional(),
    medicalAttachment: z.any().optional(),
    halfDayDate: z.date().optional(),
    approvedBy: z.string().optional(),

    /* ---------- Todo ---------- */
    todoStatus: z.enum(["Open", "Closed", "Cancelled"]).optional(),
    priority: z.enum(["High", "Medium", "Low"]).optional(),

    /* ---------- Doctor Visit ---------- */
    pob_given: z.enum(["Yes", "No"]).optional(),
    fsl_doctor_item: z.array(pobItemSchema).optional(),

    attending: z.enum(["Yes", "No"]).optional(),
    kly_lat_long: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const config = TAG_FORM_CONFIG[data.tags] ?? TAG_FORM_CONFIG.DEFAULT;

    /* ---------------------------------------------
       REQUIRED FIELDS (TAG CONFIG DRIVEN)
    --------------------------------------------- */
    config.required?.forEach((field) => {
      const value = data[field];

      const isEmpty =
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);

      if (isEmpty) {
        ctx.addIssue({
          path: [field],
          message: "This field is required",
          code: z.ZodIssueCode.custom,
        });
      }
    });

    /* ---------------------------------------------
       LEAVE: MEDICAL CERTIFICATE RULE
    --------------------------------------------- */
    if (
      data.tags === TAG_IDS.LEAVE &&
      data.leaveType === "Sick Leave" &&
      data.startDate &&
      data.endDate
    ) {
      const threshold =
        TAG_FORM_CONFIG.Leave?.leave?.medicalCertificateAfterDays ?? 2;

      const days =
        differenceInCalendarDays(data.endDate, data.startDate) + 1;

      if (days > threshold && !data.medicalAttachment) {
        ctx.addIssue({
          path: ["medicalAttachment"],
          message: "Medical certificate is required",
          code: z.ZodIssueCode.custom,
        });
      }
    }

    /* ---------------------------------------------
       LEAVE: HALF DAY DATE REQUIRED
    --------------------------------------------- */
    if (
      data.tags === TAG_IDS.LEAVE &&
      data.leavePeriod === "Half" &&
      !data.halfDayDate
    ) {
      ctx.addIssue({
        path: ["halfDayDate"],
        message: "Half Day Date is required",
        code: z.ZodIssueCode.custom,
      });
    }

    /* ---------------------------------------------
       DOCTOR VISIT PLAN: POB RULES
    --------------------------------------------- */
    if (data.tags === TAG_IDS.DOCTOR_VISIT_PLAN) {
      if (data.pob_given === "Yes") {
        if (!data.fsl_doctor_item || data.fsl_doctor_item.length === 0) {
          ctx.addIssue({
            path: ["fsl_doctor_item"],
            message: "At least one POB item is required",
            code: z.ZodIssueCode.custom,
          });
        }
      }

      if (data.pob_given === "No" && data.fsl_doctor_item?.length) {
        ctx.addIssue({
          path: ["fsl_doctor_item"],
          message: "POB items must be empty when POB is not given",
          code: z.ZodIssueCode.custom,
        });
      }
    }

    /* ---------------------------------------------
    DOCTOR VISIT PLAN: POB RULE
 --------------------------------------------- */
    if (
      data.tags === TAG_IDS.DOCTOR_VISIT_PLAN &&
      data.pob_given === "Yes" &&
      (!data.fsl_doctor_item || data.fsl_doctor_item.length === 0)
    ) {
      ctx.addIssue({
        path: ["fsl_doctor_item"],
        message: "At least one POB item is required",
        code: z.ZodIssueCode.custom,
      });
    }
  });
