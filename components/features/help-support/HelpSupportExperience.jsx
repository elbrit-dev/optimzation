"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import {
  createHDTicket,
  deleteHDTicket,
  fetchHDArticleComments,
  fetchHDTicketByName,
  fetchHDTicketComments,
  fetchHDTicketCommunications,
  fetchHDTicketOptions,
  fetchHDTickets,
  fetchHDTicketsAssignedTo,
  fetchHDViews,
  fetchHelpDeskLoggedUser,
  fetchEmployeeByUser,
  fetchHelpSupportDashboard,
  saveHDArticleComment,
  saveHDTicketComment,
  saveHDTicketCommunication,
  toggleHDArticleLike,
  updateHDTicket,
} from "./graphql";

const HELP_SUPPORT_UI_CONTENT = {
  user: {},
  header: {
    searchPlaceholder: "Search articles and tickets...",
  },
  ticketForm: {
    categoryLabel: "Category",
    subjectLabel: "Subject",
    subjectPlaceholder: "What do you need help with?",
    descriptionLabel: "Description",
    descriptionPlaceholder: "Describe the issue or question",
    submitLabel: "Create ticket",
  },
};

// Knowledge base collections only their own department may browse, keyed by the HD
// Article Category label and the ERP Department label. Matching is exact on purpose:
// ERP also has an "ITF" department, which a prefix or substring test would wrongly let
// through the "IT" rule.
const DEPARTMENT_RESTRICTED_COLLECTIONS = new Map([["it", "it"]]);

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function departmentLabel(value) {
  // Department docnames carry a company suffix: "IT - ELPL" -> "IT".
  return String(value || "")
    .replace(/\s*-\s*[A-Za-z]{1,6}$/, "")
    .trim();
}

function normalizeDepartment(value) {
  return departmentLabel(value).toLowerCase();
}

function canViewCollection(categoryName, department) {
  const requiredDepartment = DEPARTMENT_RESTRICTED_COLLECTIONS.get(String(categoryName || "").trim().toLowerCase());
  if (!requiredDepartment) return true;
  return normalizeDepartment(department) === requiredDepartment;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isSameEmail(left, right) {
  const normalize = (value) => String(value || "").trim().toLowerCase();
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
}

function plainText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getTicketStatusCategory(status) {
  if (/resolved|closed/i.test(status || "")) return "Resolved";
  return "Open";
}

function isResolvedTicket(ticket) {
  return /resolved|closed/i.test(ticket?.status || "");
}

function readStoredUserEmail() {
  if (typeof window === "undefined") return "";

  const directKeys = ["email", "user_email", "userEmail", "employee_email"];
  for (const key of directKeys) {
    const value = window.localStorage.getItem(key);
    if (isEmail(value)) return value.trim();
  }

  const objectKeys = ["user", "currentUser", "authUser", "employee"];
  for (const key of objectKeys) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || "null");
      const email = value?.email || value?.user_email || value?.userEmail || value?.employee_email;
      if (isEmail(email)) return email.trim();
    } catch {
      // Ignore invalid localStorage values.
    }
  }

  return "";
}

function initials(name) {
  return String(name || "KB")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "KB";
}

function Card({ children, className = "", as: Component = "section", ...props }) {
  return (
    <Component className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)} {...props}>
      {children}
    </Component>
  );
}

function BackHeader({ title, subtitle, onBack, action }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-200 bg-white px-3 py-2 @min-[768px]:rounded-xl @min-[768px]:border @min-[768px]:px-3 @min-[768px]:shadow-sm">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-xs text-slate-800 transition hover:bg-blue-50 hover:text-[#0F87F9] @min-[768px]:h-8 @min-[768px]:w-8"
      >
        <i className="pi pi-chevron-left" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-bold text-slate-950 @min-[768px]:text-base">{title}</h2>
        {subtitle ? <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

function SectionHeader({ title, action }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{title}</h2>
      {action}
    </div>
  );
}

const TICKET_STATUS_DOTS = {
  Open: "bg-amber-500",
  Replied: "bg-blue-500",
  Paused: "bg-violet-500",
  Resolved: "bg-emerald-500",
  Closed: "bg-slate-400",
};

const TICKET_STATUS_STYLES = {
  Open: "bg-amber-50 text-amber-700 ring-amber-100",
  Replied: "bg-blue-50 text-blue-700 ring-blue-100",
  Paused: "bg-violet-50 text-violet-700 ring-violet-100",
  Resolved: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  Closed: "bg-slate-100 text-slate-600 ring-slate-200",
};

function StatusBadge({ status }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1",
        // ERP statuses are configurable, so anything unmapped still needs a readable badge.
        TICKET_STATUS_STYLES[status] || "bg-slate-100 text-slate-600 ring-slate-200"
      )}
    >
      {status || "Unknown"}
    </span>
  );
}

function SlaBadge({ value }) {
  const text = String(value ?? "").trim();
  const overdue = text.toLowerCase().includes("overdue");
  const pending = !text || /^(pending|-)$/i.test(text);

  return (
    <span
      className={cx(
        "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold",
        overdue ? "bg-red-50 text-red-600" : pending ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"
      )}
    >
      {text || "Pending"}
    </span>
  );
}

function MetricCard({ label, value, icon, onClick }) {
  const Component = onClick ? "button" : "section";

  return (
    <Card
      as={Component}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cx(
        "min-w-0 p-3 text-left",
        onClick && "transition hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#0F87F9]">
          <i className={cx(icon, "text-base")} aria-hidden />
        </div>
      </div>
    </Card>
  );
}

function MobileStatStrip({ stats }) {
  return (
    <Card className="grid grid-cols-4 divide-x divide-slate-100 px-1 py-4">
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0 px-1 text-center">
          <p className="text-xl font-black text-slate-950">{stat.value}</p>
          <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400 @min-[380px]:text-[10px] @min-[380px]:tracking-[0.14em]">
            {stat.label}
          </p>
        </div>
      ))}
    </Card>
  );
}

function TicketCard({ ticket, onOpen, compact = false }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(ticket)}
      className={cx(
        "block rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md",
        compact && "w-[260px] shrink-0 snap-start @min-[640px]:w-[280px]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{ticket.id}</p>
          <h3 className="mt-2 font-bold leading-5 text-slate-950">{ticket.title}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {ticket.category} · {ticket.updatedAtLabel || ticket.dateLabel || ticket.updatedAt || ticket.date}
          </p>
        </div>
        <StatusBadge status={ticket.status} />
      </div>
      {!compact ? <p className="mt-3 text-sm leading-6 text-slate-600">{ticket.description}</p> : null}
    </button>
  );
}

