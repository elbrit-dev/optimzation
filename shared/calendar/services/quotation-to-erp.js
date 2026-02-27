// services/quotation-to-erp.js
import { format } from "date-fns";
import { formatDateForERP } from "./event.service";

export function mapDoctorVisitToQuotation({
  values,
  doctorId,
  existingName,
}) {
  return {
    doctype: "Quotation",
    ...(existingName && { name: existingName }),

    quotation_to: "Lead",
    party_name: doctorId,
    custom_doctorvisit:doctorId,
    transaction_date: formatDateForERP(values.startDate),
    valid_till: formatDateForERP(values.endDate),
    company_address:"Elbrit Lifesciences Private Limited-Billing-22",
    order_type: "Sales",
    company: "Elbrit Lifesciences Private Limited",
    currency: "INR",
    selling_price_list: "MRP Billing",

    items: (values.fsl_doctor_item || []).map((row) => ({
      item_code:
        typeof row.item__name === "object"
          ? row.item__name.value
          : row.item__name,
      qty: Number(row.qty) || 0,
      rate: Number(row.rate) || 0,
      amount: Number(row.amount) || 0,
    })),
  };
}

// services/erp-to-quotation.js

export function mapErpQuotationToUi(node) {
    if (!node) return null;
  
    return {
      name: node.name,
      items: node.items?.map((row) => ({
        item__name: row.item_code?.name,
        qty: Number(row.qty) || 0,
        rate: Number(row.rate) || 0,
        amount: Number(row.amount) || 0,
      })) || [],
    };
  }