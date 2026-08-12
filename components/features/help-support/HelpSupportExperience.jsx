"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { createHDTicket, deleteHDTicket, fetchHDTickets, fetchHelpSupportDashboard, HD_TICKET_TYPES } from "./graphql";

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

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
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

function Card({ children, className = "", as: Component = "section", ...props }) {
  return (
    <Component className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)} {...props}>
      {children}
    </Component>
  );
}

function BackHeader({ title, subtitle, onBack, action }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-200 bg-white px-3 py-2 md:rounded-xl md:border md:px-3 md:shadow-sm">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-xs text-slate-800 transition hover:bg-blue-50 hover:text-[#0F87F9]"
      >
        <i className="pi pi-chevron-left" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-bold text-slate-950 md:text-base">{title}</h2>
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

function StatusBadge({ status }) {
  const styles = {
    Open: "bg-amber-50 text-amber-700 ring-amber-100",
    Replied: "bg-blue-50 text-blue-700 ring-blue-100",
    Resolved: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    Closed: "bg-slate-100 text-slate-600 ring-slate-200",
  };

  return (
    <span className={cx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", styles[status])}>
      {status}
    </span>
  );
}

function SlaBadge({ value }) {
  const overdue = String(value).toLowerCase().includes("overdue");
  return (
    <span className={cx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold", overdue ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700")}>
      {value}
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
    <Card className="grid grid-cols-4 divide-x divide-slate-100 px-2 py-4">
      {stats.map((stat) => (
        <div key={stat.label} className="text-center">
          <p className="text-xl font-black text-slate-950">{stat.value}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{stat.label}</p>
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
        compact && "w-[280px] shrink-0"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{ticket.id}</p>
          <h3 className="mt-2 font-bold leading-5 text-slate-950">{ticket.title}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {ticket.category} · {ticket.updatedAt}
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
      <div className="flex max-w-full gap-3 overflow-x-auto pb-2">
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
      <div className="flex max-w-full gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible">
        {items.map((article) => (
          <button
            key={article.id}
            type="button"
            onClick={() => onOpen(article)}
            className="w-[260px] shrink-0 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 md:w-auto"
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

function TicketFilters({ activeFilter, setActiveFilter, counts }) {
  const filters = [
    { id: "active", label: `Active (${counts.active})` },
    { id: "resolved", label: `Resolved (${counts.resolved})` },
    { id: "all", label: `All (${counts.all})` },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {filters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={() => setActiveFilter(filter.id)}
          className={cx(
            "h-8 shrink-0 rounded-full border px-3 text-xs font-bold transition",
            activeFilter === filter.id
              ? "border-[#0F87F9] bg-[#0F87F9] text-white"
              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200"
          )}
        >
          {filter.label}
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
  { id: "date", label: "Date", getValue: (ticket) => ticket.date || ticket.createdAt },
  { id: "assignee", label: "Assignee", getValue: (ticket) => ticket.assignee },
  { id: "employee", label: "Employee", getValue: (ticket) => ticket.employee },
];

function TicketDataTable({ tickets, onOpen, selectedIds, onToggleTicket, onToggleAll }) {
  const allSelected = tickets.length > 0 && tickets.every((ticket) => selectedIds.includes(ticket.id));
  const partlySelected = tickets.some((ticket) => selectedIds.includes(ticket.id)) && !allSelected;

  return (
    <Card className="hidden min-w-0 overflow-x-auto lg:block">
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
            <tr key={ticket.id} className="hover:bg-slate-50/80">
              <td className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(ticket.id)}
                  onChange={() => onToggleTicket(ticket.id)}
                  className="h-4 w-4 rounded border-slate-300 text-[#0F87F9] focus:ring-[#0F87F9]"
                  aria-label={`Select ${ticket.id}`}
                />
              </td>
              <td className="px-3 py-2.5 font-semibold text-slate-700">{ticket.id.replace("HD-", "")}</td>
              <td className="px-3 py-2.5 text-slate-600">{ticket.date || ticket.createdAt || "-"}</td>
              <td className="max-w-[300px] px-3 py-2.5">
                <p className="font-semibold text-slate-950">{ticket.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">{ticket.category}</p>
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={cx(
                    "mr-2 inline-block h-2 w-2 rounded-full",
                    ticket.status === "Resolved" ? "bg-emerald-500" : ticket.status === "Replied" ? "bg-blue-500" : "bg-red-500"
                  )}
                />
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
                  onClick={() => onOpen(ticket)}
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
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <button type="button" onClick={() => onOpen(ticket)} className="w-full min-w-0 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{ticket.id}</p>
            <h3 className="mt-1 text-sm font-bold leading-5 text-slate-950">{ticket.title}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {ticket.category} · {ticket.date || ticket.updatedAt}
            </p>
          </div>
          <StatusBadge status={ticket.status} />
        </div>
      </button>
    </div>
  );
}

function StatusSelect({ status, onChange }) {
  const statusStyles = {
    Open: "bg-red-500",
    Replied: "bg-blue-500",
    Resolved: "bg-emerald-500",
    Closed: "bg-slate-400",
  };

  return (
    <label className="inline-flex h-8 w-fit shrink-0 items-center gap-2 rounded-lg bg-slate-100 px-2 text-xs font-semibold text-slate-700">
      <span className={cx("h-2.5 w-2.5 rounded-full", statusStyles[status] || "bg-slate-400")} />
      <select
        value={status}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 rounded-md border-0 bg-transparent px-1 text-xs font-semibold outline-none"
        aria-label="Change ticket status"
      >
        {["Open", "Replied", "Resolved", "Closed"].map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function FieldSelect({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#0F87F9] focus:ring-2 focus:ring-blue-100"
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

function TicketMetaPanel({ ticket, onFieldChange }) {
  const options = {
    ticketType: ["Issue", "Bug", "Request", "Question"],
    priority: ["Low", "Medium", "High", "Urgent"],
    employee: [],
    team: ["North Delhi Sales", "Field Operations", "DCR Support", "IT Support"],
    assignee: ["Priya", "IT Helpdesk", "DCR Support", "Helpdesk"],
  };
  const fields = [
    ["Ticket Type", "ticketType", ticket.ticketType || "Issue"],
    ["Priority", "priority", ticket.priority || "Medium"],
    ["Employee", "employee", ticket.employee || "-"],
    ["Team", "team", ticket.team || "Field Operations"],
    ["Assignee", "assignee", ticket.assignee || "Helpdesk"],
  ];

  return (
    <Card className="order-first shrink-0 p-3 lg:order-none lg:w-[300px]">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
          {(ticket.assignee || "H").charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-950">{ticket.assignee || "Helpdesk"}</p>
          <p className="text-[11px] text-slate-500">Ticket owner</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {fields.map(([label, field, value]) => (
          <FieldSelect
            key={field}
            label={label}
            value={value}
            options={options[field]}
            onChange={(nextValue) => onFieldChange(ticket.id, field, nextValue)}
          />
        ))}
      </div>
    </Card>
  );
}

function TicketsPanel({ tickets, onOpen, activeFilter, setActiveFilter, counts, onCreate, onDeleteTickets, fill = false }) {
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
      <div className="shrink-0 flex flex-col gap-2 border-b border-slate-200 bg-white/80 py-2 md:rounded-xl md:border md:px-3 md:shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="text-[15px] font-bold text-slate-950">Tickets</h2>
            <span className="text-sm text-slate-400">/</span>
            <span className="text-xs font-semibold text-slate-600">List</span>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 text-[13px] font-bold text-white hover:bg-slate-800"
          >
            <i className="pi pi-plus" aria-hidden />
            Create
          </button>
        </div>
        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
          <TicketFilters activeFilter={activeFilter} setActiveFilter={setActiveFilter} counts={counts} />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-slate-100 p-1 md:flex-none">
              <i className="pi pi-filter ml-2 text-xs text-slate-500" aria-hidden />
              <select
                value={filterField}
                onChange={(event) => setFilterField(event.target.value)}
                className="h-7 rounded-md border-0 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
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
                className="h-7 min-w-[110px] flex-1 rounded-md border-0 bg-white px-2 text-xs outline-none placeholder:text-slate-400 md:w-40"
              />
            </div>
            <button
              type="button"
              onClick={deleteSelected}
              disabled={!visibleSelectedIds.length}
              className="h-8 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 hover:bg-red-100 disabled:bg-slate-100 disabled:text-slate-400"
            >
              Delete{visibleSelectedIds.length ? ` (${visibleSelectedIds.length})` : ""}
            </button>
          </div>
        </div>
      </div>

      <div className={cx("min-w-0", fill ? "min-h-0 flex-1 overflow-auto" : "overflow-visible")}>
        {filteredTickets.length ? (
          <>
          <TicketDataTable
            tickets={filteredTickets}
            onOpen={onOpen}
            selectedIds={selectedIds}
            onToggleTicket={toggleTicket}
            onToggleAll={toggleAll}
          />
          <div className="grid gap-2 lg:hidden">
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
          <EmptyState message="No tickets match your search and filter." />
        )}
      </div>
    </section>
  );
}

function CreateTicketForm({ content, onSubmit, onCancel }) {
  const [ticketType, setTicketType] = useState("Unspecified");
  const [subject, setSubject] = useState("");
  const [raisedBy, setRaisedBy] = useState(() => content.user?.email || "");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = subject.trim() && isEmail(raisedBy) && description.trim() && !isSubmitting;

  useEffect(() => {
    setRaisedBy((current) => {
      if (isEmail(current)) return current;
      const storedEmail = readStoredUserEmail();
      return storedEmail || current;
    });
  }, []);

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
    <Card className="p-4 md:p-5">
      <form onSubmit={submit} className="grid gap-4">
        <div className="flex w-full min-w-0 flex-col gap-4">
          <fieldset className="min-w-0">
            <legend className="mb-2 block text-sm font-semibold text-slate-700">{content.ticketForm.categoryLabel}</legend>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
              {HD_TICKET_TYPES.map((type) => {
                const selected = ticketType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTicketType(type)}
                    className={cx(
                      "min-h-11 shrink-0 rounded-lg border px-3 py-2 text-xs font-bold transition md:px-4 md:text-sm",
                      selected
                        ? "border-[#0F87F9] bg-[#0F87F9] text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-950 hover:border-blue-200 hover:bg-blue-50"
                    )}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="min-w-0">
            <span className="mb-2 block text-sm font-semibold text-slate-700">{content.ticketForm.subjectLabel}</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={content.ticketForm.subjectPlaceholder}
              className="h-11 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0F87F9] focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label className="min-w-0">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Raised by email</span>
            <input
              type="email"
              value={raisedBy}
              onChange={(event) => setRaisedBy(event.target.value)}
              placeholder="name@elbrit.org"
              className="h-11 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0F87F9] focus:ring-4 focus:ring-blue-100"
              required
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">{content.ticketForm.descriptionLabel}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={content.ticketForm.descriptionPlaceholder}
            rows={5}
            className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-[#0F87F9] focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 text-sm font-semibold text-slate-500"
          >
            <i className="pi pi-paperclip" aria-hidden />
            Attach files
          </button>
          <div className="flex gap-2">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0F87F9] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-600 disabled:bg-blue-200"
            >
              <i className="pi pi-plus" aria-hidden />
              {isSubmitting ? "Submitting..." : content.ticketForm.submitLabel}
            </button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function TicketConversation({ ticket, onBack, onAddComment, onStatusChange, onFieldChange }) {
  const [comment, setComment] = useState("");
  const canSend = comment.trim();

  const submit = (event) => {
    event.preventDefault();
    if (!canSend) return;
    onAddComment(ticket.id, comment.trim());
    setComment("");
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-slate-50 text-[13px]">
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 md:rounded-xl md:border md:px-4 md:shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-2.5">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-xs text-slate-800 transition hover:bg-blue-50 hover:text-[#0F87F9]"
            >
              <i className="pi pi-chevron-left" aria-hidden />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-500">Tickets / {ticket.id}</p>
              <h2 className="truncate text-sm font-bold text-slate-950 md:text-base">{ticket.title}</h2>
              <p className="mt-0.5 text-[11px] text-slate-500 md:text-xs">
                Created {ticket.createdAt || ticket.date || "Just now"} · {ticket.category}
              </p>
            </div>
          </div>
          <StatusSelect status={ticket.status} onChange={(status) => onStatusChange(ticket.id, status)} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] md:text-xs">
          <span className="font-semibold text-slate-700">
            First Response <span className="ml-1 font-bold text-red-500">{ticket.firstResponse || "Pending"}</span>
          </span>
          <span className="font-semibold text-slate-700">
            Resolution <span className="ml-1 font-bold text-red-500">{ticket.resolution || "Pending"}</span>
          </span>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(0,1fr)_300px] lg:overflow-hidden">
        <div className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100 lg:min-h-0">
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            {(ticket.conversation || []).map((message) => {
              const own = message.tone === "user";
              return (
                <div key={message.id} className={cx("flex flex-col", own ? "items-end" : "items-start")}>
                  <div
                    className={cx(
                      "max-w-[680px] rounded-xl px-3 py-2 text-xs leading-5",
                      own ? "bg-[#0F87F9] text-white" : "bg-white text-slate-950 shadow-sm"
                    )}
                  >
                    {message.message}
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    {message.author} · {message.role} · {message.time}
                  </p>
                </div>
              );
            })}
          </div>
          <form onSubmit={submit} className="border-t border-slate-200 bg-white p-2.5">
            <div className="flex gap-2">
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Add a comment..."
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-[#0F87F9] focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-[#0F87F9] px-3 text-xs font-bold text-white disabled:bg-blue-200"
              >
                Send
              </button>
            </div>
          </form>
        </div>
        <TicketMetaPanel ticket={ticket} onFieldChange={onFieldChange} />
      </div>
    </section>
  );
}

function CollectionView({ category, articles, onBack, onArticle }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <BackHeader title={category.name} subtitle={category.description} onBack={onBack} />
      {articles.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
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
          <div className="grid gap-3 xl:grid-cols-2">
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

function ArticleView({ article, onBack }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <BackHeader title={article.title} subtitle={`${article.category} · ${article.updatedAt || "Knowledge base"}`} onBack={onBack} />
      <Card className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0F87F9]">Knowledge base</p>
        <h2 className="mt-2 text-lg font-bold leading-tight text-slate-950 md:text-xl">{article.title}</h2>
        {article.author ? <p className="mt-2 text-xs font-semibold text-slate-500">By {article.author}</p> : null}
        <div
          className="mt-4 max-w-none rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-700 [&_a]:text-[#0F87F9] [&_code]:rounded [&_code]:bg-slate-200 [&_code]:px-1 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-bold [&_img]:mx-auto [&_img]:my-3 [&_img]:block [&_img]:h-auto [&_img]:max-w-[90%] [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2.5 [&_strong]:font-bold [&_video]:mx-auto [&_video]:my-3 [&_video]:block [&_video]:h-auto [&_video]:max-w-[90%] md:p-4 md:text-[12px] md:leading-5"
          dangerouslySetInnerHTML={{ __html: article.content || article.summary || "" }}
        />
      </Card>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <Card className="p-6 text-center">
      <i className="pi pi-search text-2xl text-slate-300" aria-hidden />
      <p className="mt-2 text-sm font-medium text-slate-500">{message}</p>
    </Card>
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

export default function HelpSupportExperience({ content = HELP_SUPPORT_UI_CONTENT, className = "" }) {
  const uiContent = {
    ...HELP_SUPPORT_UI_CONTENT,
    ...content,
    user: { ...HELP_SUPPORT_UI_CONTENT.user, ...(content.user || {}) },
    header: { ...HELP_SUPPORT_UI_CONTENT.header, ...(content.header || {}) },
    ticketForm: { ...HELP_SUPPORT_UI_CONTENT.ticketForm, ...(content.ticketForm || {}) },
  };
  const [query, setQuery] = useState("");
  const [view, setView] = useState({ type: "home" });
  const [ticketFilter, setTicketFilter] = useState("active");
  const [tickets, setTickets] = useState([]);
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoadingContent(true);
    fetchHelpSupportDashboard({ fetchTickets: fetchHDTickets })
      .then((remoteContent) => {
        if (!active) return;
        setTickets(remoteContent.tickets);
        setArticles(remoteContent.articles);
        setCategories(remoteContent.categories);
      })
      .catch((error) => {
        if (!active) return;
        toast.error("Could not load help desk content", {
          description: error?.message || "Please check the ERP GraphQL configuration.",
        });
      })
      .finally(() => {
        if (active) setIsLoadingContent(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (text) => !normalizedQuery || String(text).toLowerCase().includes(normalizedQuery);

  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const articlesWithCategoryNames = useMemo(
    () =>
      articles.map((article) => ({
        ...article,
        category: categoriesById.get(article.categoryId)?.name || article.category,
      })),
    [articles, categoriesById]
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
    () => categories.filter((category) => matches(`${category.name} ${category.description}`)),
    [categories, normalizedQuery]
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
          `${ticket.id} ${ticket.title} ${ticket.category} ${ticket.status} ${ticket.description} ${ticket.assignee} ${ticket.employee} ${ticket.team} ${ticket.ticketType} ${ticket.priority} ${ticket.date}`
        )
      ),
    [tickets, normalizedQuery]
  );

  const ticketCounts = useMemo(
    () => ({
      active: tickets.filter((ticket) => ticket.status !== "Resolved" && ticket.status !== "Closed").length,
      resolved: tickets.filter((ticket) => ticket.status === "Resolved").length,
      all: tickets.length,
    }),
    [tickets]
  );
  const visibleTickets = searchedTickets.filter((ticket) => {
    if (ticketFilter === "resolved") return ticket.status === "Resolved";
    if (ticketFilter === "active") return ticket.status !== "Resolved" && ticket.status !== "Closed";
    return true;
  });
  const openTickets = searchedTickets.filter((ticket) => ticket.status !== "Resolved" && ticket.status !== "Closed");

  const selectedTicket = tickets.find((ticket) => ticket.id === view.ticketId);
  const selectedCategory = categories.find((category) => category.id === view.categoryId);
  const selectedArticle = articlesWithCategoryNames.find((article) => article.id === view.articleId);

  const goHome = () => setView({ type: "home" });
  const goTickets = () => {
    setTicketFilter("active");
    setView({ type: "tickets" });
  };
  const goResolvedTickets = () => {
    setTicketFilter("resolved");
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
    { label: "Articles", value: articles.length, icon: "pi pi-book", onClick: goArticles },
    { label: "Collections", value: categories.length, icon: "pi pi-folder-open", onClick: goArticles },
  ];

  const createTicket = async (ticket) => {
    try {
      const createPromise = createHDTicket(ticket, {
          user: {
            email: uiContent.user?.email,
            username: uiContent.user?.email,
          },
        });
      toast.promise(createPromise, {
        loading: "Creating HD ticket...",
        success: (createdTicket) => `Ticket ${createdTicket.id} created`,
        error: (error) => error?.message || "Failed to create ticket",
      });

      const created = await createPromise;

      setTickets((current) => [created, ...current]);
      setTicketFilter("active");
      setView({ type: "ticket", ticketId: created.id });
      return created;
    } catch {
      // Sonner already rendered the failure message.
      return false;
    }
  };

  const addComment = (ticketId, message) => {
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              status: ticket.status === "Resolved" ? "Resolved" : "Replied",
              updatedAt: "Just now",
              conversation: [
                ...(ticket.conversation || []),
                {
                  id: `msg-${ticketId}-${Date.now()}`,
                  author: "You",
                  role: "Field team",
                  time: "Just now",
                  tone: "user",
                  message,
                },
              ],
            }
          : ticket
      )
    );
  };

  const changeTicketStatus = (ticketId, status) => {
    setTickets((current) =>
      current.map((ticket) => (ticket.id === ticketId ? { ...ticket, status, updatedAt: "Just now" } : ticket))
    );
  };

  const changeTicketField = (ticketId, field, value) => {
    setTickets((current) =>
      current.map((ticket) => (ticket.id === ticketId ? { ...ticket, [field]: value, updatedAt: "Just now" } : ticket))
    );
  };

  const deleteTickets = async (ticketIds) => {
    const remoteTicketIds = ticketIds.filter((ticketId) => tickets.some((ticket) => ticket.id === ticketId && ticket.raw));
    if (remoteTicketIds.length) {
      try {
        const deletePromise = Promise.all(remoteTicketIds.map((ticketId) => deleteHDTicket(ticketId)));
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
      <div className="hidden grid-cols-4 gap-3 md:grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>
      <div className="md:hidden">
        <MobileStatStrip stats={[
          { value: ticketCounts.active, label: "Open" },
          { value: ticketCounts.resolved, label: "Resolved" },
          { value: articles.length, label: "Articles" },
          { value: categories.length, label: "Collections" },
        ]} />
      </div>
      <div className="grid min-h-0 gap-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          {openTickets.length ? (
            <OpenTicketsRail tickets={openTickets} onOpen={goTicket} onViewAll={goTickets} />
          ) : (
            <EmptyState message="No active tickets match your search." />
          )}
          {filteredCategories.length ? (
            <CollectionBento categories={filteredCategories} onOpen={goCollection} />
          ) : (
            <EmptyState message="No collections match your search." />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          {filteredTrending.length ? <TrendingList items={filteredTrending} onOpen={goArticle} /> : <EmptyState message="No trending articles match your search." />}
          {filteredRecent.length ? <RecentlyViewed items={filteredRecent} onOpen={goArticle} /> : <EmptyState message="No recently viewed articles match your search." />}
        </div>
      </div>
      <TicketsPanel
        tickets={visibleTickets}
        onOpen={goTicket}
        activeFilter={ticketFilter}
        setActiveFilter={setTicketFilter}
        counts={ticketCounts}
        onCreate={() => setView({ type: "create" })}
        onDeleteTickets={deleteTickets}
      />
    </div>
  );

  let mainView = dashboard;
  if (view.type === "tickets") {
    mainView = (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
        <BackHeader title="Tickets" subtitle={isLoadingContent ? "Loading HD tickets..." : "Active, resolved and all ticket records"} onBack={goHome} />
        <TicketsPanel
          tickets={visibleTickets}
          onOpen={goTicket}
          activeFilter={ticketFilter}
          setActiveFilter={setTicketFilter}
          counts={ticketCounts}
          onCreate={() => setView({ type: "create" })}
          onDeleteTickets={deleteTickets}
          fill
        />
      </div>
    );
  } else if (view.type === "create") {
    mainView = (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
        <BackHeader title="Create ticket" subtitle="Raise a support request" onBack={goHome} />
        <CreateTicketForm content={uiContent} onSubmit={createTicket} onCancel={goHome} />
      </div>
    );
  } else if (view.type === "ticket" && selectedTicket) {
    mainView = (
      <TicketConversation
        ticket={selectedTicket}
        onBack={() => setView({ type: "tickets" })}
        onAddComment={addComment}
        onStatusChange={changeTicketStatus}
        onFieldChange={changeTicketField}
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
    mainView = <ArticleView article={selectedArticle} onBack={goHome} />;
  }

  const isHomeView = view.type === "home";

  return (
    <div className={cx("mb-3 flex h-[calc(100%-0.75rem)] min-h-0 w-full max-w-full flex-col overflow-hidden bg-slate-50 text-sm text-slate-950 md:mb-4 md:h-[calc(100%-1rem)]", className)}>
      <Toaster richColors position="top-right" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-clip overscroll-contain px-2 pb-2 pt-2 md:px-6 md:pb-8 md:pt-4">
        <div
          className={cx(
            "mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4",
            isHomeView ? "min-h-full" : "h-full min-h-0 flex-1"
          )}
        >
          {view.type === "home" ? (
            <section className="shrink-0 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm md:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0F87F9]">ELBRIT HELP CENTER</p>
                  <h1 className="mt-1.5 text-lg font-bold text-[#18265c] md:text-xl">Help & Support</h1>
                  <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-slate-500">
                    Browse ERP articles, raise tickets, and track support conversations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView({ type: "create" })}
                  className="hidden h-9 items-center justify-center gap-2 rounded-lg bg-[#0F87F9] px-3 text-[13px] font-bold text-white shadow-sm transition hover:bg-blue-600 md:inline-flex"
                >
                  <i className="pi pi-plus" aria-hidden />
                  Create ticket
                </button>
              </div>
              <label className="mt-3 flex h-10 max-w-2xl items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-[#0F87F9] focus-within:ring-2 focus-within:ring-blue-100">
                <i className="pi pi-search text-slate-400" aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={uiContent.header.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
                />
              </label>
            </section>
          ) : null}

          <div className={cx("flex flex-col", isHomeView ? "shrink-0" : "min-h-0 flex-1")}>{mainView}</div>
        </div>
      </div>

      {view.type === "home" || view.type === "tickets" || view.type === "create" ? (
        <div className="shrink-0 px-0 pb-0 md:hidden">
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
  );
}