function OpenTicketsRail({ tickets, onViewAll, onOpen }) {
  return (
    <section>
      <SectionHeader
        title="My open tickets"
        action={
          <button type="button" onClick={onViewAll} className="text-sm font-bold text-[#0F87F9]">
            View tickets
          </button>
        }
      />
      <div className="flex max-w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} compact onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function CategoryCard({ category, featured = false, onOpen }) {
  const icons = {
    dcr: "pi pi-file",
    expenses: "pi pi-receipt",
    orders: "pi pi-box",
    attendance: "pi pi-calendar",
    app: "pi pi-mobile",
  };

  return (
    <Card
      as="button"
      type="button"
      onClick={() => onOpen(category)}
      className={cx("min-w-0 p-4 text-left transition hover:border-blue-200 hover:shadow-md", featured && "col-span-2")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#0F87F9] bg-blue-50 text-[#0F87F9]">
          <i className={cx(icons[category.id] || "pi pi-folder-open", "text-base")} aria-hidden />
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#0F87F9]">
          {category.count} {category.count === 1 ? "article" : "articles"}
        </span>
      </div>
      <h3 className="mt-4 text-base font-bold text-slate-950">{category.name}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{category.description}</p>
    </Card>
  );
}

function CollectionBento({ categories, onOpen }) {
  return (
    <section>
      <SectionHeader title="Browse by collection" />
      <div className="grid grid-cols-2 gap-3">
        {categories.map((category, index) => (
          <CategoryCard key={category.id} category={category} featured={index === 0} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function ArticleListItem({ article, onOpen, index }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(article)}
      className="flex w-full items-center gap-4 rounded-xl bg-white px-4 py-4 text-left shadow-sm ring-1 ring-slate-100 transition hover:ring-blue-200"
    >
      {typeof index === "number" ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-[#0F87F9]">
          {index + 1}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-5 text-slate-950">{article.title}</p>
        <p className="mt-1 text-sm text-slate-500">
          {article.category}
          {article.views ? ` · ${article.views}` : ""}
        </p>
        {article.summary ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{article.summary}</p> : null}
      </div>
      <i className="pi pi-chevron-right text-slate-400" aria-hidden />
    </button>
  );
}

function RecentlyViewed({ items, onOpen }) {
  return (
    <section>
      <SectionHeader title="Recently viewed" />
      <div className="flex max-w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-2 @min-[768px]:grid @min-[768px]:grid-cols-2 @min-[768px]:snap-none @min-[768px]:overflow-visible">
        {items.map((article) => (
          <button
            key={article.id}
            type="button"
            onClick={() => onOpen(article)}
            className="w-[240px] shrink-0 snap-start rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 @min-[640px]:w-[260px] @min-[768px]:w-auto"
          >
            <h3 className="font-bold leading-5 text-slate-950">{article.title}</h3>
            <p className="mt-3 text-sm font-medium text-slate-500">{article.category}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function TrendingList({ items, onOpen }) {
  return (
    <section>
      <SectionHeader title="Trending this week" />
      <div className="space-y-3">
        {items.map((article, index) => (
          <ArticleListItem key={article.id} article={article} index={index} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function TicketFilters({ activeFilter, setActiveFilter, counts, views = [] }) {
  if (!views.length) {
    return <p className="text-xs font-semibold text-slate-500">ERP ticket views unavailable</p>;
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {views.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={() => setActiveFilter(filter.id)}
          className={cx(
            "h-9 shrink-0 rounded-full border px-3 text-xs font-bold transition @min-[768px]:h-8",
            activeFilter === filter.id
              ? "border-[#0F87F9] bg-[#0F87F9] text-white"
              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200"
          )}
        >
          {filter.icon ? `${filter.icon} ` : ""}
          {filter.label} ({counts[filter.id] || 0})
        </button>
      ))}
    </div>
  );
}

const TICKET_FIELD_FILTERS = [
  { id: "id", label: "ID", getValue: (ticket) => ticket.id },
  { id: "title", label: "Subject", getValue: (ticket) => ticket.title },
  { id: "status", label: "Status", getValue: (ticket) => ticket.status },
  { id: "category", label: "Category", getValue: (ticket) => ticket.category },
  { id: "date", label: "Date", getValue: (ticket) => ticket.dateLabel || ticket.createdAtLabel || ticket.date || ticket.createdAt },
  { id: "assignee", label: "Assignee", getValue: (ticket) => ticket.assignee },
  { id: "employee", label: "Employee", getValue: (ticket) => ticket.employee },
];

function TicketDataTable({ tickets, onOpen, selectedIds, onToggleTicket, onToggleAll }) {
  const allSelected = tickets.length > 0 && tickets.every((ticket) => selectedIds.includes(ticket.id));
  const partlySelected = tickets.some((ticket) => selectedIds.includes(ticket.id)) && !allSelected;

  return (
    <Card className="hidden min-w-0 overflow-x-auto @min-[1024px]:block">
      <table className="w-full min-w-[1040px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
            <th className="w-8 px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(node) => {
                  if (node) node.indeterminate = partlySelected;
                }}
                onChange={onToggleAll}
                className="h-4 w-4 rounded border-slate-300 text-[#0F87F9] focus:ring-[#0F87F9]"
                aria-label="Select all tickets"
              />
            </th>
            <th className="px-3 py-2 font-semibold">ID</th>
            <th className="px-3 py-2 font-semibold">Date</th>
            <th className="px-3 py-2 font-semibold">Subject</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">First response</th>
            <th className="px-3 py-2 font-semibold">Resolution</th>
            <th className="px-3 py-2 font-semibold">Assignee</th>
            <th className="px-3 py-2 font-semibold">Employee</th>
            <th className="px-3 py-2 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              onClick={() => onOpen(ticket)}
              className="cursor-pointer hover:bg-slate-50/80"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(ticket);
                }
              }}
            >
              <td className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(ticket.id)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => onToggleTicket(ticket.id)}
                  className="h-4 w-4 rounded border-slate-300 text-[#0F87F9] focus:ring-[#0F87F9]"
                  aria-label={`Select ${ticket.id}`}
                />
              </td>
              <td className="px-3 py-2.5 font-semibold text-slate-700">{ticket.id.replace("HD-", "")}</td>
              <td className="px-3 py-2.5 text-slate-600">{ticket.dateLabel || ticket.createdAtLabel || ticket.date || ticket.createdAt || "-"}</td>
              <td className="max-w-[300px] px-3 py-2.5">
                <p className="font-semibold text-slate-950">{ticket.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">{ticket.category}</p>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <span className={cx("mr-2 inline-block h-2 w-2 rounded-full", TICKET_STATUS_DOTS[ticket.status] || "bg-slate-400")} />
                {ticket.status}
              </td>
              <td className="px-3 py-2.5">
                <SlaBadge value={ticket.firstResponse || "Pending"} />
              </td>
              <td className="px-3 py-2.5">
                <SlaBadge value={ticket.resolution || "Pending"} />
              </td>
              <td className="px-3 py-2.5 text-slate-600">{ticket.assignee || "Support"}</td>
              <td className="px-3 py-2.5 text-slate-600">{ticket.employee || "-"}</td>
              <td className="px-3 py-2.5 text-right">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(ticket);
                  }}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-[#0F87F9] hover:bg-blue-50"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function MobileTicketRow({ ticket, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(ticket)}
      className="w-full min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{ticket.id}</p>
          <h3 className="mt-1 break-words text-sm font-bold leading-5 text-slate-950">{ticket.title}</h3>
          <p className="mt-1 break-words text-xs text-slate-500">
            {ticket.category} · {ticket.dateLabel || ticket.updatedAtLabel || ticket.date || ticket.updatedAt}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={ticket.status} />
          <i className="pi pi-chevron-right text-[10px] text-slate-300" aria-hidden />
        </div>
      </div>
    </button>
  );
}

function StatusSelect({ status, onChange, statuses = [] }) {
  const statusOptions = mergeSelectedOption(statuses, status);
  const statusStyles = TICKET_STATUS_DOTS;

  return (
    <label className="inline-flex h-10 w-fit shrink-0 items-center gap-2 rounded-lg bg-slate-100 px-2 text-xs font-semibold text-slate-700 @min-[768px]:h-8">
      <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", statusStyles[status] || "bg-slate-400")} />
      <select
        value={status}
        onChange={(event) => onChange(event.target.value)}
        disabled={!statusOptions.length}
        className="h-9 rounded-md border-0 bg-transparent px-1 text-xs font-semibold outline-none @min-[768px]:h-7"
        aria-label="Change ticket status"
      >
        {statusOptions.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function toOptionNames(options) {
  return options.map((option) => (typeof option === "string" ? option : option.name)).filter(Boolean);
}

function mergeSelectedOption(options, value) {
  const names = toOptionNames(options);
  if (value && !names.includes(value)) return [value, ...names];
  return names;
}

function readTicketField(ticket, field) {
  const fieldMap = {
    name: "id",
    subject: "subject",
    ticket_type: "ticketType",
    priority: "priority",
    status: "status",
    status_category: "statusCategory",
    agent_group: "agentGroup",
    raised_by: "raisedBy",
    creation: "createdAt",
    modified: "updatedAt",
    response_by: "raw.response_by",
    resolution_by: "raw.resolution_by",
    agreement_status: "raw.agreement_status",
    last_customer_response: "raw.last_customer_response",
    last_agent_response: "raw.last_agent_response",
    sla: "raw.sla__name",
  };
  const path = fieldMap[field] || field;
  return path.split(".").reduce((value, key) => value?.[key], ticket);
}

function createTicketViewMatcher(filters = {}) {
  const entries = Array.isArray(filters)
    ? filters
        .map((filter) => {
          if (!Array.isArray(filter)) return null;
          const [field, operator, expected] = filter.length >= 4 ? filter.slice(1) : filter;
          return [field, [operator, expected]];
        })
        .filter(Boolean)
    : Object.entries(filters);
  const visibleEntries = entries.filter(
    ([field]) => !String(field).startsWith("_") && !String(field).startsWith("__") && field !== "creation"
  );
  if (!visibleEntries.length) return () => true;

  return (ticket) =>
    visibleEntries.every(([field, condition]) => {
      const value = readTicketField(ticket, field);
      const normalizedValue = String(value || "").toLowerCase();

      if (!Array.isArray(condition)) {
        return normalizedValue === String(condition || "").toLowerCase();
      }

      const [operator, expected] = condition;
      const normalizedOperator = String(operator || "").toLowerCase();
      const expectedValues = Array.isArray(expected) ? expected : String(expected || "").split(",");
      const normalizedExpected = String(expected || "").toLowerCase();
      if (normalizedOperator === "is") return expected === "set" ? Boolean(value) : !value;
      if (normalizedOperator === "like") return normalizedValue.includes(normalizedExpected.replace(/%/g, ""));
      if (normalizedOperator === "in") {
        return expectedValues.map((item) => String(item || "").trim().toLowerCase()).includes(normalizedValue);
      }
      if (normalizedOperator === "not in") {
        return !expectedValues.map((item) => String(item || "").trim().toLowerCase()).includes(normalizedValue);
      }
      if (normalizedOperator === "!=") return normalizedValue !== normalizedExpected;
      return normalizedValue === normalizedExpected;
    });
}

function FieldSelect({ label, value, options, onChange, disabled = false }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#0F87F9] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1 min-h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700">
        {value || "-"}
      </p>
    </div>
  );
}

function TicketMetaPanel({
  ticket,
  onFieldChange,
  ticketTypes = [],
  ticketPriorities = [],
  canManage = false,
  requesterDepartment = "",
}) {
  const ticketTypeOptions = mergeSelectedOption(ticketTypes, ticket.ticketType || ticket.category);
  const priorityOptions = mergeSelectedOption(ticketPriorities, ticket.priority);
  const pairedFields = [
    ["Ticket Type", "ticketType", ticket.ticketType || ticket.category || ticketTypeOptions[0] || ""],
    ["Priority", "priority", ticket.priority || priorityOptions[0] || ""],
  ];
  const owner = ticket.assignee || ticket.agentGroup || ticket.team || "Helpdesk";

  return (
    <Card className="shrink-0 p-3 @min-[1024px]:w-[300px]">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
          {owner.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-950">{owner}</p>
          <p className="text-[11px] text-slate-500">{canManage ? "Assigned to you" : "ERP assignment"}</p>
        </div>
      </div>
      {/* Requesters see their ticket's classification but cannot re-file it — only the
          person the ticket is assigned to can change type and priority. */}
      <div className="grid grid-cols-2 gap-2">
        {pairedFields.map(([label, field, value]) =>
          canManage ? (
            <FieldSelect
              key={field}
              label={label}
              value={value}
              options={field === "ticketType" ? ticketTypeOptions : priorityOptions}
              disabled={field === "ticketType" ? !ticketTypeOptions.length : !priorityOptions.length}
              onChange={(nextValue) => onFieldChange(ticket.id, field, nextValue)}
            />
          ) : (
            <ReadOnlyField key={field} label={label} value={value} />
          )
        )}
      </div>
      <div className="mt-3 grid gap-2">
        <ReadOnlyField label={canManage ? "Raised by" : "Employee"} value={ticket.employee} />
        {/* The requester's own department, looked up from their Employee record. The HD
            Team field it replaced read "Unassigned team" on every ticket, because
            agent_group is never set on tickets raised here. */}
        <ReadOnlyField label="Department" value={requesterDepartment} />
        {ticket.agentGroup ? <ReadOnlyField label="Team" value={ticket.team} /> : null}
        <ReadOnlyField label="Assignee" value={ticket.assignee} />
      </div>
    </Card>
  );
}

function TicketsPanel({ tickets, onOpen, activeFilter, setActiveFilter, counts, views, onCreate, onDeleteTickets, fill = false, isLoading = false }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [filterField, setFilterField] = useState("title");
  const [filterValue, setFilterValue] = useState("");

  const fieldConfig = TICKET_FIELD_FILTERS.find((field) => field.id === filterField) || TICKET_FIELD_FILTERS[1];
  const filteredTickets = useMemo(() => {
    const normalized = filterValue.trim().toLowerCase();
    if (!normalized) return tickets;
    return tickets.filter((ticket) => String(fieldConfig.getValue(ticket) || "").toLowerCase().includes(normalized));
  }, [fieldConfig, filterValue, tickets]);

  const visibleSelectedIds = selectedIds.filter((id) => filteredTickets.some((ticket) => ticket.id === id));
  const toggleTicket = (ticketId) => {
    setSelectedIds((current) => (current.includes(ticketId) ? current.filter((id) => id !== ticketId) : [...current, ticketId]));
  };
  const toggleAll = () => {
    const allVisibleSelected = filteredTickets.length > 0 && filteredTickets.every((ticket) => selectedIds.includes(ticket.id));
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !filteredTickets.some((ticket) => ticket.id === id));
      }
      return Array.from(new Set([...current, ...filteredTickets.map((ticket) => ticket.id)]));
    });
  };
  const deleteSelected = () => {
    if (!visibleSelectedIds.length) return;
    onDeleteTickets(visibleSelectedIds);
    setSelectedIds((current) => current.filter((id) => !visibleSelectedIds.includes(id)));
  };

  return (
    <section className={cx("flex min-w-0 flex-col gap-2 text-[13px]", fill ? "h-full min-h-0 flex-1 overflow-hidden" : "shrink-0 overflow-visible")}>
      <div className="shrink-0 flex flex-col gap-2 border-b border-slate-200 bg-white/80 py-2 @min-[768px]:rounded-xl @min-[768px]:border @min-[768px]:px-3 @min-[768px]:shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="text-[15px] font-bold text-slate-950">Tickets</h2>
            <span className="text-sm text-slate-400">/</span>
            <span className="text-xs font-semibold text-slate-600">List</span>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 text-[13px] font-bold text-white hover:bg-slate-800 @min-[768px]:h-8"
          >
            <i className="pi pi-plus" aria-hidden />
            Create
          </button>
        </div>
        <div className="grid gap-3 @min-[1280px]:grid-cols-[1fr_auto] @min-[1280px]:items-center">
          <TicketFilters activeFilter={activeFilter} setActiveFilter={setActiveFilter} counts={counts} views={views} />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-slate-100 p-1 @min-[768px]:flex-none">
              <i className="pi pi-filter ml-2 text-xs text-slate-500" aria-hidden />
              <select
                value={filterField}
                onChange={(event) => setFilterField(event.target.value)}
                className="h-9 rounded-md border-0 bg-white px-2 text-xs font-semibold text-slate-700 outline-none @min-[768px]:h-7"
              >
                {TICKET_FIELD_FILTERS.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
              <input
                value={filterValue}
                onChange={(event) => setFilterValue(event.target.value)}
                placeholder={`Filter by ${fieldConfig.label}`}
                className="h-9 min-w-[90px] flex-1 rounded-md border-0 bg-white px-2 text-xs outline-none placeholder:text-slate-400 @min-[768px]:h-7 @min-[768px]:w-40"
              />
            </div>
            {visibleSelectedIds.length ? (
              <button
                type="button"
                onClick={deleteSelected}
                className="h-10 shrink-0 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 hover:bg-red-100 @min-[768px]:h-8"
              >
                Delete ({visibleSelectedIds.length})
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cx("min-w-0", fill ? "min-h-0 flex-1 overflow-auto" : "overflow-visible")}>
        {isLoading ? (
          <LoadingRows rows={4} />
        ) : filteredTickets.length ? (
          <>
          <TicketDataTable
            tickets={filteredTickets}
            onOpen={onOpen}
            selectedIds={selectedIds}
            onToggleTicket={toggleTicket}
            onToggleAll={toggleAll}
          />
          <div className="grid gap-2 @min-[1024px]:hidden">
            {filteredTickets.map((ticket) => (
              <MobileTicketRow
                key={ticket.id}
                ticket={ticket}
                onOpen={onOpen}
              />
            ))}
          </div>
          </>
        ) : (
          <EmptyState icon="pi pi-comments" message="No tickets match your search and filter." />
        )}
      </div>
    </section>
  );
}

function CreateTicketForm({ content, onSubmit, onCancel, ticketTypes = [], user }) {
  const ticketTypeOptions = useMemo(() => toOptionNames(ticketTypes), [ticketTypes]);
  const sessionEmail = useMemo(
    () => [user?.email, user?.username, content.user?.email, content.user?.username].find(isEmail) || "",
    [user?.email, user?.username, content.user?.email, content.user?.username]
  );
  const [ticketType, setTicketType] = useState("");
  const [subject, setSubject] = useState("");
  const [raisedBy, setRaisedBy] = useState(sessionEmail);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = ticketType && subject.trim() && isEmail(raisedBy) && description.trim() && !isSubmitting;

  useEffect(() => {
    if (sessionEmail) {
      setRaisedBy(sessionEmail);
      return;
    }
    setRaisedBy((current) => {
      if (isEmail(current)) return current;
      const storedEmail = readStoredUserEmail();
      return storedEmail || current;
    });
  }, [sessionEmail]);

  useEffect(() => {
    if (!ticketTypeOptions.length) {
      setTicketType("");
      return;
    }
    setTicketType((current) => (ticketTypeOptions.includes(current) ? current : ticketTypeOptions[0]));
  }, [ticketTypeOptions]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const result = await onSubmit({
        ticketType,
        subject: subject.trim(),
        raisedBy: raisedBy.trim(),
        description: description.trim(),
      });
      if (result === false) return;
      setSubject("");
      setDescription("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="p-4 @min-[768px]:p-5">
      <form onSubmit={submit} className="grid gap-4">
        <div className="flex w-full min-w-0 flex-col gap-4">
          <fieldset className="min-w-0">
            <legend className="mb-2 block text-sm font-semibold text-slate-700">{content.ticketForm.categoryLabel}</legend>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
              {ticketTypeOptions.map((type) => {
                const selected = ticketType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTicketType(type)}
                    className={cx(
                      "min-h-11 shrink-0 rounded-lg border px-3 py-2 text-xs font-bold transition @min-[768px]:px-4 @min-[768px]:text-sm",
                      selected
                        ? "border-[#0F87F9] bg-[#0F87F9] text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-950 hover:border-blue-200 hover:bg-blue-50"
                    )}
                  >
                    {type}
                  </button>
                );
              })}
              {!ticketTypeOptions.length ? (
                <p className="text-xs font-semibold text-slate-500">Ticket types are loading from ERP.</p>
              ) : null}
            </div>
          </fieldset>
          <label className="min-w-0">
            <span className="mb-2 block text-sm font-semibold text-slate-700">{content.ticketForm.subjectLabel}</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={content.ticketForm.subjectPlaceholder}
              className="h-11 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-base outline-none focus:border-[#0F87F9] focus:ring-4 focus:ring-blue-100 @min-[768px]:text-sm"
            />
          </label>
          <div className="min-w-0">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Raised by email</span>
            {isEmail(raisedBy) ? (
              <div className="flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                <i className="pi pi-user text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-semibold">{raisedBy}</span>
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#0F87F9]">
                  Signed in
                </span>
              </div>
            ) : (
              <input
                type="email"
                value={raisedBy}
                onChange={(event) => setRaisedBy(event.target.value)}
                placeholder="name@elbrit.org"
                className="h-11 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-base outline-none focus:border-[#0F87F9] focus:ring-4 focus:ring-blue-100 @min-[768px]:text-sm"
                required
              />
            )}
            <p className="mt-1.5 text-[11px] text-slate-500">
              {isEmail(raisedBy)
                ? "Taken from your ERP session — no need to fill it in."
                : "We could not detect your ERP account, so please enter your email."}
            </p>
          </div>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">{content.ticketForm.descriptionLabel}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={content.ticketForm.descriptionPlaceholder}
            rows={5}
            className="w-full resize-y rounded-lg border border-slate-200 p-3 text-base outline-none focus:border-[#0F87F9] focus:ring-4 focus:ring-blue-100 @min-[768px]:text-sm"
          />
        </label>
        <div className="flex flex-col-reverse gap-2 @min-[640px]:flex-row @min-[640px]:items-center @min-[640px]:justify-end @min-[640px]:gap-3">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 @min-[640px]:h-10 @min-[640px]:w-auto"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0F87F9] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-600 disabled:bg-blue-200 @min-[640px]:h-10 @min-[640px]:w-auto"
          >
            <i className="pi pi-plus" aria-hidden />
            {isSubmitting ? "Submitting..." : content.ticketForm.submitLabel}
          </button>
        </div>
      </form>
    </Card>
  );
}

function TicketConversation({
  ticket,
  onBack,
  onStatusChange,
  onFieldChange,
  graphqlConfig,
  user,
  ticketTypes,
  ticketPriorities,
  ticketStatuses,
  canManage = false,
  isRequester = false,
}) {
  const [comment, setComment] = useState("");
  const [replies, setReplies] = useState([]);
  const [notes, setNotes] = useState([]);
  const [requesterEmployee, setRequesterEmployee] = useState(null);
  // Agents choose the channel; requesters only ever have the public one.
  const [channel, setChannel] = useState("reply");
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const activeChannel = canManage ? channel : "reply";
  const canSend = comment.trim() && !isSavingComment;
  const commentUser = useMemo(() => {
    const storedEmail = readStoredUserEmail();
    const email = user?.email || user?.username || storedEmail || "";
    return {
      ...user,
      email,
      username: user?.username || email,
      name: user?.name || email,
    };
  }, [user?.email, user?.username, user?.name]);

  useEffect(() => {
    let active = true;
    setReplies([]);
    setNotes([]);
    setRequesterEmployee(null);
    setComment("");
    setChannel("reply");
    if (!ticket?.id || !ticket.raw) return undefined;

    setIsLoadingComments(true);
    // Internal notes are only ever fetched for the assignee — a requester must not be
    // able to read the agents' private channel, not even in the network payload.
    Promise.all([
      fetchHDTicketCommunications(ticket.id, graphqlConfig, commentUser),
      canManage ? fetchHDTicketComments(ticket.id, graphqlConfig, commentUser) : Promise.resolve([]),
      // Caught locally: plenty of requesters (external senders, shared mailboxes) have
      // no Employee record, and that must not take the conversation down with it.
      ticket.raisedBy
        ? fetchEmployeeByUser(ticket.raisedBy, graphqlConfig).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([communicationItems, noteItems, employee]) => {
        if (!active) return;
        setReplies(communicationItems);
        setNotes(noteItems);
        setRequesterEmployee(employee);
      })
      .catch((error) => {
        if (active) {
          toast.error("Could not load the ticket conversation", {
            description: error?.message || "Please check ERP access.",
          });
        }
      })
      .finally(() => {
        if (active) setIsLoadingComments(false);
      });

    return () => {
      active = false;
    };
  }, [ticket?.id, ticket?.raw, ticket?.raisedBy, graphqlConfig, commentUser, canManage]);

  const conversation = useMemo(() => {
    // A ticket raised by email stores its opening message twice — once as the ticket
    // description and again as the first Communication — so drop the description copy
    // when a reply already carries the same text.
    const replyTexts = new Set(replies.map((item) => plainText(item.message)));
    const opening = (ticket.conversation || []).filter((item) => !replyTexts.has(plainText(item.message)));

    return [...opening, ...replies, ...notes].sort(
      (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
    );
  }, [ticket.conversation, replies, notes]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSend) return;
    const nextComment = comment.trim();
    const isNote = activeChannel === "note";
    setIsSavingComment(true);
    try {
      const name = isNote
        ? await saveHDTicketComment(ticket.id, nextComment, { graphqlConfig, user: commentUser })
        : await saveHDTicketCommunication(ticket.id, nextComment, {
            graphqlConfig,
            user: commentUser,
            fromAgent: canManage,
            subject: ticket.title,
            recipients: ticket.raisedBy || ticket.employee,
          });
      const optimisticMessage = {
        id: name || `msg-${ticket.id}-${Date.now()}`,
        author: commentUser.name || commentUser.email || "You",
        role: isNote ? "Internal note" : canManage ? "Support" : "Requester",
        time: "Just now",
        timestamp: new Date().toISOString(),
        tone: "user",
        message: nextComment,
        channel: isNote ? "note" : "reply",
      };
      if (isNote) setNotes((current) => [...current, optimisticMessage]);
      else setReplies((current) => [...current, optimisticMessage]);
      setComment("");
      toast.success(isNote ? "Internal note added" : "Reply sent");
    } catch (error) {
      toast.error(isNote ? "Could not save the internal note" : "Could not send the reply", {
        description: error?.message || "Please check ERP access.",
      });
    } finally {
      setIsSavingComment(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-slate-50 text-[13px]">
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 @min-[768px]:rounded-xl @min-[768px]:border @min-[768px]:px-4 @min-[768px]:shadow-sm">
        <div className="flex flex-col gap-2 @min-[1024px]:flex-row @min-[1024px]:items-start @min-[1024px]:justify-between">
          <div className="flex min-w-0 items-start gap-2.5">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-xs text-slate-800 transition hover:bg-blue-50 hover:text-[#0F87F9] @min-[768px]:h-8 @min-[768px]:w-8"
            >
              <i className="pi pi-chevron-left" aria-hidden />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold text-slate-500">Tickets / {ticket.id}</p>
                {canManage || isRequester ? (
                  <span
                    className={cx(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      canManage ? "bg-blue-50 text-[#0F87F9]" : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {canManage ? "Assigned to you" : "You raised this"}
                  </span>
                ) : null}
              </div>
              <h2 className="truncate text-sm font-bold text-slate-950 @min-[768px]:text-base">{ticket.title}</h2>
              <p className="mt-0.5 text-[11px] text-slate-500 @min-[768px]:text-xs">
                Created {ticket.createdAtLabel || ticket.dateLabel || ticket.createdAt || ticket.date || "Just now"} · {ticket.category}
              </p>
            </div>
          </div>
          {/* Only the assignee drives the ticket's state; a requester sees where it stands. */}
          {canManage ? (
            <StatusSelect status={ticket.status} statuses={ticketStatuses} onChange={(status) => onStatusChange(ticket.id, status)} />
          ) : (
            <div className="flex h-10 shrink-0 items-center @min-[768px]:h-8">
              <StatusBadge status={ticket.status} />
            </div>
          )}
        </div>
        {/* SlaBadge already greens a met target and reds an overdue one — the previous
            hardcoded red made every ticket look breached. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] @min-[768px]:text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
            First response
            <SlaBadge value={ticket.firstResponse} />
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
            Resolution
            <SlaBadge value={ticket.resolution} />
          </span>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 @min-[1024px]:grid-cols-[minmax(0,1fr)_300px] @min-[1024px]:overflow-hidden">
        <div className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100 @min-[1024px]:min-h-0">
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            {isLoadingComments ? <p className="text-xs font-semibold text-slate-500">Loading conversation...</p> : null}
            {!isLoadingComments && !conversation.length ? (
              <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-300 shadow-sm">
                  <i className="pi pi-comments" aria-hidden />
                </span>
                <p className="mt-2 text-xs font-medium text-slate-500">No messages on this ticket yet.</p>
              </div>
            ) : null}
            {conversation.map((message) => {
              const isNote = message.channel === "note";
              const richContent = Boolean(message.isHtml);
              // Alignment follows the sender, not the content type. Previously any HTML
              // message fell back to a full-width left card, so an inbound email and the
              // reader's own reply were indistinguishable.
              const own = message.tone === "user" && !isNote;
              return (
                <div key={message.id} className={cx("flex w-full gap-2", own ? "flex-row-reverse" : "flex-row")}>
                  <span
                    className={cx(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black",
                      isNote
                        ? "bg-amber-100 text-amber-700"
                        : own
                          ? "bg-blue-100 text-[#0F87F9]"
                          : "bg-slate-200 text-slate-600"
                    )}
                    aria-hidden
                  >
                    {isNote ? <i className="pi pi-lock text-[9px]" /> : initials(message.author)}
                  </span>
                  <div
                    className={cx(
                      "flex min-w-0 flex-1 flex-col @min-[640px]:max-w-[680px] @min-[640px]:flex-none",
                      own ? "items-end" : "items-start"
                    )}
                  >
                    {isNote ? (
                      <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        <i className="pi pi-lock text-[9px]" aria-hidden />
                        Internal note — not visible to the requester
                      </span>
                    ) : null}
                    <div
                      className={cx(
                        "max-w-full overflow-hidden break-words rounded-xl px-3 py-2 text-xs leading-5 [&_a]:break-all [&_a]:underline [&_br]:block [&_img]:my-2 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_video]:my-2 [&_video]:block [&_video]:h-auto [&_video]:max-w-full",
                        richContent && "w-full",
                        isNote
                          ? "border border-amber-200 bg-amber-50 text-slate-900"
                          : own && !richContent
                            ? "bg-[#0F87F9] text-white"
                            : "border border-slate-200 bg-white text-slate-950 shadow-sm"
                      )}
                    >
                      {message.isHtml ? <div dangerouslySetInnerHTML={{ __html: message.message }} /> : message.message}
                    </div>
                    <p
                      className={cx(
                        "mt-1 truncate text-[11px] font-medium text-slate-500",
                        own ? "text-right" : "text-left"
                      )}
                    >
                      {message.author} · {message.role} · {message.time}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={submit} className="border-t border-slate-200 bg-white p-2.5">
            {canManage ? (
              <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1">
                {[
                  { id: "reply", label: "Reply to requester", icon: "pi pi-send" },
                  { id: "note", label: "Internal note", icon: "pi pi-lock" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setChannel(option.id)}
                    className={cx(
                      "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[11px] font-bold transition",
                      activeChannel === option.id
                        ? option.id === "note"
                          ? "bg-amber-100 text-amber-800 shadow-sm"
                          : "bg-white text-[#0F87F9] shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    <i className={cx(option.icon, "text-[10px]")} aria-hidden />
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={activeChannel === "note" ? "Add an internal note..." : "Write a reply..."}
                className={cx(
                  "h-11 min-w-0 flex-1 rounded-lg border px-3 text-base outline-none focus:ring-2 @min-[768px]:h-9 @min-[768px]:text-xs",
                  activeChannel === "note"
                    ? "border-amber-200 bg-amber-50 focus:border-amber-400 focus:ring-amber-100"
                    : "border-slate-200 focus:border-[#0F87F9] focus:ring-blue-100"
                )}
              />
              <button
                type="submit"
                disabled={!canSend}
                className={cx(
                  "inline-flex h-11 shrink-0 items-center justify-center rounded-lg px-4 text-xs font-bold text-white @min-[768px]:h-9 @min-[768px]:px-3",
                  activeChannel === "note"
                    ? "bg-amber-600 hover:bg-amber-700 disabled:bg-amber-200"
                    : "bg-[#0F87F9] disabled:bg-blue-200"
                )}
              >
                {isSavingComment ? "Sending..." : activeChannel === "note" ? "Add note" : "Send"}
              </button>
            </div>
          </form>
        </div>
        <TicketMetaPanel
          ticket={ticket}
          onFieldChange={onFieldChange}
          ticketTypes={ticketTypes}
          ticketPriorities={ticketPriorities}
          canManage={canManage}
          requesterDepartment={departmentLabel(requesterEmployee?.department)}
        />
      </div>
    </section>
  );
}

function CollectionView({ category, articles, onBack, onArticle }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <BackHeader title={category.name} subtitle={category.description} onBack={onBack} />
      {articles.length ? (
        <div className="grid gap-3 @min-[1280px]:grid-cols-2">
          {articles.map((article) => (
            <ArticleListItem key={article.id} article={article} onOpen={onArticle} />
          ))}
        </div>
      ) : (
        <EmptyState message="No articles match your search in this collection." />
      )}
    </div>
  );
}

function ArticlesResultView({ title, subtitle, articles, onBack, onArticle }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <BackHeader title={title} subtitle={subtitle} onBack={onBack} />
      {articles.length ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-3 @min-[1280px]:grid-cols-2">
            {articles.map((article) => (
              <ArticleListItem key={article.id} article={article} onOpen={onArticle} />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState message="No articles match your search." />
      )}
    </div>
  );
}

function ArticleView({ article, onBack, graphqlConfig, user }) {
  const [liked, setLiked] = useState(false);
  const [isSavingLike, setIsSavingLike] = useState(false);
  const [answer, setAnswer] = useState("");
  const [comments, setComments] = useState(article.comments || []);
  const [comment, setComment] = useState("");
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const likeCount = (article.likeCount || 0) + (liked ? 1 : 0);

  useEffect(() => {
    setLiked(false);
    setAnswer("");
    setComments(article.comments || []);
    setComment("");
  }, [article.id, article.comments]);

  useEffect(() => {
    let active = true;
    setIsLoadingComments(true);
    fetchHDArticleComments(article.id, graphqlConfig)
      .then((items) => {
        if (active) setComments(items);
      })
      .catch((error) => {
        if (active) {
          toast.error("Could not load article comments", {
            description: error?.message || "Please check ERP access.",
          });
        }
      })
      .finally(() => {
        if (active) setIsLoadingComments(false);
      });
    return () => {
      active = false;
    };
  }, [article.id, graphqlConfig]);

  const shareArticle = async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.href : article.title;
    const shareData = { title: article.title, text: article.summary, url: shareUrl };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Article link copied");
      }
    } catch {
      // Ignore cancelled native share sheets.
    }
  };

  const toggleLike = async () => {
    const nextLiked = !liked;
    setLiked(nextLiked);
    setIsSavingLike(true);
    try {
      await toggleHDArticleLike(article.id, nextLiked, graphqlConfig);
    } catch (error) {
      setLiked(!nextLiked);
      toast.error("Could not update like", {
        description: error?.message || "Please check ERP access.",
      });
    } finally {
      setIsSavingLike(false);
    }
  };

  const submitComment = async (event) => {
    event.preventDefault();
    if (!comment.trim()) return;
    const nextComment = comment.trim();
    setIsSavingComment(true);
    try {
      const name = await saveHDArticleComment(article.id, nextComment, { graphqlConfig, user });
      setComments((current) => [
        {
          id: name || `${article.id}-${Date.now()}`,
          author: user?.name || user?.email || "You",
          time: "Just now",
          body: nextComment,
        },
        ...current,
      ]);
      setComment("");
      toast.success("Comment added");
    } catch (error) {
      toast.error("Could not save comment", {
        description: error?.message || "Please check ERP access.",
      });
    } finally {
      setIsSavingComment(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <BackHeader title={article.title} subtitle={`${article.category} · ${article.updatedAtLabel || article.publishedOnLabel || "Knowledge base"}`} onBack={onBack} />
      <Card className="min-h-0 flex-1 overflow-y-auto p-4 @min-[768px]:p-5">
        <div className="flex flex-col gap-3 @min-[768px]:flex-row @min-[768px]:items-start @min-[768px]:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0F87F9]">{article.category}</p>
            <h2 className="mt-2 text-lg font-bold leading-tight text-slate-950 @min-[768px]:text-xl">{article.title}</h2>
            {article.author ? (
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-[11px] font-black text-[#0F87F9]">
                  {initials(article.author)}
                </span>
                <span>{article.author}</span>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <span className="inline-flex h-8 items-center rounded-full bg-blue-50 px-3 text-xs font-bold text-[#0F87F9]">
              {article.views}
            </span>
            <button
              type="button"
              onClick={toggleLike}
              disabled={isSavingLike}
              className={cx(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition",
                liked ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-[#0F87F9]"
              )}
            >
              <i className={liked ? "pi pi-heart-fill" : "pi pi-heart"} aria-hidden />
              {likeCount}
            </button>
            <button
              type="button"
              onClick={shareArticle}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-slate-100 px-3 text-xs font-bold text-slate-700 transition hover:bg-blue-50 hover:text-[#0F87F9]"
            >
              <i className="pi pi-share-alt" aria-hidden />
              Share
            </button>
          </div>
        </div>
        <div
          className="mt-4 max-w-none break-words rounded-xl bg-slate-50 p-3 text-[13px] leading-6 text-slate-700 [&_a]:break-words [&_a]:text-[#0F87F9] [&_code]:rounded [&_code]:bg-slate-200 [&_code]:px-1 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-bold [&_img]:mx-auto [&_img]:my-3 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_li]:ml-4 [&_li]:list-disc [&_ol>li]:list-decimal [&_p]:mb-2.5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-100 [&_pre]:p-3 [&_strong]:font-bold [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_video]:mx-auto [&_video]:my-3 [&_video]:block [&_video]:h-auto [&_video]:max-w-full @min-[768px]:p-4"
          dangerouslySetInnerHTML={{ __html: article.content || article.summary || "" }}
        />
        <div className="mt-4 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100 @min-[768px]:p-4">
          {answer ? (
            <p className="rounded-xl bg-blue-50 px-3 py-3 text-center text-sm font-bold text-[#0F87F9]">
              {answer === "yes" ? "Marked as solved." : "Thanks for the feedback."}
            </p>
          ) : (
            <div className="flex flex-col gap-3 @min-[640px]:flex-row @min-[640px]:items-center @min-[640px]:justify-between">
              <p className="text-sm font-bold text-slate-950">Did this answer your question?</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAnswer("yes")} className="h-9 rounded-full border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-blue-50">
                  Yes
                </button>
                <button type="button" onClick={() => setAnswer("no")} className="h-9 rounded-full border border-slate-200 px-5 text-sm font-bold text-slate-700 hover:bg-blue-50">
                  No
                </button>
              </div>
            </div>
          )}
        </div>
        <section className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Comments ({comments.length})</h3>
          <form onSubmit={submitComment} className="mt-3 flex gap-2">
            <input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add a comment..."
              className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-base outline-none focus:border-[#0F87F9] focus:ring-2 focus:ring-blue-100 @min-[768px]:h-10 @min-[768px]:text-sm"
            />
            <button
              type="submit"
              disabled={!comment.trim() || isSavingComment}
              className="h-11 shrink-0 rounded-lg bg-[#0F87F9] px-4 text-sm font-bold text-white disabled:bg-blue-200 @min-[768px]:h-10"
            >
              {isSavingComment ? "Posting..." : "Post"}
            </button>
          </form>
          <div className="mt-3 space-y-2">
            {isLoadingComments ? <p className="text-sm font-medium text-slate-500">Loading comments...</p> : null}
            {comments.map((item) => (
              <div key={item.id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <p className="font-bold text-slate-950">{item.author}</p>
                  <p className="text-slate-400">{item.time}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      </Card>
    </div>
  );
}

function EmptyState({ message, icon = "pi pi-inbox" }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 px-5 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-slate-300">
        <i className={cx(icon, "text-lg")} aria-hidden />
      </span>
      <p className="mt-3 max-w-sm text-sm font-medium text-slate-500">{message}</p>
    </div>
  );
}

function LoadingRows({ rows = 3 }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading help desk content</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-2.5 w-20 rounded-full bg-slate-100" />
          <div className="mt-3 h-3.5 w-3/4 rounded-full bg-slate-100" />
          <div className="mt-2 h-2.5 w-1/2 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function MobileTabs({ activeTab, onSelect, ticketCount }) {
  const tabs = [
    { id: "dashboard", label: "Articles", icon: "pi pi-book" },
    { id: "raise", label: "Raise ticket", icon: "pi pi-plus-circle" },
    { id: "tickets", label: "My tickets", icon: "pi pi-comments", badge: ticketCount },
  ];

  return (
    <nav className="w-full rounded-none border-t border-slate-200 bg-white px-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] pt-1 shadow-[0_-6px_18px_rgba(20,25,31,0.08)]">
      <div className="grid grid-cols-3 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={cx(
              "relative flex min-h-[42px] flex-col items-center justify-center rounded-xl text-[11px] font-bold transition",
              activeTab === tab.id ? "bg-blue-50 text-[#0F87F9]" : "text-slate-500"
            )}
          >
            <i className={cx(tab.icon, "mb-0.5 text-sm")} aria-hidden />
            {tab.label}
            {tab.badge ? (
              <span className="absolute right-4 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] text-white">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}

export default function HelpSupportExperience({
  content = HELP_SUPPORT_UI_CONTENT,
  url = "",
  token = "",
  graphqlEndpoint = "",
  authToken = "",
  className = "",
  style,
}) {
  const uiContent = {
    ...HELP_SUPPORT_UI_CONTENT,
    ...content,
    user: { ...HELP_SUPPORT_UI_CONTENT.user, ...(content.user || {}) },
    header: { ...HELP_SUPPORT_UI_CONTENT.header, ...(content.header || {}) },
    ticketForm: { ...HELP_SUPPORT_UI_CONTENT.ticketForm, ...(content.ticketForm || {}) },
  };
  const [query, setQuery] = useState("");
  const [view, setView] = useState({ type: "home" });
  const [ticketFilter, setTicketFilter] = useState("");
  const [tickets, setTickets] = useState([]);
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [ticketPriorities, setTicketPriorities] = useState([]);
  const [ticketStatuses, setTicketStatuses] = useState([]);
  const [ticketViews, setTicketViews] = useState([]);
  const [erpUser, setErpUser] = useState("");
  const [erpDepartment, setErpDepartment] = useState("");
  // Tickets allocated to the signed-in user. Membership here is what switches a ticket
  // from the requester view to the agent view.
  const [assignedTicketIds, setAssignedTicketIds] = useState(() => new Set());
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const effectiveUrl = url || graphqlEndpoint;
  const effectiveToken = token || authToken;
  const graphqlConfig = useMemo(
    () => ({
      endpointUrl: effectiveUrl,
      authToken: effectiveToken,
    }),
    [effectiveUrl, effectiveToken]
  );

  useEffect(() => {
    let active = true;
    setIsLoadingContent(true);
    if (!effectiveUrl || !effectiveToken) {
      setTickets([]);
      setArticles([]);
      setCategories([]);
      setTicketTypes([]);
      setTicketPriorities([]);
      setTicketStatuses([]);
      setTicketViews([]);
      setErpUser("");
      setErpDepartment("");
      setAssignedTicketIds(new Set());
      setTicketFilter("");
      setIsLoadingContent(false);
      return undefined;
    }

    // The signed-in identity has to resolve before tickets are fetched: it becomes the
    // raised_by filter that scopes the list to the token holder's own tickets. Without
    // it we fetch none rather than falling back to every ticket the token can read.
    fetchHelpDeskLoggedUser(graphqlConfig)
      .catch((error) => {
        if (active) {
          toast.error("Could not identify your ERP session", {
            description: error?.message || "Tickets stay hidden until your account is known.",
          });
        }
        return "";
      })
      .then((loggedUser) => {
        if (!active) return null;
        setErpUser(loggedUser || "");

        return Promise.allSettled([
          fetchHelpSupportDashboard({
            fetchTickets: loggedUser ? fetchHDTickets : null,
            ticketFilters: loggedUser ? [{ fieldname: "raised_by", operator: "EQ", value: loggedUser }] : null,
            graphqlConfig,
          }),
          fetchHDTicketOptions({ graphqlConfig }),
          fetchHDViews({ graphqlConfig }),
          loggedUser ? fetchEmployeeByUser(loggedUser, graphqlConfig) : Promise.resolve(null),
          loggedUser ? fetchHDTicketsAssignedTo(loggedUser, graphqlConfig) : Promise.resolve([]),
        ]);
      })
      .then((results) => {
        if (!active || !results) return;
        const [contentResult, optionsResult, viewsResult, employeeResult, assignedResult] = results;

        // Only a confirmed Active employee record unlocks a restricted collection.
        // Anything else — lookup failed, no employee record, or they have left — leaves
        // the department empty, which hides those collections.
        const employee = employeeResult.status === "fulfilled" ? employeeResult.value : null;
        setErpDepartment(employee?.status === "Active" ? employee.department || "" : "");

        const assignedTickets = assignedResult.status === "fulfilled" ? assignedResult.value : [];
        setAssignedTicketIds(new Set(assignedTickets.map((ticket) => ticket.id)));

        const raisedTickets = contentResult.status === "fulfilled" ? contentResult.value.tickets : [];
        // Union of "raised by me" and "assigned to me", newest first. A ticket can be
        // both, so the raised copy wins and the assigned copy is only a fallback.
        const mergedTickets = new Map(assignedTickets.map((ticket) => [ticket.id, ticket]));
        raisedTickets.forEach((ticket) => mergedTickets.set(ticket.id, ticket));
        setTickets(
          Array.from(mergedTickets.values()).sort(
            (a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0)
          )
        );

        if (contentResult.status === "fulfilled") {
          setArticles(contentResult.value.articles);
          setCategories(contentResult.value.categories);
        } else {
          setArticles([]);
          setCategories([]);
          toast.error("Could not load help desk content", {
            description: contentResult.reason?.message || "Please check the ERP GraphQL configuration.",
          });
        }

        if (optionsResult.status === "fulfilled") {
          setTicketTypes(optionsResult.value.ticketTypes);
          setTicketPriorities(optionsResult.value.priorities);
          setTicketStatuses(optionsResult.value.statuses);
        } else {
          setTicketTypes([]);
          setTicketPriorities([]);
          setTicketStatuses([]);
          toast.error("Could not load ticket options", {
            description: optionsResult.reason?.message || "Please check ERP access.",
          });
        }

        const views = viewsResult.status === "fulfilled" ? viewsResult.value : [];
        if (viewsResult.status === "rejected") {
          toast.error("Could not load ERP ticket views", {
            description: viewsResult.reason?.message || "Please check ERP access.",
          });
        }
        setTicketViews(views);
        setTicketFilter((current) => {
          if (views.some((viewItem) => viewItem.id === current)) return current;
          return views.find((viewItem) => viewItem.isDefault)?.id || views[0]?.id || "";
        });
      })
      .finally(() => {
        if (active) setIsLoadingContent(false);
      });

    return () => {
      active = false;
    };
  }, [effectiveUrl, effectiveToken, graphqlConfig]);

  const supportUser = useMemo(() => {
    const email = uiContent.user?.email || uiContent.user?.username || erpUser || "";
    return {
      ...uiContent.user,
      email,
      username: uiContent.user?.username || email,
      name: uiContent.user?.name || email,
    };
  }, [uiContent.user?.email, uiContent.user?.username, uiContent.user?.name, erpUser]);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (text) => !normalizedQuery || String(text).toLowerCase().includes(normalizedQuery);

  // Department gate. Everything downstream — counts, search, collection view, the
  // article lookup behind the article route — derives from these, so a restricted
  // collection cannot be reached by any path once it is filtered out here.
  const restrictedCategoryIds = useMemo(
    () =>
      new Set(
        categories.filter((category) => !canViewCollection(category.name, erpDepartment)).map((category) => category.id)
      ),
    [categories, erpDepartment]
  );
  const visibleCategories = useMemo(
    () => categories.filter((category) => !restrictedCategoryIds.has(category.id)),
    [categories, restrictedCategoryIds]
  );
  const visibleArticles = useMemo(
    () => articles.filter((article) => !restrictedCategoryIds.has(article.categoryId)),
    [articles, restrictedCategoryIds]
  );

  const categoriesById = useMemo(
    () => new Map(visibleCategories.map((category) => [category.id, category])),
    [visibleCategories]
  );
  const articlesWithCategoryNames = useMemo(
    () =>
      visibleArticles.map((article) => ({
        ...article,
        category: categoriesById.get(article.categoryId)?.name || article.category,
      })),
    [visibleArticles, categoriesById]
  );
  const recentArticles = useMemo(
    () =>
      [...articlesWithCategoryNames]
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
        .slice(0, 4),
    [articlesWithCategoryNames]
  );
  const trendingArticles = useMemo(
    () => [...articlesWithCategoryNames].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)).slice(0, 5),
    [articlesWithCategoryNames]
  );

  const filteredCategories = useMemo(
    () => visibleCategories.filter((category) => matches(`${category.name} ${category.description}`)),
    [visibleCategories, normalizedQuery]
  );
  const filteredArticles = useMemo(
    () => articlesWithCategoryNames.filter((article) => matches(`${article.title} ${article.category} ${article.summary} ${article.body}`)),
    [articlesWithCategoryNames, normalizedQuery]
  );
  const filteredTrending = useMemo(
    () => trendingArticles.filter((article) => matches(`${article.title} ${article.category} ${article.summary}`)),
    [trendingArticles, normalizedQuery]
  );
  const filteredRecent = useMemo(
    () => recentArticles.filter((article) => matches(`${article.title} ${article.category} ${article.summary || ""}`)),
    [recentArticles, normalizedQuery]
  );
  const searchedTickets = useMemo(
    () =>
      tickets.filter((ticket) =>
        matches(
          `${ticket.id} ${ticket.title} ${ticket.category} ${ticket.status} ${ticket.description} ${ticket.assignee} ${ticket.employee} ${ticket.team} ${ticket.ticketType} ${ticket.priority} ${ticket.date} ${ticket.dateLabel} ${ticket.createdAtLabel} ${ticket.updatedAtLabel}`
        )
      ),
    [tickets, normalizedQuery]
  );

  const ticketCounts = useMemo(
    () => ({
      active: tickets.filter((ticket) => !isResolvedTicket(ticket)).length,
      resolved: tickets.filter(isResolvedTicket).length,
      all: tickets.length,
    }),
    [tickets]
  );
  const effectiveTicketViews = useMemo(() => {
    const resolvedView = {
        id: "__resolved_tickets",
        label: "Resolved Tickets",
        icon: "✅",
        filters: { status: ["in", ["Resolved", "Closed"]] },
    };

    return [
      ...ticketViews
        .filter((viewItem) => !/resolved|closed/i.test(viewItem.label || ""))
        .map((viewItem) =>
          /pending|open/i.test(viewItem.label || "")
            ? { ...viewItem, filters: { status: ["not in", ["Resolved", "Closed"]] } }
            : viewItem
        ),
      resolvedView,
    ];
  }, [ticketViews]);
  const ticketViewMatchers = useMemo(
    () =>
      effectiveTicketViews.map((viewItem) => ({
        ...viewItem,
        matches: createTicketViewMatcher(viewItem.filters),
      })),
    [effectiveTicketViews]
  );
  const ticketViewCounts = useMemo(
    () =>
      Object.fromEntries(
        ticketViewMatchers.map((viewItem) => [
          viewItem.id,
          searchedTickets.filter(viewItem.matches).length,
        ])
      ),
    [searchedTickets, ticketViewMatchers]
  );
  const selectedTicketView = ticketViewMatchers.find((viewItem) => viewItem.id === ticketFilter);
  const visibleTickets = useMemo(
    () => (selectedTicketView ? searchedTickets.filter(selectedTicketView.matches) : searchedTickets),
    [searchedTickets, selectedTicketView]
  );
  const openTickets = useMemo(
    () => searchedTickets.filter((ticket) => !isResolvedTicket(ticket)),
    [searchedTickets]
  );

  const selectedTicket = tickets.find((ticket) => ticket.id === view.ticketId);
  const selectedCategory = visibleCategories.find((category) => category.id === view.categoryId);
  const selectedArticle = articlesWithCategoryNames.find((article) => article.id === view.articleId);

  const goHome = () => setView({ type: "home" });
  const goTickets = () => {
    setTicketFilter((current) => current || effectiveTicketViews.find((viewItem) => viewItem.isDefault)?.id || effectiveTicketViews[0]?.id || "");
    setView({ type: "tickets" });
  };
  const goResolvedTickets = () => {
    const resolvedView =
      effectiveTicketViews.find((viewItem) => /resolved|closed/i.test(viewItem.label)) ||
      effectiveTicketViews.find((viewItem) => viewItem.isDefault) ||
      effectiveTicketViews[0];
    setTicketFilter(resolvedView?.id || "");
    setView({ type: "tickets" });
  };
  const goArticle = (article) => setView({ type: "article", articleId: article.id });
  const goCollection = (category) => setView({ type: "collection", categoryId: category.id });
  const goTicket = (ticket) => setView({ type: "ticket", ticketId: ticket.id });
  const goArticles = () => setView({ type: "articles" });
  const goSolvedSolo = () => setView({ type: "solvedSolo" });

  const metrics = [
    { label: "Open tickets", value: ticketCounts.active, icon: "pi pi-comments", onClick: goTickets },
    { label: "Resolved", value: ticketCounts.resolved, icon: "pi pi-check-circle", onClick: goResolvedTickets },
    { label: "Articles", value: visibleArticles.length, icon: "pi pi-book", onClick: goArticles },
    { label: "Collections", value: visibleCategories.length, icon: "pi pi-folder-open", onClick: goArticles },
  ];

  const createTicket = async (ticket) => {
    try {
      const createPromise = createHDTicket(ticket, {
          graphqlConfig,
          user: supportUser,
        });
      toast.promise(createPromise, {
        loading: "Creating HD ticket...",
        success: (createdTicket) => `Ticket ${createdTicket.id} created`,
        error: (error) => error?.message || "Failed to create ticket",
      });

      const created = await createPromise;

      setTickets((current) => [created, ...current]);
      setTicketFilter((current) => current || effectiveTicketViews.find((viewItem) => viewItem.isDefault)?.id || effectiveTicketViews[0]?.id || "");
      setView({ type: "ticket", ticketId: created.id });
      return created;
    } catch {
      // Sonner already rendered the failure message.
      return false;
    }
  };

  const changeTicketStatus = async (ticketId, status) => {
    const previousTicket = tickets.find((ticket) => ticket.id === ticketId);
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId
          ? { ...ticket, status, statusCategory: getTicketStatusCategory(status), updatedAt: "Just now" }
          : ticket
      )
    );
    if (!previousTicket?.raw) return;
    try {
      await updateHDTicket(ticketId, { graphqlConfig, status, status_category: getTicketStatusCategory(status) });
      const refreshedTicket = await fetchHDTicketByName(ticketId, graphqlConfig);
      if (refreshedTicket) {
        setTickets((current) => current.map((ticket) => (ticket.id === ticketId ? refreshedTicket : ticket)));
      }
    } catch (error) {
      setTickets((current) => current.map((ticket) => (ticket.id === ticketId ? previousTicket : ticket)));
      toast.error("Could not update ticket status", {
        description: error?.message || "Please check ERP access.",
      });
    }
  };

  const changeTicketField = async (ticketId, field, value) => {
    const fieldMap = {
      ticketType: "ticket_type",
      priority: "priority",
    };
    const erpField = fieldMap[field];
    const previousTicket = tickets.find((ticket) => ticket.id === ticketId);
    setTickets((current) =>
      current.map((ticket) => (ticket.id === ticketId ? { ...ticket, [field]: value, updatedAt: "Just now" } : ticket))
    );
    if (!previousTicket?.raw || !erpField) return;
    try {
      await updateHDTicket(ticketId, { graphqlConfig, [erpField]: value });
      const refreshedTicket = await fetchHDTicketByName(ticketId, graphqlConfig);
      if (refreshedTicket) {
        setTickets((current) => current.map((ticket) => (ticket.id === ticketId ? refreshedTicket : ticket)));
      }
    } catch (error) {
      setTickets((current) => current.map((ticket) => (ticket.id === ticketId ? previousTicket : ticket)));
      toast.error("Could not update ticket", {
        description: error?.message || "Please check ERP access.",
      });
    }
  };

  const deleteTickets = async (ticketIds) => {
    const remoteTicketIds = ticketIds.filter((ticketId) => tickets.some((ticket) => ticket.id === ticketId && ticket.raw));
    if (remoteTicketIds.length) {
      try {
        const deletePromise = Promise.all(remoteTicketIds.map((ticketId) => deleteHDTicket(ticketId, graphqlConfig)));
        toast.promise(deletePromise, {
          loading: `Deleting ${remoteTicketIds.length} ticket${remoteTicketIds.length === 1 ? "" : "s"}...`,
          success: "Ticket deleted",
          error: (error) => error?.message || "Failed to delete ticket",
        });
        await deletePromise;
      } catch {
        return;
      }
    }
    setTickets((current) => current.filter((ticket) => !ticketIds.includes(ticket.id)));
  };

  const dashboard = (
    <div className="flex min-h-full shrink-0 flex-col gap-5">
      <div className="hidden grid-cols-4 gap-3 @min-[768px]:grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>
      <div className="@min-[768px]:hidden">
        <MobileStatStrip stats={[
          { value: ticketCounts.active, label: "Open" },
          { value: ticketCounts.resolved, label: "Resolved" },
          { value: visibleArticles.length, label: "Articles" },
          { value: visibleCategories.length, label: "Collections" },
        ]} />
      </div>
      <div className="grid min-h-0 gap-5 @min-[1280px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          {isLoadingContent ? (
            <LoadingRows rows={2} />
          ) : openTickets.length ? (
            <OpenTicketsRail tickets={openTickets} onOpen={goTicket} onViewAll={goTickets} />
          ) : (
            <EmptyState icon="pi pi-comments" message="No tickets match your current ERP view." />
          )}
          {isLoadingContent ? (
            <LoadingRows rows={2} />
          ) : filteredCategories.length ? (
            <CollectionBento categories={filteredCategories} onOpen={goCollection} />
          ) : (
            <EmptyState icon="pi pi-folder-open" message="No collections match your search." />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          {isLoadingContent ? (
            <LoadingRows rows={3} />
          ) : filteredTrending.length ? (
            <TrendingList items={filteredTrending} onOpen={goArticle} />
          ) : (
            <EmptyState icon="pi pi-book" message="No trending articles match your search." />
          )}
          {isLoadingContent ? (
            <LoadingRows rows={2} />
          ) : filteredRecent.length ? (
            <RecentlyViewed items={filteredRecent} onOpen={goArticle} />
          ) : (
            <EmptyState icon="pi pi-clock" message="No recently viewed articles match your search." />
          )}
        </div>
      </div>
      <TicketsPanel
        tickets={visibleTickets}
        onOpen={goTicket}
        activeFilter={ticketFilter}
        setActiveFilter={setTicketFilter}
        counts={ticketViewCounts}
        views={effectiveTicketViews}
        onCreate={() => setView({ type: "create" })}
        onDeleteTickets={deleteTickets}
        isLoading={isLoadingContent}
      />
    </div>
  );

  let mainView = dashboard;
  if (view.type === "tickets") {
    mainView = (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
        <BackHeader title="Tickets" subtitle={isLoadingContent ? "Loading HD tickets..." : "ERP helpdesk views and ticket records"} onBack={goHome} />
        <TicketsPanel
          tickets={visibleTickets}
          onOpen={goTicket}
          activeFilter={ticketFilter}
          setActiveFilter={setTicketFilter}
          counts={ticketViewCounts}
          views={effectiveTicketViews}
          onCreate={() => setView({ type: "create" })}
          onDeleteTickets={deleteTickets}
          isLoading={isLoadingContent}
          fill
        />
      </div>
    );
  } else if (view.type === "create") {
    mainView = (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
        <BackHeader title="Create ticket" subtitle="Raise a support request" onBack={goHome} />
        <CreateTicketForm
          content={uiContent}
          onSubmit={createTicket}
          onCancel={goHome}
          ticketTypes={ticketTypes}
          user={supportUser}
        />
      </div>
    );
  } else if (view.type === "ticket" && selectedTicket) {
    mainView = (
      <TicketConversation
        ticket={selectedTicket}
        onBack={() => setView({ type: "tickets" })}
        onStatusChange={changeTicketStatus}
        onFieldChange={changeTicketField}
        graphqlConfig={graphqlConfig}
        user={supportUser}
        ticketTypes={ticketTypes}
        ticketPriorities={ticketPriorities}
        ticketStatuses={ticketStatuses}
        canManage={assignedTicketIds.has(selectedTicket.id)}
        isRequester={isSameEmail(selectedTicket.raisedBy, supportUser.email)}
      />
    );
  } else if (view.type === "collection" && selectedCategory) {
    const collectionArticles = filteredArticles.filter((article) => article.categoryId === selectedCategory.id);
    mainView = <CollectionView category={selectedCategory} articles={collectionArticles} onBack={goHome} onArticle={goArticle} />;
  } else if (view.type === "articles") {
    mainView = (
      <ArticlesResultView
        title="Articles"
        subtitle={`${filteredArticles.length} knowledge base results`}
        articles={filteredArticles}
        onBack={goHome}
        onArticle={goArticle}
      />
    );
  } else if (view.type === "solvedSolo") {
    mainView = (
      <ArticlesResultView
        title="Solved solo"
        subtitle="Articles that help resolve common issues without support"
        articles={filteredTrending.slice(0, 4)}
        onBack={goHome}
        onArticle={goArticle}
      />
    );
  } else if (view.type === "article" && selectedArticle) {
    mainView = <ArticleView article={selectedArticle} onBack={goHome} graphqlConfig={graphqlConfig} user={supportUser} />;
  }

  const isHomeView = view.type === "home";

  return (
    <>
      {/* Kept outside the container so the fixed-position toasts stay anchored to the
          viewport — `@container` would otherwise become their containing block. */}
      <Toaster richColors position="top-right" />
      <div
        className={cx(
          // Every breakpoint below this element is a container query keyed off this box,
          // so the layout follows the component's own width rather than the browser
          // viewport — it has to stay correct inside an arbitrary Plasmic slot.
          // @min-[640px] / [768px] / [1024px] / [1280px] mirror Tailwind sm / md / lg / xl.
          "@container flex min-h-0 flex-col overflow-hidden bg-slate-50 text-sm text-slate-950",
          // Size/spacing utilities are dropped once a className arrives so the caller
          // (Plasmic Studio) owns the box instead of fighting these for specificity.
          // These stay viewport-based: an element cannot query its own container.
          className ? "" : "mb-3 h-[calc(100%-0.75rem)] w-full max-w-full md:mb-4 md:h-[calc(100%-1rem)]",
          className
        )}
        style={style}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-clip overscroll-contain px-2 pb-2 pt-2 @min-[768px]:px-6 @min-[768px]:pb-8 @min-[768px]:pt-4">
          <div
            className={cx(
              "flex w-full min-w-0 flex-col gap-4",
              isHomeView ? "min-h-full" : "h-full min-h-0 flex-1"
            )}
          >
            {view.type === "home" ? (
              <section className="shrink-0 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm @min-[768px]:p-5">
                <div className="flex flex-col gap-4 @min-[1024px]:flex-row @min-[1024px]:items-center @min-[1024px]:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0F87F9]">ELBRIT HELP CENTER</p>
                    <h1 className="mt-1.5 text-lg font-bold text-[#18265c] @min-[768px]:text-xl">Help & Support</h1>
                    <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-slate-500">
                      Browse ERP articles, raise tickets, and track support conversations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setView({ type: "create" })}
                    className="hidden h-9 items-center justify-center gap-2 rounded-lg bg-[#0F87F9] px-3 text-[13px] font-bold text-white shadow-sm transition hover:bg-blue-600 @min-[768px]:inline-flex"
                  >
                    <i className="pi pi-plus" aria-hidden />
                    Create ticket
                  </button>
                </div>
                <label className="mt-3 flex h-11 max-w-2xl items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-[#0F87F9] focus-within:ring-2 focus-within:ring-blue-100 @min-[768px]:h-10">
                  <i className="pi pi-search shrink-0 text-slate-400" aria-hidden />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={uiContent.header.searchPlaceholder}
                    className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400 @min-[768px]:text-[13px]"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
                    >
                      <i className="pi pi-times text-xs" aria-hidden />
                    </button>
                  ) : null}
                </label>
              </section>
            ) : null}
  
            <div className={cx("flex flex-col", isHomeView ? "shrink-0" : "min-h-0 flex-1")}>{mainView}</div>
          </div>
        </div>
  
        {view.type === "home" || view.type === "tickets" || view.type === "create" ? (
          <div className="shrink-0 px-0 pb-0 @min-[768px]:hidden">
            <MobileTabs
              activeTab={view.type === "create" ? "raise" : view.type === "tickets" ? "tickets" : "dashboard"}
              ticketCount={ticketCounts.active}
              onSelect={(tab) => {
                if (tab === "raise") setView({ type: "create" });
                else if (tab === "tickets") goTickets();
                else goHome();
              }}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
